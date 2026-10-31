import { env } from 'cloudflare:workers';
import type { Storage } from './storage';
import type { ChainSettings } from '../crypto/chain';
export const platform: string = 'sites';
export function runtime() {
  return env as unknown as {
    DB?: Storage;
    TRADEFLY_BRIDGE_TOKEN?: string;
  } & ChainSettings;
}
export async function userAllowed(request: Request) {
  return Boolean(request.headers.get('oai-authenticated-user-id'));
}
