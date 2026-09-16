import { database, json, tokenAllowed } from '@/lib/server/backend-store';
import { validChartSymbol, validHistory } from '@/lib/market-history';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!(await tokenAllowed(request)))
    return json({ error: 'Unauthorized' }, 401);
  const rows = await database()
    .prepare(`SELECT symbol, requested_at FROM market_history
    WHERE requested_at > attempted_at ORDER BY requested_at LIMIT 4`)
    .all();
  return json({ requests: rows.results });
}
export async function POST(request: Request) {
  if (!(await tokenAllowed(request)))
    return json({ error: 'Unauthorized' }, 401);
  const raw = await request.text();
  if (raw.length > 180000) return json({ error: 'History too large' }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (
    !validChartSymbol(body.symbol) ||
    !Number.isSafeInteger(body.requested_at)
  )
    return json({ error: 'Invalid request' }, 400);
  if (body.history !== undefined) {
    if (!validHistory(body.history) || body.history.symbol !== body.symbol)
      return json({ error: 'Invalid history' }, 400);
    await database()
      .prepare(`UPDATE market_history SET payload = ?, fetched_at = ?, attempted_at = ?, error = NULL
      WHERE symbol = ? AND requested_at = ?`)
      .bind(
        JSON.stringify(body.history),
        Date.now(),
        body.requested_at,
        body.symbol,
        body.requested_at,
      )
      .run();
  } else {
    const errors: Record<string, string> = {
      unavailable: 'History is temporarily unavailable. Retrying shortly.',
      access: 'Delayed market history access was denied.',
      symbol: 'No historical data was found for this symbol.',
    };
    if (!errors[body.error]) return json({ error: 'Invalid error' }, 400);
    await database()
      .prepare(`UPDATE market_history SET attempted_at = ?, error = ?
      WHERE symbol = ? AND requested_at = ?`)
      .bind(
        body.requested_at,
        errors[body.error],
        body.symbol,
        body.requested_at,
      )
      .run();
  }
  return json({ ok: true });
}
