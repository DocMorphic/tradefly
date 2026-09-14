import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapAt,
  snapStyle,
  restoreAtPointer,
  keepTitleVisible,
} from '../lib/window-layout.ts';

const bounds = { left: 0, top: 40, width: 1440, height: 810 };
test('corners take precedence over side halves inside the usable desktop', () => {
  assert.equal(snapAt(5, 45, bounds), 'top-left');
  assert.equal(snapAt(1435, 45, bounds), 'top-right');
  assert.equal(snapAt(5, 845, bounds), 'bottom-left');
  assert.equal(snapAt(1435, 845, bounds), 'bottom-right');
  assert.equal(snapAt(5, 400, bounds), 'left');
  assert.equal(snapAt(1435, 400, bounds), 'right');
  assert.equal(snapAt(720, 400, bounds), null);
  assert.equal(snapAt(720, 45, bounds), null);
});
test('crossing onto the desktop bars still reaches corners; leaving the app does not', () => {
  assert.equal(snapAt(10, 10, bounds), 'top-left');
  assert.equal(snapAt(1435, 890, bounds), 'bottom-right');
  assert.equal(snapAt(-100, 400, bounds), null);
  assert.equal(snapAt(1435, 1000, bounds), null);
  const offset = { ...bounds, left: 100, top: 100 };
  assert.equal(snapAt(110, 500, offset), 'left');
});
test('half and quarter tiles share exact gutters and stay within the workspace', () => {
  const evaluate = (value: string, total: number) =>
    value.startsWith('calc(50%')
      ? total / 2 + (value.includes('+') ? 4 : -12)
      : value.startsWith('calc(100%')
        ? total - 16
        : 8;
  const left = snapStyle('top-left'),
    right = snapStyle('top-right'),
    bottom = snapStyle('bottom-left');
  const rightX = evaluate(right.left, bounds.width),
    width = evaluate(left.width, bounds.width);
  assert.equal(rightX - (8 + width), 8);
  assert.equal(rightX + width, bounds.width - 8);
  assert.equal(
    evaluate(bottom.top, bounds.height) -
      (8 + evaluate(left.height, bounds.height)),
    8,
  );
  assert.equal(
    evaluate(snapStyle('left').height, bounds.height),
    bounds.height - 16,
  );
});
test('pulling a tile out retains the grab point and keeps its title accessible', () => {
  assert.deepEqual(restoreAtPointer(720, 300, 0.5, 20, 1000, bounds), {
    x: 220,
    y: 240,
  });
  const atEdge = restoreAtPointer(5, 45, 0.8, 20, 1000, bounds);
  assert.deepEqual(atEdge, { x: 0, y: 0 });
  assert.deepEqual(keepTitleVisible(2000, 2000, 1000, bounds), {
    x: 1200,
    y: 740,
  });
});
