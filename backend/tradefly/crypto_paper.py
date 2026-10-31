"""Isolated BTC/ETH paper accounting. No brokerage, signing or transaction methods."""
from copy import deepcopy
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_DOWN
import json
import hashlib
from pathlib import Path
import sqlite3
import uuid

from .crypto_receipts import ZERO_HASH, bundle, receipt
from .domain import UTC, decode, encode, instant, number

SYMBOLS = ('BTC/USD', 'ETH/USD')
INTERVAL = timedelta(minutes=5)


def stamp(at):
    return at.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def decimal(value):
    return format(number(value).quantize(Decimal('.000000000001')), 'f')


def candles(raw, now):
    if not isinstance(raw, list) or len(raw) > 300:
        raise ValueError('Invalid candles')
    result = {}
    for row in raw:
        if not isinstance(row, list) or len(row) != 6:
            raise ValueError('Invalid candle')
        seconds, low, high, opened, close, volume = map(number, row)
        if (seconds != int(seconds) or seconds % 300 or min(low, high, opened, close) <= 0
                or low > min(opened, close) or high < max(opened, close) or volume < 0):
            raise ValueError('Invalid candle values')
        at = datetime.fromtimestamp(float(seconds), UTC)
        if at + INTERVAL > now:
            continue
        bar = dict(at=stamp(at), open=decimal(opened), high=decimal(high), low=decimal(low),
                   close=decimal(close), volume=decimal(volume))
        if seconds in result and result[seconds] != bar:
            raise ValueError('Conflicting candles')
        result[seconds] = bar
    return [bar for _, bar in sorted(result.items())]


def observation(bars, now):
    if len(bars) < 21:
        raise ValueError('Need 21 completed bars')
    window = bars[-21:]
    for bar in window:
        opened, high, low, close, volume = (number(bar[k]) for k in ('open', 'high', 'low', 'close', 'volume'))
        if min(opened, high, low, close) <= 0 or volume < 0 or low > min(opened, close) or high < max(opened, close) or instant(bar['at']).timestamp() % 300:
            raise ValueError('Invalid crypto observation')
    for left, right in zip(window, window[1:]):
        if instant(right['at']) - instant(left['at']) != INTERVAL:
            raise ValueError('Market data gap; no neural evaluation')
    closed = instant(window[-1]['at']) + INTERVAL
    if not 0 <= (now - closed).total_seconds() <= 90:
        raise ValueError('Market input is incomplete or stale')
    return window


def fresh_account():
    return {'initial_cash': '10000', 'cash': '10000', 'realized': '0', 'fees': '0',
            'holdings': {s: {'quantity': '0', 'cost_basis': '0', 'mark': '0'} for s in SYMBOLS},
            'pending': None, 'fills': [], 'history': []}


def equity(account):
    return number(account['cash']) + sum((number(p['quantity']) * number(p['mark'])
                                        for p in account['holdings'].values()), Decimal(0))


def settle(account, symbol, bars):
    """Fill only at a future, observed opening after decision completion; never backfill a gap."""
    pending = account['pending']
    if not pending or pending['symbol'] != symbol:
        return
    eligible = instant(pending['not_before'])
    later = [b for b in bars if instant(b['at']) >= eligible]
    if not later:
        return
    bar = later[0]
    fill = {'decision_sequence': pending['sequence'], 'symbol': symbol,
            'at': bar['at'], 'side': pending['side'], 'status': 'canceled-data-gap'}
    if instant(bar['at']) == eligible:
        side = pending['side']
        price = number(bar['open']) * (Decimal('1.001') if side == 'BUY' else Decimal('.999'))
        p = account['holdings'][symbol]
        qty = number(p['quantity'])
        cash = number(account['cash'])
        budget = min(number(pending['budget']), cash / Decimal('1.0025'))
        traded = ((max(Decimal(0), budget) / price) if side == 'BUY'
                  else min(qty, number(pending['quantity']), Decimal(100) / price)).quantize(Decimal('.00000001'), rounding=ROUND_DOWN)
        value = traded * price
        fee = value * Decimal('.0025')
        fill['status'] = 'filled' if traded > 0 else 'vetoed'
        if traded > 0:
            if side == 'BUY':
                account['cash'] = decimal(cash - value - fee)
                p['cost_basis'] = decimal(number(p['cost_basis']) + value + fee)
                p['quantity'] = decimal(qty + traded)
            else:
                released = number(p['cost_basis']) * traded / qty
                account['cash'] = decimal(cash + value - fee)
                account['realized'] = decimal(number(account['realized']) + value - fee - released)
                p['quantity'] = decimal(qty - traded)
                p['cost_basis'] = decimal(number(p['cost_basis']) - released)
            account['fees'] = decimal(number(account['fees']) + fee)
        fill.update(quantity=decimal(traded), price=decimal(price), fee=decimal(fee))
    account['fills'] = (account['fills'] + [fill])[-256:]
    account['pending'] = None
    return fill


