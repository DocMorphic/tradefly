from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_DOWN
import hashlib
import math
from zoneinfo import ZoneInfo

UTC = timezone.utc
NY = ZoneInfo('America/New_York')
def now_iso(): return datetime.now(UTC).isoformat()
def instant(value): return datetime.fromisoformat(value.replace('Z', '+00:00'))
def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def number(value):
    try: result = Decimal(str(value))
    except (InvalidOperation, TypeError): raise ValueError('Invalid account value') from None
    if not result.is_finite(): raise ValueError('Non-finite account value')
    return result

def completed_bars(bars, calendar, now):
    sessions = {day['date']: day for day in calendar}
    result = {}
    for bar in bars:
        t = instant(bar['t'])
        if t.tzinfo is None: raise ValueError('Bar timestamp requires timezone')
        day = t.astimezone(NY).date().isoformat()
        session = sessions.get(day)
        if not session: continue
        start = datetime.fromisoformat(day+'T'+session['open']).replace(tzinfo=NY)
        end = datetime.fromisoformat(day+'T'+session['close']).replace(tzinfo=NY)
        if not start <= t or t + timedelta(minutes=5) > min(end, now): continue
        if t.minute % 5 or t.second or t.microsecond: raise ValueError('Unaligned bar')
        o,h,l,c = [number(bar[k]) for k in ('o','h','l','c')]
        if min(o,h,l,c) <= 0 or l > min(o,c) or h < max(o,c) or number(bar['v']) < 0:
            raise ValueError('Invalid OHLCV bar')
        if bar['t'] in result and result[bar['t']] != bar:
            raise ValueError('Conflicting duplicate bars')
        result[bar['t']] = bar
    return sorted(result.values(), key=lambda b: instant(b['t']))

def encode(bar, previous, account, position):
    # Fixed causal interface; every denominator uses previous observations only.
    if len(previous) < 20: raise ValueError('Need 20 prior completed bars')
    last = float(previous[-1]['c'])
    volume = sum(float(b['v']) for b in previous[-20:]) / 20
    ret = (float(bar['c']) / last - 1) / 0.01
    relative_volume = float(bar['v']) / max(volume, 1) - 1
    equity = float(account['equity'])
    values = {'return_up':max(ret,0), 'return_down':max(-ret,0),
              'range':(float(bar['h'])-float(bar['l'])) / last / .02,
              'volume':max(relative_volume,0),
              'position':float(position.get('market_value',0)) / equity if equity > 0 else 0,
              'cash':float(account['cash']) / equity if equity > 0 else 0}
    rates = {k: round(10 + 90 * min(max(v,0),1), 6) for k,v in values.items()}
    if not all(math.isfinite(v) for v in rates.values()): raise ValueError('Invalid stimulus')
    return rates

def decode(buy_hz, sell_hz):
    if not all(math.isfinite(x) and x >= 0 for x in (buy_hz, sell_hz)):
        return 'HOLD', 'Invalid neural rates'
    if max(buy_hz, sell_hz) < 20: return 'HOLD', 'Both pools below 20 Hz'
    if abs(buy_hz-sell_hz) < 8 or buy_hz == sell_hz: return 'HOLD', 'Lead below 8 Hz'
    return ('BUY' if buy_hz > sell_hz else 'SELL'), '20 Hz threshold and 8 Hz lead passed'

def size_order(action, account, position, asset, price, max_order='100', exposure='0.10'):
    if action == 'HOLD': return None, 'Neural HOLD'
    if action not in ('BUY','SELL'): raise ValueError('Invalid action')
    if account.get('status') != 'ACTIVE' or account.get('trading_blocked') or account.get('account_blocked'):
        return None, 'Account is blocked or inactive'
    if not asset.get('tradable') or not asset.get('fractionable') or asset.get('status') != 'active':
        return None, 'Asset must be active, tradable and fractionable'
    cash, equity, price = number(account['cash']), number(account['equity']), number(price)
    qty = number(position.get('qty',0))
    if cash < 0 or equity <= 0 or qty < 0 or price <= 0: return None, 'Borrowing or invalid account state'
    cap = number(max_order)
    if action == 'BUY':
        room = equity * number(exposure) - max(number(position.get('market_value',0)), qty * price)
        # Small cash buffer for estimates; broker market fills can drift from the last bar price.
        notional = min(cap, max(Decimal(0), cash * Decimal('.99')), max(Decimal(0), room))
        notional = notional.quantize(Decimal('.01'), rounding=ROUND_DOWN)
        if notional < 1: return None, 'Cash or 10% exposure limit'
        return {'side':'buy', 'notional':str(notional)}, 'Within cash and exposure limits'
    shares = min(qty, cap / price).quantize(Decimal('.000000001'), rounding=ROUND_DOWN)
    if shares <= 0: return None, 'No shares available to sell'
    return {'side':'sell', 'qty':str(shares)}, 'Sell clipped to owned shares'
