import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapAt,
  snapStyle,
  restoreAtPointer,
  keepTitleVisible,
  windowSnapAt,
  floatingPlacement,
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
test('corners accept a broad approach and edge halves do not require pixel precision', () => {
  assert.equal(snapAt(140, 180, bounds), 'top-left');
  assert.equal(snapAt(1300, 710, bounds), 'bottom-right');
  assert.equal(snapAt(60, 400, bounds), 'left');
  assert.equal(snapAt(1380, 400, bounds), 'right');
  assert.equal(snapAt(300, 300, bounds), null);
});
test('snap targets remain stable across small movements but release beyond their tolerance', () => {
  assert.equal(snapAt(175, 215, bounds), null);
  assert.equal(snapAt(175, 215, bounds, 'top-left'), 'top-left');
  assert.equal(snapAt(190, 230, bounds, 'top-left'), null);
  assert.equal(snapAt(80, 400, bounds, 'left'), 'left');
  assert.equal(snapAt(100, 400, bounds, 'left'), null);
  assert.equal(snapAt(60, 100, bounds, 'left'), 'top-left');
  assert.equal(snapAt(1400, 800, bounds, 'top-left'), 'bottom-right');
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

test('a deliberate drag can snap the window edge without putting the pointer at the edge', () => {
  assert.equal(snapAt(400, 100, bounds), null);
  assert.equal(windowSnapAt(400, 100, bounds, 8, 1000, -150), 'top-left');
  assert.equal(windowSnapAt(1000, 800, bounds, 436, 1000, 150), 'bottom-right');
  assert.equal(windowSnapAt(400, 450, bounds, 8, 1000, -150), 'left');
  assert.equal(windowSnapAt(400, 100, bounds, 8, 1000, 10), null);
  assert.equal(windowSnapAt(400, 100, bounds, 8, 1000, 150), null);
});

test('restoring near the bottom preserves saved size and keeps the full window above the taskbar', () => {
  assert.deepEqual(floatingPlacement(800, 700, 1000, 720, bounds), {
    x: 432,
    y: 82,
    width: 1000,
    height: 720,
  });
  const smaller = { left: 0, top: 40, width: 801, height: 617 };
  assert.deepEqual(floatingPlacement(200, 300, 629, 601, smaller), {
    x: 164,
    y: 8,
    width: 629,
    height: 601,
  });
  assert.deepEqual(floatingPlacement(-100, -100, 1000, 720, smaller), {
    x: 8,
    y: 8,
    width: 785,
    height: 601,
  });
});

test('frame-contact previews survive small hand movements and clear on a deliberate exit', () => {
  assert.equal(windowSnapAt(400, 130, bounds, 8, 1060, -150), 'top-left');
  assert.equal(
    windowSnapAt(415, 130, bounds, 23, 1060, -135, 'top-left'),
    'top-left',
  );
  assert.equal(
    windowSnapAt(440, 130, bounds, 48, 1060, -110, 'top-left'),
    null,
  );
  assert.equal(windowSnapAt(1000, 750, bounds, 372, 1060, 150), 'bottom-right');
  assert.equal(
    windowSnapAt(985, 750, bounds, 357, 1060, 135, 'bottom-right'),
    'bottom-right',
  );
  assert.equal(
    windowSnapAt(960, 750, bounds, 332, 1060, 110, 'bottom-right'),
    null,
  );
});
