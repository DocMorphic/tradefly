import json
from datetime import datetime,timedelta
from decimal import Decimal
import httpx
import pytest
from tradefly.alpaca import Alpaca,BrokerError
from tradefly.config import Settings,PAPER_URL
from tradefly.domain import UTC,completed_bars,decode,encode,size_order
from tradefly.engine import Engine
from tradefly.storage import Ledger

ACCOUNT={'id':'paper-test','status':'ACTIVE','currency':'USD','cash':'10000','equity':'10000','trading_blocked':False,'account_blocked':False}
ASSET={'status':'active','tradable':True,'fractionable':True}

class FakeBroker:
    def __init__(self): self.submissions=[];self.found={};self.cancelled=[];self.failure=None;self.holdings=[]
    def account(self): return ACCOUNT.copy()
    def positions(self): return self.holdings
    def clock(self): return {'is_open':True}
    def open_orders(self): return []
    def order(self,c): return self.found.get(c)
    def submit(self,p):
        self.submissions.append(p)
        if self.failure: raise self.failure
        result={**p,'id':'broker-1','status':'new','filled_qty':'0'}
        self.found[p['client_order_id']]=result
        return result
    def cancel(self,i): self.cancelled.append(i)
    def close(self):pass

def make_engine(tmp_path,broker=None):
    s=Settings(database=tmp_path/'test.db')
    e=Engine(s,broker=broker or FakeBroker());e.refresh();e.paused=False
    return e

def decision(i='a',action='BUY'):
    return {'id':i,'action':action,'bar':{'c':200,'t':'2026-09-14T14:00:00Z'}}

def test_decoder_has_no_market_input_and_fails_closed():
    assert decode(28,20)[0]=='BUY'
    assert decode(20,28)[0]=='SELL'
    for rates in [(19,0),(22,20),(30,30),(float('nan'),20),(-1,50)]: assert decode(*rates)[0]=='HOLD'

def test_cash_only_caps_and_long_only_sizing():
    p,_=size_order('BUY',ACCOUNT,{},ASSET,200)
    assert p=={'side':'buy','notional':'100.00'}
    assert size_order('SELL',ACCOUNT,{},ASSET,200)[0] is None
    p,_=size_order('SELL',ACCOUNT,{'qty':'.1234567899'},ASSET,200)
    assert Decimal(p['qty'])==Decimal('.123456789')
    assert size_order('BUY',ACCOUNT,{'qty':'5','market_value':'1000'},ASSET,200)[0] is None
    assert size_order('BUY',{**ACCOUNT,'cash':'-1'}, {},ASSET,200)[0] is None
    assert size_order('BUY',ACCOUNT,{}, {**ASSET,'fractionable':False},200)[0] is None

@pytest.mark.parametrize('method,path,data,host', [('GET','/v2/account',False,'paper-api.alpaca.markets'),('GET','/v2/stocks/bars',True,'data.alpaca.markets'),('POST','/v2/orders',False,'paper-api.alpaca.markets')])
def test_only_fixed_hosts_and_no_credential_redirect(method,path,data,host):
    calls=[]
    def handler(request):
        calls.append(request)
        assert request.url.host==host
        assert request.headers['APCA-API-KEY-ID']=='hidden-key'
        return httpx.Response(302,headers={'Location':'https://api.alpaca.markets/v2/orders'})
    a=Alpaca(Settings(api_key='hidden-key',secret_key='hidden-secret'),transport=httpx.MockTransport(handler))
    with pytest.raises(BrokerError) as e:a.request(method,path,data=data)
    assert len(calls)==1 and 'hidden' not in str(e.value)
    with pytest.raises(ValueError):a.request('GET','https://api.alpaca.markets/v2/account')

def test_calendar_handles_early_close_and_incomplete_bars():
    calendar=[{'date':'2026-11-27','open':'09:30','close':'13:00'}]
    def bar(t):return {'t':t,'o':100,'h':102,'l':99,'c':101,'v':1000}
    bars=[bar('2026-11-27T17:55:00Z'),bar('2026-11-27T18:00:00Z')]
    assert len(completed_bars(bars,calendar,datetime(2026,11,27,18,10,tzinfo=UTC)))==1
    assert not completed_bars(bars,calendar,datetime(2026,11,27,17,59,tzinfo=UTC))
    assert len(completed_bars([bars[0],bars[0]],calendar,datetime(2026,11,27,18,tzinfo=UTC)))==1
    with pytest.raises(ValueError):completed_bars([bars[0],{**bars[0],'v':3}],calendar,datetime(2026,11,27,18,tzinfo=UTC))

