import json
from types import SimpleNamespace
import pytest
from tradefly.config import Settings
from tradefly.engine import Engine
from tradefly.reconciliation import checks, quarantine_missing, release_returned, KEY
from test_backend import FakeBroker, ASSET


def setup(tmp_path):
    broker = FakeBroker()
    engine = Engine(Settings(database=tmp_path/'paper.db'), broker=broker, brain=SimpleNamespace(ready=True))
    engine.refresh()
    payload = {'symbol': 'AAPL', 'side': 'buy', 'notional': '100', 'client_order_id': 'tf-test'}
    fill = {**payload, 'id': 'broker-test', 'status': 'filled', 'filled_qty': '5', 'filled_avg_price': '20'}
    engine.ledger.prepare_order('tf-test', 'decision-test', payload)
    engine.ledger.update_order('tf-test', 'filled', fill)
    broker.found['tf-test'] = fill
    return engine, broker


def test_explicit_quarantine_preserves_fills_and_blocks_execution(tmp_path):
    engine, broker = setup(tmp_path)
    before = engine.ledger.orders()
    assert checks(engine)[0]['blocking']
    quarantine_missing(engine, 'AAPL', 'Verified missing paper position; owner requested recovery')
    assert not checks(engine)[0]['blocking']
    assert engine.blockers() == []
    assert engine.ledger.orders() == before
    assert engine.paused
    engine.paused = False
    engine.submit_intent({'id': 'new', 'action': 'BUY', 'symbol': 'AAPL', 'bar': {'c': 20}}, {}, ASSET)
    assert broker.submissions == []
    assert engine.ledger.orders() == before
    assert engine.ledger.events()[0]['kind'] == 'execution_blocked'


def test_different_position_mismatch_still_blocks(tmp_path):
    engine, broker = setup(tmp_path)
    quarantine_missing(engine, 'AAPL', 'Investigated')
    broker.holdings = [{'symbol': 'MSFT', 'qty': '1'}]
    engine.refresh()
    assert any(c['symbol'] == 'MSFT' and c['blocking'] for c in checks(engine))
    assert 'Broker holdings disagree with Tradefly fills' in engine.blockers()


@pytest.mark.parametrize('change', ['quantity', 'order', 'account', 'open_order'])
def test_changed_quarantined_evidence_still_blocks(tmp_path, change):
    engine, broker = setup(tmp_path)
    quarantine_missing(engine, 'AAPL', 'Investigated')
    if change == 'quantity': engine.positions = [{'symbol': 'AAPL', 'qty': '2'}]
    if change == 'order': engine.ledger.update_order('tf-test', 'canceled')
    if change == 'account': engine.ledger.set('account_hash', 'other-account')
    if change == 'open_order': engine.open_orders = [{'symbol': 'AAPL', 'client_order_id': 'tf-test'}]
    assert checks(engine)[0]['blocking']


def test_returned_position_stays_excluded_and_survives_restart(tmp_path):
    engine, broker = setup(tmp_path)
    quarantine_missing(engine, 'AAPL', 'Investigated')
    broker.holdings = [{'symbol': 'AAPL', 'qty': '5'}]
    engine.refresh()
    assert checks(engine)[0]['status'] == 'returned'
    assert checks(engine)[0]['quarantined']
    engine.ledger.close()
    restarted = Engine(Settings(database=tmp_path/'paper.db'), broker=broker)
    restarted.refresh()
    assert checks(restarted)[0]['status'] == 'returned'
    assert restarted.ledger.get(KEY)['AAPL']['expected_qty'] == '5'


@pytest.mark.parametrize('invalid', ['running', 'partial', 'open', 'broker_changed'])
def test_recovery_rejects_unverified_state(tmp_path, invalid):
    engine, broker = setup(tmp_path)
    if invalid == 'running': engine.paused = False
    if invalid == 'partial': broker.holdings = [{'symbol': 'AAPL', 'qty': '2'}]
    if invalid == 'open': broker.open_orders = lambda: [{'symbol': 'AAPL', 'client_order_id': 'tf-test'}]
    if invalid == 'broker_changed': broker.found['tf-test']['filled_qty'] = '6'
    with pytest.raises(ValueError): quarantine_missing(engine, 'AAPL', 'Investigated')
    assert engine.ledger.get(KEY) is None


