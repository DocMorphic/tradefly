# Missing paper positions

An unexplained difference between recorded fills and Alpaca positions normally blocks the whole account. Tradefly cannot repair a missing position in Alpaca.

After the owner requests recovery and the order/activity history has been investigated, a stopped, paused worker can receive an explicit local quarantine through `tradefly.reconciliation.quarantine_missing`. This is not automatic and is not exposed through a public API. Back up the SQLite ledger and hold `runs/worker.lock` before opening it for recovery.

A quarantine applies to one completely missing long position, on the same paper account and exact recorded order history. All related orders must be terminal and reverified with Alpaca; no related open orders are allowed. The original fills and equity baseline remain unchanged. No sale, cash credit or realized gain/loss is invented.

The quarantined symbol cannot submit new orders. The known discrepancy no longer blocks other symbols, but a different quantity, changed order record, account change, or unrelated mismatch still blocks trading. If the position reappears, the dashboard reports that it matches again; the symbol remains excluded pending a separate review. Performance continues to reflect Alpaca's reported balances, including the effects of any missing position.

The one-time GDXD recovery is stored in the local ledger's `position_quarantines_v1` setting and `position_quarantined` audit event. Its detailed investigation and pre-recovery database backup live under ignored `runs/`. Worker startup remains paused; the owner resumes through the dashboard.

## Reviewing a returned holding

`tradefly.reconciliation.release_returned(engine, symbol, reason)` supports an explicit local review after the owner requests recovery. Stop the worker, back up SQLite, and hold `runs/worker.lock` before invoking it with a paused engine. It only supports unchanged buy-only holdings: the account and original order fingerprint must match, every order must be reverified with Alpaca, the complete paginated account activity must match each fill's quantity and cash amount, and the returned quantity, average entry price and cost basis must agree. Open orders, missing evidence, sales, and share-changing events require a separate investigation.

A successful review removes that symbol's execution exclusion and writes a `position_quarantine_released` audit event containing the original quarantine and evidence hash. It does not alter fills, cash, the baseline, historical equity samples, or corporate-action warnings. Other account blockers remain in force; the worker remains paused.
