/** Track one drag independently of the title bar's DOM node and pointer capture.
 * Browser interruptions keep the last visible placement; only Escape rolls back.
 */
export function trackWindowDrag(
  events: EventTarget,
  pointerId: number,
  callbacks: {
    move: (event: PointerEvent) => void;
    finish: (cancel: boolean) => void;
  },
) {
  let ended = false;
  const options = { capture: true };
  const listeners: [string, EventListener][] = [];
  const dispose = () => {
    ended = true;
    for (const [name, listener] of listeners)
      events.removeEventListener(name, listener, options);
  };
  const finish = (cancel = false) => {
    if (ended) return;
    dispose();
    callbacks.finish(cancel);
  };
  const listen = (name: string, listener: EventListener) => {
    listeners.push([name, listener]);
    events.addEventListener(name, listener, options);
  };
  listen('pointermove', (event) => {
    const e = event as PointerEvent;
    if (e.pointerId !== pointerId) return;
    // A release outside the browser may not deliver pointerup. Finish on
    // re-entry instead of leaving a stuck drag or discarding its snap target.
    if (
      (e.pointerType === 'mouse' || e.pointerType === 'pen') &&
      !(e.buttons & 1)
    )
      finish();
    else callbacks.move(e);
  });
  for (const name of ['pointerup', 'pointercancel'])
    listen(name, (event) => {
      if ((event as PointerEvent).pointerId === pointerId) finish();
    });
  // lostpointercapture does NOT end a drag. Window listeners keep tracking it
  // even if capture was revoked or the original title bar was rerendered.
  listen('blur', (event) => {
    // Focus moving between controls is not the browser losing focus.
    if (event.target === events) finish();
  });
  listen('resize', () => finish());
  listen('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') {
      event.preventDefault();
      finish(true);
    }
  });
  return dispose;
}
