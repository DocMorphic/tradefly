[← Documentation](README.md) · [Desktop windows](DESKTOP.md)

# Watching the experiment

The production worker discovers every active, tradable US equity symbol returned by Alpaca. The inventory includes ETFs and symbols that require whole shares; the current count is shown in the desktop. There is no handpicked list or 24-symbol cap. This is the broker's US universe, not every exchange worldwide; crypto and options are outside this experiment.

Two independent persistent brains receive stocks from one coordinator in a stable hash order that does not use prices, returns, volume, sectors or profit rankings. For each presented stock, neural HOLD passes it over; neural BUY or SELL emits an intent for that symbol. This is acceptance of a presented opportunity, not comparison of all stocks at once or evidence of free will. The software supplies the viewing order and interprets the output pools.

Five minutes is the input bar resolution, not a pause between stocks. The worker advances continuously while the market is open, fetching groups of 16 symbols and assigning the next usable stock to an idle fly. Each stock/bar is evaluated at most once. It waits after completing a tour until newer bars exist. Throughput depends on real network simulation, checkpoint writes, account/order checks and data delivery; the full universe cannot be observed simultaneously. A stock without a current IEX bar and 20 prior completed bars is recorded as a data gap and revisited on a later tour. No synthetic prices or neural HOLDs replace missing data.

Regular-session bars only. The first decision follows the first completed five-minute bar after opening; Resume skips bars completed before Resume. Orders expire when a newer completed bar becomes available or the market closes. The unresolved-order gate freezes further evaluations until reconciliation. Readiness failures and connection errors pause execution.

## What drives a decision

1. Price change, high–low range, volume relative to the preceding 20 bars, cash fraction, and position fraction become six bounded sensory stimulation rates.
2. Those rates stimulate named, fixed groups in the full v783 fly network. The market-to-neuron mapping is artificial and documented.
3. The network runs for 500 ms of neural time. The final 250 ms supplies the output firing rates.
4. In Original mode, the higher BUY or SELL rate must reach 20 Hz and lead by at least 8 Hz. Otherwise the decision is HOLD. Hz means spikes per second per neuron, not confidence or probability of profit.
5. Execution can reject or reduce the intent, but cannot invent or reverse it. Orders use cash, allow no shorts, and require earlier orders to resolve. Intended size is capped at $100; new buys are limited by 10% total portfolio entry exposure. Actual market fill prices can move from the sizing reference.

## Learning

Original mode keeps the connectome weights and decoder fixed. Neural state evolves, but that alone is not learning. Training-only mode adds a separate associative memory driven by measured neural patterns and delayed market outcomes. The tested decoder is frozen before held-out evaluation and requires owner activation after its gates pass. See [Training Lab](LEARNING-LAB.md) for the complete distinction.

Corporate-action and account verification still apply. An unverified broker balance is not valid performance; affected records are excluded from learning, and new orders remain blocked pending reconciliation.

## What to watch

- **Market coverage:** Data & definitions lists the entire discovered universe with search and pagination. Distinguish not visited, missing data, and measured neural actions. An inventory count is not a coverage or performance claim.
- **Connection:** Paper mode, fresh last-received timestamp, loaded/validated brain, and no readiness blockers. “Offline” means the desktop is showing saved readings.
- **Fly log:** chronological bar inputs, measured neural rates, decoder explanations and actual broker status. Filter by phase or symbol, expand raw records, or export the displayed entries as JSONL. Historical replay and the full-market input check are separate sources; neither submits broker orders. This is a factual activity trace, not access to thoughts. The desktop has bounded recent history; the local SQLite ledger retains all records.
- **Decision inspector:** new completed bar timestamp, changing state ID, stimulus rates, BUY/SELL Hz, and the threshold explanation. A long HOLD streak can be a valid result; compare its firing rates before assuming the worker is stuck.
- **Order ledger:** an intent is not a fill. Check submitted/partially filled/filled/rejected/canceled states and the recorded reason when no order follows a directional intent.
- **Account:** actual holdings and cash should agree with fills. With $100,000 equity, a $100 intended order is only 0.1% of the account, so equity changes can look small.
- **Performance:** track equity change, observed drawdown (drop from a prior recorded peak), and open-position P&L. Separate actual Alpaca performance from locally simulated historical fills and synthetic Demo data. One profitable day does not establish a trading edge.

Pause stops new orders and requests cancellation of Tradefly orders. It does not sell existing holdings, and an order can fill while cancellation is in flight. Keep the Mac awake with the worker running.

See VALIDATION.md for tested behavior and limitations. Alpaca paper fills are a simulation and omit some live-market effects: https://docs.alpaca.markets/us/docs/paper-trading.
