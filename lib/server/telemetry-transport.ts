const MAX_BYTES = 900000;
export async function telemetryBody(request: Request): Promise<string> {
  const type = request.headers.get('content-type')?.split(';')[0];
  if (type !== 'application/vnd.tradefly.telemetry+gzip') {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BYTES)
      throw new Error('too_large');
    return text;
  }
  const compressed = new Uint8Array(await request.arrayBuffer());
  if (compressed.byteLength > MAX_BYTES) throw new Error('too_large');
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error('too_large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
// Recursive object changes with explicit deletion: null remains an actual value.
export function applyTelemetryDelta(
  previous: Record<string, unknown>,
  patch: unknown,
): Record<string, unknown> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new Error('invalid_patch');
  const { set, remove, children } = patch as Record<string, unknown>;
  if (
    !set ||
    typeof set !== 'object' ||
    Array.isArray(set) ||
    !Array.isArray(remove) ||
    !children ||
    typeof children !== 'object' ||
    Array.isArray(children)
  )
    throw new Error('invalid_patch');
  const result = { ...previous };
  const valid = (key: string) =>
    !['__proto__', 'constructor', 'prototype'].includes(key);
  for (const key of remove) {
    if (typeof key !== 'string' || !valid(key)) throw new Error('invalid_key');
    delete result[key];
  }
  for (const [key, value] of Object.entries(set)) {
    if (!valid(key)) throw new Error('invalid_key');
    result[key] = value;
  }
  for (const [key, value] of Object.entries(children)) {
    if (
      !valid(key) ||
      !result[key] ||
      typeof result[key] !== 'object' ||
      Array.isArray(result[key])
    )
      throw new Error('invalid_child');
    result[key] = applyTelemetryDelta(
      result[key] as Record<string, unknown>,
      value,
    );
  }
  return result;
}
