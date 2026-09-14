from datetime import datetime,timedelta
from decimal import Decimal
import pytest
from tradefly.config import Settings,validate_watchlist
from tradefly.engine import Engine
from test_live_loop import Market,TestBrain
from test_backend import ASSET,decision

class MultiMarket(Market):
    def __init__(self):super().__init__();self.visited=[]
    def bars(self,symbol,*args):self.visited.append(symbol);return super().bars(*args)
    def fill(self):
        holdings={p['symbol']:Decimal(p['qty']) for p in self.holdings}
        for order in self.found.values():
            if order['status']=='filled':continue
            shares=Decimal(order['notional'])/200 if order['side']=='buy' else Decimal(order['qty'])
            order.update(status='filled',filled_qty=str(shares),filled_avg_price='200')
            holdings[order['symbol']]=holdings.get(order['symbol'],Decimal(0))+(shares if order['side']=='buy' else -shares)
        self.holdings=[{'symbol':s,'qty':str(q),'market_value':str(q*200)} for s,q in holdings.items() if q]

@pytest.mark.parametrize('values',[[],['AAPL']*2,['aapl'],['../AAPL'],['A'*12],['AAPL']*25,'AAPL'])
def test_watchlist_rejects_invalid_values(values):
    with pytest.raises(ValueError):validate_watchlist(values)

def test_one_shared_brain_rotates_and_reconciles_per_symbol(tmp_path,monkeypatch):
    from tradefly.domain import UTC
    class Clock(datetime):
        current=datetime(2026,9,14,13,30,tzinfo=UTC)
        @classmethod
        def now(cls,tz=None):return cls.current
    monkeypatch.setattr('tradefly.engine.datetime',Clock)
    market=MultiMarket();brain=TestBrain([(40,0),(40,0),(0,40)])
    settings=Settings(database=tmp_path/'multi.db',watchlist=('AAPL','MSFT'))
    engine=Engine(settings,broker=market,brain=brain);engine.before_submit=lambda:True
    assert engine.resume()
    for i in range(3):
        t=datetime(2026,9,14,13,30,tzinfo=UTC)+timedelta(minutes=5*i)
        market.history.append(market.bar(t));Clock.current=t+timedelta(minutes=5,seconds=15)
        engine.tick(Clock.current);market.fill()
        Clock.current+=timedelta(minutes=2)
        engine.tick(Clock.current)
    assert [d['symbol'] for d in engine.ledger.decisions()]==['AAPL','MSFT','AAPL']
    assert [o['symbol'] for o in market.submissions]==['AAPL','MSFT','AAPL']
    assert brain.steps==3 and engine.ledger.get('watchlist_cursor')==3
    assert not engine.blockers() and not engine.paused
    assert len(market.holdings)==1 and market.holdings[0]['symbol']=='MSFT'
    assert Decimal(market.holdings[0]['qty'])==Decimal('.5')
    engine.ledger.close()
    restarted=Engine(settings,broker=market,brain=brain)
    assert restarted.symbol=='MSFT' and restarted.paused

def test_total_portfolio_cap_is_shared_not_per_stock(tmp_path):
    m=MultiMarket();e=Engine(Settings(database=tmp_path/'cap.db',watchlist=('AAPL','MSFT')),broker=m)
    e.refresh();e.paused=False
    e.positions=[{'symbol':'MSFT','qty':'5','market_value':'1000'}]
    e.submit_intent({**decision(),'symbol':'AAPL'}, {},ASSET)
    assert not m.submissions
    assert e.ledger.events()[0]['data']['reason']=='10% total portfolio exposure limit'

def test_watchlist_changes_require_pause_valid_assets_and_keep_holdings(tmp_path):
    m=MultiMarket();e=Engine(Settings(database=tmp_path/'watch.db'),broker=m)
    e.paused=False
    with pytest.raises(ValueError,match='Pause'):e.set_watchlist(['AAPL','MSFT'])
    e.paused=True;m.holdings=[{'symbol':'AAPL','qty':'1'}]
    with pytest.raises(ValueError,match='held'):e.set_watchlist(['MSFT'])
    m.holdings=[]
    m.asset=lambda s:{**ASSET,'fractionable':s!='BAD'}
    with pytest.raises(ValueError,match='BAD'):e.set_watchlist(['AAPL','BAD'])
    e.set_watchlist(['MSFT','AAPL'])
    assert e.watchlist==('MSFT','AAPL') and e.paused and e.ledger.get('watchlist_cursor')==0
    e.ledger.close()
    restarted=Engine(e.settings,broker=m)
    assert restarted.watchlist==('MSFT','AAPL')
