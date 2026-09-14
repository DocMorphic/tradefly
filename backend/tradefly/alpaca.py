"""Narrow HTTP adapter: hosts are constants; redirects and live trading are absent."""
from urllib.parse import quote
import httpx
from .config import Settings, PAPER_URL, DATA_URL

class BrokerError(RuntimeError):
    def __init__(self, status: int | None, operation: str):
        self.status = status
        super().__init__(f'Alpaca {operation}: ' + (f'HTTP {status}' if status else 'connection unavailable'))

class Alpaca:
    def __init__(self, settings: Settings, transport=None):
        self.client = httpx.Client(headers={'APCA-API-KEY-ID': settings.api_key,
                'APCA-API-SECRET-KEY': settings.secret_key}, timeout=15,
                follow_redirects=False, transport=transport)

    def close(self):
        self.client.close()

    def request(self, method, path, *, data=False, params=None, payload=None):
        if not path.startswith('/v2/') or '://' in path or '..' in path:
            raise ValueError('Invalid broker path')
        try:
            response = self.client.request(method, (DATA_URL if data else PAPER_URL) + path,
                                           params=params, json=payload)
        except httpx.HTTPError:
            raise BrokerError(None, method) from None
        if not response.is_success:
            # Never echo response/request bodies or headers (credentials/account identifiers).
            raise BrokerError(response.status_code, method)
        try:
            return response.json() if response.content else None
        except ValueError:
            raise BrokerError(None, 'invalid response') from None

    def account(self): return self.request('GET', '/v2/account')
    def positions(self): return self.request('GET', '/v2/positions')
    def clock(self): return self.request('GET', '/v2/clock')
    def asset(self, symbol): return self.request('GET', '/v2/assets/' + quote(symbol, safe=''))
    def open_orders(self): return self.request('GET', '/v2/orders', params={'status': 'open', 'limit': 500})
    def order(self, client_id):
        try:
            return self.request('GET', '/v2/orders:by_client_order_id', params={'client_order_id': client_id})
        except BrokerError as e:
            if e.status == 404: return None
            raise
    def submit(self, payload): return self.request('POST', '/v2/orders', payload=payload)
    def cancel(self, broker_id): return self.request('DELETE', '/v2/orders/' + quote(broker_id, safe=''))
    def calendar(self, start, end):
        return self.request('GET', '/v2/calendar', params={'start':start, 'end':end})
    def bars(self, symbol, start, end):
        bars, token = [], None
        while True:
            params = {'symbols':symbol, 'timeframe':'5Min', 'start':start, 'end':end,
                      'feed':'iex', 'adjustment':'raw', 'sort':'asc', 'limit':10000}
            if token: params['page_token'] = token
            response = self.request('GET', '/v2/stocks/bars', data=True, params=params)
            bars.extend(response.get('bars', {}).get(symbol, []))
            following = response.get('next_page_token')
            if not following: return bars
            if following == token: raise BrokerError(None, 'repeated data page')
            token = following
