import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  parseAbi,
  type Address,
} from 'viem';
import { runKey, type ReceiptBundle } from './receipts.ts';

export const RECEIPTS_ABI = parseAbi([
  'constructor()',
  'function publisher() view returns (address)',
  'function lastSequence(bytes32) view returns (uint256)',
  'function commitments(bytes32,uint256) view returns (bytes32)',
  'function commit(bytes32 runKey,uint256 firstSequence,uint256 last,bytes32 digest)',
  'event Committed(bytes32 indexed runKey,uint256 indexed firstSequence,uint256 lastSequence,bytes32 digest)',
]);
export type ChainSettings = {
  TRADEFLY_RECEIPTS_RPC_URL?: string;
  TRADEFLY_RECEIPTS_CHAIN_ID?: string;
  TRADEFLY_RECEIPTS_CONTRACT?: string;
};
export function receiptChain(settings: ChainSettings) {
  const id = Number(settings.TRADEFLY_RECEIPTS_CHAIN_ID);
  const url = new URL(settings.TRADEFLY_RECEIPTS_RPC_URL || 'invalid:');
  const local =
    id === 31337 &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    url.protocol === 'http:';
  const publicTest =
    [11155111, 84532].includes(id) && url.protocol === 'https:';
  if ((!local && !publicTest) || url.username || url.password || url.hash)
    throw new Error(
      'Receipt publication supports Sepolia, Base Sepolia or loopback Anvil only',
    );
  const name =
    id === 31337
      ? 'Local Ethereum'
      : id === 84532
        ? 'Base Sepolia'
        : 'Ethereum Sepolia';
  const explorer =
    id === 11155111
      ? 'https://sepolia.etherscan.io'
      : id === 84532
        ? 'https://sepolia.basescan.org'
        : null;
  return defineChain({
    id,
    name,
    testnet: true,
    nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [url.href] } },
    ...(explorer
      ? { blockExplorers: { default: { name: 'Explorer', url: explorer } } }
      : {}),
  });
}
export function publicChain(settings: ChainSettings) {
  if (
    !settings.TRADEFLY_RECEIPTS_RPC_URL ||
    !settings.TRADEFLY_RECEIPTS_CHAIN_ID ||
    !isAddress(settings.TRADEFLY_RECEIPTS_CONTRACT || '')
  )
    return null;
  const chain = receiptChain(settings);
  return {
    chain_id: chain.id,
    name: chain.name,
    contract: settings.TRADEFLY_RECEIPTS_CONTRACT as Address,
    explorer: chain.blockExplorers?.default.url ?? null,
  };
}
export async function checkCommitment(
  settings: ChainSettings,
  bundle: Pick<ReceiptBundle, 'manifest' | 'digest'>,
) {
  const configured = publicChain(settings);
  if (!configured) return { status: 'unconfigured' as const, chain: null };
  const chain = receiptChain(settings);
  const client = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0], {
      timeout: 8000,
      retryCount: 0,
    }),
  });
  if ((await client.getChainId()) !== chain.id)
    throw new Error('RPC chain identity mismatch');
  const digest = await client.readContract({
    address: configured.contract,
    abi: RECEIPTS_ABI,
    functionName: 'commitments',
    args: [
      `0x${await runKey(bundle.manifest.run_id)}`,
      BigInt(bundle.manifest.first_sequence),
    ],
  });
  return {
    status:
      digest === `0x${bundle.digest}`
        ? ('matched' as const)
        : /^0x0+$/.test(digest)
          ? ('unpublished' as const)
          : ('mismatch' as const),
    chain: configured,
  };
}
