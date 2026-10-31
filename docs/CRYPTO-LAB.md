# Crypto Lab and blockchain decision receipts

Implemented 31 October 2026. Crypto Lab is a separate experiment from the stock
account and the synthetic Swarm research window. The desktop remains public and
read-only. Opening Crypto Lab does not launch a worker, load a brain, or sign a
transaction.

## Try the complete blockchain walkthrough

```sh
npm ci
npm run build:vercel
npm run crypto:demo
```

Open the printed loopback website, choose **Crypto Lab**, **Load walkthrough**,
then **Verify receipts**. The result is “On-chain commitment matches · Local
Ethereum.” **Alter a copy**, then verify again: integrity fails. The walkthrough
uses invented candles and rates, explicitly labeled synthetic. The BTC/ETH price
panel independently reads actual completed public market candles.

This command compiles/deploys `contracts/DecisionReceipts.sol` and mines a
commitment on a temporary Anvil Ethereum node. It uses a public development
account, test Ether, and an isolated temporary website database. It reads no
broker credentials and loads no biological model. Ctrl+C stops its website and
Ethereum node and removes its temporary database. Build artifacts are ordinary
`.next` output. This local chain is not a public blockchain publication.

## Paper experiment

- BTC/USD and ETH/USD; completed 5-minute Coinbase Exchange candles, 24/7.
- $10,000 initial simulated USD, long only; $100 maximum intended notional and
  10% total entry exposure, assessed using the observed account at decision time.
- A fixed modeled 25 bps fee and 10 bps adverse slippage per fill. These are
  experiment assumptions, not a broker fee quote or execution guarantee.
- Inputs require 21 consecutive, completed bars. A gap or a last completion
  older than 90 seconds produces no neural evaluation. No market-calendar gate
  or IEX stock data is used.
- Direction comes exclusively from the existing validated full FlyWire brain,
  the six-channel encoder, and the fixed 20 Hz / 8 Hz decoder. No price heuristic,
  synthetic readout, Swarm score or fallback strategy can supply an action.
- A BUY/SELL intent waits for the first five-minute opening strictly after
  actual decision completion. It settles only after that candle is observed
  complete. A missing eligible candle cancels the intent. There is one pending
  simulated order at a time. The $100 cap may be reduced by cash/exposure limits;
  sales are clipped to owned quantity. Prices can move after the entry budget is
  assessed, so this is not an absolute bound on subsequently marked exposure.
- Quantities use eight decimal places; accounting uses Decimal with twelve
  decimal places. No shorts, leverage, broker orders or wallet swaps exist.

`runs/crypto-lab/ledger.sqlite3` holds the independent account, immutable decisions
and full fill events. `brain.checkpoint` is separate from the stock checkpoints.
Both are ignored by Git. The experiment digest binds the full brain digest,
crypto accounting implementation and receipt implementation. Changed model or
protocol code requires a new experiment ledger.

An in-flight SQLite marker is written before stimulation. A staged checkpoint
is saved before committing the decision and its digest. If a crash occurs after
that database commit but before checkpoint rename, the matching staged file is
promoted on restart. Interrupted/unmatched steps fail closed; restore a matched
ledger/checkpoint backup rather than clearing the marker or replaying a step.

After separately restoring/validating the documented full brain assets and
installing Python 3.12 with `uv sync --python 3.12`, explicitly opt in:

```sh
npm run crypto:paper -- --run                    # paused; exits without loading a brain
npm run crypto:paper -- --run --resume-paper --once  # explicitly evaluate one pass
npm run crypto:paper -- --run --resume-paper     # continuous local paper experiment
```

These are instructions for a later deliberate start. Neither brain worker was
started during implementation. The first invocation creates a new crypto
ledger; it never imports stock positions, account balances or stock checkpoints.
Stop with Ctrl+C; restart requires the explicit resume flag again.

## Publish crypto telemetry to the desktop

Apply the checked-in `0004_crypto_lab` website migration with `npm run db:migrate`
against the intended website database before publication. Existing stock tables
are not modified. The separate `crypto_runs` table holds bounded recent snapshots;
the full account and receipt history remain in the local crypto ledger.

Use the existing local `.env.bridge` origin/token configuration, then add
`--publish` to the explicitly launched crypto runner. Authenticated
`POST /api/crypto/bridge` validates the complete receipt batch and projects only
public crypto fields. Synthetic sources, modified/reordered histories, stale
decision sequences and transfer gaps are refused. Concurrent uploads use an
optimistic snapshot comparison. Enable publication from the beginning of a run:
the initial upload must include sequence 1. An outage exceeding the 256-receipt
transfer window requires an explicit history resync; the API refuses to silently
accept a gap or reset the run. This endpoint does not update stock telemetry,
stock commands or the stock worker's receipt timestamp.

The UI reads `GET /api/crypto` and cached `GET /api/crypto/market?symbol=BTC/USD`.
The market adapter allowlists the two pairs, uses a fixed public origin, rejects
redirects and malformed OHLCV, removes forming candles and preserves gaps. Its
one-minute cache coalesces requests. The website requires no Coinbase credentials.

## Receipt format and verification limits

