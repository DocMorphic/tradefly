import json
from datetime import datetime, timedelta
from types import SimpleNamespace
import numpy as np
import pytest
from tradefly.learning import Memory, DIM, features, evaluate, action, target
from tradefly.learning_lab import label, Lab
from tradefly.learning_policy import select, decide
from tradefly.domain import UTC
from test_backend import make_engine, decision, ASSET


def row(i, at, reward=30, fly='fly-1'):
    return {'id': str(i), 'fly': fly, 'symbol': 'AAPL', 'decision_at': at,
            'available_at': (datetime.fromisoformat(at)+timedelta(minutes=50)).isoformat(),
            'market_date': at[:10], 'x': [1., 1.] + [0.]*(DIM-2),
            'held': False, 'original': 'HOLD', 'momentum': 1, 'gross_bps': reward}


def test_reward_changes_only_eligible_pattern_and_survives_serialization():
    memory = Memory()
    x = [1., 1.] + [0.]*(DIM-2)
    assert memory.predict(x) == 0
    for _ in range(80): memory.learn(x, 80)
    assert memory.predict(x) > 50
    assert action(memory.predict(x)) == 'BUY'
    restored = Memory(memory.dump())
    assert restored.predict(x) == memory.predict(x)
    for _ in range(100): restored.learn(x, -80)
    assert action(restored.predict(x)) == 'SELL'
    assert target('SELL', True) == 0
    assert target('HOLD', False) == 0
    assert target('HOLD', True) == 1
    assert np.isfinite(restored.fast).all()
    assert abs(restored.fast).max() <= 1


def test_no_fake_learning_without_neural_trace():
    assert features({'buy_hz': 40, 'sell_hz': 20}) is None
    n = {'buy_hz': 40, 'sell_hz': 20, 'spikes': 100, 'active_neurons': 10,
         'activity': {'neuron_ids': ['100','200'], 'events': [[0, 10], [1, 20]]}}
    x = features(n)
    assert len(x) == DIM and x == features(n)
    assert x == features({**n, 'future_price': 100000, 'symbol': 'SECRET'})
    with pytest.raises(ValueError): features({**n, 'buy_hz': float('nan')})


def test_heldout_labels_cannot_change_frozen_candidate():
    data = [row(1, '2026-09-15T14:00:00+00:00'), row(2, '2026-09-16T14:00:00+00:00')]
    cutoff = '2026-09-16T04:00:00+00:00'
    first = evaluate(data, cutoff)
    changed = evaluate([data[0], {**data[1], 'gross_bps': -900}], cutoff)
    assert first['models'] == changed['models']
    assert first['curve'][0]['prediction_bps'] == changed['curve'][0]['prediction_bps']
    assert not first['eligible']


def test_training_labels_crossing_cutoff_are_embargoed():
    r = row(1, '2026-09-15T23:50:00+00:00')
    result = evaluate([r], '2026-09-16T00:00:00+00:00')
    assert result['training_count'] == result['heldout_count'] == 0


def test_shadow_never_learns_an_unavailable_future_outcome():
    a = row('a', '2026-09-15T14:00:00+00:00', 90)
    b = row('b', '2026-09-15T14:05:00+00:00', -90)
    c = row('c', '2026-09-15T15:00:00+00:00', 0)
    r = evaluate([a,b,c], '2026-09-16T00:00:00+00:00')
    assert r['shadow_predictions']['a'] == r['shadow_predictions']['b'] == 0
    assert r['shadow_predictions']['c'] != 0
    assert r == evaluate([a,b,c], '2026-09-16T00:00:00+00:00'), 'Replay must be deterministic, not double-learned'


def bars():
    start = datetime(2026,9,15,14,5,tzinfo=UTC)
    return [{'t': (start+timedelta(minutes=5*i)).isoformat(), 'o':100, 'c':101} for i in range(6)]


def test_outcomes_use_next_open_contiguous_bars_and_delayed_availability():
    r = row(1, '2026-09-15T14:00:01+00:00')
    assert label(r, bars(), datetime(2026,9,15,14,50,tzinfo=UTC)) is None
    valid = label(r, bars(), datetime(2026,9,15,14,51,tzinfo=UTC))
    assert valid['entry_at'] == '2026-09-15T14:05:00+00:00'
    assert valid['exit_at'] == '2026-09-15T14:35:00+00:00'
    assert valid['gross_bps'] == pytest.approx(100)
    assert label(r, bars()[1:], datetime(2026,9,16,tzinfo=UTC)) is None
    gap = bars(); gap[2]['t'] = '2026-09-15T14:16:00+00:00'
    assert label(r, gap, datetime(2026,9,16,tzinfo=UTC)) is None


