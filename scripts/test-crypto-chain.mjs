// A real Solidity deployment and transactions on a disposable loopback Ethereum node.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  RECEIPTS_ABI,
  receiptChain,
  checkCommitment,
} from '../lib/crypto/chain.ts';
import { runKey, verifyBundle } from '../lib/crypto/receipts.ts';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const folder = await mkdtemp(path.join(tmpdir(), 'tradefly-crypto-chain-'));
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const child = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/@foundry-rs/anvil/bin.mjs'),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--chain-id',
    '31337',
    '--silent',
  ],
  { stdio: 'ignore', cwd: folder },
);
// Public, deterministic Anvil development key. Never used with a public network.
const developmentKey =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const settings = {
  TRADEFLY_RECEIPTS_RPC_URL: `http://127.0.0.1:${port}`,
  TRADEFLY_RECEIPTS_CHAIN_ID: '31337',
  TRADEFLY_TESTNET_PRIVATE_KEY: developmentKey,
};
const cli = (args) =>
  exec(
    process.execPath,
    [
      '--experimental-strip-types',
      path.join(root, 'scripts/crypto-anchor.mjs'),
      ...args,
    ],
    { cwd: folder, env: { ...process.env, ...settings }, timeout: 120000 },
  );
try {
  const client = createPublicClient({
    chain: receiptChain(settings),
    transport: http(settings.TRADEFLY_RECEIPTS_RPC_URL, { retryCount: 0 }),
    pollingInterval: 50,
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null)
      throw new Error('Local Ethereum node exited before startup');
    try {
      await client.getChainId();
      ready = true;
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, 'Local Ethereum starts');
  const deployed = JSON.parse((await cli(['deploy'])).stdout);
  settings.TRADEFLY_RECEIPTS_CONTRACT = deployed.contract;
  assert.equal(
    await client.readContract({
      address: deployed.contract,
      abi: RECEIPTS_ABI,
      functionName: 'publisher',
    }),
    privateKeyToAccount(developmentKey).address,
  );
  const bundle = await verifyBundle(
    JSON.parse(
      await readFile(
        path.join(root, 'tests/fixtures/crypto-receipts.json'),
        'utf8',
      ),
    ),
  );
  const input = path.join(folder, 'receipts.json');
  await writeFile(input, JSON.stringify(bundle));
  assert.equal((await checkCommitment(settings, bundle)).status, 'unpublished');
  const publication = JSON.parse((await cli(['publish', input])).stdout);
  const mined = await client.getTransactionReceipt({
    hash: publication.transaction_hash,
  });
  assert.equal(mined.status, 'success');
  assert.equal((await checkCommitment(settings, bundle)).status, 'matched');
  assert.equal(
    JSON.parse((await cli(['verify', input])).stdout).status,
    'matched',
  );
  await assert.rejects(
    cli(['publish', input]),
    'Duplicate publication is rejected',
  );
  const run = `0x${await runKey(bundle.manifest.run_id)}`;
  const account = privateKeyToAccount(developmentKey);
  await assert.rejects(
    client.simulateContract({
      address: deployed.contract,
      abi: RECEIPTS_ABI,
      functionName: 'commit',
      account,
      args: [run, 5n, 6n, `0x${bundle.digest}`],
    }),
    'Missing batch is rejected',
  );
  await assert.rejects(
    client.simulateContract({
      address: deployed.contract,
      abi: RECEIPTS_ABI,
      functionName: 'commit',
      account: '0x0000000000000000000000000000000000000001',
      args: [run, 4n, 4n, `0x${bundle.digest}`],
    }),
    'Only the publisher can write',
  );
  const edited = structuredClone(bundle);
  edited.receipts[0].record.action = 'SELL';
  await writeFile(input, JSON.stringify(edited));
  const nonce = await client.getTransactionCount({ address: account.address });
  await assert.rejects(
    cli(['publish', input]),
    'Altered records are rejected before broadcast',
  );
  assert.equal(
    await client.getTransactionCount({ address: account.address }),
    nonce,
  );
  console.log(
    'Crypto blockchain checks passed: Solidity compilation, deployment, mined commitment, CLI verification, publisher restriction, duplicate/gap refusal and tamper rejection. Disposable local chain only.',
  );
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
  await rm(folder, { recursive: true, force: true });
}
