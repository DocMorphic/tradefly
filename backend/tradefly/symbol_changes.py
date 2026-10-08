"""Reviewed one-for-one ticker changes, without rewriting original fills.

Only unchanged-CUSIP, buy-only histories are supported at approval. Subsequent
trades use the new symbol; cash and moving-average basis still require audit.
"""
import json
from datetime import datetime
from .domain import UTC, instant, now_iso, number
from .reconciliation import fingerprint, symbol_orders

KEY = 'symbol_changes_v1'


def active(engine):
    events = {e['id']: e for e in (engine.ledger.get('corporate_actions_v1') or {}).get('events', [])}
    result = {}
    for source, review in (engine.ledger.get(KEY) or {}).items():
        if (review['account_hash'] == engine.ledger.get('account_hash')
                and events.get(review['event']['id']) == review['event']
                and fingerprint(engine, source) == review['orders_hash']
                and not any(p['symbol'] == source and number(p['qty']) != 0 for p in engine.positions)
                and not any(o.get('symbol') == source for o in engine.open_orders)):
            result[source] = review
    return result


def mapped(symbol, at, reviews):
    from .corporate_actions import effective
    review = reviews.get(symbol)
    if review and at and instant(at) < effective(review['event']):
        return review['event']['new_symbol']
    return symbol


def approve(engine, source, target, reason):
    """Explicit offline review; caller holds worker.lock and a ledger backup."""
    from .corporate_actions import effective
    from .engine import TERMINAL
    if not engine.paused or not reason.strip():
        raise ValueError('Pause and provide a review reason')
    engine.refresh()
    state = engine.ledger.get('corporate_actions_v1') or {}
    records = engine.ledger.get(KEY) or {}
    if (not engine.connected or engine.fatal or state.get('status') != 'checked' or not state.get('checked_at')
            or not 0 <= (datetime.now(UTC)-instant(state['checked_at'])).total_seconds() < 1800):
        raise ValueError('Healthy broker and corporate-action feed required')
    if engine.open_orders or any(r['status'] not in TERMINAL for r in engine.ledger.orders()):
        raise ValueError('Resolve all open orders first')
    if source in records or target in records or any(r['event']['new_symbol'] in (source, target) for r in records.values()):
        raise ValueError('Chained or overlapping ticker reviews require separate reconciliation')
    candidates = [e for e in state.get('events', []) if e['type'] == 'name_change'
                  and e['symbol'] == source and e.get('new_symbol') == target]
    if len(candidates) != 1:
        raise ValueError('Exactly one matching broker name-change event required')
    event = candidates[0]
    if (not event.get('old_cusip') or event['old_cusip'] != event.get('new_cusip')
            or source == target or effective(event) > instant(now_iso())):
        raise ValueError('Only effective, unchanged-CUSIP ticker changes are supported')
    if symbol_orders(engine, target):
        raise ValueError('Existing destination history requires separate reconciliation')
    rows = symbol_orders(engine, source)
    if not rows: raise ValueError('No original orders to reconcile')
    saved_fingerprint = fingerprint(engine, source)
    orders = {}
    for row in rows:
        saved = json.loads(row['broker']) if row['broker'] else None
        live = engine.broker.order(row['client_id'])
        if not saved or not live or saved.get('symbol') != source or any(str(saved.get(k)) != str(live.get(k)) for k in
                                       ('id', 'symbol', 'side', 'status', 'filled_qty', 'filled_avg_price')):
            raise ValueError('Original broker orders changed')
        if number(saved.get('filled_qty') or 0) > 0:
            if saved['side'] != 'buy' or not saved.get('filled_at') or instant(saved['filled_at']) >= effective(event):
                raise ValueError('Only pre-change buy-only histories are supported')
            orders[saved['id']] = saved
    if not orders: raise ValueError('No original fills to reconcile')
    first = min(instant(o['filled_at']) for o in orders.values())
    if any(e['id'] != event['id'] and e['symbol'] in (source, target)
           and first <= effective(e) <= instant(now_iso()) for e in state.get('events', [])):
        raise ValueError('Other corporate actions require separate reconciliation')
    activity = engine.broker.activities('1970-01-01T00:00:00Z')
    related = [a for a in activity if a.get('symbol') in (source, target)]
    if any(a.get('activity_type') != 'FILL' or a.get('symbol') != source
           or a.get('order_id') not in orders or a.get('side') != 'buy'
           or number(a.get('qty')) <= 0 or number(a.get('price')) <= 0
           or instant(a['transaction_time']) >= effective(event) for a in related):
        raise ValueError('Unreviewed ticker activity requires separate reconciliation')
    qty, cost = number(0), number(0)
    for oid, order in orders.items():
        parts = [a for a in related if a['order_id'] == oid]
        q = sum((number(a['qty']) for a in parts), number(0))
        c = sum((number(a['qty']) * number(a['price']) for a in parts), number(0))
        if abs(q-number(order['filled_qty'])) > number('.000001') or abs(c-q*number(order['filled_avg_price'])) > number('.02'):
            raise ValueError('Original activity disagrees with recorded fills')
        qty += q; cost += c
    engine.refresh()
    position = next((p for p in engine.positions if p['symbol'] == target), {})
    if (fingerprint(engine, source) != saved_fingerprint or engine.open_orders
            or any(p['symbol'] == source for p in engine.positions)
            or position.get('side') != 'long' or qty <= 0
            or abs(number(position.get('qty', 0))-qty) > number('.000001')
            or abs(number(position.get('cost_basis', 0))-cost) > number('.02')
            or abs(number(position.get('avg_entry_price', 0))*qty-cost) > number('.02')
            or event not in (engine.ledger.get('corporate_actions_v1') or {}).get('events', [])
            or activity != engine.broker.activities('1970-01-01T00:00:00Z')):
        raise ValueError('Current broker evidence does not match the proposed ticker mapping')
    record = {'event': event, 'at': now_iso(), 'reason': reason,
              'account_hash': engine.ledger.get('account_hash'), 'orders_hash': saved_fingerprint,
              'qty': str(qty), 'cost_basis': str(cost)}
    records[source] = record
    with engine.ledger.db:
        engine.ledger.db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (KEY, json.dumps(records)))
        engine.ledger.db.execute('INSERT INTO events(at,kind,data) VALUES(?,?,?)', (record['at'], 'symbol_change_reviewed', json.dumps(record)))
    return record
