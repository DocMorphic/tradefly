/** Receipt times must be valid, recent, and not implausibly in the future. */
export function isFresh(
  timestamp: string | null | undefined,
  now: number,
  maxAge = 45000,
): boolean {
  const received = Date.parse(timestamp || '');
  return (
    Number.isFinite(now) &&
    now > 0 &&
    Number.isFinite(received) &&
    received <= now + 5000 &&
    now - received <= maxAge
  );
}
