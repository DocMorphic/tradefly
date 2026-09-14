'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import {
  holdingColumns,
  holdingsWithFills,
  selectHoldings,
  type HoldingSort,
} from '@/lib/holdings';
import type { BackendSnapshot } from '@/lib/backend';

const number = (v?: string, money = false) => {
  if (!v || !Number.isFinite(Number(v))) return '—';
  return new Intl.NumberFormat(
    undefined,
    money
      ? { style: 'currency', currency: 'USD' }
      : { maximumFractionDigits: 3 },
  ).format(Number(v));
};
export function HoldingsTable({ snapshot }: { snapshot: BackendSnapshot }) {
  const [sort, setSort] = useState<HoldingSort>('symbol');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [query, setQuery] = useState('');
  const [pnl, setPnl] = useState<'all' | 'profit' | 'loss'>('all');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const rows = selectHoldings(
    holdingsWithFills(snapshot.positions, snapshot.orders),
    { sort, direction, query, pnl, from, to },
  );
  const table = useRef<HTMLTableElement>(null);
  const [limit, setLimit] = useState<number>();
  useEffect(() => {
    const node = table.current;
    if (!node) return;
    const measure = () => {
      const firstTen = Array.from(node.tBodies[0]?.rows ?? []).slice(0, 10);
      setLimit(
        (node.tHead?.getBoundingClientRect().height ?? 0) +
          firstTen.reduce(
            (sum, row) => sum + row.getBoundingClientRect().height,
            0,
          ) +
          1,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [rows.length]);
  function choose(column: HoldingSort) {
    if (sort === column) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else {
      setSort(column);
      setDirection(column === 'symbol' ? 'asc' : 'desc');
    }
  }
  return (
    <section className="holdings-section" aria-label="Holdings">
      <div className="holdings-heading">
        <h3>Holdings</h3>
        <span>
          {rows.length} of {snapshot.positions.length} positions
        </span>
      </div>
      <div
        className="holdings-filters"
        role="region"
        aria-label="Holdings filters, scroll horizontally in narrow windows"
        tabIndex={0}
      >
        <label>
          Symbol
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find…"
          />
        </label>
        <label>
          Sort by
          <NativeSelect
            value={sort}
            onChange={(e) => setSort(e.target.value as HoldingSort)}
          >
            {holdingColumns.map(([key, label]) => (
              <NativeSelectOption key={key} value={key}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label>
          Order
          <NativeSelect
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'asc' | 'desc')}
          >
            <NativeSelectOption value="asc">Ascending ↑</NativeSelectOption>
            <NativeSelectOption value="desc">Descending ↓</NativeSelectOption>
          </NativeSelect>
        </label>
        <label>
          P&amp;L
          <NativeSelect
            value={pnl}
            onChange={(e) => setPnl(e.target.value as typeof pnl)}
          >
            <NativeSelectOption value="all">All positions</NativeSelectOption>
            <NativeSelectOption value="profit">In profit</NativeSelectOption>
            <NativeSelectOption value="loss">In loss</NativeSelectOption>
          </NativeSelect>
        </label>
        <label>
          Fill from
          <Input
            type="datetime-local"
            step="1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Fill through
          <Input
            type="datetime-local"
            step="1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setPnl('all');
            setFrom('');
            setTo('');
            setSort('symbol');
            setDirection('asc');
          }}
        >
          Reset
        </button>
      </div>
      {from && to && Date.parse(from) > Date.parse(to) && (
        <p role="status">Choose an end time after the start time.</p>
      )}
      <div
        className="paper-table holdings-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable holdings, sortable column headings"
        style={{ maxHeight: rows.length > 10 ? (limit ?? '34rem') : undefined }}
      >
        <table ref={table}>
          <thead>
            <tr>
              {holdingColumns.map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort === key
                      ? direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button type="button" onClick={() => choose(key)}>
                    {label}
                    {sort === key ? (
                      direction === 'asc' ? (
                        <ArrowUp aria-hidden="true" />
                      ) : (
                        <ArrowDown aria-hidden="true" />
                      )
                    ) : (
                      <ArrowUpDown aria-hidden="true" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol}>
                <td>{row.symbol}</td>
                <td>{number(row.qty)}</td>
                <td>{number(row.avg_entry_price, true)}</td>
                <td>{number(row.current_price, true)}</td>
                <td>{number(row.market_value, true)}</td>
                <td data-profit={Number(row.unrealized_pl) >= 0}>
                  {number(row.unrealized_pl, true)}
                </td>
                <td data-profit={Number(row.unrealized_plpc) >= 0}>
                  {row.unrealized_plpc &&
                  Number.isFinite(Number(row.unrealized_plpc))
                    ? `${(Number(row.unrealized_plpc) * 100).toFixed(2)}%`
                    : '—'}
                </td>
                <td>
                  {row.last_fill ? (
                    <time dateTime={row.last_fill}>
                      {new Date(row.last_fill).toLocaleString()}
                    </time>
                  ) : (
                    'Unavailable'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="paper-empty">
            {snapshot.positions.length
              ? 'No holdings match these filters.'
              : snapshot.broker.connected
                ? 'No open positions.'
                : 'Connect Alpaca to read holdings.'}
          </p>
        )}
      </div>
      <p className="holdings-note">
        {rows.length > 10 ? 'Scroll inside the table for more holdings. ' : ''}
        Fill times use your local timezone and the latest available broker fills
        in this desktop’s order history (up to 100 orders). They are not
        position opening dates. Missing times sort last and are excluded by date
        filters.
      </p>
    </section>
  );
}
