import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finite,
  equitySeries,
  paperTradingData,
  demoTradingData,
  selectedMarket,
} from '../lib/trading-charts.ts';
import type { BackendSnapshot, PaperDecision } from '../lib/backend.ts';
import { SESSION } from '../lib/experiment.ts';
const decision = (
  symbol: string,
  id: string,
  t: string,
  close: number,
): PaperDecision => ({
  id,
  symbol,
  created_at: t,
  action: 'BUY',
  reason: 'Measured lead',
  bar: { t, o: close - 1, h: close + 1, l: close - 2, c: close, v: 100 },
  feed: 'iex',
  neural: { buy_hz: 30, sell_hz: 10 } as PaperDecision['neural'],
  account: {},
  position: {},
  stimulus_hz: {},
});
function snapshot(): BackendSnapshot {
  return {
    symbol: 'AAPL',
    feed: 'iex',
    account: { equity: '110', cash: '50' },
    baseline: { equity: '100', at: '2026-09-15T14:00:00Z' },
    equity_change_usd: 10,
    updated_at: '2026-09-15T14:15:00Z',
    equity_history: [{ at: '2026-09-15T14:10:00Z', equity: '110', cash: '50' }],
    positions: [
      {
        symbol: 'AAPL',
        market_value: '60',
        unrealized_pl: '3',
        unrealized_plpc: '0.05',
        qty: '0.3',
      },
    ],
    decisions: [
      decision('AAPL', 'a', '2026-09-15T14:00:00Z', 200),
      decision('MSFT', 'b', '2026-09-15T14:05:00Z', 400),
      decision('AAPL', 'c', '2026-09-15T14:10:00Z', 202),
    ],
    decision_count: 200,
    orders: [],
    broker: { connected: true },
  } as unknown as BackendSnapshot;
}
test('missing financial fields remain unknown, not zero', () => {
  for (const x of [null, undefined, '', NaN, Infinity, true])
    assert.equal(finite(x), null);
  assert.equal(finite('0'), 0);
  const s = snapshot();
  s.baseline = null;
  s.account = {};
  s.equity_change_usd = null;
  const data = paperTradingData(s);
  assert.equal(data.pnl, null);
  assert.equal(data.cash, null);
  assert.equal(data.equity, null);
  assert.equal(data.series[0].pnl, null);
});
test('equity is chronological; profit uses baseline and drawdown uses preceding visible peaks', () => {
  const rows = equitySeries(
    [
      { at: 3, equity: 108, cash: null },
      { at: 1, equity: 100, cash: null },
      { at: 2, equity: 120, cash: null },
    ],
    90,
  );
  assert.deepEqual(
    rows.map((r) => r.pnl),
    [10, 30, 18],
  );
  assert.ok(Math.abs(rows[2].drawdown + 10) < 1e-9);
  assert.equal(rows[0].drawdown, 0);
});
test('stock series never mixes symbols, preserves gaps, and deduplicates same-bar observations', () => {
  const s = snapshot();
  s.decisions.push({ ...s.decisions[0], id: 'another-fly' });
  const data = paperTradingData(s),
    aapl = selectedMarket(data, 'AAPL', 60);
  assert.deepEqual(
    aapl.map((p) => p.close),
    [200, 202],
  );
  assert.equal(aapl[1].at - aapl[0].at, 600000);
  assert.deepEqual(
    selectedMarket(data, 'MSFT', 24).map((p) => p.close),
    [400],
  );
  assert.equal(selectedMarket(data, 'UNKNOWN', 24).length, 0);
  assert.equal(data.positions[0].returnPct, 5);
});
test('fill markers require actual quantity, price and timestamp and retain the exact decision link', () => {
  const s = snapshot();
  s.orders = [
    {
      client_id: 'pending',
      decision_id: 'a',
      status: 'accepted',
      payload: { side: 'buy', symbol: 'AAPL', notional: '100' },
      broker: null,
    },
    {
      client_id: 'partial',
      decision_id: 'b',
      status: 'partially_filled',
      payload: { side: 'buy', symbol: 'MSFT' },
      broker: {
        filled_at: '2026-09-15T14:06:00Z',
        filled_avg_price: '401',
        filled_qty: '0.2',
      },
    },
    {
      client_id: 'bad',
      decision_id: 'c',
      status: 'filled',
      payload: { side: 'buy', symbol: 'AAPL' },
      broker: { filled_at: null, filled_avg_price: '202', filled_qty: '1' },
    },
  ];
  const data = paperTradingData(s);
  assert.equal(data.fills.length, 1);
  assert.equal(data.fills[0].decisionId, 'b');
  assert.equal(data.fills[0].value, 80.2);
  assert.equal(data.decisions[0].status, 'accepted');
});
test('demo charts never add future fills or fabricate candle OHLC values', () => {
  const data = demoTradingData(SESSION.slice(0, 10));
  assert.equal(data.bars.length, 10);
  assert.equal(data.bars[0].open, undefined);
  assert.equal(data.pnl, SESSION[9].equity - 10000);
  assert.ok(data.fills.every((f) => f.at <= data.updatedAt));
  assert.equal(data.fills.length, SESSION[9].trades.length);
});

test('All time retains old history while 6H uses the snapshot clock', async () => {
  const { accountRange } = await import('../lib/trading-charts.ts');
  const s = snapshot();
  s.updated_at = '2026-09-17T14:00:00Z';
  s.equity_history = [
    { at: '2026-09-14T00:00:00Z', equity: '100', cash: '50' },
    { at: '2026-09-17T07:59:00Z', equity: '120', cash: '50' },
    {
      at: '2026-09-17T08:00:00Z',
      equity: '110',
      cash: '50',
      drawdown: -20,
      gap_before: false,
    },
    { at: '2026-09-17T13:00:00Z', equity: '115', cash: '50', gap_before: true },
  ];
  const data = paperTradingData(s);
  assert.equal(accountRange(data, 'all').length, 4);
  assert.equal(accountRange(data, '6').length, 2);
  assert.equal(accountRange(data, '1').length, 1);
  assert.equal(
    data.series[2].drawdown,
    -20,
    'Use drawdown computed before downsampling',
  );
  assert.equal(data.series[2].gapBefore, false);
  assert.equal(data.series[3].gapBefore, true);
});

test('corporate-action warning withholds gains and affected graph segments, preserving raw balances', () => {
  const s = snapshot();
  s.equity_change_usd = 2400;
  s.corporate_actions = {
    status: 'review_required',
    performance_verified: false,
    checked_at: s.updated_at,
    affected_since: '2026-09-15T14:05:00Z',
    message: 'Reconcile split',
    issues: [
      {
        id: 'split',
        symbol: 'AAPL',
        type: 'reverse_split',
        date: '2026-09-15',
        effective_at: '2026-09-15T14:05:00Z',
        broker_qty: '299',
        pre_action_qty: '299',
        reason: 'Split mismatch',
        status: 'quantity_mismatch',
      },
    ],
  };
  s.equity_history.unshift({
    at: '2026-09-15T14:00:00Z',
    equity: '100',
    cash: '50',
  });
  const before = JSON.stringify(s),
    data = paperTradingData(s);
  assert.equal(data.pnl, null);
  assert.equal(data.series[0].pnl, 0);
  assert.equal(data.series[1].pnl, null);
  assert.equal(data.series[1].drawdown, null);
  assert.equal(data.positions[0].pnl, null);
  assert.equal(data.positions[0].returnPct, null);
  assert.equal(data.equity, 110);
  assert.equal(JSON.stringify(s), before);
});
