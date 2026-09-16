import { json, userAllowed } from '@/lib/server/backend-store';
import { RobinhoodLive } from '@/lib/swarm/robinhood-live.mjs';
export const dynamic = 'force-dynamic';
const live = new RobinhoodLive();
export async function GET(request: Request) {
  if (!(await userAllowed(request)))
    return json({ error: 'Unauthorized' }, 401);
  const u = new URL(request.url),
    kind = u.searchParams.get('kind') || 'tokens',
    address = u.searchParams.get('address') || '',
    query = u.searchParams.get('q') || '';
  if (query.length > 100)
    return json({ error: 'Search is limited to 100 characters' }, 400);
  if (!['tokens', 'detail', 'holders'].includes(kind))
    return json({ error: 'Unknown market read' }, 400);
  if (kind !== 'tokens' && !/^0x[a-fA-F0-9]{40}$/.test(address))
    return json({ error: 'A complete 0x contract address is required' }, 400);
  try {
    if (kind === 'holders') return json(await live.holders(address));
    if (kind === 'detail') return json(await live.detail(address));
    return json(await live.search(query.replace(/^\$/, '')));
  } catch {
    return json(
      {
        error:
          'The external token source is unavailable or could not resolve this contract. No market data was fabricated.',
      },
      502,
    );
  }
}
