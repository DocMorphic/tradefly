'use client';
import { useEffect, useState } from 'react';
import { Download, Pause, Play, RefreshCw } from 'lucide-react';
import { HoldingsTable } from './holdings-table';
import { useChartCursor } from './chart-cursor';
import type {
  BackendResponse,
  BackendSnapshot,
  PaperDecision,
} from '@/lib/backend';

const numeric = (v: unknown) =>
  v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
    ? Number(v)
    : null;
function usd(v: unknown) {
  const n = numeric(v);
  return n === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(n);
}
function count(v: unknown) {
  const n = numeric(v);
  return n === null
    ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
}
function time(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.valueOf())
    ? '—'
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
}
function exportData(snapshot: BackendSnapshot) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
  );
  a.href = url;
  a.download = 'tradefly-paper-snapshot.json';
  a.click();
  URL.revokeObjectURL(url);
}
export function useBackend() {
  const [data, setData] = useState<BackendResponse>({ snapshot: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const r = await fetch('/api/backend', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!r.ok)
          throw new Error(
            r.status === 401
              ? 'Sign in to view your paper backend'
              : 'Backend connection is being configured',
          );
        setData(await r.json());
        setError('');
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Connection unavailable');
      } finally {
        if (!controller.signal.aborted) {
          setNow(Date.now());
          timer = setTimeout(refresh, 5000);
        }
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  async function command(
    value: 'pause' | 'resume' | 'watchlist',
    symbols?: string[],
  ) {
    setBusy(true);
    try {
      const r = await fetch('/api/backend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: value, symbols }),
      });
      const result = (await r.json()) as {
        error?: string;
        command_id?: string;
      };
      if (!r.ok) throw new Error(result.error || 'Command failed');
      setData((old) => ({
        ...old,
        command: value,
        command_id: result.command_id,
      }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed');
    } finally {
      setBusy(false);
    }
  }
  const stale = !data.received_at || now - Date.parse(data.received_at) > 45000;
  return { data, error, busy, stale, command };
}
export type PaperBackend = ReturnType<typeof useBackend>;
function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="paper-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="paper-empty">{children}</div>;
}
function Raw({
  value,
  label = 'Raw record',
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <details className="paper-raw">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function Decision({ d }: { d: PaperDecision }) {
  return (
    <div className="paper-decision">
      <div className="paper-title">
        <h3>
          {d.symbol} {d.action} <span>· {time(d.bar.t)}</span>
        </h3>
        <span>{d.feed.toUpperCase()} · completed bar</span>
      </div>
      <div className="paper-stats">
        <Stat
          label="BUY pool"
          value={`${count(d.neural.buy_hz)} Hz`}
          note="MN9 · 1 neuron"
        />
        <Stat
          label="SELL pool"
          value={`${count(d.neural.sell_hz)} Hz`}
          note="DN1 / DN2 · mean per neuron"
        />
        <Stat
          label="Winning lead"
          value={`${count(Math.abs(d.neural.buy_hz - d.neural.sell_hz))} Hz`}
          note="Requires ≥ 8 Hz and winner ≥ 20 Hz"
        />
        <Stat
          label="Decision time"
          value={`${count(d.neural.wall_seconds)} s`}
          note={`${d.neural.window_ms} ms neural window`}
        />
      </div>
      <p className="paper-reason">
        {d.reason}. The BUY/SELL labels are assigned by this experiment.
      </p>
      <div className="paper-two">
        <section>
          <h4>Observed market</h4>
          <dl>
            <dt>Open / close</dt>
            <dd>
              {usd(d.bar.o)} / {usd(d.bar.c)}
            </dd>
            <dt>Low / high</dt>
            <dd>
              {usd(d.bar.l)} / {usd(d.bar.h)}
            </dd>
            <dt>IEX volume</dt>
            <dd>{count(d.bar.v)} shares</dd>
            <dt>Account equity</dt>
            <dd>{usd(d.account.equity)}</dd>
            <dt>Cash</dt>
            <dd>{usd(d.account.cash)}</dd>
            <dt>Shares held</dt>
            <dd>{count(d.position.qty ?? 0)}</dd>
          </dl>
        </section>
        <section>
          <h4>Sensory input</h4>
          <dl>
            {Object.entries(d.stimulus_hz).map(([name, hz]) => (
              <div className="paper-dl-row" key={name}>
                <dt>{name.replaceAll('_', ' ')}</dt>
                <dd>{count(hz)} Hz</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <h4>Measured neural activity</h4>
      <div className="paper-stats">
        <Stat label="Window spikes" value={count(d.neural.spikes)} />
        <Stat
          label="Active neurons"
          value={count(d.neural.active_neurons)}
          note="During final readout window"
        />
        <Stat
          label="Neural time"
          value={`${count(d.neural.neural_time_ms)} ms`}
        />
        <Stat label="Readout window" value={`${d.neural.readout_ms} ms`} />
      </div>
      <div className="paper-table">
        <table>
          <thead>
            <tr>
              <th>Readout</th>
              <th>FlyWire neuron ID</th>
              <th>Spikes</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(d.neural.output_neurons).flatMap(
              ([pool, neurons]) =>
                neurons.map((n) => (
                  <tr key={n.id}>
                    <td>{pool.toUpperCase()}</td>
                    <td>
                      <code>{n.id}</code>
                    </td>
                    <td>{n.spikes}</td>
                    <td>{count(n.hz)} Hz</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </div>
      <Raw
        value={d}
        label="Complete decision, neural state ID and input record"
      />
    </div>
  );
}
function EquityHistory({ s }: { s: BackendSnapshot }) {
  const samples = s.equity_history ?? [];
  const cursor = useChartCursor(samples.length, 730, 70, 630);
  if (samples.length < 2) return null;
  const values = samples.map((p) => Number(p.equity));
  const lo = Math.min(...values),
    hi = Math.max(...values),
    pad = Math.max((hi - lo) * 0.1, 1);
  const points = values
    .map(
      (v, i) =>
        `${70 + (i / (values.length - 1)) * 630},${130 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 110}`,
    )
    .join(' ');
  return (
    <figure className="paper-equity">
      <figcaption>
        Observed account equity · USD · latest {samples.length} samples
      </figcaption>
      <svg
        {...cursor.props}
        viewBox="0 0 730 170"
        aria-label={`Account equity from ${usd(values[0])} to ${usd(values.at(-1))}. Hover, tap, or use arrow keys to inspect.`}
      >
        <text x="0" y="25">
          {usd(hi + pad)}
        </text>
        <text x="0" y="130">
          {usd(lo - pad)}
        </text>
        <path d="M70 20H700M70 130H700" stroke="#d8d1e0" />
        <polyline
          points={points}
          fill="none"
          stroke="#6b5a9a"
          strokeWidth="2"
        />
        {cursor.index !== null && (
          <g>
            <line
              x1={70 + (cursor.index / (values.length - 1)) * 630}
              x2={70 + (cursor.index / (values.length - 1)) * 630}
              y1="20"
              y2="130"
              className="crosshair"
            />
            <circle
              cx={70 + (cursor.index / (values.length - 1)) * 630}
              cy={
                130 -
                ((values[cursor.index] - lo + pad) / (hi - lo + 2 * pad)) * 110
              }
              r="4"
              fill="#6b5a9a"
            />
          </g>
        )}
        <text x="70" y="158">
          {time(samples[0].at)}
        </text>
        <text x="700" y="158" textAnchor="end">
          {time(samples.at(-1)?.at)}
        </text>
      </svg>
      <div className="graph-hover-readout" aria-live="polite">
        {cursor.index === null ? (
          'Hover or tap to inspect account equity'
        ) : (
          <>
            <b>{time(samples[cursor.index].at)}</b>
            <span>Equity {usd(samples[cursor.index].equity)}</span>
            <span>Cash {usd(samples[cursor.index].cash)}</span>
            <span>
              Change from first sample{' '}
              {usd(Number(samples[cursor.index].equity) - values[0])}
            </span>
          </>
        )}
      </div>
    </figure>
  );
}
function MarketUniverse({ backend }: { backend: PaperBackend }) {
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const u = backend.data.snapshot?.universe;
  if (!u) return <p>Waiting for the full market inventory from the worker.</p>;
  const symbols = u.symbols.filter((symbol) =>
    symbol.toLowerCase().includes(query.toLowerCase()),
  );
  const visible = symbols.slice(page * 50, (page + 1) * 50);
  const label = (status: string) =>
    ({
      BUY: 'Neural BUY',
      SELL: 'Neural SELL',
      HOLD: 'Neural HOLD',
      data_gap: 'IEX data unavailable',
      already_seen: 'Current bar already seen',
      unseen: 'Not visited yet',
    })[status] ?? status;
  return (
    <section className="paper-watchlist">
      <div className="paper-title">
        <h3>The whole available market</h3>
        <span>{count(u.total)} symbols</span>
      </div>
      <p>{u.scope}</p>
      <div className="paper-stats">
        <Stat
          label="Not visited yet"
          value={count(u.unseen)}
          note="Available does not mean evaluated"
        />
        <Stat
          label="Latest visit: data gap"
          value={count(u.counts.data_gap ?? 0)}
          note="No neural decision on missing inputs"
        />
        <Stat
          label="Neural evaluations"
          value={count(u.session_evaluated)}
          note="Current worker session"
        />
        <Stat
          label="Whole-share symbols"
          value={count(u.total - u.fractionable)}
          note="Order budget still applies"
        />
      </div>
      <p className="paper-reason">
        One shared brain sees stocks continuously. HOLD passes; BUY or SELL
        produces an intent on the presented stock. The viewing order is fixed
        without price rankings. Five minutes describes each input bar, not a
        wait between stocks. Processing speed and data availability limit
        coverage.
      </p>
      <label className="paper-select">
        Find any available symbol
        <input
          aria-label="Search the market universe"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search symbols"
        />
      </label>
      <div className="paper-table">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Latest coverage</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((symbol) => (
              <tr key={symbol}>
                <td>{symbol}</td>
                <td>{label(u.statuses[symbol] ?? 'unseen')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="paper-actions">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          {symbols.length ? page * 50 + 1 : 0}–
          {Math.min((page + 1) * 50, symbols.length)} of {count(symbols.length)}
        </span>
        <button
          disabled={(page + 1) * 50 >= symbols.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      <small>
        Inventory refreshed {time(u.updated_at)}. Coverage means observed
        inputs, not a prediction or proof of profitability. All records remain
        in the local ledger; Export includes the received inventory.
      </small>
    </section>
  );
}
export function PaperView({
  id,
  backend,
  onTrace,
}: {
  id: string;
  backend: PaperBackend;
  onTrace?: (id: string) => void;
}) {
  const { data, error, stale, busy, command } = backend,
    s = data.snapshot;
  const [selected, setSelected] = useState<string | null>(null);
  const decision =
    s?.decisions.find((d) => d.id === selected) ?? s?.decisions.at(-1);
  return (
    <div className="paper-view">
      <div className="paper-toolbar">
        <div>
          <span className={`paper-indicator ${stale ? 'offline' : ''}`} />
          <b>
            {!s
              ? 'Awaiting backend'
              : stale
                ? 'Backend offline'
                : s.paused
                  ? 'Paper · paused'
                  : 'Paper · running'}
          </b>
          <small>
            {data.received_at
              ? `Last received ${time(data.received_at)}`
              : 'Your demo is available from the menu'}
          </small>
        </div>
        <div className="paper-actions">
          {s && (
            <button
              onClick={() => exportData(s)}
              title="Export received snapshot"
            >
              <Download size={15} />
              Export
            </button>
          )}
          <button
            disabled={
              busy || !s || stale || (!s.paused && data.command === 'pause')
            }
            onClick={() => command('pause')}
          >
            <Pause size={15} />
            Pause
          </button>
          <button
            disabled={
              busy ||
              stale ||
              !s?.brain.ready ||
              !s?.broker.connected ||
              !s?.paused
            }
            onClick={() => command('resume')}
          >
            <Play size={15} />
            Resume
          </button>
        </div>
      </div>
      {error && (
        <p className="paper-alert" role="alert">
          {error}
        </p>
      )}
      {s &&
        data.command_id !== s.last_command_id &&
        data.command === 'pause' &&
        !s.paused && (
          <p className="paper-alert">
            Pause requested. Waiting for the backend to acknowledge.
          </p>
        )}
      {s &&
        data.command_id !== s.last_command_id &&
        data.command === 'resume' &&
        s.paused && (
          <p className="paper-alert">
            Resume requested. The backend will check readiness before starting.
          </p>
        )}
      {!s ? (
        <Empty>
          <RefreshCw size={24} />
          <h3>Connect your local worker</h3>
          <p>
            The brain runs on your Mac. Once the worker connects, your paper
            account, measured neural decisions, and orders appear here.
          </p>
        </Empty>
      ) : (
        <>
          {stale && (
            <p className="paper-alert">
              These are saved readings. The backend has not checked in recently.
            </p>
          )}
          {id === 'overview' && (
            <>
              <div className="paper-title">
                <h2>Paper account</h2>
                <span>
                  {s.universe?.total ?? s.watchlist?.length ?? 0} symbols ·{' '}
                  {s.feed.toUpperCase()} · USD
                </span>
              </div>
              <div className="paper-stats">
                <Stat
                  label="Account equity"
                  value={usd(s.account.equity)}
                  note="Reported by Alpaca"
                />
                <Stat
                  label="Equity change"
                  value={usd(s.equity_change_usd)}
                  note={`Since ${time(s.baseline?.at)}`}
                />
                <Stat
                  label="Cash"
                  value={usd(s.account.cash)}
                  note="Sizing uses cash, not margin buying power"
                />
                <Stat
                  label="Position value"
                  value={
                    s.broker.connected
                      ? usd(
                          s.positions.reduce(
                            (sum, p) => sum + Number(p.market_value),
                            0,
                          ),
                        )
                      : '—'
                  }
                  note={`${s.positions.length} open positions`}
                />
              </div>
              <div className="paper-status-line">
                <span>
                  Brain{' '}
                  <b>
                    {s.brain.loaded
                      ? s.brain.ready
                        ? 'validated & loaded'
                        : 'not validated'
                      : 'not loaded'}
                  </b>
                </span>
                <span>
                  Market <b>{s.market.is_open ? 'open' : 'closed'}</b>
                </span>
                <span>
                  Decisions <b>{count(s.decision_count)}</b>
                </span>
                <span>
                  Order cap <b>$100</b>
                </span>
              </div>
              <p className="paper-reason">{s.message}</p>
              {!!s.blockers.length && (
                <details className="paper-blockers" open>
                  <summary>
                    {s.blockers.length} readiness checks need attention
                  </summary>
                  <ul>
                    {s.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="paper-reason">
                Next stock: <b>{s.next_symbol ?? s.symbol}</b> · All{' '}
                {count(s.universe?.total)} available US equity symbols. Inspect
                coverage in Data &amp; definitions.
              </p>
              <HoldingsTable snapshot={s} />
              <h3>Latest decision</h3>
              {decision ? (
                <>
                  <button
                    className="evidence-link"
                    onClick={() => onTrace?.(decision.id)}
                  >
                    Follow this decision ↗
                  </button>
                  <Decision d={decision} />
                </>
              ) : (
                <Empty>
                  No measured market decisions yet. Nothing in this view is
                  taken from the demo.
                </Empty>
              )}
            </>
          )}
          {id === 'brain' && (
            <>
              <div className="paper-title">
                <h2>Decision inspector</h2>
                <span>{count(s.decision_count)} recorded</span>
              </div>
              {s.decisions.length > 0 && (
                <label className="paper-select">
                  Decision
                  <select
                    value={decision?.id ?? ''}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {s.decisions.map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.symbol || s.symbol} · {time(d.bar.t)} · {d.action}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {decision ? (
                <>
                  <button
                    className="evidence-link"
                    onClick={() => onTrace?.(decision.id)}
                  >
                    Follow this decision ↗
                  </button>
                  <Decision d={decision} />
                </>
              ) : (
                <Empty>
                  Waiting for the first completed market bar processed by the
                  brain.
                </Empty>
              )}
              {s.brain.manifest && (
                <>
                  <h3>Complete connected graph</h3>
                  <div className="paper-stats">
                    <Stat
                      label="Neurons"
                      value={count(s.brain.manifest.neuron_count)}
                    />
                    <Stat
                      label="Neuron-pair edges"
                      value={count(s.brain.manifest.neuron_pair_edges)}
                    />
                    <Stat
                      label="Synapse count"
                      value={count(s.brain.manifest.synapse_count)}
                    />
                    <Stat label="Dataset" value="Female v783" />
                  </div>
                  <div className="paper-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Market channel</th>
                          <th>Stimulated population</th>
                          <th>Neurons</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(s.brain.manifest.inputs).map(
                          ([k, ids]) => (
                            <tr key={k}>
                              <td>{k.replaceAll('_', ' ')}</td>
                              <td>{s.brain.manifest?.input_types[k]}</td>
                              <td>{ids.length}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Raw
                    value={s.brain.manifest}
                    label="All neuron IDs, source pin and frozen parameters"
                  />
                </>
              )}
            </>
          )}
          {id === 'ledger' && (
            <>
              <div className="paper-title">
                <h2>Paper order ledger</h2>
                <span>Broker outcomes · {s.orders.length} loaded</span>
              </div>
              <div className="paper-table">
                <table>
                  <thead>
                    <tr>
                      <th>Submitted</th>
                      <th>Side</th>
                      <th>Status</th>
                      <th>Requested</th>
                      <th>Filled shares</th>
                      <th>Average fill</th>
                      <th>Fill value</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.orders.map((o) => (
                      <tr key={o.client_id}>
                        <td>{time(o.broker?.submitted_at)}</td>
                        <td>{String(o.payload.side).toUpperCase()}</td>
                        <td>{o.status}</td>
                        <td>
                          {o.payload.notional
                            ? usd(o.payload.notional)
                            : `${count(o.payload.qty)} shares`}
                        </td>
                        <td>{count(o.broker?.filled_qty)}</td>
                        <td>{usd(o.broker?.filled_avg_price)}</td>
                        <td>
                          {o.broker?.filled_avg_price
                            ? usd(
                                Number(o.broker.filled_qty) *
                                  Number(o.broker.filled_avg_price),
                              )
                            : '—'}
                        </td>
                        <td>
                          <button
                            className="evidence-link"
                            onClick={() => onTrace?.(o.decision_id)}
                          >
                            Trace ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!s.orders.length && <Empty>No paper orders submitted.</Empty>}
              </div>
              <h3>Decision trail</h3>
              <div className="paper-table">
                <table>
                  <thead>
                    <tr>
                      <th>Bar</th>
                      <th>Action</th>
                      <th>BUY Hz</th>
                      <th>SELL Hz</th>
                      <th>Close</th>
                      <th>Order outcome</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.decisions.map((d) => (
                      <tr key={d.id}>
                        <td>{time(d.bar.t)}</td>
                        <td>
                          {d.symbol || s.symbol} · {d.action}
                        </td>
                        <td>{count(d.neural.buy_hz)}</td>
                        <td>{count(d.neural.sell_hz)}</td>
                        <td>{usd(d.bar.c)}</td>
                        <td>
                          {s.orders.find((o) => o.decision_id === d.id)
                            ?.status ??
                            (d.action === 'HOLD'
                              ? 'No order'
                              : 'No submission · see events')}
                        </td>
                        <td>
                          <button
                            className="evidence-link"
                            onClick={() => onTrace?.(d.id)}
                          >
                            Replay ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Raw
                value={s.orders}
                label="Order IDs, requests and actual broker records"
              />
              <h3>Execution events</h3>
              {s.events.map((e) => (
                <details className="paper-event" key={e.id}>
                  <summary>
                    <span>{time(e.at)}</span> {e.kind.replaceAll('_', ' ')}
                  </summary>
                  <pre>{JSON.stringify(e.data, null, 2)}</pre>
                </details>
              ))}
            </>
          )}
          {id === 'analysis' && (
            <>
              <div className="paper-title">
                <h2>Measured performance</h2>
                <span>Alpaca paper account</span>
              </div>
              <div className="paper-stats">
                <Stat
                  label="Equity change"
                  value={usd(s.equity_change_usd)}
                  note="Current broker equity minus first observed equity"
                />
                <Stat
                  label="Observed return"
                  value={
                    s.baseline && s.equity_change_usd !== null
                      ? `${count((s.equity_change_usd / Number(s.baseline.equity)) * 100)}%`
                      : '—'
                  }
                />
                <Stat label="Decisions" value={count(s.decision_count)} />
                <Stat
                  label="Filled orders"
                  value={count(
                    s.orders.filter((o) => o.status === 'filled').length,
                  )}
                  note="Within loaded order records"
                />
              </div>
              <div className="paper-two">
                <section>
                  <h3>What this measures</h3>
                  <dl>
                    <dt>Max observed drawdown</dt>
                    <dd>{count(s.max_observed_drawdown_pct)}%</dd>
                    <dt>Equity samples</dt>
                    <dd>{count(s.equity_sample_count)}</dd>
                    <dt>Starting observation</dt>
                    <dd>{time(s.baseline?.at)}</dd>
                    <dt>Starting equity</dt>
                    <dd>{usd(s.baseline?.equity)}</dd>
                    <dt>Open-position P&amp;L</dt>
                    <dd>
                      {s.broker.connected
                        ? usd(
                            s.positions.reduce(
                              (sum, p) => sum + Number(p.unrealized_pl),
                              0,
                            ),
                          )
                        : '—'}
                    </dd>
                    <dt>Fees</dt>
                    <dd>Not reported by this endpoint</dd>
                    <dt>Slippage</dt>
                    <dd>Not yet measured against quotes</dd>
                    <dt>Held-out strategy results</dt>
                    <dd>Not yet measured</dd>
                    <dt>Matched controls</dt>
                    <dd>Not yet run on real data</dd>
                  </dl>
                </section>
                <section>
                  <h3>Brain benchmark</h3>
                  {s.brain.validation ? (
                    <dl>
                      <dt>Response / ablation check</dt>
                      <dd>{s.brain.validation.passed ? 'Passed' : 'Failed'}</dd>
                      <dt>Sugar → BUY readout</dt>
                      <dd>{count(s.brain.validation.sugar.buy_hz)} Hz</dd>
                      <dt>Mechanosensory → SELL</dt>
                      <dd>{count(s.brain.validation.jon.sell_hz)} Hz</dd>
                      <dt>Edges disabled → BUY / SELL</dt>
                      <dd>
                        {count(s.brain.validation.ablated.buy_hz)} /{' '}
                        {count(s.brain.validation.ablated.sell_hz)} Hz
                      </dd>
                      <dt>Peak memory</dt>
                      <dd>{count(s.brain.validation.peak_rss_gib)} GiB</dd>
                    </dl>
                  ) : (
                    <p>No benchmark report received.</p>
                  )}
                </section>
              </div>
              <p className="paper-reason">
                Account changes can include deposits or manual activity. Use a
                dedicated paper account. The neural benchmark is an engineering
                check, not a replication of all published results or evidence of
                trading skill.
              </p>
              <Raw
                value={s.brain.validation}
                label="Complete benchmark report"
              />
              <EquityHistory s={s} />
              {s.pilot_replay && (
                <section>
                  <h3>Historical integration pilot · {s.pilot_replay.date}</h3>
                  <div className="paper-stats">
                    <Stat
                      label="Real market bars"
                      value={count(s.pilot_replay.frames.length)}
                    />
                    <Stat
                      label="Local simulated fills"
                      value={count(s.pilot_replay.fills.length)}
                    />
                    <Stat
                      label="Pilot P&L"
                      value={usd(s.pilot_replay.net_pnl)}
                    />
                    <Stat
                      label="Modeled fees"
                      value={usd(s.pilot_replay.fees)}
                    />
                  </div>
                  <p>{s.pilot_replay.scope}</p>
                  <Raw
                    value={s.pilot_replay}
                    label="Every pilot bar, measured neural decision and simulated fill"
                  />
                </section>
              )}
              <Raw
                value={s.equity_history}
                label="Equity sample values and timestamps"
              />
            </>
          )}
          {id === 'notes' && (
            <>
              <h2>Connection &amp; experiment</h2>
              <MarketUniverse backend={backend} />
              <div className="paper-two">
                <section>
                  <h3>Paper execution</h3>
                  <dl>
                    <dt>Broker</dt>
                    <dd>{s.broker.endpoint}</dd>
                    <dt>Market feed</dt>
                    <dd>IEX · single exchange</dd>
                    <dt>Cadence</dt>
                    <dd>Completed 5-minute bars</dd>
                    <dt>Max intended order</dt>
                    <dd>$100</dd>
                    <dt>Entry exposure cap</dt>
                    <dd>10% of equity across all stocks</dd>
                    <dt>Shorts / leverage</dt>
                    <dd>Disabled</dd>
                    <dt>Pause</dt>
                    <dd>
                      Stops new orders; requests cancellation of Tradefly orders
                    </dd>
                  </dl>
                </section>
                <section>
                  <h3>How it decides</h3>
                  <ol>
                    <li>
                      Completed bars and account balances become six bounded
                      stimulus rates.
                    </li>
                    <li>
                      The full fixed connectome runs for 500 ms of neural time.
                    </li>
                    <li>
                      BUY and SELL are read from the final 250 ms; winner needs
                      20 Hz and an 8 Hz lead.
                    </li>
                    <li>
                      Execution can reduce or reject the intent. It cannot
                      invent a trade.
                    </li>
                  </ol>
                </section>
              </div>
              <h3>Data meaning</h3>
              <p>
                Hz means spikes per second per neuron. The SELL pool averages
                two neurons. Input rates are artificial market-to-sensory
                mappings. “Ready” means local engineering checks passed; it does
                not mean the fly understands finance.
              </p>
              <p>
                IEX volume covers one exchange. Bars use raw prices. Missing
                bars, uncertain orders, mismatched holdings, or a lost control
                connection pause execution. Resuming skips old bars.
              </p>
              <p>{s.export_note}</p>
              <p>
                Market fills can move from the sizing reference price. Alpaca
                keys stay on your Mac. The desktop receives account and
                experiment telemetry over a private authenticated connection.
              </p>
              <Raw value={s.account} label="All account fields received" />
              <Raw value={s.market} label="Exchange clock and next session" />
            </>
          )}
        </>
      )}
    </div>
  );
}
