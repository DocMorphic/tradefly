import type { CryptoBar, CryptoSymbol } from './receipts.ts';
export type CryptoMarket = {
  symbol: CryptoSymbol;
  provider: 'coinbase-exchange';
  fetched_at: string;
  bars: CryptoBar[];
};

export function parseCandles(raw: unknown, now = Date.now()): CryptoBar[] {
  if (!Array.isArray(raw) || raw.length > 300)
    throw new Error('Invalid candle response');
  const bars = new Map<number, CryptoBar>();
  for (const row of raw) {
    if (
      !Array.isArray(row) ||
      row.length !== 6 ||
      row.some((v) => typeof v !== 'number' || !Number.isFinite(v))
    )
      throw new Error('Invalid candle');
    const [seconds, low, high, open, close, volume] = row as number[];
    if (
      !Number.isSafeInteger(seconds) ||
      seconds % 300 !== 0 ||
      Math.min(low, high, open, close) <= 0 ||
      low > Math.min(open, close) ||
      high < Math.max(open, close) ||
      volume < 0
    )
      throw new Error('Invalid OHLCV values');
    if (seconds * 1000 + 300000 > now) continue;
    const bar = {
      at: new Date(seconds * 1000).toISOString(),
      open: String(open),
      high: String(high),
      low: String(low),
      close: String(close),
      volume: String(volume),
    };
    if (
      bars.has(seconds) &&
      JSON.stringify(bars.get(seconds)) !== JSON.stringify(bar)
    )
      throw new Error('Conflicting candle revisions');
    bars.set(seconds, bar);
  }
  const sorted = [...bars.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bar]) => bar)
    .slice(-72);
  if (!sorted.length) throw new Error('No completed crypto candles available');
  return sorted;
}

const cache = new Map<
  CryptoSymbol,
  { until: number; value: Promise<CryptoMarket> }
>();
export function cryptoMarket(symbol: CryptoSymbol): Promise<CryptoMarket> {
  const cached = cache.get(symbol);
  if (cached && Date.now() < cached.until) return cached.value;
  const value = (async () => {
    const now = Date.now();
    const url = new URL(
      `https://api.exchange.coinbase.com/products/${symbol.replace('/', '-')}/candles`,
    );
    url.searchParams.set('granularity', '300');
    url.searchParams.set(
      'start',
      new Date(Math.floor(now / 300000) * 300000 - 72 * 300000).toISOString(),
    );
    url.searchParams.set('end', new Date(now).toISOString());
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Crypto market feed unavailable');
    return {
      symbol,
      provider: 'coinbase-exchange' as const,
      fetched_at: new Date(now).toISOString(),
      bars: parseCandles(await response.json(), now),
    };
  })();
  cache.set(symbol, { until: Date.now() + 60000, value });
  return value;
}
