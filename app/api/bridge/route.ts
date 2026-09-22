import {
  telemetryBody,
  applyTelemetryDelta,
} from '@/lib/server/telemetry-transport';
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
  let body;
  let snapshot;
  let base: string | undefined;
  try {
    body = await telemetryBody(request);
    const incoming = JSON.parse(body);
    if (incoming.transport === 'delta-v1') {
      const previous = await state();
      if (
        !previous?.snapshot ||
        typeof incoming.base_received_at !== 'string' ||
        incoming.base_received_at !== previous.received_at
      )
        return json({ error: 'Full snapshot required' }, 409);
      base = incoming.base_received_at;
      snapshot = applyTelemetryDelta(
        JSON.parse(previous.snapshot),
        incoming.patch,
      );
      body = JSON.stringify(snapshot);
    } else snapshot = incoming;
  } catch (error) {
    return json(
      { error: 'Invalid or oversized telemetry' },
      error instanceof Error && error.message === 'too_large' ? 413 : 400,
    );
  }
  if (
    snapshot?.schema !== 1 ||
    snapshot?.mode !== 'alpaca-paper' ||
    typeof snapshot?.updated_at !== 'string'
  )
    return json({ error: 'Invalid snapshot' }, 400);
  if (new TextEncoder().encode(body).length > 900000)
    return json({ error: 'Snapshot too large' }, 413);
  // Server receipts are opaque base revisions; CAS rejects a racing/stale delta.
  const now = new Date(
    Math.max(Date.now(), base ? Date.parse(base) + 1 : 0),
  ).toISOString();
  if (base) {
    const updated = await database()
      .prepare(
        'UPDATE backend_state SET snapshot=?, received_at=? WHERE id=1 AND received_at=?',
      )
      .bind(body, now, base)
      .run();
    if (updated.meta?.changes !== 1)
      return json({ error: 'Full snapshot required' }, 409);
  } else
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
    command_payload: row?.command_payload
      ? JSON.parse(row.command_payload)
      : null,
    server_time: now,
    received_at: now,
  });
}

// Read-only control checks never upload or echo the large telemetry snapshot.
export async function GET(request: Request) {
  if (!(await tokenAllowed(request)))
    return json({ error: 'Unauthorized' }, 401);
  const row = await database()
    .prepare(
      'SELECT command, command_id, command_at, command_payload FROM backend_state WHERE id=1',
    )
    .first<{
      command: string;
      command_id: string;
      command_at: string | null;
      command_payload: string | null;
    }>();
  return json({
    command: row?.command ?? 'pause',
    command_id: row?.command_id ?? 'initial',
    command_at: row?.command_at,
    command_payload: row?.command_payload
      ? JSON.parse(row.command_payload)
      : null,
  });
}
