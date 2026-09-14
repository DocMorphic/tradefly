# Pre-resume check — 2026-09-14

The live experiment remains paused. No real Alpaca orders were placed as part of this check.

## Bug found and corrected

The live loop previously applied a 90-second age limit to the latest available bar before checking whether that bar had already been processed. Normal polling two to four minutes after a bar closed could therefore pause a healthy feed. At market opening, the prior day's last bar could trigger the same failure.

The loop now determines which completed regular-session bar should exist at the current boundary. It waits for the first bar after opening, ignores normal repeated polls, allows a bounded delivery grace period for a newly expected bar, and pauses only for a missing or too-late new decision bar. A replay backlog is still skipped on Resume.

## Checks passed

- 25 Python backend tests: existing broker/accounting/recovery tests plus production-loop BUY → filled → SELL → filled → HOLD, repeated polls, opening/closing behavior, genuinely missing data, delayed signals, backlog skipping, mid-step pause, brain failure, command deduplication, expired Resume commands, and control-connection failure.
- 8 desktop accounting tests passed.
- Production build passed.
- Actual paper endpoint: account ACTIVE, $100,000 cash, zero holdings and zero open orders.
- AAPL verified tradable and fractionable in the paper account.
- Existing full-graph response, internal-edge ablation, same-process checkpoint and fresh-process checkpoint checks remain valid: the brain, encoder and manifest hashes are unchanged.

The directional tick-loop tests use controlled neural outputs and an isolated simulated broker to exercise BUY and SELL without injecting fake trades into the real experiment. Historical replay uses the real fly engine and real historical IEX bars with local simulated fills. Neither is a claim of observing a real Alpaca fill during market hours.

See VALIDATION.md and the private desktop's historical report for the full-day neural replay result. Live broker acceptance, asynchronous fill timing, and an actual regular-session run still need observation after Resume. Profitability is a separate, unproven research question.

## Full historical day

Real IEX bars for 2026-09-11: 78 bars through the measured full network. Actions: {'HOLD': 77, 'BUY': 1}. Local fills: 1. $10,000 local replay bankroll ended at $9999.57, including $0.01 modeled fees and 2 bps fill slippage. Net marked-to-market P&L: $-0.43; final open shares: 0.299727206. This is one day, not a profitability estimate.

Median neural compute: 2.44 s per 500 ms neural window; maximum 5.38 s. Production broker and network latency are additional.
