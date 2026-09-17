"""Two independent neural evaluators, one durable account/order coordinator."""
import json,time
from datetime import datetime,timedelta
from .market import MarketEngine, POLICY
from .engine import TERMINAL
from .domain import UTC,NY,completed_bars,decode,digest,encode,instant,now_iso

PARALLEL_POLICY='Stable market tour; independent fly states; one paper-account coordinator; 5Min inputs'

class ParallelMarketEngine(MarketEngine):
    def __init__(self,settings,**kwargs):
        super().__init__(settings,**kwargs)
        self.pending={};self.intents=[];self.epoch=0
        self.completed_by_fly={};self.active_seconds=0.;self.active_since=None

    def resume(self):
        result=super().resume()
        if result:
            self.epoch+=1;self.active_since=time.monotonic()
            self.message=f'{self.brain.count} independent flies ready; waiting for fresh completed inputs'
        return result

    def pause(self,reason='Paused by user'):
        self.epoch+=1
        if self.active_since is not None:
            self.active_seconds+=time.monotonic()-self.active_since;self.active_since=None
        super().pause(reason)
        self._discard_intents(reason)

    def _discard_intents(self,reason):
        for d in self.intents:self.ledger.event('execution_blocked',{'decision_id':d['id'],'symbol':d['symbol'],'reason':reason})
        self.intents=[]

    def _inflight(self):
        self.ledger.set('brain_inflight',{fly:{'symbol':p['decision']['symbol'],'bar':p['decision']['bar']['t']} for fly,p in self.pending.items()} or None)

    def collect(self):
        if self.fatal:return
        for fly,p in list(self.pending.items()):
            future=p['future']
            if future is None or not future.done():continue
            try:
                neural=future.result();d=p['decision'];d['neural']=neural
                from .learning_policy import decide
                decide(self,d)
                d['created_at']=now_iso()
                self.ledger.decision(d)
                self.ledger.observe(d['symbol'],d['action'],d['reason'])
                self.completed_by_fly[fly]=self.completed_by_fly.get(fly,0)+1
                self.session_evaluated+=1
                # A pause or resume invalidates work dispatched under the previous session.
                if d['action']!='HOLD':
                    if not self.paused and p['epoch']==self.epoch:self.intents.append(d)
                    else:self.ledger.event('execution_blocked',{'decision_id':d['id'],'symbol':d['symbol'],'reason':'Calculation completed after pause or session changed'})
                del self.pending[fly];self._inflight()
                self.message=f"{fly} · {d['symbol']} · {d['action']}: {d['reason']}"
            except Exception:
                self.fatal=True;self.pause('Neural worker interrupted; checkpoint recovery required');raise

    def _execute(self):
        if not self.intents or self.paused:return
        self.refresh();self.last_refresh=time.monotonic()
        if self.blockers() or not self.market.get('is_open'):
            self._discard_intents('Account changed or market closed');return
        if any(o['status'] not in TERMINAL for o in self.ledger.orders()):return
        d=self.intents.pop(0)
        close=instant(d['bar']['t'])+timedelta(minutes=5)
        latest=datetime.fromtimestamp(int((datetime.now(UTC)-timedelta(seconds=10)).timestamp())//300*300,UTC)
        if latest!=close or close<=self.started:
            self.ledger.event('execution_blocked',{'decision_id':d['id'],'symbol':d['symbol'],'reason':'Decision expired before execution'});return
        if not self.before_submit():
            self.ledger.event('execution_blocked',{'decision_id':d['id'],'symbol':d['symbol'],'reason':'Desktop control did not authorize submission'});return
        latest=datetime.fromtimestamp(int((datetime.now(UTC)-timedelta(seconds=10)).timestamp())//300*300,UTC)
        if self.paused or close<=self.started or latest!=close:
            self.ledger.event('execution_blocked',{'decision_id':d['id'],'symbol':d['symbol'],'reason':'Session or input boundary changed during control check'});return
        position=next((p for p in self.positions if p['symbol']==d['symbol']),{})
        self.submit_intent(d,position,self.broker.asset(d['symbol']))

    def _dispatch(self,fly,now):
        end=now-timedelta(seconds=10)
        boundary=datetime.fromtimestamp(int(end.timestamp())//300*300,UTC)
        start=now-timedelta(days=7)
        if self.calendar_cache is None or self.calendar_cache[0]!=now.date():
            self.calendar_cache=(now.date(),self.broker.calendar(start.astimezone(NY).date().isoformat(),now.astimezone(NY).date().isoformat()))
        calendar=self.calendar_cache[1]
        session=next((d for d in calendar if d['date']==now.astimezone(NY).date().isoformat()),None)
        if not session:self.pause('Market clock and calendar disagree');return
        opened=datetime.fromisoformat(session['date']+'T'+session['open']).replace(tzinfo=NY)
        if boundary<opened+timedelta(minutes=5) or boundary<=self.started:
            self.message='Waiting for the next completed market bar';return
        if self.cache_boundary!=boundary:self.cache={};self.cache_boundary=boundary;self.probed=set()
        # Skip missing-data symbols in a bounded burst instead of sleeping per gap.
        for _ in range(min(16,len(self.watchlist))):
            cursor=self.ledger.get('market_cursor') or 0
            self.symbol=self.watchlist[cursor%len(self.watchlist)]
            if self.symbol in self.probed:return
            if self.symbol not in self.cache:
                batch=[self.watchlist[(cursor+i)%len(self.watchlist)] for i in range(min(16,len(self.watchlist)))]
                self.cache={s:[] for s in batch};self.cache.update(self.broker.bars_many(batch,start.isoformat(),end.isoformat()))
            self.probed.add(self.symbol)
            bars=completed_bars(self.cache[self.symbol],calendar,end)
            if len(bars)<21:self.advance('data_gap','Fewer than 21 usable completed IEX bars');continue
            bar=bars[-1];close=instant(bar['t'])+timedelta(minutes=5)
            if close!=boundary:self.advance('data_gap','No current completed IEX bar');continue
            if self.ledger.has_bar(bar['t'],self.symbol):self.advance('already_seen','Current symbol/bar already evaluated');continue
            position=next((p for p in self.positions if p['symbol']==self.symbol),{})
            from .corporate_actions import input_affected
            if input_affected(self,self.symbol,bars[-21]['t'],bar['t']):
                self.advance('corporate_action','Input window crosses a corporate action; skipped')
                continue
            rates=encode(bar,bars[:-1],self.account,position)
            self.last_bar=bar
            d={'id':digest(self.brain.manifest_hash+self.symbol+bar['t']), 'symbol':self.symbol,'fly_id':fly,
               'context_id':digest(PARALLEL_POLICY+str(self.brain.count)+fly+self.universe_id+self.brain.manifest_hash+self.settings.max_order+self.settings.max_exposure),
               'universe_id':self.universe_id,'selection_policy':PARALLEL_POLICY,'bar':bar,'feed':'iex','adjustment':'raw',
               'stimulus_hz':rates,'account':self.account.copy(),'position':position.copy()}
            self.pending[fly]={'decision':d,'epoch':self.epoch,'future':None}
            self._inflight() # Crash marker precedes any worker mutation.
            self.advance('evaluating',fly)
            try:self.pending[fly]['future']=self.brain.submit(fly,rates)
            except Exception:
                self.fatal=True;self.pause('Neural dispatch failed; checkpoint recovery required');raise
            return

    def tick(self,now=None):
        now=now or datetime.now(UTC)
        if not self.assets or self.universe_at[:10]!=now.date().isoformat():self.discover()
        self.collect()
        if time.monotonic()-self.last_refresh>15 or not self.connected:
            self.refresh();self.last_refresh=time.monotonic()
        if self.paused:return
        reasons=self.blockers()
        if reasons:self.pause('; '.join(reasons));return
        if not self.market.get('is_open'):
            self._discard_intents('Market closed');self.message='Market closed; neural time is frozen';return
        self._execute()
        if self.paused or self.intents or any(o['status'] not in TERMINAL for o in self.ledger.orders()):return
        for fly in self.brain.executors:
            if self.paused:break
            if fly not in self.pending:self._dispatch(fly,now)

    def snapshot(self):
        s=super().snapshot();s['selection_policy']=PARALLEL_POLICY
        seconds=self.active_seconds+(time.monotonic()-self.active_since if self.active_since is not None else 0)
        s['flies']={'count':self.brain.count if self.brain else 0,'mode':'independent','inflight':[{'fly_id':fly,'symbol':p['decision']['symbol']} for fly,p in self.pending.items()],
                    'completed':self.completed_by_fly,'evaluations_per_minute':round(self.session_evaluated/seconds*60,2) if seconds else 0,
                    'active_seconds':round(seconds,1),'queued_intents':len(self.intents),
                    'scope':'Independent copies with separate checkpoints. One shared paper account, order cap and portfolio exposure limit.'}
        return s
