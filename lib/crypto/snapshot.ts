import {
  verifyBundle,
  CRYPTO_SYMBOLS,
  type ReceiptBundle,
} from './receipts.ts';
export type CryptoAccount = {
  initial_cash: string;
  cash: string;
  realized: string;
  fees: string;
  holdings: Record<
    string,
    { quantity: string; cost_basis: string; mark: string }
  >;
  pending: null | {
    sequence: number;
    symbol: string;
    side: string;
    not_before: string;
    budget: string;
    quantity: string;
  };
  fills: {
    decision_sequence: number;
    symbol: string;
    at: string;
    side: string;
    status: string;
    quantity?: string;
    price?: string;
    fee?: string;
  }[];
};
export type CryptoSnapshot = {
  schema: 'tradefly.crypto.snapshot.v1';
  run_id: string;
  source: 'neural';
  updated_at: string;
  account: CryptoAccount;
  equity: string;
  decision_count: number;
  bundle: ReceiptBundle | null;
};
const decimal = (v: unknown) =>
  typeof v === 'string' && /^-?(?:0|[1-9]\d{0,20})(?:\.\d{1,24})?$/.test(v);
export async function parseCryptoSnapshot(
  value: unknown,
): Promise<CryptoSnapshot> {
  const s = value as CryptoSnapshot;
  if (
    !s ||
    s.schema !== 'tradefly.crypto.snapshot.v1' ||
    s.source !== 'neural' ||
    typeof s.run_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(s.run_id) ||
    !Number.isFinite(Date.parse(s.updated_at)) ||
    !Number.isSafeInteger(s.decision_count) ||
    s.decision_count < 0 ||
    !decimal(s.equity) ||
    !s.account ||
    ![
      s.account.initial_cash,
      s.account.cash,
      s.account.realized,
      s.account.fees,
    ].every(decimal) ||
    Number(s.account.cash) < 0 ||
    Number(s.account.fees) < 0 ||
    Number(s.equity) <= 0 ||
    !s.account.holdings ||
    Object.keys(s.account.holdings).sort().join(',') !==
      CRYPTO_SYMBOLS.join(',') ||
    Object.values(s.account.holdings).some(
      (p) =>
        ![p.quantity, p.cost_basis, p.mark].every(
          (n) => decimal(n) && Number(n) >= 0,
        ),
    ) ||
    !Array.isArray(s.account.fills) ||
    s.account.fills.length > 256
  )
    throw new Error('Invalid crypto snapshot');
  const b = s.bundle === null ? null : await verifyBundle(s.bundle);
  if (
    (s.decision_count > 0 && !b) ||
    (b &&
      (b.manifest.run_id !== s.run_id ||
        b.manifest.source !== 'neural' ||
        b.manifest.last_sequence !== s.decision_count))
  )
    throw new Error('Crypto snapshot and receipt batch disagree');
  const pending = s.account.pending;
  if (
    pending &&
    (!Number.isSafeInteger(pending.sequence) ||
      pending.sequence > s.decision_count ||
      !CRYPTO_SYMBOLS.includes(pending.symbol as 'BTC/USD') ||
      !['BUY', 'SELL'].includes(pending.side) ||
      !Number.isFinite(Date.parse(pending.not_before)) ||
      !decimal(pending.quantity) ||
      !decimal(pending.budget))
  )
    throw new Error('Invalid pending paper intent');
  for (const fill of s.account.fills)
    if (
      !CRYPTO_SYMBOLS.includes(fill.symbol as 'BTC/USD') ||
      !['BUY', 'SELL'].includes(fill.side) ||
      !['filled', 'vetoed', 'canceled-data-gap'].includes(fill.status) ||
      !Number.isSafeInteger(fill.decision_sequence) ||
      fill.decision_sequence < 1 ||
      fill.decision_sequence > s.decision_count ||
      !Number.isFinite(Date.parse(fill.at)) ||
      [fill.quantity, fill.price, fill.fee].some(
        (n) => n !== undefined && (!decimal(n) || Number(n) < 0),
      )
    )
      throw new Error('Invalid paper fill');
  // Explicit projection prevents unrelated/private fields from being published.
  const holdings = Object.fromEntries(
    Object.entries(s.account.holdings).map(([symbol, p]) => [
      symbol,
      { quantity: p.quantity, cost_basis: p.cost_basis, mark: p.mark },
    ]),
  );
  return {
    schema: s.schema,
    run_id: s.run_id,
    source: s.source,
    updated_at: s.updated_at,
    equity: s.equity,
    decision_count: s.decision_count,
    bundle: b,
    account: {
      initial_cash: s.account.initial_cash,
      cash: s.account.cash,
      realized: s.account.realized,
      fees: s.account.fees,
      holdings,
      pending: pending
        ? {
            sequence: pending.sequence,
            symbol: pending.symbol,
            side: pending.side,
            not_before: pending.not_before,
            budget: pending.budget,
            quantity: pending.quantity,
          }
        : null,
      fills: s.account.fills.map((f) => ({
        decision_sequence: f.decision_sequence,
        symbol: f.symbol,
        at: f.at,
        side: f.side,
        status: f.status,
        ...(f.quantity !== undefined ? { quantity: f.quantity } : {}),
        ...(f.price !== undefined ? { price: f.price } : {}),
        ...(f.fee !== undefined ? { fee: f.fee } : {}),
      })),
    },
  };
}
