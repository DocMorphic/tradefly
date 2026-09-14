'use client';
import { useMemo } from 'react';
import type { BackendSnapshot } from '@/lib/backend';
import { comparePilot, type Trial } from '@/lib/replay-comparison';
const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
export function ReplayComparison({
  pilot,
}: {
  pilot: BackendSnapshot['pilot_replay'];
}) {
  const result = useMemo(() => {
    if (!pilot) return { error: 'No historical pilot has been received.' };
    try {
      return { data: comparePilot(pilot) };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'Comparison unavailable',
      };
    }
  }, [pilot]);
  if (!result.data || !pilot)
    return <p className="evidence-empty">{result.error}</p>;
  const r = result.data,
    rows = [r.fly, r.cash, r.buyHold],
    all = [...rows, ...r.random],
    low = Math.min(...all.flatMap((t) => t.equity)),
    high = Math.max(...all.flatMap((t) => t.equity));
  const path = (t: Trial) =>
    t.equity
      .map(
        (v, i) =>
          `${40 + (i / Math.max(1, t.equity.length - 1)) * 640},${230 - ((v - low) / Math.max(0.01, high - low)) * 200}`,
      )
      .join(' ');
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              source: pilot?.source,
              symbol: pilot?.symbol,
              date: pilot?.date,
              scope:
                'Single recorded intraday pilot; random-action seeds, not neural reruns',
              assumptions: {
                initialCash: pilot?.initial_cash,
                maxOrder: 100,
                entryExposurePercent: 10,
                slippageBps: 2,
                feeBps: 1,
                seeds: '1–30',
                finalLiquidation: false,
              },
              ...r,
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
    a.download = 'tradefly-pilot-comparison.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section>
      <div className="evidence-heading">
        <div>
          <h3>Same bars. Different action rules.</h3>
          <p>
            {pilot.symbol || 'Pilot stock'} · {pilot.date} · {r.bars} bars ·{' '}
            {money(pilot.initial_cash)} initial cash
          </p>
        </div>
        <button onClick={download}>Export comparison</button>
      </div>
      <p className="evidence-notice">
        Historical pilot only. The fly row replays recorded actions and matches
        the pilot's reported P&L within two cents. No brain reruns, new market
        observations or broker orders occur here.
      </p>
      <figure className="comparison-chart">
        <svg
          viewBox="0 0 740 270"
          role="img"
          aria-label="Pilot equity curves: fly, cash, buy and hold, and 30 random-action controls"
        >
          <text x="40" y="18">
            {money(high)}
          </text>
          <text x="40" y="256">
            {money(low)}
          </text>
          {r.random.map((t) => (
            <polyline
              key={t.name}
              points={path(t)}
              className="comparison-random"
            />
          ))}
          {rows.map((t, i) => (
            <polyline
              key={t.name}
              points={path(t)}
              className={`comparison-line comparison-${i}`}
            />
          ))}
        </svg>
        <figcaption>
          Indigo: recorded fly · dashed gray: cash · teal: buy-and-hold · faint
          lines: random actions. All end at the last bar's close.
        </figcaption>
      </figure>
      <div className="evidence-table">
        <table>
          <thead>
            <tr>
              <th>Policy</th>
              <th>Net marked P&L</th>
              <th>Modeled fees</th>
              <th>Fills</th>
              <th>Max sampled drawdown</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td>{money(t.pnl)}</td>
                <td>{money(t.fees)}</td>
                <td>{t.fills}</td>
                <td>{t.drawdown.toFixed(4)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <b>30 random-action controls:</b> median {money(r.randomMedian)}, range{' '}
        {money(r.randomMin)} to {money(r.randomMax)}. Seeds 1–30 choose BUY,
        SELL or HOLD with equal probability at each bar. These are action seeds,
        not 30 different fly brains.
      </p>
      <details>
        <summary>Every random control</summary>
        <div className="evidence-table">
          <table>
            <thead>
              <tr>
                <th>Seed</th>
                <th>P&L</th>
                <th>Fees</th>
                <th>Fills</th>
              </tr>
            </thead>
            <tbody>
              {r.random.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{money(t.pnl)}</td>
                  <td>{money(t.fees)}</td>
                  <td>{t.fills}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p>
        Common fill model: next available bar's open, 2 bps slippage and 1 bp
        fees, cash only, $100 maximum order and 10% entry exposure. Buy-and-hold
        makes one initial entry; it does not match the fly's exposure or
        turnover. No final liquidation is forced. Any last-bar intent stays
        unfilled.
      </p>
      <p>
        This small, already-inspected intraday sample cannot establish
        profitability. Held-out dates, multiple neural seeds, market regimes,
        corporate actions and exposure-matched controls still need a dedicated
        evaluation.
      </p>
    </section>
  );
}
