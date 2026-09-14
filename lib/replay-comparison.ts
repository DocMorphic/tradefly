import type { BackendSnapshot, PaperDecision } from './backend';
type Bar = PaperDecision['bar'];
type Action = PaperDecision['action'];
export type Trial = {
  name: string;
  pnl: number;
  fees: number;
  fills: number;
  drawdown: number;
  equity: number[];
  pending: boolean;
};
// Same intraday next-open fill convention as the recorded pilot. No network/broker access.
export function simulateControl(
  bars: Bar[],
  initial: number,
  actions: Action[],
  name: string,
): Trial {
  if (!(initial > 0) || !Number.isFinite(initial))
    throw new Error('Initial cash is invalid');
  let cash = initial,
    shares = 0,
    fees = 0,
    fills = 0,
    peak = initial,
    drawdown = 0;
  let pending: { side: Action; amount: number } | null = null;
  const equity: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (
      ![bar.o, bar.c].every(
        (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
      ) ||
      !Number.isFinite(Date.parse(bar.t)) ||
      (i > 0 && Date.parse(bar.t) <= Date.parse(bars[i - 1].t))
    )
      throw new Error('Replay requires valid chronological bars');
    if (pending) {
      const price = bar.o * (pending.side === 'BUY' ? 1.0002 : 0.9998);
      const qty =
        pending.side === 'BUY'
          ? pending.amount / price
          : Math.min(shares, pending.amount);
      const value = qty * price,
        fee = value * 0.0001;
      if (qty > 0 && (pending.side !== 'BUY' || value + fee <= cash)) {
        cash += pending.side === 'BUY' ? -value - fee : value - fee;
        shares += pending.side === 'BUY' ? qty : -qty;
        fees += fee;
        fills++;
      }
    }
    pending = null;
    const value = cash + shares * bar.c;
    equity.push(value);
    peak = Math.max(peak, value);
    drawdown = Math.max(drawdown, ((peak - value) / peak) * 100);
    if (actions[i] === 'BUY') {
      const amount =
        Math.floor(
          Math.min(
            100,
            cash * 0.99,
            Math.max(0, value * 0.1 - shares * bar.c),
          ) *
            100 +
            1e-8,
        ) / 100;
      if (amount >= 1) pending = { side: 'BUY', amount };
    } else if (actions[i] === 'SELL') {
      const amount =
        Math.floor(Math.min(shares, 100 / bar.c) * 1e9 + 1e-8) / 1e9;
      if (amount > 0) pending = { side: 'SELL', amount };
    } else if (actions[i] !== 'HOLD')
      throw new Error('Missing or invalid recorded action');
  }
  return {
    name,
    pnl: (equity.at(-1) ?? initial) - initial,
    fees,
    fills,
    drawdown,
    equity,
    pending: !!pending,
  };
}
export function randomActions(count: number, seed: number): Action[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (['BUY', 'SELL', 'HOLD'] as Action[])[
      Math.floor((state / 4294967296) * 3)
    ];
  });
}
export function comparePilot(p: NonNullable<BackendSnapshot['pilot_replay']>) {
  const frames = p.frames as { bar: Bar; action: Action; symbol?: string }[];
  if (frames.length < 2 || frames.some((f) => !f?.bar))
    throw new Error('At least two recorded pilot bars are needed');
  if (new Set(frames.map((f) => f.symbol || p.symbol || '')).size > 1)
    throw new Error('This comparison supports one stock at a time');
  if (new Set(frames.map((f) => f.bar.t.slice(0, 10))).size !== 1)
    throw new Error(
      'Multi-day corporate actions require a separate evaluation',
    );
  const bars = frames.map((f) => f.bar),
    hold = frames.map(() => 'HOLD' as const);
  const fly = simulateControl(
    bars,
    p.initial_cash,
    frames.map((f) => f.action),
    'Recorded fly actions',
  );
  if (!Number.isFinite(p.net_pnl) || Math.abs(fly.pnl - p.net_pnl) > 0.02)
    throw new Error(
      'Recorded pilot P&L does not match these fill assumptions; comparison withheld',
    );
  const cash = simulateControl(bars, p.initial_cash, hold, 'Cash');
  const buyHold = simulateControl(
    bars,
    p.initial_cash,
    hold.map((a, i) => (i === 0 ? 'BUY' : a)),
    'Buy and hold · one $100 entry',
  );
  const random = Array.from({ length: 30 }, (_, i) =>
    simulateControl(
      bars,
      p.initial_cash,
      randomActions(bars.length, i + 1),
      `Random seed ${i + 1}`,
    ),
  );
  const ordered = [...random].sort((a, b) => a.pnl - b.pnl);
  return {
    fly,
    cash,
    buyHold,
    random,
    randomMedian: (ordered[14].pnl + ordered[15].pnl) / 2,
    randomMin: ordered[0].pnl,
    randomMax: ordered[29].pnl,
    bars: bars.length,
    first: bars[0].t,
    last: bars.at(-1)!.t,
  };
}
