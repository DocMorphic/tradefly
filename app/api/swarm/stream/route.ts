import { GET as state } from '../route';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const r = await state(request);
  if (!r.ok) return r;
  const body = await r.text();
  return new Response(`retry: 2000\ndata: ${body}\n\n`, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}
