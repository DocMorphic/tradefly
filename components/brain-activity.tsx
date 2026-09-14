'use client';
import { useState } from 'react';
import { Activity, Radio, ScanLine } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { PaperDecision } from '@/lib/backend';
import type { PaperBackend } from './paper-views';

const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const when = (s: string) =>
  new Date(s).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const inputs: Record<string, string> = {
  return_up: 'Price rise',
  return_down: 'Price fall',
  range: 'Price range',
  volume: 'Volume',
  position: 'Position held',
  cash: 'Available cash',
};

function Trace({
  records,
  selected,
  title,
  unit,
  series,
  threshold,
}: {
  records: PaperDecision[];
  selected: string;
  title: string;
  unit: string;
  series: {
    label: string;
    color: string;
    value: (d: PaperDecision) => number;
  }[];
  threshold?: number;
}) {
  const top =
    Math.max(
      1,
      threshold ?? 0,
      ...records.flatMap((d) => series.map((s) => s.value(d))),
    ) * 1.15;
  const x = (i: number) =>
    records.length === 1 ? 230 : 46 + (i * 368) / (records.length - 1);
  const y = (n: number) => 150 - (n / top) * 120;
  const chosen = records.findIndex((d) => d.id === selected);
  return (
    <figure className="neural-trace">
      <figcaption>
        {title}
        <span>{unit}</span>
      </figcaption>
      <svg
        viewBox="0 0 440 182"
        role="img"
        aria-label={`${title} across ${records.length} recorded decisions, oldest to newest`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="46"
              x2="414"
              y1={y(top * f)}
              y2={y(top * f)}
              className="neural-grid"
            />
            <text x="38" y={y(top * f) + 4} textAnchor="end">
              {number(top * f)}
            </text>
          </g>
        ))}
        {threshold !== undefined && (
          <line
            x1="46"
            x2="414"
            y1={y(threshold)}
            y2={y(threshold)}
            className="neural-threshold"
          />
        )}
        {chosen >= 0 && (
          <line
            x1={x(chosen)}
            x2={x(chosen)}
            y1="23"
            y2="150"
            className="neural-selection"
          />
        )}
        {series.map((s, si) => (
          <g key={s.label}>
            <polyline
              points={records
                .map((d, i) => `${x(i)},${y(s.value(d))}`)
                .join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeDasharray={si ? '5 3' : undefined}
            />
            {records.map((d, i) => (
              <circle
                key={d.id}
                cx={x(i)}
                cy={y(s.value(d))}
                r={d.id === selected ? 3.5 : 1.5}
                fill={s.color}
              >
                <title>
                  {d.symbol} · {when(d.created_at)} · {s.label}:{' '}
                  {number(s.value(d))} {unit}
                </title>
              </circle>
            ))}
          </g>
        ))}
        <text x="46" y="174">
          Earlier
        </text>
        <text x="414" y="174" textAnchor="end">
          Latest
        </text>
      </svg>
      <div className="neural-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {threshold !== undefined && <span>Dashed guide: {threshold} Hz</span>}
      </div>
    </figure>
  );
}

