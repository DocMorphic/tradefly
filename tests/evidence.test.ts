import test from 'node:test';
import assert from 'node:assert/strict';
import { traceDecision, orderFill, stockRecords } from '../lib/evidence.ts';
import {
  comparePilot,
  randomActions,
  simulateControl,
} from '../lib/replay-comparison.ts';
import type {
  BackendSnapshot,
  PaperDecision,
  PaperOrder,
} from '../lib/backend.ts';
const d = { id: 'd1', symbol: 'MSFT', action: 'BUY' } as PaperDecision;
const order = {
  decision_id: 'd1',
  client_id: 'c1',
  status: 'partially_filled',
  payload: { symbol: 'MSFT' },
  broker: { filled_qty: '0.5', filled_avg_price: '100' },
} as PaperOrder;
void test('trace joins exact decision/order IDs, never unrelated same-symbol activity', () => {
  const snapshot = {
    decisions: [d],
    orders: [order, { ...order, client_id: 'c2', decision_id: 'd2' }],
    events: [
      {
        id: 1,
        at: '2026-09-11T14:00:00Z',
        kind: 'order_update',
        data: { client_order_id: 'c1' },
      },
      {
        id: 2,
        at: '2026-09-11T14:01:00Z',
        kind: 'execution_blocked',
        data: { decision_id: 'd2', symbol: 'MSFT', reason: 'other' },
      },
      {
        id: 3,
        at: '2026-09-11T14:00:00Z',
        kind: 'execution_blocked',
        data: { decision_id: 'd1', reason: 'recorded veto' },
      },
    ],
  } as unknown as BackendSnapshot;
  const trace = traceDecision(snapshot, d);
  assert.equal(trace.orders.length, 1);
  assert.deepEqual(
    trace.events.map((e) => e.id),
    [1, 3],
  );
  assert.deepEqual(orderFill(order), { qty: 0.5, price: 100, value: 50 });
  assert.equal(
    orderFill({
      ...order,
      broker: { filled_qty: '0', filled_avg_price: '100' },
    }),
    null,
  );
  assert.equal(
    orderFill({
      ...order,
      broker: { filled_qty: '2', filled_avg_price: null },
    }),
    null,
  );
});
void test('missing execution evidence does not become a rejection or fill', () => {
  const snapshot = { orders: [], events: [] } as unknown as BackendSnapshot;
  assert.match(
    traceDecision(snapshot, d).execution,
    /No linked order or execution result/,
  );
  assert.match(
    traceDecision(snapshot, { ...d, action: 'HOLD' }).execution,
    /neural HOLD/,
  );
});
void test('stock history keeps data gaps distinct from HOLD and does not borrow another stock position', () => {
  const snapshot = {
    symbol: 'MSFT',
    decisions: [d],
    orders: [order],
    positions: [{ symbol: 'AAPL', qty: '4' }],
    universe: { statuses: { MSFT: 'data_gap' }, recent: [] },
  } as unknown as BackendSnapshot;
  const r = stockRecords(snapshot, 'MSFT');
  assert.equal(r.status, 'data_gap');
  assert.equal(r.decisions.length, 1);
  assert.equal(r.position, undefined);
});
const bars = [100, 200, 180].map((o, i) => ({
  t: `2026-09-11T14:${String(i * 5).padStart(2, '0')}:00Z`,
  o,
  h: o,
  l: o,
  c: o,
  v: 1,
}));
void test('comparison fills on next open, includes costs and leaves final intent unfilled', () => {
  const r = simulateControl(bars, 10000, ['BUY', 'HOLD', 'SELL'], 'test');
  assert.equal(r.fills, 1);
  assert.equal(r.pending, true);
  assert.ok(Math.abs(r.fees - 0.01) < 1e-10);
  assert.ok(Math.abs(r.pnl - (-100.01 + (100 / 200.04) * 180)) < 1e-8);
  const cash = simulateControl(bars, 10000, ['HOLD', 'HOLD', 'HOLD'], 'cash');
  assert.equal(cash.pnl, 0);
  assert.equal(cash.drawdown, 0);
});
void test('random controls are reproducible and reject mismatched or unsorted pilot data', () => {
  assert.deepEqual(randomActions(100, 4), randomActions(100, 4));
  assert.notDeepEqual(randomActions(100, 4), randomActions(100, 5));
  assert.throws(
    () =>
      simulateControl(
        [...bars].reverse(),
        10000,
        ['HOLD', 'HOLD', 'HOLD'],
        'bad',
      ),
    /chronological/,
  );
  const pilot = {
    frames: bars.map((bar) => ({ bar, action: 'HOLD' })),
    initial_cash: 10000,
    net_pnl: 0,
    symbol: 'MSFT',
  } as NonNullable<BackendSnapshot['pilot_replay']>;
  assert.equal(comparePilot(pilot).random.length, 30);
  assert.throws(
    () => comparePilot({ ...pilot, net_pnl: 10 }),
    /does not match/,
  );
  assert.throws(
    () =>
      comparePilot({
        ...pilot,
        frames: [
          { bar: bars[0], action: 'HOLD', symbol: 'MSFT' },
          { bar: bars[1], action: 'HOLD', symbol: 'AAPL' },
        ],
      }),
    /one stock/,
  );
});
