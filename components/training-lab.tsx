'use client';
import { useState } from 'react';
import { Graph } from './trading-dashboard';
import type { PaperBackend } from './paper-views';
const labels: Record<string, string> = {
  learner: 'Learning fly',
  original: 'Original fly',
  cash: 'Stay in cash',
  always_long: 'Always buy',
  momentum: 'Price momentum',
  no_neural: 'Neural input removed',
};
const bps = (n: number | null) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)} bp`;
export function TrainingLab({ backend }: { backend: PaperBackend }) {
  const r = backend.data.snapshot?.learning;
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const stale =
    backend.stale ||
    !r?.updated_at ||
    Date.now() - Date.parse(r.updated_at) > 300000;
  async function select(mode: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/backend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'decoder', mode }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error || 'Could not change decoder');
      setMessage(
        'Selection sent. Waiting for the local worker; trading stays paused.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Connection unavailable',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!r)
    return (
      <section className="learning-lab">
        <h2>Training Lab</h2>
        <p>
          The local learning worker is starting. Measured neural traces and
          delayed market outcomes will appear here.
        </p>
      </section>
    );
  const metrics = r.metrics ?? {},
    curve = r.curve ?? [],
    updates = r.updates ?? [];
  return (
    <section className="learning-lab">
      <header className="learning-heading">
        <div>
          <span className="learning-eyebrow">FLY-INSPIRED REWARD LEARNING</span>
          <h2>Does experience help?</h2>
          <p>
            {r.status}
            {stale ? ' · saved report / awaiting update' : ''}
          </p>
        </div>
        <span className="learning-mode">
          {r.mode === 'learned'
            ? 'Learned decoder selected'
            : r.mode === 'shadow'
              ? 'Training only · no broker orders'
              : 'Learning in shadow · original fly trades'}
        </span>
      </header>
      <div className="learning-summary">
        <article>
          <span>Held-out outcome</span>
          <strong
            className={
              (metrics.learner?.mean_bps ?? 0) > 0
                ? 'learning-gain'
                : 'learning-loss'
            }
          >
            {bps(metrics.learner?.mean_bps ?? null)}
          </strong>
          <small>Average per opportunity, after costs</small>
        </article>
        <article>
          <span>Learned experiences</span>
          <strong>{(r.update_count ?? 0).toLocaleString()}</strong>
          <small>Delayed rewards applied to shadow memory</small>
        </article>
        <article>
          <span>Unseen trading days</span>
          <strong>{r.heldout_days ?? 0} / 10</strong>
          <small>
            {r.heldout_count ?? 0} observations · {r.heldout_symbols ?? 0}{' '}
            stocks
          </small>
        </article>
        <article>
          <span>Ready for paper trial?</span>
          <strong>{r.eligible ? 'Gate passed' : 'Not yet'}</strong>
          <small>
            {r.eligible
              ? 'Owner selection required'
              : 'Keep collecting evidence'}
          </small>
        </article>
      </div>
      <p className="learning-context">
        The fly supplies measured neural patterns. An engineered memory layer
        learns from what happened next. No additional broker orders are placed
        for training. This is fly-inspired associative learning, not an exact
        biological learning model.
      </p>
      <div className="learning-plots">
        <article>
          <h3>Does the learner beat the original?</h3>
          <p>
            Running mean net outcome on the held-out period. Higher is better.
            100 bp = 1%.
          </p>
          <Graph
            points={curve.map((p) => ({
              at: Date.parse(p.at),
              label: `${p.symbol} · ${p.action}`,
              values: {
                learner: p.learner,
                original: p.original,
                always_long: p.always_long,
              },
            }))}
            series={[
              {
                key: 'learner',
                label: 'Learning fly',
                color: '#4ee1a0',
                format: bps,
              },
              {
                key: 'original',
                label: 'Original fly',
                color: '#ff7488',
                format: bps,
              },
              {
                key: 'always_long',
                label: 'Always buy',
                color: '#b6a4f8',
                format: bps,
              },
            ]}
            label="Held-out mean outcome. Hover, tap, or use arrow keys to inspect."
            reference={0}
            referenceLabel="Cash: 0 bp"
          />
        </article>
        <article>
          <h3>What feedback reaches its memory?</h3>
          <p>
            Recent hypothetical market outcomes versus predictions made before
            the outcome was known.
          </p>
          <Graph
            points={updates.map((p) => ({
              at: Date.parse(p.at),
              label: `${p.fly} · ${p.symbol}`,
              values: {
                reward: p.reward_bps,
                prediction: p.decision_prediction_bps,
              },
            }))}
            series={[
              {
                key: 'reward',
                label: 'Observed move',
                color: '#4ee1a0',
                format: bps,
              },
              {
                key: 'prediction',
                label: 'Prediction at decision',
                color: '#ffb17c',
                format: bps,
              },
            ]}
            label="Delayed reward and prior prediction. Hover to inspect."
            reference={0}
            referenceLabel="No price change"
          />
        </article>
      </div>
      <div className="learning-columns">
        <article>
          <h3>Same opportunities. Different decisions.</h3>
          <p>
            {r.horizon_minutes ?? 30}-minute horizon · {r.cost_bps ?? 20} bp
            estimated round-trip friction.
          </p>
          <div className="paper-table">
            <table>
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Net / opportunity</th>
                  <th>Positive outcomes</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics).map(([name, m]) => (
                  <tr key={name}>
                    <td>{labels[name] ?? name}</td>
                    <td
                      className={
                        m.mean_bps > 0 ? 'learning-gain' : 'learning-loss'
                      }
                    >
                      {bps(m.mean_bps)}
                    </td>
                    <td>{(m.win_rate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Cash outcomes count as zero, not wins. Outcomes assume independent
            $100 opportunities; these are not portfolio returns or actual
            profits. Overlapping trades, cash limits, and the live policy’s
            revisit timing are not simulated here.
          </p>
          <p>
            Stress test at {r.stress_bps ?? 40} bp:{' '}
            <b>{bps(r.stress?.mean_bps ?? null)}</b> per opportunity.
          </p>
        </article>
        <article>
          <h3>Before it can control paper orders</h3>
          <ul className="learning-gates">
            {r.requirements?.map((g) => (
              <li key={g.label}>
                <span
                  className={g.passed ? 'learning-gain' : 'learning-pending'}
                >
                  {g.passed ? 'Passed' : 'Pending'}
                </span>
                <span>
                  {g.label}
                  {g.value !== undefined ? ` · ${g.value}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p>
            Passing permits a paper trial, not a profitability claim. The
            held-out decoder stays frozen; the shadow memory keeps learning
            separately.
          </p>
          <div className="paper-actions">
            <button
              disabled={
                !backend.data.can_control ||
                busy ||
                stale ||
                !backend.data.snapshot?.paused ||
                r.mode === 'shadow'
              }
              onClick={() => void select('shadow')}
            >
              Train without orders
            </button>
            <button
              disabled={
                !backend.data.can_control ||
                busy ||
                stale ||
                !backend.data.snapshot?.paused ||
                !r.eligible ||
                r.mode === 'learned'
              }
              onClick={() => void select('learned')}
            >
              Use tested decoder
            </button>
            <button
              disabled={
                !backend.data.can_control ||
                busy ||
                stale ||
                !backend.data.snapshot?.paused ||
                r.mode === 'original'
              }
              onClick={() => void select('original')}
            >
              Use original fly
            </button>
          </div>
          <p>
            {backend.data.can_control
              ? 'Pause trading before switching. Resume remains a separate owner action.'
              : 'Only the owner can change the trading decoder.'}
          </p>
          <p role="status">{message}</p>
        </article>
      </div>
      <details>
        <summary>Memory, exclusions & scientific scope</summary>
        <p>{r.biology}</p>
        <p>
          Training uses only outcomes available before{' '}
          {r.cutoff ? new Date(r.cutoff).toLocaleString() : 'the fixed cutoff'}.
          Held-out outcomes never update the evaluated decoder. Labels arrive
          after the market-data delay; each original neural pattern serves as
          its eligibility trace. Every four weeks, prior outcomes can train a
          new candidate; its future evaluation starts afresh.
        </p>
        <p>
          Shadow memories:{' '}
          {r.memory
            ?.map(
              (m) =>
                `${m.fly}: ${m.updates} updates, fast ${m.fast_strength.toFixed(3)}, slow ${m.slow_strength.toFixed(3)}`,
            )
            .join(' · ')}
        </p>
        <p>
          Observed signal mix:{' '}
          {Object.entries(r.signals ?? {})
            .map(([key, value]) => `${key} ${value}`)
            .join(' · ')}
        </p>
        <p>
          Dataset:{' '}
          {Object.entries(r.counts ?? {})
            .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)
            .join(' · ')}
        </p>
        <p>
          Stock coverage reflects the original fly’s recorded tour. It is
          selection-biased and too limited to represent the whole market. A
          positive short test can be luck; live paper evaluation is still
          necessary.
        </p>
        <p>
          <a
            href="https://www.nature.com/articles/s41586-024-07763-9"
            target="_blank"
            rel="noreferrer"
          >
            Connectome model
          </a>{' '}
          ·{' '}
          <a
            href="https://www.nature.com/articles/s41586-024-07819-w"
            target="_blank"
            rel="noreferrer"
          >
            Fly memory research
          </a>
        </p>
      </details>
    </section>
  );
}
