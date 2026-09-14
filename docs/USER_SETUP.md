# User setup

Alpaca paper credentials are configured and verified locally. Do not paste them into chat. See [backend operation](BACKEND.md) for commands, recovery and exports.

1. Keep the Mac awake and the worker running (`npm run backend`).
2. Open the private Tradefly desktop, select Paper, check the connection and brain readiness, then choose Resume when you want the paper experiment to run.
3. Pause stops new submissions and requests cancellation of Tradefly orders. It leaves holdings intact.

The actual paper account started with $100,000, separate from the demo's $10,000. The production universe is every active, tradable US equity symbol returned by Alpaca; there is no editable shortlist. Data & definitions shows every symbol and coverage. One shared brain processes available inputs continuously. Five minutes is bar resolution, not a mandatory wait between stocks. The same stock/bar is never evaluated twice.

Intended orders remain capped at $100, with 10% total portfolio entry exposure. Whole-share stocks can produce an intent that cannot fit that budget; the veto is logged. Fly log shows chronological activity and Decision inspector shows one decision in detail. The Mac must stay awake. No Supabase project or paid service is required for this implementation; IEX data gaps limit which stocks have usable current inputs.
