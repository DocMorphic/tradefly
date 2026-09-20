# Corporate-action valuation checks

The local worker checks Alpaca's read-only `/v1/corporate-actions` data endpoint every ten minutes, with pagination and a one-minute retry after errors. The query starts 90 days before the experiment baseline and includes seven upcoming days. This uses the existing account's data access; no paid service was added.

Forward/reverse splits, stock dividends, spin-offs, stock mergers, stock-and-cash mergers, redemptions, name changes and worthless removals are checked against recorded fills. The account is flagged if it held the affected security before the effective date. Effective dates are conservatively treated as midnight New York time. Ratio-derived share counts are indicative: fractional-share handling, multiple actions, basis adjustments and cash-in-lieu still need reconciliation. A matching quantity alone is not proof of a correct account balance.

Evidence and unresolved issues persist in the ignored local SQLite settings under `corporate_actions_v1`; the first detection is also logged as `corporate_action_flagged`. Known events and issues survive feed outages, restarts and disappearing positions. An empty later feed cannot silently clear an issue. Malformed/incomplete responses and stale/unavailable checks fail closed for new orders. The guard operates at resume and submission, independently of the desktop.

While flagged, the raw broker account and equity history remain available for audit. `reported_equity_change_usd` preserves the broker-derived delta, while `equity_change_usd` is null. The public dashboard marks the reported account value as unverified, withholds total profit, affected holdings profit and return percentages, and omits affected profit/drawdown graph segments. The 3D monitor also shows the warning. No synthetic sale, adjusted share quantity, new baseline or corrected profit is written. An explicit, audited isolation may permit execution on other symbols without verifying performance; see below.

The learner excludes post-incident raw broker account inputs and observations near a known corporate action in the affected symbol. New observations explicitly marked with a valid isolation review can enter shadow learning, using the conservative account inputs. Historical contaminated observations remain excluded. New, unreviewed issues exclude affected inputs again. Raw historical decisions/fills are preserved. New neural inputs whose historical bar window crosses an action are skipped. Learned-mode promotion and learned-order execution still require verified performance.

## Audited isolation of an unchanged split holding

Isolation is a local, explicit owner decision; it is not an automatic dismissal or a repair of Alpaca's ledger. Stop the worker, then run:

```sh
.venv/bin/python scripts/macos-worker.py stop
.venv/bin/python scripts/isolate-corporate-action.py --symbol NCT --reason "Owner approved excluding NCT while its split is unresolved"
.venv/bin/python scripts/macos-worker.py install
```

The command holds the worker lock, backs up SQLite, verifies all recorded orders against the broker, and audits fully paginated account activity. Its narrowly supported case is one initial USD cash funding matching the original baseline, no pre-baseline fills, and no post-action trades in the isolated symbol. Every fill must belong to a recorded order; quantities, fill cash, and all current holding bases must reconcile. Unknown journals, dividends, fees, corporate-action cash, short positions or ambiguous activity require separate review instead of silent acceptance.

Every worker refresh re-audits full activity, cash, all holding quantities and moving-average bases. The review binds to the account, original baseline, exact corporate-action evidence, isolated position and order history, and previously reviewed activities. A changed or missing isolated position, changed historical activity, new cash adjustment, new issue, unavailable corporate feed or stale audit blocks execution again. Runtime approval expires after 30 seconds and is never restored from disk without a new audit.

The entire isolated market value is excluded. Risk capital is the lesser of reconciled cash plus unaffected marked holdings, or broker equity minus the isolated value. Available cash is the lesser of reconstructed and reported cash; no margin is used. Both neural inputs and order sizing use this conservative account view. The shared 10% entry exposure limit counts only unaffected holdings against that capital. Isolated stocks cannot be evaluated or submitted for BUY or SELL, even outside the split's historical input window.

Snapshots distinguish `execution_ready` from `performance_verified` and expose the excluded symbols, last audit time, reconciled cash and risk capital. Raw broker equity and original performance warnings remain. The selected decoder is unchanged: training-only still submits zero orders; original mode may submit unaffected paper orders; learned mode remains blocked. Each worker restart still starts paused.

## Current NCT incident

On September 17, 2026, the feed confirms a 25-old-to-1-new share split. Tradefly recorded 299 pre-split shares, while the paper broker still reports 299 against post-split prices. The split ratio implies 11.96 shares before fractional-share treatment. This is flagged as unverified, rather than treated as a $2,000+ strategy gain.

## Reconciliation and scope

There is deliberately no automatic dismiss button. Clearing an issue requires separately verified broker positions, cash/cash-in-lieu, cost basis and account activity, plus an explicit audited ledger reconciliation. This change detects and contains the issue; it does not repair Alpaca's paper accounting. Even after a broker quantity changes, historical invalid valuation intervals must remain flagged until that audit is complete.

This is a corporate-action check against Tradefly's recorded fills, not a complete financial audit. Vendor omissions, events outside the query window, unidentified ticker/CUSIP mappings, manual broker activity and unrelated balance discrepancies can require additional investigation. Cash dividends are not classified as share-quantity anomalies. An action-free result does not prove profitability.

Sources: [Alpaca endpoint](https://docs.alpaca.markets/us/v1.1/reference/corporateactions-1), [Nasdaq NCT split notice](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-663).
