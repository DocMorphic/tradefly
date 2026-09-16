import { sameOrigin } from '@/lib/server/request-origin';
import { platform, userAllowed } from '#tradefly-runtime';
import { json } from '@/lib/server/backend-store';
import {
  ownerKey,
  equalSecret,
  createSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from '@/lib/server/owner-session';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return json({
    authenticated: await userAllowed(request),
    platform,
    configured: platform === 'sites' || Boolean(ownerKey()),
  });
}
export async function POST(request: Request) {
  if (platform === 'sites') return json({ error: 'Use ChatGPT sign-in' }, 400);
  if (!sameOrigin(request)) return json({ error: 'Origin rejected' }, 403);
  const key = ownerKey();
  if (!key)
    return json(
      { error: 'Set TRADEFLY_OWNER_KEY in the deployment settings first.' },
      503,
    );
  const text = await request.text();
  if (text.length > 2048) return json({ error: 'Invalid access key' }, 400);
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (typeof input?.key !== 'string' || !(await equalSecret(input.key, key)))
    return json({ error: 'That access key is incorrect.' }, 401);
  const response = json({ ok: true });
  response.headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=${await createSession(key)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
  );
  return response;
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Origin rejected' }, 403);
  const response = json({ ok: true });
  response.headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
  );
  return response;
}
