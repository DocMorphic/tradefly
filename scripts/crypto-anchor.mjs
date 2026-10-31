// Signer lives only in this explicit local CLI, never in the frontend or Vercel.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  RECEIPTS_ABI,
  receiptChain,
  checkCommitment,
} from '../lib/crypto/chain.ts';
import { runKey, verifyBundle } from '../lib/crypto/receipts.ts';
import { compileReceipts } from './crypto-contract.mjs';

async function main() {
  const [action, file] = process.argv.slice(2);
  if (
    !['deploy', 'publish', 'verify'].includes(action) ||
    (action !== 'deploy' && !file)
  )
    throw new Error(
      'Usage: npm run crypto:anchor -- deploy | publish BUNDLE.json | verify BUNDLE.json',
    );
  const settings = process.env;
  const chain = receiptChain(settings);
  const transport = http(chain.rpcUrls.default.http[0], {
    retryCount: 0,
    timeout: 15000,
  });
  const client = createPublicClient({ chain, transport });
  if ((await client.getChainId()) !== chain.id)
    throw new Error('RPC chain identity mismatch');
  const bundle =
    action !== 'deploy'
      ? await verifyBundle(JSON.parse(await readFile(file, 'utf8')))
      : null;
  if (action === 'verify') {
    const checked = await checkCommitment(settings, bundle);
    console.log(JSON.stringify({ integrity: 'matched', ...checked }, null, 2));
    if (checked.status !== 'matched') process.exitCode = 1;
    return;
  }
  const key = settings.TRADEFLY_TESTNET_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key || ''))
    throw new Error(
      'Set a dedicated testnet signer locally; no key is printed or sent to the website',
    );
  const account = privateKeyToAccount(key);
  if (
    chain.id !== 31337 &&
    account.address.toLowerCase() ===
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
  )
    throw new Error(
      'The public Anvil development key cannot be used on a public network',
    );
  const wallet = createWalletClient({ chain, transport, account });
  let hash;
  if (action === 'deploy') {
    const compiled = await compileReceipts();
    hash = await wallet.deployContract(compiled);
  } else {
    const address = settings.TRADEFLY_RECEIPTS_CONTRACT;
    if (!isAddress(address || ''))
      throw new Error('Configure the receipt contract before publishing');
    if (
      (await client.readContract({
        address,
        abi: RECEIPTS_ABI,
        functionName: 'publisher',
      })) !== account.address
    )
      throw new Error('Signer is not this contract’s publisher');
    const key = `0x${await runKey(bundle.manifest.run_id)}`;
    const last = await client.readContract({
      address,
      abi: RECEIPTS_ABI,
      functionName: 'lastSequence',
      args: [key],
    });
    if (last + 1n !== BigInt(bundle.manifest.first_sequence))
      throw new Error(
        'Publish consecutive batches from sequence 1; duplicates and gaps are refused',
      );
    const request = await client.simulateContract({
      address,
      abi: RECEIPTS_ABI,
      functionName: 'commit',
      account,
      args: [
        key,
        BigInt(bundle.manifest.first_sequence),
        BigInt(bundle.manifest.last_sequence),
        `0x${bundle.digest}`,
      ],
    });
    hash = await wallet.writeContract(request.request);
  }
  const mined = await client.waitForTransactionReceipt({ hash });
  if (mined.status !== 'success')
    throw new Error('Receipt transaction reverted');
  await mkdir('runs/crypto-lab', { recursive: true });
  const result = {
    chain_id: chain.id,
    network: chain.name,
    contract: mined.contractAddress || settings.TRADEFLY_RECEIPTS_CONTRACT,
    transaction_hash: hash,
    block_number: mined.blockNumber.toString(),
    ...(bundle
      ? { digest: bundle.digest, run_id: bundle.manifest.run_id }
      : {}),
  };
  await writeFile(
    `runs/crypto-lab/${action}-${hash}.json`,
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => {
  // RPC errors can include credential-bearing URLs. Never dump them or signer data.
  console.error(
    'Receipt action failed. Check the test network, funded testnet signer, contract publisher and consecutive batch range. No live-money chain is supported.',
  );
  process.exitCode = 1;
});