def returned_position(tmp_path):
    engine, broker = setup(tmp_path)
    fill = {**broker.found['tf-test'], 'filled_at': '2026-09-16T15:00:00.011551234Z'}
    broker.found['tf-test'] = {**fill, 'filled_at': '2026-09-16T15:00:00.011551Z'}
    engine.ledger.update_order('tf-test', 'filled', fill)
    engine.ledger.set('baseline', {'equity': '10000', 'at': '2026-09-14T00:00:00Z'})
    quarantine_missing(engine, 'AAPL', 'Verified missing holding')
    broker.holdings = [{'symbol': 'AAPL', 'qty': '5', 'side': 'long',
                        'cost_basis': '100', 'avg_entry_price': '20'}]
    activity = [{'id': 'a', 'activity_type': 'FILL', 'order_id': 'broker-test',
                 'symbol': 'AAPL', 'side': 'buy', 'qty': '3', 'price': '20'},
                {'id': 'b', 'activity_type': 'FILL', 'order_id': 'broker-test',
                 'symbol': 'AAPL', 'side': 'buy', 'qty': '2', 'price': '20'}]
    broker.activities = lambda after: activity
    return engine, broker, activity


def test_returned_review_releases_only_verified_symbol_and_keeps_audit(tmp_path):
    engine, broker, _ = returned_position(tmp_path)
    from tradefly.corporate_actions import KEY as ACTIONS
    state = engine.ledger.get(ACTIONS)
    state['issues'] = [{'id': 'other', 'symbol': 'NCT', 'effective_at': '2026-09-17T04:00:00Z'}]
    engine.ledger.set(ACTIONS, state)
    original = engine.ledger.orders(), engine.ledger.get('baseline')
    review = release_returned(engine, 'AAPL', 'Owner requested review')
    assert checks(engine) == [] and engine.ledger.get(KEY) == {}
    assert review['activity_count'] == 2 and review['cost_basis'] == '100'
    assert review['original_quarantine']['symbol'] == 'AAPL'
    assert original == (engine.ledger.orders(), engine.ledger.get('baseline'))
    assert engine.ledger.events()[0]['kind'] == 'position_quarantine_released'
    assert engine.ledger.get(ACTIONS)['issues'] == state['issues']
    assert any('Corporate-action' in b for b in engine.blockers())
    assert engine.paused and broker.submissions == []
    engine.ledger.close()
    restarted = Engine(engine.settings, broker=broker)
    restarted.refresh()
    assert checks(restarted) == []


@pytest.mark.parametrize('change', ['running', 'quantity', 'cost', 'order', 'activity', 'extra', 'corporate', 'open'])
def test_returned_review_rejects_incomplete_or_changed_evidence(tmp_path, change):
    engine, broker, activity = returned_position(tmp_path)
    original = engine.ledger.get(KEY)
    if change == 'running': engine.paused = False
    if change == 'quantity': broker.holdings[0]['qty'] = '6'
    if change == 'cost': broker.holdings[0]['cost_basis'] = '80'
    if change == 'order': broker.found['tf-test'] = {**broker.found['tf-test'], 'filled_qty': '6'}
    if change == 'activity': activity.pop()
    if change == 'extra': activity.append({'id': 'x', 'symbol': 'AAPL', 'activity_type': 'SPLIT'})
    if change == 'corporate':
        state = engine.ledger.get('corporate_actions_v1')
        state['issues'] = [{'id': 'split', 'symbol': 'AAPL', 'effective_at': '2026-09-17T04:00:00Z'}]
        engine.ledger.set('corporate_actions_v1', state)
    if change == 'open': broker.open_orders = lambda: [{'symbol': 'AAPL', 'client_order_id': 'tf-test'}]
    with pytest.raises(ValueError): release_returned(engine, 'AAPL', 'Review requested')
    assert engine.ledger.get(KEY) == original and broker.submissions == []


def test_activity_audit_paginates_and_rejects_repeated_pages():
    import httpx
    from tradefly.alpaca import Alpaca
    calls = []
    page = [{'id': str(i)} for i in range(100)]
    def handler(request):
        calls.append(request)
        assert request.method == 'GET'
        return httpx.Response(200, json=page if len(calls) == 1 else [{'id': 'last'}])
    broker = Alpaca(Settings(), transport=httpx.MockTransport(handler))
    assert len(broker.activities('2026-09-14')) == 101
    assert calls[1].url.params['page_token'] == '99'
    broker.close()
    broker = Alpaca(Settings(), transport=httpx.MockTransport(lambda _: httpx.Response(200, json=page)))
    with pytest.raises(ValueError, match='repeated'): broker.activities('2026-09-14')
    broker.close()
