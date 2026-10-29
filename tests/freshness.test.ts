import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFresh } from '../lib/freshness.ts';

const now = Date.parse('2026-10-29T12:00:00Z');
const at = (offset: number) => new Date(now + offset).toISOString();

void test('freshness rejects missing, invalid, future and expired receipts', () => {
  for (const timestamp of [
    undefined,
    null,
    '',
    'invalid',
    at(5001),
    at(-45001),
  ])
    assert.equal(isFresh(timestamp, now), false);
  for (const timestamp of [at(0), at(5000), at(-45000)])
    assert.equal(isFresh(timestamp, now), true);
  assert.equal(isFresh(at(0), 0), false, 'initial render is not live');
  assert.equal(isFresh(at(0), Number.NaN), false);
});

void test('unchanged telemetry expires as the clock advances, even without a response', () => {
  const receipt = at(0);
  assert.equal(isFresh(receipt, now), true);
  assert.equal(isFresh(receipt, now + 45001), false);
  assert.equal(isFresh(receipt, now + 300000, 300000), true);
  assert.equal(isFresh(receipt, now + 300001, 300000), false);
});