class CryptoLedger:
    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS receipts(sequence INTEGER PRIMARY KEY, symbol TEXT NOT NULL, bar_at TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(symbol,bar_at));
          CREATE TABLE IF NOT EXISTS paper_events(id INTEGER PRIMARY KEY, body TEXT NOT NULL);
        ''')
        row = self.db.execute('SELECT body FROM state WHERE id=1').fetchone()
        self.state = json.loads(row[0]) if row else {'run_id': 'crypto-' + uuid.uuid4().hex, 'account': fresh_account(),
            'sequence': 0, 'previous_hash': ZERO_HASH, 'inflight': False, 'checkpoint_hash': None, 'experiment_hash': None}
        if not row:
            self.save()

    def save(self):
        self.db.execute('INSERT INTO state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', (json.dumps(self.state),))
        self.db.commit()

    def mark(self, markets):
        with self.db:
            for symbol, bars in markets.items():
                fill = settle(self.state['account'], symbol, bars)
                if fill:
                    self.db.execute('INSERT INTO paper_events(body) VALUES(?)', (json.dumps(fill),))
                if bars:
                    self.state['account']['holdings'][symbol]['mark'] = bars[-1]['close']
            self.db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(self.state),))

    def validate_experiment(self, brain):
        experiment = hashlib.sha256(brain.manifest_hash.encode() + Path(__file__).read_bytes()
                                    + (Path(__file__).parent / 'crypto_receipts.py').read_bytes()).hexdigest()
        if self.state.get('experiment_hash') not in (None, experiment):
            raise ValueError('Crypto model or paper protocol changed; use a separate experiment ledger')
        return experiment

    def evaluate(self, symbol, bars, brain, now, checkpoint):
        if symbol not in SYMBOLS:
            raise ValueError('Unsupported crypto pair')
        if self.state['inflight']:
            raise ValueError('Interrupted neural step; explicit checkpoint recovery required')
        experiment = self.validate_experiment(brain)
        if self.state['account']['pending']:
            return None
        window = observation(bars, now)
        if self.db.execute('SELECT 1 FROM receipts WHERE symbol=? AND bar_at=?', (symbol, window[-1]['at'])).fetchone():
            return None
        account = deepcopy(self.state['account'])
        p = account['holdings'][symbol]
        as_stock = lambda b: {'t': b['at'], 'o': b['open'], 'h': b['high'], 'l': b['low'], 'c': b['close'], 'v': b['volume']}
        rates = encode(as_stock(window[-1]), [as_stock(b) for b in window[:-1]],
                       {'cash': account['cash'], 'equity': decimal(equity(account))},
                       {'market_value': decimal(number(p['quantity']) * number(p['mark']))})
        self.state['inflight'] = True
        self.state['experiment_hash'] = experiment
        self.save()
        neural = brain.stimulate(rates)
        action, _ = decode(neural['buy_hz'], neural['sell_hz'])
        # Actual completion time governs fill eligibility; not the historical bar clock.
        decided = max(now, datetime.now(UTC))
        row = {'schema': 'tradefly.crypto.decision.v1', 'run_id': self.state['run_id'],
               'sequence': self.state['sequence'] + 1, 'previous_hash': self.state['previous_hash'],
               'source': 'neural', 'symbol': symbol, 'decided_at': stamp(decided),
               'experiment_hash': experiment,
               'observation': {'provider': 'coinbase-exchange', 'bars': window},
               'stimulus': {k: decimal(v) for k, v in rates.items()},
               'neural': {k: decimal(neural[k]) for k in ('buy_hz', 'sell_hz')},
               'action': action, 'account_before': {'cash': account['cash'], 'equity': decimal(equity(account)), 'quantity': p['quantity']}}
        row['neural']['state_id'] = neural['state_id']
        signed = receipt(row)
        if action != 'HOLD':
            quantity = min(number(p['quantity']), Decimal(100) / number(window[-1]['close']))
            exposure = sum((number(h['quantity']) * number(h['mark']) for h in account['holdings'].values()), Decimal(0))
            budget = max(Decimal(0), min(Decimal(100), number(account['cash']) / Decimal('1.0025'), equity(account) * Decimal('.10') - exposure))
            not_before = datetime.fromtimestamp((int(decided.timestamp()) // 300 + 1) * 300, UTC)
            account['pending'] = {'sequence': row['sequence'], 'symbol': symbol, 'side': action,
                                  'not_before': stamp(not_before), 'budget': decimal(budget), 'quantity': decimal(quantity)}
        checkpoint_hash = checkpoint()  # A separate staged checkpoint; never the stock brain.
        self.state.update(account=account, sequence=row['sequence'], previous_hash=signed['hash'],
                          inflight=False, checkpoint_hash=checkpoint_hash)
        with self.db:
            self.db.execute('INSERT INTO receipts VALUES(?,?,?,?)', (row['sequence'], symbol, window[-1]['at'], json.dumps(signed)))
            self.db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(self.state),))
        return signed

    def export(self, first=1):
        rows = [json.loads(r[0]) for r in self.db.execute('SELECT body FROM receipts WHERE sequence>=? ORDER BY sequence LIMIT 256', (first,))]
        return bundle(rows) if rows else None

    def snapshot(self):
        a = self.state['account']
        count = self.state['sequence']
        return {'schema': 'tradefly.crypto.snapshot.v1', 'run_id': self.state['run_id'], 'source': 'neural',
                'updated_at': stamp(datetime.now(UTC)), 'account': a, 'equity': decimal(equity(a)),
                'decision_count': count, 'bundle': self.export(max(1, count - 255))}

    def close(self):
        self.db.close()
