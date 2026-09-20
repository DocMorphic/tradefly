import json
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta
from types import SimpleNamespace
import pytest
from tradefly.config import Settings
from tradefly.engine import Engine
from tradefly.domain import UTC, number
from tradefly.corporate_actions import KEY as ACTIONS, report as actions, input_affected
from tradefly.isolation import KEY, approve, refresh, report
from tradefly.learning_policy import select
from test_backend import FakeBroker, ACCOUNT, ASSET, decision


@pytest.fixture
def isolated(tmp_path):
    b = FakeBroker()
    account = {**ACCOUNT, 'cash': '9848.7885', 'equity': '11731.6585'}
    b.account = lambda: account.copy()
    b.asset = lambda symbol: ASSET
    b.holdings = [
        {'symbol': 'NCT', 'side': 'long', 'qty': '299', 'avg_entry_price': '.3385', 'cost_basis': '101.2115', 'current_price': '6.13', 'market_value': '1832.87'},
        {'symbol': 'AAPL', 'side': 'long', 'qty': '1', 'avg_entry_price': '50', 'cost_basis': '50', 'current_price': '50', 'market_value': '50'},
    ]
    raw_event = {'id': 'nct-split', 'symbol': 'NCT', 'ex_date': '2026-09-17', 'old_rate': '25', 'new_rate': '1'}
    b.corporate_actions = lambda *a: {'corporate_actions': {'reverse_splits': [raw_event]}}
    e = Engine(Settings(database=tmp_path/'test.db', watchlist=('NCT', 'AAPL')), broker=b,
               brain=SimpleNamespace(ready=True, manifest={}, manifest_hash='test'))
    e.refresh()
    e.ledger.set('baseline', {'equity': '10000', 'at': '2026-09-13T23:58:00+00:00'})
    funding = {'id': 'funding', 'activity_type': 'JNLC', 'net_amount': '10000', 'currency': 'USD', 'status': 'executed', 'created_at': '2026-09-13T23:00:00Z'}
    activity = [funding]
    for p in b.holdings:
        order = {'id': 'broker-'+p['symbol'], 'client_order_id': 'tf-'+p['symbol'], 'symbol': p['symbol'], 'side': 'buy', 'status': 'filled', 'filled_qty': p['qty'], 'filled_avg_price': p['avg_entry_price'], 'filled_at': '2026-09-16T15:00:00Z'}
        e.ledger.prepare_order(order['client_order_id'], p['symbol'], {'symbol': p['symbol']})
        e.ledger.update_order(order['client_order_id'], 'filled', order)
        b.found[order['client_order_id']] = order
        activity.append({'id': 'fill-'+p['symbol'], 'activity_type': 'FILL', 'symbol': p['symbol'], 'side': 'buy', 'qty': p['qty'], 'price': p['avg_entry_price'], 'order_id': order['id'], 'transaction_time': order['filled_at']})
    b.activities = lambda after: deepcopy(activity)
    e.refresh()
    before = e.ledger.orders()
    assert approve(e, ['NCT'], 'Owner approved NCT exclusion')['valid']
    assert e.ledger.orders() == before
    yield e, b, account, activity
    e.ledger.close()


def test_resume_and_sizing_use_only_cash_and_unaffected_positions(isolated):
    e, b, _, _ = isolated
    assert e.resume()
    s = e.snapshot()
    assert s['corporate_actions']['execution_ready']
    assert not s['corporate_actions']['performance_verified']
    assert s['equity_change_usd'] is None
    assert e.execution_account()['equity'] == '9898.7885'
    assert e.execution_account()['buying_power'] == '9848.7885'
    assert e.account['equity'] == '11731.6585'  # Raw account never rewritten.
    e.settings = replace(e.settings, max_order='5000')
    e.submit_intent({**decision(), 'symbol': 'AAPL', 'bar': {'c': 50}}, b.holdings[1], ASSET)
    assert b.submissions[0]['notional'] == '939.87'  # 10% safe capital minus $50 held.


@pytest.mark.parametrize('side', ['BUY', 'SELL'])
def test_isolated_symbol_cannot_generate_inputs_or_orders(isolated, side):
    e, b, _, _ = isolated
    assert e.resume()
    assert input_affected(e, 'NCT', '2027-01-01T00:00:00Z', '2027-01-02T00:00:00Z')
    e.submit_intent({**decision(action=side), 'symbol': 'NCT'}, b.holdings[0], ASSET)
    assert not b.submissions


