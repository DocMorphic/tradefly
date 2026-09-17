from datetime import datetime, timedelta, timezone
from tradefly.equity_history import chart_history


def samples(count=8000):
    start = datetime(2026, 9, 14, tzinfo=timezone.utc)
    return [{'at': (start + timedelta(seconds=30*i)).isoformat(),
             'equity': str(1000 + (i % 7)), 'cash': '900'} for i in range(count)]


def test_full_timespan_recent_detail_and_old_extrema_survive_transport_budget():
    source = samples()
    source[800]['equity'] = '3000'
    source[900]['equity'] = '500'
    chart, info = chart_history(source)
    assert len(chart) <= 500 and info['total'] == 8000 and info['downsampled']
    assert chart[0]['at'] == source[0]['at'] and chart[-1]['at'] == source[-1]['at']
    assert source[800]['at'] in {p['at'] for p in chart}
    assert source[900]['at'] in {p['at'] for p in chart}
    cutoff = datetime.fromisoformat(source[-1]['at']) - timedelta(hours=6)
    assert len([r for r in chart if datetime.fromisoformat(r['at']) >= cutoff]) > 100
    assert chart[-1]['drawdown'] == (float(source[-1]['equity']) / 3000 - 1) * 100
    assert not any(r['gap_before'] for r in chart), 'Downsampling must not invent recording outages'


def test_real_outage_is_preserved_and_empty_or_short_history_is_lossless():
    assert chart_history([])[0] == []
    source = samples(20)
    for r in source[10:]:
        r['at'] = (datetime.fromisoformat(r['at']) + timedelta(hours=12)).isoformat()
    chart, info = chart_history(source)
    assert not info['downsampled'] and len(chart) == 20
    assert [i for i,r in enumerate(chart) if r['gap_before']] == [10]


def test_transport_budget_accounts_for_actual_json_serialization():
    import json
    from tradefly.neural_activity import bounded_activity_snapshot
    activity = {'events': [[0, 1]] * 9000}
    snapshot = {'padding': 'x' * 700000, 'decisions': [{'neural': {'activity': activity}} for _ in range(3)]}
    assert len(json.dumps(bounded_activity_snapshot(snapshot))) <= 850000
