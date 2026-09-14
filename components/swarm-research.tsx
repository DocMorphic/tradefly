'use client';
import { useEffect, useRef, useState } from 'react';
import { packHolders } from '@/lib/swarm/layout';
import { Download, Pause, Play, RefreshCw, Search } from 'lucide-react';
import type {
  SwarmSnapshot,
  Token,
  TokenResult,
  HolderResult,
} from '@/lib/swarm/types';
type Desk = { snapshot: SwarmSnapshot; revision: number };
const views = [
  'Radar',
  'Funding trace',
  'Holder map',
  'Signal desk',
  'Cohort memory',
  'Position plans',
  'Terminal',
] as const;
type View = (typeof views)[number];
const money = (v: unknown) =>
  v === null || v === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: Number(v) < 1 ? 6 : 2,
      }).format(Number(v));
const short = (s: string) =>
  s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
const clock = (s: string) => new Date(s).toLocaleTimeString();
export function SwarmResearch() {
  const [desk, setDesk] = useState<Desk | null>(null),
    [view, setView] = useState<View>('Radar'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [running, setRunning] = useState(false);
  const [tokens, setTokens] = useState<TokenResult | null>(null),
    [query, setQuery] = useState(''),
    [loading, setLoading] = useState(false),
    [marketError, setMarketError] = useState(''),
    [token, setToken] = useState<Token | null>(null),
    [holders, setHolders] = useState<HolderResult | null>(null),
    [holderLoading, setHolderLoading] = useState(false),
    [filter, setFilter] = useState('ALL'),
    [wallet, setWallet] = useState<string | null>(null);
  const [score, setScore] = useState(78),
    [size, setSize] = useState(250),
    [enabled, setEnabled] = useState(false);
  const [streamStatus, setStreamStatus] = useState('Connecting'),
    [holderAddress, setHolderAddress] = useState<string | null>(null);
  const configDirty = useRef(false);
  const sequence = useRef(0),
    latest = useRef(desk),
    pending = useRef(false);
  latest.current = desk;
  async function refresh() {
    try {
      const r = await fetch('/api/swarm');
      const d = (await r.json()) as Desk & { error?: string };
      if (!r.ok) throw new Error(d.error);
      if (latest.current && d.revision < latest.current.revision) return;
      latest.current = d;
      setDesk(d);
      configDirty.current = false;
      setScore(d.snapshot.config.minScore);
      setSize(d.snapshot.config.maxPosition);
      setEnabled(d.snapshot.config.enabled);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research unavailable');
    }
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!latest.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          revision: latest.current.revision,
          ...extra,
        }),
      });
      const d = (await r.json()) as Desk & { error?: string };
      if (!r.ok) {
        if (r.status === 409) await refresh();
        throw new Error(d.error);
      }
      if (!latest.current || d.revision >= latest.current.revision) {
        latest.current = d;
        setDesk(d);
      }
      if (action === 'config') configDirty.current = false;
      setError('');
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : 'Could not save research');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function loadTokens(q = '') {
    setLoading(true);
    setMarketError('');
    try {
      const r = await fetch('/api/swarm/market?q=' + encodeURIComponent(q));
      const d = (await r.json()) as TokenResult & { error?: string };
      if (!r.ok) throw new Error(d.error);
      setTokens(d);
    } catch (e) {
      setMarketError(
        e instanceof Error ? e.message : 'Token source unavailable',
      );
    } finally {
      setLoading(false);
    }
  }
  async function select(t: Token) {
    const request = ++sequence.current;
    setToken(t);
    setHolderAddress(null);
    setHolders(null);
    setHolderLoading(true);
    setMarketError('');
    try {
      const r = await fetch(
        '/api/swarm/market?kind=holders&address=' +
          encodeURIComponent(t.address),
      );
      const d = (await r.json()) as HolderResult & { error?: string };
      if (!r.ok) throw new Error(d.error);
      if (sequence.current === request) setHolders(d);
    } catch (e) {
      if (sequence.current === request)
        setMarketError(
          e instanceof Error ? e.message : 'Holder data unavailable',
        );
    } finally {
      if (sequence.current === request) setHolderLoading(false);
    }
    try {
      const r = await fetch(
        '/api/swarm/market?kind=detail&address=' +
          encodeURIComponent(t.address),
      );
      if (r.ok && sequence.current === request)
        setToken((await r.json()) as Token);
    } catch {
      /* Keep the selected token and explicitly absent fields. */
    }
  }
  useEffect(() => {
    void refresh();
    void loadTokens();
  }, []);
  useEffect(() => {
    let stream: EventSource | null = null;
    function connect() {
      stream?.close();
      stream = null;
      if (document.hidden) {
        setStreamStatus('Updates paused while hidden');
        return;
      }
      stream = new EventSource('/api/swarm/stream');
      stream.onmessage = (event) => {
        try {
          const next = JSON.parse(event.data) as Desk;
          if (!next.snapshot || !Number.isFinite(next.revision)) return;
          setStreamStatus('Shared updates connected');
          if (latest.current && next.revision <= latest.current.revision)
            return;
          latest.current = next;
          setDesk(next);
          if (!configDirty.current) {
            setScore(next.snapshot.config.minScore);
            setSize(next.snapshot.config.maxPosition);
            setEnabled(next.snapshot.config.enabled);
          }
        } catch {
          setStreamStatus('Invalid update; reconnecting');
        }
      };
      // This endpoint sends one snapshot then reconnects by design.
      stream.onerror = () => setStreamStatus('Reconnecting for next update');
    }
    connect();
    document.addEventListener('visibilitychange', connect);
    return () => {
      stream?.close();
      document.removeEventListener('visibilitychange', connect);
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (!document.hidden) void act('step');
    }, 2000);
    return () => clearInterval(timer);
  }, [running]);
  const s = desk?.snapshot,
    signal = s?.signals[0],
    selectedWallet =
      s?.hunters.find((h) => h.alias === wallet) || s?.hunters[0];
  function exportDesk() {
    if (!s) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              source: 'FlySwarm research adaptation',
              prototype: s,
              externalTokens: tokens,
              selectedToken: token,
              holderSample: holders,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tradefly-swarm-research.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  const list =
    holders?.items.filter((h) =>
      filter === 'ALL' || filter === 'CONTRACT'
        ? filter === 'ALL' || h.accountType === 'CONTRACT'
        : h.kind === filter,
    ) ?? [];
  return (
    <div className="swarm-desk">
      <header className="swarm-top">
        <div>
          <span className="swarm-eyebrow">RESEARCH / FLYSWARM</span>
          <h2>Follow the evidence.</h2>
        </div>
        <button onClick={exportDesk} disabled={!s}>
          <Download size={15} /> Export
        </button>
      </header>
      <div className="swarm-boundary">
        <b>Two data sources.</b> Token and holder reads can be external
        observations. Wallet funding paths, cohorts, scores and plan returns
        below are <strong>synthetic scenarios</strong>. This desk cannot place
        orders or control the stock-trading brain.
      </div>
      <nav className="swarm-tabs" aria-label="Research views">
        {views.map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </nav>
      <div className="swarm-control">
        <span>
          {streamStatus} · Scenario tick {s?.meta.tick ?? '—'} ·{' '}
          {s?.focusToken?.symbol || 'Rotating sample tokens'}
        </span>
        <div>
          <button disabled={!s} onClick={() => setRunning(!running)}>
            {running ? <Pause size={14} /> : <Play size={14} />}{' '}
            {running ? 'Pause scenario' : 'Run scenario'}
          </button>
          <button disabled={!s || busy} onClick={() => act('step')}>
            Step
          </button>
          <button
            disabled={!s || busy}
            onClick={() => {
              setRunning(false);
              void act('reset');
            }}
          >
            Reset scenario
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="swarm-alert">
          {error}
          <button onClick={refresh}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}
      {view === 'Radar' && (
        <section>
          <form
            className="swarm-search"
            onSubmit={(e) => {
              e.preventDefault();
              void loadTokens(query);
            }}
          >
            <Search size={16} />
            <input
              aria-label="Ticker or contract search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ticker or full 0x contract · Robinhood Chain"
              maxLength={100}
            />
            <button disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>
          <div className="swarm-source">
            {tokens?.mode || 'Connecting'} ·{' '}
            {tokens?.source || 'Reading public token sources'}
            {tokens?.updatedAt ? ` · ${clock(tokens.updatedAt)}` : ''}
          </div>
          {marketError && (
            <p role="alert" className="swarm-alert">
              {marketError}
            </p>
          )}
          {!!tokens?.error && (
            <p className="swarm-muted">
              The RPC source reported an issue. Check the source and freshness
              above; fallback results may come from DexScreener.
            </p>
          )}
          <div className="swarm-radar">
            <div className="swarm-token-list">
              {tokens?.items.map((t) => (
                <button
                  key={t.address}
                  className={token?.address === t.address ? 'selected' : ''}
                  onClick={() => select(t)}
                >
                  <b>{t.symbol}</b>
                  <span>{t.name}</span>
                  <small>
                    {t.protocol} · {t.phase}
                  </small>
                </button>
              ))}
              {!loading && !tokens?.items.length && (
                <p>
                  No matching external tokens returned. The synthetic research
                  scenario remains available in the other tabs.
                </p>
              )}
            </div>
            <div>
              {token ? (
                <>
                  <h3>
                    {token.symbol}{' '}
                    <span className="swarm-muted">{token.name}</span>
                  </h3>
                  <code className="swarm-address">{token.address}</code>
                  <div className="swarm-metrics">
                    <Metric label="Price" value={money(token.priceUsd)} />
                    <Metric
                      label="Liquidity"
                      value={money(token.liquidityUsd)}
                    />
                    <Metric label="24h volume" value={money(token.volume24h)} />
                    <Metric
                      label="24h change"
                      value={
                        token.priceChange24h == null
                          ? '—'
                          : `${token.priceChange24h}%`
                      }
                    />
                  </div>
                  <p>
                    {token.protocol} · {token.phase} ·{' '}
                    {token.blockNumber
                      ? `Launch block ${token.blockNumber}`
                      : 'Launch block unavailable'}
                  </p>
                  <p className="swarm-links">
                    <a
                      href={token.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Contract explorer
                    </a>
                    <button
                      onClick={() =>
                        void navigator.clipboard.writeText(token.address)
                      }
                    >
                      Copy address
                    </button>
                    <button onClick={() => setView('Holder map')}>
                      Inspect holders
                    </button>
                  </p>
                  <button
                    disabled={!s || busy}
                    onClick={() => {
                      void act('focus', {
                        symbol: token.symbol.slice(0, 18),
                        name: token.name.slice(0, 80),
                        liquidity: token.liquidityUsd ?? undefined,
                      });
                      setView('Funding trace');
                    }}
                  >
                    Use token label in synthetic scenario
                  </button>
                  <p className="swarm-muted">
                    This creates illustrative funding paths; it does not
                    establish that those wallets traded this token.
                  </p>
                </>
              ) : (
                <div className="swarm-empty">
                  <h3>Token radar</h3>
                  <p>
                    Select a token to inspect its market fields, launch details
                    and sampled holder activity.
                  </p>
                  <button onClick={() => setView('Funding trace')}>
                    Explore the synthetic funding scenario
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {view === 'Funding trace' && s && (
        <section>
          <Badge />
          <div className="swarm-section-title">
            <h3>Source → relay → token</h3>
            <span>
              {signal?.status || 'FORMING'} · {signal?.score ?? '—'}/100
            </span>
          </div>
          <FundingGraph
            state={s}
            selected={selectedWallet?.alias}
            onSelect={setWallet}
          />
          <div className="swarm-wallets">
            {s.hunters.map((h) => (
              <button
                key={h.alias}
                aria-pressed={selectedWallet?.alias === h.alias}
                onClick={() => setWallet(h.alias)}
              >
                {h.alias}
              </button>
            ))}
          </div>
          {selectedWallet && (
            <div className="swarm-dossier">
              <h3>{selectedWallet.alias} · synthetic dossier</h3>
              <code>{selectedWallet.address}</code>
              <div className="swarm-metrics">
                <Metric
                  label="Fixture win rate"
                  value={`${selectedWallet.winRate}%`}
                />
                <Metric
                  label="Fixture realized P&L"
                  value={`${selectedWallet.pnl}%`}
                />
                <Metric
                  label="Latest generated route"
                  value={
                    s.transfers.find((t) => t.alias === selectedWallet.alias)
                      ?.fresh || 'None'
                  }
                />
              </div>
            </div>
          )}
          {selectedWallet && (
            <div className="swarm-dossier">
              <h3>{selectedWallet.alias} · linked example history</h3>
              <p className="swarm-muted">
                Fixed prototype cohorts involving this wallet; not measured
                returns.
              </p>
              {s.memory
                .filter((c) => c.members.includes(selectedWallet.alias))
                .map((c) => (
                  <article key={c.members.join()}>
                    <b>{c.members.join(' · ')}</b>
                    <p>
                      {c.history
                        .map(
                          (h) =>
                            `${h.token}: ${h.result}× exit / ${h.peak}× peak`,
                        )
                        .join(' · ')}
                    </p>
                  </article>
                ))}
            </div>
          )}
          <TransferTape state={s} />
        </section>
      )}
      {view === 'Holder map' && (
        <section>
          <div className="swarm-section-title">
            <h3>{token?.symbol || 'Select a token'} · holder sample</h3>
            <span>{holders?.mode || 'NO DATA'}</span>
          </div>
          {holderLoading ? (
            <p>Reading balances and account activity…</p>
          ) : holders ? (
            <>
              <p
                className={
                  holders.mode === 'PROTOTYPE'
                    ? 'swarm-boundary'
                    : 'swarm-source'
                }
              >
                {holders.mode === 'PROTOTYPE'
                  ? 'Generated fallback holder map. These addresses and balances are not observations. '
                  : ''}
                {holders.coverage}
              </p>
              <p className="swarm-muted">
                {holders.heuristic}. Activity is not wallet age or evidence of
                common control. The sample is not the complete holder registry.
              </p>
              <div className="swarm-wallets">
                {['ALL', 'NEW', 'WARM', 'ESTABLISHED', 'CONTRACT'].map((f) => (
                  <button
                    key={f}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <HolderBubbles
                holders={list}
                selected={holderAddress}
                onSelect={setHolderAddress}
              />
              {holders.items
                .filter((h) => h.address === holderAddress)
                .map((h) => (
                  <article className="swarm-dossier" key={h.address}>
                    <h3>Selected holder</h3>
                    <p className="swarm-address">{h.address}</p>
                    <div className="swarm-metrics">
                      <Metric
                        label="Supply share"
                        value={`${h.percentage.toFixed(3)}%`}
                      />
                      <Metric
                        label="Reported balance"
                        value={h.balance.toLocaleString()}
                      />
                      <Metric
                        label="Outgoing transactions"
                        value={String(h.nonce)}
                      />
                      <Metric
                        label="Activity / account"
                        value={`${h.kind} / ${h.accountType}`}
                      />
                    </div>
                    <a href={h.explorerUrl} target="_blank" rel="noreferrer">
                      View source in explorer ↗
                    </a>
                    <p className="swarm-muted">
                      {holders.mode} · {holders.coverage}. Bubble placement
                      shows no inferred wallet connection.
                    </p>
                  </article>
                ))}
              <div className="swarm-table">
                <table>
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Activity</th>
                      <th>Account</th>
                      <th>Outgoing tx</th>
                      <th>Supply share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((h) => (
                      <tr key={h.address}>
                        <td>
                          <a
                            href={h.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(h.address)}
                          </a>
                        </td>
                        <td>{h.kind}</td>
                        <td>{h.accountType}</td>
                        <td>{h.nonce}</td>
                        <td>{h.percentage.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="swarm-empty">
              <p>
                {marketError ||
                  'Choose a contract in Token radar to inspect its holders.'}
              </p>
              <button onClick={() => setView('Radar')}>Open radar</button>
            </div>
          )}
        </section>
      )}
      {view === 'Signal desk' && s && (
        <section>
          <Badge />
          <div className="swarm-metrics">
            <Metric
              label="Latest classification"
              value={signal?.status || 'FORMING'}
            />
            <Metric
              label="Rule score"
              value={signal ? `${signal.score}/100` : '—'}
            />
            <Metric
              label="Generated wallet group"
              value={String(signal?.cohortSize ?? 0)}
            />
            <Metric label="Token scenario" value={signal?.token || '—'} />
          </div>
          <p className="swarm-muted">
            44% familiar-cohort overlap + 28% arrival timing + 18% liquidity +
            up to 10 points for group size. Below 70: NOISE. 70–83: WATCH. 84+:
            FIRE. The score is not a probability of profit.
          </p>
          {signal && (
            <ul className="swarm-evidence">
              {signal.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="swarm-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Group</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {s.signals.map((sig) => (
                  <tr key={sig.id}>
                    <td>{clock(sig.at)}</td>
                    <td>{sig.token}</td>
                    <td>{sig.status}</td>
                    <td>{sig.score}</td>
                    <td>{sig.wallets.join(', ')}</td>
                    <td>
                      <details>
                        <summary>Inspect</summary>
                        <pre>{JSON.stringify(sig, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {view === 'Cohort memory' && s && (
        <section>
          <Badge />
          <h3>Remembered formations</h3>
          <p className="swarm-muted">
            These are FlySwarm&apos;s fixed example cohorts and outcomes. No
            wallet-profitability indexer or learning process has populated them.
          </p>
          <div className="swarm-cohorts">
            {s.memory.map((c) => (
              <article key={c.members.join()}>
                <h3>{c.members.join(' · ')}</h3>
                <div className="swarm-metrics">
                  <Metric label="Fixture runs" value={String(c.runs)} />
                  <Metric label="Fixture hit rate" value={`${c.hitRate}%`} />
                  <Metric
                    label="Fixture median return"
                    value={`${c.medianReturn}×`}
                  />
                </div>
                <div className="swarm-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Prior token</th>
                        <th>Example age</th>
                        <th>Exit</th>
                        <th>Peak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.history.map((h) => (
                        <tr key={h.token}>
                          <td>{h.token}</td>
                          <td>{h.age}</td>
                          <td>{h.result}×</td>
                          <td>{h.peak}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {view === 'Position plans' && s && (
        <section>
          <Badge />
          <h3>Autosnipe scenario</h3>
          <p>
            Configure generated position plans. No wallet is connected and no
            transaction is broadcast. These settings never change Alpaca or the
            fly decoder.
          </p>
          <form
            className="swarm-plan"
            onSubmit={(e) => {
              e.preventDefault();
              void act('config', {
                enabled,
                minScore: score,
                maxPosition: size,
              });
            }}
          >
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  configDirty.current = true;
                  setEnabled(e.target.checked);
                }}
              />{' '}
              Enable simulated entries
            </label>
            <label>
              Minimum rule score
              <input
                type="number"
                min={55}
                max={99}
                required
                value={score}
                onChange={(e) => {
                  configDirty.current = true;
                  setScore(Number(e.target.value));
                }}
              />
            </label>
            <label>
              Simulated size · USD
              <input
                type="number"
                min={10}
                max={5000}
                required
                value={size}
                onChange={(e) => {
                  configDirty.current = true;
                  setSize(Number(e.target.value));
                }}
              />
            </label>
            <button disabled={busy}>Save scenario settings</button>
          </form>
          <div className="swarm-metrics">
            <Metric
              label="Saved state"
              value={s.config.enabled ? 'Enabled' : 'Disarmed'}
            />
            <Metric
              label="Saved minimum score"
              value={String(s.config.minScore)}
            />
            <Metric label="Generated plan P&L" value={money(s.pulse.planPnl)} />
          </div>
          <div className="swarm-table">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Size</th>
                  <th>Entry index</th>
                  <th>Generated mark</th>
                  <th>Synthetic P&L</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {s.positions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.token}</td>
                    <td>{money(p.size)}</td>
                    <td>{p.entry.toFixed(3)}</td>
                    <td>{p.mark.toFixed(3)}</td>
                    <td>{money(p.pnl)}</td>
                    <td>{p.signalId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!s.positions.length && (
            <p>
              No generated positions. Enable simulated entries and run the
              scenario to exercise the threshold.
            </p>
          )}
        </section>
      )}
      {view === 'Terminal' && s && (
        <section className="swarm-terminal">
          <Badge />
          <p>RESEARCH EVENT TAPE / TICK {s.meta.tick} / NO BROKER WRITES</p>
          {s.transfers.map((t) => (
            <div key={t.id}>
              <time>{clock(t.at)}</time>
              <span>
                {t.alias} → {t.fresh} → {t.token}
              </span>
              <b>{money(t.amount)}</b>
            </div>
          ))}
          {s.signals.slice(0, 4).map((sig) => (
            <p key={sig.id}>
              {sig.status} {sig.score}/100 · {sig.token} ·{' '}
              {sig.evidence.join(' / ')}
            </p>
          ))}
        </section>
      )}
      <footer className="swarm-credit">
        Adapted from{' '}
        <a
          href="https://github.com/semkazz1/FlySwarm"
          target="_blank"
          rel="noreferrer"
        >
          FlySwarm
        </a>{' '}
        ·{' '}
        <a href="/flyswarm-license.txt" target="_blank" rel="noreferrer">
          MIT © 2026 Gyomei
        </a>
        . Research state is saved on your private site. Scenario playback pauses
        when this window is closed.
      </footer>
    </div>
  );
}
function Badge() {
  return (
    <p className="swarm-prototype">
      SYNTHETIC SCENARIO · GENERATED WALLET DATA AND OUTCOMES
    </p>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
function TransferTape({ state: s }: { state: SwarmSnapshot }) {
  return (
    <div className="swarm-table">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Source</th>
            <th>Fresh address</th>
            <th>Route</th>
            <th>Generated amount</th>
          </tr>
        </thead>
        <tbody>
          {s.transfers.map((t) => (
            <tr key={t.id}>
              <td>{clock(t.at)}</td>
              <td>{t.alias}</td>
              <td>{t.fresh}</td>
              <td>
                {t.hop > 1 ? 'Relay' : 'Direct'} → {t.token}
              </td>
              <td>{money(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function FundingGraph({
  state: s,
  selected,
  onSelect,
}: {
  state: SwarmSnapshot;
  selected?: string;
  onSelect: (alias: string) => void;
}) {
  const nodes = s.network.nodes,
    groups = ['hunter', 'fresh', 'token'];
  const positions = new Map(
    nodes.map((n) => {
      const group = nodes.filter((x) => x.type === n.type),
        i = group.indexOf(n);
      return [
        n.id,
        {
          x: 70 + groups.indexOf(n.type) * 290,
          y: 50 + ((i + 0.5) * 260) / Math.max(group.length, 1),
        },
      ];
    }),
  );
  return (
    <figure className="swarm-graph">
      <figcaption>
        Synthetic funding graph · sources, relay addresses and token convergence
      </figcaption>
      <svg
        viewBox="0 0 740 350"
        role="group"
        aria-label="Generated wallet funding routes"
      >
        <text x="70" y="25">
          Sources
        </text>
        <text x="360" y="25">
          Relays
        </text>
        <text x="650" y="25">
          Token
        </text>
        {s.network.edges.map((e, i) => {
          const a = positions.get(e.from),
            b = positions.get(e.to);
          return a && b ? (
            <path
              key={i}
              d={`M${a.x} ${a.y} C${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`}
              className={e.pulse ? 'pulse' : ''}
            />
          ) : null;
        })}
        {nodes.map((n) => {
          const p = positions.get(n.id)!;
          return (
            <g
              key={n.id}
              role={n.type === 'hunter' ? 'button' : undefined}
              tabIndex={n.type === 'hunter' ? 0 : undefined}
              aria-label={
                n.type === 'hunter' ? `Inspect ${n.label}` : undefined
              }
              className={
                selected === n.id ? 'swarm-node selected' : 'swarm-node'
              }
              onClick={() => {
                if (n.type === 'hunter') onSelect(n.id);
              }}
              onKeyDown={(e) => {
                if (
                  n.type === 'hunter' &&
                  (e.key === 'Enter' || e.key === ' ')
                ) {
                  e.preventDefault();
                  onSelect(n.id);
                }
              }}
            >
              <circle cx={p.x} cy={p.y} r={n.type === 'token' ? 18 : 7} />
              <text x={p.x} y={p.y + 27} textAnchor="middle">
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
function HolderBubbles({
  holders,
  selected,
  onSelect,
}: {
  holders: HolderResult['items'];
  selected: string | null;
  onSelect: (address: string) => void;
}) {
  const points = packHolders(holders.map((h) => h.percentage));
  return (
    <figure className="swarm-bubbles">
      <figcaption>
        Sampled supply share · select a bubble · placement does not imply
        connections
      </figcaption>
      <svg
        viewBox="0 0 740 370"
        role="group"
        aria-label="Holder balances shown as labeled bubbles"
      >
        {holders.slice(0, 28).map((h, i) => {
          const { x, y, r } = points[i];
          return (
            <g
              key={h.address}
              role="button"
              tabIndex={0}
              aria-label={`Inspect holder ${i + 1}, ${h.percentage.toFixed(2)} percent`}
              className={
                selected === h.address ? 'swarm-node selected' : 'swarm-node'
              }
              onClick={() => onSelect(h.address)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(h.address);
                }
              }}
            >
              <title>
                {h.address}: {h.percentage.toFixed(2)}%, {h.kind},{' '}
                {h.accountType}
              </title>
              <circle
                cx={x}
                cy={y}
                r={r}
                className={h.kind === 'NEW' ? 'new-holder' : ''}
              />
              <text x={x} y={y + 4} textAnchor="middle">
                #{i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
