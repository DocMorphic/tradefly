"""Single-writer runner with durable intent IDs and reconciliation before submissions."""
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from .alpaca import Alpaca, BrokerError
from .config import Settings,validate_watchlist
from .domain import UTC, NY, completed_bars, decode, digest, encode, instant, now_iso, number, size_order
from .storage import Ledger
from .reconciliation import checks as position_checks, KEY as QUARANTINES

TERMINAL = {'filled','canceled','expired','rejected'}
def public_order(order):
    keys=('id','client_order_id','symbol','side','type','time_in_force','status','qty','notional',
          'filled_qty','filled_avg_price','submitted_at','filled_at','canceled_at','updated_at')
    return {k:order.get(k) for k in keys}

class Engine:
    def __init__(self, settings:Settings, broker=None, ledger=None, brain=None):
        self.settings=settings
        self.broker=broker or Alpaca(settings)
        self.ledger=ledger or Ledger(settings.database)
        self.brain=brain
        self.watchlist=validate_watchlist(self.ledger.get('watchlist') or settings.watchlist or (settings.symbol,))
        self.symbol=self.watchlist[(self.ledger.get('watchlist_cursor') or 0)%len(self.watchlist)]
        self.started=datetime.now(UTC)
        self.paused=True
        self.last_command_id=None
        self.message='Paused on startup'
        self.connected=False
        self.account={};self.positions=[];self.market={};self.open_orders=[]
        self.last_bar=None
        self.before_submit=lambda: False
        self.fatal=bool(self.ledger.get('brain_inflight'))
        self.ledger.event('startup',{'paused':True,'recovery_required':self.fatal})

    def pause(self, reason='Paused by user'):
        self.paused=True; self.message=reason
        self.ledger.event('pause',{'reason':reason})
        # Cancel only this experiment's orders; never cancel unrelated user orders.
        for row in self.ledger.orders():
            if row['status'] not in TERMINAL and row.get('broker'):
                order=json.loads(row['broker'])
                try: self.broker.cancel(order['id'])
                except BrokerError: self.ledger.event('cancel_pending',{'client_id':row['client_id']})

    def reconcile(self):
        for row in self.ledger.orders():
            if row['status'] in TERMINAL: continue
            found=self.broker.order(row['client_id'])
            if found:
                safe=public_order(found)
                if row['status']!=found['status'] or row['broker']!=json.dumps(safe):
                    self.ledger.update_order(row['client_id'],found['status'],safe)
                    self.ledger.event('order_update',safe)
            else:
                # A missing result after a crash/timeout is not permission to POST again.
                self.ledger.update_order(row['client_id'],'uncertain')
                self.paused=True; self.message='Order outcome uncertain; reconciliation required'

    def refresh(self):
        raw=self.broker.account()
        self.account={k:raw.get(k) for k in ('status','currency','cash','equity','last_equity','portfolio_value',
                 'buying_power','trading_blocked','account_blocked','pattern_day_trader')}
        identity=digest(str(raw['id']))
        bound=self.ledger.get('account_hash')
        if bound and bound!=identity:
            self.fatal=True; raise ValueError('Paper account changed; a separate ledger is required')
        if not bound:
            self.ledger.set('account_hash',identity)
            self.ledger.set('baseline',{'equity':raw['equity'],'at':now_iso()})
        self.positions=[{k:p.get(k) for k in ('symbol','qty','side','market_value','cost_basis','avg_entry_price',
                            'current_price','unrealized_pl','unrealized_plpc')} for p in self.broker.positions()]
        self.open_orders=self.broker.open_orders()
        self.market=self.broker.clock()
        self.reconcile()
        self.connected=True
        self.ledger.equity_sample(self.account['equity'],self.account['cash'])

    def blockers(self):
        result=[]
        if self.fatal: result.append('Interrupted neural checkpoint or account change requires recovery')
        if not self.connected: result.append('Paper account disconnected')
        if not self.brain or not self.brain.ready: result.append('Full-brain validation is not complete')
        if self.account.get('currency')!='USD': result.append('A USD paper account is required')
        if self.account.get('trading_blocked') or self.account.get('account_blocked') or self.account.get('status')!='ACTIVE':
            result.append('Account is not available for trading')
        own={r['client_id'] for r in self.ledger.orders()}
        if any(o['client_order_id'] not in own for o in self.open_orders): result.append('Unrelated open orders in paper account')
        if any(p['symbol'] not in self.watchlist or number(p['qty'])<0 for p in self.positions):
            result.append('Untracked or short positions in paper account')
        if any(check['blocking'] for check in position_checks(self)):
            result.append('Broker holdings disagree with Tradefly fills')
        if any(r['status']=='uncertain' for r in self.ledger.orders()): result.append('Unresolved submission outcome')
        return result

    def resume(self):
        self.refresh()
        reasons=self.blockers()
        if reasons:
            self.paused=True;self.message='; '.join(reasons)
            self.ledger.event('resume_blocked',{'reasons':reasons});return False
        for symbol in self.watchlist:
            asset=self.broker.asset(symbol)
            if not asset.get('tradable') or not asset.get('fractionable') or asset.get('status')!='active':
                self.paused=True;self.message=f'{symbol} is not available for fractional paper trading';return False
        self.paused=False;self.message='Waiting for the next completed regular-session bar'
        self.started=datetime.now(UTC) # Never trade bars completed before resume.
        self.ledger.event('resume',{'at':self.started.isoformat()});return True

    def set_watchlist(self, symbols):
        if not self.paused: raise ValueError('Pause before changing the watchlist')
        symbols=validate_watchlist(symbols)
        self.refresh()
        if any(r['status'] not in TERMINAL for r in self.ledger.orders()):
            raise ValueError('Resolve Tradefly orders before changing the watchlist')
        if any(p['symbol'] not in symbols for p in self.positions):
            raise ValueError('Keep all currently held stocks in the watchlist')
        for symbol in symbols:
            asset=self.broker.asset(symbol)
            if not asset.get('tradable') or not asset.get('fractionable') or asset.get('status')!='active':
                raise ValueError(f'{symbol} is not available for fractional paper trading')
        self.watchlist=symbols
        self.ledger.set('watchlist',list(symbols));self.ledger.set('watchlist_cursor',0)
        self.symbol=symbols[0]
        self.ledger.event('watchlist_updated',{'symbols':list(symbols),'policy':'fixed round robin; shared neural state retained'})
        self.message='Watchlist updated; shared brain state retained; execution remains paused'

    def size_intent(self, *args): return size_order(*args)

    def submit_intent(self, decision, position, asset):
        action=decision['action']
        if self.paused: return None
        symbol=decision.get('symbol',self.symbol)
        if symbol in (self.ledger.get(QUARANTINES) or {}):
            self.ledger.event('execution_blocked',{'decision_id':decision['id'],'symbol':symbol,'reason':'Position quarantined after broker discrepancy'});return None
        if any(r['status'] not in TERMINAL for r in self.ledger.orders()):
            self.ledger.event('execution_blocked',{'decision_id':decision['id'],'reason':'An order is still unresolved'});return None
        budget=number(self.settings.max_order)
        if action=='BUY':
            portfolio_value=sum((max(number(p.get('market_value',0)),number(0)) for p in self.positions),number(0))
            budget=min(budget,max(number(0),number(self.account['equity'])*number(self.settings.max_exposure)-portfolio_value))
        sizing,reason=self.size_intent(action,self.account,position,asset,decision['bar']['c'],str(budget),self.settings.max_exposure)
        if action=='BUY' and budget<1: reason='10% total portfolio exposure limit'
        if sizing is None:
            self.ledger.event('execution_blocked',{'decision_id':decision['id'],'reason':reason});return None
        client_id='tf-'+digest(decision['id'])[:40]
        payload={**sizing,'symbol':decision.get('symbol',self.symbol),'type':'market','time_in_force':'day',
                 'extended_hours':False,'client_order_id':client_id}
        # SQLite FULL commit happens before any network request. Never blind-retry POST.
        self.ledger.prepare_order(client_id,decision['id'],payload)
        try:
            order=self.broker.submit(payload)
            self.ledger.update_order(client_id,order['status'],public_order(order))
            self.ledger.event('order_submitted',public_order(order))
            return order
        except BrokerError as e:
            if e.status in (400,401,403,422):
                self.ledger.update_order(client_id,'rejected')
                self.pause('Paper order rejected')
            else:
                self.ledger.update_order(client_id,'uncertain')
                self.pause('Submission outcome uncertain; checking before any further order')
            return None

    def tick(self, now=None):
        now=now or datetime.now(UTC)
        self.refresh()
        if self.paused: return
        reasons=self.blockers()
        if reasons: self.pause('; '.join(reasons));return
        if not self.market.get('is_open'):
            self.message='Market closed; neural time is frozen';return
        end=now-timedelta(seconds=10) # Give completed bars time to arrive.
        start=now-timedelta(days=7)
        calendar=self.broker.calendar(start.astimezone(NY).date().isoformat(),now.astimezone(NY).date().isoformat())
        # A bar can normally be several minutes old between boundaries. Only
        # declare the feed stale when a newly expected completed bar is missing.
        expected_close=datetime.fromtimestamp(int(end.timestamp())//300*300,UTC)
        session=next((day for day in calendar if day['date']==now.astimezone(NY).date().isoformat()),None)
        if not session:
            self.pause('Market clock and exchange calendar disagree');return
        session_open=datetime.fromisoformat(session['date']+'T'+session['open']).replace(tzinfo=NY)
        if expected_close<session_open+timedelta(minutes=5):
            self.message='Waiting for the first completed regular-session bar';return
        recorded=self.ledger.decisions()
        if recorded and instant(recorded[-1]['bar']['t'])+timedelta(minutes=5)==expected_close:
            return
        self.symbol=self.watchlist[(self.ledger.get('watchlist_cursor') or 0)%len(self.watchlist)]
        bars=completed_bars(self.broker.bars(self.symbol,start.isoformat(),end.isoformat()),calendar,end)
        if len(bars)<21: self.pause('Insufficient completed IEX bars');return
        prior=next((d for d in reversed(recorded) if d.get('symbol',self.settings.symbol)==self.symbol),None)
        if prior:
            revision=next((b for b in bars if instant(b['t'])==instant(prior['bar']['t'])),None)
            if revision and revision!=prior['bar']:
                self.pause('A previously processed bar was corrected');return
        bar=bars[-1];close=instant(bar['t'])+timedelta(minutes=5)
        self.last_bar=bar
        if close<expected_close:
            if (now-expected_close).total_seconds()>90:
                self.pause('Expected completed bar is missing; market feed is stale')
            else:
                self.message='Waiting for the latest completed IEX bar to arrive'
            return
        if close<=self.started: return
        if self.ledger.has_bar(bar['t']):
            recorded=next(d for d in self.ledger.decisions() if d['bar']['t']==bar['t'])
            if recorded['bar']!=bar: self.pause('A processed market bar was corrected')
            return
        if (now-close).total_seconds()>90:
            self.pause('New decision bar arrived too late');return
        previous_time=self.ledger.get('last_processed_bar')
        if previous_time and instant(previous_time)+timedelta(minutes=5)>self.started and instant(bar['t']).astimezone(NY).date()==instant(previous_time).astimezone(NY).date() and instant(bar['t'])-instant(previous_time)>timedelta(minutes=5):
            self.pause('Missed bars; resume explicitly to skip the backlog');return
        position=next((p for p in self.positions if p['symbol']==self.symbol),{})
        rates=encode(bar,bars[:-1],self.account,position)
        self.ledger.set('brain_inflight',bar['t'])
        try:
            neural=self.brain.stimulate(rates)
            action,reason=decode(neural['buy_hz'],neural['sell_hz'])
            decision={'id':digest(self.brain.manifest_hash+self.symbol+bar['t']), 'symbol':self.symbol,
                      'context_id':digest(self.brain.manifest_hash+json.dumps(list(self.watchlist))+self.settings.max_order+self.settings.max_exposure),
                      'watchlist':list(self.watchlist),'selection_policy':'fixed round robin', 'created_at':now_iso(),'bar':bar,
                      'feed':'iex','adjustment':'raw','stimulus_hz':rates,'neural':neural,'action':action,
                      'reason':reason,'account':self.account.copy(),'position':position.copy()}
            checkpoint=self.settings.database.parent/'brain.checkpoint'
            temporary=checkpoint.with_suffix('.tmp')
            self.brain.checkpoint(temporary)
            os.replace(temporary,checkpoint)
            self.ledger.decision(decision)
            self.ledger.set('last_processed_bar',bar['t'])
            self.ledger.set('brain_steps',self.brain.steps)
            self.ledger.set('watchlist_cursor',(self.ledger.get('watchlist_cursor') or 0)+1)
            self.ledger.set('brain_inflight',None)
        except Exception:
            self.fatal=True;self.pause('Neural step interrupted; checkpoint recovery required');raise
        self.message=f'{action}: {reason}'
        # Recheck clock, account, orders and freshness after potentially expensive simulation.
        self.refresh()
        if self.blockers() or not self.market.get('is_open') or (datetime.now(UTC)-close).total_seconds()>150:
            self.pause('Execution state changed or decision expired');return
        position=next((p for p in self.positions if p['symbol']==self.symbol),{})
        if not self.before_submit(): return
        self.submit_intent(decision,position,self.broker.asset(self.symbol))

    def snapshot(self):
        baseline=self.ledger.get('baseline')
        delta=None
        if baseline and self.account:
            delta=float(number(self.account['equity'])-number(baseline['equity']))
        manifest=self.brain.manifest if self.brain else None
        manifest_path=self.settings.brain_dir/'manifest.json'
        if manifest is None and manifest_path.exists(): manifest=json.loads(manifest_path.read_text())
        validation_path=self.settings.brain_dir/'validation.json'
        validation=json.loads(validation_path.read_text()) if validation_path.exists() else None
        decisions=self.ledger.decisions(100)
        samples=self.ledger.equity_samples()
        peak=0.;drawdown=0.
        for sample in samples:
            equity=float(sample['equity']);peak=max(peak,equity)
            if peak>0:drawdown=max(drawdown,(peak-equity)/peak)
        orders=[{**r,'payload':json.loads(r['payload']),'broker':json.loads(r['broker']) if r['broker'] else None} for r in self.ledger.orders()]
        replay_path=self.settings.database.parent/'replays/latest.json'
        pilot=json.loads(replay_path.read_text()) if replay_path.exists() else None
        check_path=self.settings.database.parent/'watchlist-check.json'
        check=json.loads(check_path.read_text()) if check_path.exists() else None
        return {'position_checks':position_checks(self),'watchlist_check':check,'pilot_replay':pilot,'schema':1,'mode':'alpaca-paper','last_command_id':self.last_command_id,'updated_at':now_iso(),'paused':self.paused,'message':self.message,
            'broker':{'connected':self.connected,'endpoint':'paper-api.alpaca.markets','credentials_configured':self.settings.credentials_present},
            'brain':{'ready':bool(self.brain and self.brain.ready),'loaded':self.brain is not None,
                     'manifest':manifest,'validation':validation},
            'account':self.account,'positions':self.positions,
            'market':{k:self.market.get(k) for k in ('is_open','timestamp','next_open','next_close')},
            'symbol':self.symbol,'watchlist':list(self.watchlist),
            'next_symbol':self.watchlist[(self.ledger.get('watchlist_cursor') or 0)%len(self.watchlist)] if self.watchlist else None,
            'selection_policy':'One shared brain; fixed round robin; one stock per five-minute bar',
            'feed':'iex','latest_bar':self.last_bar,
            'limits':{'max_order_usd':100,'max_exposure_pct':10,'long_only':True},
            'baseline':baseline,'equity_change_usd':delta,
            'max_observed_drawdown_pct':drawdown*100,'equity_sample_count':len(samples),
            'equity_history':samples[-500:],'blockers':self.blockers(),
            'decisions':decisions[-100:],'decision_count':self.ledger.decision_count(),'orders':orders[-100:],
            'events':self.ledger.events(50),'export_note':'Latest 100 decisions/orders on desktop; complete history in local SQLite and local report export.'}
