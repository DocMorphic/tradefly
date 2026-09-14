import type { BackendSnapshot } from '../backend';
export type FlyMood =
  | 'PAUSED'
  | 'OFFLINE'
  | 'CLOSED'
  | 'SCANNING'
  | 'BUY'
  | 'SELL'
  | 'HOLD'
  | 'PENDING'
  | 'FILLED';
export type FlyActivity = {
  mood: FlyMood;
  label: string;
  detail: string;
  symbol: string;
  key: string;
  buyHz: number | null;
  sellHz: number | null;
  demo: boolean;
};
export function flyActivity(
  s: BackendSnapshot | null,
  stale: boolean,
  now: number,
): FlyActivity {
  const last = s?.decisions.at(-1);
  const base = {
    symbol: s?.symbol || '—',
    buyHz: last?.neural.buy_hz ?? null,
    sellHz: last?.neural.sell_hz ?? null,
    demo: false,
  };
  const state = (
    mood: FlyMood,
    label: string,
    detail: string,
    key: string = mood,
  ): FlyActivity => ({ ...base, mood, label, detail, key });
  if (!s || stale)
    return state(
      'OFFLINE',
      'Waiting for telemetry',
      'The worker is offline or its readings are stale.',
    );
  if (s.paused) return state('PAUSED', 'Resting · trading paused', s.message);
  if (!s.market.is_open)
    return state(
      'CLOSED',
      'Market closed',
      'The fly will wait for regular market hours.',
    );
  const filled = [...s.orders]
    .reverse()
    .find(
      (o) =>
        o.status === 'filled' &&
        o.broker?.filled_at &&
        now - Date.parse(o.broker.filled_at) < 20000 &&
        now >= Date.parse(o.broker.filled_at),
    );
  if (filled)
    return {
      ...state(
        'FILLED',
        'Paper fill confirmed',
        `${String(filled.payload.side).toUpperCase()} ${filled.payload.symbol} · broker-reported fill`,
        filled.client_id,
      ),
      symbol: String(filled.payload.symbol),
    };
  const pending = s.orders.find(
    (o) => !['filled', 'canceled', 'expired', 'rejected'].includes(o.status),
  );
  if (pending)
    return {
      ...state(
        'PENDING',
        'Waiting for the broker',
        `Order status: ${pending.status}. An intent is not a completed trade.`,
        pending.client_id,
      ),
      symbol: String(pending.payload.symbol),
    };
  if (
    last &&
    now - Date.parse(last.created_at) < 20000 &&
    now >= Date.parse(last.created_at)
  )
    return {
      ...state(last.action, `${last.action} intent`, last.reason, last.id),
      symbol: last.symbol || s.symbol,
    };
  return state(
    'SCANNING',
    'Visiting the market',
    `Latest reported stock: ${s.symbol || 'waiting for input'}.`,
  );
}
export function previewActivity(mood: FlyMood): FlyActivity {
  return {
    mood,
    label: `${mood} animation preview`,
    detail:
      'Animation only. No market signal, neural measurement or order is generated.',
    symbol: 'DEMO',
    key: `preview:${mood}`,
    buyHz: null,
    sellHz: null,
    demo: true,
  };
}