def test_shadow_stays_training_only_and_learned_remains_gated(isolated):
    e, b, _, _ = isolated
    select(e, 'shadow'); assert e.resume()
    e.submit_intent({**decision(), 'symbol': 'AAPL'}, b.holdings[1], ASSET)
    assert not b.submissions and e.ledger.get('decoder_mode') == 'shadow'
    e.paused = True
    with pytest.raises(ValueError, match='valuation'): select(e, 'learned')
    e.ledger.set('decoder_mode', 'learned')
    assert not e.resume()


@pytest.mark.parametrize('change', ['cash', 'nct_qty', 'nct_basis', 'missing_nct', 'other_qty', 'other_basis', 'new_cash', 'changed_activity', 'missing_activity', 'foreign_fill', 'isolated_order', 'new_issue', 'feed_failure', 'account', 'baseline'])
def test_changed_evidence_reblocks_without_clearing_history(isolated, change):
    e, b, account, activity = isolated
    before = e.ledger.orders()
    if change == 'cash': account['cash'] = '10000'
    if change == 'nct_qty': b.holdings[0]['qty'] = '11.96'
    if change == 'nct_basis': b.holdings[0]['cost_basis'] = '90'
    if change == 'missing_nct': b.holdings.pop(0)
    if change == 'other_qty': b.holdings[1]['qty'] = '2'
    if change == 'other_basis': b.holdings[1]['cost_basis'] = '10'
    if change == 'new_cash': activity.append({**activity[0], 'id': 'new-funding', 'net_amount': '1'})
    if change == 'changed_activity': activity[1]['price'] = '.33'
    if change == 'missing_activity': activity.pop()
    if change == 'foreign_fill': activity.append({**activity[1], 'id': 'foreign', 'order_id': 'unknown'})
    if change == 'isolated_order': b.open_orders = lambda: [{'symbol': 'NCT', 'client_order_id': 'tf-NCT'}]
    if change == 'new_issue':
        state = e.ledger.get(ACTIONS)
        state['issues'].append({**state['issues'][0], 'id': 'new-action'})
        e.ledger.set(ACTIONS, state)
    if change == 'feed_failure':
        state = e.ledger.get(ACTIONS); state.update(status='unavailable', attempted_at=datetime.now(UTC).isoformat()); e.ledger.set(ACTIONS, state)
    if change == 'account': e.ledger.set('account_hash', 'different')
    if change == 'baseline': e.ledger.set('baseline', {'equity': '20000', 'at': '2026-09-13T23:58:00+00:00'})
    if change == 'account':
        with pytest.raises(ValueError): e.refresh()
        refresh(e)
    else: e.refresh()
    assert not report(e)['valid']
    assert not actions(e)['execution_ready']
    e.paused = False
    e.submit_intent({**decision(), 'symbol': 'AAPL'}, {}, ASSET)
    assert not b.submissions and e.ledger.orders() == before
    assert e.ledger.get(KEY) and e.snapshot()['equity_change_usd'] is None


def test_stale_audit_and_restart_require_new_verification(isolated):
    e, b, _, _ = isolated
    e.isolation_check['checked_at'] = (datetime.now(UTC)-timedelta(seconds=31)).isoformat()
    assert not report(e)['valid']
    with pytest.raises(ValueError): e.execution_account()
    fresh = Engine(e.settings, broker=b, ledger=e.ledger, brain=e.brain)
    assert fresh.paused and not actions(fresh)['execution_ready']
    assert fresh.resume()


def test_new_legitimate_fill_updates_cash_basis_and_risk_capital(isolated):
    e, b, account, activity = isolated
    order = {'id': 'new-aapl', 'client_order_id': 'tf-new', 'symbol': 'AAPL', 'side': 'buy', 'status': 'filled', 'filled_qty': '1', 'filled_avg_price': '60', 'filled_at': '2026-09-20T16:00:00Z'}
    e.ledger.prepare_order('tf-new', 'new', {'symbol': 'AAPL'}); e.ledger.update_order('tf-new', 'filled', order)
    b.found['tf-new'] = order
    activity.append({'id': 'new-fill', 'activity_type': 'FILL', 'symbol': 'AAPL', 'side': 'buy', 'qty': '1', 'price': '60', 'order_id': 'new-aapl', 'transaction_time': order['filled_at']})
    account.update(cash='9788.7885', equity='11731.6585')
    b.holdings[1].update(qty='2', cost_basis='110', avg_entry_price='55', current_price='55', market_value='110')
    e.refresh()
    assert report(e)['valid'] and e.execution_account()['cash'] == '9788.7885'
    assert e.execution_account()['equity'] == '9898.7885'


