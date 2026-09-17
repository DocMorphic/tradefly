"""Local, read-only learning service. Never submits or cancels broker orders."""
import argparse
import fcntl
import hashlib
import json
import os
import signal
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from .alpaca import Alpaca, BrokerError
from .config import ROOT, Settings
from .domain import UTC, NY, completed_bars, instant, now_iso
from .corporate_actions import KEY as ACTIONS_KEY, effective
from .learning import VERSION, features, evaluate, HORIZON_BARS, COST_BPS, STRESS_BPS


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, allow_nan=False))
    os.replace(tmp, path)


def label(observation, bars, now):
    """30-minute forward mark, next available 5Min open after actual decision.
    Only contiguous regular-session bars; outcomes become usable after delay.
    """
    at = instant(observation['decision_at'])
    eligible = [b for b in bars if instant(b['t']) > at]
    if len(eligible) < HORIZON_BARS:
        return None
    chosen = eligible[:HORIZON_BARS]
    if instant(chosen[0]['t']) - at > timedelta(minutes=5):
        return None
    for previous, current in zip(chosen, chosen[1:]):
        if instant(current['t']) - instant(previous['t']) != timedelta(minutes=5):
            return None
    exit_at = instant(chosen[-1]['t']) + timedelta(minutes=5)
    available = exit_at + timedelta(minutes=16)
    if available > now or instant(chosen[0]['t']).astimezone(NY).date() != exit_at.astimezone(NY).date():
        return None
    entry, close = float(chosen[0]['o']), float(chosen[-1]['c'])
    if entry <= 0 or close <= 0:
        return None
    return {**observation, 'entry_at': chosen[0]['t'], 'exit_at': exit_at.isoformat(),
            'available_at': available.isoformat(), 'market_date': at.astimezone(NY).date().isoformat(),
            'entry_price': entry, 'exit_price': close, 'gross_bps': (close / entry - 1) * 10000}


