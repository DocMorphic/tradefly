/** Deterministic UI fixture. These rates are NOT produced by a fly simulator. */
export type Action = 'BUY' | 'SELL' | 'HOLD';
export type Trade = {
  id: string;
  decision: number;
  filledAt: number;
  action: Exclude<Action, 'HOLD'>;
  price: number;
  quantity: number;
  fee: number;
  realized: number;
};
export type Frame = {
  index: number;
  time: string;
  price: number;
  change: number;
  volume: number;
  buyHz: number;
  sellHz: number;
  action: Action;
  reason: string;
  equity: number;
  cash: number;
  quantity: number;
  benchmark: number;
  fees: number;
  realized: number;
  status: string;
  trades: Trade[];
};
export const START_CASH = 10000;
export const MIN_RATE = 20;
export const MIN_MARGIN = 8;
export const SOURCE = 'Synthetic demonstration · no fly or broker connected';
export function decode(buy: number, sell: number): Action {
  if (
    !Number.isFinite(buy) ||
    !Number.isFinite(sell) ||
    Math.max(buy, sell) < MIN_RATE ||
    Math.abs(buy - sell) < MIN_MARGIN
  )
    return 'HOLD';
  return buy > sell ? 'BUY' : 'SELL';
}
export function explain(buy: number, sell: number) {
  const a = decode(buy, sell),
    margin = Math.abs(buy - sell).toFixed(1);
  if (Math.max(buy, sell) < MIN_RATE)
    return 'Neither output pool reaches the 20 Hz activity threshold. The decoder holds.';
  if (a === 'HOLD')
    return `The pools are only ${margin} Hz apart, below the 8 Hz separation required for a trade.`;
  return `The ${a} pool clears 20 Hz and leads by ${margin} Hz. Both decoder conditions pass.`;
}
function priceAt(i: number) {
  return 220 + i * 0.038 + Math.sin(i * 0.21) * 1.5 + Math.sin(i * 0.73) * 0.3;
}
export function makeSession(randomControl = false): Frame[] {
  let cash = START_CASH,
    quantity = 0,
    cost = 0,
    fees = 0,
    realized = 0;
  const trades: Trade[] = [],
    frames: Frame[] = [];
  for (let i = 0; i < 78; i++) {
    const price = priceAt(i),
      buyHz =
        Math.round(
          (22 + Math.sin(i * 0.39) * 15 + Math.cos(i * 0.12) * 6) * 10,
        ) / 10;
    const sellHz = Math.round((21 + Math.cos(i * 0.32) * 13) * 10) / 10;
    let status = 'No pending order';
    const previous = frames.at(-1);
    if (previous && previous.action !== 'HOLD') {
      const side = previous.action;
      const fillPrice = price * (side === 'BUY' ? 1.0002 : 0.9998);
      const room = Math.max(
        0,
        (cash + quantity * price) * 0.1 - quantity * price,
      );
      const notional =
        side === 'BUY'
          ? Math.min(100, room, cash / 1.0001)
          : Math.min(100, quantity * fillPrice);
      if (notional >= 0.01) {
        const q = notional / fillPrice,
          fee = notional * 0.0001;
        const pnl =
          side === 'SELL' ? notional - fee - q * (cost / quantity) : 0;
        if (side === 'BUY') {
          cash -= notional + fee;
          quantity += q;
          cost += notional + fee;
        } else {
          const avg = cost / quantity;
          cash += notional - fee;
          quantity = Math.max(0, quantity - q);
          cost = Math.max(0, cost - q * avg);
          realized += pnl;
        }
        fees += fee;
        trades.push({
          id: `TF-${String(trades.length + 1).padStart(4, '0')}`,
          decision: i - 1,
          filledAt: i,
          action: side,
          price: fillPrice,
          quantity: q,
          fee,
          realized: pnl,
        });
        status = `Previous ${side.toLowerCase()} filled`;
      } else
        status =
          side === 'SELL'
            ? 'Previous sell blocked: no holding'
            : 'Previous buy blocked: exposure limit';
    }
    const minutes = 570 + i * 5;
    const action = randomControl
      ? (['BUY', 'SELL', 'HOLD'] as const)[((i * 1103515245 + 12345) >>> 8) % 3]
      : decode(buyHz, sellHz);
    frames.push({
      index: i,
      time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      price,
      change: i ? (price / priceAt(i - 1) - 1) * 100 : 0,
      volume: Math.round(160000 + (Math.sin(i * 0.3) + 1) * 125000),
      buyHz,
      sellHz,
      action,
      reason: explain(buyHz, sellHz),
      equity: cash + quantity * price,
      cash,
      quantity,
      benchmark: 9000 + (1000 * price) / priceAt(0),
      fees,
      realized,
      status,
      trades: [...trades],
    });
  }
  return frames;
}
export const SESSION = makeSession();
export const RANDOM_SESSION = makeSession(true);
export function metrics(frames: Frame[]) {
  const last = frames.at(-1)!;
  let peak = START_CASH,
    drawdown = 0;
  frames.forEach((f) => {
    peak = Math.max(peak, f.equity);
    drawdown = Math.max(drawdown, ((peak - f.equity) / peak) * 100);
  });
  const closed = last.trades.filter((t) => t.action === 'SELL');
  const grossProfit = closed.reduce((s, t) => s + Math.max(0, t.realized), 0);
  const grossLoss = -closed.reduce((s, t) => s + Math.min(0, t.realized), 0);
  return {
    pnl: last.equity - START_CASH,
    returnPct: (last.equity / START_CASH - 1) * 100,
    drawdown,
    winRate: closed.length
      ? (closed.filter((t) => t.realized > 0).length / closed.length) * 100
      : null,
    closed: closed.length,
    profitFactor: grossLoss ? grossProfit / grossLoss : null,
    turnover:
      (last.trades.reduce((s, t) => s + t.price * t.quantity, 0) / START_CASH) *
      100,
    exposure: ((last.quantity * last.price) / last.equity) * 100,
    unrealized: last.equity - START_CASH - last.realized,
  };
}
export const usd = (v: number) =>
  v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const signed = (v: number) => `${v >= 0 ? '+' : '−'}${usd(Math.abs(v))}`;
export function csv(frames: Frame[]) {
  return [
    'source,id,decision_time,fill_time,symbol,side,quantity,fill_price,fee,realized_pnl',
    ...frames
      .at(-1)!
      .trades.map((t) =>
        [
          'synthetic-demo',
          t.id,
          SESSION[t.decision].time,
          SESSION[t.filledAt].time,
          'AAPL',
          t.action,
          t.quantity.toFixed(6),
          t.price.toFixed(4),
          t.fee.toFixed(4),
          t.realized.toFixed(4),
        ].join(','),
      ),
  ].join('\n');
}