def test_training_mode_cannot_submit_and_unqualified_candidate_cannot_activate(tmp_path):
    engine = make_engine(tmp_path)
    engine.paused = True
    select(engine, 'shadow')
    engine.paused = False
    engine.submit_intent(decision(), {}, ASSET)
    assert engine.broker.submissions == []
    engine.paused = True
    with pytest.raises(ValueError): select(engine, 'learned')
    select(engine, 'original')
    assert engine.ledger.get('decoder_mode') == 'original'


def test_missing_active_decoder_fails_to_hold_and_pause(tmp_path):
    engine = make_engine(tmp_path)
    engine.ledger.set('decoder_mode', 'learned')
    d = {'neural': {'buy_hz': 50, 'sell_hz': 0}}
    decide(engine,d)
    assert d['original_action'] == 'BUY'
    assert d['action'] == 'HOLD' and engine.paused


def test_lab_ingest_is_idempotent_and_excludes_quarantine(tmp_path):
    engine = make_engine(tmp_path)
    d = decision();d.update(symbol='AAPL', created_at='2026-09-15T14:00:00+00:00',
        neural={'buy_hz':40,'sell_hz':0,'manifest_hash':'test','activity':{'neuron_ids':['1'], 'events':[[0,10]]}})
    engine.ledger.decision(d)
    engine.ledger.set('position_quarantines_v1', {'AAPL': {'reason':'test'}})
    lab=Lab(tmp_path/'learning',engine.settings.database,engine.broker)
    lab.ingest();lab.ingest()
    assert lab.db.execute('SELECT COUNT(*) FROM observations').fetchone()[0] == 1
    assert lab.db.execute('SELECT status FROM observations').fetchone()[0] == 'quarantined'
    assert lab.report('test')['eligible'] is False
    lab.close()


def test_each_fly_has_independent_associative_memory():
    data = [row(1,'2026-09-15T14:00:00+00:00',80,'fly-1'),row(2,'2026-09-15T14:00:00+00:00',-80,'fly-2')]
    r=evaluate(data,'2026-09-16T00:00:00+00:00')
    x=data[0]['x']
    assert Memory(r['models']['fly-1']).predict(x)>0
    assert Memory(r['models']['fly-2']).predict(x)<0


def test_original_mode_keeps_existing_neural_decoder(tmp_path):
    engine=make_engine(tmp_path)
    d={'neural': {'buy_hz':0,'sell_hz':50}}
    decide(engine,d)
    assert d['action']==d['original_action']=='SELL'


def test_shadow_predictions_use_saved_neural_memory_but_never_place_orders(tmp_path):
    from tradefly.learning import VERSION
    from tradefly.learning_lab import atomic
    engine = make_engine(tmp_path)
    engine.ledger.set('decoder_mode', 'shadow')
    neural = {'buy_hz': 40, 'sell_hz': 0, 'manifest_hash': 'test',
              'activity': {'neuron_ids': ['1'], 'events': [[0, 10]]}}
    d = {'id': 'shadow-test', 'symbol': 'AAPL', 'neural': neural, 'fly_id': 'fly-1'}
    decide(engine, d)
    assert d['action'] == 'HOLD' and 'warming up' in d['reason']
    memory = Memory()
    for _ in range(80): memory.learn(features(neural), -80)
    atomic(tmp_path/'learning/shadow.json', {'version': VERSION,
        'manifest_hash': 'test', 'models': {'fly-1': memory.dump()}})
    decide(engine, d)
    assert d['original_action'] == 'BUY' and d['action'] == 'SELL'
    assert d['learning']['training_only'] and not d['learning']['frozen']
    engine.paused = False
    engine.submit_intent(d, {}, ASSET)
    assert engine.broker.submissions == []


def test_candidate_epochs_advance_on_fixed_calendar_not_performance():
    from tradefly.learning_lab import evaluation_cutoff
    anchor = '2026-09-16T04:00:00+00:00'
    assert evaluation_cutoff(anchor, datetime(2026, 10, 13, 12, tzinfo=UTC)) == anchor
    assert evaluation_cutoff(anchor, datetime(2026, 10, 14, 12, tzinfo=UTC)) == '2026-10-14T04:00:00+00:00'
    assert evaluation_cutoff(anchor, datetime(2026, 11, 11, 12, tzinfo=UTC)) == '2026-11-11T05:00:00+00:00'
