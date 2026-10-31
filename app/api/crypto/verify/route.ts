import { json, runtime } from '@/lib/server/backend-store';
import { sameOrigin } from '@/lib/server/request-origin';
import { checkCommitment } from '@/lib/crypto/chain';
import { verifyManifest } from '@/lib/crypto/receipts';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Origin rejected' }, 403);
  let bundle;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'Manifest too large' }, 413);
    const body = JSON.parse(raw);
    bundle = {
      manifest: await verifyManifest(body.manifest, body.digest),
      digest: body.digest as string,
    };
  } catch {
    return json({ error: 'Receipt integrity check failed' }, 400);
  }
  try {
    return json({
      integrity: 'matched',
      ...(await checkCommitment(runtime(), bundle)),
    });
  } catch {
    return json({
      integrity: 'matched',
      status: 'unavailable',
      error:
        'The configured blockchain could not be checked. Local integrity alone is not a blockchain receipt.',
    });
  }
}
