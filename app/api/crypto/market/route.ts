import { json } from '@/lib/server/backend-store';
import { cryptoMarket } from '@/lib/crypto/market';
import { CRYPTO_SYMBOLS, type CryptoSymbol } from '@/lib/crypto/receipts';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get('symbol') || 'BTC/USD';
  if (!CRYPTO_SYMBOLS.includes(symbol as CryptoSymbol))
    return json({ error: 'Choose BTC/USD or ETH/USD' }, 400);
  try {
    return json(await cryptoMarket(symbol as CryptoSymbol));
  } catch {
    return json(
      {
        error:
          'Crypto price feed is unavailable. No prices have been invented.',
      },
      503,
    );
  }
}
