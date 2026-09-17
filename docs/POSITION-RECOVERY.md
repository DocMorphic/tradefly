# Missing paper positions

An unexplained difference between recorded fills and Alpaca positions normally blocks the whole account. Tradefly cannot repair a missing position in Alpaca.

After the owner requests recovery and the order/activity history has been investigated, a stopped, paused worker can receive an explicit local quarantine through `tradefly.reconciliation.quarantine_missing`. This is not automatic and is not exposed through a public API. Back up the SQLite ledger and hold `runs/worker.lock` before opening it for recovery.

A quarantine applies to one completely missing long position, on the same paper account and exact recorded order history. All related orders must be terminal and reverified with Alpaca; no related open orders are allowed. The original fills and equity baseline remain unchanged. No sale, cash credit or realized gain/loss is invented.

The quarantined symbol cannot submit new orders. The known discrepancy no longer blocks other symbols, but a different quantity, changed order record, account change, or unrelated mismatch still blocks trading. If the position reappears, the dashboard reports that it matches again; the symbol remains excluded pending a separate review. Performance continues to reflect Alpaca's reported balances, including the effects of any missing position.

The one-time GDXD recovery is stored in the local ledger's `position_quarantines_v1` setting and `position_quarantined` audit event. Its detailed investigation and pre-recovery database backup live under ignored `runs/`. Worker startup remains paused; the owner resumes through the dashboard.
