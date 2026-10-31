"""Opt-in, local crypto paper experiment. Never starts the stock worker or sends broker orders."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import time
from datetime import datetime

import httpx
from dotenv import dotenv_values
from .config import ROOT, bridge_headers, bridge_target
from .crypto_paper import SYMBOLS, CryptoLedger, candles
from .domain import UTC


def fetch_bars(client, symbol):
    if symbol not in SYMBOLS:
        raise ValueError('Unsupported pair')
    now = datetime.now(UTC)
    response = client.get(f'https://api.exchange.coinbase.com/products/{symbol.replace("/", "-")}/candles',
                          params={'granularity': 300})
    if response.status_code != 200:
        raise ValueError('Crypto market feed unavailable')
    return candles(response.json(), now)


def checkpoint_digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def restore_checkpoint(brain, ledger, directory):
    if ledger.state['inflight']:
        raise ValueError('Interrupted crypto neural step; restore the ledger and checkpoint from a matched backup')
    expected = ledger.state['checkpoint_hash']
    current, staged = directory / 'brain.checkpoint', directory / 'brain.checkpoint.next'
    if expected:
        # A crash after committing a decision but before rename is recoverable.
        if staged.exists() and checkpoint_digest(staged) == expected:
            os.replace(staged, current)
        if not current.exists() or checkpoint_digest(current) != expected:
            raise ValueError('Crypto checkpoint does not match the committed ledger')
        brain.restore(current)
    elif ledger.state['sequence']:
        raise ValueError('Crypto ledger has decisions but no checkpoint')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Explicitly opt in to the crypto experiment')
    parser.add_argument('--resume-paper', action='store_true', help='Evaluate with the validated full brain and simulated funds')
    parser.add_argument('--once', action='store_true', help='Stop after one evaluation pass')
    parser.add_argument('--publish', action='store_true', help='Publish separate crypto telemetry to the configured website')
    parser.add_argument('--export', type=Path, help='Export a batch without loading a brain or accessing any network')
    parser.add_argument('--first-sequence', type=int, default=1)
    args = parser.parse_args()
    directory = ROOT / 'runs/crypto-lab'
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'worker.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('A crypto experiment is already running')
        if not args.export and not args.run:
            parser.error('Use --run to opt in, or --export to export recorded receipts')
        ledger = CryptoLedger(directory / 'ledger.sqlite3')
        try:
            if args.export:
                result = ledger.export(args.first_sequence)
                if not result:
                    raise SystemExit('No receipts in that range')
                args.export.write_text(json.dumps(result, indent=2))
                args.export.chmod(0o600)
                print('Receipt batch exported; no network or brain was started.')
                return
            if not args.resume_paper:
                print('Crypto Lab is paused. Add --resume-paper to explicitly evaluate with simulated funds.')
                return
            # Only this explicit path imports/loads the full graph, with its own fresh state.
            from .brain import FlyBrain
            brain = FlyBrain()
            if not brain.ready:
                raise SystemExit('Full brain and checkpoint validation must pass before crypto evaluation')
            restore_checkpoint(brain, ledger, directory)
            ledger.validate_experiment(brain)
            config = dotenv_values(ROOT / '.env.bridge') if args.publish else {}
            headers = bridge_headers(config) if args.publish else None
            if args.publish and not headers:
                raise SystemExit('Configure bridge credentials before requesting publication')
            running = True
            def stop(*_):
                nonlocal running
                running = False
            signal.signal(signal.SIGTERM, stop)
            signal.signal(signal.SIGINT, stop)
            def checkpoint():
                staged = directory / 'brain.checkpoint.next'
                brain.checkpoint(staged)
                with staged.open('rb') as stream:
                    os.fsync(stream.fileno())
                return checkpoint_digest(staged)
            with httpx.Client(timeout=12, follow_redirects=False) as client:
                while running:
                    try:
                        markets = {s: fetch_bars(client, s) for s in SYMBOLS}
                        ledger.mark(markets)
                        for symbol in SYMBOLS:
                            row = ledger.evaluate(symbol, markets[symbol], brain, datetime.now(UTC), checkpoint)
                            if row:
                                os.replace(directory / 'brain.checkpoint.next', directory / 'brain.checkpoint')
                                print(f"Crypto paper decision {row['record']['sequence']}: {symbol} {row['record']['action']}", flush=True)
                        if headers:
                            response = client.post(bridge_target(config) + '/api/crypto/bridge',
                                                   json=ledger.snapshot(), headers=headers)
                            if response.status_code != 200:
                                raise ValueError('Crypto telemetry rejected; local records preserved')
                    except (httpx.HTTPError, ValueError, KeyError):
                        # No secret-bearing request or exception body reaches logs.
                        print('Crypto pass stopped: check market coverage, checkpoint consistency and publication settings.', flush=True)
                        if ledger.state['inflight']:
                            break
                    if args.once:
                        break
                    for _ in range(60):
                        if not running:
                            break
                        time.sleep(1)
        finally:
            ledger.close()


if __name__ == '__main__':
    main()
