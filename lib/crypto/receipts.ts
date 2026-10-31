// Versioned wire format shared with backend/tradefly/crypto_receipts.py.
// Decimal quantities are strings. JSON numbers are safe integers only.
export const ZERO_HASH = '0'.repeat(64);
export const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD'] as const;
export type CryptoSymbol = (typeof CRYPTO_SYMBOLS)[number];
export type CryptoBar = {
  at: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};
export type DecisionRecord = {
  schema: 'tradefly.crypto.decision.v1';
  run_id: string;
  sequence: number;
  previous_hash: string;
  source: 'neural' | 'synthetic-demo';
  symbol: CryptoSymbol;
  decided_at: string;
  experiment_hash: string;
  observation: {
    provider: 'coinbase-exchange' | 'synthetic-demo';
    bars: CryptoBar[];
  };
  stimulus: Record<string, string>;
  neural: { buy_hz: string; sell_hz: string; state_id: string };
  action: 'BUY' | 'SELL' | 'HOLD';
  account_before: { cash: string; equity: string; quantity: string };
};
export type DecisionReceipt = { record: DecisionRecord; hash: string };
export type Manifest = {
  schema: 'tradefly.crypto.batch.v1';
  run_id: string;
  source: DecisionRecord['source'];
  first_sequence: number;
  last_sequence: number;
  previous_hash: string;
  root: string;
  count: number;
};
export type ReceiptBundle = {
  manifest: Manifest;
  digest: string;
  receipts: DecisionReceipt[];
};
const hexPattern = /^[0-9a-f]{64}$/;
const decimalPattern = /^(?:0|[1-9]\d{0,20})(?:\.\d{1,24})?$/;
export const isHash = (value: unknown): value is string =>
  typeof value === 'string' && hexPattern.test(value);