def evaluation_cutoff(anchor, now):
    """Predeclared four-week candidate epochs, independent of observed scores.

    At each epoch boundary, mature prior outcomes may train a new candidate.
    Its future period is held out afresh; active execution models stay frozen.
    """
    start = instant(anchor).astimezone(NY)
    days = max(0, (now.astimezone(NY).date() - start.date()).days)
    return (start + timedelta(days=(days // 28) * 28)).astimezone(UTC).isoformat()


class Lab:
    def __init__(self, directory=None, ledger_path=None, broker=None):
        self.directory = Path(directory or ROOT/'runs/learning')
        self.directory.mkdir(parents=True, exist_ok=True)
        self.ledger_path = Path(ledger_path or Settings.load().database)
        self.db = sqlite3.connect(self.directory/'lab.sqlite3')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, symbol TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS pending_observations ON observations(status,symbol,day);
            CREATE TABLE IF NOT EXISTS prices(symbol TEXT NOT NULL, day TEXT NOT NULL, fetched_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(symbol,day));
        ''')
        self.broker = broker or Alpaca(Settings.load())
        self.calendar = {}

    def get(self, key, default=None):
        r = self.db.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        return json.loads(r[0]) if r else default

    def set(self, key, value):
        self.db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, json.dumps(value)))

    def ingest(self):
        with sqlite3.connect(f'file:{self.ledger_path}?mode=ro', uri=True) as source:
            records = source.execute('SELECT rowid,data FROM decisions WHERE rowid>? ORDER BY rowid', (self.get('cursor', 0),)).fetchall()
            quarantine = source.execute("SELECT value FROM settings WHERE key='position_quarantines_v1'").fetchone()
            actions = source.execute('SELECT value FROM settings WHERE key=?', (ACTIONS_KEY,)).fetchone()
        action_state = json.loads(actions[0]) if actions else {}
        self.action_state = action_state
        excluded = set(json.loads(quarantine[0])) if quarantine else set()
        with self.db:
            for rowid, raw in records:
                d = json.loads(raw)
                x = features(d.get('neural', {}))
                status = 'pending' if x else 'no_neural_trace'
                if d['symbol'] in excluded: status = 'quarantined'
                created = instant(d['created_at']).astimezone(UTC)
                neural = d.get('neural', {})
                r = {'id': d['id'], 'symbol': d['symbol'], 'decision_at': created.isoformat(),
                     'fly': d.get('fly_id', 'fly-1'), 'x': x, 'original': d.get('original_action', d['action']),
                     'held': float(d.get('position', {}).get('qty') or 0) > 0,
                     'momentum': float(d.get('stimulus_hz', {}).get('return_up', 10)) - float(d.get('stimulus_hz', {}).get('return_down', 10)),
                     'manifest_hash': neural.get('manifest_hash')}
                self.db.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?)',
                                (r['id'], r['symbol'], created.astimezone(NY).date().isoformat(), status, json.dumps(r)))
                self.set('cursor', rowid)
                if status == 'pending' and not self.get('cutoff'):
                    # Predetermined after the first neural-trace day, before evaluating outcomes.
                    cutoff = datetime.combine(created.astimezone(NY).date()+timedelta(days=1), datetime.min.time(), NY).astimezone(UTC)
                    self.set('cutoff', cutoff.isoformat())
                    self.set('manifest_hash', neural.get('manifest_hash'))
            for symbol in excluded:
                self.db.execute("UPDATE observations SET status='quarantined' WHERE symbol=?", (symbol,))
            # Any post-incident account input can contain distorted equity/cash.
            # Keep source decisions; exclude their derived training observations.
            for issue in action_state.get('issues', []):
                self.db.execute("UPDATE observations SET status='corporate_action' WHERE status IN ('ready','pending') AND json_extract(payload,'$.decision_at')>=?", (issue['effective_at'],))
            for event in action_state.get('events', []):
                at = effective(event).isoformat()
                self.db.execute("UPDATE observations SET status='corporate_action' WHERE symbol=? AND status IN ('ready','pending') AND julianday(json_extract(payload,'$.decision_at')) BETWEEN julianday(?,'-40 minutes') AND julianday(?,'+7 days')", (event['symbol'],at,at))

    def fetch_day(self, symbol, day, now):
        cached = self.db.execute('SELECT * FROM prices WHERE symbol=? AND day=?', (symbol, day)).fetchone()
        end_of_day = (datetime.fromisoformat(day)+timedelta(days=1)).replace(tzinfo=NY).astimezone(UTC)
        if cached and (instant(cached['fetched_at']) >= end_of_day+timedelta(minutes=16) or (now-instant(cached['fetched_at'])).total_seconds() < 300):
            return json.loads(cached['payload']), False
        if day not in self.calendar:
            self.calendar[day] = self.broker.calendar(day, day)
        start = datetime.fromisoformat(day).replace(tzinfo=NY).astimezone(UTC)
        end = min(start+timedelta(days=1), now-timedelta(minutes=16))
        bars, token, seen = [], None, set()
        while True:
            params = {'symbols': symbol, 'timeframe': '5Min', 'feed': 'sip', 'adjustment': 'raw',
                      'start': start.isoformat(), 'end': end.isoformat(), 'sort': 'asc', 'limit': 10000}
            if token: params['page_token'] = token
            result = self.broker.request('GET', '/v2/stocks/bars', data=True, params=params)
            bars.extend(result.get('bars', {}).get(symbol, []))
            token = result.get('next_page_token')
            if not token: break
            if token in seen or len(seen) >= 10: raise ValueError('Repeated history pagination')
            seen.add(token)
        bars = completed_bars(bars, self.calendar[day], end)
        with self.db:
            self.db.execute('INSERT INTO prices VALUES(?,?,?,?) ON CONFLICT(symbol,day) DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload',
                            (symbol, day, now.isoformat(), json.dumps(bars)))
        return bars, True

    def cycle(self, max_fetches=40, stop=None):
        stop = stop or threading.Event()
        now = datetime.now(UTC)
        self.ingest()
        self.report('Collecting delayed outcomes')
        groups = self.db.execute("SELECT DISTINCT symbol,day FROM observations WHERE status='pending' ORDER BY day,symbol").fetchall()
        fetched, errors = 0, 0
        for symbol, day in groups:
            if stop.is_set() or fetched >= max_fetches: break
            try:
                bars, requested = self.fetch_day(symbol, day, now)
                fetched += int(requested)
                if requested: stop.wait(.5) # Bounded below free API limits alongside the trading worker.
                observations = self.db.execute("SELECT payload FROM observations WHERE status='pending' AND symbol=? AND day=?", (symbol, day)).fetchall()
                with self.db:
                    for raw, in observations:
                        r = json.loads(raw)
                        outcome = label(r, bars, now)
                        if outcome:
                            status = 'ready' if r['manifest_hash'] == self.get('manifest_hash') else 'different_brain'
                            self.db.execute('UPDATE observations SET status=?,payload=? WHERE id=?', (status, json.dumps(outcome), r['id']))
                        elif day < now.astimezone(NY).date().isoformat():
                            self.db.execute("UPDATE observations SET status='unavailable' WHERE id=?", (r['id'],))
            except (BrokerError, ValueError, KeyError, TypeError):
                errors += 1
                fetched += 1
            if fetched and fetched % 10 == 0: self.report('Collecting delayed outcomes')
        return self.report('Learning in shadow' if not errors else 'Some market history unavailable; will retry', errors)

    def report(self, status, errors=0):
        rows = [json.loads(r[0]) for r in self.db.execute("SELECT payload FROM observations WHERE status='ready'")]
        anchor = self.get('cutoff')
        cutoff = evaluation_cutoff(anchor, datetime.now(UTC)) if anchor else '9999-01-01T00:00:00+00:00'
        result = evaluate(rows, cutoff)
        counts = dict(self.db.execute('SELECT status,COUNT(*) FROM observations GROUP BY status'))
        pending_train = self.db.execute("SELECT COUNT(*) FROM observations WHERE status='pending' AND json_extract(payload,'$.decision_at')<?", (cutoff,)).fetchone()[0]
        result['requirements'].append({'label': 'Training outcomes collected', 'passed': pending_train == 0 and result['training_count'] > 0})
        action_state = getattr(self, 'action_state', {})
        checked = action_state.get('checked_at')
        result['requirements'].append({'label': 'Corporate-action valuation verified', 'passed': bool(checked and action_state.get('status') == 'checked' and not action_state.get('issues') and datetime.now(UTC)-instant(checked)<timedelta(minutes=30))})
        result['eligible'] = all(r['passed'] for r in result['requirements'])
        candidate = {'version': VERSION, 'manifest_hash': self.get('manifest_hash'), 'models': result.pop('models'),
                     'cutoff': cutoff, 'eligible': result['eligible']}
        candidate['id'] = hashlib.sha256(json.dumps(candidate, sort_keys=True).encode()).hexdigest()
        result.pop('shadow_predictions')
        shadow_models = result.pop('shadow_models')
        result['memory'] = [{'fly': fly, 'updates': m['updates'], 'fast_strength': sum(abs(v) for v in m['fast']),
                             'slow_strength': sum(abs(v) for v in m['slow'])} for fly, m in shadow_models.items()]
        atomic(self.directory/'shadow.json', {'version': VERSION, 'manifest_hash': self.get('manifest_hash'), 'updated_at': now_iso(), 'models': shadow_models})
        # Bound telemetry without altering the metrics calculated over ALL observations.
        curve = result['curve']
        if len(curve) > 200:
            import numpy as np
            result['curve'] = [curve[i] for i in np.linspace(0, len(curve)-1, 200, dtype=int)]
        result.update({'status': status, 'updated_at': now_iso(), 'counts': counts, 'errors': errors,
                       'candidate_id': candidate['id'], 'cost_bps': COST_BPS, 'stress_bps': STRESS_BPS,
                       'horizon_minutes': HORIZON_BARS*5, 'neural_feature_count': 37,
                       'scope': 'Independent hypothetical $100 opportunities, not portfolio returns or broker fills. Historical shadow replay; no exploration orders.',
                       'biology': 'Fixed fly connectome plus engineered reward-modulated associative readout. This is fly-inspired learning, not reconstructed biological plasticity.'})
        atomic(self.directory/'candidate.json', candidate)
        atomic(self.directory/'report.json', result)
        return result

    def close(self):
        self.broker.close()
        self.db.close()


def serve(stop=None, once=False, max_fetches=40):
    stop = stop or threading.Event()
    directory = ROOT/'runs/learning'
    directory.mkdir(parents=True, exist_ok=True)
    with (directory/'worker.lock').open('a') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: return
        lab = Lab(directory)
        try:
            while not stop.is_set():
                try:
                    result = lab.cycle(max_fetches, stop)
                    print(json.dumps({'learning': result['status'], 'counts': result['counts'], 'eligible': result['eligible']}), flush=True)
                except Exception:
                    # Never print credentials or arbitrary broker response bodies.
                    lab.report('Learning worker encountered an error; retrying', 1)
                if once: break
                stop.wait(60)
        finally: lab.close()


def start_background():
    stop = threading.Event()
    threading.Thread(target=serve, args=(stop,), daemon=True, name='learning-lab').start()
    return stop


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--max-fetches', type=int, default=40)
    args = parser.parse_args()
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    serve(stop, args.once, max(1, min(args.max_fetches, 300)))
