'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

type Point = { x: number; y: number };
const STORAGE = 'tradefly.desktop-icons.v1';
const WIDTH = 96,
  HEIGHT = 100,
  GAP = 20;

export function DesktopIcons({
  apps,
  onOpen,
}: {
  apps: { id: string; title: string; icon: ReactNode }[];
  onOpen: (id: string) => void;
}) {
  const surface = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [saved, setSaved] = useState<Record<string, Point>>({});
  const [preview, setPreview] = useState<{ id: string; point: Point } | null>(
    null,
  );
  const drag = useRef<{
    id: string;
    pointer: number;
    start: Point;
    origin: Point;
    point: Point;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        setSaved(
          Object.fromEntries(
            Object.entries(raw).filter(
              ([, p]) =>
                p &&
                typeof p === 'object' &&
                Number.isFinite(p.x) &&
                Number.isFinite(p.y),
            ),
          ),
        );
      }
    } catch {
      /* Device storage is optional. */
    }
    const node = surface.current;
    if (!node) return;
    const measure = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const clamp = (p: Point): Point => ({
    x: Math.max(0, Math.min(p.x, size.width - WIDTH)),
    y: Math.max(0, Math.min(p.y, size.height - HEIGHT)),
  });
  const rows = Math.max(1, Math.floor((size.height + GAP) / (HEIGHT + GAP)));
  function position(id: string, index: number) {
    return clamp(
      preview?.id === id
        ? preview.point
        : saved[id] || {
            x: Math.floor(index / rows) * (WIDTH + GAP),
            y: (index % rows) * (HEIGHT + GAP),
          },
    );
  }
  function remember(id: string, point: Point) {
    setSaved((previous) => {
      const next = { ...previous, [id]: point };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        /* Still movable without storage. */
      }
      return next;
    });
  }
  return (
    <nav ref={surface} className="desktop-icons" aria-label="Applications">
      {apps.map((app, index) => {
        const p = position(app.id, index);
        return (
          <button
            key={app.id}
            className={preview?.id === app.id ? 'icon-dragging' : undefined}
            style={
              size.width
                ? { position: 'absolute', left: p.x, top: p.y }
                : undefined
            }
            title={`${app.title} · drag to move, or Alt + arrow keys`}
            onPointerDown={(e) => {
              if (e.button !== 0 || !e.isPrimary || drag.current) return;
              suppressClick.current = false;
              drag.current = {
                id: app.id,
                pointer: e.pointerId,
                start: { x: e.clientX, y: e.clientY },
                origin: p,
                point: p,
                moved: false,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.pointer !== e.pointerId) return;
              const dx = e.clientX - d.start.x,
                dy = e.clientY - d.start.y;
              if (!d.moved && Math.hypot(dx, dy) < 6) return;
              d.moved = true;
              suppressClick.current = true;
              d.point = clamp({ x: d.origin.x + dx, y: d.origin.y + dy });
              setPreview({ id: app.id, point: d.point });
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              if (!d || d.pointer !== e.pointerId) return;
              if (d.moved) remember(d.id, clamp(d.point));
              drag.current = null;
              setPreview(null);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onLostPointerCapture={() => {
              drag.current = null;
              setPreview(null);
            }}
            onPointerCancel={() => {
              suppressClick.current = true;
              drag.current = null;
              setPreview(null);
            }}
            onClick={(e) => {
              if (suppressClick.current && e.detail !== 0) {
                e.preventDefault();
                return;
              }
              onOpen(app.id);
            }}
            onKeyDown={(e) => {
              if (
                !e.altKey ||
                !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              const step = e.shiftKey ? 1 : 10;
              remember(
                app.id,
                clamp({
                  x:
                    p.x +
                    (e.key === 'ArrowRight'
                      ? step
                      : e.key === 'ArrowLeft'
                        ? -step
                        : 0),
                  y:
                    p.y +
                    (e.key === 'ArrowDown'
                      ? step
                      : e.key === 'ArrowUp'
                        ? -step
                        : 0),
                }),
              );
            }}
          >
            <span className="desktop-icon">{app.icon}</span>
            <span>{app.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
