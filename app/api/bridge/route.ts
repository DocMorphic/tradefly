import {
  database,
  json,
  state,
  tokenAllowed,
} from '@/lib/server/backend-store';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!(await tokenAllowed(request)))
    return json({ error: 'Unauthorized' }, 401);
  const body = await request.text();
  if (body.length > 900000) return json({ error: 'Snapshot too large' }, 413);
  let snapshot;
  try {
    snapshot = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (
    snapshot?.schema !== 1 ||
    snapshot?.mode !== 'alpaca-paper' ||
    typeof snapshot?.updated_at !== 'string'
  )
    return json({ error: 'Invalid snapshot' }, 400);
  const now = new Date().toISOString();
  await database()
    .prepare(`INSERT INTO backend_state (id,snapshot,received_at) VALUES (1,?,?)
    ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,received_at=excluded.received_at`)
    .bind(body, now)
    .run();
  const row = await state();
  return json({
    command: row?.command,
    command_id: row?.command_id,
    command_at: row?.command_at,
    server_time: now,
  });
}
