"""Neural-only associative readout with delayed, outcome-modulated plasticity.

Engineered fly-inspired memory, not reconstructed mushroom-body synapses.
No broker mutation, market features, symbol IDs or future labels enter predict().
"""
import hashlib
import math
import numpy as np

VERSION = 'associative-neural-v1'
DIM = 37
COST_BPS = 20.0
STRESS_BPS = 40.0
HORIZON_BARS = 6


def features(neural):
    activity = neural.get('activity') or {}
    ids, events = activity.get('neuron_ids', []), activity.get('events', [])
    if not ids or not events:
        return None
    x = np.zeros(DIM, dtype=float)
    x[0] = 1
    for i, key, scale in [(1, 'buy_hz', 100), (2, 'sell_hz', 100), (3, 'active_neurons', 10000), (4, 'spikes', 100000)]:
        v = float(neural.get(key, 0))
        if not math.isfinite(v) or v < 0:
            raise ValueError('Invalid neural observation')
        x[i] = math.tanh(v / scale)
    for event in events:
        index = event[0]
        if not isinstance(index, int) or not 0 <= index < len(ids):
            raise ValueError('Invalid recorded neuron index')
        bucket = int.from_bytes(hashlib.sha256(str(ids[index]).encode()).digest()[:4], 'big') % 32
        x[5 + bucket] += 1
    x[5:] /= len(events)
    norm = np.linalg.norm(x[1:])
    if norm:
        x[1:] /= norm
    return x.tolist()


class Memory:
    def __init__(self, state=None):
        self.fast = np.array(state['fast'] if state else [0.] * DIM, dtype=float)
        self.slow = np.array(state['slow'] if state else [0.] * DIM, dtype=float)
        self.updates = state.get('updates', 0) if state else 0
        if self.fast.shape != (DIM,) or self.slow.shape != (DIM,) or not np.isfinite(self.fast).all() or not np.isfinite(self.slow).all():
            raise ValueError('Invalid memory checkpoint')

    def predict(self, x):
        x = np.asarray(x, dtype=float)
        if x.shape != (DIM,) or not np.isfinite(x).all():
            raise ValueError('Invalid eligibility vector')
        return float(np.clip(np.dot(self.fast + self.slow, x), -1, 1) * 100)

    def learn(self, eligibility, gross_bps):
        # Eligibility is the neural pattern captured BEFORE the observed outcome.
        x = np.asarray(eligibility, dtype=float)
        before = self.predict(x)
        target = float(np.clip(gross_bps / 100, -1, 1))
        if not math.isfinite(target):
            raise ValueError('Invalid reward')
        error = target - before / 100
        delta = error * x / max(float(np.dot(x, x)), 1)
        self.fast = np.clip(.995 * self.fast + .08 * delta, -1, 1)
        self.slow = np.clip(.9999 * self.slow + .008 * delta, -1, 1)
        self.updates += 1
        return {'prediction_before_bps': before, 'prediction_after_bps': self.predict(x),
                'reward_bps': gross_bps, 'prediction_error_bps': error * 100,
                'weight_norm': float(np.linalg.norm(self.fast + self.slow))}

    def dump(self):
        return {'fast': self.fast.tolist(), 'slow': self.slow.tolist(), 'updates': self.updates}


def action(score):
    if score > COST_BPS + 5:
        return 'BUY'
    if score < -COST_BPS - 5:
        return 'SELL'
    return 'HOLD'


def target(action_name, held):
    return 1 if action_name == 'BUY' or (action_name == 'HOLD' and held) else 0


def summarize(values):
    return {'count': len(values), 'mean_bps': float(np.mean(values)) if values else 0,
            'win_rate': sum(v > 0 for v in values) / len(values) if values else 0,
            'total_hypothetical_usd': sum(values) / 100}


