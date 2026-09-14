import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionLog, historicalLog, paperLog } from '../lib/fly-log.ts';
import type { BackendSnapshot, PaperDecision } from '../lib/backend.ts';
const d: PaperDecision = {
  id: 'd1',
  symbol: 'MSFT',
  created_at: '2026-09-11T14:25:10Z',
  action: 'BUY',
  reason: '20 Hz threshold and 8 Hz lead passed',
  bar: { t: '2026-09-11T14:20:00Z', o: 99, h: 102, l: 98, c: 100, v: 3000 },
  feed: 'iex',
  stimulus_hz: { return_up: 20 },
  neural: {
    buy_hz: 32,
    sell_hz: 10,
    active_neurons: 42,
    spikes: 80,
    wall_seconds: 2,
    neural_time_ms: 500,
    state_id: 'n1',
    manifest_hash: 'h',
    window_ms: 500,
    readout_ms: 250,
    output_neurons: {},
  },
  account: {},
  position: {},
};
void test('log describes measured evidence and preserves symbol and raw records', () => {
  const entries = decisionLog(d, 'MSFT');
  assert.equal(entries.length, 3);
  assert.equal(entries[1].raw, d.neural);
  assert.match(entries[1].text, /32.00 Hz/);
  assert.match(entries[1].text, /10.00 Hz/);
  assert.equal(entries[0].symbol, 'MSFT');
  assert.match(entries[2].text, /BUY: 20 Hz/);
  assert.doesNotMatch(
    JSON.stringify(entries),
    /I think|confiden|predict|profit will/,
  );
});
void test('broker events retain order status rather than claiming an intent filled', () => {
  const s = {
    symbol: 'AAPL',
    decisions: [d],
    events: [
      {
        id: 1,
        at: d.created_at,
        kind: 'order_submitted',
        data: { symbol: 'MSFT', side: 'buy', notional: '100', status: 'new' },
      },
    ],
  } as unknown as BackendSnapshot;
  const e = paperLog(s).at(-1)!;
  assert.equal(e.symbol, 'MSFT');
  assert.match(e.text, /Broker status: new/);
  assert.doesNotMatch(e.text, /filled/);
});
void test('historical decision timestamps use completed bars and fills stay labeled simulated', () => {
  const s = {
    symbol: 'MSFT',
    pilot_replay: {
      symbol: 'AAPL',
      frames: [{ ...d, symbol: undefined }],
      fills: [
        {
          bar: '2026-09-11T14:25:00Z',
          side: 'BUY',
          shares: 0.5,
          price: 200,
          fee: 0.01,
        },
      ],
    },
  } as unknown as BackendSnapshot;
  const entries = historicalLog(s);
  assert.equal(entries[0].at, '2026-09-11T14:25:00.000Z');
  assert.ok(entries.every((e) => e.symbol === 'AAPL'));
  assert.match(entries.at(-1)!.text, /Local simulated BUY fill/);
});

void test('watchlist check logs each frame under its own stock', () => {
  const snapshot = {
    symbol: 'AAPL',
    watchlist_check: { frames: [d, { ...d, symbol: 'NVDA' }], fills: [] },
  } as unknown as BackendSnapshot;
  const entries = historicalLog(snapshot, 'watchlist');
  assert.deepEqual(
    entries.map((e) => e.symbol),
    ['MSFT', 'MSFT', 'MSFT', 'NVDA', 'NVDA', 'NVDA'],
  );
});

void test('a market data gap is not described as a neural HOLD', () => {
  const s = {
    symbol: 'AAPL',
    decisions: [],
    events: [],
    universe: {
      recent: [
        {
          symbol: 'XYZ',
          at: '2026-09-11T14:00:00Z',
          status: 'data_gap',
          detail: 'No current IEX bar',
        },
      ],
    },
  } as unknown as BackendSnapshot;
  const [entry] = paperLog(s);
  assert.equal(entry.symbol, 'XYZ');
  assert.match(entry.text, /No neural decision or order/);
  assert.doesNotMatch(entry.text, /HOLD/);
});
