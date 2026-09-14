import test from 'node:test';
import assert from 'node:assert/strict';
import { FlySwarmEngine } from '../lib/swarm/engine.mjs';
void test('research resumes identical random state and stays synthetic', () => {
  const a = new FlySwarmEngine(42);
  a.updateConfig({ enabled: true, minScore: 55, maxPosition: 150 });
  for (let i = 0; i < 17; i++) a.tick();
  const b = FlySwarmEngine.restore(JSON.parse(JSON.stringify(a.serialize())));
  const simplify = (s: ReturnType<FlySwarmEngine['snapshot']>) =>
    JSON.parse(
      JSON.stringify(s, (key, value) => (key === 'at' ? undefined : value)),
    );
  for (let i = 0; i < 5; i++)
    assert.deepEqual(simplify(a.tick()), simplify(b.tick()));
  assert.equal(a.snapshot().meta.mode, 'SYNTHETIC');
  assert.ok(a.snapshot().positions.length > 0);
  assert.ok(a.snapshot().positions.every((p) => p.size === 150));
});
void test('scenario reset reproduces its seed and preserves synthetic labeling', () => {
  const a = new FlySwarmEngine(42);
  a.setFocus({ symbol: '<script>', name: 'Example', liquidity: 10000 });
  a.tick();
  assert.equal(a.snapshot().transfers[0].token, '<script>');
  a.reset();
  const b = new FlySwarmEngine(42);
  assert.equal(
    a.snapshot().transfers[0].amount,
    b.snapshot().transfers[0].amount,
  );
  assert.equal(a.snapshot().config.enabled, false);
  assert.equal(a.snapshot().positions.length, 0);
  assert.match(
    a.snapshot().meta.disclaimer,
    /No biological brain, signer, broker order/,
  );
});
