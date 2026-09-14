# User setup

Alpaca paper credentials are configured and verified locally. Do not paste them into chat. See [backend operation](BACKEND.md) for commands, recovery and exports.

1. Keep the Mac awake and the worker running (`npm run backend`).
2. Open the private Tradefly desktop, select Paper, check the connection and brain readiness, then choose Resume when you want the paper experiment to run.
3. Pause stops new submissions and requests cancellation of Tradefly orders. It leaves holdings intact.

The actual paper account started with $100,000, not the demo’s $10,000. The default 12-stock watchlist is editable while paused in Data & definitions. One shared brain evaluates the next stock every five minutes, so 12 stocks take about an hour per rotation. Intended orders are capped at $100, with 10% total portfolio entry exposure. Open Fly log for a chronological trace, or Decision inspector for one decision in detail. No Supabase account or additional paid service is needed. The present setup is local, not always-on hosting.
