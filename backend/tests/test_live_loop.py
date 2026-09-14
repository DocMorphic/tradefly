"""Exercise the production tick loop, with isolated state and no external requests."""
from datetime import datetime,timedelta
from pathlib import Path
import pytest
from tradefly.config import Settings
from tradefly.domain import UTC,instant
from tradefly.engine import Engine
from test_backend import FakeBroker,ASSET,ACCOUNT

class TestBrain:
    __test__=False
    ready=True
    manifest_hash='test-neural-output-only'
    steps=0
    def __init__(self,actions):self.actions=iter(actions)
    def stimulate(self,rates):
        self.steps+=1
        buy,sell=next(self.actions)
        return {'buy_hz':buy,'sell_hz':sell,'state_id':f'test:{self.steps}'}
    def checkpoint(self,path):Path(path).write_text(str(self.steps))

class Market(FakeBroker):
    def __init__(self):
        super().__init__();self.bar_calls=0
        self.session=[{'date':'2026-09-11','open':'09:30','close':'16:00'}, {'date':'2026-09-14','open':'09:30','close':'16:00'}]
        self.history=[self.bar(datetime(2026,9,11,17,tzinfo=UTC)+timedelta(minutes=5*i)) for i in range(30)]
    @staticmethod
    def bar(t):return {'t':t.isoformat(),'o':200,'h':201,'l':199,'c':200,'v':1000}
    def calendar(self,*_):return self.session
    def bars(self,*_):self.bar_calls+=1;return self.history
    def asset(self,*_):return ASSET
    def fill(self):
        from decimal import Decimal
        for cid,order in self.found.items():
            if order['status']=='filled':continue
            shares=Decimal(order['notional'])/200 if order['side']=='buy' else Decimal(order['qty'])
            order.update(status='filled',filled_qty=str(shares),filled_avg_price='200')
            q=(Decimal(self.holdings[0]['qty']) if self.holdings else Decimal(0))+(shares if order['side']=='buy' else -shares)
            self.holdings=[{'symbol':'AAPL','qty':str(q),'market_value':str(q*200)}] if q else []

@pytest.fixture
def setup(tmp_path,monkeypatch):
    class Clock(datetime):
        current=datetime(2026,9,14,13,30,tzinfo=UTC)
        @classmethod
        def now(cls,tz=None):return cls.current
    monkeypatch.setattr('tradefly.engine.datetime',Clock)
    market=Market()
    brain=TestBrain([(40,0),(0,40),(0,0),(40,0)])
    engine=Engine(Settings(database=tmp_path/'loop.sqlite'),broker=market,brain=brain)
    engine.before_submit=lambda:True
    assert engine.resume()
    def tick(hour,minute,second=15):
        Clock.current=datetime(2026,9,14,hour,minute,second,tzinfo=UTC)
        engine.tick(Clock.current)
    return engine,market,brain,tick,Clock

def test_opening_wait_then_buy_sell_hold_round_trip(setup):
    engine,market,brain,tick,_=setup
    tick(13,30);tick(13,34,59)
    assert not engine.paused and brain.steps==0 and market.bar_calls==0
    market.history.append(market.bar(datetime(2026,9,14,13,30,tzinfo=UTC)))
    tick(13,35)
    assert len(market.submissions)==1 and market.submissions[0]['side']=='buy'
    assert len(engine.ledger.decisions())==1
    market.fill()
    for minute in (36,37,38,39):tick(13,minute)
    assert not engine.paused and brain.steps==1 and len(market.submissions)==1
    market.history.append(market.bar(datetime(2026,9,14,13,35,tzinfo=UTC)))
    tick(13,40);market.fill()
    assert len(market.submissions)==2 and market.submissions[-1]['side']=='sell'
    market.history.append(market.bar(datetime(2026,9,14,13,40,tzinfo=UTC)))
    tick(13,45)
    assert not engine.paused and not market.holdings and brain.steps==3
    assert [d['action'] for d in engine.ledger.decisions()]==['BUY','SELL','HOLD']
    assert len(market.submissions)==2

def test_missing_bar_waits_for_grace_then_pauses(setup):
    engine,market,brain,tick,_=setup
    tick(13,35,15)
    assert not engine.paused and brain.steps==0
    tick(13,36,31)
    assert engine.paused and 'missing' in engine.message and not market.submissions

def test_repeated_bar_does_not_hide_a_later_missing_bar(setup):
    engine,market,brain,tick,_=setup
    market.history.append(market.bar(datetime(2026,9,14,13,30,tzinfo=UTC)))
    tick(13,35);market.fill()
    tick(13,39)
    assert not engine.paused
    tick(13,41,31)
    assert engine.paused and brain.steps==1 and len(market.submissions)==1

def test_control_pause_between_neural_step_and_submission(setup):
    engine,market,brain,tick,_=setup
    market.history.append(market.bar(datetime(2026,9,14,13,30,tzinfo=UTC)))
    def pause():engine.pause('Control requested pause');return False
    engine.before_submit=pause
    tick(13,35)
    assert engine.paused and len(engine.ledger.decisions())==1 and not market.submissions

def test_neural_failure_records_recovery_and_never_trades(setup):
    engine,market,brain,tick,_=setup
    market.history.append(market.bar(datetime(2026,9,14,13,30,tzinfo=UTC)))
    def fail(_):raise TimeoutError('simulation interrupted')
    brain.stimulate=fail
    with pytest.raises(TimeoutError):tick(13,35)
    assert engine.paused and engine.fatal and engine.ledger.get('brain_inflight')
    assert not market.submissions

def test_resume_skips_backlog_and_accepts_following_new_bar(setup):
    engine,market,brain,tick,clock=setup
    market.history += [market.bar(datetime(2026,9,14,13,30,tzinfo=UTC)+timedelta(minutes=5*i)) for i in range(5)]
    clock.current=datetime(2026,9,14,13,52,tzinfo=UTC)
    assert engine.resume()
    tick(13,52,15)
    assert brain.steps==0 and not engine.paused
    tick(13,55,15)
    assert brain.steps==1 and len(market.submissions)==1

def test_delayed_new_bar_expires_but_does_not_trade_backlog(setup):
    engine,market,brain,tick,_=setup
    market.history.append(market.bar(datetime(2026,9,14,13,30,tzinfo=UTC)))
    tick(13,37)
    assert engine.paused and brain.steps==0 and not market.submissions

def test_market_close_freezes_neural_time(setup):
    engine,market,brain,tick,_=setup
    market.clock=lambda:{'is_open':False}
    tick(20,1)
    assert brain.steps==0 and not engine.paused and not market.submissions
