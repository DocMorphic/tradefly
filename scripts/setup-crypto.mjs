import { writeFile } from 'node:fs/promises';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
// A fresh testnet-only identity. Never reuse broker credentials or a funded mainnet wallet.
const key = generatePrivateKey();
const account = privateKeyToAccount(key);
try {
  await writeFile(
    '.env.crypto',
    [
      '# Local testnet signer. Never upload this file to Vercel or commit it.',
      'TRADEFLY_RECEIPTS_CHAIN_ID=11155111',
      'TRADEFLY_RECEIPTS_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com',
      'TRADEFLY_RECEIPTS_CONTRACT=',
      `TRADEFLY_TESTNET_PRIVATE_KEY=${key}`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    `Created private .env.crypto. Testnet address: ${account.address}`,
  );
  console.log(
    'Use faucet test ETH for this address, then run npm run crypto:anchor -- deploy. The private key is not printed.',
  );
} catch {
  console.error(
    'Could not create .env.crypto; an existing file is never overwritten.',
  );
  process.exitCode = 1;
}
