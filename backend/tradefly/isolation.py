"""Owner-reviewed corporate-action isolation, never a broker balance correction.

Only unchanged, explicitly reviewed split holdings may be isolated. Cash and
unaffected quantities/bases must reconcile against complete account activity on
every refresh. Unknown adjustments or changed evidence fail closed.
"""
from collections import defaultdict
from datetime import datetime
import json
from .alpaca import BrokerError
from .domain import UTC, digest, instant, now_iso, number
from .reconciliation import fingerprint

KEY = 'corporate_isolation_v1'
QTY_EPS = number('.000001')
CASH_EPS = number('.02')
MAX_AGE = 30


def hashed(value):
    return digest(json.dumps(value, sort_keys=True))


def issue_signature(engine):
    fields = ('id', 'symbol', 'type', 'date', 'old_rate', 'new_rate', 'pre_action_qty')
    issues = (engine.ledger.get('corporate_actions_v1') or {}).get('issues', [])
    return sorted([{k: i.get(k) for k in fields} for i in issues], key=lambda i: i['id'])


def position_signature(position):
    return {k: position.get(k) for k in ('symbol', 'side', 'qty', 'cost_basis', 'avg_entry_price')}


def binding(engine):
    return hashed([engine.account, engine.positions, engine.open_orders, engine.ledger.orders(),
                   engine.ledger.get('account_hash'), engine.ledger.get('baseline'),
                   engine.ledger.get('corporate_actions_v1'), engine.ledger.get(KEY)])


def excluded(engine):
    # Exclusion persists even if the review becomes invalid.
    return set((engine.ledger.get(KEY) or {}).get('symbols', {}))


