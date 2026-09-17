# Fly-inspired learning lab

## Goal and honest scope

Learn whether measured fly-brain activity contains useful trading information, then validate a learned decoder before paper execution. Profit is not guaranteed. The connectome simulation is the existing Shiu/Spiller model. The new associative readout is engineered, inspired by reward-modulated memory; it is not a reconstruction of the mushroom body or a claim that a biological fly understands markets.

Research: [Shiu et al., 2024](https://www.nature.com/articles/s41586-024-07763-9) models sensorimotor transformations from connectome connectivity. [Huang et al., 2024](https://www.nature.com/articles/s41586-024-07819-w) studies dopamine-mediated short/long-term mushroom-body memory. Our numerical reward, feature hash, learning rate, return horizon and order mapping are human design choices, not parameters established by those experiments.

## Implementation plan

1. A deterministic neural-only feature vector from measured firing rates and recorded spike identities. Do not pass raw prices, future returns or ticker identity into the learned prediction. Maintain fast and slow bounded associative weights; delayed prediction error modulates the eligibility vector stored at the original decision.
2. Independently observe completed historical SIP bars (free, at least 16 minutes old). Entry is the first five-minute bar opening strictly after the recorded decision time. Exit is six regular-session bars later. Skip discontinuities, overnight intervals, missing coverage, quarantined symbols and invalid records. A fixed 20 bp round-trip friction estimate is subtracted, with a 40 bp stress case. These are hypothetical independent $100 opportunities, not broker fills or a portfolio backtest.
3. Chronological training/validation split, with no training label crossing the split. Freeze weights for held-out evaluation. Also maintain a continuously learning shadow model, with pre-update predictions and delayed reward updates. Never retune on the holdout. Candidate epochs advance every 28 calendar days from the initial split, independent of scores. At each boundary, matured earlier outcomes can train a new candidate, which must pass a fresh future holdout; the active execution model is never changed automatically. Compare original decoder, cash, always-long, price-momentum, and neural-ablated readout under identical opportunities/costs. Report dates, sample counts, exclusions, signals, errors and prediction/weight changes.
4. A persistent local learning service and public read-only Training Lab, streamed through the existing authenticated bridge. Original execution stays unchanged until an owner selects learned mode and a saved evaluation passes the gate. Learned mode is long-only and uses the existing account/order guards, quarantine, order cap and pause/resume controls. No exploration orders or automatic risk increase.

## Gate

At least 200 held-out observations, 10 distinct held-out market dates, 10 symbols, positive net mean at base and stressed costs, and outperformance of every baseline including the ablated network. At least three of four chronological validation quarters must outperform cash. No live auto-promotion. Reports cannot support a profitability claim until there is adequate held-out and forward evidence. Current observations collected by the old policy are selection-biased, so passing this initial gate is provisional and still requires paper forward testing.

## Persistence and operations

Learning uses an isolated SQLite database under ignored runs/learning, backed by a single-writer file lock. Observations are keyed by decision ID. Outcomes use broker market data and have explicit availability times; outcome records are committed in SQLite transactions. Memories are deterministically rebuilt from the saved event history, so restarting does not double-count rewards. Each model artifact and public report is atomically replaced. Price retrieval never submits broker orders. Credentials remain local.

## Training-only mode

The owner can select Training only while paused, then Resume. Both full fly simulations keep observing the market and producing neural traces, but the coordinator blocks every broker submission. This collects future rewards without placing new orders; existing holdings are neither liquidated nor protected by this mode. Shadow predictions update only after delayed outcomes arrive. The original trading policy and gated learned decoder remain separately selectable while paused.

The held-out score is a fixed-horizon signal screen, not a portfolio backtest. It omits overlapping-capital constraints and differences between the live stock-tour revisit times and the 30-minute evaluation horizon. Passing only permits a controlled paper trial, not live-money use.
