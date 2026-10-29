# Frontend warnings and worker recovery

Investigation: 29 October 2026. The checkout is in `~/me/tradefly`.

## What the messages mean

The Vercel frontend is reachable. Its last worker receipt was
`2026-10-15T21:31:56.661Z`, matching the backup's record that the old Mac worker
was stopped for the laptop handover. Opening or redeploying the website will
not restart the Python simulations.

Read-only requests to the Alpaca paper account succeeded on 29 October. The
saved “Alpaca GET: connection unavailable” message therefore does not describe
the current connection. It remains available under Worker status as part of
the historical snapshot; the desktop footer now describes the saved state.

The corporate-action warnings still have a basis in current broker positions:

| Holding | Current observation | Required resolution |
| --- | --- | --- |
| NCT | Broker still reports 299 shares. The recorded split evidence implies 11.96 before fractional-share treatment. | Reconcile the split, any fractional cash, cost basis and account activity. |
| EU | Source holding remains; none of the three recorded distribution securities appears in the returned positions. | Reconcile VUECF, 292CNT037 and 292CNT029 separately, including basis and any cash treatment. |
| TORO | Source holding remains; AIOK does not appear in the returned positions. | Reconcile the distribution and its basis/cash treatment. |

This initial position check was not a complete account audit. The isolation
review in the hosted snapshot predates the TORO issue and is invalid.
Relabeling these balances as verified,
resetting the baseline, or deleting the warnings would not fix the underlying
accounting.

## Local review resolved, worker kept stopped

At the owner's request, a one-shot review was completed without starting the
worker. The original backup was opened read-only and its final ledger restored
to `runs/tradefly.sqlite3`. A separate pre-review backup is preserved at
`runs/before-isolation-renewal-20261029.sqlite3`.

The existing renewal workflow passed checks against all 103 recorded broker
orders, 263 account activities, current positions, cash, cost bases, and fresh
corporate-action evidence. Broker access was restricted to GET requests. The
renewed local review retains all old exclusions and adds TORO/AIOK, covering:
NCT, EU, VUECF, 292CNT037, 292CNT029, TORO, and AIOK. Its report is saved in
`runs/corporate-review-20261029.json`.

This resolves the missing-isolation-review issue in the restored local ledger.
The next worker refresh must re-audit the account; current runtime approval
still expires normally. No worker, brain simulation or bridge process was
started. No broker orders or balances were changed. The hosted October 15
snapshot remains historical until fresh telemetry is deliberately enabled.
Performance remains unverified because the actual split/distribution accounting
is still unresolved at Alpaca. The offline state is expected while the worker
is intentionally stopped.

## Frontend corrections

- Normal WebMCP registration cancellation during React effect cleanup no longer
  produces a console error. Other registration failures are still reported.
- Saved snapshots are identified in the toolbar and footer. The duplicate
  offline banner is removed.
- Performance verification has a concise notice with expandable evidence and
  recovery steps. All five corporate-action records remain available, and
  affected profit metrics remain withheld.
- An invalid isolation review is labeled “previous exclusions · review required.”
- UI and command API share timestamp validation. Invalid, expired or excessively
  future timestamps cannot unlock controls. A separate clock ages readings even
  if polling stalls; polling requests have a timeout.

## How to clear the remaining operational warnings

1. Restore the ignored worker files from `~/Downloads/backup/projects/tradefly`
   into this checkout: `.env`, `.env.bridge`, `.env.typesafe`, `runs/`, `data/`
   and `vendor/`. The local `runs/tradefly.sqlite3` already contains the renewed
   review above; retain it and restore only the other missing run files.
   Preserve the original backup. Do not replace tracked source files with the
   older backup. Keep restored credentials
   private and out of Git. The website's `.env.local` is not required for the
   worker and would connect local frontend development to production storage.
2. Install Python 3.12 and `uv`, then run `uv sync --python 3.12`. Check for an
   existing worker before starting another one. Confirm the bridge origin is
   the intended Vercel website. Start `npm run backend`; it restores the two
   brains and starts paused. Fresh telemetry clears the offline status, but
   does not itself resolve corporate actions. Note that the runner's `--once`
   flag still exchanges telemetry with its configured website.
3. Perform a fresh review of broker orders, fully paginated account activity,
   positions, cash and basis against the restored ledger. If the broker has
   corrected the actions, implement and validate an audited reconciliation,
   preserving invalid historical valuation intervals. Existing docs deliberately
   provide no generic “mark verified” command.
4. If the account remains unresolved, the existing explicit isolation workflow
   may permit unaffected training after its strict checks pass. A renewed review
   must retain previous exclusions and address TORO/AIOK as well. Isolation
   **does not clear Performance unverified**. See
   [Corporate actions](CORPORATE-ACTIONS.md) and
   [Position recovery](POSITION-RECOVERY.md).

Only the local ledger has been restored for the review above; credentials,
brain assets and checkpoints have not been restored. No worker or deployment
was started. The local UI preview uses a separate SQLite database populated
from the public snapshot.

## Verification

`npm test`, `npm run build:vercel`, and `npm run test:vercel` pass. The regression
coverage includes receipt expiry, invalid/future timestamps and command refusal.
Browser inspection verifies that the compact notice expands to all five records
and that normal tool-registration cancellation no longer logs an error.

`npm run lint` still reports pre-existing findings across other UI components,
research code and tests. Dependency installation also reports existing package
advisories; this focused change does not upgrade the dependency tree.
