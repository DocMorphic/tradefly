import test from 'node:test';
import assert from 'node:assert/strict';
import { validHistory, validChartSymbol } from '../lib/market-history.ts';

const now = Date.parse('2026-09-15T15:00:00Z');
const history = {
  symbol: 'FEMY',
  feed: 'sip',
  delay_minutes: 15,
  timeframe: '5Min',
  fetched_at: new Date(now).toISOString(),
  through: '2026-09-15T14:44:00Z',
  bars: [
    {
      symbol: 'FEMY',
      at: Date.parse('2026-09-15T14:35:00Z'),
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 123,
    },
  ],
};

void test('accept delayed history but reject incomplete, mixed-symbol, unordered and invalid prices', () => {
  assert.ok(validHistory(history, now));
  assert.ok(validHistory({ ...history, bars: [] }, now));
  assert.equal(
    validHistory({ ...history, through: '2026-09-15T14:55:00Z' }, now),
    false,
  );
  for (const patch of [
    { at: Date.parse('2026-09-15T14:40:00Z') },
    { symbol: 'AAPL' },
    { high: 8 },
    { close: null },
    { volume: -1 },
  ]) {
    assert.equal(
      validHistory(
        { ...history, bars: [{ ...history.bars[0], ...patch }] },
        now,
      ),
      false,
    );
  }
  assert.equal(
    validHistory({ ...history, bars: [history.bars[0], history.bars[0]] }, now),
    false,
  );
  assert.equal(validHistory({ ...history, feed: 'iex' }, now), false);
});
void test('symbol input permits tickers but excludes arbitrary paths and queries', () => {
  for (const symbol of ['AAPL', 'BRK.B', 'BF-B'])
    assert.ok(validChartSymbol(symbol));
  for (const symbol of ['', '../secrets', 'aapl', 'AAPL&feed=sip', null])
    assert.equal(validChartSymbol(symbol), false);
});
