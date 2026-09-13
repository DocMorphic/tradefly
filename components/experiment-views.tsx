'use client';
import { useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Minus,
  Info,
  Download,
  ChevronRight,
} from 'lucide-react';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  SESSION,
  RANDOM_SESSION,
  metrics,
  outcome,
  report,
  usd,
  signed,
  csv,
  decisionsCsv,
  MIN_RATE,
  MIN_MARGIN,
  referenceDrawdown,
  type Frame,
} from '@/lib/experiment';

type Id = 'overview' | 'brain' | 'ledger' | 'analysis' | 'notes';
const pct = (v: number) => `${v.toFixed(3)}%`;
const definitions: Record<string, string> = {
  'Account value':
    'Available cash + shares × current price. This is the total marked value of the paper account.',
  'Net profit / loss':
    'Account value minus the $10,000 starting balance. Includes open-position P&L, fees, and slippage already reflected in fill prices.',
  'Available cash':
    'Paper cash remaining after buys, sells, and fees. No margin or borrowing is used.',
  'Position value':
    'Number of shares held × the current observed price. This amount is exposed to changes in AAPL.',
  'Average cost':
    'Remaining cost basis ÷ shares held. Includes fees paid to acquire those shares.',
  'Cost basis':
    'Amount paid for the remaining shares, including their entry fees. Realized sales remove average cost from this balance.',
  'Open P&L':
    'Current position value minus its remaining cost basis. This gain or loss changes with the market until the shares are sold.',
  'Realized P&L':
    'Proceeds from sell fills minus their fees and average acquisition cost. Entry fees are included in acquisition cost.',
  Exposure:
    'Current position value ÷ account value. New buys are limited to 10% entry exposure; price changes can move existing exposure.',
  'Worst drawdown':
    'Largest percentage decline from an earlier peak in account value, over the replay interval shown.',
  'Win rate':
    'Profitable sell fills ÷ all sell fills. Partial reductions count as sell fills, not complete position cycles.',
  'Profit factor':
    'Sum of profitable sell-fill P&L ÷ absolute sum of losing sell-fill P&L. Undefined when there are no realized losses.',
  Turnover:
    'Total executed buy and sell notional ÷ $10,000 starting cash. Counts both sides of a trade.',
  'Fill rate':
    'Executed orders ÷ resolved directional decisions. Excludes HOLD and the latest pending intent.',
  Fees: '0.01% (1 basis point) of each executed order’s notional. Already included in P&L; do not subtract again.',
  Slippage:
    'Adverse difference between the next observed price and modeled fill price, multiplied by shares. Assumed at 0.02% (2 basis points), already included in P&L.',
  'BUY rate':
    'Average output-pool firing rate assigned to BUY, in spikes per second (Hz). Generated demonstration data; no actual neurons are connected.',
  'SELL rate':
    'Average output-pool firing rate assigned to SELL, in spikes per second (Hz). Generated demonstration data; no actual neurons are connected.',
  Volume:
    'Synthetic shares traded during this five-minute observation. Not dollars and not Tradefly’s own order volume.',
};
function Label({ name, help }: { name: string; help?: string }) {
  const text = help ?? definitions[name];
  return (
    <span className="data-label">
      {name}
      {text && (
        <Popover>
          <PopoverTrigger
            className="definition-trigger"
            aria-label={`Explain ${name}`}
          >
            <Info size={13} />
          </PopoverTrigger>
          <PopoverContent className="definition-popover">
            <b>{name}</b>
            <p>{text}</p>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="stat">
      <Label name={label} />
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
function Facts({ rows }: { rows: [string, ReactNode, string?][] }) {
  return (
    <dl className="facts">
      {rows.map(([label, value, help]) => (
        <div key={label}>
          <dt>
            <Label name={label} help={help} />
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
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
function Export({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="text-button" onClick={onClick}>
      <Download size={14} />
      {label}
    </button>
  );
}
function save(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Rates({ frame }: { frame: Frame }) {
  return (
    <div className="pool-rates">
      {[
        ['BUY', frame.buyHz],
        ['SELL', frame.sellHz],
      ].map(([name, rate]) => (
        <div key={name}>
          <div>
            <Label name={`${name} rate`} />
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
      <div className="rate-scale">
        <span>0</span>
        <span>20 Hz threshold</span>
        <span>50 Hz</span>
      </div>
    </div>
  );
}
function Plot({
  frames,
  kind = 'pnl',
  onInspect,
}: {
  frames: Frame[];
  kind?: 'pnl' | 'rates';
  onInspect: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null),
    focus = frames[Math.min(hover ?? frames.length - 1, frames.length - 1)];
  const a = frames.map((f) => (kind === 'pnl' ? f.equity - 10000 : f.buyHz)),
    b = frames.map((f) => (kind === 'pnl' ? f.benchmark - 10000 : f.sellHz));
  const min = kind === 'rates' ? 0 : Math.min(-1, ...a, ...b) - 1,
    max = kind === 'rates' ? 50 : Math.max(1, ...a, ...b) + 1;
  const x = (i: number) => 48 + (i / Math.max(1, frames.length - 1)) * 640,
    y = (v: number) => 148 - ((v - min) / (max - min)) * 126;
  const path = (v: number[]) =>
    v.map((n, i) => `${i ? 'L' : 'M'}${x(i)},${y(n)}`).join(' ');
  return (
    <div className="data-plot">
      <div className="plot-readout">
        <b>{focus.time} ET</b>
        {kind === 'pnl' ? (
          <>
            <span>
              Portfolio <strong>{signed(focus.equity - 10000)}</strong>
            </span>
            <span>
              Buy & hold <strong>{signed(focus.benchmark - 10000)}</strong>
            </span>
          </>
        ) : (
          <>
            <span>
              BUY <strong>{focus.buyHz.toFixed(1)} Hz</strong>
            </span>
            <span>
              SELL <strong>{focus.sellHz.toFixed(1)} Hz</strong>
            </span>
          </>
        )}
      </div>
      <button
        className="chart-interaction"
        aria-label={`Inspect ${focus.time} decision from ${kind === 'pnl' ? 'profit' : 'output rate'} chart`}
        onClick={() => onInspect(focus.index)}
      >
        <svg
          viewBox="0 0 710 185"
          aria-label={
            kind === 'pnl'
              ? 'Cumulative profit or loss in US dollars'
              : 'Output rates in spikes per second'
          }
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(
              Math.max(
                0,
                Math.min(
                  frames.length - 1,
                  Math.round(
                    ((((e.clientX - r.left) / r.width) * 710 - 48) / 640) *
                      (frames.length - 1),
                  ),
                ),
              ),
            );
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 1, 2, 3].map((i) => {
            const v = min + ((max - min) * i) / 3;
            return (
              <g key={i}>
                <line
                  x1="48"
                  x2="688"
                  y1={y(v)}
                  y2={y(v)}
                  className="gridline"
                />
                <text x="0" y={y(v) + 4}>
                  {kind === 'pnl' ? `$${v.toFixed(0)}` : v.toFixed(0)}
                </text>
              </g>
            );
          })}
          {kind === 'rates' && (
            <line
              x1="48"
              x2="688"
              y1={y(20)}
              y2={y(20)}
              className="threshold-line"
            />
          )}
          <path d={path(a)} className="equity-line" />
          <path d={path(b)} className="benchmark-line" />
          <line
            x1={x(focus.index)}
            x2={x(focus.index)}
            y1="20"
            y2="150"
            className="crosshair"
          />
          <circle
            cx={x(focus.index)}
            cy={y(a[focus.index])}
            r="3"
            className="chart-dot"
          />
          {Array.from(
            new Set([
              0,
              Math.floor((frames.length - 1) / 2),
              frames.length - 1,
            ]),
          ).map((i) => (
            <text
              key={i}
              x={x(i)}
              y="178"
              textAnchor={i === 0 ? 'start' : 'end'}
            >
              {frames[i].time}
            </text>
          ))}
        </svg>
      </button>
      <div className="chart-legend">
        <span>
          <i />
          {kind === 'pnl' ? 'Demo portfolio · net' : 'BUY rate'}
        </span>
        <span>
          <i className="dashed" />
          {kind === 'pnl' ? '10% buy & hold · gross' : 'SELL rate'}
        </span>
        <span>{kind === 'pnl' ? 'USD' : 'Hz'} · ET</span>
      </div>
    </div>
  );
}
function Guide() {
  return (
    <div className="guide-grid compact-guide">
      <section>
        <h2>Read a decision</h2>
        <Facts
          rows={[
            [
              'BUY',
              'Buy pool leads',
              'The leading pool must reach at least 20 Hz and exceed the other pool by at least 8 Hz.',
            ],
            [
              'SELL',
              'Sell pool leads',
              'Uses the same threshold and lead requirements as BUY. Only shares already held can be sold.',
            ],
            [
              'HOLD',
              'Insufficient activity or lead',
              'No order is requested. Holding is a decision, not a failed trade.',
            ],
            [
              'Pending',
              'Next bar not available',
              'An intent cannot fill on the observation that created it.',
            ],
            [
              'Blocked',
              'Account constraint',
              'No holding to sell, or no room under the entry exposure limit.',
            ],
            [
              'Filled',
              'Order executed',
              'The next synthetic price determines the fill, with modeled slippage and fees.',
            ],
          ]}
        />
        <h2>Available data</h2>
        <Facts
          rows={[
            ['Prices and volume', 'Synthetic'],
            ['BUY / SELL rates', 'Synthetic'],
            ['Cash, positions, P&L', 'Calculated'],
            ['Actual neuron activity', 'Unavailable'],
            ['Fly trading performance', 'Unmeasured'],
            ['Broker orders', 'Disconnected'],
          ]}
        />
      </section>
      <section>
        <h2>Experiment settings</h2>
        <Facts
          rows={[
            ['Session', 'TF-001 · synthetic day'],
            ['Stock / currency', 'AAPL / USD'],
            ['Decision interval', '5 minutes'],
            ['Clock', '09:30–15:55 ET'],
            ['Starting cash', usd(10000)],
            ['Order maximum', usd(100)],
            ['Entry exposure limit', '10%'],
            ['Fee per fill', '0.01% / 1 bp'],
            ['Slippage per fill', '0.02% / 2 bps'],
            ['Shorts / leverage', 'Disabled'],
            ['Learning', 'Not implemented'],
            ['Planned dataset', 'FlyWire v783 · female'],
          ]}
        />
        <p className="source-note">
          The demo rates are generated independently of market observations. The
          real sensory encoder and brain are not connected.
        </p>
      </section>
    </div>
  );
}

export function ExperimentView({
  id,
  frames,
  selected,
  onSelect,
  onInspect,
  onOpen,
}: {
  id: Id;
  frames: Frame[];
  selected: number;
  onSelect: (i: number) => void;
  onInspect: (i: number) => void;
  onOpen: (id: Id) => void;
}) {
  const [filter, setFilter] = useState('ALL'),
    [ledgerTab, setLedgerTab] = useState('decisions');
  const f = frames.at(-1)!,
    m = metrics(frames),
    s = frames[Math.min(selected, frames.length - 1)],
    o = outcome(frames, s.index);
  const fills = f.trades,
    latest = outcome(frames, f.index),
    priceValue = f.quantity * f.price;
  function decisionTable(compact = false) {
    const rows = frames
      .filter((v) => compact || filter === 'ALL' || v.action === filter)
      .slice()
      .reverse()
      .slice(0, compact ? 4 : 78);
    return (
      <Table className="ledger data-table">
        <TableHeader>
          <TableRow>
            <TableHead>Time / ET</TableHead>
            <TableHead>Decision</TableHead>
            <TableHead>Price / USD</TableHead>
            {!compact && (
              <>
                <TableHead>BUY / Hz</TableHead>
                <TableHead>SELL / Hz</TableHead>
              </>
            )}
            <TableHead>Order status</TableHead>
            <TableHead>
              <span className="sr-only">Details</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v) => {
            const result = outcome(frames, v.index);
            return (
              <TableRow key={v.index}>
                <TableCell className="mono">{v.time}</TableCell>
                <TableCell>
                  <Badge action={v.action} />
                </TableCell>
                <TableCell className="numeric">{usd(v.price)}</TableCell>
                {!compact && (
                  <>
                    <TableCell className="numeric">
                      {v.buyHz.toFixed(1)}
                    </TableCell>
                    <TableCell className="numeric">
                      {v.sellHz.toFixed(1)}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <span
                    className={`order-state ${result.state.toLowerCase().replace(' ', '-')}`}
                  >
                    {result.state}
                  </span>
                </TableCell>
                <TableCell>
                  <button
                    className="text-button"
                    aria-label={`Inspect ${v.time} decision`}
                    onClick={() => onInspect(v.index)}
                  >
                    Inspect <ChevronRight size={13} />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                No {filter.toLowerCase()} decisions in this replay interval.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }
  function fillTable() {
    return (
      <Table className="ledger data-table">
        <TableHeader>
          <TableRow>
            {[
              'Fill ID',
              'Decision / ET',
              'Filled / ET',
              'Side',
              'Shares',
              'Price / USD',
              'Value / USD',
              'Fee / USD',
              'Slippage / USD',
              'Realized P&L',
            ].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fills
            .slice()
            .reverse()
            .map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <button
                    className="text-button"
                    onClick={() => onInspect(t.decision)}
                  >
                    {t.id}
                  </button>
                </TableCell>
                <TableCell>{SESSION[t.decision].time}</TableCell>
                <TableCell>{SESSION[t.filledAt].time}</TableCell>
                <TableCell>
                  <Badge action={t.action} />
                </TableCell>
                <TableCell className="numeric">
                  {t.quantity.toFixed(6)}
                </TableCell>
                <TableCell className="numeric">{t.price.toFixed(4)}</TableCell>
                <TableCell className="numeric">
                  {usd(t.price * t.quantity)}
                </TableCell>
                <TableCell className="numeric">{t.fee.toFixed(4)}</TableCell>
                <TableCell className="numeric">
                  {t.slippage.toFixed(4)}
                </TableCell>
                <TableCell className="numeric">
                  {t.action === 'SELL' ? signed(t.realized) : '—'}
                </TableCell>
              </TableRow>
            ))}
          {!fills.length && (
            <TableRow>
              <TableCell colSpan={10}>
                No executed orders yet. Advance the replay to see fills.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }
  const bar = (
    <div className="window-toolbar">
      <span>TF-001 · AAPL · {frames.length}/78 BARS</span>
      <span>{f.time} ET · DEMO DATA</span>
    </div>
  );
  if (id === 'overview')
    return (
      <>
        {bar}
        <div className="compact-heading">
          <h1>Account overview</h1>
          <button className="text-button" onClick={() => onOpen('notes')}>
            Data & settings <Info size={14} />
          </button>
        </div>
        <div className="stats-grid">
          <Stat
            label="Account value"
            value={usd(f.equity)}
            sub="Cash + position value"
          />
          <Stat
            label="Net profit / loss"
            value={signed(m.pnl)}
            sub={`${pct(m.returnPct)} since session start`}
          />
          <Stat
            label="Available cash"
            value={usd(f.cash)}
            sub={`${((f.cash / f.equity) * 100).toFixed(2)}% of account`}
          />
          <Stat
            label="Position value"
            value={usd(priceValue)}
            sub={`${m.exposure.toFixed(2)}% exposure`}
          />
        </div>
        <section className="holding-strip">
          <span className="holding-symbol">
            AAPL <small>Open position</small>
          </span>
          <span>
            <Label name="Shares" /> <b>{f.quantity.toFixed(4)}</b>
          </span>
          <span>
            <Label name="Average cost" />
            <b>{m.averageCost === null ? '—' : usd(m.averageCost)}</b>
          </span>
          <span>
            <Label name="Current price" />
            <b>{usd(f.price)}</b>
          </span>
          <span>
            <Label name="Open P&L" />
            <b>{signed(m.unrealized)}</b>
          </span>
        </section>
        <div className="overview-grid">
          <section className="equity-section">
            <div className="section-heading">
              <h2>Cumulative P&L</h2>
              <span className="muted">09:30–{f.time}</span>
            </div>
            <Plot frames={frames} onInspect={onInspect} />
            <div className="mini-metrics">
              <span>
                <Label name="Realized P&L" />
                <b>{signed(f.realized)}</b>
              </span>
              <span>
                <Label name="Worst drawdown" />
                <b>{pct(m.drawdown)}</b>
              </span>
              <span>
                <Label name="Fees" />
                <b>{usd(f.fees)}</b>
              </span>
            </div>
          </section>
          <section className="neural-preview">
            <div className="section-heading">
              <h2>Latest decision</h2>
              <Badge action={f.action} />
            </div>
            <Rates frame={f} />
            <Facts
              rows={[
                [
                  'Lead',
                  `${Math.abs(f.buyHz - f.sellHz).toFixed(1)} / 8.0 Hz`,
                  'Absolute difference between BUY and SELL rates. At least 8 Hz is required.',
                ],
                ['Order status', latest.state, latest.reason],
                ['Order maximum', usd(f.action === 'HOLD' ? 0 : 100)],
              ]}
            />
            <button className="wide-link" onClick={() => onInspect(f.index)}>
              See calculation <ArrowUpRight size={16} />
            </button>
          </section>
        </div>
        <div className="activity-strip">
          {[
            ['BUY', m.buyDecisions],
            ['SELL', m.sellDecisions],
            ['HOLD', m.holdDecisions],
            ['Filled', fills.length],
            ['Blocked', m.blocked],
            ['Pending', m.pending],
          ].map(([label, value]) => (
            <span key={label}>
              <b>{value}</b> {label}
            </span>
          ))}
        </div>
        <div className="section-heading recent-heading">
          <h2>Recent decisions</h2>
          <button className="text-button" onClick={() => onOpen('ledger')}>
            Full ledger <ArrowUpRight size={14} />
          </button>
        </div>
        {decisionTable(true)}
      </>
    );
  if (id === 'brain')
    return (
      <>
        {bar}
        <div className="compact-heading">
          <h1>Decision #{String(s.index + 1).padStart(3, '0')}</h1>
          <div className="decision-nav">
            <button
              onClick={() => onSelect(Math.max(0, s.index - 1))}
              disabled={s.index === 0}
              aria-label="Previous decision"
            >
              ←
            </button>
            <b>{s.time} ET</b>
            <button
              onClick={() => onSelect(Math.min(frames.length - 1, s.index + 1))}
              disabled={s.index === frames.length - 1}
              aria-label="Next decision"
            >
              →
            </button>
          </div>
        </div>
        <div className="decision-summary">
          <Badge action={s.action} />
          <span>{s.reason}</span>
          <span className="order-state">{o.state}</span>
        </div>
        <div className="inspector-grid">
          <section>
            <h2>01 · Market observation</h2>
            <Facts
              rows={[
                ['Symbol', 'AAPL'],
                ['Price', usd(s.price)],
                [
                  '5-minute change',
                  `${s.change >= 0 ? '+' : ''}${pct(s.change)}`,
                ],
                ['Volume', `${s.volume.toLocaleString()} shares`],
                ['Observation time', `${s.time} ET`],
                ['Observation source', 'Synthetic'],
              ]}
            />
            <h2>02 · Account at decision</h2>
            <Facts
              rows={[
                ['Available cash', usd(s.cash)],
                ['Shares held', s.quantity.toFixed(6)],
                ['Position value', usd(s.quantity * s.price)],
                ['Cost basis', usd(s.costBasis)],
                ['Account value', usd(s.equity)],
              ]}
            />
            <p className="source-note">
              No market-to-brain encoder is running. Observation values and
              output rates are separate demo fixtures.
            </p>
          </section>
          <section>
            <h2>03 · Output checks</h2>
            <Rates frame={s} />
            <Table className="check-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Condition</TableHead>
                  <TableHead>Observed</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Leading rate ≥ {MIN_RATE} Hz</TableCell>
                  <TableCell>
                    {Math.max(s.buyHz, s.sellHz).toFixed(1)} Hz
                  </TableCell>
                  <TableCell>
                    {Math.max(s.buyHz, s.sellHz) >= MIN_RATE ? 'Pass' : 'Fail'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Lead ≥ {MIN_MARGIN} Hz</TableCell>
                  <TableCell>
                    {Math.abs(s.buyHz - s.sellHz).toFixed(1)} Hz
                  </TableCell>
                  <TableCell>
                    {Math.abs(s.buyHz - s.sellHz) >= MIN_MARGIN
                      ? 'Pass'
                      : 'Fail'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <h2>04 · Execution outcome</h2>
            <Facts
              rows={[
                ['Status', o.state],
                ['Reason', o.reason],
                [
                  'Requested value',
                  s.action === 'HOLD' ? 'No order' : 'Up to $100.00',
                ],
                ...(o.fill
                  ? ([
                      ['Fill ID', o.fill.id],
                      ['Filled at', `${SESSION[o.fill.filledAt].time} ET`],
                      ['Fill price', `${o.fill.price.toFixed(4)} USD`],
                      ['Filled shares', o.fill.quantity.toFixed(6)],
                      ['Executed value', usd(o.fill.price * o.fill.quantity)],
                      ['Fees', `${o.fill.fee.toFixed(4)} USD`],
                      ['Slippage', `${o.fill.slippage.toFixed(4)} USD`],
                      [
                        'Realized P&L',
                        o.fill.action === 'SELL'
                          ? signed(o.fill.realized)
                          : '— (buy fill)',
                      ],
                    ] as [string, ReactNode][])
                  : []),
              ]}
            />
          </section>
        </div>
        <section className="full-width-section">
          <div className="section-heading">
            <h2>Output-rate history</h2>
            <span className="muted">
              Generated rates · through selected decision
            </span>
          </div>
          <Plot
            frames={frames.slice(0, s.index + 1)}
            kind="rates"
            onInspect={onInspect}
          />
        </section>
        <details className="raw-record">
          <summary>Raw observation & execution record</summary>
          <pre>
            {JSON.stringify(
              {
                source: 'synthetic-demo',
                observation: { ...s, trades: undefined },
                outcome: o,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </>
    );
  if (id === 'ledger')
    return (
      <>
        {bar}
        <div className="compact-heading">
          <h1>Trade ledger</h1>
          <div className="export-actions">
            <Export
              label="Decisions CSV"
              onClick={() =>
                save('tradefly-decisions.csv', decisionsCsv(frames), 'text/csv')
              }
            />
            <Export
              label="Fills CSV"
              onClick={() =>
                save('tradefly-fills.csv', csv(frames), 'text/csv')
              }
            />
          </div>
        </div>
        <div className="activity-strip">
          {[
            ['Decisions', frames.length],
            ['Filled', fills.length],
            ['Blocked', m.blocked],
            ['Pending', m.pending],
            ['No order', m.holdDecisions],
          ].map(([k, v]) => (
            <span key={k}>
              <b>{v}</b> {k}
            </span>
          ))}
        </div>
        <Tabs
          value={ledgerTab}
          onValueChange={(v) => setLedgerTab(String(v))}
          className="filter-tabs ledger-tabs"
        >
          <TabsList>
            <TabsTrigger value="decisions">
              Decisions ({frames.length})
            </TabsTrigger>
            <TabsTrigger value="fills">
              Executed fills ({fills.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="decisions">
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(String(v))}
              className="filter-tabs"
            >
              <TabsList>
                {['ALL', 'BUY', 'SELL', 'HOLD'].map((v) => (
                  <TabsTrigger key={v} value={v}>
                    {v === 'ALL' ? 'All' : v}
                  </TabsTrigger>
                ))}
              </TabsList>
              {['ALL', 'BUY', 'SELL', 'HOLD'].map((v) => (
                <TabsContent key={v} value={v}>
                  {decisionTable()}
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
          <TabsContent value="fills">
            {fillTable()}
            <p className="table-footnote">
              Fees and slippage are already included in returns. “—” means a buy
              has no realized sale P&L.
            </p>
          </TabsContent>
        </Tabs>
      </>
    );
  if (id === 'analysis') {
    const random = RANDOM_SESSION[frames.length - 1],
      rm = metrics(RANDOM_SESSION.slice(0, frames.length));
    return (
      <>
        {bar}
        <div className="compact-heading">
          <h1>Performance</h1>
          <Export
            label="Full report JSON"
            onClick={() =>
              save(
                'tradefly-report.json',
                JSON.stringify(report(frames), null, 2),
                'application/json',
              )
            }
          />
        </div>
        <div className="stats-grid">
          <Stat
            label="Net profit / loss"
            value={signed(m.pnl)}
            sub={pct(m.returnPct)}
          />
          <Stat
            label="Worst drawdown"
            value={pct(m.drawdown)}
            sub="Largest loss from an earlier peak"
          />
          <Stat
            label="Win rate"
            value={m.winRate === null ? '—' : `${m.winRate.toFixed(1)}%`}
            sub={`${m.winners} winning / ${m.closed} sell fills`}
          />
          <Stat
            label="Fill rate"
            value={m.fillRate === null ? '—' : `${m.fillRate.toFixed(1)}%`}
            sub={`${fills.length} filled / ${fills.length + m.blocked} resolved intents`}
          />
        </div>
        <section className="full-width-section">
          <h2>Portfolio comparisons</h2>
          <Table className="comparison">
            <TableHeader>
              <TableRow>
                {[
                  'Portfolio',
                  'P&L / USD',
                  'Return',
                  'Drawdown',
                  'Fills',
                  'Costs included',
                ].map((k) => (
                  <TableHead key={k}>{k}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                [
                  'Demo portfolio',
                  signed(m.pnl),
                  pct(m.returnPct),
                  pct(m.drawdown),
                  String(fills.length),
                  'Yes',
                ],
                [
                  'Random control',
                  signed(random.equity - 10000),
                  pct(rm.returnPct),
                  pct(rm.drawdown),
                  String(random.trades.length),
                  'Yes',
                ],
                [
                  'Buy & hold · 10%',
                  signed(f.benchmark - 10000),
                  pct((f.benchmark / 10000 - 1) * 100),
                  pct(referenceDrawdown(frames)),
                  '—',
                  'No · gross reference',
                ],
                ['Cash', usd(0), '0.000%', '0.000%', '0', 'No trades'],
                [
                  'Shuffled brain',
                  'Not run',
                  '—',
                  '—',
                  '—',
                  'Brain disconnected',
                ],
              ].map((row) => (
                <TableRow key={row[0]}>
                  {row.map((v, i) => (
                    <TableCell key={i}>{v}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="table-footnote">
            Same price interval; different exposure and trade counts. The
            buy-and-hold reference starts with $1,000 invested and excludes
            costs.
          </p>
        </section>
        <div className="analysis-grid">
          <section>
            <h2>Profit breakdown</h2>
            <Facts
              rows={[
                ['Realized P&L', signed(f.realized)],
                ['Open P&L', signed(m.unrealized)],
                ['Net profit / loss', signed(m.pnl)],
                ['Fees', usd(f.fees)],
                ['Slippage', usd(m.slippage)],
                [
                  'Profitable sells',
                  `${m.winners} / ${signed(m.grossProfit)}`,
                  'Count and sum of positive realized sell-fill P&L.',
                ],
                [
                  'Losing sells',
                  `${m.losers} / ${signed(-m.grossLoss)}`,
                  'Count and sum of negative realized sell-fill P&L.',
                ],
                ['Breakeven sells', String(m.breakeven)],
                [
                  'Profit factor',
                  m.profitFactor === null
                    ? '— (no realized losses)'
                    : m.profitFactor.toFixed(2),
                ],
                [
                  'Mean sell P&L',
                  m.meanSellPnl === null
                    ? '— (no sells)'
                    : signed(m.meanSellPnl),
                  'Total realized P&L ÷ number of sell fills.',
                ],
              ]}
            />
          </section>
          <section>
            <h2>Trading efficiency</h2>
            <Facts
              rows={[
                [
                  'Total traded value',
                  usd(m.tradedNotional),
                  'Sum of executed shares × fill price for all buy and sell orders.',
                ],
                ['Turnover', `${m.turnover.toFixed(2)}%`],
                ['Exposure', `${m.exposure.toFixed(2)}%`],
                [
                  'BUY / SELL / HOLD',
                  `${m.buyDecisions} / ${m.sellDecisions} / ${m.holdDecisions}`,
                ],
                [
                  'Filled / blocked / pending',
                  `${fills.length} / ${m.blocked} / ${m.pending}`,
                ],
                [
                  'Buy fills / sell fills',
                  `${fills.filter((t) => t.action === 'BUY').length} / ${m.closed}`,
                ],
                ['Observation count', String(frames.length)],
                ['Brain compute time', 'Unmeasured'],
                ['Actual fly return', 'Unmeasured'],
              ]}
            />
            <p className="source-note">
              This is one synthetic session. Real profitability requires
              connected brain outputs and repeated tests on unseen market data.
            </p>
          </section>
        </div>
      </>
    );
  }
  return (
    <>
      {bar}
      <div className="compact-heading">
        <h1>Data & definitions</h1>
        <a
          className="text-button"
          href="https://github.com/DocMorphic/tradefly"
          target="_blank"
          rel="noreferrer"
        >
          Repository <ArrowUpRight size={14} />
        </a>
      </div>
      <Guide />
      <section className="full-width-section">
        <h2>Metric dictionary</h2>
        <Table className="dictionary">
          <TableBody>
            {Object.entries(definitions).map(([name, description]) => (
              <TableRow key={name}>
                <TableCell>{name}</TableCell>
                <TableCell>{description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
