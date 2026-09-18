"""Explicit, account-bound quarantine of a verified missing paper position.

This never fabricates fills, changes cash, or writes to the broker. Unknown or
changed discrepancies remain blocking. Quarantined symbols cannot be traded.
"""
import json
from .domain import number, digest, now_iso, instant, UTC
from datetime import datetime

KEY = 'position_quarantines_v1'
TOLERANCE = number('0.000001')


def symbol_orders(engine, symbol):
    return [row for row in engine.ledger.orders()
            if json.loads(row['payload']).get('symbol', engine.settings.symbol) == symbol]


def fingerprint(engine, symbol):
    return digest(json.dumps(symbol_orders(engine, symbol), sort_keys=True))


def holdings(engine):
    expected = {}
    for row in engine.ledger.orders():
        if not row['broker']:
            continue
        order = json.loads(row['broker'])
        symbol = order.get('symbol') or json.loads(row['payload']).get('symbol', engine.settings.symbol)
        expected[symbol] = expected.get(symbol, number(0)) + number(order.get('filled_qty') or 0) * (1 if order.get('side') == 'buy' else -1)
    actual = {p['symbol']: number(p['qty']) for p in engine.positions}
    return expected, actual


def checks(engine):
    expected, actual = holdings(engine)
    records = engine.ledger.get(KEY) or {}
    result = []
    for symbol in sorted(set(expected) | set(actual) | set(records)):
        e, a = expected.get(symbol, number(0)), actual.get(symbol, number(0))
        mismatch = abs(e - a) > TOLERANCE
        record = records.get(symbol)
        accepted = bool(record and record.get('account_hash') == engine.ledger.get('account_hash')
                        and record.get('orders_hash') == fingerprint(engine, symbol)
                        and number(record['expected_qty']) == e and number(record['broker_qty']) == a
                        and not any(o.get('symbol') == symbol for o in engine.open_orders))
        if mismatch or record:
            result.append({'symbol': symbol, 'expected_qty': str(e), 'broker_qty': str(a),
                           'quarantined': bool(record), 'blocking': mismatch and not accepted,
                           'status': 'quarantined' if mismatch and accepted else 'mismatch' if mismatch else 'returned',
                           'reason': record.get('reason') if record else 'Broker holdings disagree with recorded fills',
                           'recorded_at': record.get('at') if record else None})
    return result


def quarantine_missing(engine, symbol, reason):
    if not engine.paused:
        raise ValueError('Pause the worker before recovery')
    engine.refresh()
    if not engine.connected or engine.fatal:
        raise ValueError('A healthy, unchanged paper account is required')
    expected, actual = holdings(engine)
    e, a = expected.get(symbol, number(0)), actual.get(symbol, number(0))
    if e <= 0 or a != 0:
        raise ValueError('Recovery only supports a completely missing long position')
    if any(o.get('symbol') == symbol for o in engine.open_orders):
        raise ValueError('Resolve open orders first')
    rows = symbol_orders(engine, symbol)
    from .engine import TERMINAL
    for row in rows:
        live = engine.broker.order(row['client_id'])
        if row['status'] not in TERMINAL or not live or not row['broker']:
            raise ValueError('All recorded orders must have confirmed terminal outcomes')
        saved = json.loads(row['broker'])
        if any(str(saved.get(k)) != str(live.get(k)) for k in ('symbol', 'side', 'status', 'filled_qty', 'filled_avg_price')):
            raise ValueError('Broker order changed; investigate before recovery')
    record = {'symbol': symbol, 'expected_qty': str(e), 'broker_qty': str(a),
              'account_hash': engine.ledger.get('account_hash'), 'orders_hash': fingerprint(engine, symbol),
              'at': now_iso(), 'reason': reason,
              'note': 'No synthetic sale, cash adjustment or fill deletion; symbol excluded from execution.'}
    records = engine.ledger.get(KEY) or {}
    if symbol in records:
        raise ValueError('Symbol already quarantined; inspect the existing record')
    records[symbol] = record
    with engine.ledger.db:
        engine.ledger.db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (KEY, json.dumps(records)))
        engine.ledger.db.execute('INSERT INTO events(at,kind,data) VALUES(?,?,?)', (record['at'], 'position_quarantined', json.dumps({k: v for k, v in record.items() if k not in ('account_hash', 'orders_hash')})))
    return record


