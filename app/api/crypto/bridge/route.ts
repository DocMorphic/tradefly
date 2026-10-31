import { database, json, tokenAllowed } from '@/lib/server/backend-store';
import { parseCryptoSnapshot } from '@/lib/crypto/snapshot';
import type { CryptoSnapshot } from '@/lib/crypto/snapshot';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!(await tokenAllowed(request)))
    return json({ error: 'Unauthorized' }, 401);
  let snapshot: CryptoSnapshot;
  try {
    const raw = await request.text();
    if (raw.length > 2000000)
      return json({ error: 'Crypto snapshot too large' }, 413);
    snapshot = await parseCryptoSnapshot(JSON.parse(raw));
  } catch {
    return json({ error: 'Invalid crypto snapshot or decision receipts' }, 400);
  }
  try {
    const db = database();
    const old = await db
      .prepare('SELECT snapshot,decision_count FROM crypto_runs WHERE run_id=?')
      .bind(snapshot.run_id)
      .first<{ snapshot: string; decision_count: number }>();
    if (old) {
      const previous = JSON.parse(old.snapshot) as CryptoSnapshot;
      const overlap = snapshot.bundle?.receipts.find(
        (r) => r.record.sequence === old.decision_count,
      );
      const lastHash = previous.bundle?.receipts.at(-1)?.hash;
      if (
        snapshot.decision_count < old.decision_count ||
        (lastHash &&
          (overlap
            ? overlap.hash !== lastHash
            : snapshot.bundle?.manifest.first_sequence !==
                old.decision_count + 1 ||
              snapshot.bundle?.manifest.previous_hash !== lastHash))
      )
        return json(
          { error: 'Crypto run history changed or has a transfer gap' },
          409,
        );
    } else if (
      snapshot.bundle &&
      snapshot.bundle.manifest.first_sequence !== 1
    ) {
      return json({ error: 'Publish a new run from sequence 1' }, 409);
    }
    const received = new Date().toISOString();
    // Optimistic comparison prevents concurrent uploads from replacing a newer run state.
    const result = old
      ? await db
          .prepare(
            'UPDATE crypto_runs SET snapshot=?,decision_count=?,received_at=? WHERE run_id=? AND snapshot=?',
          )
          .bind(
            JSON.stringify(snapshot),
            snapshot.decision_count,
            received,
            snapshot.run_id,
            old.snapshot,
          )
          .run()
      : await db
          .prepare(
            'INSERT OR IGNORE INTO crypto_runs(run_id,snapshot,decision_count,received_at) VALUES(?,?,?,?)',
          )
          .bind(
            snapshot.run_id,
            JSON.stringify(snapshot),
            snapshot.decision_count,
            received,
          )
          .run();
    if (result.meta.changes !== 1)
      return json(
        { error: 'Crypto run changed; retry with current history' },
        409,
      );
    return json({
      received_at: received,
      decision_count: snapshot.decision_count,
    });
  } catch {
    return json(
      { error: 'Crypto storage unavailable; apply database migrations' },
      503,
    );
  }
}
