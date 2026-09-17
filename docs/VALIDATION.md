# Validation evidence

[← Documentation](README.md) · [Current roadmap](ROADMAP.md)

> This is a chronological evidence log. Counts, portfolios and operating modes below belong to their dated checks, not necessarily the current installation.

## Latest software checks — September 17, 2026

At the corporate-action update, 91 backend tests and 51 desktop-logic tests passed, along with the production web build and isolated API/auth checks. Coverage includes delayed reward timing, held-out separation, training-only order blocking, full-timespan chart transport, corporate-action persistence and unverified-profit handling. The connected paper account's NCT split mismatch was detected, affected profit was withheld, and an owner Resume request was rejected pending reconciliation.

These checks establish implementation behavior. They do not establish profitability, a complete accounting audit, or biological fidelity. Full-network response and checkpoint reports remain separately documented below.

---


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

## Watchlist and Fly log validation

The backend suite now has 35 passing tests, including round-robin timing, no duplicate step between boundaries, per-symbol fill reconciliation, persisted cursor recovery, shared exposure limits and paused-only watchlist edits. Twelve desktop tests cover accounting and faithful activity-log rendering, including multi-stock records and simulated-fill labeling.

An isolated real-network check used one actual IEX bar for each of the 12 stocks on 2026-09-11, with preceding causal volume history and a fixed $100,000 cash input. All 12 chose HOLD; the first BUY pool measured 12 Hz and the remaining BUY/SELL readouts were zero. Zero broker orders were submitted. The report is available in Fly log → Watchlist input check and locally at `runs/watchlist-check.json`. This checks connectivity and shared-state processing, not portfolio performance or biological fidelity. The earlier one-stock replay does not establish performance for this changed universe.

## Full-market scan validation

The production universe now comes from Alpaca's complete active/tradable US equity inventory, not the older 12-stock fixture. Read-only discovery returned 13,450 symbols, including 7,649 fractionable assets. No sector, price or volume shortlist was applied.

The suite passes 43 backend and 13 desktop tests. Added checks cover uncapped universe membership, whole-share eligibility, independent symbol/bar uniqueness with legacy SQLite migration, one shared neural state across several stocks at one boundary, output-only directional acceptance, missing-data coverage, unresolved-order gating, refreshed batches at new boundaries, pagination and token-cycle rejection.

The real full-network smoke presented the first 64 symbols in the neutral tour using historical IEX inputs from 2026-09-11. Twenty-three had usable causal inputs and produced HOLD; 41 were recorded as data gaps. It took 114.88 seconds without production checkpoint serialization or broker writes. This is not a production throughput guarantee. Report: `runs/market-check.json`, also available in Fly log → Full-market input check. The complete universe was discovered, but only these 64 candidates were tested with data; this is not an all-symbol neural validation or profitability evaluation.

The network equations, weights, encoder and decoder were unchanged. This update expands access and scheduling, not learning, biological attention, consciousness or free will. Software still determines sensory presentation order and assigns trading meanings to output pools.

## Connected evidence and pilot controls

Twenty desktop tests pass, including exact decision/order joins, missing execution evidence, partial fills, data-gap distinction, next-open comparison fills, cost inclusion, final-intent non-execution, seeded controls and mismatched-report rejection. The new views never call pause/resume or order endpoints.

The archived 78-bar AAPL pilot from 2026-09-11 reconstructs exactly: recorded fly net P&L **-$0.4271345483**, cash **$0**, one-$100-entry buy-and-hold **+$0.0648845501**. Thirty random-action seeds have median **-$3.2496533088**, range **-$7.2597410312 to +$1.0863081508** on the same $10,000 initial bankroll. These are marked intraday outcomes under 2 bps modeled slippage and 1 bp modeled fees, not live fills or a held-out evaluation. Random action seeds do not replace multiple neural-seed experiments.
