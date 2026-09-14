'use client';
import { useEffect, useState } from 'react';
import type { PaperBackend } from './paper-views';
import { ReplayComparison } from './replay-comparison';
import { Decision } from './paper-views';
import { traceDecision, stockRecords, orderFill } from '@/lib/evidence';
import type { PaperDecision } from '@/lib/backend';
export type EvidenceTarget = {
  decisionId?: string;
  symbol?: string;
  nonce: number;
};
const time = (s?: string | null) =>
  s ? new Date(s).toLocaleString() : 'Not in snapshot';
const num = (v: unknown) =>
  v === undefined || v === null || v === '' || !Number.isFinite(Number(v))
    ? '—'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
const money = (v: unknown) =>
  num(v) === '—'
    ? '—'
    : '$' +
      Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const tabs = [
  'Decision replay',
  'Stock dossier',
  'Market map',
  'Replay comparison',
] as const;
export function EvidenceDesk({
  backend,
  target,
}: {
  backend: PaperBackend;
  target: EvidenceTarget | null;
}) {
  const s = backend.data.snapshot;
  const [tab, setTab] = useState<(typeof tabs)[number]>('Decision replay');
  const [selected, setSelected] = useState(''),
    [symbol, setSymbol] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [page, setPage] = useState(0),
    [stage, setStage] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (target?.decisionId) {
      setSelected(target.decisionId);
      setTab('Decision replay');
      setStage(0);
    } else if (target?.symbol) {
      setSymbol(target.symbol);
      setTab('Stock dossier');
    }
    setPlaying(false);
  }, [target]);
  const decision =
    s?.decisions.find((d) => d.id === selected) ||
    (!selected ? s?.decisions.at(-1) : undefined);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (stage >= 4) setPlaying(false);
      else setStage(stage + 1);
    }, 1200);
    return () => clearTimeout(timer);
  }, [playing, stage]);
  function choose(d: PaperDecision) {
    setSelected(d.id);
    setStage(0);
    setPlaying(false);
    setTab('Decision replay');
  }
  function dossier(stock: string) {
    setSymbol(stock);
    setTab('Stock dossier');
    setPlaying(false);
  }
  if (!s)
    return (
      <div className="evidence-desk">
        <h2>Evidence desk</h2>
        <p>
          {backend.error ||
            'Waiting for the paper worker. Recorded decisions, stock histories and market coverage will appear here.'}
        </p>
      </div>
    );
  const trace = decision ? traceDecision(s, decision) : null;
  const stock = symbol || decision?.symbol || s.symbol;
  const records = stockRecords(s, stock);
  const universe = s.universe;
  const symbols = [
    ...new Set([
      ...(universe?.symbols || []),
      ...s.decisions.map((d) => d.symbol || s.symbol),
      ...s.positions.map((p) => p.symbol),
    ]),
  ];
  const matches = symbols.filter(
    (t) =>
      t.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || (universe?.statuses[t] || 'unseen') === filter),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 80)),
    currentPage = Math.min(page, pages - 1);
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              source: 'alpaca-paper-telemetry',
              received_at: backend.data.received_at,
              scope: s?.export_note,
              symbol: stock,
              records,
              decision,
              trace,
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
    a.download = 'tradefly-evidence.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="evidence-desk">
      <header className="evidence-heading">
        <div>
          <span>PAPER / RECORDED EVIDENCE</span>
          <h2>Follow a decision.</h2>
        </div>
        <button onClick={download}>Export evidence</button>
      </header>
      <p className="evidence-notice">
        {backend.stale
          ? 'Offline · saved readings'
          : s.paused
            ? 'Worker paused'
            : 'Worker running'}{' '}
        · Received {time(backend.data.received_at)}. Replay only changes this
        view.
      </p>
      <nav className="evidence-tabs" aria-label="Evidence views">
        {tabs.map((t) => (
          <button
            key={t}
            aria-pressed={t === tab}
            onClick={() => {
              setTab(t);
              setPlaying(false);
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Decision replay' && (
        <>
          <div className="evidence-toolbar">
            <label>
              Recorded decision
              <select
                value={decision?.id || ''}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setStage(0);
                  setPlaying(false);
                }}
              >
                <option value="" disabled>
                  Select a decision
                </option>
                {[...s.decisions].reverse().map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.symbol || s.symbol} · {d.action} · {time(d.created_at)}
                  </option>
                ))}
              </select>
            </label>
            {decision && (
              <button onClick={() => dossier(decision.symbol || s.symbol)}>
                Open stock dossier ↗
              </button>
            )}
          </div>
          {!decision ? (
            <p className="evidence-empty">
              {selected
                ? 'This decision is outside the retained snapshot. Choose another recorded decision.'
                : 'No paper decisions recorded yet. No sample trades are substituted here.'}
            </p>
          ) : (
            trace && (
              <>
                <div className="evidence-toolbar">
                  <button
                    onClick={() => {
                      setSelected(decision.id);
                      if (stage === 4) setStage(0);
                      setPlaying(!playing);
                    }}
                  >
                    {playing ? 'Pause replay' : 'Play evidence'}
                  </button>
                  <span>Recorded {time(decision.created_at)}</span>
                </div>
                <ol className="evidence-chain">
                  {[
                    'Market input',
                    'Neural response',
                    'Intent',
                    'Execution',
                    'Outcome',
                  ].map((title, i) => (
                    <li key={title}>
                      <button
                        aria-current={stage === i ? 'step' : undefined}
                        onClick={() => {
                          setStage(i);
                          setPlaying(false);
                        }}
                      >
                        <small>0{i + 1}</small>
                        <strong>{title}</strong>
                        <span>
                          {
                            [
                              money(decision.bar.c),
                              `${num(decision.neural.buy_hz)} / ${num(decision.neural.sell_hz)} Hz`,
                              decision.action,
                              trace.orders.length
                                ? `${trace.orders.length} linked order`
                                : 'No linked order',
                              trace.orders.some((o) => orderFill(o))
                                ? 'Fill reported'
                                : 'No recorded fill',
                            ][i]
                          }
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <section className="evidence-panel" aria-live="polite">
                  {stage === 0 && (
                    <>
                      <h3>What reached the fly</h3>
                      <p>
                        {decision.feed.toUpperCase()} bar starting{' '}
                        {time(decision.bar.t)}. This completed bar was encoded
                        into sensory firing rates.
                      </p>
                      <div className="evidence-metrics">
                        {Object.entries(decision.bar)
                          .filter(([k]) => k !== 't')
                          .map(([k, v]) => (
                            <Metric
                              key={k}
                              label={
                                (
                                  {
                                    o: 'Open',
                                    h: 'High',
                                    l: 'Low',
                                    c: 'Close',
                                    v: 'Volume',
                                  } as Record<string, string>
                                )[k]
                              }
                              value={k === 'v' ? num(v) : money(v)}
                            />
                          ))}
                      </div>
                      <div className="evidence-rates">
                        {Object.entries(decision.stimulus_hz).map(([k, v]) => (
                          <div key={k}>
                            <span>{k.replaceAll('_', ' ')}</span>
                            <meter min={0} max={100} value={v} />
                            <b>{num(v)} Hz</b>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {stage === 1 && (
                    <>
                      <h3>Measured neural response</h3>
                      <div className="evidence-metrics">
                        <Metric
                          label="BUY pool"
                          value={`${num(decision.neural.buy_hz)} Hz`}
                        />
                        <Metric
                          label="SELL pool"
                          value={`${num(decision.neural.sell_hz)} Hz`}
                        />
                        <Metric
                          label="Active neurons"
                          value={num(decision.neural.active_neurons)}
                        />
                        <Metric
                          label="Recorded spikes"
                          value={num(decision.neural.spikes)}
                        />
                      </div>
                      <p>
                        Readout: {decision.neural.readout_ms} ms within a{' '}
                        {decision.neural.window_ms} ms simulation. These are
                        recorded measurements; the animation is not a replay of
                        individual spike times.
                      </p>
                      <details>
                        <summary>Output neurons and state identity</summary>
                        <pre>
                          {JSON.stringify(
                            {
                              outputs: decision.neural.output_neurons,
                              state: decision.neural.state_id,
                              manifest: decision.neural.manifest_hash,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </>
                  )}
                  {stage === 2 && (
                    <>
                      <h3>{decision.action}</h3>
                      <p>{decision.reason}</p>
                      <p>
                        Frozen decoder: the leading pool must reach 20 Hz and
                        lead by at least 8 Hz. Otherwise HOLD. This is a
                        recorded rule explanation, not a verbal thought from the
                        fly.
                      </p>
                    </>
                  )}
                  {stage === 3 && (
                    <>
                      <h3>What execution allowed</h3>
                      <p>{trace.execution}</p>
                      {trace.events.map((e) => (
                        <details key={e.id}>
                          <summary>
                            {time(e.at)} · {e.kind.replaceAll('_', ' ')}
                          </summary>
                          <pre>{JSON.stringify(e.data, null, 2)}</pre>
                        </details>
                      ))}
                      {!trace.events.length && (
                        <p>
                          No matching execution events in the retained event
                          window.
                        </p>
                      )}
                      <p>
                        Current limits: {money(s.limits.max_order_usd)} per
                        order, {num(s.limits.max_exposure_pct)}% entry exposure.
                        The linked records below describe this decision's actual
                        execution.
                      </p>
                    </>
                  )}
                  {stage === 4 && (
                    <>
                      <h3>Broker-reported outcome</h3>
                      {!trace.orders.length && (
                        <p>
                          No linked broker order. An intent alone is not a fill
                          or a profit.
                        </p>
                      )}
                      {trace.orders.map((o) => {
                        const fill = orderFill(o);
                        return (
                          <article key={o.client_id}>
                            <h4>
                              {String(o.payload.side).toUpperCase()} ·{' '}
                              {o.status}
                            </h4>
                            <p>
                              {fill
                                ? `${num(fill.qty)} shares at average ${money(fill.price)} · ${money(fill.value)} filled value`
                                : 'No positive filled quantity and price reported.'}
                            </p>
                            {fill && o.status !== 'filled' && (
                              <p>
                                Partial or otherwise non-final order state.
                                Further updates may follow.
                              </p>
                            )}
                            <p>
                              Final fill timestamp: {time(o.broker?.filled_at)}
                            </p>
                            <details>
                              <summary>
                                Order identifiers and raw broker record
                              </summary>
                              <pre>{JSON.stringify(o, null, 2)}</pre>
                            </details>
                          </article>
                        );
                      })}
                      <p>
                        Filled value is not P&L. Fees and quote-relative
                        slippage are not measured in this snapshot.
                      </p>
                    </>
                  )}
                </section>
                <details className="evidence-panel">
                  <summary>Complete decision inspector</summary>
                  <Decision d={decision} />
                </details>
              </>
            )
          )}
        </>
      )}
      {tab === 'Stock dossier' && (
        <>
          <div className="evidence-toolbar">
            <label>
              Find a stock
              <input
                value={stock}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                list="evidence-symbols"
              />
              <datalist id="evidence-symbols">
                {symbols
                  .filter((t) => t.startsWith(stock))
                  .slice(0, 50)
                  .map((t) => (
                    <option key={t} value={t} />
                  ))}
              </datalist>
            </label>
            <span>
              {symbols.includes(stock)
                ? 'In recorded universe'
                : 'No membership record'}
            </span>
          </div>
          <h3>{stock}</h3>
          <div className="evidence-metrics">
            <Metric
              label="Decisions in snapshot"
              value={String(records.decisions.length)}
            />
            <Metric
              label="Linked stock orders"
              value={String(records.orders.length)}
            />
            <Metric
              label="Current shares"
              value={
                records.position
                  ? num(records.position.qty)
                  : s.broker.connected
                    ? 'None reported'
                    : '—'
              }
            />
            <Metric
              label="Current unrealized P&L"
              value={
                records.position ? money(records.position.unrealized_pl) : '—'
              }
            />
          </div>
          <p>
            Latest coverage: {records.status.replaceAll('_', ' ')}. Visit time:{' '}
            {time(records.visit?.at)}. {records.visit?.detail}
          </p>
          <div className="evidence-toolbar">
            {(['BUY', 'SELL', 'HOLD'] as const).map((a) => (
              <span key={a}>
                {a}: {records.decisions.filter((d) => d.action === a).length}
              </span>
            ))}
            <span>
              Realized P&L: unavailable from a potentially truncated fill
              history.
            </span>
          </div>
          <div className="evidence-table">
            <table>
              <thead>
                <tr>
                  <th>Decision time</th>
                  <th>Action</th>
                  <th>BUY / SELL Hz</th>
                  <th>Recorded reason</th>
                  <th>Trace</th>
                </tr>
              </thead>
              <tbody>
                {[...records.decisions].reverse().map((d) => (
                  <tr key={d.id}>
                    <td>{time(d.created_at)}</td>
                    <td>{d.action}</td>
                    <td>
                      {num(d.neural.buy_hz)} / {num(d.neural.sell_hz)}
                    </td>
                    <td>{d.reason}</td>
                    <td>
                      <button onClick={() => choose(d)}>Replay ↗</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!records.decisions.length && (
            <p className="evidence-empty">
              No decisions for this stock in the current snapshot. It may be
              unvisited or its older history may be outside this window.
            </p>
          )}
          <h3>Paper orders</h3>
          {records.orders.map((o) => (
            <details key={o.client_id}>
              <summary>
                {String(o.payload.side).toUpperCase()} · {o.status} ·{' '}
                {o.client_id}
              </summary>
              <pre>{JSON.stringify(o, null, 2)}</pre>
              <button
                disabled={!s.decisions.some((d) => d.id === o.decision_id)}
                onClick={() =>
                  choose(s.decisions.find((d) => d.id === o.decision_id)!)
                }
              >
                Trace originating decision
              </button>
            </details>
          ))}
        </>
      )}
      {tab === 'Market map' && (
        <>
          <div className="evidence-metrics">
            <Metric label="Universe membership" value={num(universe?.total)} />
            <Metric label="Never visited" value={num(universe?.unseen)} />
            <Metric
              label="Neural evaluations this session"
              value={num(universe?.session_evaluated)}
            />
            <Metric label="Next presented stock" value={s.next_symbol || '—'} />
          </div>
          <p>
            {s.selection_policy ||
              'The worker determines the presentation order.'}{' '}
            Availability does not mean every stock has been evaluated. A data
            gap is not HOLD.
          </p>
          <div className="evidence-toolbar">
            <label>
              Search
              <input
                placeholder="Symbol"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              Latest status
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              >
                {[
                  'all',
                  'unseen',
                  ...new Set(Object.values(universe?.statuses || {})),
                ]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((v) => (
                    <option key={v} value={v}>
                      {v.replaceAll('_', ' ')}
                    </option>
                  ))}
              </select>
            </label>
            <span>{matches.length.toLocaleString()} matches</span>
          </div>
          <div className="market-tiles">
            {matches
              .slice(currentPage * 80, (currentPage + 1) * 80)
              .map((t) => (
                <button
                  key={t}
                  data-status={universe?.statuses[t] || 'unseen'}
                  onClick={() => dossier(t)}
                >
                  <b>{t}</b>
                  <span>
                    {(universe?.statuses[t] || 'unseen').replaceAll('_', ' ')}
                  </span>
                </button>
              ))}
          </div>
          {!matches.length && <p>No stocks match these filters.</p>}
          <div className="evidence-toolbar">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage + 1} / {pages}
            </span>
            <button
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {tab === 'Replay comparison' && (
        <ReplayComparison pilot={s.pilot_replay} />
      )}
      <footer className="evidence-scope">
        {s.decisions.length} / {s.decision_count} decisions available here; up
        to 100 orders and 50 events. {s.export_note} Missing records are not
        treated as zero activity. Current positions are broker snapshots, not
        reconstructed historical holdings.
      </footer>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
