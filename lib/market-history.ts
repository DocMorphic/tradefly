import type { MarketPoint } from './trading-charts';

export const validChartSymbol = (s: unknown): s is string =>
  typeof s === 'string' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(s);

export type MarketHistory = {
  symbol: string;
  feed: 'sip';
  delay_minutes: 15;
  timeframe: '5Min';
  fetched_at: string;
  through: string;
  bars: MarketPoint[];
};
export type HistoryResponse = {
  history: MarketHistory | null;
  pending: boolean;
  error: string | null;
};

// Reject future/incomplete observations rather than relabeling them as delayed.
export function validHistory(
  value: unknown,
  now = Date.now(),
): value is MarketHistory {
  if (!value || typeof value !== 'object') return false;
  const h = value as MarketHistory;
  const through = Date.parse(h.through),
    fetched = Date.parse(h.fetched_at);
  return (
    validChartSymbol(h.symbol) &&
    h.feed === 'sip' &&
    h.delay_minutes === 15 &&
    h.timeframe === '5Min' &&
    Number.isFinite(fetched) &&
    fetched <= now + 60000 &&
    Number.isFinite(through) &&
    through <= fetched - 15 * 60000 &&
    Array.isArray(h.bars) &&
    h.bars.length <= 600 &&
    h.bars.every(
      (b, i) =>
        b.symbol === h.symbol &&
        Number.isFinite(b.at) &&
        b.at % 300000 === 0 &&
        b.at + 300000 <= through &&
        (i === 0 || b.at > h.bars[i - 1].at) &&
        [b.open, b.high, b.low, b.close].every(
          (n) => typeof n === 'number' && Number.isFinite(n) && n > 0,
        ) &&
        b.low! <= Math.min(b.open!, b.close) &&
        b.high! >= Math.max(b.open!, b.close) &&
        typeof b.volume === 'number' &&
        Number.isFinite(b.volume) &&
        b.volume >= 0,
    )
  );
}
