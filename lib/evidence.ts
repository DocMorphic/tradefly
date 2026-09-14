import type { BackendSnapshot, PaperDecision, PaperOrder } from './backend';
export function traceDecision(s: BackendSnapshot, d: PaperDecision) {
  const orders = s.orders.filter((o) => o.decision_id === d.id);
  const ids = new Set(orders.map((o) => o.client_id));
  const events = s.events
    .filter((e) => {
      const data = e.data as Record<string, unknown> | null;
      return (
        data &&
        (data.decision_id === d.id ||
          ids.has(String(data.client_order_id ?? data.client_id ?? '')))
      );
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const veto = events.find((e) => e.kind === 'execution_blocked');
  return {
    orders,
    events,
    execution: orders.length
      ? orders.map((o) => o.status).join(', ')
      : veto
        ? String((veto.data as Record<string, unknown>).reason)
        : d.action === 'HOLD'
          ? 'No order: neural HOLD'
          : 'No linked order or execution result in this snapshot',
  };
}
export function orderFill(o: PaperOrder) {
  const qty = Number(o.broker?.filled_qty),
    price = Number(o.broker?.filled_avg_price);
  return qty > 0 && price > 0 && Number.isFinite(qty * price)
    ? { qty, price, value: qty * price }
    : null;
}
export function stockRecords(s: BackendSnapshot, symbol: string) {
  return {
    decisions: s.decisions.filter((d) => (d.symbol || s.symbol) === symbol),
    orders: s.orders.filter((o) => o.payload.symbol === symbol),
    position: s.positions.find((p) => p.symbol === symbol),
    visit: s.universe?.recent.find((r) => r.symbol === symbol),
    status: s.universe?.statuses[symbol] || 'unseen',
  };
}
