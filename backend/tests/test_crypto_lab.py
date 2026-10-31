from datetime import datetime, timedelta
from decimal import Decimal
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from tradefly.crypto_receipts import bundle, canonical, receipt
from tradefly.crypto_paper import CryptoLedger, candles, decimal, equity, fresh_account, observation, settle, stamp
from tradefly.crypto_runner import restore_checkpoint
from tradefly.domain import UTC, instant


def bars_at(now):
    end = now.replace(minute=(now.minute // 5) * 5, second=0, microsecond=0)
    return [{'at': stamp(end - timedelta(minutes=(21 - i) * 5)), 'open': '60000', 'high': '60020',
             'low': '59990', 'close': '60010', 'volume': '12'} for i in range(21)]


def evaluation_time():
    now = datetime.now(UTC)
    return now.replace(minute=(now.minute // 5) * 5, second=30, microsecond=0)


class Brain:
    manifest_hash = 'a' * 64
    def __init__(self, buy=32, sell=4): self.buy, self.sell, self.steps = buy, sell, 0
    def stimulate(self, rates):
        self.steps += 1
        return {'buy_hz': self.buy, 'sell_hz': self.sell, 'state_id': f'fixture:{self.steps}'}


def test_python_javascript_wire_vector():
    vector = json.loads((Path(__file__).parents[2] / 'tests/fixtures/crypto-receipts.json').read_text())
    assert [receipt(r['record']) for r in vector['receipts']] == vector['receipts']
    assert bundle(vector['receipts']) == vector
    for value in (1.5, float('nan'), 2**54, {'非ASCII': 'key'}):
        with pytest.raises(ValueError): canonical(value)


def test_future_fill_and_cost_conservation(tmp_path):
    now = evaluation_time()
    bars = bars_at(now)
    ledger = CryptoLedger(tmp_path / 'crypto.sqlite3')
    brain = Brain()
    ledger.mark({'BTC/USD': bars})
    row = ledger.evaluate('BTC/USD', bars, brain, now, lambda: 'c' * 64)
    assert row['record']['action'] == 'BUY'
    assert ledger.state['account']['cash'] == '10000'
    eligible = instant(ledger.state['account']['pending']['not_before'])
    assert eligible > instant(row['record']['decided_at'])
    assert ledger.evaluate('ETH/USD', bars, brain, now, lambda: 'c' * 64) is None
    assert brain.steps == 1
    before = {**bars[-1], 'at': stamp(eligible - timedelta(minutes=5))}
    ledger.mark({'BTC/USD': [before]})
    assert not ledger.state['account']['fills']
    future = {**bars[-1], 'at': stamp(eligible), 'open': '61000'}
    ledger.mark({'BTC/USD': [future]})
    account = ledger.state['account']
    fill = account['fills'][0]
    assert fill['at'] == stamp(eligible)
    assert Decimal(fill['price']) > Decimal(future['open'])
    assert Decimal(fill['fee']) > 0
    assert abs(Decimal(account['cash']) + Decimal(account['holdings']['BTC/USD']['cost_basis']) - Decimal(10000)) < Decimal('.00000001')
    assert account['pending'] is None
    assert ledger.export()['receipts'][0] == row
    ledger.close()


def test_actual_python_snapshot_verifies_in_browser_implementation(tmp_path):
    import subprocess
    import shutil
    root = Path(__file__).parents[2]
    ledger = CryptoLedger(tmp_path / 'crypto.sqlite3')
    now = evaluation_time(); bars = bars_at(now)
    ledger.mark({'BTC/USD': bars})
    ledger.evaluate('BTC/USD', bars, Brain(), now, lambda: 'c' * 64)
    output = tmp_path / 'snapshot.json'; output.write_text(json.dumps(ledger.snapshot()))
    subprocess.run([shutil.which('node'), '--experimental-strip-types', '--input-type=module', '-e',
        "import {readFileSync} from 'node:fs'; import {parseCryptoSnapshot} from './lib/crypto/snapshot.ts'; "
        "const s=await parseCryptoSnapshot(JSON.parse(readFileSync(process.argv[1],'utf8'))); "
        "if(s.decision_count!==1) throw Error('Snapshot did not round trip');", str(output)],
        cwd=root, check=True, capture_output=True, text=True)
    ledger.close()


def test_entry_budget_counts_both_assets_and_sell_preserves_basis(tmp_path):
    now = evaluation_time(); bars = bars_at(now)
    ledger = CryptoLedger(tmp_path / 'crypto.sqlite3')
    a = ledger.state['account']
    a['holdings']['ETH/USD'] = {'quantity': '.5', 'cost_basis': '1000', 'mark': '2000'}
    a['cash'] = '9000'
    ledger.mark({'BTC/USD': bars})
    ledger.evaluate('BTC/USD', bars, Brain(), now, lambda: 'c' * 64)
    assert Decimal(a['holdings']['ETH/USD']['quantity']) == Decimal('.5')
    assert Decimal(ledger.state['account']['pending']['budget']) == 0
    a = fresh_account()
    a['cash'] = '9900'; a['holdings']['BTC/USD'] = {'quantity': '.002', 'cost_basis': '100', 'mark': '60000'}
    a['pending'] = {'sequence': 1, 'symbol': 'BTC/USD', 'side': 'SELL', 'not_before': '2026-01-01T00:05:00Z', 'budget': '0', 'quantity': '.002'}
    settle(a, 'BTC/USD', [{'at': '2026-01-01T00:05:00Z', 'open': '60000'}])
    assert Decimal(a['holdings']['BTC/USD']['quantity']) >= 0
    assert Decimal(a['holdings']['BTC/USD']['cost_basis']) > 0
    assert abs(Decimal(a['cash']) + Decimal(a['holdings']['BTC/USD']['cost_basis']) - Decimal(10000) - Decimal(a['realized'])) < Decimal('.00000001')
    ledger.close()


def test_no_shorts_exposure_and_missing_fill_bar():
    account = fresh_account()
    account['pending'] = {'sequence': 1, 'symbol': 'BTC/USD', 'side': 'SELL',
                          'not_before': '2026-01-01T00:05:00Z', 'budget': '100', 'quantity': '1'}
    settle(account, 'BTC/USD', [{'at': '2026-01-01T00:05:00Z', 'open': '60000'}])
    assert account['fills'][0]['status'] == 'vetoed'
    assert account['cash'] == '10000'
    account['pending'] = {'sequence': 2, 'symbol': 'BTC/USD', 'side': 'BUY',
                          'not_before': '2026-01-01T00:10:00Z', 'budget': '100', 'quantity': '0'}
    settle(account, 'BTC/USD', [{'at': '2026-01-01T00:15:00Z', 'open': '60000'}])
    assert account['fills'][-1]['status'] == 'canceled-data-gap'
    assert account['cash'] == '10000'


def test_completed_contiguous_fresh_inputs_and_duplicate_decisions(tmp_path):
    now = evaluation_time()
    bars = bars_at(now)
    assert len(observation(bars, now)) == 21
    bad = [dict(b) for b in bars]; bad[2]['at'] = bad[1]['at']
    with pytest.raises(ValueError, match='gap'): observation(bad, now)
    with pytest.raises(ValueError, match='stale'): observation(bars, now + timedelta(minutes=10))
    ledger = CryptoLedger(tmp_path / 'crypto.sqlite3'); brain = Brain(0, 0)
    ledger.mark({'BTC/USD': bars})
    first = ledger.evaluate('BTC/USD', bars, brain, now, lambda: 'c' * 64)
    assert first['record']['action'] == 'HOLD'
    assert ledger.evaluate('BTC/USD', bars, brain, now, lambda: 'c' * 64) is None
    assert brain.steps == 1
    ledger.close()


def test_interrupted_neural_step_fails_closed_across_restart(tmp_path):
    path = tmp_path / 'crypto.sqlite3'
    ledger = CryptoLedger(path)
    now = evaluation_time(); bars = bars_at(now)
    ledger.mark({'BTC/USD': bars})
    def interrupted(): raise RuntimeError('Power loss during checkpoint')
    with pytest.raises(RuntimeError): ledger.evaluate('BTC/USD', bars, Brain(), now, interrupted)
    ledger.close()
    reopened = CryptoLedger(path)
    with pytest.raises(ValueError, match='Interrupted'): reopened.evaluate('BTC/USD', bars, Brain(), now, lambda: 'c' * 64)
    assert reopened.export() is None
    reopened.close()


def test_committed_staged_checkpoint_recovers_but_unmatched_checkpoint_refuses(tmp_path):
    import hashlib
    expected = hashlib.sha256(b'committed').hexdigest()
    staged = tmp_path / 'brain.checkpoint.next'; staged.write_bytes(b'committed')
    ledger = SimpleNamespace(state={'inflight': False, 'checkpoint_hash': expected})
    restored = []
    restore_checkpoint(SimpleNamespace(restore=restored.append), ledger, tmp_path)
    assert restored == [tmp_path / 'brain.checkpoint']
    assert not staged.exists()
    (tmp_path / 'brain.checkpoint').write_bytes(b'wrong state')
    with pytest.raises(ValueError, match='match'): restore_checkpoint(SimpleNamespace(restore=restored.append), ledger, tmp_path)


def test_candle_validation_works_on_weekends_without_stock_calendar():
    now = datetime(2026, 10, 31, 10, 15, tzinfo=UTC)
    t = int(now.timestamp())
    result = candles([[t - 300, 99, 102, 100, 101, 12], [t, 99, 102, 100, 101, 12]], now)
    assert len(result) == 1
    with pytest.raises(ValueError): candles([[t - 300, 103, 102, 100, 101, 12]], now)
