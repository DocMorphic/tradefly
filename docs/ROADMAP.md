# Build milestones

## 0 — Project setup

- [x] Create local planning repository and documented defaults.
- [ ] Confirm private GitHub remote and initial push.
- [ ] Implement runtime components. None exist yet.

## 1 — Demonstrate the brain works

Pin research code/data; verify provenance; create compatible Python environment; reproduce a documented neural response; measure full-network memory and runtime; add bounded spike monitoring.

Done when a saved, reproducible report names the dataset, verifies neuron IDs and responses, and establishes whether this machine can meet the chosen bar cadence. If full-network execution fails the memory/time budget, record the failure before choosing a different implementation, machine, or explicitly labeled subset.

## 2 — Connect market observations to neural decisions

Define typed contracts, select input/output populations, implement causal encoding and neural-only decoding, preserve/checkpoint state, and drive the system with synthetic market observations.

Done when every intent traces to measured neural activity, identical checkpoints/seeds replay within declared numerical tolerances, and silencing relevant output activity prevents directional intents. Verify there is no direct feature-to-action bypass.

## 3 — Run historical paper experiments

Acquire permitted historical data, implement next-bar fills and ledger accounting, freeze the experiment, and run held-out periods with cash, buy-and-hold, random, and connectome controls.

Done when the report includes costs, drawdowns, multiple seeds, exposure, activity diagnostics, and known data limitations. Tests must catch future-data leakage, duplicate bars, corporate-action inconsistencies, and invalid fills. Profitability is not a completion requirement.

## 4 — Run against current data with paper money

Configure a dedicated Alpaca paper account, reconcile broker state, implement durable order IDs and reconnect handling, and run the same fixed experiment on completed regular-session bars.

Done when all submissions are paper-only, restarts do not duplicate orders, partial fills and timeouts reconcile correctly, and stale data or missing brain output cannot generate trades. Begin with a supervised session to verify the full event chain.

## 5 — Make it watchable

Build the local dashboard: neural activity, BUY/SELL pool rates, current observation, paper holdings, P&L, controls, replay speed, and a trace for each decision.

Done when a user can watch the network affect trades, compare matched controls, pause submissions, and export an experiment report. Match dashboard activity to real recorded telemetry.

## Later experiments

An explicit male-CNS port, multi-stock sensory design, and biologically motivated plasticity can each become separate versioned experiments. They are not required for the first result. There is no planned transition to real-money trading.
