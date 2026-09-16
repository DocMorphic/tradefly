import { createClient } from '@libsql/client';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export async function migrate(
  client,
  root = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
) {
  await client.execute(
    'CREATE TABLE IF NOT EXISTS tradefly_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  const journal = JSON.parse(
    await readFile(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'),
  );
  for (const entry of journal.entries) {
    const sql = await readFile(
      path.join(root, 'drizzle', entry.tag + '.sql'),
      'utf8',
    );
    const hash = createHash('sha256').update(sql).digest('hex');
    const tx = await client.transaction('write');
    try {
      const existing = await tx.execute({
        sql: 'SELECT sha256 FROM tradefly_migrations WHERE name=?',
        args: [entry.tag],
      });
      if (existing.rows.length) {
        if (existing.rows[0].sha256 !== hash)
          throw new Error('An applied migration was modified: ' + entry.tag);
      } else {
        for (const statement of sql
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter(Boolean))
          await tx.execute(statement);
        await tx.execute({
          sql: 'INSERT INTO tradefly_migrations(name,sha256,applied_at) VALUES(?,?,?)',
          args: [entry.tag, hash, new Date().toISOString()],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (!process.env.TURSO_DATABASE_URL) {
    console.error(
      'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local first.',
    );
    process.exit(1);
  }
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  try {
    await migrate(client);
    console.log('Tradefly database is ready.');
  } catch {
    console.error(
      'Database migration failed. Check the database URL, token, and migration history.',
    );
    process.exitCode = 1;
  } finally {
    client.close();
  }
}
