import type { BackendSnapshot, PaperDecision } from './backend';
import type { Frame } from './experiment';

export const finite = (value: unknown): number | null =>
  value === null ||
  value === undefined ||
  value === '' ||
  typeof value === 'boolean' ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
export type MarketPoint = {
  at: number;
  symbol: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume: number | null;
};
export type ChartDecision = {
  id: string;
  at: number;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  buy: number | null;
  sell: number | null;
  reason: string;
  status: string;
  learning?: PaperDecision['learning'];
};
export type ChartFill = {
  id: string;
  decisionId: string;
  at: number;
  symbol: string;
  side: string;
  price: number;
  qty: number;
  value: number;
};
export type ChartPosition = {
  symbol: string;
  value: number | null;
  pnl: number | null;
  returnPct: number | null;
  qty: number | null;
};
export type TradingData = {
  positionsKnown: boolean;
  demo: boolean;
  equity: number | null;
  cash: number | null;
  pnl: number | null;
  baseline: number | null;
  series: {
    at: number;
    equity: number;
    cash: number | null;
    pnl: number | null;
    drawdown: number;
  }[];
  bars: MarketPoint[];
  decisions: ChartDecision[];
  fills: ChartFill[];
  positions: ChartPosition[];
  totalDecisions: number;
  updatedAt: number;
  source: string;
};
export function equitySeries(
  rows: { at: number; equity: number; cash: number | null }[],
  baseline: number | null,
) {
  let peak = 0;
  return rows
    .filter((r) => Number.isFinite(r.at) && Number.isFinite(r.equity))
    .sort((a, b) => a.at - b.at)
    .map((r) => {
      peak = Math.max(peak, r.equity);
      return {
        ...r,
        pnl: baseline === null ? null : r.equity - baseline,
        drawdown: peak > 0 ? (r.equity / peak - 1) * 100 : 0,
      };
    });
}
export function paperTradingData(s: BackendSnapshot): TradingData {
  const baseline = finite(s.baseline?.equity);
  const decisions = s.decisions
    .map((d) => ({
      id: d.id,
      at: Date.parse(d.created_at),
      symbol: d.symbol || s.symbol,
      action: d.action,
      buy: finite(d.neural.buy_hz),
      sell: finite(d.neural.sell_hz),
      reason: d.reason,
      learning: d.learning,
      status:
        s.orders.find((o) => o.decision_id === d.id)?.status ??
        (d.action === 'HOLD' ? 'No order' : 'No submission recorded'),
    }))
    .filter((d) => Number.isFinite(d.at))
    .sort((a, b) => a.at - b.at);
  const bars = new Map<string, MarketPoint>();
  for (const d of s.decisions) {
    const symbol = d.symbol || s.symbol,
      at = Date.parse(d.bar.t),
      close = finite(d.bar.c);
    if (!Number.isFinite(at) || close === null) continue;
    const open = finite(d.bar.o),
      high = finite(d.bar.h),
      low = finite(d.bar.l);
    bars.set(`${symbol}:${at}`, {
      symbol,
      at,
      close,
      volume: finite(d.bar.v),
      ...(open !== null &&
      high !== null &&
      low !== null &&
      low <= Math.min(open, close) &&
      high >= Math.max(open, close)
        ? { open, high, low }
        : {}),
    });
  }
  const fills: ChartFill[] = [];
  for (const o of s.orders) {
    const at = Date.parse(o.broker?.filled_at || ''),
      price = finite(o.broker?.filled_avg_price),
      qty = finite(o.broker?.filled_qty);
    if (!Number.isFinite(at) || price === null || qty === null || qty <= 0)
      continue;
    fills.push({
      id: o.client_id,
      decisionId: o.decision_id,
      at,
      symbol: String(o.payload.symbol || ''),
      side: String(o.payload.side).toUpperCase(),
      price,
      qty,
      value: price * qty,
    });
  }
  return {
    demo: false,
    positionsKnown: s.broker.connected || s.positions.length > 0,
    equity: finite(s.account.equity),
    cash: finite(s.account.cash),
    pnl: finite(s.equity_change_usd),
    baseline,
    series: equitySeries(
      (s.equity_history || []).flatMap((r) =>
        finite(r.equity) === null
          ? []
          : [
              {
                at: Date.parse(r.at),
                equity: finite(r.equity)!,
                cash: finite(r.cash),
              },
            ],
      ),
      baseline,
    ),
    bars: [...bars.values()].sort((a, b) => a.at - b.at),
    decisions,
    fills: fills.sort((a, b) => a.at - b.at),
    positions: s.positions.map((p) => ({
      symbol: p.symbol,
      value: finite(p.market_value),
      pnl: finite(p.unrealized_pl),
      returnPct:
        finite(p.unrealized_plpc) === null
          ? null
          : finite(p.unrealized_plpc)! * 100,
      qty: finite(p.qty),
    })),
    totalDecisions: s.decision_count,
    updatedAt: Date.parse(s.updated_at),
    source: `${s.feed.toUpperCase()} · recorded 5-minute bars`,
  };
}
// Synthetic replay has a clock, not a market date. Epoch anchors spacing only;
// the chart labels show the original demo clock without implying a trading day.
export function demoTradingData(frames: Frame[]): TradingData {
  const at = (i: number) => Date.UTC(2000, 0, 3, 14, 30) + i * 300000;
  const last = frames.at(-1)!;
  return {
    demo: true,
    positionsKnown: true,
    equity: last.equity,
    cash: last.cash,
    pnl: last.equity - 10000,
    baseline: 10000,
    series: equitySeries(
      frames.map((f) => ({ at: at(f.index), equity: f.equity, cash: f.cash })),
      10000,
    ),
    bars: frames.map((f) => ({
      at: at(f.index),
      symbol: 'AAPL',
      close: f.price,
      volume: f.volume,
    })),
    decisions: frames.map((f) => ({
      id: String(f.index),
      at: at(f.index),
      symbol: 'AAPL',
      action: f.action,
      buy: f.buyHz,
      sell: f.sellHz,
      reason: f.reason,
      status: last.trades.some((t) => t.decision === f.index)
        ? 'Simulated fill'
        : f.action === 'HOLD'
          ? 'No order'
          : f.index === last.index
            ? 'Pending'
            : 'Blocked',
    })),
    fills: last.trades.map((t) => ({
      id: t.id,
      decisionId: String(t.decision),
      at: at(t.filledAt),
      symbol: 'AAPL',
      side: t.action,
      price: t.price,
      qty: t.quantity,
      value: t.price * t.quantity,
    })),
    positions:
      last.quantity > 0
        ? [
            {
              symbol: 'AAPL',
              value: last.quantity * last.price,
              pnl: last.quantity * last.price - last.costBasis,
              returnPct:
                last.costBasis > 0
                  ? ((last.quantity * last.price) / last.costBasis - 1) * 100
                  : null,
              qty: last.quantity,
            },
          ]
        : [],
    totalDecisions: frames.length,
    updatedAt: at(last.index),
    source: 'Synthetic replay · 5-minute observations',
  };
}
export function selectedMarket(
  data: TradingData,
  symbol: string,
  limit: number,
) {
  return data.bars.filter((b) => b.symbol === symbol).slice(-limit);
}