def test_account_mutation_invalidates_audit_before_next_refresh(isolated):
    e, b, _, _ = isolated
    e.account['cash'] = '999999'
    assert not report(e)['valid'] and not actions(e)['execution_ready']
    assert not b.submissions


def test_parallel_dispatch_skips_isolated_stock_and_records_conservative_inputs(isolated):
    from tradefly.parallel_market import ParallelMarketEngine
    from tradefly.domain import encode
    from test_parallel_market import Pool
    e, b, _, _ = isolated
    pool = Pool()
    p = ParallelMarketEngine(e.settings, ledger=e.ledger, broker=b, brain=pool)
    p.account, p.positions, p.open_orders, p.connected = e.account, e.positions, [], True
    p.isolation_check = e.isolation_check
    p.watchlist = ('NCT', 'AAPL'); p.universe_id = 'test'
    now = datetime(2026, 9, 21, 15, 15, 15, tzinfo=UTC)
    p.started = now-timedelta(minutes=10)
    bars = [{'t': (now.replace(second=0)-timedelta(minutes=5*(21-i))).isoformat(), 'o':50, 'h':51, 'l':49, 'c':50, 'v':100} for i in range(21)]
    b.bars_many = lambda symbols, *args: {s: bars for s in symbols}
    b.calendar = lambda *args: [{'date': '2026-09-21', 'open':'09:30', 'close':'16:00'}]
    p._dispatch('fly-1', now)
    assert len(pool.jobs) == 1
    d = p.pending['fly-1']['decision']
    assert d['symbol'] == 'AAPL' and d['account']['equity'] == '9898.7885'
    assert d['account_context']['valid'] and d['account_context']['basis'] == 'isolated-v1'
    assert pool.jobs[0][1] == encode(bars[-1], bars[:-1], p.execution_account(), b.holdings[1])
    assert pool.jobs[0][1] != encode(bars[-1], bars[:-1], p.account, b.holdings[1])


def test_learning_accepts_only_new_audited_inputs_keeps_old_records_excluded(isolated, tmp_path):
    from tradefly.learning_lab import Lab
    e, b, _, _ = isolated
    for i, symbol, context in [('raw','AAPL',{}), ('safe','AAPL',e.account_context()), ('nct','NCT',e.account_context())]:
        d = {**decision(i), 'symbol':symbol, 'created_at':datetime.now(UTC).isoformat(), 'account_context':context,
             'bar':{'t':f'2026-09-20T15:{dict(raw="00",safe="05",nct="10")[i]}:00Z'},
             'neural':{'buy_hz':40, 'sell_hz':0, 'manifest_hash':'test', 'activity':{'neuron_ids':['1'], 'events':[[0,10]]}}}
        e.ledger.decision(d)
    lab = Lab(tmp_path/'learning', e.settings.database, b)
    lab.ingest()
    statuses = dict(lab.db.execute('select id,status from observations'))
    assert statuses == {'raw':'corporate_action', 'safe':'pending', 'nct':'quarantined'}
    state = e.ledger.get(ACTIONS)
    state['issues'].append({**state['issues'][0], 'id':'unreviewed-action'})
    e.ledger.set(ACTIONS,state);lab.ingest()
    assert lab.db.execute("select status from observations where id='safe'").fetchone()[0] == 'corporate_action'
    assert e.ledger.decision_count() == 3
    lab.close()


def test_approval_refuses_cash_from_post_action_trades(isolated):
    e, b, _, activity = isolated
    with e.ledger.db: e.ledger.db.execute('delete from settings where key=?',(KEY,))
    activity[1]['transaction_time'] = '2026-09-18T15:00:00Z'
    with pytest.raises(ValueError, match='Post-action trades'):
        approve(e, ['NCT'], 'Cannot accept phantom realized cash')
    assert e.ledger.get(KEY) is None
