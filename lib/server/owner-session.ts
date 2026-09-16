import { SignJWT, jwtVerify } from 'jose';
export const SESSION_COOKIE = 'tradefly_owner';
export const SESSION_SECONDS = 8 * 60 * 60;
export function ownerKey() {
  const key = process.env.TRADEFLY_OWNER_KEY;
  return key && key.length >= 32 ? key : null;
}
export async function equalSecret(a: string, b: string) {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export async function createSession(key: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('owner')
    .setAudience('tradefly-desktop')
    .setIssuer('tradefly')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(new TextEncoder().encode(key));
}
export async function verifySession(request: Request, key: string | null) {
  if (!key) return false;
  const tokens = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(SESSION_COOKIE + '='));
  if (tokens.length !== 1) return false;
  try {
    const { payload } = await jwtVerify(
      tokens[0].slice(SESSION_COOKIE.length + 1),
      new TextEncoder().encode(key),
      {
        algorithms: ['HS256'],
        audience: 'tradefly-desktop',
        issuer: 'tradefly',
        maxTokenAge: `${SESSION_SECONDS}s`,
      },
    );
    return payload.sub === 'owner';
  } catch {
    return false;
  }
}
