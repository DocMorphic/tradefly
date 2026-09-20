import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resumeBlocker } from '../lib/resume-readiness.ts';
import type { BackendResponse } from '../lib/backend.ts';

const now = Date.parse('2026-09-20T17:00:00Z');
test('reviewed isolation permits original/shadow resume but never learned orders or stale audits', () => {
  const corporate_actions = {
    performance_verified: false,
    execution_ready: true,
    isolation: {
      valid: true,
      excluded_symbols: ['NCT'],
      checked_at: new Date(now).toISOString(),
    },
  };
  assert.equal(
    resumeBlocker(
      state({ corporate_actions, learning: { mode: 'shadow' } }),
      now,
    ),
    null,
  );
  assert.match(
    resumeBlocker(
      state({ corporate_actions, learning: { mode: 'learned' } }),
      now,
    )!,
    /Learned orders/,
  );
  assert.match(
    resumeBlocker(state({ corporate_actions }), now + 31000)!,
    /fresh isolation audit/,
  );
  assert.equal(
    resumeBlocker(
      state({ corporate_actions, blockers: ['Account changed'] }),
      now,
    ),
    'Account changed',
  );
  corporate_actions.isolation.valid = false;
  assert.match(
    resumeBlocker(state({ corporate_actions }), now)!,
    /Isolation audit failed/,
  );
});
function state(extra = {}): BackendResponse {
  return {
    received_at: new Date(now).toISOString(),
    snapshot: {
      brain: { ready: true },
      broker: { connected: true },
      blockers: [],
      ...extra,
    },
  } as unknown as BackendResponse;
}
test('fresh ready worker permits resume; offline and invalid timestamps explain how to reconnect', () => {
  assert.equal(resumeBlocker(state(), now), null);
  for (const received_at of [
    undefined,
    'invalid',
    new Date(now - 46000).toISOString(),
    new Date(now + 6000).toISOString(),
  ])
    assert.match(
      resumeBlocker({ ...state(), received_at }, now)!,
      /worker is offline/,
    );
  assert.match(
    resumeBlocker(state({ brain: { ready: false } }), now)!,
    /brains/,
  );
  assert.match(
    resumeBlocker(state({ broker: { connected: false } }), now)!,
    /Alpaca/,
  );
});
test('corporate mismatch is explained even if other blocker list is empty', () => {
  const corporate_actions = {
    performance_verified: false,
    issues: [
      {
        symbol: 'NCT',
        status: 'quantity_mismatch',
        broker_qty: '299',
        expected_qty_before_rounding: '11.96',
      },
    ],
  };
  const reason = resumeBlocker(state({ corporate_actions }), now)!;
  assert.match(reason, /NCT: Alpaca reports 299 shares/);
  assert.match(reason, /11.96/);
  assert.match(reason, /reconciliation/);
});
test('unavailable corporate feed and worker blockers still block', () => {
  assert.match(
    resumeBlocker(
      state({ corporate_actions: { performance_verified: false } }),
      now,
    )!,
    /verification/,
  );
  assert.equal(
    resumeBlocker(
      state({ blockers: ['Interrupted checkpoint requires recovery'] }),
      now,
    ),
    'Interrupted checkpoint requires recovery',
  );
});
