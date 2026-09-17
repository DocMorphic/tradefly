import json
from types import SimpleNamespace
import pytest
from tradefly.config import Settings
from tradefly.engine import Engine
from tradefly.reconciliation import checks, quarantine_missing, KEY
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
