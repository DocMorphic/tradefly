"""All broker-tradable US equities, one persistent brain, no price-ranked shortlist.

The deterministic sensory tour is software, not simulated intention. Only the
measured neural decoder may accept a presented symbol for a directional intent.
"""
import json
import os
import time
from collections import Counter
from datetime import datetime, timedelta
from decimal import ROUND_DOWN
from .domain import UTC, NY, completed_bars, decode, digest, encode, instant, now_iso, number, size_order
from .engine import Engine, TERMINAL

POLICY = 'market-tour-v1: stable hash order; shared brain; neural acceptance; 5Min inputs'

def universe(assets):
    return {a['symbol']: a for a in assets if a.get('class') == 'us_equity'
            and a.get('status') == 'active' and a.get('tradable') and isinstance(a.get('symbol'), str)}

def size_market_order(action, account, position, asset, price, cap, exposure):
    # Whole-share eligibility changes execution granularity, never the neural choice.
    sized, reason = size_order(action, account, position, {**asset, 'fractionable': True}, price, cap, exposure)
    if sized is None or asset.get('fractionable'): return sized, reason
    qty = (number(sized['notional']) / number(price) if action == 'BUY' else number(sized['qty'])).quantize(number(1), rounding=ROUND_DOWN)
    if qty < 1: return None, 'Whole share exceeds available order budget or holdings'
    return {'side': sized['side'], 'qty': str(qty)}, 'Whole-share order within budget and holdings'

