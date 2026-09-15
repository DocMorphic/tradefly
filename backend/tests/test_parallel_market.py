from concurrent.futures import Future
from datetime import datetime,timedelta
import pytest
from tradefly.config import Settings
from tradefly.domain import UTC
from tradefly.parallel_market import ParallelMarketEngine
from test_market import Exchange

class Pool:
    count=2;ready=True;manifest_hash='test-model';manifest={}
    def __init__(self):self.executors={'fly-1':None,'fly-2':None};self.jobs=[]
    def submit(self,fly,rates):
        f=Future();self.jobs.append((fly,rates,f));return f
    def finish(self,index,buy=0,sell=0):
        fly,_,f=self.jobs[index];f.set_result({'buy_hz':buy,'sell_hz':sell,'fly_id':fly,'state_id':fly+':1'})

@pytest.fixture
def setup(tmp_path,monkeypatch):
    class Clock(datetime):
        current=datetime(2026,9,14,13,30,tzinfo=UTC)
        @classmethod
        def now(cls,tz=None):return cls.current
    monkeypatch.setattr('tradefly.market.datetime',Clock)
    monkeypatch.setattr('tradefly.parallel_market.datetime',Clock)
    b=Exchange(['AAPL','MSFT','NVDA']);p=Pool()
    e=ParallelMarketEngine(Settings(database=tmp_path/'pool.db'),broker=b,brain=p)
    e.before_submit=lambda:True
    assert e.resume()
    b.history.append(b.bar(Clock.current));Clock.current+=timedelta(minutes=5,seconds=15)
    return e,b,p,Clock

def test_dispatches_two_distinct_stocks_before_either_finishes(setup):
    e,b,p,c=setup;e.tick(c.current)
    assert len(p.jobs)==2 and len(e.pending)==2 and e.ledger.decision_count()==0
    assert len({v['decision']['symbol'] for v in e.pending.values()})==2
    assert len(e.ledger.get('brain_inflight'))==2
    e.tick(c.current);assert len(p.jobs)==2
    p.finish(1);e.tick(c.current)
    assert e.ledger.decision_count()==1 and e.ledger.decisions()[0]['fly_id']=='fly-2'
    assert len(p.jobs)==3 # An idle fly takes the next stock without waiting for its peer.
    p.finish(0);p.finish(2);e.tick(c.current)
    assert e.ledger.decision_count()==3 and not e.ledger.get('brain_inflight')
    assert e.snapshot()['flies']['completed']=={'fly-2':2,'fly-1':1}

def test_two_buy_results_submit_serially_with_fresh_account_state(setup):
    e,b,p,c=setup;e.tick(c.current);p.finish(0,40);p.finish(1,40)
    e.tick(c.current)
    assert len(b.submissions)==1 and len(e.intents)==1
    e.tick(c.current);assert len(b.submissions)==1
    b.fill();e.tick(c.current)
    assert len(b.submissions)==2 and not e.intents
    assert b.submissions[0]['symbol']!=b.submissions[1]['symbol']
    assert all(float(o['notional'])<=100 for o in b.submissions)

def test_pause_records_finished_brains_but_never_executes_old_work(setup):
    e,b,p,c=setup;e.tick(c.current);e.pause();assert e.resume()
    p.finish(0,40);p.finish(1,40);e.tick(c.current)
    assert e.ledger.decision_count()==2 and not b.submissions and not e.intents
    assert not e.ledger.get('brain_inflight')

def test_stale_intents_are_dropped_after_reconciliation_delay(setup):
    e,b,p,c=setup;e.tick(c.current);p.finish(0,40);p.finish(1,40);e.tick(c.current)
    b.fill();c.current+=timedelta(minutes=5);e.tick(c.current)
    assert len(b.submissions)==1 and not e.intents
    assert any(x['data'].get('reason')=='Decision expired before execution' for x in e.ledger.events())

def test_worker_failure_preserves_recovery_marker_and_pauses(setup):
    e,b,p,c=setup;e.tick(c.current);p.jobs[0][2].set_exception(RuntimeError('worker failed'))
    with pytest.raises(RuntimeError):e.tick(c.current)
    assert e.paused and e.fatal and e.ledger.get('brain_inflight') and not b.submissions
    e.tick(c.current);assert not b.submissions

def test_data_gaps_are_skipped_without_one_poll_delay_each(setup):
    e,b,p,c=setup;b.gaps.update(e.watchlist[:2]);e.tick(c.current)
    assert len(p.jobs)==1
    assert [r['status'] for r in e.ledger.coverage()].count('data_gap')==2

def test_flies_share_one_total_portfolio_exposure_limit(setup):
    e,b,p,c=setup
    account=b.account();account.update(equity='1000',cash='1000')
    b.account=lambda:account.copy()
    e.refresh();e.tick(c.current);p.finish(0,40);p.finish(1,40);e.tick(c.current)
    assert len(b.submissions)==1
    b.fill();e.tick(c.current)
    assert len(b.submissions)==1 and not e.intents
    assert any(x['data'].get('reason')=='10% total portfolio exposure limit' for x in e.ledger.events())

def test_control_check_session_change_invalidates_ready_intent(setup):
    e,b,p,c=setup;e.tick(c.current);p.finish(0,40);p.finish(1)
    e.before_submit=e.resume
    e.tick(c.current)
    assert not b.submissions
    assert any(x['data'].get('reason')=='Session or input boundary changed during control check' for x in e.ledger.events())
