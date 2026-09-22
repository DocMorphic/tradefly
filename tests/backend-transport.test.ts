import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
  assembleSnapshot,
  snapshotChunks,
  chunkDelta,
  parseVersions,
} from '../lib/backend-transport.ts';
import {
  applyTelemetryDelta,
  telemetryBody,
} from '../lib/server/telemetry-transport.ts';

void test('browser deltas reconstruct exact state including deletions and nulls', async () => {
  const before = {
    updated_at: 'old',
    decisions: [{ id: 'a' }],
    universe: {
      symbols: ['AAPL', 'MSFT'],
      statuses: { AAPL: 'HOLD' },
      session_seconds: 10,
    },
    removed: true,
    account: { cash: '10' },
  };
  const next = {
    updated_at: 'new',
    decisions: [{ id: 'a' }],
    universe: {
      symbols: ['AAPL', 'MSFT'],
      statuses: { AAPL: 'HOLD' },
      session_seconds: 20,
    },
    account: null,
  };
  const first = await chunkDelta(snapshotChunks(before), {});
  assert.deepEqual(assembleSnapshot(first.changes), before);
  const second = await chunkDelta(snapshotChunks(next), first.versions);
  assert.deepEqual(Object.keys(second.changes).sort(), [
    'account',
    'universe/session_seconds',
    'updated_at',
  ]);
  assert.deepEqual(second.removed, ['removed']);
  const combined = { ...first.changes, ...second.changes };
  for (const key of second.removed) delete combined[key];
  assert.deepEqual(assembleSnapshot(combined), next);
  assert.deepEqual(
    (await chunkDelta(snapshotChunks(next), second.versions)).changes,
    {},
  );
});
void test('invalid or oversized browser versions cannot influence authentication or state', () => {
  for (const raw of ['null', '[]', 'bad', 'x'.repeat(8001)])
    assert.deepEqual(parseVersions(raw), {});
  assert.deepEqual(
    parseVersions(
      '{"__proto__":"aaaaaaaaaaaaaaaaaaaaaaaa","can_control":"true"}',
    ),
    {},
  );
});
void test('worker object patches preserve absent/null distinction and arrays', () => {
  const before = { a: null, b: [1, 2], c: { keep: 1, gone: 2 }, removed: true };
  const patch = {
    set: { a: 5, b: [], added: null },
    remove: ['removed'],
    children: { c: { set: { newer: 3 }, remove: ['gone'], children: {} } },
  };
  assert.deepEqual(applyTelemetryDelta(before, patch), {
    a: 5,
    b: [],
    added: null,
    c: { keep: 1, newer: 3 },
  });
  assert.deepEqual(before.c, { keep: 1, gone: 2 });
  assert.throws(() =>
    applyTelemetryDelta(
      {},
      JSON.parse('{"set":{"__proto__":{}},"remove":[],"children":{}}'),
    ),
  );
});
void test('compressed requests round trip with bounded inflation and corrupt-input rejection', async () => {
  const body = JSON.stringify({ schema: 1, text: 'hello 世界' });
  const req = (value: Buffer) =>
    new Request('https://test/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.tradefly.telemetry+gzip' },
      body: new Uint8Array(value).buffer,
    });
  assert.equal(await telemetryBody(req(gzipSync(body))), body);
  await assert.rejects(
    telemetryBody(req(gzipSync('x'.repeat(900001)))),
    /too_large/,
  );
  await assert.rejects(telemetryBody(req(Buffer.from('invalid gzip'))));
});
