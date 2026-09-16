export function sameOrigin(request: Request) {
  const supplied = request.headers.get('origin');
  if (!supplied) return false;
  try {
    // Next.js can construct request.url with its internal listening hostname.
    // Host is the authority addressed by the browser; never trust forwarded-host.
    const expected = new URL(request.url);
    const host = request.headers.get('host');
    if (host) expected.host = host;
    return supplied === expected.origin;
  } catch {
    return false;
  }
}
