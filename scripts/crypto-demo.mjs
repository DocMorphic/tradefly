// Complete local blockchain walkthrough. Does not load a brain or access broker credentials.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@libsql/client';
import { migrate } from './migrate-vercel.mjs';
import { cryptoWalkthrough } from '../lib/crypto/demo.ts';
import { createPublicClient, http } from 'viem';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const folder = await mkdtemp(path.join(tmpdir(), 'tradefly-crypto-demo-'));
const children = [];
let closing = false;
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function close() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once('exit', resolve);
    });
  }
  await rm(folder, { recursive: true, force: true });
}
process.on('SIGINT', () => {
  void close();
});
process.on('SIGTERM', () => {
  void close();
});
try {
  const rpcPort = await freePort(),
    webPort = await freePort();
  const rpc = `http://127.0.0.1:${rpcPort}`;
  const anvil = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/@foundry-rs/anvil/bin.mjs'),
      '--host',
      '127.0.0.1',
      '--port',
      String(rpcPort),
      '--silent',
    ],
    { cwd: folder, stdio: 'ignore' },
  );
  children.push(anvil);
  const client = createPublicClient({
    transport: http(rpc, { retryCount: 0 }),
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (anvil.exitCode !== null) throw new Error('Local Ethereum exited');
    try {
      await client.getChainId();
      ready = true;
      break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Local Ethereum unavailable');
  const settings = {
    TRADEFLY_RECEIPTS_RPC_URL: rpc,
    TRADEFLY_RECEIPTS_CHAIN_ID: '31337',
    // Public Anvil development account; the CLI refuses it on public networks.
    TRADEFLY_TESTNET_PRIVATE_KEY:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  };
  const cli = (args) =>
    exec(
      process.execPath,
      [
        '--experimental-strip-types',
        path.join(root, 'scripts/crypto-anchor.mjs'),
        ...args,
      ],
      { cwd: folder, env: { ...process.env, ...settings } },
    );
  const deployed = JSON.parse((await cli(['deploy'])).stdout);
  settings.TRADEFLY_RECEIPTS_CONTRACT = deployed.contract;
  const input = path.join(folder, 'walkthrough.json');
  await writeFile(input, JSON.stringify(await cryptoWalkthrough()));
  const published = JSON.parse((await cli(['publish', input])).stdout);
  const url = 'file:' + path.join(folder, 'website.db');
  const db = createClient({ url });
  await migrate(db);
  db.close();
  const next = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        TURSO_DATABASE_URL: url,
        TURSO_AUTH_TOKEN: '',
        VERCEL: '',
        TRADEFLY_OWNER_KEY: randomBytes(32).toString('hex'),
        TRADEFLY_BRIDGE_TOKEN: randomBytes(32).toString('hex'),
        TRADEFLY_RECEIPTS_RPC_URL: rpc,
        TRADEFLY_RECEIPTS_CHAIN_ID: '31337',
        TRADEFLY_RECEIPTS_CONTRACT: deployed.contract,
      },
    },
  );
  children.unshift(next);
  console.log(
    `Crypto walkthrough: http://127.0.0.1:${webPort} — open Crypto Lab, load the walkthrough and verify its receipts.`,
  );
  console.log(`Local Ethereum commitment mined: ${published.transaction_hash}`);
  console.log(
    'Synthetic records, test Ether and a temporary website database. The stock and crypto brain workers remain stopped. Ctrl+C cleans up.',
  );
  await new Promise((resolve) => next.once('exit', resolve));
} catch {
  console.error(
    'Local crypto demo could not start. Run npm ci and npm run build:vercel first.',
  );
  process.exitCode = 1;
} finally {
  await close();
}
