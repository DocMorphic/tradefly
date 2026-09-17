import { publicSnapshot } from '@/lib/server/public-snapshot';
import { sameOrigin } from '@/lib/server/request-origin';
import { database, json, state, userAllowed } from '@/lib/server/backend-store';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const canControl = await userAllowed(request);
  try {
    const row = await state();
    return json({
      snapshot: row?.snapshot ? publicSnapshot(JSON.parse(row.snapshot)) : null,
      can_control: canControl,
      received_at: row?.received_at,
      command: row?.command ?? 'pause',
      command_id: row?.command_id ?? 'initial',
    });
  } catch {
    return json({ error: 'Backend connection is being configured' }, 503);
  }
}
export async function POST(request: Request) {
  if (!(await userAllowed(request)))
    return json({ error: 'Sign in required' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Origin rejected' }, 403);
  let command;
  let symbols: unknown;
  let mode: unknown;
  try {
    const body = (await request.json()) as {
      command?: unknown;
      symbols?: unknown;
      mode?: unknown;
    };
    command = body.command;
    symbols = body.symbols;
    mode = body.mode;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (
    typeof command !== 'string' ||
    !['pause', 'resume', 'watchlist', 'decoder'].includes(command)
  )
    return json({ error: 'Unknown command' }, 400);
  const row = await state();
  const snapshot = row?.snapshot ? JSON.parse(row.snapshot) : null;
  if (
    command === 'resume' &&
    (!row?.received_at ||
      Date.now() - Date.parse(row.received_at) > 45000 ||
      !snapshot?.brain?.ready ||
      !snapshot?.broker?.connected)
  )
    return json(
      { error: 'A connected account and validated brain are required' },
      409,
    );
  if (command === 'decoder') {
    if (!['original', 'learned', 'shadow'].includes(String(mode)))
      return json({ error: 'Unknown decoder' }, 400);
    if (
      !snapshot?.paused ||
      !row?.received_at ||
      Date.now() - Date.parse(row.received_at) > 45000
    )
      return json({ error: 'Connect and pause the worker first' }, 409);
    if (
      mode === 'learned' &&
      (!snapshot?.learning?.eligible ||
        !snapshot.learning.updated_at ||
        Date.now() - Date.parse(snapshot.learning.updated_at) > 300000)
    )
      return json(
        { error: 'The learner must pass a fresh held-out evaluation first' },
        409,
      );
  }
  if (command === 'watchlist') {
    if (snapshot?.universe)
      return json(
        { error: 'Full-market mode has no handpicked watchlist' },
        409,
      );
    if (
      !snapshot?.paused ||
      !row?.received_at ||
      Date.now() - Date.parse(row.received_at) > 45000
    )
      return json(
        { error: 'Connect and pause the worker before changing stocks' },
        409,
      );
    if (
      !Array.isArray(symbols) ||
      symbols.length < 1 ||
      symbols.length > 24 ||
      new Set(symbols).size !== symbols.length ||
      symbols.some(
        (s) => typeof s !== 'string' || !/^[A-Z][A-Z0-9.]{0,9}$/.test(s),
      )
    )
      return json(
        { error: 'Provide 1–24 unique uppercase stock symbols' },
        400,
      );
  }
  const id = crypto.randomUUID();
  await database()
    .prepare(
      `INSERT INTO backend_state(id,command,command_id,command_at,command_payload) VALUES(1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET command=excluded.command,command_id=excluded.command_id,command_at=excluded.command_at,command_payload=excluded.command_payload`,
    )
    .bind(
      command,
      id,
      new Date().toISOString(),
      command === 'watchlist'
        ? JSON.stringify({ symbols })
        : command === 'decoder'
          ? JSON.stringify({ mode })
          : null,
    )
    .run();
  return json({ command, command_id: id });
}
