import json
from datetime import datetime, timedelta
import httpx
import pytest
from tradefly.corporate_actions import KEY, normalize, assess, refresh, report, input_affected
from tradefly.alpaca import Alpaca, BrokerError
from tradefly.config import Settings
from tradefly.domain import UTC
from tradefly.learning_lab import Lab
from test_backend import make_engine, decision, ASSET

NOW = datetime(2026,9,17,15,tzinfo=UTC)
EVENT = {'id':'split-nct','symbol':'NCT','type':'reverse_split','date':'2026-09-17','old_rate':'25','new_rate':'1','source':'Alpaca corporate-actions feed'}
FILL = {'symbol':'NCT','side':'buy','filled_qty':'299','filled_at':'2026-09-16T15:00:00Z'}


def test_nct_old_quantity_and_new_price_remain_unverified_after_restart_or_disappearance(tmp_path):
    e=make_engine(tmp_path)
    issues=assess([EVENT],[FILL],[{'symbol':'NCT','qty':'299'}],[],NOW)
    assert issues[0]['status']=='quantity_mismatch'
    assert issues[0]['expected_qty_before_rounding']=='11.96'
    assert assess([],[],[],issues,NOW)==issues
    e.ledger.set(KEY,{'status':'checked','checked_at':datetime.now(UTC).isoformat(),'issues':issues})
    e.account['equity']='102333'; before=e.ledger.orders()
    s=e.snapshot()
    assert s['equity_change_usd'] is None
    assert s['reported_equity_change_usd']==92333
    assert not s['corporate_actions']['performance_verified']
    e.submit_intent(decision(),{},ASSET)
    assert e.broker.submissions==[] and e.ledger.orders()==before
    assert any('Corporate-action' in x for x in e.blockers())


def test_forward_split_and_matching_quantity_still_need_fraction_and_cash_reconciliation():
    event={**EVENT,'type':'forward_split','old_rate':'1','new_rate':'4'}
    issues=assess([event],[{**FILL,'filled_qty':'10'}],[{'symbol':'NCT','qty':'40'}],[],NOW)
    assert issues[0]['expected_qty_before_rounding']=='40'
    assert issues[0]['status']=='requires_reconciliation'


def test_not_held_at_event_or_future_action_does_not_flag_account():
    assert not assess([EVENT],[{**FILL,'filled_at':'2026-09-17T15:00:00Z'}],[],[],NOW)
    assert not assess([EVENT],[FILL,{**FILL,'side':'sell','filled_at':'2026-09-16T16:00:00Z'}],[],[],NOW)
    assert not assess([{**EVENT,'date':'2026-09-18'}],[FILL],[],[],NOW)


def test_pagination_cache_and_failure_do_not_discard_known_actions(tmp_path):
    e=make_engine(tmp_path); calls=[]
    def response(start,end,token):
        calls.append(token)
        return {'corporate_actions':{'reverse_splits':[{'id':'split-nct','symbol':'NCT','ex_date':'2026-09-17','old_rate':25,'new_rate':1}]} if not token else {},'next_page_token':'page2' if not token else None}
    e.broker.corporate_actions=response
    e.ledger.set(KEY,{})
    refresh(e,NOW);refresh(e,NOW+timedelta(seconds=10))
    assert calls==[None,'page2']
    assert input_affected(e,'NCT','2026-09-16T14:00:00Z','2026-09-17T14:00:00Z')
    def fail(*args): raise BrokerError(403,'GET')
    e.broker.corporate_actions=fail
    state=refresh(e,NOW+timedelta(minutes=11))
    assert state['status']=='unavailable' and len(state['events'])==1
    assert not report(e)['performance_verified']
    assert not e.broker.submissions


def test_malformed_actions_are_not_silently_treated_as_clear():
    with pytest.raises(ValueError):normalize({'corporate_actions':{'reverse_splits':[{'id':'bad','symbol':'NCT'}]}})
    with pytest.raises(ValueError):normalize({'corporate_actions':{'reverse_splits':[{'id':'bad','symbol':'NCT','ex_date':'2026-09-17','old_rate':0,'new_rate':1}]}})


def test_adapter_only_allows_exact_read_only_corporate_action_endpoint():
    calls=[]
    def handler(request):
        calls.append(request)
        assert request.url.host=='data.alpaca.markets' and request.method=='GET'
        return httpx.Response(200,json={'corporate_actions':{},'next_page_token':None})
    b=Alpaca(Settings(),transport=httpx.MockTransport(handler))
    b.corporate_actions('2026-09-16','2026-09-17')
    for method,data in [('POST',True),('GET',False)]:
        with pytest.raises(ValueError):b.request(method,'/v1/corporate-actions',data=data)
    assert len(calls)==1


def test_affected_account_inputs_are_excluded_from_learning_without_deleting_decisions(tmp_path):
    e=make_engine(tmp_path)
    d=decision();d.update(symbol='AAPL',created_at='2026-09-17T14:00:00+00:00',neural={'buy_hz':40,'sell_hz':0,'manifest_hash':'test','activity':{'neuron_ids':['1'],'events':[[0,10]]}})
    e.ledger.decision(d)
    e.ledger.set(KEY,{'status':'checked','checked_at':datetime.now(UTC).isoformat(),'events':[EVENT],'issues':assess([EVENT],[FILL],[{'symbol':'NCT','qty':'299'}],[],NOW)})
    lab=Lab(tmp_path/'learning',e.settings.database,e.broker);lab.ingest()
    assert lab.db.execute('select status from observations').fetchone()[0]=='corporate_action'
    assert e.ledger.decision_count()==1
    assert not lab.report('test')['eligible']
    lab.close()
