'use client';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { flushSync } from 'react-dom';
import { Slider } from '@/components/ui/slider';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  Download,
  FlaskConical,
  Grid2X2,
  Maximize2,
  Minus,
  Network,
  Pause,
  Play,
  RotateCcw,
  Square,
  Table2,
  X,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  SESSION,
  RANDOM_SESSION,
  metrics,
  usd,
  signed,
  csv,
  type Frame,
} from '@/lib/experiment';

type AppId = 'overview' | 'brain' | 'ledger' | 'analysis' | 'notes';
const APPS = {
  overview: { title: 'Observation desk', icon: Grid2X2 },
  brain: { title: 'Decision inspector', icon: Network },
  ledger: { title: 'Trade ledger', icon: Table2 },
  analysis: { title: 'Performance lab', icon: BarChart3 },
  notes: { title: 'Field guide', icon: BookOpen },
};
const APP_IDS = Object.keys(APPS) as AppId[];
type Win = {
  id: AppId;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
};
const DEFAULT_WINDOW: Win = {
  id: 'overview',
  x: 132,
  y: 28,
  z: 1,
  minimized: false,
  maximized: false,
};
function Badge({ action }: { action: string }) {
  return (
    <span className={`action action-${action.toLowerCase()}`}>
      {action === 'BUY' ? (
        <ArrowUpRight size={13} />
      ) : action === 'SELL' ? (
        <ArrowDownLeft size={13} />
      ) : (
        <Minus size={13} />
      )}{' '}
      {action}
    </span>
  );
}
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function SignalMap({
  frame,
  large = false,
}: {
  frame: Frame;
  large?: boolean;
}) {
  return (
    <svg
      className={`signal-map ${large ? 'large' : ''}`}
      viewBox="0 0 360 170"
      aria-label="Illustrative signal pathway, not an anatomical brain map"
    >
      {[0, 1, 2, 3, 4].flatMap((col) =>
        Array.from({ length: col === 2 ? 11 : 7 }, (_, row) => {
          const x = 27 + col * 76,
            y = 17 + row * (col === 2 ? 13 : 22);
          const active = (row * 3 + col + frame.index) % 5 < 2;
          return (
            <g key={`${col}-${row}`}>
              {col < 4 && (
                <>
                  <path
                    d={`M${x} ${y} L${x + 76} ${17 + ((row + col) % 7) * 22}`}
                    className={active ? 'wire active' : 'wire'}
                  />
                  <path
                    d={`M${x} ${y} L${x + 76} ${17 + ((row + 2) % 7) * 22}`}
                    className="wire"
                  />
                </>
              )}
              <circle
                cx={x}
                cy={y}
                r={active ? 3.5 : 2}
                className={active ? 'node active' : 'node'}
              />
            </g>
          );
        }),
      )}
    </svg>
  );
}
function PoolRates({ frame }: { frame: Frame }) {
  return (
    <div className="pool-rates">
      {[
        ['BUY', frame.buyHz],
        ['SELL', frame.sellHz],
      ].map(([name, rate]) => (
        <div key={name}>
          <div>
            <span>{name} pool</span>
            <b>
              {Number(rate).toFixed(1)} <small>Hz</small>
            </b>
          </div>
          <div className="rate-track">
            <i style={{ width: `${(Number(rate) / 50) * 100}%` }} />
            <em style={{ left: '40%' }} />
          </div>
        </div>
      ))}
      <small className="muted">Threshold 20 Hz · required lead 8 Hz</small>
    </div>
  );
}
function EquityChart({
  frames,
  onSelect,
}: {
  frames: Frame[];
  onSelect: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = frames.flatMap((f) => [f.equity, f.benchmark]);
  const low = Math.min(9998, ...all) - 2,
    high = Math.max(10002, ...all) + 2;
  const x = (i: number) => 42 + (i / 77) * 704,
    y = (n: number) => 172 - ((n - low) / (high - low)) * 144;
  const path = (key: 'equity' | 'benchmark') =>
    frames.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f[key])}`).join(' ');
  const focus = frames[Math.min(hover ?? frames.length - 1, frames.length - 1)];
  return (
    <div className="chart-wrap">
      <div className="chart-readout">
        <span>{focus.time} ET</span>
        <b>{usd(focus.equity)}</b>
        <span>portfolio equity</span>
      </div>
      <button
        className="chart-interaction"
        aria-label="Inspect selected chart decision"
        onClick={() => onSelect(focus.index)}
      >
        <svg
          viewBox="0 0 780 208"
          aria-label="Synthetic session equity compared with ten percent buy and hold"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(
              Math.max(
                0,
                Math.min(
                  frames.length - 1,
                  Math.round(
                    ((((e.clientX - r.left) / r.width) * 780 - 42) / 704) * 77,
                  ),
                ),
              ),
            );
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 1, 2, 3].map((i) => {
            const n = low + ((high - low) * i) / 3;
            return (
              <g key={i}>
                <line
                  x1="42"
                  x2="746"
                  y1={y(n)}
                  y2={y(n)}
                  className="gridline"
                />
                <text x="0" y={y(n) + 4}>
                  {(n - 10000).toFixed(0)}
                </text>
              </g>
            );
          })}
          <path
            d={`${path('equity')} L${x(frames.length - 1)},172 L42,172 Z`}
            className="chart-area"
          />
          <path d={path('benchmark')} className="benchmark-line" />
          <path d={path('equity')} className="equity-line" />
          <line
            x1={x(focus.index)}
            x2={x(focus.index)}
            y1="23"
            y2="172"
            className="crosshair"
          />
          <circle
            cx={x(focus.index)}
            cy={y(focus.equity)}
            r="4"
            className="chart-dot"
          />
          {[0, 18, 36, 54, 77].map((i) => (
            <text
              key={i}
              x={x(i)}
              y="199"
              textAnchor={i === 77 ? 'end' : 'start'}
            >
              {SESSION[i].time}
            </text>
          ))}
        </svg>
      </button>
      <div className="chart-legend">
        <span>
          <i />
          Demo portfolio
        </span>
        <span>
          <i className="dashed" />
          10% buy & hold
        </span>
        <small>P&L in USD · click to inspect</small>
      </div>
    </div>
  );
}
function download(name: string, contents: string, type: string) {
  const u = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export default function Desktop() {
  const [windows, setWindows] = useState<Win[]>([DEFAULT_WINDOW]);
  const top = useRef(1);
  const [cursor, setCursor] = useState(77),
    [selected, setSelected] = useState(77),
    [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const visible = SESSION.slice(0, cursor + 1),
    f = SESSION[cursor],
    selectedFrame = SESSION[Math.min(selected, cursor)],
    m = metrics(visible);
  const latest = useRef({ cursor, selected, metrics: m });
  useEffect(() => {
    latest.current = { cursor, selected: Math.min(selected, cursor), metrics: m };
  }, [cursor, selected, m]);
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              description: string;
              inputSchema: object;
              annotations: { readOnlyHint: boolean };
              execute: (input: unknown) => unknown;
            },
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<typeof ctx.registerTool>[0]) => {
      try {
        Promise.resolve(
          ctx.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(console.error);
      } catch (error) {
        console.error(error);
      }
    };
    register({
      name: 'read_tradefly_demo_report',
      description:
        'Read calculated synthetic-session metrics and the current replay position. No actual fly, market feed, or broker is connected.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({ source: 'synthetic-demo', ...latest.current }),
    });
    register({
      name: 'inspect_tradefly_demo_decision',
      description:
        'Move the synthetic replay to a bar and open its decision inspector. Does not place orders or connect any external service.',
      inputSchema: {
        type: 'object',
        properties: { bar: { type: 'integer', minimum: 0, maximum: 77 } },
        required: ['bar'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        const bar = (input as { bar?: unknown })?.bar;
        if (
          typeof bar !== 'number' ||
          !Number.isInteger(bar) ||
          bar < 0 ||
          bar > 77
        )
          throw new Error('bar must be an integer between 0 and 77');
        flushSync(() => {
          setCursor(bar);
          setSelected(bar);
          setPlaying(false);
          setWindows((ws) =>
            ws.some((w) => w.id === 'brain')
              ? ws.map((w) =>
                  w.id === 'brain'
                    ? { ...w, minimized: false, z: ++top.current }
                    : w,
                )
              : [
                  ...ws,
                  {
                    ...DEFAULT_WINDOW,
                    id: 'brain',
                    x: 156,
                    y: 52,
                    z: ++top.current,
                  },
                ],
          );
        });
        return {
          source: 'synthetic-demo',
          bar,
          action: SESSION[bar].action,
          reason: SESSION[bar].reason,
        };
      },
    });
    return () => lifecycle.abort();
  }, []);
  function open(id: AppId) {
    setWindows((ws) =>
      ws.some((w) => w.id === id)
        ? ws.map((w) =>
            w.id === id ? { ...w, minimized: false, z: ++top.current } : w,
          )
        : [
            ...ws,
            {
              ...DEFAULT_WINDOW,
              id,
              x: 155 + (ws.length % 3) * 24,
              y: 42 + (ws.length % 3) * 24,
              z: ++top.current,
            },
          ],
    );
  }
  function update(id: AppId, changes: Partial<Win>) {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, ...changes } : w)));
  }
  function inspect(i: number) {
    setSelected(i);
    open('brain');
  }
  function reset() {
    setPlaying(false);
    setCursor(0);
    setSelected(0);
  }
  useEffect(() => {
    if (!playing || cursor >= 77) return;
    const timer = setTimeout(() => {
      setCursor(cursor + 1);
      if (cursor + 1 === 77) setPlaying(false);
    }, 550);
    return () => clearTimeout(timer);
  }, [playing, cursor]);
  function toggleReplay() {
    if (cursor === 77) {
      setCursor(0);
      setSelected(0);
    }
    setPlaying((p) => !p);
  }
  function ledger(compact = false) {
    const rows = visible
      .filter((v) => compact || filter === 'ALL' || v.action === filter)
      .slice()
      .reverse();
    return (
      <>
        <Table className="ledger">
          <TableHeader>
            <TableRow>
              <TableHead>Time / ET</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Decision</TableHead>
              {!compact && <TableHead>Output pools</TableHead>}
              <TableHead>
                {compact ? 'Evidence' : 'Execution of intent'}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, compact ? 4 : 78).map((v) => {
              const fill = f.trades.find((t) => t.decision === v.index);
              return (
                <TableRow key={v.index}>
                  <TableCell className="mono">{v.time}</TableCell>
                  <TableCell>
                    AAPL <small className="muted">{usd(v.price)}</small>
                  </TableCell>
                  <TableCell>
                    <Badge action={v.action} />
                  </TableCell>
                  {!compact && (
                    <TableCell className="mono">
                      {v.buyHz.toFixed(1)} / {v.sellHz.toFixed(1)} Hz
                    </TableCell>
                  )}
                  <TableCell>
                    <button
                      className="text-button"
                      onClick={() => inspect(v.index)}
                    >
                      {compact
                        ? 'Inspect'
                        : fill
                          ? `${fill.quantity.toFixed(4)} shares @ ${usd(fill.price)}`
                          : v.action === 'HOLD'
                            ? 'No order'
                            : v.index === cursor
                              ? 'Awaiting next bar'
                              : 'Blocked by constraints'}{' '}
                      <ChevronRight size={14} />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </>
    );
  }
  function content(id: AppId): ReactNode {
    if (id === 'overview')
      return (
        <>
          <div className="window-toolbar">
            <span>
              <span className="status-dot" /> DEMONSTRATION / 001
            </span>
            <button className="text-button" onClick={() => open('notes')}>
              About this session <ChevronRight size={14} />
            </button>
          </div>
          <div className="overview-title">
            <div>
              <p className="eyebrow">THE OBSERVATION DESK</p>
              <h1>
                Small brain.
                <br />
                <em>Open books.</em>
              </h1>
            </div>
            <div className="session-stamp">
              <span>AAPL / 5 MIN</span>
              <strong>
                {f.time} <small>ET</small>
              </strong>
              <span>SYNTHETIC SESSION</span>
            </div>
          </div>
          <div className="stats-grid">
            <Stat
              label="Portfolio value"
              value={usd(f.equity)}
              detail="$10,000 starting paper cash"
            />
            <Stat
              label="Net return"
              value={signed(m.pnl)}
              detail={`${m.returnPct.toFixed(3)}% after modeled costs`}
            />
            <Stat
              label="Maximum drawdown"
              value={`${m.drawdown.toFixed(3)}%`}
              detail="Largest peak-to-trough loss"
            />
            <Stat
              label="Executed trades"
              value={String(f.trades.length).padStart(2, '0')}
              detail={`${visible.filter((v) => v.action === 'HOLD').length} hold decisions`}
            />
          </div>
          <div className="overview-grid">
            <section className="equity-section">
              <div className="section-heading">
                <h2>Equity curve</h2>
                <span className="eyebrow">ONE SESSION</span>
              </div>
              <EquityChart frames={visible} onSelect={inspect} />
            </section>
            <section className="neural-preview">
              <div className="section-heading">
                <h2>Inside the decision</h2>
                <Badge action={f.action} />
              </div>
              <SignalMap frame={f} />
              <PoolRates frame={f} />
              <button className="wide-link" onClick={() => inspect(cursor)}>
                Trace this decision <ArrowUpRight size={17} />
              </button>
            </section>
          </div>
          <div className="section-heading recent-heading">
            <h2>Decision journal</h2>
            <button className="text-button" onClick={() => open('ledger')}>
              All {visible.length} decisions <ArrowUpRight size={14} />
            </button>
          </div>
          {ledger(true)}
        </>
      );
    if (id === 'brain')
      return (
        <>
          <div className="window-toolbar">
            <span>
              DECISION #{String(selectedFrame.index + 1).padStart(3, '0')} /
              AAPL
            </span>
            <span>{selectedFrame.time} ET · FIXTURE RATES</span>
          </div>
          <div className="app-heading">
            <h1>Follow the signal.</h1>
            <p>The evidence behind a buy, sell, or hold.</p>
          </div>
          <div className="trace-selector">
            <button
              onClick={() =>
                setSelected(Math.max(0, Math.min(selected, cursor) - 1))
              }
              disabled={selectedFrame.index === 0}
            >
              ← Previous
            </button>
            <span className="mono">{selectedFrame.time} ET</span>
            <button
              onClick={() => setSelected(Math.min(cursor, selected + 1))}
              disabled={selectedFrame.index === cursor}
            >
              Next →
            </button>
          </div>
          <div className="trace-grid">
            <section>
              <span className="step-label">01 / MARKET OBSERVATION</span>
              <dl className="facts">
                <div>
                  <dt>Stock</dt>
                  <dd>AAPL</dd>
                </div>
                <div>
                  <dt>Last price</dt>
                  <dd>{usd(selectedFrame.price)}</dd>
                </div>
                <div>
                  <dt>Five-minute change</dt>
                  <dd>{selectedFrame.change.toFixed(3)}%</dd>
                </div>
                <div>
                  <dt>Volume</dt>
                  <dd>{selectedFrame.volume.toLocaleString()}</dd>
                </div>
              </dl>
              <p className="note">
                In the planned engine, a fixed encoder converts these
                observations into sensory spike rates. This demo uses generated
                output rates.
              </p>
              <span className="step-label">02 / NETWORK RESPONSE</span>
              <SignalMap frame={selectedFrame} large />
              <p className="diagram-caption">
                Illustrative signal diagram · not anatomical data
              </p>
            </section>
            <section>
              <span className="step-label">03 / READ THE OUTPUT</span>
              <PoolRates frame={selectedFrame} />
              <div className="decision-verdict">
                <Badge action={selectedFrame.action} />
                <h2>
                  {selectedFrame.action === 'HOLD'
                    ? 'No trade requested.'
                    : `${selectedFrame.action === 'BUY' ? 'Buy' : 'Sell'} intent decoded.`}
                </h2>
                <p>{selectedFrame.reason}</p>
              </div>
              <span className="step-label">04 / EXECUTION</span>
              <p className="note">
                {selectedFrame.action === 'HOLD'
                  ? 'A hold produces no order.'
                  : f.trades.some((t) => t.decision === selectedFrame.index)
                    ? 'The intent passed the paper constraints and filled on the following bar, including modeled slippage and fees.'
                    : selectedFrame.index === cursor
                      ? 'The next bar has not arrived in this replay. No fill is recorded.'
                      : 'The intent was blocked by the holding or exposure constraint. The neural decision was preserved in the journal.'}
              </p>
              <div className="callout">
                This is a decoder trace, not a claim about the fly’s intentions.
                Native “buy” and “sell” neurons do not exist.
              </div>
            </section>
          </div>
        </>
      );
    if (id === 'ledger')
      return (
        <>
          <div className="window-toolbar">
            <span>DECISIONS & FILLS / SYNTHETIC DATA</span>
            <button
              className="text-button"
              onClick={() =>
                download('tradefly-demo-trades.csv', csv(visible), 'text/csv')
              }
            >
              Export fills <Download size={14} />
            </button>
          </div>
          <div className="app-heading">
            <h1>The trade ledger.</h1>
            <p>
              Every decision stays visible, including holds and blocked orders.
            </p>
          </div>
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(String(v))}
            className="filter-tabs"
          >
            <TabsList>
              {['ALL', 'BUY', 'SELL', 'HOLD'].map((v) => (
                <TabsTrigger key={v} value={v}>
                  {v === 'ALL' ? 'All decisions' : v}
                </TabsTrigger>
              ))}
            </TabsList>
            {['ALL', 'BUY', 'SELL', 'HOLD'].map((v) => (
              <TabsContent key={v} value={v}>
                {ledger()}
              </TabsContent>
            ))}
          </Tabs>
        </>
      );
    if (id === 'analysis') {
      const random = RANDOM_SESSION[cursor];
      return (
        <>
          <div className="window-toolbar">
            <span>PERFORMANCE LAB / DEMO ONLY</span>
            <button
              className="text-button"
              onClick={() =>
                download(
                  'tradefly-demo-report.json',
                  JSON.stringify(
                    {
                      source: 'synthetic-demo',
                      bars: visible.length,
                      metrics: m,
                      frame: f,
                      parameters: {
                        initialCash: 10000,
                        orderNotional: 100,
                        exposureCap: 0.1,
                        feeBps: 1,
                        slippageBps: 2,
                      },
                    },
                    null,
                    2,
                  ),
                  'application/json',
                )
              }
            >
              Export report <Download size={14} />
            </button>
          </div>
          <div className="app-heading">
            <h1>Does the wiring pay?</h1>
            <p>
              A useful experiment needs a comparison, not just a green number.
            </p>
          </div>
          <div className="stats-grid">
            <Stat
              label="Net P&L"
              value={signed(m.pnl)}
              detail="Realized + open-position P&L"
            />
            <Stat
              label="Win rate"
              value={m.winRate === null ? '—' : `${m.winRate.toFixed(1)}%`}
              detail={`${m.closed} sell fills · average-cost basis`}
            />
            <Stat
              label="Turnover"
              value={`${m.turnover.toFixed(1)}%`}
              detail="Traded notional ÷ starting cash"
            />
            <Stat
              label="Current exposure"
              value={`${m.exposure.toFixed(1)}%`}
              detail="Position value ÷ portfolio equity"
            />
          </div>
          <div className="analysis-grid">
            <section>
              <h2>Same session. Different controls.</h2>
              <Table className="comparison">
                <TableHeader>
                  <TableRow>
                    <TableHead>Experiment</TableHead>
                    <TableHead>Net P&L</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ['Demo portfolio', signed(m.pnl), 'Fixture rates'],
                    [
                      'Buy & hold · 10% allocation',
                      signed(f.benchmark - 10000),
                      'Price reference¹',
                    ],
                    [
                      'Deterministic random control',
                      signed(random.equity - 10000),
                      'Matched order limits',
                    ],
                    ['Cash', usd(0), 'No exposure'],
                    ['Shuffled connectome', 'Not run', 'Brain not connected'],
                  ].map((row) => (
                    <TableRow key={row[0]}>
                      {row.map((v, i) => (
                        <TableCell key={i}>{v}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="note">
                ¹ Buy & hold is a gross price reference with 10% initial
                allocation. Demo and random execution include 2 bps slippage and
                1 bp fee per fill; their exposure and trade counts differ. These
                are descriptive comparisons, not proof of an edge.
              </p>
            </section>
            <section>
              <h2>Where the money went</h2>
              <dl className="facts">
                <div>
                  <dt>Realized P&L</dt>
                  <dd>{signed(f.realized)}</dd>
                </div>
                <div>
                  <dt>Unrealized P&L</dt>
                  <dd>{signed(m.unrealized)}</dd>
                </div>
                <div>
                  <dt>Fees paid</dt>
                  <dd>{usd(f.fees)}</dd>
                </div>
                <div>
                  <dt>Maximum drawdown</dt>
                  <dd>{m.drawdown.toFixed(3)}%</dd>
                </div>
                <div>
                  <dt>Profit factor</dt>
                  <dd>
                    {m.profitFactor === null
                      ? 'Not defined'
                      : m.profitFactor.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt>Brain compute time</dt>
                  <dd>Not measured</dd>
                </div>
              </dl>
              <div className="callout">
                <b>Actual fly profitability: unknown.</b>
                <p>
                  This session tests the interface and accounting. A
                  profitability claim needs real neural outputs, held-out market
                  data, costs, and repeated control runs.
                </p>
              </div>
            </section>
          </div>
        </>
      );
    }
    return (
      <>
        <div className="window-toolbar">
          <span>TRADEFLY / FIELD GUIDE</span>
          <span>INDIGO GRAIN EDITION</span>
        </div>
        <div className="app-heading">
          <h1>A brain, with receipts.</h1>
          <p>How to read this desktop, and what is connected.</p>
        </div>
        <div className="guide-grid">
          <section>
            <h2>What you can explore</h2>
            <p>
              Click a decision in the journal to follow its output rates into an
              action. Use the session controls to replay one synthetic market
              day. Open the performance lab to inspect costs, drawdown,
              exposure, and comparison portfolios.
            </p>
            <h2>How a decision is made</h2>
            <ol>
              <li>
                Numerical market observations enter a fixed sensory encoder.
              </li>
              <li>Signals propagate through the simulated connectome.</li>
              <li>
                A fixed decoder reads two output pools. A pool must reach 20 Hz
                and lead by at least 8 Hz in this demo.
              </li>
              <li>
                The resulting intent passes through paper-account constraints.
                The executor can block a trade, but cannot invent one.
              </li>
            </ol>
            <p>
              Those thresholds are demonstration choices, not validated fly
              parameters. The brain has no intrinsic stock-market meaning.
            </p>
          </section>
          <section>
            <h2>Connection status</h2>
            <dl className="facts">
              <div>
                <dt>Interface & accounting</dt>
                <dd>Demonstration ready</dd>
              </div>
              <div>
                <dt>Fly simulator</dt>
                <dd>Not connected</dd>
              </div>
              <div>
                <dt>Market feed</dt>
                <dd>Synthetic fixture</dd>
              </div>
              <div>
                <dt>Paper broker</dt>
                <dd>Not connected</dd>
              </div>
              <div>
                <dt>Learning / plasticity</dt>
                <dd>Not implemented</dd>
              </div>
            </dl>
            <div className="callout">
              The planned starting point is the female FlyWire v783 brain and a
              Brian2 reference model. Neuron populations and full-network
              performance still need validation.
            </div>
            <h2>The next evidence we need</h2>
            <p>
              A reproduced neural response, a memory benchmark, a frozen market
              interface, and historical control runs. The desktop is ready to
              display that evidence as the engine is built.
            </p>
            <a
              className="text-button"
              href="https://github.com/DocMorphic/tradefly"
              target="_blank"
              rel="noreferrer"
            >
              Project repository <ArrowUpRight size={14} />
            </a>
          </section>
        </div>
      </>
    );
  }
  return (
    <main className="desktop">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="menubar">
        <button className="brand" onClick={() => open('overview')}>
          <Activity size={19} />
          <b>tradefly</b>
          <span>OS</span>
        </button>
        <nav aria-label="Desktop menu">
          <button onClick={() => open('ledger')}>Journal</button>
          <button onClick={() => open('analysis')}>Analysis</button>
          <button onClick={() => open('notes')}>Help</button>
        </nav>
        <div className="menu-right">
          <span className="status-dot" /> DEMO MODE{' '}
          <span className="menubar-divider" /> INDIGO GRAIN
        </div>
      </header>
      <div className="desktop-background" aria-hidden="true">
        <div className="wallpaper-word">
          tradefly<span>®</span>
        </div>
        <p>
          AN EXPERIMENT IN BIOLOGICAL COMPUTATION
          <br />
          OBSERVE. TRACE. QUESTION.
        </p>
        <span className="wallpaper-edition">
          VOL. 001
          <br />
          INDIGO GRAIN
        </span>
      </div>
      <nav className="desktop-icons" aria-label="Applications">
        {APP_IDS.map((id) => {
          const Icon = APPS[id].icon;
          return (
            <button key={id} onClick={() => open(id)}>
              <span className="desktop-icon">
                <Icon size={29} strokeWidth={1.3} />
              </span>
              <span>{APPS[id].title}</span>
            </button>
          );
        })}
      </nav>
      <div className="workspace" id="workspace" tabIndex={-1}>
        {windows
          .filter((w) => !w.minimized)
          .map((w) => (
            <DesktopWindow
              key={w.id}
              win={w}
              focus={() => update(w.id, { z: ++top.current })}
              update={(changes) => update(w.id, changes)}
              close={() => setWindows((ws) => ws.filter((v) => v.id !== w.id))}
            >
              {content(w.id)}
            </DesktopWindow>
          ))}
      </div>
      <footer className="taskbar">
        <button className="start-button" onClick={() => open('overview')}>
          <Grid2X2 size={17} /> tradefly
        </button>
        <div className="task-apps">
          {windows.map((w) => {
            const Icon = APPS[w.id].icon;
            return (
              <button
                key={w.id}
                className={!w.minimized ? 'running' : ''}
                onClick={() => open(w.id)}
              >
                <Icon size={16} />
                <span>{APPS[w.id].title}</span>
              </button>
            );
          })}
        </div>
        <div className="replay">
          <button
            title="Restart demo replay"
            aria-label="Restart demo replay"
            onClick={reset}
          >
            <RotateCcw size={15} />
          </button>
          <button
            title={playing ? 'Pause demo replay' : 'Play demo replay'}
            aria-label={playing ? 'Pause demo replay' : 'Play demo replay'}
            onClick={toggleReplay}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <Slider
            className="replay-slider"
            aria-label="Session replay position"
            min={0}
            max={77}
            step={1}
            value={[cursor]}
            onValueChange={(value) => {
              setPlaying(false);
              setCursor(Array.isArray(value) ? value[0] : value);
            }}
          />
          <span>{f.time} ET</span>
        </div>
      </footer>
    </main>
  );
}
function DesktopWindow({
  win,
  focus,
  update,
  close,
  children,
}: {
  win: Win;
  focus: () => void;
  update: (p: Partial<Win>) => void;
  close: () => void;
  children: ReactNode;
}) {
  const drag = useRef<{ x: number; y: number; wx: number; wy: number } | null>(
    null,
  );
  const Icon = APPS[win.id].icon;
  const style = {
    '--win-x': `${win.x}px`,
    '--win-y': `${win.y}px`,
    zIndex: win.z,
  } as CSSProperties;
  return (
    <section
      className={`app-window ${win.maximized ? 'maximized' : ''}`}
      style={style}
      aria-label={APPS[win.id].title}
      onPointerDown={focus}
    >
      <div
        className="titlebar"
        onDoubleClick={() => update({ maximized: !win.maximized })}
        onPointerDown={(e) => {
          if (
            (e.target as HTMLElement).closest('button') ||
            win.maximized ||
            window.innerWidth < 800
          )
            return;
          drag.current = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          update({
            x: Math.max(
              0,
              Math.min(
                window.innerWidth - 240,
                drag.current.wx + e.clientX - drag.current.x,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                window.innerHeight - 160,
                drag.current.wy + e.clientY - drag.current.y,
              ),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span>
          <Icon size={15} />
          {APPS[win.id].title}
        </span>
        <div className="titlebar-lines" />
        <div className="window-controls">
          <button
            aria-label={`Minimize ${APPS[win.id].title}`}
            onClick={() => update({ minimized: true })}
          >
            <Minus size={14} />
          </button>
          <button
            aria-label={`Maximize ${APPS[win.id].title}`}
            onClick={() => update({ maximized: !win.maximized })}
          >
            {win.maximized ? <Square size={12} /> : <Maximize2 size={12} />}
          </button>
          <button aria-label={`Close ${APPS[win.id].title}`} onClick={close}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="window-body">{children}</div>
      <div className="window-status">
        <span>
          <FlaskConical size={12} /> Synthetic demo · no fly or broker connected
        </span>
        <span>TF / {win.id.toUpperCase()}</span>
      </div>
    </section>
  );
}
