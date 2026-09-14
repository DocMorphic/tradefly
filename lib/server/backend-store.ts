import { env } from 'cloudflare:workers';

type Runtime = { DB?: D1Database; TRADEFLY_BRIDGE_TOKEN?: string };
export function runtime() {
  return env as unknown as Runtime;
}
export function database() {
  const db = runtime().DB;
  if (!db) throw new Error('Backend storage is not configured');
  return db;
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export function userAllowed(request: Request) {
  return Boolean(request.headers.get('oai-authenticated-user-id'));
}
export async function tokenAllowed(request: Request) {
  const token = runtime().TRADEFLY_BRIDGE_TOKEN;
  if (!token || token.length < 32) return false;
  const supplied = request.headers.get('authorization') ?? '';
  const expected = 'Bearer ' + token;
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function state() {
  return database().prepare('SELECT * FROM backend_state WHERE id = 1').first<{
    snapshot: string | null;
    received_at: string | null;
    command: string;
    command_id: string;
    command_at: string | null;
    command_payload: string | null;
  }>();
}
