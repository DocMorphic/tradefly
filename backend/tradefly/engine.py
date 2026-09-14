"""Single-writer runner with durable intent IDs and reconciliation before submissions."""
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from .alpaca import Alpaca, BrokerError
from .config import Settings
from .domain import UTC, NY, completed_bars, decode, digest, encode, instant, now_iso, number, size_order
from .storage import Ledger

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
        if any(p['symbol']!=self.settings.symbol or number(p['qty'])<0 for p in self.positions):
            result.append('Use a dedicated long-only AAPL paper account')
        # Compare broker holdings to cumulative actual fills, including partial fills.
        expected=sum((number(json.loads(r['broker']).get('filled_qty') or 0) * (1 if json.loads(r['broker']).get('side')=='buy' else -1)
                      for r in self.ledger.orders() if r['broker']),number(0))
        actual=sum((number(p['qty']) for p in self.positions if p['symbol']==self.settings.symbol),number(0))
        if abs(expected-actual)>number('0.000001'): result.append('Broker holdings disagree with Tradefly fills')
        if any(r['status']=='uncertain' for r in self.ledger.orders()): result.append('Unresolved submission outcome')
        return result

    def resume(self):
        self.refresh()
        reasons=self.blockers()
        if reasons:
            self.paused=True;self.message='; '.join(reasons)
            self.ledger.event('resume_blocked',{'reasons':reasons});return False
        self.paused=False;self.message='Waiting for the next completed regular-session bar'
        self.started=datetime.now(UTC) # Never trade bars completed before resume.
        self.ledger.event('resume',{'at':self.started.isoformat()});return True

    def submit_intent(self, decision, position, asset):
        action=decision['action']
        if self.paused: return None
        if any(r['status'] not in TERMINAL for r in self.ledger.orders()):
            self.ledger.event('execution_blocked',{'decision_id':decision['id'],'reason':'An order is still unresolved'});return None
        sizing,reason=size_order(action,self.account,position,asset,decision['bar']['c'],self.settings.max_order,self.settings.max_exposure)
        if sizing is None:
            self.ledger.event('execution_blocked',{'decision_id':decision['id'],'reason':reason});return None
        client_id='tf-'+digest(decision['id'])[:40]
        payload={**sizing,'symbol':self.settings.symbol,'type':'market','time_in_force':'day',
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
        bars=completed_bars(self.broker.bars(self.settings.symbol,start.isoformat(),end.isoformat()),calendar,end)
        if len(bars)<21: self.pause('Insufficient completed IEX bars');return
        bar=bars[-1];close=instant(bar['t'])+timedelta(minutes=5)
        self.last_bar=bar
        if (now-close).total_seconds()>90: self.pause('Latest completed bar is stale');return
        if close<=self.started: return
        if self.ledger.has_bar(bar['t']):
            recorded=next(d for d in self.ledger.decisions() if d['bar']['t']==bar['t'])
            if recorded['bar']!=bar: self.pause('A processed market bar was corrected')
            return
        previous_time=self.ledger.get('last_processed_bar')
        if previous_time and instant(previous_time)+timedelta(minutes=5)>self.started and instant(bar['t']).astimezone(NY).date()==instant(previous_time).astimezone(NY).date() and instant(bar['t'])-instant(previous_time)>timedelta(minutes=5):
            self.pause('Missed bars; resume explicitly to skip the backlog');return
        position=next((p for p in self.positions if p['symbol']==self.settings.symbol),{})
        rates=encode(bar,bars[:-1],self.account,position)
        self.ledger.set('brain_inflight',bar['t'])
        try:
            neural=self.brain.stimulate(rates)
            action,reason=decode(neural['buy_hz'],neural['sell_hz'])
            decision={'id':digest(self.brain.manifest_hash+bar['t']), 'created_at':now_iso(),'bar':bar,
                      'feed':'iex','adjustment':'raw','stimulus_hz':rates,'neural':neural,'action':action,
                      'reason':reason,'account':self.account.copy(),'position':position.copy()}
            checkpoint=self.settings.database.parent/'brain.checkpoint'
            temporary=checkpoint.with_suffix('.tmp')
            self.brain.checkpoint(temporary)
            os.replace(temporary,checkpoint)
            self.ledger.decision(decision)
            self.ledger.set('last_processed_bar',bar['t'])
            self.ledger.set('brain_steps',self.brain.steps)
            self.ledger.set('brain_inflight',None)
        except Exception:
            self.fatal=True;self.pause('Neural step interrupted; checkpoint recovery required');raise
        self.message=f'{action}: {reason}'
        # Recheck clock, account, orders and freshness after potentially expensive simulation.
        self.refresh()
        if self.blockers() or not self.market.get('is_open') or (datetime.now(UTC)-close).total_seconds()>150:
            self.pause('Execution state changed or decision expired');return
        position=next((p for p in self.positions if p['symbol']==self.settings.symbol),{})
        if not self.before_submit(): return
        self.submit_intent(decision,position,self.broker.asset(self.settings.symbol))

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
        decisions=self.ledger.decisions()
        samples=self.ledger.equity_samples()
        peak=0.;drawdown=0.
        for sample in samples:
            equity=float(sample['equity']);peak=max(peak,equity)
            if peak>0:drawdown=max(drawdown,(peak-equity)/peak)
        orders=[{**r,'payload':json.loads(r['payload']),'broker':json.loads(r['broker']) if r['broker'] else None} for r in self.ledger.orders()]
        replay_path=self.settings.database.parent/'replays/latest.json'
        pilot=json.loads(replay_path.read_text()) if replay_path.exists() else None
        return {'pilot_replay':pilot,'schema':1,'mode':'alpaca-paper','last_command_id':self.last_command_id,'updated_at':now_iso(),'paused':self.paused,'message':self.message,
            'broker':{'connected':self.connected,'endpoint':'paper-api.alpaca.markets','credentials_configured':self.settings.credentials_present},
            'brain':{'ready':bool(self.brain and self.brain.ready),'loaded':self.brain is not None,
                     'manifest':manifest,'validation':validation},
            'account':self.account,'positions':self.positions,
            'market':{k:self.market.get(k) for k in ('is_open','timestamp','next_open','next_close')},
            'symbol':self.settings.symbol,'feed':'iex','latest_bar':self.last_bar,
            'limits':{'max_order_usd':100,'max_exposure_pct':10,'long_only':True},
            'baseline':baseline,'equity_change_usd':delta,
            'max_observed_drawdown_pct':drawdown*100,'equity_sample_count':len(samples),
            'equity_history':samples[-500:],'blockers':self.blockers(),
            'decisions':decisions[-100:],'decision_count':len(decisions),'orders':orders[-100:],
            'events':self.ledger.events(50),'export_note':'Latest 100 decisions/orders on desktop; complete history in local SQLite and local report export.'}
