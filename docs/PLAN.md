# Technical plan

Original planning document, 2026-09-14. The backend has since been implemented; current behavior, deviations, tested limits, and unfinished research are documented in BACKEND.md, BRAIN.md, and VALIDATION.md. The proposal below is retained as the original experiment design, not a description of current implementation status.

## 1. Experiment contract

The simulated connectome must be the sole source of directional trading intent. There will be no LLM, technical-indicator strategy, trained external policy, or fallback trader in the action path. Conventional strategies are permitted only as separately labeled evaluation baselines with separate ledgers.

The surrounding software necessarily makes modeling choices: what the fly receives, how long it runs, which neural populations we read, and what their activity means. These choices influence results. We will expose them rather than claim the fly naturally knows what a stock or a buy order is.

V1 has fixed weights, fixed encoders, and fixed decoders. Neural state can evolve across bars, but this is not synaptic learning. Neither profit nor a dopamine-like stimulus automatically creates learning in a fixed-weight model. Plasticity is a separate possible experiment requiring an explicit rule and evaluation protocol; it is not part of V1.

## 2. Brain data and engine

Start from the Shiu et al. research repository, which provides a Python/Brian2 implementation, neuron metadata, and connectivity files for FlyWire v783. The original paper used v630; v783 support in the repository does not mean every result has already been reproduced on that revision. This is the adult female brain, not the male brain-and-nerve-cord map from the recent announcement.

First pin the upstream commit and download only the needed files. Record checksums, dataset version, licenses, original neuron IDs, neurotransmitter assumptions, neuron count, edge count, and any omitted cells/connections. Distinguish neuron-pair edges from individual synapse counts. Do not silently threshold the graph or replace it with a random network.

Use Brian2 as the correctness reference. Audit the upstream model, including external activation behavior and its handling of refractory periods. Reproduce a documented stimulus-response experiment before market integration. The upstream trial runner creates fresh networks; Tradefly needs a persistent network with changeable inputs, reproducible random state, bounded monitoring, and checkpoints. That adaptation is implementation work, not a ready-made trading API.

Measured local machine: Apple A18 Pro, six logical CPUs, 8 GiB RAM. Full-network feasibility is unmeasured. Begin with one simulator process, avoid copying the connectivity per worker, and aggregate spikes into population counts. Record full spikes only in short diagnostic windows. Never allocate a dense neuron-by-neuron matrix.

Benchmark data loading, peak resident memory, checkpoint cost, and 100–1,000 ms of simulated neural time. Target under 4 GiB peak process RSS and comfortably less than a five-minute bar interval per decision. These are engineering targets, not measured performance claims. Try sparse representations or an optimized engine only after reference validation. If the complete graph will not fit, document the result and choose between larger compute or an explicitly labeled circuit subset; do not quietly call a subset the whole brain.

## 3. Market input and the fixed encoder

The current implementation extends the original one-stock pilot to an editable 1–24-symbol universe (12 by default). One shared brain evaluates one stock per five-minute bar in fixed round-robin order. Neural state carries across stocks, so both universe and ordering are recorded as experimental context. See WATCHING_TRADEFLY.md for current operation.

Ingest completed five-minute OHLCV bars with feed identity, exchange/session timestamps, arrival timestamps, and adjustment policy. Use the exchange calendar, not a hard-coded Berlin-to-New-York offset. Handle daylight-saving differences, holidays, missing bars, corrections, and duplicate deliveries.

Proposed sensory observations are one-bar price change, within-bar range, volume relative to its preceding window, and current position/cash fractions. Normalize causally using only preceding observations, clip to fixed bounds, and map positive/negative values into separate bounded stimulus-rate channels. No future bars, future-adjusted returns, or full-dataset normalizers may enter the observations. Exact windows and rate ranges will be frozen after non-financial calibration.

Select disjoint, annotated input populations from the actual dataset. Store their real neuron IDs and rationale in a versioned manifest. These populations must not overlap action readouts. Verify that their effects travel through internal connections rather than simply stimulating output cells directly. A stock return stimulating a fly sensory cell is an artificial interface, not evidence that the original fly sensed finance.

## 4. Neural time and the action decoder

Proposed starting protocol: one market bar corresponds to 500 ms of simulated neural time, with a fixed readout window at the end. This compression is arbitrary and must be recorded. Preserve voltages, synaptic state, pending delays, and RNG state between bars. Freeze neural time while the market is closed in V1. Do not reset the brain each day unless a separately labeled experiment calls for it.

Select anatomically documented output populations that are reachable from the chosen inputs. Freeze two disjoint action pools: BUY and SELL. HOLD is the default when neither clears a fixed minimum activity and margin, or when their scores tie. Compare population-normalized firing rates so pool size alone cannot choose the action. Thresholds and population choices may be calibrated for stable, responsive neural activity using synthetic stimuli; do not optimize them against financial returns.

The mapping from these populations to BUY/SELL is human-assigned. No native stock-trading neurons exist. Exact neuron IDs, thresholds, rate limits, and paths remain unresolved until the dataset and reference responses have been inspected. Do not fabricate them in a planning document.

