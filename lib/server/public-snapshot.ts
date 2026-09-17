// Publish trading telemetry without broker account identity or credential fields.
const privateField =
  /^(?:account_id|account_number|email|name|username|api_key|secret_key|api_secret|secret|token|access_token|authorization|APCA-API-KEY-ID|APCA-API-SECRET-KEY)$/i;
const accountFields = new Set([
  'equity',
  'cash',
  'buying_power',
  'portfolio_value',
  'last_equity',
  'currency',
  'status',
  'long_market_value',
  'short_market_value',
  'initial_margin',
  'maintenance_margin',
  'daytrade_count',
  'pattern_day_trader',
  'trading_blocked',
  'account_blocked',
  'multiplier',
]);
export function publicSnapshot(value: unknown, account = false): unknown {
  if (Array.isArray(value)) return value.map((item) => publicSnapshot(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !privateField.test(key) && (!account || accountFields.has(key)),
      )
      .map(([key, item]) => [key, publicSnapshot(item, key === 'account')]),
  );
}
