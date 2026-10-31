'use client';
import { useEffect, useState } from 'react';
import {
  Coins,
  Download,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  CRYPTO_SYMBOLS,
  verifyBundle,
  type CryptoSymbol,
  type ReceiptBundle,
} from '@/lib/crypto/receipts';
import { cryptoWalkthrough } from '@/lib/crypto/demo';
import type { CryptoSnapshot } from '@/lib/crypto/snapshot';
import type { CryptoMarket } from '@/lib/crypto/market';
import type { publicChain } from '@/lib/crypto/chain';
type Chain = ReturnType<typeof publicChain>;
type Lab = {
  snapshot: CryptoSnapshot | null;
  received_at: string | null;
  chain: Chain;
  storage?: string;
};
type Proof = {
  integrity: string;
  status: string;
  chain?: Chain;
  error?: string;
};
const money = (n: string | number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(n));
const short = (s: string) => s.slice(0, 10) + '…' + s.slice(-8);
const time = (s: string) =>
  new Date(s).toLocaleString('en-GB', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' UTC';
function download(bundle: ReceiptBundle) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `tradefly-${bundle.manifest.run_id}-${bundle.manifest.first_sequence}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
export function CryptoLab() {
  const [lab, setLab] = useState<Lab>({
    snapshot: null,
    received_at: null,
    chain: null,
  });
  const [symbol, setSymbol] = useState<CryptoSymbol>('BTC/USD');
  const [market, setMarket] = useState<CryptoMarket | null>(null);
  const [marketError, setMarketError] = useState('');
  const [sample, setSample] = useState(false);
  const [bundle, setBundle] = useState<ReceiptBundle | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('/api/crypto', {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (response.ok) setLab((await response.json()) as Lab);
      } catch {
        /* Recorded data remains available during an interrupted poll. */
      }
    };
    void load();
    const timer = setInterval(() => {
      void load();
    }, 30000);
    document.addEventListener('visibilitychange', load);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(
          '/api/crypto/market?symbol=' + encodeURIComponent(symbol),
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(15000),
            ]),
          },
        );
        const body = (await response.json()) as CryptoMarket & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Market feed unavailable');
        if (!controller.signal.aborted) {
          setMarket(body);
          setMarketError('');
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setMarketError(
            error instanceof Error ? error.message : 'Market feed unavailable',
          );
      }
    };
    void load();
    const timer = setInterval(() => {
      void load();
    }, 60000);
    document.addEventListener('visibilitychange', load);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [symbol]);
  async function walkthrough() {
    setBundle(await cryptoWalkthrough());
    setSample(true);
    setProof(null);
    setMessage('');
  }
  async function verify() {
    if (!bundle) return;
    setBusy(true);
    setMessage('');
    setProof(null);
    let checked: ReceiptBundle;
    try {
      checked = await verifyBundle(bundle);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Record verification failed',
      );
      setProof({ integrity: 'failed', status: 'not-checked' });
      setBusy(false);
      return;
    }
    try {
      setProof({ integrity: 'matched', status: 'checking' });
      // Only a commitment manifest leaves this browser; decision records stay here.
      const response = await fetch('/api/crypto/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifest: checked.manifest,
          digest: checked.digest,
        }),
      });
      if (!response.ok)
        throw new Error('Blockchain verification request failed');
      setProof((await response.json()) as Proof);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Verification failed',
      );
      setProof({ integrity: 'matched', status: 'unavailable' });
    } finally {
      setBusy(false);
    }
  }
  const snapshot = lab.snapshot;
  const displayedMarket = market?.symbol === symbol ? market : null;
  const bars = displayedMarket?.bars ?? [];
  const latest = bars.at(-1);
  const prices = bars.map((b) => Number(b.close));
  const low = Math.min(...prices),
    high = Math.max(...prices);
  const path = prices
    .map(
      (p, i) =>
        `${i && Date.parse(bars[i].at) - Date.parse(bars[i - 1].at) === 300000 ? 'L' : 'M'}${20 + (i * 660) / Math.max(1, prices.length - 1)},${146 - ((p - low) / (high - low || 1)) * 120}`,
    )
    .join(' ');
  const proofLabels: Record<string, string> = {
    checking: 'Checking blockchain…',
    unconfigured: 'Blockchain not checked · configure a test network',
    matched: 'On-chain commitment matches',
    unpublished: 'No on-chain commitment found',
    mismatch: 'On-chain commitment differs',
    unavailable: 'Blockchain check unavailable',
    'not-checked': 'Record integrity failed',
  };
  return (
    <section className="crypto-lab" aria-label="Crypto Lab">
      <header className="crypto-heading">
        <div>
          <span className="crypto-eyebrow">CRYPTO LAB / EXPERIMENT 02</span>
          <h2>A fly. A market. A receipt.</h2>
          <p>
            BTC and ETH paper experiments, with independently checkable decision
            records.
          </p>
        </div>
        <span className="crypto-badge">
          <Coins size={15} /> Simulated funds
        </span>
      </header>
      <div className="crypto-market">
        <div className="crypto-market-heading">
          <div className="crypto-pairs" aria-label="Crypto market">
            {CRYPTO_SYMBOLS.map((s) => (
              <button
                key={s}
                aria-pressed={symbol === s}
                onClick={() => setSymbol(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <span>Coinbase Exchange · completed 5-minute candles · UTC</span>
        </div>
        <div className="crypto-price">
          <strong>{latest ? money(latest.close) : '—'}</strong>
          <span>
            {latest
              ? `Candle opened ${time(latest.at)}`
              : 'Waiting for market data'}
          </span>
        </div>
        {prices.length > 1 ? (
          <svg
            viewBox="0 0 700 170"
            aria-label={`${symbol} completed candle closing prices`}
          >
            <title>{symbol} completed candle closing prices</title>
            <path d={path} fill="none" stroke="#b6a9ef" strokeWidth="2" />
            <text x="20" y="166">
              {money(low)}
            </text>
            <text x="590" y="166">
              {money(high)}
            </text>
          </svg>
        ) : (
          <p className="crypto-empty">
            {marketError || 'Loading public market prices…'}
          </p>
        )}
        {marketError && latest && (
          <p className="crypto-feed-note">
            Saved feed readings · {marketError}
          </p>
        )}
      </div>
      <div className="crypto-ledger-heading">
        <h3>Recorded paper experiment</h3>
        <span>
          {snapshot
            ? `Last published ${time(snapshot.updated_at)}`
            : 'No published run'}
        </span>
      </div>
      {snapshot ? (
        <>
          <div className="crypto-stats">
            {[
              ['Paper equity', snapshot.equity],
              ['Paper cash', snapshot.account.cash],
              ['Modeled fees', snapshot.account.fees],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
            <div>
              <span>Neural decisions</span>
              <strong>{snapshot.decision_count}</strong>
            </div>
          </div>
          <p className="crypto-caption">
            $10,000 independent baseline · $100 intent cap · 10% entry exposure
            · long only · 25 bps modeled fee + 10 bps slippage. Fills use a
            later observed opening after decision completion.
          </p>
          <div className="crypto-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Quantity</th>
                  <th>Recorded mark</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(snapshot.account.holdings).map(([s, p]) => (
                  <tr key={s}>
                    <td>{s}</td>
                    <td>{p.quantity}</td>
                    <td>{money(p.mark)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="crypto-caption">
            {snapshot.account.pending
              ? `Pending simulated ${snapshot.account.pending.side} · ${snapshot.account.pending.symbol} · earliest opening ${time(snapshot.account.pending.not_before)}`
              : 'No pending simulated order'}
          </p>
          <button
            className="crypto-button"
            disabled={!snapshot.bundle}
            onClick={() => {
              setBundle(snapshot.bundle);
              setSample(false);
              setProof(null);
              setMessage('');
            }}
          >
            Inspect recorded receipts
          </button>
          <details className="crypto-fill-details">
            <summary>
              Recent simulated fills · {snapshot.account.fills.length}
            </summary>
            <div className="crypto-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Quantity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.account.fills
                    .slice()
                    .reverse()
                    .map((f) => (
                      <tr key={f.decision_sequence}>
                        <td>{time(f.at)}</td>
                        <td>{f.symbol}</td>
                        <td>{f.side}</td>
                        <td>{f.quantity || '—'}</td>
                        <td>{f.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="crypto-empty crypto-ledger-empty">
          <Fingerprint size={28} />
          <div>
            <strong>No crypto run has been published yet.</strong>
            <p>
              The public price feed works independently. The neural experiment
              starts only when explicitly launched locally.
            </p>
          </div>
          <button
            className="crypto-button"
            onClick={() => {
              void walkthrough();
            }}
          >
            Explore a walkthrough
          </button>
        </div>
      )}
      <section className="crypto-receipts" aria-label="Decision receipts">
        <div className="crypto-receipts-heading">
          <div>
            <span className="crypto-eyebrow">DECISION RECEIPTS</span>
            <h3>Check the record, yourself.</h3>
          </div>
          <ShieldCheck size={28} />
        </div>
        <p>
          A fingerprint commits to the inputs, model identity and decision.
          Changing a record breaks the match. A match establishes record
          integrity, not model authenticity or profitability.
        </p>
        <div className="crypto-proof-flow">
          <span>Decision records</span>
          <b>→</b>
          <span>Batch fingerprint</span>
          <b>→</b>
          <span>Ethereum receipt</span>
        </div>
        <div className="crypto-receipt-actions">
          <button
            className="crypto-button"
            onClick={() => {
              void walkthrough();
            }}
          >
            Load walkthrough
          </button>
          <label className="crypto-file">
            Open receipt file
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 2000000) {
                  setMessage('Choose a receipt file smaller than 2 MB');
                  return;
                }
                void file
                  .text()
                  .then(async (text) => {
                    const parsed = await verifyBundle(JSON.parse(text));
                    setBundle(parsed);
                    setSample(parsed.manifest.source === 'synthetic-demo');
                    setProof(null);
                    setMessage('');
                  })
                  .catch(() => {
                    setMessage('Receipt file is invalid or has been altered');
                    setProof({ integrity: 'failed', status: 'not-checked' });
                  });
              }}
            />
          </label>
        </div>
        {bundle && (
          <div className="crypto-bundle">
            <span className={`crypto-badge ${sample ? 'crypto-sample' : ''}`}>
              {sample
                ? 'Synthetic walkthrough · invented inputs and rates'
                : 'Recorded neural run · paper execution'}
            </span>
            <dl>
              <div>
                <dt>Run</dt>
                <dd>{bundle.manifest.run_id}</dd>
              </div>
              <div>
                <dt>Batch</dt>
                <dd>
                  {bundle.manifest.first_sequence}–
                  {bundle.manifest.last_sequence} · {bundle.manifest.count}{' '}
                  decisions
                </dd>
              </div>
              <div>
                <dt>Fingerprint</dt>
                <dd title={bundle.digest}>{short(bundle.digest)}</dd>
              </div>
            </dl>
            <div className="crypto-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sequence</th>
                    <th>Pair</th>
                    <th>Decision</th>
                    <th>Fingerprint</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.receipts.slice(-12).map(({ record, hash }) => (
                    <tr key={record.sequence}>
                      <td>{record.sequence}</td>
                      <td>{record.symbol}</td>
                      <td>{record.action}</td>
                      <td>
                        <code>{short(hash)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="crypto-receipt-actions">
              <button
                className="crypto-button crypto-primary"
                disabled={busy}
                onClick={() => {
                  void verify();
                }}
              >
                <RefreshCw size={14} />
                {busy ? 'Checking…' : 'Verify receipts'}
              </button>
              <button
                className="crypto-button"
                onClick={() => download(bundle)}
              >
                <Download size={14} />
                Download batch
              </button>
              {sample && (
                <button
                  className="crypto-button"
                  onClick={() => {
                    const copy = structuredClone(bundle);
                    copy.receipts[0].record.action =
                      copy.receipts[0].record.action === 'BUY' ? 'SELL' : 'BUY';
                    setBundle(copy);
                    setProof(null);
                    setMessage(
                      'The first decision was altered in this copy. Verify it to see the mismatch.',
                    );
                  }}
                >
                  Alter a copy
                </button>
              )}
            </div>
            {proof && (
              <output
                className={`crypto-proof ${proof.integrity === 'failed' || proof.status === 'mismatch' ? 'crypto-proof-failed' : ''}`}
              >
                <strong>
                  {proof.integrity === 'matched'
                    ? 'Record fingerprints match.'
                    : 'Record fingerprints do not match.'}
                </strong>{' '}
                {proofLabels[proof.status] || proof.status}
                {proof.chain && (
                  <>
                    {' '}
                    · {proof.chain.name}
                    {proof.chain.explorer && (
                      <>
                        {' '}
                        ·{' '}
                        <a
                          href={`${proof.chain.explorer}/address/${proof.chain.contract}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View contract
                        </a>
                      </>
                    )}
                  </>
                )}
              </output>
            )}
          </div>
        )}
        {message && <output className="crypto-message">{message}</output>}
        <p className="crypto-caption">
          Records are checked on this device; only the batch manifest is sent
          for a blockchain check.{' '}
          {lab.chain
            ? `Network: ${lab.chain.name}.`
            : 'Public test-network publication requires a configured receipt contract.'}{' '}
          Local integrity checks also work before publication.
        </p>
      </section>
    </section>
  );
}
