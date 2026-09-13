# What we need from you

Nothing is needed to begin the simulator benchmark and synthetic-input work.

## Before current-market paper trading

1. Create or use an [Alpaca paper-only account](https://docs.alpaca.markets/us/docs/paper-trading).
2. Generate its paper API key and secret in the dashboard.
3. When the integration is ready, copy `.env.example` to `.env` locally and enter those credentials there. Do not paste them into chat or commit them. The implementation must load this file explicitly; the current planning repository does not use it.

Alpaca documents global availability of paper-only accounts and IEX-only data entitlement for those accounts. The IEX feed is a limited view of the market, not all-exchange coverage. A free account is sufficient for the proposed initial experiment. Historical-data availability and any recent-data restrictions must be verified against the chosen account during implementation. No paid data subscription is needed for setup.

## Optional preferences

We propose AAPL, five-minute decisions, $10,000 paper cash, and local execution. You can name a different US stock or simulated bankroll. We propose the female FlyWire reference dataset because it comes with an established simulation implementation; say so if the recent male CNS map specifically is part of the concept.

For unattended sessions the machine must stay awake and connected. Decide about an always-on machine only after the benchmark; no server purchase is necessary now.

## Work we handle

Data provenance, simulator installation and benchmarking, neuron mapping, interface design, paper bookkeeping, research controls, broker integration, and dashboard implementation. The first scientific uncertainty is whether this chosen network/interface produces useful variation in trading decisions. We will measure it rather than assume it.
