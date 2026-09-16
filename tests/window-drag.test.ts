import test from 'node:test';
import assert from 'node:assert/strict';
import { trackWindowDrag } from '../lib/window-drag.ts';
import {
  keepTitleVisible,
  windowSnapAt,
  type SnapZone,
} from '../lib/window-layout.ts';

function gesture() {
  const events = new EventTarget();
  const bounds = { left: 0, top: 40, width: 1440, height: 810 };
  let preview: SnapZone | null = null;
  let applied: SnapZone | 'original' | null = 'original';
  let moves = 0;
  let finishes = 0;
  const dispose = trackWindowDrag(events, 7, {
    move: (e) => {
      moves++;
      const position = keepTitleVisible(
        132 + e.clientX - 650,
        8 + e.clientY - 67,
        1060,
        bounds,
      );
      preview = windowSnapAt(
        e.clientX,
        e.clientY,
        bounds,
        position.x,
        1060,
        e.clientX - 650,
        preview,
      );
    },
    finish: (cancel) => {
      finishes++;
      applied = cancel ? 'original' : preview;
    },
  });
  function send(type: string, fields: Record<string, unknown> = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: 7,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 500,
      clientY: 130,
      ...fields,
    });
    events.dispatchEvent(event);
    return event;
  }
  return { send, dispose, read: () => ({ preview, applied, moves, finishes }) };
}

test('capture loss after the outline appears keeps tracking and commits on release', () => {
  const g = gesture();
  g.send('pointermove');
  assert.equal(g.read().preview, 'top-left');
  g.send('lostpointercapture');
  assert.equal(g.read().finishes, 0);
  g.send('pointermove', { clientX: 0, clientY: 0 });
  g.send('pointerup', { buttons: 0, clientX: 0, clientY: 0 });
  assert.deepEqual(g.read(), {
    preview: 'top-left',
    applied: 'top-left',
    moves: 2,
    finishes: 1,
  });
});

test('moving away after capture loss clears the outline and releases without a snap', () => {
  const g = gesture();
  g.send('pointermove');
  g.send('lostpointercapture');
  g.send('pointermove', { clientX: 650, clientY: 400 });
  g.send('pointerup', { buttons: 0 });
  assert.equal(g.read().applied, null);
});

for (const interruption of ['blur', 'resize', 'pointercancel']) {
  test(`${interruption} preserves the shown snap instead of rolling back to the original window`, () => {
    const g = gesture();
    g.send('pointermove');
    g.send(interruption);
    g.send('lostpointercapture');
    g.send('pointerup', { buttons: 0 });
    assert.equal(g.read().applied, 'top-left');
    assert.equal(g.read().finishes, 1);
  });
}

test('release outside the page completes on re-entry without overwriting the preview', () => {
  const g = gesture();
  g.send('pointermove');
  g.send('lostpointercapture');
  g.send('pointermove', { buttons: 0, clientX: 650, clientY: 400 });
  assert.equal(g.read().applied, 'top-left');
  assert.equal(g.read().moves, 1);
});

test('Escape explicitly cancels, cleans up listeners, and ignores a subsequent release', () => {
  const g = gesture();
  g.send('pointermove');
  assert.equal(g.send('keydown', { key: 'Escape' }).defaultPrevented, true);
  g.send('pointerup');
  g.send('pointermove');
  assert.deepEqual(g.read(), {
    preview: 'top-left',
    applied: 'original',
    moves: 1,
    finishes: 1,
  });
});

test('other pointers and component disposal cannot commit this gesture', () => {
  const g = gesture();
  g.send('pointermove', { pointerId: 8 });
  g.send('pointerup', { pointerId: 8 });
  g.send('pointercancel', { pointerId: 8 });
  assert.equal(g.read().finishes, 0);
  assert.equal(g.read().moves, 0);
  g.dispose();
  g.send('pointermove');
  g.send('pointerup');
  assert.equal(g.read().finishes, 0);
});
