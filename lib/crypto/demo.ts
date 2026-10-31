import {
  receiptHash,
  buildBundle,
  ZERO_HASH,
  sha256,
  type DecisionRecord,
  type DecisionReceipt,
} from './receipts.ts';
export async function cryptoWalkthrough() {
  const receipts: DecisionReceipt[] = [];
  const experiment = await sha256(
    'synthetic crypto walkthrough; no fly or orders',
  );
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < 3; i++) {
    const record: DecisionRecord = {
      schema: 'tradefly.crypto.decision.v1',
      run_id: 'walkthrough-v1',
      sequence: i + 1,
      previous_hash: receipts.at(-1)?.hash ?? ZERO_HASH,
      source: 'synthetic-demo',
      symbol: i === 1 ? 'ETH/USD' : 'BTC/USD',
      decided_at: new Date(start + (21 + i) * 300000).toISOString(),
      experiment_hash: experiment,
      observation: {
        provider: 'synthetic-demo',
        bars: Array.from({ length: 21 }, (_, n) => {
          const price = (i === 1 ? 2000 : 60000) + n * 2;
          return {
            at: new Date(start + (n + i) * 300000).toISOString(),
            open: String(price),
            high: String(price + 4),
            low: String(price - 3),
            close: String(price + 1),
            volume: '12',
          };
        }),
      },
      stimulus: {
        cash: '100',
        position: '10',
        range: '10',
        return_down: '10',
        return_up: '25',
        volume: '10',
      },
      neural: {
        buy_hz: i === 0 ? '32' : '8',
        sell_hz: '4',
        state_id: `illustration-${i + 1}`,
      },
      action: i === 0 ? 'BUY' : 'HOLD',
      account_before: { cash: '10000', equity: '10000', quantity: '0' },
    };
    receipts.push({ record, hash: await receiptHash(record) });
  }
  return buildBundle(receipts);
}
