import { createClient } from '@libsql/client';
import { libsqlStorage } from './libsql-storage';
import { ownerKey, verifySession } from './owner-session';
import type { Storage } from './storage';
import type { ChainSettings } from '../crypto/chain';
let db: Storage | undefined;
export const platform: string = 'vercel';
export function runtime(): {
  DB?: Storage;
  TRADEFLY_BRIDGE_TOKEN?: string;
} & ChainSettings {
  const url = process.env.TURSO_DATABASE_URL;
  if (!db && url) {
    // Vercel filesystems cannot provide durable database storage.
    if (process.env.VERCEL && !/^(libsql|https):\/\//.test(url))
      throw new Error('Configure a remote Turso database on Vercel');
    db = libsqlStorage(
      createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
    );
  }
  return {
    DB: db,
    TRADEFLY_BRIDGE_TOKEN: process.env.TRADEFLY_BRIDGE_TOKEN,
    TRADEFLY_RECEIPTS_CHAIN_ID: process.env.TRADEFLY_RECEIPTS_CHAIN_ID,
    TRADEFLY_RECEIPTS_CONTRACT: process.env.TRADEFLY_RECEIPTS_CONTRACT,
    TRADEFLY_RECEIPTS_RPC_URL: process.env.TRADEFLY_RECEIPTS_RPC_URL,
  };
}
export async function userAllowed(request: Request) {
  // OpenAI identity headers are untrusted on Vercel; only the signed cookie counts.
  return verifySession(request, ownerKey());
}