export function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    if (typeof value === 'string' && /[\uD800-\uDFFF]/u.test(value)) {
      // Reject unpaired UTF-16 code units; valid surrogate pairs match as a code point.
      throw new Error('Invalid Unicode in receipt');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).some((key) => !/^[\x20-\x7e]*$/.test(key)))
      throw new Error('Receipt object keys must be ASCII');
    return (
      '{' +
      Object.keys(object)
        .sort()
        .map((key) => canonical(key) + ':' + canonical(object[key]))
        .join(',') +
      '}'
    );
  }
  throw new Error(
    'Receipts require strings, safe integers, booleans, arrays or objects',
  );
}
const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!, (b) => Number.parseInt(b, 16));
const asHex = (data: ArrayBuffer) =>
  Array.from(new Uint8Array(data), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
export async function sha256(value: string | Uint8Array): Promise<string> {
  const input =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return asHex(await crypto.subtle.digest('SHA-256', new Uint8Array(input)));
}
export async function receiptHash(record: DecisionRecord) {
  return sha256('tradefly.crypto.receipt.v1\n' + canonical(record));
}
export async function merkleRoot(hashes: string[]): Promise<string> {
  if (!hashes.length || hashes.some((h) => !isHash(h)))
    throw new Error('Invalid Merkle leaves');
  let level = await Promise.all(
    hashes.map((h) => sha256(new Uint8Array([0, ...bytes(h)]))),
  );
  while (level.length > 1) {
    const next: Promise<string>[] = [];
    for (let i = 0; i < level.length; i += 2)
      next.push(
        sha256(
          new Uint8Array([
            1,
            ...bytes(level[i]),
            ...bytes(level[i + 1] ?? level[i]),
          ]),
        ),
      );
    level = await Promise.all(next);
  }
  return level[0];
}
function checkRecord(value: unknown): asserts value is DecisionRecord {
  const r = value as DecisionRecord;
  if (
    !r ||
    r.schema !== 'tradefly.crypto.decision.v1' ||
    typeof r.run_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(r.run_id) ||
    !Number.isSafeInteger(r.sequence) ||
    r.sequence < 1 ||
    !isHash(r.previous_hash) ||
    !['neural', 'synthetic-demo'].includes(r.source) ||
    !CRYPTO_SYMBOLS.includes(r.symbol) ||
    !['BUY', 'SELL', 'HOLD'].includes(r.action) ||
    !isHash(r.experiment_hash) ||
    typeof r.decided_at !== 'string' ||
    !Number.isFinite(Date.parse(r.decided_at)) ||
    !r.neural ||
    typeof r.neural.state_id !== 'string' ||
    r.neural.state_id.length > 160 ||
    ![
      r.neural.buy_hz,
      r.neural.sell_hz,
      r.account_before?.cash,
      r.account_before?.equity,
      r.account_before?.quantity,
    ].every((v) => typeof v === 'string' && decimalPattern.test(v)) ||
    !r.observation ||
    r.observation.provider !==
      (r.source === 'neural' ? 'coinbase-exchange' : 'synthetic-demo') ||
    !Array.isArray(r.observation.bars) ||
    r.observation.bars.length !== 21
  )
    throw new Error('Invalid decision record');
  const channels = [
    'cash',
    'position',
    'range',
    'return_down',
    'return_up',
    'volume',
  ];
  if (
    !r.stimulus ||
    Object.keys(r.stimulus).sort().join(',') !== channels.join(',') ||
    Object.values(r.stimulus).some(
      (v) =>
        typeof v !== 'string' || !decimalPattern.test(v) || Number(v) > 250,
    )
  )
    throw new Error('Invalid stimulus channels');
  let prior = 0;
  for (const bar of r.observation.bars) {
    const at = Date.parse(bar.at);
    if (
      !Number.isFinite(at) ||
      at % 300000 !== 0 ||
      (prior && at - prior !== 300000) ||
      ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(
        (v) => typeof v === 'string' && decimalPattern.test(v),
      ) ||
      Math.min(
        Number(bar.open),
        Number(bar.high),
        Number(bar.low),
        Number(bar.close),
      ) <= 0 ||
      Number(bar.low) > Math.min(Number(bar.open), Number(bar.close)) ||
      Number(bar.high) < Math.max(Number(bar.open), Number(bar.close))
    )
      throw new Error('Invalid or non-contiguous observation bars');
    prior = at;
  }
  if (prior + 300000 > Date.parse(r.decided_at))
    throw new Error('Decision precedes completed input');
  if (r.source === 'neural') {
    const buy = Number(r.neural.buy_hz),
      sell = Number(r.neural.sell_hz);
    const action =
      Math.max(buy, sell) < 20 || Math.abs(buy - sell) < 8 || buy === sell
        ? 'HOLD'
        : buy > sell
          ? 'BUY'
          : 'SELL';
    if (action !== r.action)
      throw new Error('Action disagrees with the fixed neural decoder');
  }
  const exact = (object: object, keys: string[]) =>
    Object.keys(object).sort().join(',') === keys.sort().join(',');
  if (
    !exact(r, [
      'schema',
      'run_id',
      'sequence',
      'previous_hash',
      'source',
      'symbol',
      'decided_at',
      'experiment_hash',
      'observation',
      'stimulus',
      'neural',
      'action',
      'account_before',
    ]) ||
    !exact(r.neural, ['buy_hz', 'sell_hz', 'state_id']) ||
    !exact(r.account_before, ['cash', 'equity', 'quantity']) ||
    !exact(r.observation, ['provider', 'bars']) ||
    r.observation.bars.some(
      (b) => !exact(b, ['at', 'open', 'high', 'low', 'close', 'volume']),
    )
  )
    throw new Error('Unexpected receipt fields');
}
export async function verifyManifest(
  value: unknown,
  digest: unknown,
): Promise<Manifest> {
  const m = value as Manifest;
  if (
    !m ||
    m.schema !== 'tradefly.crypto.batch.v1' ||
    typeof m.run_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(m.run_id) ||
    !['neural', 'synthetic-demo'].includes(m.source) ||
    !Number.isSafeInteger(m.first_sequence) ||
    m.first_sequence < 1 ||
    !Number.isSafeInteger(m.last_sequence) ||
    !Number.isSafeInteger(m.count) ||
    m.count < 1 ||
    m.count > 256 ||
    m.last_sequence - m.first_sequence + 1 !== m.count ||
    !isHash(m.root) ||
    !isHash(m.previous_hash) ||
    !isHash(digest) ||
    (await sha256(canonical(m))) !== digest
  )
    throw new Error('Invalid batch manifest');
  return m;
}
export async function buildBundle(
  receipts: DecisionReceipt[],
): Promise<ReceiptBundle> {
  if (!receipts.length || receipts.length > 256)
    throw new Error('A batch needs 1–256 receipts');
  const first = receipts[0].record;
  const manifest: Manifest = {
    schema: 'tradefly.crypto.batch.v1',
    run_id: first.run_id,
    source: first.source,
    first_sequence: first.sequence,
    last_sequence: receipts.at(-1)!.record.sequence,
    previous_hash: first.previous_hash,
    root: await merkleRoot(receipts.map((r) => r.hash)),
    count: receipts.length,
  };
  return { manifest, digest: await sha256(canonical(manifest)), receipts };
}
export async function verifyBundle(value: unknown): Promise<ReceiptBundle> {
  const b = value as ReceiptBundle;
  if (
    !b ||
    !Array.isArray(b.receipts) ||
    !b.receipts.length ||
    b.receipts.length > 256 ||
    !b.manifest ||
    !isHash(b.digest)
  )
    throw new Error('Invalid receipt bundle');
  let previous = b.manifest.previous_hash;
  if (!isHash(previous)) throw new Error('Invalid previous receipt hash');
  for (let i = 0; i < b.receipts.length; i++) {
    const receipt = b.receipts[i];
    checkRecord(receipt.record);
    if (
      !isHash(receipt.hash) ||
      receipt.record.run_id !== b.manifest.run_id ||
      receipt.record.source !== b.manifest.source ||
      receipt.record.sequence !== b.manifest.first_sequence + i ||
      receipt.record.previous_hash !== previous ||
      (receipt.record.sequence === 1 && previous !== ZERO_HASH) ||
      (await receiptHash(receipt.record)) !== receipt.hash
    )
      throw new Error(
        'Receipt changed, missing, reordered or from a different run',
      );
    previous = receipt.hash;
  }
  const expected = await buildBundle(b.receipts);
  if (
    canonical(expected.manifest) !== canonical(b.manifest) ||
    expected.digest !== b.digest
  )
    throw new Error('Batch commitment does not match its records');
  return b;
}
export const runKey = (runId: string) =>
  sha256('tradefly.crypto.run.v1\n' + runId);