def test_encoder_uses_only_prior_bars_and_bounded_stimuli():
    previous=[{'c':100,'v':100} for _ in range(20)]
    rates=encode({'c':101,'h':102,'l':100,'v':200},previous,ACCOUNT,{})
    assert rates['return_up']==100 and rates['return_down']==10
    assert rates['volume']==100
    assert all(10<=v<=100 for v in rates.values())
    assert previous[-1]['c']==100
    with pytest.raises(ValueError):encode({'c':1},previous[:19],ACCOUNT,{})

def test_prepared_order_is_durable_before_post_and_never_duplicated(tmp_path):
    broker=FakeBroker();engine=make_engine(tmp_path,broker)
    original=broker.submit
    def submit(payload):
        other=Ledger(engine.settings.database)
        assert other.orders()[0]['status']=='prepared';other.close()
        return original(payload)
    broker.submit=submit
    engine.submit_intent(decision(),{},ASSET)
    engine.submit_intent(decision(),{},ASSET)
    assert len(broker.submissions)==1
    engine.ledger.close()
    resumed=Engine(engine.settings,broker=broker)
    assert resumed.paused
    resumed.refresh()
    assert len(broker.submissions)==1

def test_ambiguous_submission_reconciles_partial_fill_without_retry(tmp_path):
    broker=FakeBroker();broker.failure=BrokerError(None,'POST')
    engine=make_engine(tmp_path,broker)
    engine.submit_intent(decision(),{},ASSET)
    row=engine.ledger.orders()[0]
    assert row['status']=='uncertain' and engine.paused
    broker.found[row['client_id']]={'id':'accepted','client_order_id':row['client_id'],'status':'partially_filled','side':'buy','filled_qty':'.25','filled_avg_price':'200'}
    broker.holdings=[{'symbol':'AAPL','qty':'.25'}]
    engine.refresh()
    assert engine.ledger.orders()[0]['status']=='partially_filled'
    assert len(broker.submissions)==1
    assert not any('holdings disagree' in b for b in engine.blockers())
    engine.pause();assert broker.cancelled==['accepted']

def test_missing_uncertain_order_stays_paused(tmp_path):
    engine=make_engine(tmp_path)
    engine.ledger.prepare_order('tf-missing','missing',{})
    engine.reconcile()
    assert engine.paused and engine.ledger.orders()[0]['status']=='uncertain'
    assert not engine.broker.submissions

def test_credentials_never_appear_in_settings_or_snapshot(tmp_path):
    s=Settings(api_key='SECRET-KEY',secret_key='SECRET-TOKEN',database=tmp_path/'test.db')
    e=Engine(s,broker=FakeBroker());e.refresh()
    assert 'SECRET' not in repr(s)+json.dumps(e.snapshot())
    assert 'paper-test' not in json.dumps(e.snapshot())

def test_unrelated_holdings_block_resume_and_no_mock_fallback(tmp_path):
    engine=make_engine(tmp_path)
    engine.broker.holdings=[{'symbol':'AAPL','qty':'1'}]
    assert not engine.resume()
    assert any('holdings disagree' in b for b in engine.blockers())
    assert engine.paused and not engine.broker.submissions

def test_checkpoint_interruption_blocks_new_run(tmp_path):
    engine=make_engine(tmp_path)
    engine.ledger.set('brain_inflight','2026-09-14T14:00:00Z')
    engine.ledger.close()
    restarted=Engine(engine.settings,broker=FakeBroker())
    assert restarted.fatal and not restarted.resume()

def test_replay_never_fills_the_decision_bar_or_final_pending_intent():
    from tradefly.replay import replay
    class Brain:
        def stimulate(self,rates):return {'buy_hz':40,'sell_hz':0}
    bars=[{'t':'a','o':100,'h':110,'l':90,'c':100,'v':100}, {'t':'b','o':200,'h':210,'l':190,'c':200,'v':100}]
    result=replay(bars,[{'c':100,'v':100}]*20,Brain())
    assert result['frames'][0]['shares']==0
    assert len(result['fills'])==1
    assert result['fills'][0]['bar']=='b' and result['fills'][0]['price']>200
    assert result['pending_final_intent']=='BUY'
