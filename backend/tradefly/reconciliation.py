"""Explicit, account-bound quarantine of a verified missing paper position.

This never fabricates fills, changes cash, or writes to the broker. Unknown or
changed discrepancies remain blocking. Quarantined symbols cannot be traded.
"""
import json
from .domain import number, digest, now_iso

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
