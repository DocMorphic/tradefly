from concurrent.futures import Future
from datetime import datetime, timedelta
import json
import time
import httpx
import pytest
from tradefly.alpaca import Alpaca
from tradefly.config import Settings
from tradefly.domain import UTC
from tradefly.jev import Scout, MODEL, build_request, parse_response


def article(symbol='AAPL', **changes):
    return {'id': 101, 'headline': 'Company announces new quarterly results', 'summary': 'Revenue guidance revised.',
            'updated_at': datetime.now(UTC).isoformat(), 'symbols': [symbol], **changes}


def response(request, value=.95):
    return {'model': MODEL, 'answers': {q: {'type': 'noul', 'noul': value} for q in request['questions']},
            'usage': {'input_tokens': 100, 'output_tokens': 8}}


@pytest.fixture
def scout(tmp_path):
    path = tmp_path/'.env.typesafe'
    path.write_text('TYPESAFE_ENABLED=1\nTYPESAFE_API_KEY=test-local-only\n')
    class News:
        rows = [article()]
        def __init__(self, settings): pass
        def news(self, start): return self.rows
        def close(self): pass
    calls = []
    def handler(request):
        assert request.url == 'https://api.typesafe.ai/v1/systemone'
        assert request.headers['Authorization'] == 'Bearer test-local-only'
        payload = json.loads(request.content); calls.append(payload)
        return httpx.Response(200, json=response(payload))
    s = Scout(Settings(database=tmp_path/'test.db'), path, News, httpx.MockTransport(handler))
    yield s, calls, News
    s.close()


def config(**changes): return {'key': 'test-local-only', 'calls': 100, 'tokens': 1_000_000, **changes}


def test_public_evidence_allowlist_and_freshness():
    now = datetime.now(UTC)
    rows = [article(account={'cash': 'secret'}, secret_key='never-send', content='ignored'),
            article(id=2, updated_at=(now-timedelta(hours=2)).isoformat()),
            article(id=3, updated_at=(now+timedelta(minutes=1)).isoformat()), article(symbol='NOT_ELIGIBLE', id=4)]
    payload, pairs = build_request(rows, {'AAPL'}, now+timedelta(seconds=1))
    assert len(pairs) == 1 and len(payload['questions']) == 1
    encoded = json.dumps(payload)
    assert all(s not in encoded for s in ['secret', 'account', 'cash', 'content', 'NOT_ELIGIBLE'])
    assert 'AAPL' in payload['questions']['q0']['instructions']
    assert len(build_request([article(id=i) for i in range(100)], {'AAPL'}, now)[1]) <= 8


@pytest.mark.parametrize('bad', [float('nan'), float('inf'), -.1, 1.1, '0.9', True])
def test_malformed_probabilities_never_reach_queue(bad):
    now = datetime.now(UTC); payload, pairs = build_request([article()], {'AAPL'}, now+timedelta(seconds=1))
    with pytest.raises(ValueError): parse_response(response(payload, bad), payload, pairs, now)


def test_uncertain_results_do_not_queue():
    now = datetime.now(UTC); payload, pairs = build_request([article()], {'AAPL'}, now+timedelta(seconds=1))
    rows, tokens = parse_response(response(payload, .5), payload, pairs, now)
    assert rows == [] and tokens == 100


def test_calls_cached_and_audited_without_credentials(scout):
    s, calls, _ = scout
    first = s.scan(config(), {'AAPL'}, 'config')
    assert first['rows'][0]['symbol'] == 'AAPL' and first['calls'] == 1
    second = s.scan(config(), {'AAPL'}, 'config')
    assert second['rows'] and len(calls) == 1 and second['calls'] == 1
    with s.db() as db:
        stored = db.execute('SELECT request,response,status FROM attempts').fetchone()
    assert 'test-local-only' not in json.dumps(stored) and stored[2] == 'ok'
    assert s.usage() == {'calls': 1, 'input_tokens': 100, 'reserved_tokens': 100}


def test_lifetime_cap_survives_restart(scout):
    s, calls, news = scout
    s.scan(config(calls=1), {'AAPL'}, 'config')
    news.rows = [article(id=999)]
    other = Scout(s.settings, s.config_path, s.broker_factory, s.transport)
    try:
        result = other.scan(config(calls=1), {'AAPL'}, 'config')
        assert result['status'] == 'capped' and len(calls) == 1
    finally: other.close()


