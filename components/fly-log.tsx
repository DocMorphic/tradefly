'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Download } from 'lucide-react';
import { historicalLog, paperLog, type FlyLogEntry } from '@/lib/fly-log';
import type { PaperBackend } from './paper-views';
export function FlyLog({ backend }: { backend: PaperBackend }) {
  const [source, setSource] = useState('paper'),
    [phase, setPhase] = useState('all'),
    [symbol, setSymbol] = useState('all'),
    [follow, setFollow] = useState(true);
  const end = useRef<HTMLDivElement>(null),
    s = backend.data.snapshot;
  const entries = useMemo(
    () =>
      s ? (source === 'paper' ? paperLog(s) : historicalLog(s, source)) : [],
    [s, source],
  );
  const visible = entries.filter(
    (e) =>
      (phase === 'all' || e.phase === phase) &&
      (symbol === 'all' || e.symbol === symbol),
  );
  const latest = visible.at(-1)?.id;
  useEffect(() => {
    if (follow) end.current?.scrollIntoView({ block: 'nearest' });
  }, [latest, follow]);
  function download() {
    const url = URL.createObjectURL(
      new Blob([visible.map((e) => JSON.stringify(e)).join('\n')], {
        type: 'application/x-ndjson',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradefly-${source}-activity.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="fly-console">
      <div className="fly-console-top">
        <div>
          <b>Fly log</b>
          <p>
            Recorded activity in plain language. These entries are not thoughts
            or financial predictions.
          </p>
        </div>
        <button onClick={download} disabled={!visible.length}>
          <Download size={14} />
          Export
        </button>
      </div>
      <div className="fly-console-controls">
        <label>
          Source
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="paper">Paper activity</option>
            <option value="historical">Historical replay</option>
            <option value="watchlist">Watchlist input check</option>
          </select>
        </label>
        <label>
          Show
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="all">All activity</option>
            {['sense', 'neural', 'decision', 'execution', 'system'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Stock
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="all">All stocks</option>
            {[...new Set(entries.map((e) => e.symbol))].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button aria-pressed={follow} onClick={() => setFollow(!follow)}>
          <ArrowDown size={14} />
          {follow ? 'Following' : 'Follow latest'}
        </button>
      </div>
      <div className="fly-console-notice">
        {source === 'paper'
          ? backend.stale
            ? 'Backend offline · saved entries'
            : s?.paused
              ? 'Paper worker paused'
              : 'Paper worker running'
          : source === 'watchlist'
            ? 'Watchlist input check · recorded brain activity · no orders'
            : 'Historical replay · local simulated fills · no broker orders'}
        <span>{visible.length} entries</span>
      </div>
      <div className="fly-console-stream" aria-label="Recorded fly activity">
        {visible.length ? (
          visible.map((e) => <LogEntry key={e.id} entry={e} />)
        ) : (
          <div className="fly-console-empty">
            {source === 'paper'
              ? 'Waiting for recorded activity. Historical replay is available above.'
              : 'No historical replay received yet.'}
          </div>
        )}
        <div ref={end} />
      </div>
      <footer>
        Sense → neural activity → decision → execution. Click any entry for its
        source record.
      </footer>
    </div>
  );
}
function LogEntry({ entry: e }: { entry: FlyLogEntry }) {
  return (
    <details className={`fly-console-entry phase-${e.phase}`}>
      <summary>
        <time dateTime={e.at}>
          {new Date(e.at).toLocaleTimeString(undefined, { hour12: false })}
        </time>
        <span className="fly-log-symbol">{e.symbol}</span>
        <span className="fly-log-phase">{e.phase}</span>
        <span>{e.text}</span>
      </summary>
      <pre>{JSON.stringify(e.raw, null, 2)}</pre>
    </details>
  );
}
