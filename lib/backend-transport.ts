// Chunk versions are transfer hints only. Authentication and command checks stay server-side.
export type Chunks = Record<string, unknown>;
export type Versions = Record<string, string>;
export function snapshotChunks(snapshot: Record<string, unknown>): Chunks {
  const chunks: Chunks = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) continue;
    if (
      key === 'universe' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      for (const [field, part] of Object.entries(value)) {
        if (/^[a-z][a-z0-9_]*$/.test(field)) chunks[`universe/${field}`] = part;
      }
    } else chunks[key] = value;
  }
  return chunks;
}
export function assembleSnapshot(chunks: Chunks): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(chunks)) {
    if (/^[a-z][a-z0-9_]*$/.test(key)) snapshot[key] = value;
    else if (/^universe\/[a-z][a-z0-9_]*$/.test(key)) {
      const universe = (snapshot.universe ??= {}) as Record<string, unknown>;
      universe[key.slice(9)] = value;
    }
  }
  return snapshot;
}
export async function chunkDelta(chunks: Chunks, known: Versions) {
  const entries = await Promise.all(
    Object.entries(chunks).map(async ([key, value]) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return [
        key,
        Array.from(hash.slice(0, 12), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join(''),
      ] as const;
    }),
  );
  const versions = Object.fromEntries(entries);
  const changes = Object.fromEntries(
    Object.entries(chunks).filter(([key]) => known[key] !== versions[key]),
  );
  const removed = Object.keys(known).filter((key) => !(key in versions));
  return { changes, removed, versions };
}
export function parseVersions(raw: string | null): Versions {
  if (!raw || raw.length > 8000) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    if (Object.keys(value).length > 100) return {};
    const result: Versions = {};
    for (const [key, hash] of Object.entries(value)) {
      if (
        /^(?:universe\/)?[a-z][a-z0-9_]*$/.test(key) &&
        typeof hash === 'string' &&
        /^[0-9a-f]{24}$/.test(hash)
      )
        result[key] = hash;
    }
    return result;
  } catch {
    return {};
  }
}