def test_token_reservation_blocks_before_request(scout):
    s, calls, _ = scout
    assert s.scan(config(tokens=1), {'AAPL'}, 'config')['status'] == 'capped'
    assert not calls and s.usage()['calls'] == 0


@pytest.mark.parametrize('status', [401, 402, 403, 429, 500])
def test_http_failure_sanitized_no_retry_same_request(scout, status):
    s, calls, _ = scout
    def handler(request):
        calls.append(request)
        return httpx.Response(status, text='PRIVATE PROVIDER RESPONSE')
    s.transport = httpx.MockTransport(handler)
    result = s.scan(config(), {'AAPL'}, 'config')
    assert result['rows'] == [] and result['calls'] == 1 and result['reserved_tokens'] > 100
    assert result['halted'] == (status != 500)
    assert 'PRIVATE' not in json.dumps(result)
    s.scan(config(), {'AAPL'}, 'config')
    assert len(calls) == 1


def test_timeout_and_malformed_response_preserve_reserved_usage(scout):
    s, calls, news = scout
    def timeout(request): raise httpx.ReadTimeout('sensitive request details')
    s.transport = httpx.MockTransport(timeout)
    result = s.scan(config(), {'AAPL'}, 'config')
    assert result['status'] == 'unavailable' and result['reserved_tokens'] > 0
    assert 'sensitive' not in json.dumps(result)
    news.rows = [article(id=202)]
    s.transport = httpx.MockTransport(lambda r: httpx.Response(200, json={'model': MODEL}))
    result = s.scan(config(), {'AAPL'}, 'config')
    assert result['rows'] == [] and result['calls'] == 2


def test_expired_and_consumed_news_not_selected(scout):
    s, _, _ = scout
    s.rows = s.scan(config(), {'AAPL'}, 'config')['rows']
    assert s.take({'AAPL'}, {'AAPL'}) is None
    assert s.take({'OTHER'}, set()) is None
    assert s.take({'AAPL'}, set())['symbol'] == 'AAPL'
    assert s.take({'AAPL'}, set()) is None
    s.used.clear()
    assert s.candidates(datetime.now(UTC)+timedelta(minutes=16)) == []


def test_pulse_never_waits_for_api_and_disable_discards_pending_result(scout):
    s, calls, _ = scout
    pending = Future(); s.future = pending
    before = time.monotonic()
    s.pulse({'AAPL'}, active=True)
    assert time.monotonic()-before < .5 and not calls
    old_identity = s.config_identity
    s.config_path.write_text('TYPESAFE_ENABLED=0\nTYPESAFE_API_KEY=test-local-only\n')
    pending.set_result({'identity': old_identity, 'rows': [{'symbol': 'AAPL'}], 'status': 'ready'})
    s.pulse({'AAPL'}, active=True)
    assert s.rows == [] and s.snapshot()['status'] == 'disabled'


def test_missing_key_closed_market_and_pause_never_call_api(scout):
    s, calls, _ = scout
    s.pulse({'AAPL'}, active=False)
    assert s.snapshot()['status'] == 'waiting' and s.future is None
    s.config_path.write_text('TYPESAFE_ENABLED=1\nTYPESAFE_API_KEY=\n')
    s.pulse({'AAPL'}, active=True)
    assert s.snapshot()['status'] == 'needs_key' and not calls
    assert 'test-local-only' not in json.dumps(s.snapshot())


def test_news_adapter_only_allows_exact_read_only_endpoint():
    calls = []
    def handler(request):
        calls.append(request)
        assert request.url.host == 'data.alpaca.markets'
        return httpx.Response(200, json={'news': [article()]})
    b = Alpaca(Settings(), httpx.MockTransport(handler))
    try:
        assert len(b.news('2026-09-20T00:00:00Z')) == 1
        for method, path, data in [('POST', '/v1beta1/news', True), ('GET', '/v1beta1/news', False), ('GET', '/v1beta1/other', True)]:
            with pytest.raises(ValueError): b.request(method, path, data=data)
        assert len(calls) == 1
    finally: b.close()
