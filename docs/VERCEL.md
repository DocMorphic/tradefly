# Deploy Tradefly on Vercel

The repository supports both the existing Sites/Cloudflare deployment and a Next.js deployment on Vercel. Vercel runs the desktop and API routes; the two fly simulations and Alpaca/chart workers still run on your Mac. A free Turso **libSQL** database holds the website's telemetry, commands, research state and chart cache. No paid data feed is needed.

The desktop shell and synthetic Demo can be viewed without logging in. Paper performance, holdings, decisions, neural telemetry, research snapshots and cached charts are publicly readable. Account identifiers are removed. Trading controls, research changes and chart fetch requests require owner login. The worker authenticates separately with a bridge key. OpenAI identity headers are never accepted as proof of identity on Vercel.

## 1. Create the free database

Create a free account at [Turso](https://turso.tech/pricing), create a libSQL database named `tradefly`, and obtain its database URL and a database read/write token. The adapter uses `@libsql/client`, matching the existing SQLite schema. The database URL normally starts with `libsql://`.

No Supabase project is required. Keep the free plan; do not enable a paid upgrade. Usage remains subject to the provider's free limits.

## 2. Prepare settings and tables

In this repository, using Node 22.18+:

```sh
npm ci
npm run setup:vercel
```

This creates an ignored, private `.env.local` with two different random keys. It reuses your current bridge key when available and never prints the keys or overwrites an existing file. Open that file locally and fill in `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Then:

```sh
npm run db:migrate
```

This applies the checked-in schema migrations once. It is safe to run again; it verifies hashes of applied migrations. Schema migration is deliberate, rather than running on every website request or every preview build. Do not point this at the Python trading ledger; it is a separate website database.

## 3. Import the repository into Vercel

Import your GitHub repository (it can stay private). Use the repository root. `vercel.json` selects Next.js, `npm run build:vercel`, and the `.next` output automatically. Use Node 22 or 24 and the Hobby plan for this personal experiment.

Add these **server environment variables** to the Production deployment:

| Name | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | Your Turso database URL |
| `TURSO_AUTH_TOKEN` | Your database read/write token |
| `TRADEFLY_OWNER_KEY` | The generated owner key from `.env.local` |
| `TRADEFLY_BRIDGE_TOKEN` | The generated/reused bridge key from `.env.local` |

Deploy, open the new website, choose **Owner login**, and paste the owner key. **Keep me signed in** is checked by default and remembers this browser for 90 days, including after closing and reopening it. Uncheck it for an eight-hour session. The signed, HTTP-only cookie does not contain your owner key. Each browser and hostname (including localhost) needs its own sign-in. **Lock** or clearing cookies signs this browser out; rotating the owner key and redeploying invalidates previous sessions. Keep the owner and bridge keys different. Neither key uses a `NEXT_PUBLIC_` prefix. Alpaca API keys and Sites bypass tokens stay on the Mac.

Do not give Preview deployments the Production database and bridge key. Use a separate test database/keys if you want connected previews; otherwise the public demo still works with the private backend unavailable.

## 4. Move the local worker connection when ready

The current Sites website keeps working until you change the local `.env.bridge`. First pause the fly in the current desktop and wait for the worker to report paused. Stop the existing trading worker cleanly using its original terminal (Ctrl+C); if the standalone chart helper is running in another terminal, stop that too. Do not launch two trading workers against the same ledger.

Edit the existing local `.env.bridge`, preserving its other entries:

```dotenv
TRADEFLY_SITE_URL=https://YOUR-PROJECT.vercel.app
TRADEFLY_BRIDGE_TOKEN=THE_SAME_BRIDGE_KEY_AS_VERCEL
```

Use the exact HTTPS origin, with no path or query. Sites-specific bypass headers are not sent to Vercel. If Vercel Deployment Protection blocks the worker, configure its [automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) and store its token locally as `TRADEFLY_VERCEL_BYPASS_TOKEN`. The app's owner login remains required regardless of platform protection.

Start the existing backend normally:

```sh
npm run backend
```

It starts paused, restores the existing local fly checkpoints/ledger, and also starts the chart helper. Wait until Vercel shows a fresh connected backend, then press Resume there. Keep the Mac awake. Do not remove the local `runs/` or `data/` directories.

The worker uploads its current telemetry, including the bounded account history, to the new website. The entire audit ledger remains on your Mac. Delayed stock charts repopulate on demand. The hosted Swarm research state starts fresh in the new database; the old Sites copy remains available.

To return to Sites, pause and stop the worker, remove `TRADEFLY_SITE_URL`, retain the original `TRADEFLY_SITES_TOKEN` and matching bridge key, and restart. Startup never replays an old Resume command.

## Local verification

```sh
npm run build:vercel
npm run test:vercel
```

The production smoke test starts Next.js on localhost:3041 with an isolated temporary database and random throwaway keys. It checks auth, telemetry, command guards, research storage and the chart queue. It never calls Alpaca or loads a fly brain.

For interactive local development after configuring `.env.local`, run `npm run dev:vercel`. Existing Sites commands remain `npm run dev` and `npm run build`. For schema changes, generate a new Drizzle migration and run `npm run db:migrate` before deploying the dependent Vercel code.


## Keeping transfer usage low

Fast Origin Transfer includes requests into functions as well as responses. Re-uploading a 748 KB snapshot every 15 seconds can alone transfer about 4.3 GB/day, even with no visitors. Tradefly now sends a compressed full snapshot on worker startup, then compressed changes against the last acknowledged server receipt. The server retains the complete state, rejects stale patches, and keeps command fields separate. Browser polls exchange field versions and download only changed chunks; hidden tabs stop polling. No chart history, decisions or neural traces are removed by this optimization.

Deploy the server before restarting an updated worker. Reload existing desktop tabs to load the improved browser poller. The first page load and worker restart still require full state. During active trading, changing neuron traces and decision histories transfer more than an idle heartbeat. Inspect local `runs/status.json` → `telemetry_transfer` for compressed request-body bytes versus equivalent full snapshot bytes in the current worker session. These counters exclude HTTP headers and do not replace Vercel's billing measurements. Previously accrued usage is not erased.

See [Vercel's transfer accounting](https://vercel.com/docs/manage-cdn-usage).
