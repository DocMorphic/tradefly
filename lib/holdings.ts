import type { PaperOrder } from './backend';

export const holdingColumns = [
  ['symbol', 'Symbol'],
  ['qty', 'Shares'],
  ['avg_entry_price', 'Average cost'],
  ['current_price', 'Last price'],
  ['market_value', 'Market value'],
  ['unrealized_pl', 'Unrealized P&L'],
  ['unrealized_plpc', 'Return %'],
  ['last_fill', 'Latest known fill'],
] as const;
export type HoldingSort = (typeof holdingColumns)[number][0];
export type Holding = Record<string, string>;
export function holdingsWithFills(
  positions: Record<string, string>[],
  orders: PaperOrder[],
): Holding[] {
  const fills = new Map<string, string>();
  for (const order of orders) {
    const at = order.broker?.filled_at;
    const symbol = String(order.payload.symbol ?? '');
    if (
      !at ||
      !Number.isFinite(Date.parse(at)) ||
      !(Number(order.broker?.filled_qty) > 0)
    )
      continue;
    if (!fills.has(symbol) || Date.parse(at) > Date.parse(fills.get(symbol)!))
      fills.set(symbol, at);
  }
  return positions.map((position) => ({
    ...position,
    last_fill: fills.get(position.symbol) ?? '',
  }));
}
export function selectHoldings(
  rows: Holding[],
  options: {
    sort: HoldingSort;
    direction: 'asc' | 'desc';
    query: string;
    pnl: 'all' | 'profit' | 'loss';
    from: string;
    to: string;
  },
): Holding[] {
  const from = options.from ? Date.parse(options.from) : null;
  const to = options.to ? Date.parse(options.to) : null;
  const value = (row: Holding): string | number | null => {
    if (options.sort === 'symbol') return row.symbol;
    const raw = row[options.sort];
    if (raw == null || raw === '') return null;
    const n = options.sort === 'last_fill' ? Date.parse(raw) : Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return rows
    .filter((row) => {
      if (
        !row.symbol.toLowerCase().includes(options.query.trim().toLowerCase())
      )
        return false;
      if (options.pnl === 'profit' && !(Number(row.unrealized_pl) > 0))
        return false;
      if (options.pnl === 'loss' && !(Number(row.unrealized_pl) < 0))
        return false;
      const at = row.last_fill ? Date.parse(row.last_fill) : NaN;
      if (from !== null && !(at >= from)) return false;
      if (to !== null && !(at <= to)) return false;
      return true;
    })
    .sort((a, b) => {
      const av = value(a),
        bv = value(b);
      if (av === null || bv === null)
        return av === bv
          ? a.symbol.localeCompare(b.symbol)
          : av === null
            ? 1
            : -1;
      const difference =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return (
        (options.direction === 'asc' ? difference : -difference) ||
        a.symbol.localeCompare(b.symbol)
      );
    });
}
