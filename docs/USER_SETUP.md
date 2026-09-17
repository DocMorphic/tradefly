# Daily operation

[← Documentation](README.md) · [First-time installation](GETTING_STARTED.md)

For an already configured installation:

1. Keep the simulation host awake and start `npm run backend`.
2. Open the desktop configured in `.env.bridge` and sign in as owner.
3. Check the latest received timestamp, broker connection, loaded brains and readiness reasons.
4. While paused, select Original, Train without orders, or an eligible tested decoder.
5. Press Resume only when readiness checks pass. New decisions require fresh, usable regular-session inputs.

The default worker runs **two independent flies** with one paper-account coordinator. A five-minute bar describes input resolution; it is not a forced five-minute wait between stocks. The universe covers Alpaca's active tradable US equities, including ETFs, but IEX coverage determines which symbols have usable input bars.

**Pause stops new submissions and requests cancellation of Tradefly orders. It leaves holdings intact.** A fill can race with cancellation. Training-only mode also leaves holdings open and requires valid account inputs; it cannot bypass a reconciliation blocker.

| If you see… | Do this |
| :--- | :--- |
| Offline / stale readings | Check the worker, sleep state, origin and bridge key. |
| A long HOLD streak | Inspect neural rates and decoder evidence; HOLD is a valid decision. |
| No IEX data | Check coverage. Delayed SIP charts do not replace the trading feed. |
| Unverified performance | Read the corporate-action or position mismatch evidence. Do not treat the displayed broker value as proven profit. |
| Learned mode disabled | Inspect the Training Lab's evaluation gates and account readiness. |
| Recovery required | Preserve the ledger and checkpoints; follow [backend recovery](BACKEND.md#recovery-and-exports). |

The published site is read-only for visitors. Only the owner controls this installation. No additional paid service is required by the current architecture; provider free-tier limits still apply.
