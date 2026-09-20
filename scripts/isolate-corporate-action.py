"""Explicit offline paper-position isolation. Preserves broker state and original history."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import sqlite3
from tradefly.config import Settings
from tradefly.market import MarketEngine
from tradefly.isolation import approve

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--symbol', action='append', required=True)
parser.add_argument('--reason', required=True)
args = parser.parse_args()
settings = Settings.load()
with (settings.database.parent/'worker.lock').open('a') as lock:
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: raise SystemExit('Stop the worker before running an isolation audit')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = settings.database.parent/f'before-isolation-{stamp}.sqlite3'
    with sqlite3.connect(settings.database) as source, sqlite3.connect(backup) as target:
        source.backup(target)
    engine = MarketEngine(settings)
    try:
        result = approve(engine, args.symbol, args.reason)
        print(json.dumps({'backup': str(backup), 'isolation': result, 'paused': engine.paused}, indent=2))
    finally:
        engine.broker.close(); engine.ledger.close()
