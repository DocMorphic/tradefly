"""Read-only delayed SIP chart worker. Never supplies signals or submits orders."""
import fcntl
import json
import re
import signal
import threading
from datetime import datetime, timedelta
import httpx
from dotenv import dotenv_values
from .alpaca import Alpaca, BrokerError
from .config import ROOT, Settings, bridge_target, bridge_headers
from .domain import UTC, completed_bars, instant


class ChartHistory:
    def __init__(self, broker):
        self.broker = broker
        self.calendar = {}

    def fetch(self, symbol, now=None):
        if not re.fullmatch(r'[A-Z][A-Z0-9.\-]{0,14}', symbol):
            raise ValueError('Invalid symbol')
        now = now or datetime.now(UTC)
        # One minute of clock/entitlement margin, plus completion filtering below.
        through = now - timedelta(minutes=16)
        start = through - timedelta(days=7)
        dates = (start.date().isoformat(), through.date().isoformat())
        if dates not in self.calendar:
            self.calendar = {dates: self.broker.calendar(*dates)}
        bars, token, seen = [], None, set()
        while True:
            params = {'symbols': symbol, 'timeframe': '5Min', 'feed': 'sip',
                      'adjustment': 'raw', 'start': start.isoformat(),
                      'end': through.isoformat(), 'sort': 'asc', 'limit': 10000}
            if token:
                params['page_token'] = token
            response = self.broker.request('GET', '/v2/stocks/bars', data=True, params=params)
            bars.extend(response.get('bars', {}).get(symbol, []))
            token = response.get('next_page_token')
            if not token:
                break
            if token in seen or len(seen) >= 10:
                raise ValueError('Invalid data pagination')
            seen.add(token)
        completed = completed_bars(bars, self.calendar[dates], through)[-600:]
        return {'symbol': symbol, 'feed': 'sip', 'delay_minutes': 15,
                'timeframe': '5Min', 'fetched_at': now.isoformat(),
                'through': through.isoformat(), 'bars': [
                    {'symbol': symbol, 'at': int(instant(b['t']).timestamp() * 1000),
                     'open': float(b['o']), 'high': float(b['h']), 'low': float(b['l']),
                     'close': float(b['c']), 'volume': float(b['v'])} for b in completed]}


def serve(stop=None):
    stop = stop or threading.Event()
    (ROOT / 'runs').mkdir(exist_ok=True)
    # Independent lock lets this run alongside an already-loaded trading worker.
    with (ROOT / 'runs/chart-history.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        config = dotenv_values(ROOT / '.env.bridge')
        headers = bridge_headers(config)
        if not headers:
            return
        broker = Alpaca(Settings.load())
        history = ChartHistory(broker)
        url = bridge_target(config) + '/api/market-history/bridge'
        try:
            with httpx.Client(timeout=15, follow_redirects=False, headers=headers) as client:
                while not stop.is_set():
                    try:
                        response = client.get(url)
                        if response.status_code == 200:
                            for item in response.json().get('requests', [])[:4]:
                                if stop.is_set():
                                    break
                                result = {'symbol': item['symbol'], 'requested_at': item['requested_at']}
                                try:
                                    result['history'] = history.fetch(item['symbol'])
                                except BrokerError as error:
                                    result['error'] = 'access' if error.status in (401, 403) else 'symbol' if error.status in (400, 404, 422) else 'unavailable'
                                except (ValueError, KeyError, TypeError):
                                    result['error'] = 'unavailable'
                                posted = client.post(url, json=result)
                                if posted.status_code != 200:
                                    break
                                print(json.dumps({'chart': item['symbol'], 'bars': len(result.get('history', {}).get('bars', [])), 'error': result.get('error')}), flush=True)
                    except (httpx.HTTPError, ValueError, KeyError, TypeError):
                        pass  # Retry without logging credentials, requests, or response bodies.
                    stop.wait(10)
        finally:
            broker.close()


def start_background():
    stop = threading.Event()
    thread = threading.Thread(target=serve, args=(stop,), daemon=True, name='chart-history')
    thread.start()
    return stop


if __name__ == '__main__':
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    serve(stopped)
