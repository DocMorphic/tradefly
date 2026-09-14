import { database, json, userAllowed } from '@/lib/server/backend-store';
import { FlySwarmEngine } from '@/lib/swarm/engine.mjs';
export const dynamic = 'force-dynamic';
type Row = { state: string; revision: number };
async function load(): Promise<Row> {
  const db = database();
  const found = await db
    .prepare('SELECT state,revision FROM swarm_research WHERE id=1')
    .first<Row>();
  if (found) return found;
  const engine = new FlySwarmEngine();
  await db
    .prepare(
      'INSERT OR IGNORE INTO swarm_research(id,state,revision,updated_at) VALUES(1,?,0,?)',
    )
    .bind(JSON.stringify(engine.serialize()), new Date().toISOString())
    .run();
  return (await db
    .prepare('SELECT state,revision FROM swarm_research WHERE id=1')
    .first<Row>())!;
}
export async function GET(request: Request) {
  if (!userAllowed(request)) return json({ error: 'Unauthorized' }, 401);
  try {
    const row = await load();
    return json({
      revision: row.revision,
      snapshot: FlySwarmEngine.restore(JSON.parse(row.state)).snapshot(),
    });
  } catch {
    return json({ error: 'Research state is unavailable. Try again.' }, 503);
  }
}
export async function POST(request: Request) {
  if (!userAllowed(request)) return json({ error: 'Unauthorized' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'Origin rejected' }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (!Number.isInteger(body.revision))
    return json({ error: 'Current revision required' }, 400);
  try {
    const row = await load();
    if (body.revision !== row.revision)
      return json(
        { error: 'Research changed in another window. Refresh and retry.' },
        409,
      );
    const engine = FlySwarmEngine.restore(JSON.parse(row.state));
    if (body.action === 'step') engine.tick();
    else if (body.action === 'reset') engine.reset();
    else if (body.action === 'config') {
      if (
        typeof body.enabled !== 'boolean' ||
        typeof body.minScore !== 'number' ||
        !Number.isFinite(body.minScore) ||
        body.minScore < 55 ||
        body.minScore > 99 ||
        typeof body.maxPosition !== 'number' ||
        !Number.isFinite(body.maxPosition) ||
        body.maxPosition < 10 ||
        body.maxPosition > 5000
      )
        return json(
          { error: 'Provide enabled, score 55–99 and size $10–$5,000' },
          400,
        );
      engine.updateConfig({
        enabled: body.enabled,
        minScore: body.minScore,
        maxPosition: body.maxPosition,
      });
    } else if (body.action === 'focus') {
      if (
        typeof body.symbol !== 'string' ||
        !body.symbol.trim() ||
        body.symbol.length > 18 ||
        typeof body.name !== 'string' ||
        body.name.length > 80 ||
        (body.liquidity !== undefined &&
          (typeof body.liquidity !== 'number' ||
            !Number.isFinite(body.liquidity) ||
            body.liquidity < 0))
      )
        return json({ error: 'Invalid scenario token' }, 400);
      engine.setFocus({
        symbol: body.symbol,
        name: body.name,
        liquidity: body.liquidity as number | undefined,
      });
    } else return json({ error: 'Unknown research action' }, 400);
    const result = await database()
      .prepare(
        'UPDATE swarm_research SET state=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?',
      )
      .bind(
        JSON.stringify(engine.serialize()),
        new Date().toISOString(),
        row.revision,
      )
      .run();
    if (result.meta.changes !== 1)
      return json(
        { error: 'Research changed in another window. Refresh and retry.' },
        409,
      );
    return json({ revision: row.revision + 1, snapshot: engine.snapshot() });
  } catch {
    return json(
      {
        error:
          'Research state could not be saved. Your trading worker is unaffected.',
      },
      503,
    );
  }
}
