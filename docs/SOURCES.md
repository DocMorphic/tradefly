# Sources and implementation leads

Checked 2026-09-14. Pin upstream commits and data hashes during implementation; URLs alone do not pin a reproducible experiment.

1. [Shiu et al., Nature (2024)](https://www.nature.com/articles/s41586-024-07763-9): connectome-based modeling and experimental validation of selected sensorimotor responses. This does not establish stock-trading ability.
2. [Research implementation](https://github.com/philshiu/Drosophila_brain_model): Python/Brian2 reference, v630 default and documented v783 configuration. Code license is MIT; verify data licensing separately before redistribution.
3. [Reference model source](https://github.com/philshiu/Drosophila_brain_model/blob/main/model.py): fixed synaptic weights, Poisson activation, spike recording, and trial-oriented construction. Tradefly needs a persistent-run adaptation.
4. [FlyWire](https://flywire.ai/): adult female brain dataset and project context.
5. [Google Research male CNS announcement](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/): the newer male dataset, distinct from the proposed V1 female brain.
6. [Male CNS data portal](https://male-cns.janelia.org/): possible later dataset source.
7. [Alpaca paper trading](https://docs.alpaca.markets/us/docs/paper-trading): paper-only accounts, paper endpoint, data entitlement, and simulation limitations.
8. [Alpaca market-data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq): feed access and market-data limitations.
9. [Alpaca order lifecycle](https://docs.alpaca.markets/us/docs/working-with-orders): orders, client identifiers, and execution events.

The financial protocol, observation choices, action mapping, execution constraints, and milestones are Tradefly design decisions. They are not scientific findings from these sources.

## Learning and account verification

- [Huang et al., Nature (2024)](https://www.nature.com/articles/s41586-024-07819-w): dopamine-mediated short- and long-term mushroom-body memory; an inspiration for the engineered memory layer, not evidence that Tradefly recreates that mechanism.
- [Alpaca corporate actions](https://docs.alpaca.markets/us/v1.1/reference/corporateactions-1): split and other share-event metadata used by the local valuation checks.
- [Nasdaq NCT split notice](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-663): the September 17, 2026 event behind the documented paper-account mismatch.
