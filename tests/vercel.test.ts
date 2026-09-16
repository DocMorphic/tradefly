import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { SignJWT } from 'jose';
import { migrate } from '../scripts/migrate-vercel.mjs';
import { libsqlStorage } from '../lib/server/libsql-storage.ts';
import {
  createSession,
  verifySession,
  SESSION_COOKIE,
} from '../lib/server/owner-session.ts';

void test('owner cookies require a valid signature and expiry; platform headers grant no access', async () => {
  const key = 'a'.repeat(43),
    token = await createSession(key);
  const req = (cookie = '') =>
    new Request('https://tradefly.example/api/backend', {
      headers: { cookie, 'oai-authenticated-user-id': 'spoofed-owner' },
    });
  assert.equal(await verifySession(req(), key), false);
  assert.equal(
    await verifySession(req(`${SESSION_COOKIE}=${token}`), key),
    true,
  );
  assert.equal(
    await verifySession(req(`${SESSION_COOKIE}=${token}`), 'b'.repeat(43)),
    false,
  );
  assert.equal(
    await verifySession(req(`${SESSION_COOKIE}=${token}`), null),
    false,
  );
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('owner')
    .setAudience('tradefly-desktop')
    .setIssuer('tradefly')
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(new TextEncoder().encode(key));
  assert.equal(
    await verifySession(req(`${SESSION_COOKIE}=${expired}`), key),
    false,
  );
});

void test('Vercel SQLite migrations are repeatable and conditional updates preserve revision checks', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    await migrate(client);
    await migrate(client);
    const db = libsqlStorage(client);
    assert.equal(
      (await client.execute('SELECT * FROM tradefly_migrations')).rows.length,
      4,
    );
    await db
      .prepare(
        'INSERT INTO swarm_research(id,state,revision,updated_at) VALUES(1,?,0,?)',
      )
      .bind('{}', 'now')
      .run();
    const update = () =>
      db
        .prepare(
          'UPDATE swarm_research SET revision=revision+1 WHERE id=1 AND revision=?',
        )
        .bind(0)
        .run();
    assert.equal((await update()).meta.changes, 1);
    assert.equal((await update()).meta.changes, 0);
    assert.equal(
      (
        await db
          .prepare('SELECT revision FROM swarm_research WHERE id=1')
          .first<{ revision: number }>()
      )?.revision,
      1,
    );
    assert.equal(
      (await db.prepare('SELECT * FROM market_history').all()).results.length,
      0,
    );
  } finally {
    client.close();
  }
});
