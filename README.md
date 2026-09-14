# tradefly

A paper-trading experiment in which a simulated fruit fly connectome is the sole source of directional trading decisions.

**Status: real paper backend implemented and connected; starts paused.** The desktop has separate Paper and Demo modes. The Paper mode receives the real Alpaca account, measured full-network neural decisions, order outcomes, and audit records from a local Python worker. See [backend setup and operation](docs/BACKEND.md), [brain implementation](docs/BRAIN.md), and [validation evidence](docs/VALIDATION.md).

Run the worker with `uv sync --python 3.12`, then `npm run backend`. Keep the Mac awake. Use Paper → Resume in the private desktop after readiness checks pass. No live-money endpoint exists.

## Run the desktop

Use Node 22.18+ (24+ recommended for the test runner). Run `npm ci`, then `npm run dev`. `npm test` checks decision thresholds, accounting, execution timing, and metrics. `npm run build` produces the hosted application. See [desktop architecture and data semantics](docs/DESKTOP.md).

The question: can a fixed biological network, given numerical market inputs through a transparent interface, produce interesting trading behavior?

```mermaid
flowchart LR
    A[Completed market bars] --> B[Fixed sensory encoder]
    B --> C[Fly connectome simulation]
    C --> D[Fixed neural action decoder]
    D --> E[Paper execution constraints]
    E --> F[Local paper ledger or Alpaca paper]
    F --> G[Position and cash observations]
    G --> B
    C --> H[Activity and experiment dashboard]
    F --> H
```

“Only the brain” means the fly network supplies every buy/sell/hold intent. Human-designed encoding and decoding are necessary and are part of the experiment. They will be fixed, published, and audited; no market signal can bypass the network to choose an action. Execution constraints may reject or reduce an order but cannot invent or reverse a trade.

The first version uses fixed neural weights. It does not learn from profits, understand stocks, or establish a recreation of a living fly. We are testing behavior, not assuming a profitable strategy.

## Proposed defaults

- FlyWire female v783 data, with the Shiu et al. Brian2 model as the reference implementation. This is distinct from the newer male CNS dataset; using the male map is a later explicit migration.
- One stock, AAPL, for the first experiment; this is a test fixture, not an investment recommendation.
- Completed five-minute bars during regular US market sessions.
- $10,000 simulated starting cash; long-only; fixed $100 maximum order notional and 10% maximum position exposure; no borrowing, leverage, or shorting.
- Historical replay before real-time paper orders. Alpaca paper-only integration is the proposed second stage.
- Local Python service; SQLite event ledger and Parquet input data. The browser desktop is implemented first, using synthetic data, at the user’s request.

The real account balance comes from Alpaca rather than the demo bankroll. Execution enforces cash-only entry sizing and checks actual holdings; market fills may drift from the sizing reference price. The demo remains a separate synthetic ledger. See [the technical plan](docs/PLAN.md), [milestones](docs/ROADMAP.md), [user setup](docs/USER_SETUP.md), and [sources](docs/SOURCES.md).

## Files

| Path | Purpose |
| --- | --- |
| `docs/PLAN.md` | Architecture, neural interfaces, scientific controls, execution behavior |
| `docs/ROADMAP.md` | Build order and completion criteria |
| `docs/USER_SETUP.md` | Account setup and optional preferences |
| `docs/SOURCES.md` | Research and API references |
| `config/experiment.example.toml` | Original planning settings; runtime uses frozen Python/manifest parameters |
| `.env.example` | Local paper credential names |

Large datasets, credentials, downloaded third-party code, and experiment output stay outside Git. Any reused code must retain its upstream license, and data licenses and attribution must be recorded independently.
