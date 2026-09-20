"""Read-only corporate-action evidence; never adjusts broker quantities or cash.

Detected position-impacting actions stay under review, including after a holding
vanishes. Removing an affected position must not legitimize phantom cash/profit.
"""
from datetime import datetime, timedelta
import json
from .domain import UTC, NY, instant, now_iso, number
from .alpaca import BrokerError

KEY = 'corporate_actions_v1'
TYPES = ('reverse_split', 'forward_split', 'stock_dividend', 'spin_off',
         'stock_merger', 'stock_and_cash_merger', 'redemption', 'name_change', 'worthless_removal')


def effective(event):
    return datetime.fromisoformat(event['date']).replace(tzinfo=NY).astimezone(UTC)


def normalize(response):
    events = []
    groups = response.get('corporate_actions')
    if not isinstance(groups, dict):
        raise ValueError('Invalid corporate-action response')
    for group, records in groups.items():
        kind = group.removesuffix('s')
        if kind not in TYPES:
            continue
        for raw in records:
            symbol = raw.get('symbol') or raw.get('old_symbol') or raw.get('source_symbol') or raw.get('acquiree_symbol')
            date = raw.get('ex_date') or raw.get('effective_date') or raw.get('process_date')
            if not symbol or not date or not raw.get('id'):
                raise ValueError('Incomplete corporate-action event')
            event = {'id': raw['id'], 'symbol': symbol, 'type': kind, 'date': date,
                     'source': 'Alpaca corporate-actions feed'}
            effective(event)  # validate before persisting or using it
            if kind in ('reverse_split', 'forward_split'):
                old, new = number(raw.get('old_rate')), number(raw.get('new_rate'))
                if old <= 0 or new <= 0: raise ValueError('Invalid split ratio')
                event.update(old_rate=str(old), new_rate=str(new))
            events.append(event)
    return events


def fills(engine):
    result = []
    for row in engine.ledger.orders():
        if not row['broker']: continue
        fill = json.loads(row['broker'])
        if number(fill.get('filled_qty') or 0) > 0 and fill.get('filled_at'):
            result.append(fill)
    return result


def assess(events, orders, positions, previous, now):
    issues = {i['id']: dict(i) for i in previous}
    actual = {p['symbol']: p for p in positions}
    # Events are evidence, not synthetic fills. Rounding, cash-in-lieu and
    # multiple actions require reconciliation; ratio math is indicative only.
    for event in events:
        at = effective(event)
        if at > now: continue
        qty = sum((number(f['filled_qty']) * (1 if f['side'] == 'buy' else -1)
                   for f in orders if f.get('symbol') == event['symbol'] and instant(f['filled_at']) < at), number(0))
        if qty <= 0 and event['id'] not in issues: continue
        issue = {**event, 'effective_at': at.isoformat(), 'pre_action_qty': str(qty),
                 'detected_at': issues.get(event['id'], {}).get('detected_at', now.isoformat()),
                 'status': 'requires_reconciliation', 'reason': 'Position affected by a corporate action; broker valuation and ledger require reconciliation.'}
        position = actual.get(event['symbol'], {})
        issue['broker_qty'] = position.get('qty', '0')
        if event['type'] in ('reverse_split', 'forward_split'):
            expected = qty * number(event['new_rate']) / number(event['old_rate'])
            issue['expected_qty_before_rounding'] = str(expected)
            if abs(number(issue['broker_qty']) - expected) > number('0.000001'):
                issue['status'] = 'quantity_mismatch'
            issue['reason'] = f"{event['symbol']}: {qty} recorded pre-split shares become {expected} before fractional-share treatment ({event['old_rate']} old shares for {event['new_rate']} new, effective {event['date']}). Alpaca currently reports {issue['broker_qty']} shares."
        issues[event['id']] = issue
    return list(issues.values())


def refresh(engine, now=None):
    now = now or datetime.now(UTC)
    old = engine.ledger.get(KEY) or {}
    state = dict(old)
    attempted = state.get('attempted_at')
    retry = 600 if state.get('status') == 'checked' else 60
    if not attempted or (now - instant(attempted)).total_seconds() >= retry:
        state['attempted_at'] = now.isoformat()
        baseline = engine.ledger.get('baseline') or {}
        start = (instant(baseline.get('at') or now.isoformat()) - timedelta(days=90)).date().isoformat()
        end = (now + timedelta(days=7)).date().isoformat()
        try:
            result, token, seen = {}, None, set()
            for _ in range(100):
                response = engine.broker.corporate_actions(start, end, token)
                for event in normalize(response): result[event['id']] = event
                token = response.get('next_page_token')
                if not token: break
                if token in seen: raise ValueError('Repeated corporate-action page')
                seen.add(token)
            else: raise ValueError('Incomplete corporate-action pagination')
            # Keep known past actions even if a later response omits them.
            events = {e['id']: e for e in state.get('events', [])}
            events.update(result)
            state.update(status='checked', checked_at=now.isoformat(), events=list(events.values()),
                         coverage_start=start, coverage_through=end, error=None)
        except (BrokerError, ValueError, KeyError, TypeError):
            state.update(status='unavailable', error='Corporate-action verification unavailable; retrying without accepting new orders.')
    state['issues'] = assess(state.get('events', []), fills(engine), engine.positions, state.get('issues', []), now)
    if state != old:
        engine.ledger.set(KEY, state)
        prior = {i['id'] for i in old.get('issues', [])}
        for issue in state['issues']:
            if issue['id'] not in prior:
                engine.ledger.event('corporate_action_flagged', issue)
    return state


def report(engine):
    state = engine.ledger.get(KEY) or {}
    issues = state.get('issues', [])
    fresh = bool(state.get('checked_at') and datetime.now(UTC) - instant(state['checked_at']) < timedelta(minutes=30))
    complete = state.get('status') == 'checked' and fresh
    from .isolation import report as isolation_report
    isolation = isolation_report(engine)
    executable = bool(complete and ((not issues and isolation is None) or (isolation and isolation['valid'])))
    return {'status': 'review_required' if issues else 'checked' if complete else 'unavailable',
            'performance_verified': complete and not issues,
            'execution_ready': executable, 'isolation': isolation,
            'checked_at': state.get('checked_at'), 'issues': issues,
            'affected_since': min((i['effective_at'] for i in issues), default=None),
            'coverage_start': state.get('coverage_start'), 'coverage_through': state.get('coverage_through'),
            'source': 'Alpaca corporate-actions feed',
            'message': ('Performance remains unverified. Reviewed symbols are isolated; other symbols may run using reconciled cash and unaffected holdings.' if issues and executable else
                        'Broker valuation is unverified after a corporate action. Profit metrics and new orders are blocked until reconciliation.') if issues else 'Corporate-action check complete.' if complete else 'Corporate-action check unavailable. Profit metrics and new orders are withheld until verification.'}


def input_affected(engine, symbol, start, end):
    from .isolation import excluded
    if symbol in excluded(engine): return True
    state = engine.ledger.get(KEY) or {}
    return any(e['symbol'] == symbol and instant(start) <= effective(e) <= instant(end) for e in state.get('events', []))
