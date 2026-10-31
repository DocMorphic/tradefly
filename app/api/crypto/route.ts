import { database, json, runtime } from '@/lib/server/backend-store';
import { publicChain } from '@/lib/crypto/chain';
export const dynamic = 'force-dynamic';
export async function GET() {
  let chain = null;
  try {
    chain = publicChain(runtime());
  } catch {
    /* Invalid settings do not disable local verification. */
  }
  try {
    const row = await database()
      .prepare(
        'SELECT snapshot,received_at FROM crypto_runs ORDER BY received_at DESC LIMIT 1',
      )
      .first<{ snapshot: string; received_at: string }>();
    return json({
      snapshot: row ? JSON.parse(row.snapshot) : null,
      received_at: row?.received_at ?? null,
      chain,
    });
  } catch {
    return json({
      snapshot: null,
      received_at: null,
      chain,
      storage: 'unavailable',
    });
  }
}
