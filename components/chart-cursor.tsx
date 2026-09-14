'use client';
import { useState, type KeyboardEvent, type PointerEvent } from 'react';

export function useChartCursor(
  count: number,
  viewWidth: number,
  plotLeft: number,
  plotWidth: number,
) {
  const [hover, setHover] = useState<number | null>(null);
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  const index = hover === null ? null : clamp(hover);
  return {
    index,
    props: {
      tabIndex: 0,
      onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(
          clamp(
            Math.round(
              ((((e.clientX - r.left) / r.width) * viewWidth - plotLeft) /
                plotWidth) *
                (count - 1),
            ),
          ),
        );
      },
      onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(
          clamp(
            Math.round(
              ((((e.clientX - r.left) / r.width) * viewWidth - plotLeft) /
                plotWidth) *
                (count - 1),
            ),
          ),
        );
      },
      onPointerLeave: () => setHover(null),
      onFocus: () => setHover((previous) => previous ?? count - 1),
      onBlur: () => setHover(null),
      onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => {
        if (
          !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)
        )
          return;
        e.preventDefault();
        if (e.key === 'Escape') setHover(null);
        else
          setHover(
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? count - 1
                : clamp(
                    (index ?? count - 1) + (e.key === 'ArrowLeft' ? -1 : 1),
                  ),
          );
      },
    },
  };
}
