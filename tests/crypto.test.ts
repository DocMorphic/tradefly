import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { cryptoWalkthrough } from '../lib/crypto/demo.ts';
import {
  canonical,
  merkleRoot,
  receiptHash,
  sha256,
  verifyBundle,
  buildBundle,
} from '../lib/crypto/receipts.ts';
import { parseCandles } from '../lib/crypto/market.ts';
import { receiptChain } from '../lib/crypto/chain.ts';
import { parseCryptoSnapshot } from '../lib/crypto/snapshot.ts';

void test('receipt commitment detects edits, omissions, reordering and changes of source', async () => {
  const bundle = await cryptoWalkthrough();
  assert.deepEqual(await verifyBundle(bundle), bundle);
  for (const change of [
    (b: typeof bundle) => {
      b.receipts[0].record.action = 'SELL';
    },
    (b: typeof bundle) => {
      b.receipts[0].record.neural.buy_hz = '33';
    },
    (b: typeof bundle) => {
      b.receipts.splice(1, 1);
    },
    (b: typeof bundle) => {
      b.receipts.reverse();
    },
    (b: typeof bundle) => {
      b.receipts[1].record.source = 'neural';
    },
    (b: typeof bundle) => {
      b.manifest.source = 'neural';
    },
    (b: typeof bundle) => {
      b.manifest.count = 99;
    },
  ]) {
    const edited = structuredClone(bundle);
    change(edited);
    await assert.rejects(verifyBundle(edited));
  }
});

void test('canonical wire format and Merkle hashing match independent Python vectors', async () => {
  const vector = JSON.parse(
    await readFile(
      new URL('./fixtures/crypto-receipts.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(
    await receiptHash(vector.receipts[0].record),
    vector.receipts[0].hash,
  );
  assert.equal(
    await merkleRoot(vector.receipts.map((r: { hash: string }) => r.hash)),
    vector.manifest.root,
  );
  assert.deepEqual(await verifyBundle(vector), vector);
  assert.equal(
    canonical({ z: '☀', a: [1, true, null, 'line\nquote"'] }),
    '{"a":[1,true,null,"line\\nquote\\\""],"z":"☀"}',
  );
  for (const invalid of [
    Number.NaN,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    undefined,
    { 非ASCII: 'key' },
  ])
    assert.throws(() => canonical(invalid));
});

void test('even rehashed records refuse future inputs, gaps and inconsistent neural decoding', async () => {
  for (const kind of ['future', 'gap', 'decoder', 'extra']) {
    const b = await cryptoWalkthrough();
    const r = structuredClone(b.receipts[0].record);
    r.sequence = 1;
    r.source = 'neural';
    r.observation.provider = 'coinbase-exchange';
    if (kind === 'future') r.decided_at = r.observation.bars.at(-1)!.at;
    if (kind === 'gap') r.observation.bars[1].at = r.observation.bars[0].at;
    if (kind === 'decoder') r.action = 'SELL';
    if (kind === 'extra')
      Object.assign(r, { api_key: 'unexpected-private-field' });
    const receipt = { record: r, hash: await receiptHash(r) };
    await assert.rejects(verifyBundle(await buildBundle([receipt])));
  }
});

void test('crypto candles preserve gaps, drop forming bars and reject invalid or revised OHLCV', () => {
  const now = Date.parse('2026-10-31T10:15:00Z');
  const t = now / 1000;
  const raw = [
    [t, 99, 102, 100, 101, 12],
    [t - 900, 99, 102, 100, 101, 12],
    [t - 300, 100, 103, 101, 102, 13],
  ];
  const bars = parseCandles(raw, now);
  assert.equal(bars.length, 2);
  assert.equal(Date.parse(bars[1].at) - Date.parse(bars[0].at), 600000);
  assert.throws(() => parseCandles([[t - 300, 103, 102, 100, 101, 12]], now));
  assert.throws(() =>
    parseCandles([raw[2], [t - 300, 100, 103, 101, 102.5, 13]], now),
  );
});

void test('receipt network allowlist refuses real-money chains and remote local-chain RPCs', () => {
  for (const settings of [
    {
      TRADEFLY_RECEIPTS_CHAIN_ID: '1',
      TRADEFLY_RECEIPTS_RPC_URL: 'https://ethereum.example',
    },
    {
      TRADEFLY_RECEIPTS_CHAIN_ID: '31337',
      TRADEFLY_RECEIPTS_RPC_URL: 'https://remote.example',
    },
    {
      TRADEFLY_RECEIPTS_CHAIN_ID: '31337',
      TRADEFLY_RECEIPTS_RPC_URL: 'http://remote.example',
    },
    {
      TRADEFLY_RECEIPTS_CHAIN_ID: '11155111',
      TRADEFLY_RECEIPTS_RPC_URL: 'http://remote.example',
    },
  ])
    assert.throws(() => receiptChain(settings));
  assert.equal(
    receiptChain({
      TRADEFLY_RECEIPTS_CHAIN_ID: '31337',
      TRADEFLY_RECEIPTS_RPC_URL: 'http://127.0.0.1:8545',
    }).id,
    31337,
  );
  assert.equal(
    receiptChain({
      TRADEFLY_RECEIPTS_CHAIN_ID: '84532',
      TRADEFLY_RECEIPTS_RPC_URL: 'https://sepolia.base.org',
    }).testnet,
    true,
  );
});

void test('synthetic walkthrough cannot be uploaded as recorded neural telemetry', async () => {
  const bundle = await cryptoWalkthrough();
  await assert.rejects(
    parseCryptoSnapshot({ source: 'synthetic-demo', bundle }),
  );
  assert.equal(await sha256(canonical(bundle.manifest)), bundle.digest);
});
