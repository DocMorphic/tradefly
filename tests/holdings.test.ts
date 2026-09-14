import test from 'node:test';
import assert from 'node:assert/strict';
import { holdingsWithFills, selectHoldings } from '../lib/holdings.ts';
import type { PaperOrder } from '../lib/backend.ts';

const defaults = {
  sort: 'market_value' as const,
  direction: 'asc' as const,
  query: '',
  pnl: 'all' as const,
  from: '',
  to: '',
};
test('holdings sort numbers numerically, preserve source order and keep unknowns last', () => {
  const rows = [
    { symbol: 'A', market_value: '100' },
    { symbol: 'B', market_value: '9' },
    { symbol: 'C', market_value: '' },
  ];
  assert.deepEqual(
    selectHoldings(rows, defaults).map((r) => r.symbol),
    ['B', 'A', 'C'],
  );
  assert.deepEqual(
    selectHoldings(rows, { ...defaults, direction: 'desc' }).map(
      (r) => r.symbol,
    ),
    ['A', 'B', 'C'],
  );
  assert.deepEqual(
    rows.map((r) => r.symbol),
    ['A', 'B', 'C'],
  );
});
test('latest fill joins exact symbols, ignores pending orders and does not invent missing dates', () => {
  const order = (symbol: string, at: string, qty: string): PaperOrder => ({
    client_id: 'x',
    decision_id: 'd',
    status: 'filled',
    payload: { symbol },
    broker: { filled_at: at, filled_qty: qty },
  });
  const rows = holdingsWithFills(
    [{ symbol: 'A' }, { symbol: 'B' }, { symbol: 'C' }],
    [
      order('A', '2026-09-14T15:00:00Z', '1'),
      order('A', '2026-09-14T16:00:00Z', '1'),
      order('B', '2026-09-14T17:00:00Z', '0'),
    ],
  );
  assert.equal(rows[0].last_fill, '2026-09-14T16:00:00Z');
  assert.equal(rows[1].last_fill, '');
  assert.equal(rows[2].last_fill, '');
});
test('date filtering compares instants across offsets, combines symbol/P&L filters and excludes missing dates', () => {
  const rows = [
    { symbol: 'A', unrealized_pl: '4', last_fill: '2026-09-14T17:02:31+02:00' },
    { symbol: 'B', unrealized_pl: '-2', last_fill: '2026-09-14T15:02:30Z' },
    { symbol: 'AA', unrealized_pl: '8', last_fill: '' },
  ];
  const options = {
    ...defaults,
    sort: 'last_fill' as const,
    from: '2026-09-14T15:02:31Z',
    to: '2026-09-14T15:02:31Z',
  };
  assert.deepEqual(
    selectHoldings(rows, options).map((r) => r.symbol),
    ['A'],
  );
  assert.deepEqual(
    selectHoldings(rows, { ...defaults, pnl: 'loss' }).map((r) => r.symbol),
    ['B'],
  );
  assert.deepEqual(
    selectHoldings(rows, { ...defaults, query: ' a ', pnl: 'profit' }).map(
      (r) => r.symbol,
    ),
    ['A', 'AA'],
  );
});
