// Exercises the production Next.js server with an isolated database and throwaway keys.
import { createClient } from '@libsql/client';
import { migrate } from './migrate-vercel.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const folder = await mkdtemp(path.join(tmpdir(), 'tradefly-vercel-'));
const url = 'file:' + path.join(folder, 'test.db');
const owner = randomBytes(32).toString('base64url'),
  bridge = randomBytes(32).toString('base64url');
const db = createClient({ url });
await migrate(db);
db.close();
const origin = 'http://127.0.0.1:3041';
const child = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3041',
  ],
  {
    env: {
      ...process.env,
      VERCEL: '',
      TURSO_DATABASE_URL: url,
      TURSO_AUTH_TOKEN: '',
      TRADEFLY_OWNER_KEY: owner,
      TRADEFLY_BRIDGE_TOKEN: bridge,
    },
    stdio: 'ignore',
  },
);
const call = (route, init = {}) =>
  fetch(origin + route, { ...init, redirect: 'manual' });
let cookie = '';
const post = (route, body, auth = {}) =>
  call(route, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null)
      throw Error('Production server exited before startup');
    try {
      if ((await call('/api/session')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, 'Production server starts');
  assert.equal((await call('/')).status, 200);
  assert.equal((await call('/login')).status, 200);
  assert.equal(
    (
      await call('/api/backend', {
        headers: { 'oai-authenticated-user-id': 'forged' },
      })
    ).status,
    401,
  );
  assert.equal((await post('/api/session', { key: 'wrong' })).status, 401);
  const signedIn = await post('/api/session', { key: owner });
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  cookie = signedIn.headers.get('set-cookie').split(';')[0];
  const auth = { cookie };
  assert.equal((await call('/api/backend', { headers: auth })).status, 200);
  assert.equal(
    (await post('/api/backend', { command: 'resume' }, auth)).status,
    409,
  );
  assert.equal(
    (
      await call('/api/backend', {
        method: 'POST',
        headers: {
          ...auth,
          Origin: 'https://other.example',
          'Content-Type': 'application/json',
        },
        body: '{"command":"pause"}',
      })
    ).status,
    403,
  );
  const snapshot = {
    schema: 1,
    mode: 'alpaca-paper',
    updated_at: new Date().toISOString(),
    paused: true,
    brain: { ready: false },
    broker: { connected: false },
  };
  assert.equal((await post('/api/bridge', snapshot)).status, 401);
  assert.equal(
    (await post('/api/bridge', snapshot, { Authorization: 'Bearer ' + bridge }))
      .status,
    200,
  );
  assert.deepEqual(
    (await (await call('/api/backend', { headers: auth })).json()).snapshot,
    snapshot,
  );
  assert.equal((await call('/api/swarm', { headers: auth })).status, 200);
  assert.equal(
    (await post('/api/market-history', { symbol: 'FEMY' }, auth)).status,
    200,
  );
  const jobs = await (
    await call('/api/market-history/bridge', {
      headers: { Authorization: 'Bearer ' + bridge },
    })
  ).json();
  assert.equal(jobs.requests.length, 1);
  const history = {
    symbol: 'FEMY',
    feed: 'sip',
    delay_minutes: 15,
    timeframe: '5Min',
    fetched_at: new Date().toISOString(),
    through: new Date(Date.now() - 960000).toISOString(),
    bars: [],
  };
  assert.equal(
    (
      await post(
        '/api/market-history/bridge',
        { ...jobs.requests[0], history },
        { Authorization: 'Bearer ' + bridge },
      )
    ).status,
    200,
  );
  const cached = await (
    await call('/api/market-history?symbol=FEMY', { headers: auth })
  ).json();
  assert.equal(cached.pending, false);
  assert.equal(cached.history.feed, 'sip');
  await post('/api/market-history', { symbol: 'FEMY' }, auth);
  const after = await (
    await call('/api/market-history/bridge', {
      headers: { Authorization: 'Bearer ' + bridge },
    })
  ).json();
  assert.equal(
    after.requests.length,
    0,
    'Fresh chart cache is not fetched again',
  );
  const logout = await call('/api/session', {
    method: 'DELETE',
    headers: { Origin: origin, ...auth },
  });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await call('/api/backend')).status, 401);
  console.log(
    'Vercel production checks passed: pages, owner login, forged-header rejection, origin checks, resume guard, telemetry, research state, delayed-chart queue/cache and logout.',
  );
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
  await rm(folder, { recursive: true, force: true });
}