class MarketEngine(Engine):
    def __init__(self, settings, **kwargs):
        super().__init__(settings, **kwargs)
        self.assets = {}
        self.watchlist = ()
        self.symbol = ''
        self.universe_at = None
        self.universe_id = ''
        self.last_refresh = 0.
        self.cache = {}
        self.cache_boundary = None
        self.calendar_cache = None
        self.probed = set()
        self.session_started = time.monotonic()
        self.session_evaluated = 0

    def discover(self):
        assets = universe(self.broker.assets())
        if not assets: raise ValueError('No tradable US equities returned by Alpaca')
        # No price, volume, sector, profitability, or analyst rank affects this tour.
        symbols = tuple(sorted(assets, key=lambda s: digest(POLICY+s)))
        identity = digest(json.dumps(symbols))
        if self.ledger.get('universe_id') != identity:
            self.ledger.set('market_cursor', 0)
            self.ledger.set('universe_id', identity)
            self.ledger.event('universe_updated', {'count':len(symbols), 'id':identity, 'policy':POLICY})
        self.assets, self.watchlist, self.universe_id = assets, symbols, identity
        self.universe_at = now_iso()
        self.symbol = symbols[(self.ledger.get('market_cursor') or 0) % len(symbols)]
        self.ledger.set('market_universe', {'id':identity, 'at':self.universe_at, 'symbols':list(symbols)})

    def blockers(self):
        return super().blockers() + ([] if self.assets else ['Full market universe has not loaded'])

    def set_watchlist(self, symbols):
        raise ValueError('Full-market mode has no handpicked watchlist')

    def resume(self):
        self.discover()
        self.refresh()
        reasons = self.blockers()
        if reasons:
            self.paused = True
            self.message = '; '.join(reasons)
            self.ledger.event('resume_blocked', {'reasons':reasons})
            return False
        self.paused = False
        self.started = datetime.now(UTC)
        self.cache = {}; self.cache_boundary = None; self.probed = set()
        self.message = 'Full market available; waiting for fresh completed inputs'
        self.ledger.event('resume', {'universe_count':len(self.assets), 'policy':POLICY})
        return True

    def size_intent(self, *args): return size_market_order(*args)

    def advance(self, status, detail=''):
        self.ledger.observe(self.symbol, status, detail)
        self.ledger.set('market_cursor', (self.ledger.get('market_cursor') or 0)+1)

    def tick(self, now=None):
        now = now or datetime.now(UTC)
        if not self.assets or self.universe_at[:10] != now.date().isoformat():
            self.discover()
        if time.monotonic()-self.last_refresh > 15 or not self.connected:
            self.refresh(); self.last_refresh = time.monotonic()
        if self.paused: return
        reasons = self.blockers()
        if reasons: self.pause('; '.join(reasons)); return
        if not self.market.get('is_open'):
            self.message = 'Market closed; neural time is frozen'; return
        if any(o['status'] not in TERMINAL for o in self.ledger.orders()):
            self.message = 'Waiting for order reconciliation before the next neural input'; return
        end = now-timedelta(seconds=10)
        boundary = datetime.fromtimestamp(int(end.timestamp())//300*300, UTC)
        start = now-timedelta(days=7)
        if self.calendar_cache is None or self.calendar_cache[0] != now.date():
            self.calendar_cache = (now.date(), self.broker.calendar(start.astimezone(NY).date().isoformat(), now.astimezone(NY).date().isoformat()))
        calendar = self.calendar_cache[1]
        session = next((d for d in calendar if d['date'] == now.astimezone(NY).date().isoformat()), None)
        if not session: self.pause('Market clock and calendar disagree'); return
        opened = datetime.fromisoformat(session['date']+'T'+session['open']).replace(tzinfo=NY)
        if boundary < opened+timedelta(minutes=5) or boundary <= self.started:
            self.message = 'Waiting for the next completed market bar'; return
        cursor = self.ledger.get('market_cursor') or 0
        self.symbol = self.watchlist[cursor % len(self.watchlist)]
        if self.cache_boundary != boundary:
            self.cache = {}; self.cache_boundary = boundary; self.probed = set()
        if self.symbol in self.probed:
            self.message = 'Tour complete for this input boundary; waiting for fresh bars'; return
        if self.symbol not in self.cache:
            batch = [self.watchlist[(cursor+i)%len(self.watchlist)] for i in range(min(16,len(self.watchlist)))]
            self.cache = {s:[] for s in batch}
            self.cache.update(self.broker.bars_many(batch, start.isoformat(), end.isoformat()))
        self.probed.add(self.symbol)
        bars = completed_bars(self.cache[self.symbol], calendar, end)
        if len(bars) < 21:
            self.advance('data_gap', 'Fewer than 21 usable completed IEX bars'); return
        bar = bars[-1]; close = instant(bar['t'])+timedelta(minutes=5)
        self.last_bar = bar
        if close != boundary:
            self.advance('data_gap', 'No current completed IEX bar'); return
        if self.ledger.has_bar(bar['t'], self.symbol):
            self.advance('already_seen', 'Current symbol/bar already evaluated'); return
        position = next((p for p in self.positions if p['symbol']==self.symbol), {})
        rates = encode(bar, bars[:-1], self.account, position)
        self.ledger.set('brain_inflight', {'symbol':self.symbol,'bar':bar['t']})
        try:
            neural = self.brain.stimulate(rates)
            action, reason = decode(neural['buy_hz'], neural['sell_hz'])
            decision = {'id':digest(self.brain.manifest_hash+self.symbol+bar['t']), 'symbol':self.symbol,
                        'context_id':digest(POLICY+self.universe_id+self.brain.manifest_hash+self.settings.max_order+self.settings.max_exposure),
                        'universe_id':self.universe_id, 'selection_policy':POLICY,
                        'created_at':now_iso(), 'bar':bar, 'feed':'iex', 'adjustment':'raw',
                        'stimulus_hz':rates, 'neural':neural, 'action':action, 'reason':reason,
                        'account':self.account.copy(), 'position':position.copy()}
            from .learning_policy import decide
            decide(self, decision)
            action, reason = decision['action'], decision['reason']
            checkpoint = self.settings.database.parent/'brain.checkpoint'
            temp = checkpoint.with_suffix('.tmp')
            self.brain.checkpoint(temp); os.replace(temp, checkpoint)
            self.ledger.decision(decision)
            self.ledger.set('brain_steps', self.brain.steps)
            self.advance(action, reason)
            self.ledger.set('brain_inflight', None)
        except Exception:
            self.fatal=True; self.pause('Neural step interrupted; checkpoint recovery required'); raise
        self.session_evaluated += 1
        self.message = f'{self.symbol} · {action}: {reason}'
        if action == 'HOLD': return
        self.refresh(); self.last_refresh=time.monotonic()
        # A decision must still refer to the most recently available completed bar.
        current = datetime.now(UTC)
        latest = datetime.fromtimestamp(int((current-timedelta(seconds=10)).timestamp())//300*300, UTC)
        if self.blockers() or not self.market.get('is_open') or latest != close:
            self.ledger.event('execution_blocked', {'symbol':self.symbol,'decision_id':decision['id'],'reason':'Account changed, market closed, or a newer bar is available'})
            return
        if not self.before_submit(): return
        position = next((p for p in self.positions if p['symbol']==self.symbol), {})
        self.submit_intent(decision, position, self.broker.asset(self.symbol))

    def snapshot(self):
        s = super().snapshot()
        records = self.ledger.coverage()
        statuses = {r['symbol']:r['status'] for r in records if r['symbol'] in self.assets}
        counts = Counter(statuses.values())
        s['selection_policy'] = POLICY
        s['next_symbol'] = self.watchlist[(self.ledger.get('market_cursor') or 0)%len(self.watchlist)] if self.watchlist else None
        # Universe membership and latest coverage travel separately from the bounded log.
        s['universe'] = {'mode':'all_alpaca_us_equities', 'id':self.universe_id, 'updated_at':self.universe_at,
                         'total':len(self.assets), 'fractionable':sum(bool(a.get('fractionable')) for a in self.assets.values()),
                         'symbols':list(self.watchlist), 'statuses':statuses, 'counts':dict(counts),
                         'unseen':len(self.assets)-len(statuses), 'recent':records[:30],
                         'cursor':self.ledger.get('market_cursor') or 0,
                         'session_evaluated':self.session_evaluated,
                         'session_seconds':round(time.monotonic()-self.session_started,1),
                         'scope':'All active, tradable Alpaca US equity symbols, including ETFs. Current IEX data required. No global exchanges, options or crypto.'}
        check = self.settings.database.parent/'market-check.json'
        s['market_check'] = json.loads(check.read_text()) if check.exists() else None
        s['watchlist'] = []
        return s
