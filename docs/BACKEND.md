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
- Hosted D1: latest telemetry snapshot, receipt timestamp, desired pause/resume/watchlist command, payload and unique command ID. Drizzle migrations own this schema.
- Worker sends a snapshot about every 15 seconds via authenticated POST `/api/bridge` and receives the current command. It rechecks this connection immediately before a submission.
- Desktop polls `/api/backend` every five seconds. Its server requires the platform's authenticated user identity; mutations additionally require a same-origin request. The existing Site audience remains owner-only. Machine tokens cannot impersonate a browser identity to issue controls.
- Optional read-only loopback API: `uv run uvicorn tradefly.api:app --host 127.0.0.1 --port 8000`. The hosted desktop uses the authenticated bridge, so this API is not required.

## Watchlist and activity log

The tracked `config/watchlist.json` initializes 12 stocks. The paused-only desktop watchlist editor validates 1–24 unique symbols locally and against Alpaca, then persists them in SQLite. Held stocks cannot be removed and unresolved orders prevent editing. One shared brain rotates deterministically, one stock per five-minute boundary; ordinary polls never advance the cursor. Per-symbol holdings reconcile against actual fills, and the exposure cap applies across all holdings. A changed watchlist starts at its first symbol but retains neural state; the event and each decision record expose that context.

The Fly log renders measured decisions and recorded order/system events as plain language. Source records remain expandable and exportable. It does not use an LLM or claim to reveal a fly's inner thoughts. The isolated watchlist check uses real historical inputs and the full brain with fixed cash input; it is not a portfolio backtest.

## Execution behavior

A new completed bar must be from a valid Alpaca exchange-calendar session (including early closes), aligned to five minutes, and no more than 90 seconds old. The live loop distinguishes normal time between bar boundaries from a missing newly expected bar, and waits through the first five minutes after opening. Twenty preceding bars supply causal normalization. The runner waits ten seconds after the end of a bar before treating it as available. Input corrections, missing bars, invalid account state, an unavailable control connection, or unresolved submissions stop new orders. After neural simulation, it refreshes the account and clock and expires decisions older than 150 seconds.

The decoder only receives measured BUY and SELL firing rates. Neither prices nor P&L enter it. The default is HOLD unless the higher pool reaches 20 Hz with at least an 8 Hz lead. There is no LLM or external strategy in the decision path.

Sizing uses cash, not margin buying power. BUY requests at most $100 notional and available 10% total portfolio entry exposure room. SELL requests at most $100 worth of shares at the reference price, clipped to actual holdings. Market execution can drift from the sizing price: the percentage is an entry-sizing constraint, not a continuous portfolio guarantee. There is no automatic liquidation, leverage, shorting, stop-loss strategy, or price-driven fallback. One order must resolve before another is submitted.

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
uv run python scripts/check-watchlist.py
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Response/ablation and checkpoint validation must match the current hashes of the dataset manifest, brain adapter, and encoder/decoder source. Calibration and held-out profitability research, quote-relative slippage, corporate-action-aware multi-day backtests, matched real-data control runs, and multi-seed statistical evaluation remain future work. The six-bar replay is a connectivity/integration pilot only.

References: [Alpaca paper environment](https://docs.alpaca.markets/us/docs/paper-trading), [orders](https://docs.alpaca.markets/us/docs/working-with-orders), [historical bars](https://docs.alpaca.markets/us/reference/stockbars).
