# Indigo Grain desktop

Implemented 2026-09-14. A browser desktop, following the windowed interaction model of the user's portfolio and Rolodex projects. It is not a native macOS application.

## Visual direction

Indigo-only chrome and charts, pale indigo paper surfaces, fine procedural grain, thin rules, serif display headings, and monospaced controls. No alternate themes. The palette is an interpretation of Indigo Grain rather than a claim that the name identifies a single standardized design system.

References inspected: portfolio desktop/wallpaper/theme source; Rolodex desktop, windows, and controls; the [Hermes site](https://hermes-agent.nousresearch.com/) for saturated monochrome color, grain, narrow typography, sharp edges, and framed interfaces; [Indigo Grain reference](https://kidspattern.com/theme/indigo-grain/swatch/1/) for deep blue-violet texture. No images or proprietary source were copied from Hermes.

## Applications

- Observation desk: calculated paper equity, return, drawdown, trade counts, chart, latest output rates, and recent decisions.
- Decision inspector: navigate observations, see BUY/SELL pool activity, threshold and margin checks, and whether the resulting intent filled or was blocked.
- Trade ledger: filter buy/sell/hold decisions, inspect each decision, and export executed fills to CSV.
- Performance lab: realized/unrealized P&L, fees, drawdown, win rate on sell fills, turnover, exposure, profit factor, and comparison portfolios. Export a JSON report.
- Field guide: methodology, connection status, limitations, and next steps.

Windows open, focus, drag, resize, maximize, minimize, close, and restore from the taskbar. Small screens use full workspace windows. The global session controller can play/pause, scrub, or restart the synthetic day. There is no actual trading pause action because no broker is connected. State is ephemeral and resets on reload.

## Data provenance and semantics

`lib/experiment.ts` generates a deterministic 78-bar synthetic session. Both market observations and output-pool rates are fabricated fixtures for interface development. Rates are NOT computed from market observations by a connectome. The network drawing is a schematic, not anatomical data or a live neuron raster. All relevant windows and exported artifacts identify the synthetic source.

The demo decoder uses two constants: minimum output activity of 20 Hz and a lead of at least 8 Hz over the other pool. These are UI example parameters, not validated biological parameters. No learned external policy is involved, but no brain is running either.

A directional decision at index t can fill only at index t+1. Fills use the next synthetic price with 2 basis points of adverse slippage and a 1 basis point fee. Orders use at most $100 notional and a 10% entry exposure cap, and cannot sell shares that are not held. Market drift can change exposure between entries. Blocked and held intents remain in the journal. The final bar's non-hold intent is pending and contributes no fill until a later bar exists.

Cash and shares determine equity. Average cost, including entry fees, determines realized P&L on sell fills. Unrealized P&L is the remaining position's marked value minus its cost basis. Return is based on $10,000 initial cash. Drawdown is the largest equity decline from a preceding equity peak in the replay prefix. Win rate counts profitable sell fills, including partial position reductions; it is not a count of fully closed position cycles. Profit factor is undefined when gross realized losses are zero.

The ten-percent buy-and-hold curve is a **gross** price reference initialized with $1,000 exposure. The deterministic random control uses the same order limits and modeled execution costs as the main fixture but not the same trade counts or exposure. These are not a rigorous matched-connectome experiment. The shuffled-connectome result and brain compute timing correctly remain unmeasured.

## Connecting the actual engine later

Replace the fixture at a single typed boundary, keeping observations, stimulus manifest, brain dataset revision, output summary, decoder parameters, intent, and fill events distinct. Every record must carry a source (`synthetic-demo`, `historical-connectome`, or `paper-connectome`), experiment ID, timestamp, and parameter hash. Genuine neural observations should reference selected real neuron IDs and checkpoint IDs. Do not infer causality from a correlation or generate an LLM explanation of intention.

Keep Python/Brian2 outside the hosted web process; the current Sites runtime has a 128 MB memory ceiling and cannot host the full reference brain. The future desktop should consume aggregated telemetry over an authenticated HTTP service, with credentials kept server-side. Persist real events in the engine ledger; reconnecting the UI must not restart the brain or resubmit orders. A missing backend must show disconnected state, never silently substitute this fixture as live data.

## Validation

- Unit checks cover silence/ties/invalid rates, next-bar execution, cash/share conservation, average-cost P&L reconciliation, blocked sells, no future fills in prefix exports, deterministic controls, and drawdown calculations.
- Type checking and a production build are required.
- The generated component catalog contains existing lint failures. The lint configuration excludes that unchanged vendor catalog and its generated mobile hook; application code, shared accounting, and tests are checked.
- Structured browser tool contracts expose a read-only demo report and a demo decision navigation action. Both were verified in a supported WebMCP context, including invalid input and unchanged-state checks after failure.
- Broad browser interaction and visual QA have not been run. The user requested reference exploration, not browser testing of the finished product.
