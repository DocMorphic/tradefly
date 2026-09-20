import type { BackendResponse } from './backend';

/** Shared explanation for the desktop and command endpoint. Worker rechecks on receipt. */
export function resumeBlocker(
  data: BackendResponse,
  now = Date.now(),
): string | null {
  const s = data.snapshot;
  const received = Date.parse(data.received_at || '');
  if (
    !s ||
    !Number.isFinite(received) ||
    now - received > 45000 ||
    received > now + 5000
  )
    return 'The Mac worker is offline or its readings are stale. Start the worker and wait for a fresh update.';
  if (!s.broker?.connected)
    return 'The worker cannot reach the Alpaca paper account. Check its connection before resuming.';
  if (!s.brain?.ready)
    return 'The fly brains are still loading or validation needs attention.';
  if (s.corporate_actions?.performance_verified === false) {
    const issue = s.corporate_actions.issues?.[0];
    if (
      issue?.status === 'quantity_mismatch' &&
      issue.expected_qty_before_rounding
    )
      return `${issue.symbol}: Alpaca reports ${issue.broker_qty} shares, but the split implies ${issue.expected_qty_before_rounding} before fractional-share handling. Broker correction and reconciliation are required before resuming. Owner login cannot clear this check.`;
    return (
      s.corporate_actions.message ||
      'Corporate-action verification requires reconciliation before resuming.'
    );
  }
  return s.blockers?.filter(Boolean).join('; ') || null;
}