def evaluate(rows, cutoff):
    """Frozen chronological holdout + separate causal, delayed shadow learning.

Rows are independent $100 opportunities; sums are NOT portfolio returns.
Frozen training excludes every label unavailable before cutoff.
"""
    rows = sorted(rows, key=lambda r: (r['decision_at'], r['id']))
    train = [r for r in rows if r['available_at'] < cutoff]
    test = [r for r in rows if r['decision_at'] >= cutoff]
    models, ablated, shadow = {}, {}, {}
    for r in sorted(train, key=lambda r: (r['available_at'], r['id'])):
        models.setdefault(r['fly'], Memory()).learn(r['x'], r['gross_bps'])
        ablated.setdefault(r['fly'], Memory()).learn([1.] + [0.] * (DIM - 1), r['gross_bps'])
    curves, scores = [], {k: [] for k in ('learner', 'original', 'cash', 'always_long', 'momentum', 'no_neural')}
    stressed, signals = [], {'BUY': 0, 'SELL': 0, 'HOLD': 0}
    for r in test:
        prediction = models.get(r['fly'], Memory()).predict(r['x'])
        chosen = action(prediction)
        signals[chosen] += 1
        controls = {'learner': target(chosen, r['held']), 'original': target(r['original'], r['held']),
                    'cash': 0, 'always_long': 1, 'momentum': int(r['momentum'] > 0),
                    'no_neural': target(action(ablated.get(r['fly'], Memory()).predict([1.] + [0.] * (DIM - 1))), r['held'])}
        for name, exposure in controls.items():
            scores[name].append(exposure * (r['gross_bps'] - COST_BPS))
        stressed.append(controls['learner'] * (r['gross_bps'] - STRESS_BPS))
        curves.append({'at': r['decision_at'], 'symbol': r['symbol'], 'prediction_bps': prediction,
                       'action': chosen, 'outcome_bps': scores['learner'][-1],
                       'learner': sum(scores['learner']) / len(scores['learner']),
                       'original': sum(scores['original']) / len(scores['original']),
                       'always_long': sum(scores['always_long']) / len(scores['always_long'])})
    # Replay decision and delayed-outcome events in availability order. At a tie,
    # predict before learning. A later label can never change an earlier prediction.
    predictions, updates, timeline = {}, [], []
    for r in rows:
        timeline.extend([(r['decision_at'], 0, r), (r['available_at'], 1, r)])
    for at, kind, r in sorted(timeline, key=lambda e: (e[0], e[1], e[2]['id'])):
        model = shadow.setdefault(r['fly'], Memory())
        if kind == 0:
            predictions[r['id']] = model.predict(r['x'])
        else:
            update = model.learn(r['x'], r['gross_bps'])
            updates.append({**update, 'at': at, 'symbol': r['symbol'], 'fly': r['fly'],
                            'decision_prediction_bps': predictions[r['id']]})
    metrics = {k: summarize(v) for k, v in scores.items()}
    days, symbols = len({r['market_date'] for r in test}), len({r['symbol'] for r in test})
    quarters = [list(v) for v in np.array_split(np.array(scores['learner']), 4)]
    requirements = [
        {'label': '200 held-out observations', 'passed': len(test) >= 200, 'value': len(test)},
        {'label': '10 held-out trading days', 'passed': days >= 10, 'value': days},
        {'label': '10 held-out symbols', 'passed': symbols >= 10, 'value': symbols},
        {'label': 'Positive after 20 bp costs', 'passed': metrics['learner']['mean_bps'] > 0},
        {'label': 'Positive after 40 bp costs', 'passed': summarize(stressed)['mean_bps'] > 0},
        {'label': 'Beats every comparison, including no-neural input', 'passed': all(metrics['learner']['mean_bps'] > v['mean_bps'] for k, v in metrics.items() if k != 'learner')},
        {'label': 'Positive in 3 of 4 chronological quarters', 'passed': sum(bool(q) and float(np.mean(q)) > 0 for q in quarters) >= 3},
    ]
    return {'version': VERSION, 'training_count': len(train), 'heldout_count': len(test), 'heldout_days': days,
            'heldout_symbols': symbols, 'cutoff': cutoff, 'metrics': metrics, 'stress': summarize(stressed),
            'signals': signals, 'curve': curves, 'updates': updates[-40:], 'update_count': len(updates),
            'requirements': requirements, 'eligible': all(r['passed'] for r in requirements),
            'models': {k: v.dump() for k, v in models.items()},
            'shadow_models': {k: v.dump() for k, v in shadow.items()},
            'shadow_predictions': predictions}
