# Watching the experiment

The production configuration trades AAPL only, through Alpaca paper. A newly completed five-minute regular-session bar can trigger one neural decision. On a full US trading day, decisions can run after 09:35 through 15:55 New York time. The final 15:55–16:00 bar completes after regular trading closes, so the live worker does not place an order from it. Holidays and early closes follow Alpaca's exchange calendar. HOLD, execution constraints, pauses, or unavailable data reduce actual order frequency, potentially to zero.

The worker polls around every 15 seconds; that is a connection check, not a trade interval. It allows 10 seconds for a completed bar to arrive, and stops if a newly expected bar remains missing for more than 90 seconds. It does not confuse the ordinary wait between bar boundaries with stale data. Resuming skips a backlog rather than trading old signals.

## What drives a decision

1. Price change, high–low range, volume relative to the preceding 20 bars, cash fraction, and position fraction become six bounded sensory stimulation rates.
2. Those rates stimulate named, fixed groups in the full v783 fly network. The market-to-neuron mapping is artificial and documented.
3. The network runs for 500 ms of neural time. The final 250 ms supplies the output firing rates.
4. The higher BUY or SELL rate must reach 20 Hz and lead by at least 8 Hz. Otherwise the decision is HOLD. Hz means spikes per second per neuron, not confidence or probability of profit.
5. Execution can reject or reduce the intent, but cannot invent or reverse it. Orders use cash, allow no shorts, and require earlier orders to resolve. Intended size is capped at $100; new buys are limited by 10% entry exposure. Actual market fill prices can move from the sizing reference.

## Learning

There is no learning in V1. Weights, sensory mappings, output pools, and thresholds stay fixed. No news, LLM, labeled financial training set, technical-indicator strategy, or reward update chooses the trades. The previous 20 volume bars are a causal normalization window, not training data. Voltages, conductances and delayed neural events persist and are checkpointed; this is evolving state, not improved trading skill. P&L is measured, not used to train or reward the network.

## What to watch

- **Connection:** Paper mode, fresh last-received timestamp, loaded/validated brain, and no readiness blockers. “Offline” means the desktop is showing saved readings.
- **Decision inspector:** new completed bar timestamp, changing state ID, stimulus rates, BUY/SELL Hz, and the threshold explanation. A long HOLD streak can be a valid result; compare its firing rates before assuming the worker is stuck.
- **Order ledger:** an intent is not a fill. Check submitted/partially filled/filled/rejected/canceled states and the recorded reason when no order follows a directional intent.
- **Account:** actual holdings and cash should agree with fills. With $100,000 equity, a $100 intended order is only 0.1% of the account, so equity changes can look small.
- **Performance:** track equity change, observed drawdown (drop from a prior recorded peak), and open-position P&L. Separate actual Alpaca performance from locally simulated historical fills and synthetic Demo data. One profitable day does not establish a trading edge.

Pause stops new orders and requests cancellation of Tradefly orders. It does not sell existing holdings, and an order can fill while cancellation is in flight. Keep the Mac awake with the worker running.

See VALIDATION.md for tested behavior and limitations. Alpaca paper fills are a simulation and omit some live-market effects: https://docs.alpaca.markets/us/docs/paper-trading.
