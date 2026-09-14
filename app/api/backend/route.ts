import { database, json, state, userAllowed } from '@/lib/server/backend-store';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!userAllowed(request)) return json({ error: 'Sign in required' }, 401);
  try {
    const row = await state();
    return json({
      snapshot: row?.snapshot ? JSON.parse(row.snapshot) : null,
      received_at: row?.received_at,
      command: row?.command ?? 'pause',
      command_id: row?.command_id ?? 'initial',
    });
  } catch {
    return json({ error: 'Backend connection is being configured' }, 503);
  }
}
export async function POST(request: Request) {
  if (!userAllowed(request)) return json({ error: 'Sign in required' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'Origin rejected' }, 403);
  let command;
  try {
    command = ((await request.json()) as { command?: unknown }).command;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (!['pause', 'resume'].includes(String(command)))
    return json({ error: 'Only pause or resume is supported' }, 400);
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
  const id = crypto.randomUUID();
  await database()
    .prepare(`INSERT INTO backend_state(id,command,command_id,command_at) VALUES(1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET command=excluded.command,command_id=excluded.command_id,command_at=excluded.command_at`)
    .bind(command, id, new Date().toISOString())
    .run();
  return json({ command, command_id: id });
}
