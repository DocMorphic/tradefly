# Validation evidence

Measured locally on 2026-09-14.

- Full graph: 138,639 neurons, 15,091,983 directed neuron-pair rows, 54,492,922 synapses.
- Brain / encoder / manifest hash: `3d264be68c47bd20bbe2bfcb152389e46f0d648ced474d816d38c3878f325e9f`.
- Silent-input spike count: 0.
- Sugar stimulus → BUY pool: 58.0 Hz.
- Mechanosensory stimulus → SELL pool: 35.0 Hz.
- All internal edges disabled → BUY / SELL: 0.0 / 0.0 Hz.
- Response / ablation benchmark peak RSS: 0.944 GiB; total 20.43 s.
- Checkpoint replay: exact whole-network spike counts. Fresh Python process: exact whole-network spike counts.
- Checkpoint size: 250,056,532 bytes; write 0.447 s; validation peak RSS 1.103 GiB.
- Actual Alpaca paper credentials: verified; dedicated account with no holdings; no orders submitted during setup.
- Real IEX pilot: 2026-09-11, 6 completed five-minute bars, actions HOLD, HOLD, HOLD, HOLD, HOLD, HOLD. Local simulated fills: 0. Local pilot P&L $0.00. This small pilot is not a profitability estimate.
- Fourteen backend tests cover paper-only hosts, rejected redirects, secret redaction, calendar early closes, causal encoding, sizing constraints, persistence-before-POST, restart deduplication, ambiguous submissions, partial fills, unrelated holdings, interrupted checkpoints, and next-bar replay fills.
- Eight existing desktop accounting tests pass. TypeScript and lint checks pass.

Neural response checks are a v783 engineering adaptation, not a statistical reproduction of the original v630 paper. No parameters were tuned against pilot profit. Broader held-out financial evaluation, matched controls and multiple seeds remain unperformed.

Raw neural reports stay locally in `data/brain/`. The actual-market pilot is under `runs/replays/` and available in the hosted Performance lab. The complete dataset remains local; only manifest and report summaries are shared with the private desktop.

## Expanded pre-resume validation

The follow-up ran all 78 bars from 2026-09-11 with the frozen real brain and IEX data: {'HOLD': 77, 'BUY': 1}, 1 local simulated fill(s), net marked-to-market P&L $-0.43 on a $10,000 replay bankroll. This is separate from the unchanged $100,000 Alpaca paper account. The backend suite now has 25 passing tests. See PRE_RESUME_CHECK.md for the live-loop timing correction and exact test limits.