def release_returned(engine, symbol, reason):
    """Audited local review of a returned, buy-only position. Worker lock required.

    More complex cases (sales, transfers, splits) require separate reconciliation.
    Removing this exclusion never clears corporate-action or valuation warnings.
    """
    if not engine.paused or not reason.strip():
        raise ValueError('Pause the worker and provide a review reason')
    engine.refresh()
    records = engine.ledger.get(KEY) or {}
    record = records.get(symbol)
    if not record or not engine.connected or engine.fatal:
        raise ValueError('A quarantined position on a healthy paper account is required')
    if (record.get('account_hash') != engine.ledger.get('account_hash')
            or record.get('orders_hash') != fingerprint(engine, symbol)):
        raise ValueError('Account or recorded orders changed since quarantine')
    expected, actual = holdings(engine)
    qty = expected.get(symbol, number(0))
    if qty <= 0 or abs(qty - actual.get(symbol, number(0))) > TOLERANCE:
        raise ValueError('Returned broker quantity must match recorded fills')
    if any(o.get('symbol') == symbol for o in engine.open_orders):
        raise ValueError('Resolve open orders first')
    from .corporate_actions import report, input_affected
    actions = report(engine)
    if actions['status'] == 'unavailable' or any(i['symbol'] == symbol for i in actions['issues']):
        raise ValueError('Corporate-action evidence must be current and clear for this symbol')
    # report prioritizes known issues over unavailable feed status; check freshness too.
    state = engine.ledger.get('corporate_actions_v1') or {}
    if (state.get('status') != 'checked' or not state.get('checked_at')
            or (datetime.now(UTC) - instant(state['checked_at'])).total_seconds() >= 1800):
        raise ValueError('Refresh corporate-action evidence before review')
    from .engine import TERMINAL
    saved_orders = []
    for row in symbol_orders(engine, symbol):
        live = engine.broker.order(row['client_id'])
        saved = json.loads(row['broker']) if row['broker'] else None
        if row['status'] not in TERMINAL or not live or not saved:
            raise ValueError('Every recorded order needs a confirmed terminal outcome')
        fields = ('id', 'symbol', 'side', 'status', 'filled_qty', 'filled_avg_price')
        # Alpaca's REST order history can truncate the original nanosecond
        # timestamp to microseconds without changing the execution.
        same_time = (saved.get('filled_at') == live.get('filled_at') or
                     (saved.get('filled_at') and live.get('filled_at') and
                      instant(saved['filled_at']) == instant(live['filled_at'])))
        if not same_time or any(str(saved.get(k)) != str(live.get(k)) for k in fields):
            raise ValueError('Broker order changed; investigate before review')
        if number(saved.get('filled_qty') or 0) > 0:
            if saved.get('side') != 'buy' or not saved.get('filled_at'):
                raise ValueError('This review only supports unchanged buy-only holdings')
            saved_orders.append(saved)
    if not saved_orders:
        raise ValueError('No confirmed fills to reconcile')
    first = min((o['filled_at'] for o in saved_orders), key=instant)
    if input_affected(engine, symbol, first, now_iso()):
        raise ValueError('Share-changing events require a separate corporate-action audit')
    baseline = engine.ledger.get('baseline') or {}
    if not baseline.get('at') or instant(baseline['at']) > instant(first):
        raise ValueError('A baseline preceding the fills is required')
    activity = engine.broker.activities(baseline['at'])
    related = [a for a in activity if a.get('symbol') == symbol]
    ids = {o['id'] for o in saved_orders}
    if any(a.get('activity_type') != 'FILL' or a.get('order_id') not in ids
           or a.get('side') != 'buy' or number(a.get('qty')) <= 0
           or number(a.get('price')) <= 0 for a in related):
        raise ValueError('Untracked activity needs separate investigation')
    cost = number(0)
    for order in saved_orders:
        parts = [a for a in related if a.get('order_id') == order['id']]
        shares = sum((number(a['qty']) for a in parts), number(0))
        dollars = sum((number(a['qty']) * number(a['price']) for a in parts), number(0))
        if (abs(shares - number(order['filled_qty'])) > TOLERANCE
                or abs(dollars - number(order['filled_qty']) * number(order['filled_avg_price'])) > number('.02')):
            raise ValueError('Activity quantities or cash amounts disagree with recorded orders')
        cost += dollars
    engine.refresh()  # Catch changes during the broker audit before releasing anything.
    expected, actual = holdings(engine)
    position = next((p for p in engine.positions if p['symbol'] == symbol), {})
    if (fingerprint(engine, symbol) != record['orders_hash']
            or input_affected(engine, symbol, first, now_iso())
            or abs(actual.get(symbol, number(0)) - qty) > TOLERANCE
            or any(o.get('symbol') == symbol for o in engine.open_orders)
            or position.get('side') != 'long'
            or position.get('cost_basis') is None or position.get('avg_entry_price') is None
            or abs(number(position['cost_basis']) - cost) > number('.02')
            or abs(number(position['avg_entry_price']) * qty - cost) > number('.02')):
        raise ValueError('Current holdings and cost basis do not match the reviewed fills')
    review = {'symbol': symbol, 'at': now_iso(), 'reason': reason,
              'qty': str(qty), 'cost_basis': str(cost), 'activity_count': len(related),
              'activity_hash': digest(json.dumps(related, sort_keys=True)),
              'original_quarantine': record,
              'note': 'Exclusion released after broker/order/activity/basis review. Original fills, baseline and corporate-action evidence unchanged.'}
    del records[symbol]
    with engine.ledger.db:
        engine.ledger.db.execute('UPDATE settings SET value=? WHERE key=?', (json.dumps(records), KEY))
        engine.ledger.db.execute('INSERT INTO events(at,kind,data) VALUES(?,?,?)',
                                (review['at'], 'position_quarantine_released', json.dumps(review)))
    return review