def audit(engine, review, activity):
    """Strict cash + moving-average basis audit for this dedicated paper account."""
    baseline = engine.ledger.get('baseline') or {}
    if (review['account_hash'] != engine.ledger.get('account_hash')
            or review['baseline'] != baseline or not engine.connected or engine.fatal):
        raise ValueError('Isolation account or baseline changed')
    if issue_signature(engine) != review['issues']:
        raise ValueError('Corporate-action evidence changed; review required')
    state = engine.ledger.get('corporate_actions_v1') or {}
    if (state.get('status') != 'checked' or not state.get('checked_at')
            or not 0 <= (datetime.now(UTC) - instant(state['checked_at'])).total_seconds() < 1800):
        raise ValueError('Corporate-action feed is unavailable or stale')
    isolated = review['symbols']
    positions = {p['symbol']: p for p in engine.positions}
    if len(positions) != len(engine.positions):
        raise ValueError('Duplicate broker position')
    for symbol, saved in isolated.items():
        if (symbol not in positions or position_signature(positions[symbol]) != saved['position']
                or fingerprint(engine, symbol) != saved['orders_hash']
                or any(o.get('symbol') == symbol for o in engine.open_orders)):
            raise ValueError(f'{symbol} isolated position or orders changed; review required')
    observed = {a['id']: hashed(a) for a in activity}
    if len(observed) != len(activity) or any(observed.get(i) != h for i, h in review['activity'].items()):
        raise ValueError('Previously reviewed account activity changed or disappeared')
    funding = review['funding']
    nonfills = [a for a in activity if a.get('activity_type') != 'FILL']
    if nonfills != [funding]:
        raise ValueError('Unreviewed cash or corporate-action adjustment; review required')
    rows = engine.ledger.orders()
    orders = {}
    for row in rows:
        if row['broker']:
            order = json.loads(row['broker'])
            if not order.get('id') or order['id'] in orders:
                raise ValueError('Invalid recorded broker order')
            orders[order['id']] = order
    cash = number(funding['net_amount'])
    quantities = defaultdict(lambda: number(0))
    costs = defaultdict(lambda: number(0))
    filled = defaultdict(lambda: [number(0), number(0)])
    for a in sorted((a for a in activity if a.get('activity_type') == 'FILL'), key=lambda a: instant(a['transaction_time'])):
        order = orders.get(a['order_id'])
        symbol, side = a['symbol'], a['side']
        qty, price = number(a['qty']), number(a['price'])
        if (not order or order.get('symbol') != symbol or order.get('side') != side
                or side not in ('buy', 'sell') or qty <= 0 or price <= 0
                or instant(a['transaction_time']) < instant(baseline['at'])
                or (symbol in isolated and a['id'] not in review['activity'])):
            raise ValueError('Untracked or invalid fill activity; review required')
        dollars = qty * price
        filled[a['order_id']][0] += qty
        filled[a['order_id']][1] += dollars
        if side == 'buy':
            quantities[symbol] += qty; costs[symbol] += dollars; cash -= dollars
        else:
            if quantities[symbol] <= 0 or qty > quantities[symbol]:
                raise ValueError('Unsupported short or incomplete holding history')
            costs[symbol] *= (quantities[symbol] - qty) / quantities[symbol]
            quantities[symbol] -= qty; cash += dollars
    for order_id, order in orders.items():
        qty, dollars = filled[order_id]
        if (abs(qty - number(order.get('filled_qty') or 0)) > QTY_EPS
                or abs(dollars - qty * number(order.get('filled_avg_price') or 0)) > CASH_EPS):
            raise ValueError('Broker fill activity disagrees with recorded orders')
    for symbol in set(positions) | set(quantities):
        p = positions.get(symbol, {})
        qty, cost = quantities[symbol], costs[symbol]
        if abs(number(p.get('qty', 0)) - qty) > QTY_EPS:
            raise ValueError(f'{symbol} quantity does not reconcile')
        if not p: continue
        if (p.get('side') != 'long' or qty <= 0
                or abs(number(p['cost_basis']) - cost) > CASH_EPS
                or abs(number(p['avg_entry_price']) * qty - cost) > CASH_EPS):
            raise ValueError(f'{symbol} cost basis does not reconcile')
        value, price = number(p['market_value']), number(p['current_price'])
        if value < 0 or price <= 0 or abs(value - qty * price) > CASH_EPS:
            raise ValueError(f'{symbol} marked value is inconsistent')
    broker_cash = number(engine.account['cash'])
    if cash < 0 or abs(cash - broker_cash) > CASH_EPS:
        raise ValueError('Broker cash does not reconcile with complete fill history')
    usable_cash = min(cash, broker_cash)
    marked = sum((number(p['market_value']) for s, p in positions.items() if s not in isolated), number(0))
    removed = sum((number(positions[s]['market_value']) for s in isolated), number(0))
    # Never borrow against the bad holding or trust broker equity to add capital.
    capital = min(usable_cash + marked, number(engine.account['equity']) - removed)
    if capital <= 0:
        raise ValueError('No verified capital remains after exclusion')
    return {'cash': str(usable_cash), 'equity': str(capital), 'excluded_market_value': str(removed),
            'unaffected_market_value': str(marked), 'activity_count': len(activity)}


def refresh(engine):
    review = engine.ledger.get(KEY)
    engine.isolation_check = None
    if not review: return
    try:
        checked = audit(engine, review, engine.broker.activities('1970-01-01T00:00:00Z'))
        engine.isolation_check = {**checked, 'valid': True, 'checked_at': now_iso(), 'binding': binding(engine)}
    except (BrokerError, ValueError, KeyError, TypeError, ArithmeticError):
        # No arbitrary exception text from broker activity reaches public telemetry.
        engine.isolation_check = {'valid': False, 'checked_at': now_iso(),
                                  'reason': 'Isolation audit failed: broker activity, holdings, cash or corporate-action evidence changed. A fresh review is required.'}


