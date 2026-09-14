# FlySwarm integration audit

Inspected upstream `https://github.com/semkazz1/FlySwarm` at commit `7237572b16bfdd02ec04b3d732f9badd27dbf8eb` on 2026-09-14. Upstream is MIT licensed, copyright 2026 Gyomei. Any reused modules retain the complete license and source attribution.

## Actual features and boundaries

| Feature | Upstream implementation | Tradefly integration boundary |
| --- | --- | --- |
| Token radar and ticker/contract search | Robinhood RPC factory logs; DexScreener fallback; up to 36 returned tokens | Crypto data is a separate instrument class from Alpaca stocks |
| Token details | ERC-20 metadata plus available price, liquidity and 24h volume | Preserve field provenance and unavailable values |
| Holder bubble map | Up to 160 addresses sampled from transfer logs, balances read, top 40 shown | Sampled holders, not a complete ownership registry; no stock-wallet equivalent in Alpaca |
| Wallet activity filters | Outgoing transaction count: NEW ≤3, WARM ≤25, ESTABLISHED >25; separate contract detection | Activity approximation, not wallet creation date or proof of shared ownership |
| Holder fallback | Deterministic generated balances/addresses when RPC fails | Explicit prototype mode only; never present as observed ownership |
| Funding graph and transfer tape | Seeded synthetic hunter-to-fresh-address-to-token transfers | Prototype data; a real funding indexer is absent |
| Wallet dossiers | Hardcoded aliases, win rates and P&L | Not measured account performance |
| Cohort memory and prior joint entries | Three hardcoded cohorts and their historical outcomes | Demo memory, not learned history |
| Signal desk | Handwritten score: 44% overlap, 28% timing, 18% liquidity, up to 10 points group size | Not a fly-neural decision; must never bypass Tradefly's neural decoder |
| FIRE / WATCH / NOISE | Fixed score cutoffs 84 and 70 | Research labels, not profit probabilities |
| Autosnipe configuration | Enable flag, score threshold 55–99, size 10–5000 | Creates local simulated positions only; no crypto signer or order broadcaster exists |
| Position marks and P&L | Seeded random price drift | Synthetic outcomes, separate from Alpaca paper and historical market replays |
| CLI | Synthetic rolling transfer and signal feed | Can expose the same bounded research state without controlling the trading worker |
| JSON/event endpoints | Packaged Worker contains state, tokens, detail, holders, config, focus, reset, and a one-event reconnecting stream | Production mutations need existing Tradefly identity/origin checks and durable state |

## Code health

The source `package.json` contains methodology Markdown rather than JSON. `server.mjs` contains the build script and `worker.mjs` contains test assertions. The packaged `dist/server/index.js` does contain a usable reference request handler. Installing or running the source exactly as its README describes therefore fails at this revision. The two core modules can be inspected and exercised independently; the prototype engine produced transfers, signals and simulated positions in an isolated check.

## Scientific distinction

FlySwarm explicitly uses a graph metaphor and downloads no biological dataset. Tradefly runs a full v783 fly connectome with fixed spiking dynamics. Importing FlySwarm's score as the stock trading policy would replace the user's neural-only design. Comparable stock analytics can be implemented using actual market/neural/order records, but stock ownership flows cannot be invented to imitate cryptocurrency wallets.

## Delivered integration

To preserve the requested full feature set, Tradefly adds a separate Swarm research OS window alongside the existing stock experiment. The stock brain and its execution policy remain unchanged.

The research window includes token radar/search/details, sampled holder bubbles and activity filters, funding graph and transfer tape, wallet dossiers, cohort memory/history, rule scores and evidence, synthetic position-plan settings and P&L, and a terminal feed. A deliberate action can apply a real token label to an illustrative scenario; that never turns the generated wallet routes into observations.

Adapted source modules live under `lib/swarm/` with the upstream MIT license. Improvements include serializable random state, deterministic reset, durable D1 snapshots, revision checks against lost updates, authenticated same-origin mutations, explicit source boundaries, RPC method restrictions, contract verification on address search, corrected holder coverage and token-decimal display. Existing brain/Alpaca code is not imported by research actions.

Endpoints: GET/POST `/api/swarm`, read-only GET `/api/swarm/market` (`tokens`, `detail`, `holders`), and GET `/api/swarm/stream` (one-event SSE with reconnect hints). POST actions are `step`, `reset`, `focus` and `config`, with an expected revision. The stream observes state; scenario steps are explicit writes. CLI: `npm run swarm:terminal` produces a separate deterministic synthetic feed using the same core module.

The UI runs scenario ticks while its research window is open and the browser page is visible. Configurations and generated state persist in D1. This is not an unattended crypto trader and has no signer, private-key input or transaction broadcaster—matching upstream's actual execution boundary.

Validation: external token discovery returned 29 tokens via the Robinhood RPC/Pons factory during a read-only check. Deterministic engine tests verify serialization continuity, settings, generated positions and reset. External data may subsequently be unavailable; the UI exposes degraded and prototype modes.

The live holder probe returned 13 positive-balance holders for one returned contract; its exact block coverage is exposed by the adapter. A locally isolated Worker/D1 integration check passed identity/origin rejection, persisted scenario state, generated-plan settings, conflicting-revision protection, invalid-contract rejection and the read-only SSE endpoint. Test state remained in an isolated local database and never touched Alpaca.
