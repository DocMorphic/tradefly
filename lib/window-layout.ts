export type SnapZone =
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';
export type WorkspaceBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function snapAt(
  x: number,
  y: number,
  bounds: WorkspaceBounds,
  previous: SnapZone | null = null,
): SnapZone | null {
  const px = x - bounds.left,
    py = y - bounds.top;
  const edge = Math.min(64, bounds.width * 0.08),
    cornerX = Math.min(160, bounds.width * 0.2),
    cornerY = Math.min(160, bounds.height * 0.25);
  if (
    px < -edge ||
    px > bounds.width + edge ||
    py < -48 ||
    py > bounds.height + 52
  )
    return null;
  const cornerSide =
    px <= cornerX ? 'left' : px >= bounds.width - cornerX ? 'right' : null;
  if (cornerSide && py <= cornerY) return `top-${cornerSide}`;
  if (cornerSide && py >= bounds.height - cornerY)
    return `bottom-${cornerSide}`;
  // A selected zone has a slightly wider exit boundary, so a small hand
  // movement cannot repeatedly switch the preview on and off.
  if (previous) {
    const right = previous.endsWith('right');
    const distance = right ? bounds.width - px : px;
    const tolerance = 24;
    if (previous.includes('-')) {
      const vertical = previous.startsWith('bottom') ? bounds.height - py : py;
      if (distance <= cornerX + tolerance && vertical <= cornerY + tolerance)
        return previous;
    } else if (distance <= edge + tolerance) return previous;
  }
  return px <= edge ? 'left' : px >= bounds.width - edge ? 'right' : null;
}

// Percent-based geometry follows workspace resizes and leaves a shared 8px gutter.
export function snapStyle(zone: SnapZone) {
  const right = zone.endsWith('right'),
    bottom = zone.startsWith('bottom');
  const quarter = zone.includes('-');
  return {
    left: right ? 'calc(50% + 4px)' : '8px',
    top: bottom ? 'calc(50% + 4px)' : '8px',
    width: 'calc(50% - 12px)',
    height: quarter ? 'calc(50% - 12px)' : 'calc(100% - 16px)',
  };
}

// Dragging by the middle of a title bar can put the window against an edge
// while the pointer is still well inside the desktop. Recognize that contact
// only when the gesture is deliberately moving toward that edge.
export function windowSnapAt(
  x: number,
  y: number,
  bounds: WorkspaceBounds,
  windowX: number,
  width: number,
  deltaX: number,
  previous: SnapZone | null = null,
): SnapZone | null {
  const pointer = snapAt(x, y, bounds, previous);
  if (pointer) return pointer;
  if (
    x < bounds.left ||
    x > bounds.left + bounds.width ||
    y < bounds.top - 48 ||
    y > bounds.top + bounds.height + 52
  )
    return null;
  if (deltaX <= -24 && windowX <= 12)
    return snapAt(bounds.left + 1, y, bounds, previous);
  if (deltaX >= 24 && windowX + width >= bounds.width - 12)
    return snapAt(bounds.left + bounds.width - 1, y, bounds, previous);
  return null;
}

export function floatingPlacement(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: WorkspaceBounds,
) {
  const w = Math.min(width, bounds.width - 16),
    h = Math.min(height, bounds.height - 16);
  return {
    x: Math.max(8, Math.min(bounds.width - w - 8, x)),
    y: Math.max(8, Math.min(bounds.height - h - 8, y)),
    width: w,
    height: h,
  };
}

export function keepTitleVisible(
  x: number,
  y: number,
  width: number,
  bounds: WorkspaceBounds,
) {
  return {
    x: Math.max(
      Math.min(0, bounds.width - width),
      Math.min(bounds.width - Math.min(width, 240), x),
    ),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - 70), y)),
  };
}

export function restoreAtPointer(
  x: number,
  y: number,
  grabRatio: number,
  titleOffset: number,
  width: number,
  bounds: WorkspaceBounds,
) {
  return keepTitleVisible(
    x - bounds.left - width * Math.max(0, Math.min(1, grabRatio)),
    y - bounds.top - titleOffset,
    width,
    bounds,
  );
}
