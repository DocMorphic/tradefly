from datetime import datetime, timedelta
import httpx
from tradefly.alpaca import Alpaca
from tradefly.config import Settings
from tradefly.domain import UTC
from tradefly.chart_history import ChartHistory


def test_sip_history_is_delayed_paginated_and_read_only():
    now = datetime(2026, 9, 15, 15, 0, tzinfo=UTC)
    calls = []
    def bar(t):
        return {'t': t, 'o': 10, 'h': 12, 'l': 9, 'c': 11, 'v': 100}
    def handler(request):
        calls.append(request)
        assert request.method == 'GET'
        if request.url.path == '/v2/calendar':
            return httpx.Response(200, json=[{'date': '2026-09-15', 'open': '09:30', 'close': '16:00'}])
        assert request.url.host == 'data.alpaca.markets'
        assert request.url.params['feed'] == 'sip'
        assert datetime.fromisoformat(request.url.params['end']) <= now - timedelta(minutes=15)
        if not request.url.params.get('page_token'):
            return httpx.Response(200, json={'bars': {'FEMY': [bar('2026-09-15T13:30:00Z')]}, 'next_page_token': 'next'})
        return httpx.Response(200, json={'bars': {'FEMY': [bar('2026-09-15T14:35:00Z'), bar('2026-09-15T14:40:00Z'), bar('2026-09-15T12:00:00Z')]}})
    client = Alpaca(Settings(), transport=httpx.MockTransport(handler))
    result = ChartHistory(client).fetch('FEMY', now)
    # 14:40 candle ends after the 14:44 cutoff; premarket also excluded.
    assert len(result['bars']) == 2
    assert result['bars'][0]['symbol'] == 'FEMY'
    assert result['feed'] == 'sip' and result['delay_minutes'] == 15
    assert len(calls) == 3
    client.close()


def test_empty_history_stays_empty_without_a_synthetic_fallback():
    class Broker:
        def calendar(self, *_): return []
        def request(self, *_, **__): return {'bars': {}}
    result = ChartHistory(Broker()).fetch('UNKNOWN')
    assert result['bars'] == []