export function BrainActivity({
  backend,
  onTrace,
}: {
  backend: PaperBackend;
  onTrace: (id: string) => void;
}) {
  const [pinned, setPinned] = useState<PaperDecision | null>(null);
  const snapshot = backend.data.snapshot;
  const history = snapshot?.decisions ?? [];
  const recent = history.slice(-60);
  const d = pinned ?? history.at(-1);
  if (!snapshot || !d)
    return (
      <div className="paper-view neural-desk">
        <h2>Brain activity</h2>
        <p role="status">
          {backend.error ||
            (snapshot?.brain.loaded
              ? 'Waiting for the first recorded neural calculation.'
              : 'Waiting for the fly brain to send activity readings.')}
        </p>
        <p>
          Recorded firing rates and activity will appear after a stock is
          evaluated.
        </p>
      </div>
    );
  const n = d.neural;
  const neurons = snapshot.brain.manifest?.neuron_count;
  const threshold = snapshot.brain.manifest?.parameters.threshold_hz;
  const margin = snapshot.brain.manifest?.parameters.margin_hz;
  const outputRows = Object.entries(d.neural.output_neurons).flatMap(
    ([pool, rows]) =>
      rows.map((r, i) => ({
        ...r,
        pool,
        label: `${pool.toUpperCase()} ${i + 1}`,
      })),
  );
  const peak = Math.max(
    1,
    ...recent.flatMap((r) =>
      Object.values(r.neural.output_neurons)
        .flat()
        .map((o) => o.hz),
    ),
  );
  const inputPeak = Math.max(100, ...Object.values(d.stimulus_hz));
  const inHistory = history.some((r) => r.id === d.id);
  const state = backend.error
    ? 'Connection error'
    : backend.stale
      ? 'Updates delayed'
      : !snapshot.brain.loaded
        ? 'Brain not loaded'
        : snapshot.paused
          ? 'Worker paused'
          : !snapshot.market.is_open
            ? 'Market closed'
            : 'Receiving readings';
  return (
    <div className="paper-view neural-desk">
      <header className="paper-toolbar">
        <div>
          <h2>
            <Activity size={22} strokeWidth={1.5} /> Brain activity
          </h2>
          <span className="neural-status">
            {state} · last reading {history.length ? when(history.at(-1)!.created_at) : 'unavailable'}
          </span>
        </div>
        <div className="paper-actions">
          <button onClick={() => setPinned(null)} disabled={!pinned}>
            <Radio size={14} /> Follow latest
          </button>
          <button onClick={() => onTrace(d.id)} disabled={!inHistory}>
            <ScanLine size={14} /> Inspect decision
          </button>
        </div>
      </header>
      {backend.error && (
        <p role="status">{backend.error}. Showing the last received records.</p>
      )}
      <div className="neural-picker">
        <label>
          Recorded calculation
          <NativeSelect
            value={d.id}
            onChange={(e) =>
              setPinned(history.find((r) => r.id === e.target.value) ?? null)
            }
          >
            {!inHistory && (
              <NativeSelectOption value={d.id}>
                {d.symbol} · {when(d.created_at)} · pinned
              </NativeSelectOption>
            )}
            {[...history].reverse().map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                {r.symbol} · {when(r.created_at)} · {r.action}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <span>
          {pinned ? 'Pinned reading' : 'Following latest'}
          <strong>
            {d.symbol} · {d.action}
          </strong>
        </span>
      </div>
      <div className="neural-metrics">
        <div>
          <span>Active neurons</span>
          <strong>{number(n.active_neurons)}</strong>
          <small>
            {neurons
              ? `${((n.active_neurons / neurons) * 100).toFixed(2)}% of ${number(neurons)}`
              : 'Network count unavailable'}{' '}
            · last {n.readout_ms} ms
          </small>
        </div>
        <div>
          <span>Network spikes</span>
          <strong>{number(n.spikes)}</strong>
          <small>Total across the {n.window_ms} ms simulation</small>
        </div>
        <div>
          <span>Buy / sell firing</span>
          <strong>
            {number(n.buy_hz)} / {number(n.sell_hz)} <em>Hz</em>
          </strong>
          <small>Mean rate per output neuron · last {n.readout_ms} ms</small>
        </div>
        <div>
          <span>Calculation time</span>
          <strong>
            {number(n.wall_seconds)} <em>s</em>
          </strong>
          <small>Real time to simulate {n.window_ms} ms</small>
        </div>
      </div>
      <div className="neural-charts">
        <Trace
          records={recent}
          selected={d.id}
          title="Trading signals"
          unit="Hz"
          threshold={threshold}
          series={[
            {
              label: 'Buy pool',
              color: '#6552a3',
              value: (r) => r.neural.buy_hz,
            },
            {
              label: 'Sell pool',
              color: '#b16b88',
              value: (r) => r.neural.sell_hz,
            },
          ]}
        />
        <Trace
          records={recent}
          selected={d.id}
          title="Network participation"
          unit="neurons"
          series={[
            {
              label: 'Neurons that fired',
              color: '#557f8f',
              value: (r) => r.neural.active_neurons,
            },
          ]}
        />
      </div>
      <p className="neural-caption">
        Latest {recent.length} calculations. Each step is one evaluated stock,
        with unequal time between steps.{' '}
        {threshold !== undefined && margin !== undefined
          ? `A trade signal needs at least ${threshold} Hz and a ${margin} Hz lead.`
          : 'Threshold settings are unavailable.'}
      </p>
      <section className="neural-panel">
        <div className="neural-section-title">
          <h3>Output neuron activity</h3>
          <span>Quiet → {number(peak)} Hz</span>
        </div>
        <div
          className="neural-raster"
          role="group"
          aria-label="Output neuron firing rates by calculation. Select a column to inspect it."
        >
          <div className="neural-raster-labels">
            {outputRows.map((r) => (
              <span key={r.id} title={`FlyWire neuron ${r.id}`}>
                {r.label}
              </span>
            ))}
          </div>
          <div className="neural-raster-columns">
            {recent.map((r) => (
              <button
                key={r.id}
                aria-pressed={r.id === d.id}
                aria-label={`${r.symbol}, ${when(r.created_at)}, ${r.action}. ${outputRows.map((o) => `${o.label}: ${r.neural.output_neurons[o.pool]?.find((v) => v.id === o.id)?.hz ?? 'unavailable'} Hz`).join('. ')}`}
                title={`${r.symbol} · ${when(r.created_at)} · ${r.action}`}
                onClick={() => setPinned(r)}
              >
                {outputRows.map((o) => {
                  const hz = r.neural.output_neurons[o.pool]?.find(
                    (v) => v.id === o.id,
                  )?.hz;
                  return (
                    <span
                      key={o.id}
                      style={{
                        background:
                          hz === undefined
                            ? 'repeating-linear-gradient(45deg,#dedbe6 0 2px,transparent 2px 4px)'
                            : `rgba(101,82,163,${hz === 0 ? 0.06 : 0.2 + (0.8 * hz) / peak})`,
                      }}
                    />
                  );
                })}
              </button>
            ))}
          </div>
        </div>
        <p className="neural-caption">
          Each cell is a measured firing rate over that record’s readout window.
          Click a column to inspect it. Pale cells mean no spikes; striped cells
          mean missing data.
        </p>
        <div className="neural-outputs">
          {outputRows.map((o) => (
            <div key={o.id}>
              <span>{o.label}</span>
              <strong>
                {number(o.hz)} Hz <small>· {o.spikes} spikes</small>
              </strong>
              <code>{o.id}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="neural-panel">
        <div className="neural-section-title">
          <h3>Sensory input</h3>
          <span>{d.symbol} · stimulus rates</span>
        </div>
        <div className="neural-inputs">
          {Object.entries(d.stimulus_hz).map(([key, hz]) => (
            <div key={key}>
              <span>
                {inputs[key] ?? key}
                <b>{number(hz)} Hz</b>
              </span>
              <div className="neural-meter" aria-hidden="true">
                <i style={{ width: `${(hz / inputPeak) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="neural-caption">
          Market values are encoded into stimulation rates by this experiment.
          BUY and SELL are human-assigned output labels.
        </p>
      </section>
      <footer className="neural-footnote">
        Readings update after each completed calculation. Network totals cover
        the simulated brain; the heatmap shows only the {outputRows.length}{' '}
        recorded output neurons. Individual spike timestamps and anatomical
        locations are not recorded here. History is limited to the desktop’s
        latest {history.length} records (up to 100).
      </footer>
    </div>
  );
}
