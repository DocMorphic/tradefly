import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping can execute the shared pure TypeScript model directly.
import {
  decode,
  makeSession,
  metrics,
  csv,
  START_CASH,
  outcome,
  report,
  decisionsCsv,
} from '../lib/experiment.ts';

void test('decoder holds on silence, ties, insufficient margin, and invalid readings', () => {
  for (const [buy, sell] of [
    [0, 0],
    [19, 1],
    [30, 30],
    [25, 20],
    [NaN, 30],
    [30, Infinity],
  ])
    assert.equal(decode(buy, sell), 'HOLD');
  assert.equal(decode(28, 20), 'BUY');
  assert.equal(decode(20, 28), 'SELL');
});
void test('paper fills follow the decision bar and conserve cash and shares', () => {
  const frames = makeSession();
  for (const f of frames) {
    let cash = START_CASH,
      shares = 0;
    for (const t of f.trades) {
      assert.equal(t.filledAt, t.decision + 1);
      assert.ok(t.filledAt <= f.index);
      assert.equal(frames[t.decision].action, t.action);
      const notional = t.quantity * t.price;
      assert.ok(notional <= 100 + 1e-8);
      cash += t.action === 'BUY' ? -notional - t.fee : notional - t.fee;
      shares += t.action === 'BUY' ? t.quantity : -t.quantity;
    }
    assert.ok(Math.abs(f.cash - cash) < 1e-8);
    assert.ok(Math.abs(f.quantity - shares) < 1e-8);
    assert.ok(Math.abs(f.equity - (cash + shares * f.price)) < 1e-8);
    assert.ok(f.cash >= 0 && f.quantity >= 0);
    assert.equal(new Set(f.trades.map((t) => t.id)).size, f.trades.length);
  }
});
void test('average-cost realized profit reconciles to marked equity', () => {
  const f = makeSession().at(-1)!;
  let shares = 0,
    cost = 0,
    realized = 0;
  for (const t of f.trades) {
    if (t.action === 'BUY') {
      shares += t.quantity;
      cost += t.quantity * t.price + t.fee;
    } else {
      const basis = (cost / shares) * t.quantity;
      realized += t.quantity * t.price - t.fee - basis;
      cost -= basis;
      shares -= t.quantity;
    }
  }
  assert.ok(Math.abs(realized - f.realized) < 1e-8);
  assert.ok(
    Math.abs(realized + (shares * f.price - cost) - (f.equity - START_CASH)) <
      1e-8,
  );
});
void test('empty-position sells are blocked and future fills stay out of replay exports', () => {
  const frames = makeSession();
  assert.equal(frames[0].action, 'HOLD');
  const prefix = frames.slice(0, 5);
  assert.equal(
    csv(prefix).split('\n').length,
    prefix.at(-1)!.trades.length + 1,
  );
  assert.ok(prefix.at(-1)!.trades.every((t) => t.filledAt < 5));
  assert.ok(
    makeSession(true).some(
      (f) => f.status === 'Previous sell blocked: no holding',
    ),
  );
});
void test('metrics use the selected prefix and drawdown uses prior equity peaks', () => {
  const frames = makeSession(),
    m = metrics(frames);
  assert.equal(metrics(frames.slice(0, 1)).pnl, 0);
  let peak = 10000,
    maxDD = 0;
  for (const f of frames) {
    peak = Math.max(peak, f.equity);
    maxDD = Math.max(maxDD, ((peak - f.equity) / peak) * 100);
  }
  assert.equal(m.drawdown, maxDD);
  assert.equal(m.pnl, frames.at(-1)!.equity - START_CASH);
  assert.deepEqual(makeSession(), frames);
  assert.deepEqual(makeSession(true), makeSession(true));
});

void test('decision statuses reconcile and never resolve before their next bar', () => {
  for (const random of [false, true]) {
    const session = makeSession(random);
    for (let length = 1; length <= session.length; length++) {
      const prefix = session.slice(0, length),
        m = metrics(prefix),
        last = prefix.at(-1)!;
      assert.equal(m.buyDecisions + m.sellDecisions + m.holdDecisions, length);
      assert.equal(
        m.buyDecisions + m.sellDecisions,
        last.trades.length + m.blocked + m.pending,
      );
      assert.equal(
        outcome(prefix, length - 1).state,
        last.action === 'HOLD' ? 'No order' : 'Pending',
      );
      const states = prefix.map((f) => outcome(prefix, f.index).state);
      assert.equal(states.filter((s) => s === 'Blocked').length, m.blocked);
      assert.equal(
        states.filter((s) => s === 'Filled').length,
        last.trades.length,
      );
    }
  }
});
void test('reported cost basis and slippage match independently reconstructed holdings and fills', () => {
  const frames = makeSession();
  let basis = 0,
    shares = 0;
  for (const trade of frames.at(-1)!.trades) {
    assert.ok(
      Math.abs(
        trade.slippage -
          Math.abs(trade.price - frames[trade.filledAt].price) * trade.quantity,
      ) < 1e-9,
    );
    if (trade.action === 'BUY') {
      basis += trade.price * trade.quantity + trade.fee;
      shares += trade.quantity;
    } else {
      basis -= (basis / shares) * trade.quantity;
      shares -= trade.quantity;
    }
  }
  const last = frames.at(-1)!;
  assert.ok(Math.abs(basis - last.costBasis) < 1e-8);
  assert.ok(
    Math.abs(
      metrics(frames).unrealized -
        (last.quantity * last.price - last.costBasis),
    ) < 1e-8,
  );
});
void test('full report and decision CSV export the entire visible interval and no future records', () => {
  const frames = makeSession().slice(0, 19),
    exported = report(frames);
  assert.equal(exported.frames.length, 19);
  assert.equal(exported.decisions.length, 19);
  assert.equal(exported.controls.random.length, 19);
  assert.equal(decisionsCsv(frames).split('\n').length, 20);
  assert.ok(exported.frames.at(-1)!.trades.every((t) => t.filledAt < 19));
  assert.equal(exported.source, 'synthetic-demo');
  assert.equal(exported.connections.brain, false);
});
