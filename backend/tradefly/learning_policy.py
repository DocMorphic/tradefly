"""Owner-selected, frozen learned decoder. The shadow learner cannot self-promote."""
import json
import hashlib
from datetime import datetime, timedelta
from .domain import UTC, instant, decode
from .learning import VERSION, Memory, features, action
from .learning_lab import atomic


def directory(engine):
    return engine.settings.database.parent/'learning'


def report(engine):
    path = directory(engine)/'report.json'
    if not path.exists():
        return {'status': 'Starting learning service', 'eligible': False, 'mode': engine.ledger.get('decoder_mode') or 'original'}
    try:
        value = json.loads(path.read_text())
        value['mode'] = engine.ledger.get('decoder_mode') or 'original'
        value['active_candidate'] = engine.ledger.get('decoder_candidate')
        return value
    except (ValueError, OSError):
        return {'status': 'Learning report unavailable', 'eligible': False, 'mode': engine.ledger.get('decoder_mode') or 'original'}


def select(engine, mode):
    if mode not in ('original', 'learned', 'shadow'):
        raise ValueError('Unknown decoder')
    if not engine.paused:
        raise ValueError('Pause trading before changing the decoder')
    if mode == 'learned':
        r = report(engine)
        if not r.get('eligible') or datetime.now(UTC)-instant(r['updated_at']) > timedelta(minutes=5):
            raise ValueError('The learner has not passed a fresh held-out evaluation')
        candidate = json.loads((directory(engine)/'candidate.json').read_text())
        supplied = candidate.pop('id')
        if hashlib.sha256(json.dumps(candidate, sort_keys=True).encode()).hexdigest() != supplied:
            raise ValueError('Candidate integrity check failed')
        candidate['id'] = supplied
        if candidate.get('version') != VERSION or not candidate.get('eligible') or supplied != r.get('candidate_id'):
            raise ValueError('Candidate and evaluation do not match')
        if not engine.brain or candidate['manifest_hash'] != engine.brain.manifest_hash:
            raise ValueError('Candidate was trained on a different brain')
        atomic(directory(engine)/'active.json', candidate)
        engine.ledger.set('decoder_candidate', supplied)
    engine.ledger.set('decoder_mode', mode)
    engine.ledger.event('decoder_selected', {'mode': mode, 'candidate': engine.ledger.get('decoder_candidate') if mode == 'learned' else None})
    engine.message = f'{mode.capitalize()} decoder selected; trading remains paused'


def decide(engine, decision):
    neural = decision['neural']
    original, reason = decode(neural['buy_hz'], neural['sell_hz'])
    decision['original_action'] = original
    mode = engine.ledger.get('decoder_mode') or 'original'
    if mode == 'shadow':
        # Adaptive proposals are visible, but submit_intent blocks ALL orders.
        try:
            memory = json.loads((directory(engine)/'shadow.json').read_text())
            x = features(neural)
            state = memory['models'].get(decision.get('fly_id', 'fly-1'))
            if memory.get('version') != VERSION or memory.get('manifest_hash') != neural.get('manifest_hash') or x is None or state is None:
                raise ValueError('Memory warming up')
            score = Memory(state).predict(x)
            decision.update({'action': action(score), 'reason': f'Training-only fly memory predicts {score:.1f} bp over 30 minutes; no broker order',
                             'learning': {'prediction_bps': score, 'version': VERSION, 'frozen': False, 'training_only': True}})
        except (OSError, ValueError, KeyError, TypeError):
            decision['action'], decision['reason'] = 'HOLD', 'Training-only memory warming up; collecting neural experience'
        return
    if mode != 'learned':
        decision['action'], decision['reason'] = original, reason
        return
    try:
        candidate = json.loads((directory(engine)/'active.json').read_text())
        if candidate.get('id') != engine.ledger.get('decoder_candidate') or candidate.get('version') != VERSION or candidate.get('manifest_hash') != neural.get('manifest_hash'):
            raise ValueError('Decoder checkpoint mismatch')
        state = candidate['models'].get(decision.get('fly_id', 'fly-1'))
        x = features(neural)
        if state is None or x is None:
            raise ValueError('No validated neural pattern or trained fly memory')
        score = Memory(state).predict(x)
        decision.update({'action': action(score), 'reason': f'Fly-inspired learned readout: {score:.1f} bp expected 30-minute move; 25 bp action threshold',
                         'learning': {'candidate': candidate['id'], 'prediction_bps': score, 'version': VERSION, 'frozen': True}})
    except (OSError, ValueError, KeyError, TypeError):
        engine.pause('Learned decoder unavailable; restore original mode or valid memory')
        decision['action'], decision['reason'] = 'HOLD', 'Learned decoder unavailable'
