import type { BackendSnapshot, PaperDecision } from './backend';
export type FlyLogEntry = {
  id: string;
  at: string;
  symbol: string;
  phase: 'sense' | 'neural' | 'decision' | 'execution' | 'system';
  text: string;
  raw: unknown;
};
const num = (n: unknown) =>
  Number.isFinite(Number(n)) ? Number(n).toFixed(2) : 'unavailable';
const word = (v: unknown, fallback = 'unavailable') =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
export function decisionLog(d: PaperDecision, symbol: string): FlyLogEntry[] {
  const base = { at: d.created_at || d.bar.t, symbol };
  return [
    {
      ...base,
      id: d.id + ':sense',
      phase: 'sense',
      text: `Received a completed ${symbol} bar: close $${num(d.bar.c)}, range $${num(d.bar.l)}–$${num(d.bar.h)}, volume ${d.bar.v}.`,
      raw: { bar: d.bar, stimulus_hz: d.stimulus_hz },
    },
    {
      ...base,
      id: d.id + ':neural',
      phase: 'neural',
      text: `${d.fly_id ? d.fly_id + ' · ' : ''}BUY pool ${num(d.neural.buy_hz)} Hz; SELL pool ${num(d.neural.sell_hz)} Hz. ${d.neural.active_neurons} neurons active in the readout window.`,
      raw: d.neural,
    },
    {
      ...base,
      id: d.id + ':decision',
      phase: 'decision',
      text: `${d.fly_id ? d.fly_id + ' · ' : ''}${d.action}: ${d.reason}.`,
      raw: d,
    },
  ];
}
export function paperLog(s: BackendSnapshot): FlyLogEntry[] {
  const entries = s.decisions.flatMap((d) =>
    decisionLog(d, d.symbol || s.symbol),
  );
  const symbolFor = (id: unknown) =>
    s.decisions.find((d) => d.id === id)?.symbol || s.symbol;
  for (const e of s.events) {
    const r = (e.data && typeof e.data === 'object' ? e.data : {}) as Record<
      string,
      unknown
    >;
    let text: string;
    switch (e.kind) {
      case 'universe_updated':
        text = `Full market loaded: ${word(r.count)} tradable US equity symbols. No handpicked shortlist.`;
        break;
      case 'watchlist_updated':
        text = `Watchlist updated: ${Array.isArray(r.symbols) ? r.symbols.join(' → ') : ''}. Shared neural state retained.`;
        break;
      case 'command_rejected':
        text = `Command rejected: ${word(r.reason)}.`;
        break;
      case 'startup':
        text = 'Worker started paused.';
        break;
      case 'pause':
        text = `Paused: ${word(r.reason, 'requested by user')}.`;
        break;
      case 'resume':
        text =
          'Resumed. Waiting for a new completed bar; old bars will be skipped.';
        break;
      case 'resume_blocked':
        text = `Resume blocked: ${Array.isArray(r.reasons) ? r.reasons.join('; ') : 'readiness checks failed'}.`;
        break;
      case 'execution_blocked':
        text = `No order submitted: ${word(r.reason)}.`;
        break;
      case 'order_submitted':
        text = `Submitted ${word(r.side).toUpperCase()} ${word(r.symbol)}: ${r.notional ? `$${num(r.notional)}` : `${num(r.qty)} shares`}. Broker status: ${word(r.status)}.`;
        break;
      case 'order_update':
        text = `${word(r.side).toUpperCase()} ${word(r.symbol)}: ${word(r.status)}; filled ${num(r.filled_qty)} shares${r.filled_avg_price ? ` at $${num(r.filled_avg_price)}` : ''}.`;
        break;
      case 'cancel_pending':
        text =
          'Cancellation is not confirmed; reconciliation will check the order again.';
        break;
      default:
        text = e.kind.replaceAll('_', ' ');
    }
    entries.push({
      id: `event:${e.id}`,
      at: e.at,
      symbol: word(r.symbol, symbolFor(r.decision_id)),
      phase:
        e.kind.startsWith('order') ||
        e.kind === 'execution_blocked' ||
        e.kind === 'cancel_pending'
          ? 'execution'
          : 'system',
      text,
      raw: e.data,
    });
  }
  for (const r of s.universe?.recent ?? []) {
    if (r.status === 'data_gap')
      entries.push({
        id: `gap:${r.symbol}:${r.at}`,
        at: r.at,
        symbol: r.symbol,
        phase: 'sense',
        text: `Skipped input: ${r.detail}. No neural decision or order was produced for this visit.`,
        raw: r,
      });
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export function historicalLog(
  s: BackendSnapshot,
  source = 'historical',
): FlyLogEntry[] {
  const p =
    source === 'market'
      ? s.market_check
      : source === 'watchlist'
        ? s.watchlist_check
        : s.pilot_replay;
  if (!p) return [];
  const frames = p.frames as {
    symbol?: string;
    bar: PaperDecision['bar'];
    action: PaperDecision['action'];
    reason: string;
    neural: PaperDecision['neural'];
    stimulus_hz: Record<string, number>;
    execution_reason: string;
  }[];
  const entries = frames.flatMap((f, i) =>
    decisionLog(
      {
        ...f,
        id: `replay:${i}`,
        created_at: new Date(Date.parse(f.bar.t) + 300_000).toISOString(),
        feed: 'iex',
        account: {},
        position: {},
      },
      f.symbol || p.symbol || s.symbol,
    ),
  );
  for (const [i, value] of p.fills.entries()) {
    const f = value as {
      symbol?: string;
      bar: string;
      side: string;
      shares: number;
      price: number;
      fee: number;
    };
    entries.push({
      id: `replay-fill:${i}`,
      at: f.bar,
      symbol: f.symbol || p.symbol || s.symbol,
      phase: 'execution',
      text: `Local simulated ${f.side} fill: ${num(f.shares)} shares at $${num(f.price)}; modeled fee $${num(f.fee)}.`,
      raw: f,
    });
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