def report(engine):
    review = engine.ledger.get(KEY)
    if not review: return None
    check = getattr(engine, 'isolation_check', None) or {}
    valid = bool(check.get('valid') and check.get('binding') == binding(engine)
                 and 0 <= (datetime.now(UTC) - instant(check['checked_at'])).total_seconds() < MAX_AGE)
    result = {'valid': valid, 'review_id': review['id'], 'excluded_symbols': sorted(review['symbols']),
              'checked_at': check.get('checked_at'),
              'reason': 'Cash and unaffected holdings reconciled; isolated holdings excluded from inputs and sizing.' if valid else check.get('reason', 'Isolation audit is missing or stale; waiting for fresh verification.')}
    if valid:
        result.update({k: check[k] for k in ('cash', 'equity', 'excluded_market_value', 'unaffected_market_value', 'activity_count')})
    return result


def approve(engine, symbols, reason):
    """Offline, explicit owner review. Caller must hold worker.lock and back up ledger."""
    from .engine import TERMINAL
    if not engine.paused or not reason.strip() or engine.ledger.get(KEY):
        raise ValueError('Pause first; a new reason and no existing isolation are required')
    engine.refresh()
    issues = issue_signature(engine)
    if not issues or set(symbols) != {i['symbol'] for i in issues}:
        raise ValueError('Explicitly isolate every current issue, without adding unrelated symbols')
    if any(i['type'] not in ('reverse_split', 'forward_split') for i in issues):
        raise ValueError('This isolation only supports share splits')
    if engine.open_orders or any(r['status'] not in TERMINAL for r in engine.ledger.orders()):
        raise ValueError('Resolve all open orders before isolation review')
    for row in engine.ledger.orders():
        live = engine.broker.order(row['client_id'])
        saved = json.loads(row['broker']) if row['broker'] else None
        if not live or not saved or any(str(saved.get(k)) != str(live.get(k)) for k in ('id', 'symbol', 'side', 'status', 'filled_qty', 'filled_avg_price')):
            raise ValueError('Recorded order differs from broker history')
    activity = engine.broker.activities('1970-01-01T00:00:00Z')
    from .corporate_actions import effective
    for issue in issues:
        if any(a.get('activity_type') == 'FILL' and a.get('symbol') == issue['symbol']
               and instant(a['transaction_time']) >= effective(issue) for a in activity):
            raise ValueError('Post-action trades in the affected symbol require separate cash reconciliation')
    funding = [a for a in activity if a.get('activity_type') != 'FILL']
    baseline = engine.ledger.get('baseline') or {}
    if (len(funding) != 1 or funding[0].get('activity_type') != 'JNLC'
            or funding[0].get('status') != 'executed' or funding[0].get('currency') != 'USD'
            or number(funding[0]['net_amount']) != number(baseline.get('equity'))
            or instant(funding[0]['created_at']) > instant(baseline['at'])):
        raise ValueError('Initial funding and baseline require separate review')
    positions = {p['symbol']: p for p in engine.positions}
    record = {'id': digest(now_iso() + reason), 'at': now_iso(), 'reason': reason,
              'account_hash': engine.ledger.get('account_hash'), 'baseline': baseline, 'issues': issues,
              'funding': funding[0], 'activity': {a['id']: hashed(a) for a in activity},
              'symbols': {s: {'position': position_signature(positions[s]), 'orders_hash': fingerprint(engine, s)} for s in symbols}}
    engine.refresh()  # Recheck account after the potentially long order-history review.
    audit(engine, record, engine.broker.activities('1970-01-01T00:00:00Z'))
    with engine.ledger.db:
        engine.ledger.db.execute('INSERT INTO settings VALUES(?,?)', (KEY, json.dumps(record)))
        engine.ledger.db.execute('INSERT INTO events(at,kind,data) VALUES(?,?,?)',
                                (record['at'], 'corporate_isolation_approved', json.dumps({'review_id': record['id'], 'symbols': symbols, 'reason': reason})))
    refresh(engine)
    return report(engine)
