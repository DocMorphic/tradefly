# Corporate-action valuation checks

The local worker checks Alpaca's read-only `/v1/corporate-actions` data endpoint every ten minutes, with pagination and a one-minute retry after errors. The query starts 90 days before the experiment baseline and includes seven upcoming days. This uses the existing account's data access; no paid service was added.

Forward/reverse splits, stock dividends, spin-offs, stock mergers, stock-and-cash mergers, redemptions, name changes and worthless removals are checked against recorded fills. The account is flagged if it held the affected security before the effective date. Effective dates are conservatively treated as midnight New York time. Ratio-derived share counts are indicative: fractional-share handling, multiple actions, basis adjustments and cash-in-lieu still need reconciliation. A matching quantity alone is not proof of a correct account balance.

Evidence and unresolved issues persist in the ignored local SQLite settings under `corporate_actions_v1`; the first detection is also logged as `corporate_action_flagged`. Known events and issues survive feed outages, restarts and disappearing positions. An empty later feed cannot silently clear an issue. Malformed/incomplete responses and stale/unavailable checks fail closed for new orders. The guard operates at resume and submission, independently of the desktop.

While flagged, the raw broker account and equity history remain available for audit. `reported_equity_change_usd` preserves the broker-derived delta, while `equity_change_usd` is null. The public dashboard marks the reported account value as unverified, withholds total profit, affected holdings profit and return percentages, and omits affected profit/drawdown graph segments. The 3D monitor also shows the warning. No synthetic sale, adjusted share quantity, new baseline or corrected profit is written.

The learner excludes post-incident account inputs and observations near a known corporate action in the affected symbol. Raw historical decisions/fills are preserved. New neural inputs whose historical bar window crosses an action are skipped. Learned-mode promotion also requires a current, clear corporate-action check.

## Current NCT incident

On September 17, 2026, the feed confirms a 25-old-to-1-new share split. Tradefly recorded 299 pre-split shares, while the paper broker still reports 299 against post-split prices. The split ratio implies 11.96 shares before fractional-share treatment. This is flagged as unverified, rather than treated as a $2,000+ strategy gain.

## Reconciliation and scope

There is deliberately no automatic dismiss button. Clearing an issue requires separately verified broker positions, cash/cash-in-lieu, cost basis and account activity, plus an explicit audited ledger reconciliation. This change detects and contains the issue; it does not repair Alpaca's paper accounting. Even after a broker quantity changes, historical invalid valuation intervals must remain flagged until that audit is complete.

This is a corporate-action check against Tradefly's recorded fills, not a complete financial audit. Vendor omissions, events outside the query window, unidentified ticker/CUSIP mappings, manual broker activity and unrelated balance discrepancies can require additional investigation. Cash dividends are not classified as share-quantity anomalies. An action-free result does not prove profitability.

Sources: [Alpaca endpoint](https://docs.alpaca.markets/us/v1.1/reference/corporateactions-1), [Nasdaq NCT split notice](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-663).
