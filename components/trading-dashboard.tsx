'use client';
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- SVG charts expose an application role and deliberate arrow-key inspection; SVG has no native interactive chart element. */
import { useId, useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  TradingData,
  ChartDecision,
  ChartFill,
} from '@/lib/trading-charts';
import { selectedMarket } from '@/lib/trading-charts';
import { validChartSymbol } from '@/lib/market-history';
import { useMarketHistory } from '@/components/use-market-history';

const GREEN = '#4ee1a0',
  RED = '#ff7488';
const money = (n: number | null) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(n);
const signed = (n: number | null) =>
  n === null ? '—' : `${n > 0 ? '+' : ''}${money(n)}`;
const number = (n: number | null) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
const percent = (n: number | null) =>
  n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const tone = (n: number | null) =>
  n === null || n === 0 ? 'neutral' : n > 0 ? 'gain' : 'loss';
function clock(at: number, demo = false, full = false) {
  return new Date(at).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    ...(full && !demo ? { month: 'short', day: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
type Point = {
  at: number;
  values: Record<string, number | null>;
  label?: string;
  open?: number;
  high?: number;
  low?: number;
  id?: string;
};
type Series = {
  key: string;
  label: string;
  color: string;
  format?: (v: number | null) => string;
};
export function Graph({
  points,
  series,
  label,
  demo = false,
  reference,
  referenceLabel,
  columns = false,
  candles = false,
  directional = false,
  gaps = false,
  markers = [],
  onTrace,
  extras,
}: {
  points: Point[];
  series: Series[];
  label: string;
  demo?: boolean;
  reference?: number;
  referenceLabel?: string;
  columns?: boolean;
  candles?: boolean;
  directional?: boolean;
  gaps?: boolean;
  markers?: ChartFill[];
  onTrace?: (id: string) => void;
  extras?: (p: Point) => ReactNode;
}) {
  const id = useId().replaceAll(':', '');
  const [hover, setHover] = useState<number | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(840);
  const empty = points.length === 0;
  useEffect(() => {
    const node = graphRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setChartWidth(Math.max(280, Math.round(node.clientWidth))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [empty]);
  const W = chartWidth,
    H = 235,
    L = 68,
    R = 22,
    T = 20,
    B = 40,
    PW = W - L - R,
    PH = H - T - B;
  const all = points
    .flatMap((p) => [
      ...Object.values(p.values),
      ...(candles ? [p.high ?? null, p.low ?? null] : []),
    ])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (reference !== undefined) all.push(reference);
  if (!points.length || !all.length)
    return (
      <div className="trade-chart-empty">
        <span className="empty-axis" />
        <b>No observations yet</b>
        <span>This chart will appear when recorded data arrives.</span>
      </div>
    );
  const lo = Math.min(...all),
    hi = Math.max(...all),
    pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.00003, 0.01),
    min =
      reference === 20 || directional || candles
        ? Math.max(0, lo - pad)
        : lo - pad,
    max = referenceLabel === 'Peak' ? 0 : hi + pad;
  const start = points[0].at,
    end = points.at(-1)!.at;
  const x = (at: number) =>
    start === end ? L + PW / 2 : L + ((at - start) / (end - start)) * PW;
  const y = (v: number) => T + ((max - v) / (max - min)) * PH;
  const index =
      hover === null ? points.length - 1 : Math.min(hover, points.length - 1),
    active = points[index];
  const inspect = (clientX: number, node: SVGSVGElement) => {
    const rect = node.getBoundingClientRect(),
      at =
        start +
        ((((clientX - rect.left) / rect.width) * W - L) / PW) * (end - start);
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.at - at) < Math.abs(points[nearest].at - at)) nearest = i;
    });
    setHover(nearest);
  };
  return (
    <div ref={graphRef} className="trade-graph">
      <div className="trade-readout" aria-live="polite">
        <span>
          {clock(active.at, demo, true)} ET
          {active.label ? ` · ${active.label}` : ''}
        </span>
        {series.map((s) => (
          <b
            key={s.key}
            style={{
              color:
                s.color === 'split'
                  ? (active.values[s.key] ?? 0) >= 0
                    ? GREEN
                    : RED
                  : s.color,
            }}
          >
            {s.label} {(s.format ?? money)(active.values[s.key])}
          </b>
        ))}
        {extras?.(active)}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="application"
        aria-label={`${label}. Hover or tap to inspect; arrow keys move between observations.`}
        tabIndex={0}
        onPointerMove={(e) => inspect(e.clientX, e.currentTarget)}
        onPointerDown={(e) => inspect(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(points.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (
            ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)
          ) {
            e.preventDefault();
            setHover(
              e.key === 'Escape'
                ? null
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? points.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          points.length - 1,
                          index + (e.key === 'ArrowLeft' ? -1 : 1),
                        ),
                      ),
            );
          }
        }}
      >
        <defs>
          <linearGradient
            id={`split-${id}`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={H}
          >
            <stop
              offset={`${Math.max(0, Math.min(100, (y(0) / H) * 100))}%`}
              stopColor={GREEN}
            />
            <stop
              offset={`${Math.max(0, Math.min(100, (y(0) / H) * 100))}%`}
              stopColor={RED}
            />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = max - t * (max - min);
          return (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(v)}
                y2={y(v)}
                className="trade-gridline"
              />
              <text x={L - 12} y={y(v) + 4} textAnchor="end">
                {!series[0].format && max - min < 0.1
                  ? `$${v.toFixed(3)}`
                  : (series[0].format ?? money)(v)}
              </text>
            </g>
          );
        })}
        {reference !== undefined && (
          <g>
            <line
              x1={L}
              x2={W - R}
              y1={y(reference)}
              y2={y(reference)}
              className="trade-reference"
            />
            <text x={W - R} y={y(reference) - 6} textAnchor="end">
              {referenceLabel ??
                (reference === 0 ? 'Break-even' : `${reference} Hz threshold`)}
            </text>
          </g>
        )}
        {series.map((s) => (
          <g key={s.key}>
            {points.map((p, i) => {
              const value = p.values[s.key];
              if (value === null || value === undefined) return null;
              const prev = points[i - 1],
                pv = prev?.values[s.key];
              const color = s.color === 'split' ? `url(#split-${id})` : s.color;
              if (columns)
                return (
                  <rect
                    key={i}
                    x={x(p.at) - 3}
                    y={Math.min(y(value), y(0))}
                    width="6"
                    height={Math.max(1, Math.abs(y(value) - y(0)))}
                    fill={color}
                  />
                );
              if (
                candles &&
                p.open !== undefined &&
                p.high !== undefined &&
                p.low !== undefined
              ) {
                const c = value >= p.open ? GREEN : RED,
                  bw = Math.max(3, Math.min(12, (PW / points.length) * 0.5));
                return (
                  <g key={i}>
                    <line
                      x1={x(p.at)}
                      x2={x(p.at)}
                      y1={y(p.high)}
                      y2={y(p.low)}
                      stroke={c}
                    />
                    <rect
                      x={x(p.at) - bw / 2}
                      y={Math.min(y(p.open), y(value))}
                      width={bw}
                      height={Math.max(1.5, Math.abs(y(value) - y(p.open)))}
                      fill={c}
                    />
                  </g>
                );
              }
              const connect =
                prev &&
                pv !== null &&
                pv !== undefined &&
                (!gaps || p.at - prev.at <= 450000);
              return (
                <g key={i}>
                  {connect && (
                    <line
                      x1={x(prev.at)}
                      y1={y(pv)}
                      x2={x(p.at)}
                      y2={y(value)}
                      stroke={directional ? (value >= pv ? GREEN : RED) : color}
                      strokeWidth="2.3"
                      strokeLinecap="round"
                    />
                  )}
                  {(!connect || points.length < 5) && (
                    <circle
                      cx={x(p.at)}
                      cy={y(value)}
                      r="3"
                      fill={
                        s.color === 'split'
                          ? value >= 0
                            ? GREEN
                            : RED
                          : s.color
                      }
                    />
                  )}
                </g>
              );
            })}
          </g>
        ))}
        {markers
          .filter(
            (m) =>
              m.at >= start && m.at <= end && m.price >= min && m.price <= max,
          )
          .map((m) => (
            <g
              key={m.id}
              className="trade-fill-marker"
              /* SVG has no native button element; preserve keyboard activation. */
              // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
              role="button"
              tabIndex={0}
              aria-label={`${m.side} fill ${m.symbol} ${money(m.price)} at ${clock(m.at, demo)}; inspect decision`}
              onClick={() => onTrace?.(m.decisionId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onTrace?.(m.decisionId);
                }
              }}
            >
              <circle
                cx={x(m.at)}
                cy={y(m.price)}
                r="4.5"
                fill={m.side === 'BUY' ? GREEN : RED}
              />
              <text
                x={x(m.at)}
                y={y(m.price) + 4}
                textAnchor="middle"
                className="fill-letter"
              >
                {m.side === 'BUY' ? 'B' : 'S'}
              </text>
              <title>{`${m.side} ${number(m.qty)} ${m.symbol} @ ${money(m.price)} · ${clock(m.at, demo, true)} ET`}</title>
            </g>
          ))}
        {hover !== null && (
          <g>
            <line
              x1={x(active.at)}
              x2={x(active.at)}
              y1={T}
              y2={H - B}
              className="trade-crosshair"
            />
            {series.map(
              (s) =>
                active.values[s.key] !== null && (
                  <circle
                    key={s.key}
                    cx={x(active.at)}
                    cy={y(active.values[s.key]!)}
                    r="4"
                    fill={
                      s.color === 'split'
                        ? (active.values[s.key] ?? 0) >= 0
                          ? GREEN
                          : RED
                        : s.color
                    }
                    stroke="#16152c"
                    strokeWidth="2"
                  />
                ),
            )}
          </g>
        )}
        {[...new Set([start, (start + end) / 2, end])].map((at, i, ticks) => (
          <text
            key={at}
            x={x(at)}
            y={H - 12}
            textAnchor={
              ticks.length === 1
                ? 'middle'
                : i === 0
                  ? 'start'
                  : i === ticks.length - 1
                    ? 'end'
                    : 'middle'
            }
          >
            {clock(at, demo, true)}
          </text>
        ))}
      </svg>
    </div>
  );
}
function Card({
  title,
  note,
  children,
  tools,
  className = '',
  anchor,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  tools?: ReactNode;
  className?: string;
  anchor?: string;
}) {
  return (
    <section id={anchor} className={`trade-card ${className}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {note && <p>{note}</p>}
        </div>
        {tools}
      </header>
      {children}
    </section>
  );
}
export function SignalBars({ decision }: { decision: ChartDecision }) {
  const max = Math.max(decision.buy ?? 0, decision.sell ?? 0, 35);
  return (
    <div className="trade-signal-bars">
      {[
        ['BUY', decision.buy, GREEN],
        ['SELL', decision.sell, RED],
      ].map(([name, v, c]) => (
        <div key={String(name)}>
          <span>{name}</span>
          <div className="signal-track">
            <i
              style={{
                width: `${(Number(v ?? 0) / max) * 100}%`,
                background: String(c),
              }}
            />
            <em style={{ left: `${(20 / max) * 100}%` }} />
          </div>
          <b>{number(v as number | null)} Hz</b>
        </div>
      ))}
      <small>
        {decision.learning
          ? `Learned prediction: ${decision.learning.prediction_bps.toFixed(1)} bp. Action threshold: ±25 bp. Bars show the original neural output pools.`
          : 'Activity ≥ 20 Hz + an 8 Hz lead triggers a direction.'}
      </small>
    </div>
  );
}
export function TradingDashboard({
  data,
  view = 'overview',
  onTrace,
}: {
  data: TradingData;
  view?: 'overview' | 'analysis' | 'ledger';
  onTrace?: (id: string) => void;
}) {
  const pricePanel = useId();
  const stockList = useId();
  const [search, setSearch] = useState('');
  const [symbol, setSymbol] = useState(''),
    [limit, setLimit] = useState(60),
    [kind, setKind] = useState<'line' | 'candles'>('line'),
    [range, setRange] = useState('all'),
    [positionSort, setPositionSort] = useState<'pnl' | 'value'>('pnl');
  const symbols = [
    ...new Set([
      ...data.positions.map((p) => p.symbol),
      ...data.bars.map((b) => b.symbol),
      ...(symbol ? [symbol] : []),
    ]),
  ].sort();
  const chosen = symbols.includes(symbol)
    ? symbol
    : (data.decisions.at(-1)?.symbol ?? symbols[0] ?? '');
  const history = useMarketHistory(chosen, !data.demo);
  const bars = data.demo
      ? selectedMarket(data, chosen, limit)
      : (history.history?.bars ?? []).slice(-limit),
    lastBar = bars.at(-1),
    change = bars.length > 1 ? lastBar!.close - bars[0].close : null;
  const cutoff =
    range === 'all'
      ? -Infinity
      : (data.series.at(-1)?.at ?? data.updatedAt) - Number(range) * 3600000;
  const equity = data.series.filter((s) => s.at >= cutoff);
  const decisions = data.decisions.slice(-60),
    latest = decisions.at(-1);
  const positions = [...data.positions].sort(
    (a, b) => Math.abs(b[positionSort] ?? 0) - Math.abs(a[positionSort] ?? 0),
  );
  const allocationTotal = positions.reduce(
    (s, p) => s + Math.abs(p.value ?? 0),
    0,
  );
  const openPnl =
    data.positionsKnown && data.positions.every((p) => p.pnl !== null)
      ? data.positions.reduce((s, p) => s + p.pnl!, 0)
      : null;
  const fmtTime = (t: number) => clock(t, data.demo, true);
  const equityPoints = equity.map((s) => ({
    at: s.at,
    values: { pnl: s.pnl, equity: s.equity },
  }));
  const hasBaseline = data.baseline !== null;
  const fillPoints = data.fills.map((f) => ({
    at: f.at,
    label: `${f.symbol} ${f.side}`,
    values: {
      buy: f.side === 'BUY' ? f.value : 0,
      sell: f.side === 'SELL' ? -f.value : 0,
    },
  }));
  return (
    <div className="trading-desk">
      <div className="trading-heading">
        <div>
          <span className="trade-eyebrow">
            {data.demo ? 'SYNTHETIC REPLAY' : 'ALPACA PAPER ACCOUNT'}
          </span>
          <h2>
            {view === 'analysis'
              ? 'Performance, in perspective'
              : view === 'ledger'
                ? 'Follow the trades'
                : 'The trading floor'}
          </h2>
        </div>
        <span className="trade-update">As of {fmtTime(data.updatedAt)} ET</span>
      </div>
      <div className="trade-metrics">
        <div>
          <span>Account change</span>
          <strong className={tone(data.pnl)}>{signed(data.pnl)}</strong>
          <small>
            {data.baseline && data.pnl !== null
              ? percent((data.pnl / data.baseline) * 100)
              : '—'}{' '}
            since baseline
          </small>
        </div>
        <div>
          <span>Account value</span>
          <strong>{money(data.equity)}</strong>
          <small>Cash + marked positions</small>
        </div>
        <div>
          <span>Cash available</span>
          <strong>{money(data.cash)}</strong>
          <small>
            {data.cash !== null && data.equity
              ? `${((data.cash / data.equity) * 100).toFixed(1)}% of account`
              : 'Awaiting balance'}
          </small>
        </div>
        <div>
          <span>Open holdings P&amp;L</span>
          <strong className={tone(openPnl)}>{signed(openPnl)}</strong>
          <small>
            {data.positionsKnown
              ? `${data.positions.length} positions · unrealized`
              : 'Waiting for the broker'}
          </small>
        </div>
      </div>
      <div className="trade-top-grid">
        {view !== 'ledger' && (
          <Card
            title="Is the account growing?"
            note={
              data.demo
                ? 'Demo profit / loss since the $10,000 start'
                : 'Account change from baseline · may include deposits and manual activity'
            }
            tools={
              <div className="trade-segments" aria-label="Account chart range">
                {[
                  ['1', '1H'],
                  ['6', '6H'],
                  ['all', 'All'],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    aria-pressed={range === v}
                    onClick={() => setRange(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            }
          >
            <Graph
              key={`equity-${range}`}
              label="Account change over time"
              gaps
              points={equityPoints.map((p) => ({
                ...p,
                values: {
                  [hasBaseline ? 'pnl' : 'equity']:
                    p.values[hasBaseline ? 'pnl' : 'equity'],
                },
              }))}
              series={[
                {
                  key: hasBaseline ? 'pnl' : 'equity',
                  label: hasBaseline ? 'Change' : 'Equity',
                  color: hasBaseline ? 'split' : '#b6a3e0',
                  format: hasBaseline ? signed : money,
                },
              ]}
              reference={hasBaseline ? 0 : undefined}
              demo={data.demo}
            />
            <footer>
              {hasBaseline && (
                <>
                  <span>
                    <i className="gain-dot" /> Above baseline
                  </span>
                  <span>
                    <i className="loss-dot" /> Below baseline
                  </span>
                </>
              )}
              <span>{equity.length} saved samples · hover to inspect</span>
            </footer>
          </Card>
        )}
        {
          <Card
            title="Price & executed trades"
            anchor={pricePanel}
            note={
              data.demo
                ? `${data.source} · ET`
                : 'US exchanges · SIP · delayed ≥15 min · ET'
            }
            tools={
              <div className="trade-price-tools">
                <label>
                  <span className="sr-only">Chart stock</span>
                  <select
                    aria-label="Chart stock"
                    value={chosen}
                    onChange={(e) => setSymbol(e.target.value)}
                  >
                    {!symbols.length && <option value="">No stocks yet</option>}
                    {symbols.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {!data.demo && (
                  <form
                    className="trade-symbol-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const next = search.trim().toUpperCase();
                      if (validChartSymbol(next)) {
                        setSymbol(next);
                        setSearch('');
                      }
                    }}
                  >
                    <input
                      aria-label="Search any stock symbol"
                      placeholder="Any symbol"
                      list={stockList}
                      value={search}
                      maxLength={15}
                      pattern="[A-Za-z][A-Za-z0-9.\-]{0,14}"
                      onChange={(e) => setSearch(e.target.value.toUpperCase())}
                    />
                    <datalist id={stockList}>
                      {symbols.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </datalist>
                    <button
                      type="submit"
                      disabled={!validChartSymbol(search.trim().toUpperCase())}
                    >
                      Chart
                    </button>
                  </form>
                )}
                <select
                  aria-label="Number of recorded price bars"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  <option value={24}>Last 24 bars</option>
                  <option value={60}>Last 60 bars</option>
                  <option value={10000}>
                    {data.demo ? 'All recorded' : 'Past 7 days'}
                  </option>
                </select>
                <div className="trade-segments">
                  <button
                    aria-pressed={kind === 'line'}
                    onClick={() => setKind('line')}
                  >
                    Line
                  </button>
                  <button
                    disabled={!bars.some((b) => b.open !== undefined)}
                    aria-pressed={kind === 'candles'}
                    onClick={() => setKind('candles')}
                  >
                    Candles
                  </button>
                </div>
              </div>
            }
          >
            <div className="trade-price-heading">
              <b>{chosen || '—'}</b>
              <strong>{money(lastBar?.close ?? null)}</strong>
              <span className={tone(change)}>
                {change === null
                  ? bars.length
                    ? 'One observation is not a trend'
                    : history.pending
                      ? 'Loading market history…'
                      : 'No price observations available'
                  : `${signed(change)} (${percent(bars[0].close ? (change / bars[0].close) * 100 : null)}) in view`}
              </span>
            </div>
            {!data.demo && (
              <output className="trade-history-status">
                {history.error ??
                  (history.history
                    ? `Last candle ${lastBar ? clock(lastBar.at, false, true) + ' ET' : 'unavailable'} · ${history.pending ? 'Refreshing…' : 'Regular market hours'}`
                    : 'Waiting for the local chart worker. Keep Tradefly’s backend running.')}{' '}
                Charts use delayed SIP; fly decisions still use IEX.
              </output>
            )}
            <Graph
              key={`${chosen}-${limit}-${kind}`}
              label={`${chosen} recorded stock price`}
              points={bars.map((b) => ({
                at: b.at,
                values: { price: b.close },
                open: b.open,
                high: b.high,
                low: b.low,
                label:
                  b.volume === null ? undefined : `Volume ${number(b.volume)}`,
              }))}
              series={[{ key: 'price', label: 'Close', color: GREEN }]}
              candles={kind === 'candles'}
              directional
              gaps
              markers={data.fills.filter((f) => f.symbol === chosen)}
              onTrace={onTrace}
              demo={data.demo}
              extras={(p) =>
                p.open !== undefined ? (
                  <span>
                    O {money(p.open)} · H {money(p.high ?? null)} · L{' '}
                    {money(p.low ?? null)}
                  </span>
                ) : null
              }
            />
            <footer>
              <span>
                <i className="gain-dot" /> Price up / buy fill
              </span>
              <span>
                <i className="loss-dot" /> Price down / sell fill
              </span>
              <span>
                {bars.length} recorded bars · gaps stay empty · click a fill to
                trace
              </span>
            </footer>
          </Card>
        }
      </div>
      {view !== 'ledger' && (
        <div className="trade-card-grid">
          <Card
            title="Which holdings are working?"
            note="Unrealized profit / loss · USD"
            tools={
              <select
                aria-label="Rank holdings"
                value={positionSort}
                onChange={(e) =>
                  setPositionSort(e.target.value as 'pnl' | 'value')
                }
              >
                <option value="pnl">Biggest P&amp;L first</option>
                <option value="value">Largest position first</option>
              </select>
            }
          >
            {!positions.length ? (
              <div className="trade-chart-empty">
                <b>
                  {data.positionsKnown
                    ? 'No open holdings'
                    : 'Holdings unavailable'}
                </b>
                <span>
                  {data.positionsKnown
                    ? 'Positions appear after a buy fills.'
                    : 'Waiting for the broker’s position report.'}
                </span>
              </div>
            ) : (
              <ul
                className="trade-position-bars"
                aria-label="Holding profit and loss"
              >
                {positions.map((p) => (
                  <li key={p.symbol}>
                    <button
                      onClick={() => {
                        setSymbol(p.symbol);
                        document.getElementById(pricePanel)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'nearest',
                        });
                      }}
                      title={`${p.symbol}: ${signed(p.pnl)} unrealized, ${percent(p.returnPct)}, ${money(p.value)} market value`}
                    >
                      <b>{p.symbol}</b>
                      <div className="position-bar-track">
                        <i
                          className={tone(p.pnl)}
                          style={{
                            left:
                              p.pnl !== null && p.pnl < 0
                                ? `${50 - (Math.abs(p.pnl) / Math.max(...positions.map((p) => Math.abs(p.pnl ?? 0)), 0.01)) * 48}%`
                                : '50%',
                            width: `${(Math.abs(p.pnl ?? 0) / Math.max(...positions.map((p) => Math.abs(p.pnl ?? 0)), 0.01)) * 48}%`,
                          }}
                        />
                      </div>
                      <span className={tone(p.pnl)}>{signed(p.pnl)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <footer>
              Bars left of center = loss. Right = profit. Select a stock to
              chart it.
            </footer>
          </Card>
          <Card
            title="What is the fly leaning toward?"
            note="Latest measured output · assigned BUY / SELL channels"
          >
            {latest ? (
              <>
                <div className="trade-latest">
                  <b>{latest.symbol}</b>
                  <span
                    className={`trade-action ${latest.action.toLowerCase()}`}
                  >
                    {latest.action}
                  </span>
                  <small>{latest.status}</small>
                </div>
                <SignalBars decision={latest} />
                <p className="trade-one-line">{latest.reason}</p>
                <button
                  className="trade-inspect"
                  onClick={() => onTrace?.(latest.id)}
                >
                  Inspect this decision <ChevronRight size={14} />
                </button>
              </>
            ) : (
              <div className="trade-chart-empty">
                <b>Waiting for a neural decision</b>
              </div>
            )}
          </Card>
        </div>
      )}
      <Card
        title={
          view === 'ledger'
            ? 'Executed buying & selling'
            : 'The fly’s signals over time'
        }
        note={
          view === 'ledger'
            ? `${data.demo ? 'Simulated' : 'Broker-reported'} fills only · includes partially filled orders with recorded fills`
            : 'Each point is a recorded evaluation; the stock can change between points'
        }
      >
        {view === 'ledger' ? (
          <Graph
            points={fillPoints}
            series={[
              { key: 'buy', label: 'Bought', color: GREEN, format: money },
              {
                key: 'sell',
                label: 'Sold',
                color: RED,
                format: (v) => money(v === null ? null : Math.abs(v)),
              },
            ]}
            label="Executed buy and sell notionals"
            columns
            referenceLabel="No traded value"
            reference={0}
            demo={data.demo}
          />
        ) : (
          <Graph
            points={decisions.map((d) => ({
              at: d.at,
              values: { buy: d.buy, sell: d.sell },
              label: `${d.symbol} · ${d.action}`,
            }))}
            series={[
              {
                key: 'buy',
                label: 'BUY',
                color: GREEN,
                format: (v) => `${number(v)} Hz`,
              },
              {
                key: 'sell',
                label: 'SELL',
                color: RED,
                format: (v) => `${number(v)} Hz`,
              },
            ]}
            label="Buy and sell output firing rates"
            gaps
            reference={20}
            demo={data.demo}
          />
        )}
        <footer>
          <span>
            <i className="gain-dot" /> BUY
          </span>
          <span>
            <i className="loss-dot" /> SELL
          </span>
          <span>
            {view === 'ledger'
              ? `${data.fills.length} recorded fills`
              : `${decisions.length} of ${data.totalDecisions} evaluations`}
          </span>
        </footer>
      </Card>
      {view === 'analysis' && (
        <div className="trade-card-grid">
          <Card
            title="How far below the peak?"
            note="Drawdown within the saved samples · 0% is a new high"
          >
            <Graph
              points={equity.map((s) => ({
                at: s.at,
                values: { drawdown: s.drawdown },
              }))}
              series={[
                {
                  key: 'drawdown',
                  label: 'Drawdown',
                  color: RED,
                  format: percent,
                },
              ]}
              label="Observed account drawdown"
              gaps
              referenceLabel="Peak"
              reference={0}
              demo={data.demo}
            />
          </Card>
          <Card
            title="Where is the capital?"
            note="Current marked value · not a return"
          >
            <div className="trade-allocation">
              <div>
                <b>Cash</b>
                <strong>{money(data.cash)}</strong>
              </div>
              <div className="allocation-track">
                <i
                  style={{
                    width: `${data.equity && data.cash !== null ? Math.max(0, Math.min(100, (data.cash / data.equity) * 100)) : 0}%`,
                  }}
                />
              </div>
              <div>
                <b>In stocks</b>
                <strong>{money(allocationTotal)}</strong>
              </div>
              {positions.slice(0, 8).map((p) => (
                <div key={p.symbol}>
                  <span>{p.symbol}</span>
                  <span>
                    {money(p.value)} ·{' '}
                    {allocationTotal
                      ? (((p.value ?? 0) / allocationTotal) * 100).toFixed(1)
                      : '0'}
                    % of positions
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      <p className="trade-scope">
        {data.demo
          ? 'Synthetic demonstration. Prices, signals and fills are simulated.'
          : 'Charts use the received account samples, decisions and broker fill records. Missing observations are not live quotes.'}
      </p>
    </div>
  );
}