Every version-1 record includes the run, source, sequence, previous receipt hash,
pair, decision completion time, experiment digest, 21 input bars, six stimulus
rates, neural rates/state, action and the pre-decision paper account. Decimal
values are strings; JSON numbers are safe integers only. Object keys are ASCII,
sorted lexicographically; JSON is compact UTF-8. Python and browser implementations
share a test vector.

Receipt hash: SHA-256 of `tradefly.crypto.receipt.v1` + newline + canonical record.
Merkle leaves: SHA-256 of byte `0x00` + receipt-hash bytes. Parents: SHA-256 of byte
`0x01` + left + right hashes. Odd final nodes are duplicated. A batch holds 1–256
consecutive receipts; its canonical manifest includes source, sequence range,
count, prior receipt hash and Merkle root. Its SHA-256 digest is the commitment.
The contract's run key is SHA-256 of `tradefly.crypto.run.v1` + newline + run ID.

The Solidity contract accepts only its immutable publisher, requires each run's
next consecutive range starting at 1, and retains commitments by first sequence.
It cannot replace a batch, trade assets, or withdraw funds. Synthetic records
remain labeled synthetic even if their fingerprint is genuinely published.

The browser recomputes every receipt and the batch locally. Only the manifest
and digest are sent to `POST /api/crypto/verify`; raw decision files stay on the
device. Server RPC checks use the configured network and contract, never an
RPC URL supplied by an imported file. Matching is against current chain state;
it is not a claim of finalized settlement. Verify the deployed contract source
and RPC provider independently when treating a public receipt as evidence.

An anchor establishes that particular committed data existed by its inclusion
in the chain. Decision times are self-reported. Manually anchoring an old run
does not prove its decisions preceded market outcomes. Hashes cannot prove the
model truly ran, the data source was honest, all decisions were disclosed, or
the strategy is profitable. Test networks can be reset/deprecated; they are for
engineering demonstrations, not permanent production attestations.

## Public Ethereum test-network setup

```sh
npm run crypto:setup
```

This creates a fresh dedicated signer in a private, ignored `.env.crypto` and
prints only its address. Existing files are never overwritten. Fund that address
with faucet **test ETH**, then:

```sh
npm run crypto:anchor -- deploy
```

Copy the printed contract address into `TRADEFLY_RECEIPTS_CONTRACT` in
`.env.crypto`. Export a recorded batch without starting any brain or network:

```sh
npm run crypto:paper -- --export runs/crypto-lab/batch-1.json --first-sequence 1
npm run crypto:anchor -- publish runs/crypto-lab/batch-1.json
npm run crypto:anchor -- verify runs/crypto-lab/batch-1.json
```

For later batches, start at the previous published last sequence + 1. Each export
has at most 256 records. The CLI first verifies the full local bundle, checks the
RPC's actual chain ID and publisher identity, simulates publication, broadcasts,
waits for a successful receipt and saves the transaction reference under
`runs/crypto-lab/`. Duplicate/out-of-order publications are refused.

Supported chain IDs: Ethereum Sepolia `11155111`, Base Sepolia `84532`, and
loopback-only Anvil `31337`. Public endpoints require HTTPS. Other chain IDs,
including Ethereum mainnet, are refused. The public Anvil default key is refused
on public test networks. The signer is only loaded by the explicit local CLI;
the browser and website server have no transaction signing path.

For public website verification, configure only these three server values:

```dotenv
TRADEFLY_RECEIPTS_CHAIN_ID=11155111
TRADEFLY_RECEIPTS_RPC_URL=https://YOUR_TESTNET_RPC
TRADEFLY_RECEIPTS_CONTRACT=0xYOUR_DEPLOYED_CONTRACT
```

Never copy `TRADEFLY_TESTNET_PRIVATE_KEY` or `.env.crypto` to Vercel. The RPC URL
stays server-side; only network name, ID, contract and a known explorer URL are
public. Public publication requires a faucet-funded testnet signer; implementation
validation used only a local Ethereum node and did not deploy a public contract.

## Validation

```sh
npm test
uv run pytest -q backend/tests/test_crypto_lab.py
npm run test:crypto-chain
npm run build:vercel
npm run test:vercel
```

Coverage includes Python/browser hashing agreement, tampering/omissions/reordering,
strict source labels, malformed/future/gapped bars, causal fills and cash/basis
conservation, duplicate evaluations, interrupted checkpoint recovery, network
allowlisting, real Solidity compilation/deployment/commitment verification on
Anvil, publisher restrictions, duplicate/gap refusal, API auth/origin guards,
snapshot redaction, conflicting histories, and independence from stock telemetry.
Tests use fake neural fixtures; they do not load the biological graph or assert
that crypto trading performance has been validated. Existing repository-wide
lint findings outside this feature remain separately tracked.

Sources: [Coinbase candle API](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles),
[Ethereum transactions](https://ethereum.org/developers/docs/transactions/),
[Ethereum networks](https://ethereum.org/developers/docs/networks/),
[Viem contract actions](https://viem.sh/docs/contract/readContract),
[Anvil](https://www.getfoundry.sh/anvil/index.html).
