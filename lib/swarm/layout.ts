// Screen-space packing only: proximity never claims a funding relationship.
export function packHolders(percentages: number[]) {
  const points = percentages.slice(0, 28).map((share, i) => {
    const angle = i * 2.39996323,
      distance = Math.sqrt(i) * 42;
    return {
      x: 370 + Math.cos(angle) * distance,
      y: 185 + Math.sin(angle) * distance * 0.7,
      r: Math.min(38, 18 + Math.sqrt(Math.max(0, share)) * 5),
    };
  });
  for (let pass = 0; pass < 80; pass++) {
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i],
          b = points[j],
          dx = b.x - a.x,
          dy = b.y - a.y,
          dist = Math.hypot(dx, dy) || 1,
          overlap = a.r + b.r + 10 - dist;
        if (overlap > 0) {
          a.x -= ((dx / dist) * overlap) / 2;
          a.y -= ((dy / dist) * overlap) / 2;
          b.x += ((dx / dist) * overlap) / 2;
          b.y += ((dy / dist) * overlap) / 2;
        }
      }
    for (const p of points) {
      p.x = Math.max(p.r + 8, Math.min(732 - p.r, p.x));
      p.y = Math.max(p.r + 8, Math.min(362 - p.r, p.y));
    }
  }
  return points;
}