The decoder receives neural summary data only, not prices, indicators, or P&L. It emits an immutable intent containing action, selected population rates, brain-state identifier, experiment hash, and input-bar ID. It cannot submit orders itself. Silence, invalid output, or a timed-out simulation results in HOLD, never a random or heuristic substitute.

## 5. Paper execution

Implement a local paper ledger first, then an Alpaca paper adapter. Initial experimental constraints: $10,000 paper cash, at most $100 per intent, at most 10% equity in the selected stock, no shorts, no leverage, and one unresolved order at a time. BUY adds a fixed notional; SELL reduces by a fixed notional up to the existing holding. HOLD places no order. Sizing is accounting, not a price-dependent trading policy.

Every desired trade and every rejected/reduced trade is logged separately. Constraints may veto or clip; they may not change BUY into SELL or create a trade on their own. No stop-loss strategy is hidden in the executor. A pause stops new submissions and cancels outstanding orders where possible; it does not automatically liquidate positions.

The broker adapter must allowlist `https://paper-api.alpaca.markets` and verify paper configuration at startup. No live-trading adapter or switch is planned. Use dedicated paper credentials stored locally outside Git.

Persist a client order ID derived from experiment, symbol, and bar before submission. Reconcile broker orders and fills after restarts and ambiguous timeouts before retrying. Track partial fills, rejection, cancellation, cash reservations, and actual broker positions. On stale data, disconnects, corrupt state, or ledger disagreement, stop new submissions and record why. Never trade a replay backlog as though it were current data.

Historical decisions made after bar t cannot fill at the already-known close of bar t. Use the next available bar's open plus an explicit configurable slippage/cost model. Process splits and dividends consistently across price data, holdings, and equity. Record the single-symbol survivor-selection limitation. Alpaca paper results and the local fill simulation remain separate experiments: their prices and fill assumptions will differ.

## 6. Evaluation that can test the premise

Before viewing held-out results, freeze the connectome revision, input/output manifests, numerical parameters, normalizer rules, timing, random seeds, and execution constraints. Keep chronological calibration and held-out periods separate; any later retuning starts a new experiment.

Run these baselines under matched market windows, cash, sizing limits, and cost assumptions:

- Cash and buy-and-hold, with both full-capital and exposure-matched buy-and-hold clearly labeled.
- Seeded random actions with matched action frequency and comparable exposure.
- Degree/sign-preserving shuffled connectivity controls, documenting exactly what is preserved.
- An internal-edge-disabled or output-silenced fly control, with the encoder and decoder unchanged.

Report net return, equity curve, maximum drawdown, gross/net exposure, turnover, fees/slippage assumptions, action counts, neural silence/saturation, rejected intents, and results across multiple seeds. A single lucky run is not evidence of an edge. A major early success is reproducible neural influence over decisions, even if the resulting strategy loses paper money.

Distinguish intrinsic Poisson-input stochasticity from an independent random decision policy. The first belongs to the neuronal simulation; the latter belongs only in a labeled control.

## 7. Proposed stack and interfaces

- Python 3.11 or 3.12 in a project-local `uv` environment; choose after checking Brian2 compatibility. The system currently exposes Python 3.14, so do not assume it will run the research environment unchanged.
- Brian2 reference engine, NumPy/SciPy sparse arrays as needed, pandas/PyArrow for source data and Parquet.
- SQLite for transactional experiment, intent, order, and fill events; large market arrays and checkpoints on disk.
- Alpaca's official Python SDK or a narrow HTTP adapter; choose at implementation after checking current API behavior.
- A local FastAPI service and lightweight browser dashboard after the core works. Dashboard controls can pause and inspect; it does not supply trades to the fly experiment.
- pytest for numerical parity, causal data handling, replay determinism, and broker lifecycle checks.

Proposed module boundaries:

```text
src/tradefly/
  data/        # download, checksums, neuron IDs, market bars
  brain/       # simulator, manifests, checkpointing
  encoding/    # observations -> stimulus rates
  decoding/    # spike summaries -> directional intent
  execution/   # paper constraints, local ledger, Alpaca adapter
  experiments/ # chronological replay and controls
  storage/     # transactional events and artifacts
  api/         # read-only telemetry plus pause/resume
```

Public contracts to define before implementation: `MarketObservation`, `StimulusFrame`, `NeuralSummary`, `TradeIntent`, `OrderEvent`, and `ExperimentManifest`. The audit chain is bar → stimulus → neural state/rates → intent → execution decision → broker order/fill. Dashboard summaries show that chain; they must not invent human-like explanations for the fly's actions.

## 8. Outstanding decisions

Technical research: exact input/output populations and IDs, feasible full-network runtime on 8 GiB RAM, current data license details, reference response reproduction, and calibration of neural time/rates. These are our work, not prerequisites the user needs to solve.

Optional user preferences: stock symbol, simulated bankroll, female reference dataset versus specifically the recent male CNS map, and local versus always-on hosting. The defaults permit offline work now. Only an Alpaca paper-only account and local credentials are needed before real-time paper integration. No paid service or remote compute is being provisioned as part of this setup.
