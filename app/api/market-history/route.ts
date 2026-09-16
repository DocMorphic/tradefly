import { sameOrigin } from '@/lib/server/request-origin';
import {
  database,
  json,
  userAllowed,
  tokenAllowed,
} from '@/lib/server/backend-store';
import { validChartSymbol } from '@/lib/market-history';
export const dynamic = 'force-dynamic';

async function read(symbol: string) {
  const row = await database()
    .prepare('SELECT * FROM market_history WHERE symbol = ?')
    .bind(symbol)
    .first<{
      payload: string | null;
      requested_at: number;
      attempted_at: number;
      error: string | null;
    }>();
  return json({
    history: row?.payload ? JSON.parse(row.payload) : null,
    pending: Boolean(row && row.requested_at > row.attempted_at),
    error: row?.error ?? null,
  });
}
export async function GET(request: Request) {
  if (!(await userAllowed(request)) && !(await tokenAllowed(request)))
    return json({ error: 'Sign in required' }, 401);
  const symbol = new URL(request.url).searchParams.get('symbol');
  if (!validChartSymbol(symbol))
    return json({ error: 'Enter a valid stock symbol' }, 400);
  return read(symbol);
}
export async function POST(request: Request) {
  if (!(await userAllowed(request)) && !(await tokenAllowed(request)))
    return json({ error: 'Sign in required' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Origin rejected' }, 403);
  let symbol: unknown;
  try {
    symbol = ((await request.json()) as { symbol?: unknown }).symbol;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (!validChartSymbol(symbol))
    return json({ error: 'Enter a valid stock symbol' }, 400);
  const now = Date.now();
  // A single queued request per symbol; frequent browser polling never postpones it.
  await database()
    .prepare(`INSERT INTO market_history(symbol, requested_at)
    SELECT ?, ? WHERE (SELECT COUNT(*) FROM market_history WHERE requested_at > attempted_at) < 100
    ON CONFLICT(symbol) DO UPDATE SET requested_at = excluded.requested_at
    WHERE market_history.requested_at <= market_history.attempted_at
      AND market_history.attempted_at < ? AND COALESCE(market_history.fetched_at, 0) < ?`)
    .bind(symbol, now, now - 60000, now - 300000)
    .run();
  return read(symbol);
}
