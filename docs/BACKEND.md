# Paper backend

Implemented 2026-09-14. The local Python worker connects real Alpaca paper account state, completed IEX bars, a full v783 Brian2 simulation, a fixed decoder, SQLite order reconciliation, and the private hosted desktop. The demo remains a separate mode.

## Run

```sh
uv sync --python 3.12
python3 scripts/configure-alpaca.py   # only if .env does not exist
uv run python -m tradefly.runner --once
uv run python -m tradefly.runner --load-brain
```

The worker starts **paused** on every launch. After it reports a loaded, validated brain and a connected account, use Paper → Resume in the hosted desktop. Resume skips old bars and waits for a newly completed regular-session bar. The worker needs the Mac awake and the process running. No always-on server or automatic startup has been provisioned.

Paper execution is hardwired to `https://paper-api.alpaca.markets`. Market data is hardwired to `https://data.alpaca.markets`, with `feed=iex`, `adjustment=raw`, `timeframe=5Min`. Redirects are rejected. Credentials use Alpaca's documented headers and are never included in logs, reports, or browser bundles. There is no live endpoint setting.

Local `.env`: `ALPACA_PAPER_API_KEY`, `ALPACA_PAPER_SECRET_KEY`. Local `.env.bridge`: the scoped application bridge token and the separately authorized Sites identity-less API token. Both files are ignored and permissioned `0600`. The application bridge token is also configured as a hosted secret. Alpaca credentials are not uploaded to Sites.

## Architecture

- Local SQLite (`runs/tradefly.sqlite3`, WAL + synchronous FULL): immutable decision records, prepared orders, broker updates, account observations, events, account binding, recovery markers. Only one worker can acquire the OS file lock.
- Brian2 local process: full graph, bounded count monitor, explicit input RNG, checkpointed voltages, conductances, refractory state, delayed events and input RNG. See BRAIN.md.
- Hosted D1: latest telemetry snapshot, receipt timestamp, desired pause/resume command and unique command ID (legacy watchlist commands are rejected in full-market mode). Drizzle migrations own this schema.
- Worker sends a snapshot about every 10–15 seconds via authenticated POST `/api/bridge` and receives the current command. It rechecks this connection immediately before a submission.
- Desktop polls `/api/backend` every five seconds. Its server requires the platform's authenticated user identity; mutations additionally require a same-origin request. The existing Site audience remains owner-only. Machine tokens cannot impersonate a browser identity to issue controls.
- Optional read-only loopback API: `uv run uvicorn tradefly.api:app --host 127.0.0.1 --port 8000`. The hosted desktop uses the authenticated bridge, so this API is not required.

## Full market and activity log

`MarketEngine` discovers all active, tradable Alpaca US equities daily and on Resume. No sector, price, liquidity or profitability shortlist is applied. It includes ETFs and whole-share-only assets. `config/watchlist.json` and the older `Engine` remain historical pilot fixtures and do not control production.

A stable symbol hash determines the sensory tour. The same fly's evolving state processes each symbol. BUY/SELL intent is exclusively decoded from neural activity for the presented symbol; HOLD advances the tour. This is not a biological attention model or evidence of free will. The complete universe, its digest, cursor, last coverage per symbol, and context ID are recorded. The desktop exposes searchable membership and recent data gaps; detailed history remains local.

The Fly log renders measured decisions and recorded order/system events as plain language. Source records remain expandable and exportable. It does not use an LLM or claim to reveal a fly's inner thoughts. Separate historical checks cannot submit broker orders.

## Execution behavior

The worker scans continuously, with a one-second scheduling interval between ticks while active. It batches 16 symbols per paginated historical-data request and caches only the current batch for the current five-minute boundary. This batch size bounds requests, not the available universe. Account state refreshes at least every 15 seconds and before every directional submission; desktop controls refresh about every ten seconds and before submission. An unresolved order prevents further neural evaluation. Actual processing rate also includes neural simulation and durable checkpoint I/O.

A symbol requires a current completed regular-session IEX bar and 20 prior completed bars. Missing inputs are marked as data gaps and skipped, not treated as HOLD. Decisions are unique by symbol plus bar timestamp. The migration preserves older records. Each neural step is committed with a checkpoint before any order request; interruption fails closed. After evaluation, orders are rejected if a newer completed bar is available or the market closes. Resume skips old inputs.

The decoder only receives measured BUY and SELL firing rates. Neither prices nor P&L enter it. The default is HOLD unless the higher pool reaches 20 Hz with at least an 8 Hz lead. There is no LLM or external strategy in the decision path.

Sizing uses cash, not margin buying power. BUY requests at most $100 notional and available 10% total portfolio entry exposure room. SELL requests at most $100 worth of shares at the reference price, clipped to actual holdings. Whole-share-only assets round quantity down to an integer; a share that exceeds the remaining budget produces an explicit execution veto. Market execution can drift from the sizing price: the percentage is an entry-sizing constraint, not a continuous portfolio guarantee. There is no automatic liquidation, leverage, shorting, stop-loss strategy, or price-driven fallback. One order must resolve before another is submitted.

An intent-derived `client_order_id` is committed before the POST. On a timeout or ambiguous failure, the worker queries by that same ID and never blindly repeats the POST. Partial fills remain unresolved. A missing order after an ambiguous request leaves execution paused for reconciliation. Unknown broker statuses remain unresolved. Pause requests cancellation only for Tradefly orders; it does not sell holdings or cancel unrelated orders. A fill can race with cancellation; subsequent reconciliation records it.

A dedicated account is required: any unrelated position, unrelated open order, shorts, or mismatch between actual holdings and cumulative Tradefly fills blocks Resume. The ledger binds to a hash of the paper account ID. Switching/resetting accounts requires a separate ledger, not silently reusing history. Equity changes may still include deposits or manual activity, so they are labeled account changes rather than pure strategy alpha.

## Recovery and exports

Neural steps set a durable in-flight marker before running. Checkpoint replacement and decision persistence complete before any submission. A crash during that sequence fails closed on restart: preserve the database/checkpoint and inspect the recorded state before creating a new experiment. Do not clear recovery markers without resolving which neural step completed. Checkpoints are trusted local artifacts; never load one downloaded from someone else (Brian serialization uses pickle).

The desktop receives the latest 100 decisions/orders, 50 events, and 500 equity observations, with counts and an explicit truncation note. The local ledger retains the full history. To export a full report, stop the worker, then run:

```sh
uv run python -m tradefly.runner --export runs/full-report.json
```

Synthetic demo reports, local historical fills, and actual Alpaca paper orders are separate. Actual broker fees and quote-relative slippage are displayed as unmeasured, not invented. Local historical replay assumes 2 bps slippage and 1 bp fees and fills intents only on the following bar's open.

## Validation commands

```sh
uv run pytest -q
uv run python scripts/prepare-brain.py
uv run python scripts/check-brain-checkpoint.py
uv run python scripts/check-brain-restart.py
uv run python scripts/benchmark-brain.py
uv run python scripts/replay-market.py --date 2026-09-11 --bars 6
uv run python scripts/check-market.py
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Response/ablation and checkpoint validation must match the current hashes of the dataset manifest, brain adapter, and encoder/decoder source. Calibration and held-out profitability research, quote-relative slippage, corporate-action-aware multi-day backtests, matched real-data control runs, and multi-seed statistical evaluation remain future work. The six-bar replay is a connectivity/integration pilot only.

References: [Alpaca paper environment](https://docs.alpaca.markets/us/docs/paper-trading), [orders](https://docs.alpaca.markets/us/docs/working-with-orders), [historical bars](https://docs.alpaca.markets/us/reference/stockbars).
