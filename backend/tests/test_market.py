from datetime import datetime,timedelta
from pathlib import Path
import json,sqlite3
import pytest
from tradefly.config import Settings
from tradefly.domain import UTC
from tradefly.market import MarketEngine,universe,size_market_order
from tradefly.storage import Ledger
from test_watchlist import MultiMarket
from test_live_loop import TestBrain
from test_backend import ASSET,ACCOUNT

class Exchange(MultiMarket):
    def __init__(self, symbols):
        super().__init__();self.symbols=symbols;self.gaps=set();self.batches=[]
    def assets(self): return [{**ASSET,'class':'us_equity','symbol':s} for s in self.symbols]
    def bars_many(self,symbols,*args):
        self.batches.append(symbols)
        return {s:self.history if s not in self.gaps else [] for s in symbols}

@pytest.fixture
def clock(monkeypatch):
    class Clock(datetime):
        current=datetime(2026,9,14,13,30,tzinfo=UTC)
        @classmethod
        def now(cls,tz=None):return cls.current
    monkeypatch.setattr('tradefly.market.datetime',Clock)
    return Clock

def create(tmp_path,clock,symbols,outputs):
    broker=Exchange(symbols);brain=TestBrain(outputs)
    e=MarketEngine(Settings(database=tmp_path/'market.db'),broker=broker,brain=brain)
    e.before_submit=lambda:True
    assert e.resume()
    broker.history.append(broker.bar(clock.current))
    clock.current+=timedelta(minutes=5,seconds=15)
    return e,broker,brain

def test_all_symbols_without_watchlist_cap_and_no_price_ranking():
    rows=[{**ASSET,'class':'us_equity','symbol':f'S{i}','fractionable':False} for i in range(300)]
    rows += [{**ASSET,'class':'crypto','symbol':'BTCUSD'}, {**ASSET,'class':'us_equity','symbol':'OFF','tradable':False}]
    assert len(universe(rows))==300
    assert universe(rows)['S299']['fractionable'] is False

def test_shared_brain_neural_acceptance_multiple_stocks_same_bar(tmp_path,clock):
    e,b,brain=create(tmp_path,clock,['AAPL','MSFT','NVDA'],[(0,0),(40,0),(0,40)])
    order=list(e.watchlist)
    for _ in order:
        e.tick(clock.current);b.fill();e.refresh()
    assert [d['symbol'] for d in e.ledger.decisions()]==order
    assert [d['action'] for d in e.ledger.decisions()]==['HOLD','BUY','SELL']
    assert len({d['bar']['t'] for d in e.ledger.decisions()})==1
    # Only the middle symbol got a BUY; the final SELL had no holdings.
    assert [x['symbol'] for x in b.submissions]==[order[1]]
    assert brain.steps==3 and len(b.batches)==1
    for _ in range(5):e.tick(clock.current)
    assert brain.steps==3 and not e.paused
    e.ledger.close()
    r=MarketEngine(e.settings,broker=b,brain=brain);r.discover()
    assert r.paused and r.ledger.get('market_cursor')==3 and r.ledger.decision_count()==3

def test_data_gaps_are_recorded_and_do_not_block_other_stocks(tmp_path,clock):
    e,b,brain=create(tmp_path,clock,['AAPL','MSFT'],[(0,0)])
    b.gaps.add(e.watchlist[0]);e.tick(clock.current);e.tick(clock.current)
    assert brain.steps==1 and not e.paused and not b.submissions
    assert {r['status'] for r in e.ledger.coverage()}=={'data_gap','HOLD'}

def test_unresolved_order_blocks_further_neural_steps(tmp_path,clock):
    e,b,brain=create(tmp_path,clock,['AAPL','MSFT'],[(40,0)])
    e.tick(clock.current);e.tick(clock.current)
    assert brain.steps==1 and len(b.submissions)==1

def test_new_bar_required_after_resume_and_new_boundary_refreshes_inputs(tmp_path,clock):
    e,b,brain=create(tmp_path,clock,['AAPL'],[(0,0),(0,0)])
    e.tick(clock.current);e.tick(clock.current)
    assert brain.steps==1
    clock.current+=timedelta(minutes=5);b.history.append(b.bar(clock.current-timedelta(minutes=5,seconds=15)))
    e.tick(clock.current)
    assert brain.steps==2 and len(b.batches)==2

def test_whole_share_execution_preserves_budget_and_no_shorting():
    asset={**ASSET,'fractionable':False}
    assert size_market_order('BUY',ACCOUNT,{},asset,30,'100','.10')[0]=={'side':'buy','qty':'3'}
    assert size_market_order('BUY',ACCOUNT,{},asset,101,'100','.10')[0] is None
    assert size_market_order('SELL',ACCOUNT,{'qty':'2'},asset,30,'100','.10')[0]=={'side':'sell','qty':'2'}
    assert size_market_order('SELL',ACCOUNT,{},asset,30,'100','.10')[0] is None
    assert size_market_order('HOLD',ACCOUNT,{},asset,30,'100','.10')[0] is None

def test_existing_decisions_migrate_without_losing_history(tmp_path):
    p=tmp_path/'old.db';db=sqlite3.connect(p)
    db.execute('CREATE TABLE decisions(id TEXT PRIMARY KEY,bar_time TEXT NOT NULL UNIQUE,data TEXT NOT NULL)')
    d={'id':'old','bar':{'t':'2026-09-11T13:30:00Z'}}
    db.execute('INSERT INTO decisions VALUES(?,?,?)',(d['id'],d['bar']['t'],json.dumps(d)));db.commit();db.close()
    l=Ledger(p);l.decision({**d,'id':'new','symbol':'MSFT'})
    assert l.decision_count()==2 and l.has_bar(d['bar']['t'],'AAPL') and l.has_bar(d['bar']['t'],'MSFT')
    with pytest.raises(sqlite3.IntegrityError):l.decision({**d,'id':'duplicate','symbol':'MSFT'})

def test_pagination_keeps_other_symbols_and_rejects_token_cycles():
    import httpx
    from tradefly.alpaca import Alpaca,BrokerError
    pages=iter([{'bars':{'AAPL':[{'t':'a'}]},'next_page_token':'p1'}, {'bars':{'MSFT':[{'t':'b'}]},'next_page_token':None}])
    b=Alpaca(Settings(),transport=httpx.MockTransport(lambda _:httpx.Response(200,json=next(pages))))
    assert b.bars_many(['AAPL','MSFT'],'start','end')=={'AAPL':[{'t':'a'}],'MSFT':[{'t':'b'}]};b.close()
    b=Alpaca(Settings(),transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'bars':{},'next_page_token':'same'})))
    with pytest.raises(BrokerError,match='repeated data page'): b.bars_many(['AAPL'],'start','end')
    b.close()
