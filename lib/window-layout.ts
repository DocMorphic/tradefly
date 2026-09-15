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
