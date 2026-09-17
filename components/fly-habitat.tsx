'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { PaperBackend } from './paper-views';
import { flyActivity } from '@/lib/fly/activity';
export function FlyHabitat({ backend }: { backend: PaperBackend }) {
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<{ resetCamera: () => void; dispose: () => void } | null>(
      null,
    );
  const [motion, setMotion] = useState(true),
    [now, setNow] = useState(0),
    [status, setStatus] = useState('Loading the 3D habitat…');
  const activity = flyActivity(backend.data.snapshot, backend.stale, now);
  const telemetry = useRef(backend.data.snapshot);
  telemetry.current = backend.data.snapshot;
  const current = useRef(activity),
    moving = useRef(motion);
  current.current = activity;
  moving.current = motion;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) setMotion(false);
    const change = () => setMotion(!media.matches);
    media.addEventListener('change', change);
    return () => {
      clearInterval(timer);
      media.removeEventListener('change', change);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void import('@/lib/fly/scene')
      .then(({ makeFlyScene }) => {
        if (cancelled || !host.current) return;
        try {
          scene.current = makeFlyScene(
            host.current,
            () => current.current,
            () => moving.current,
            () => telemetry.current,
          );
          setStatus('');
        } catch {
          setStatus(
            '3D needs WebGL support. The activity readings remain available.',
          );
        }
      })
      .catch(() => {
        if (!cancelled)
          setStatus(
            'The 3D scene could not load. Reopen this window to retry.',
          );
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  return (
    <div className="fly-habitat">
      <header className="habitat-header">
        <div>
          <span>ONE FLY / TRADING DESK</span>
          <h2>Meet your trader.</h2>
        </div>
        <div className="habitat-controls">
          <button aria-pressed={!motion} onClick={() => setMotion(!motion)}>
            {motion ? <Pause size={14} /> : <Play size={14} />}{' '}
            {motion ? 'Pause motion' : 'Animate'}
          </button>
          <button onClick={() => scene.current?.resetCamera()}>
            <RotateCcw size={14} /> Reset view
          </button>
        </div>
      </header>
      <div className="habitat-stage">
        <div ref={host} className="habitat-canvas" />
        {status && (
          <div className="habitat-fallback" role="status">
            {status}
          </div>
        )}
        <div className="habitat-overlay">
          <span>PAPER TELEMETRY</span>
          <strong>{activity.label}</strong>
          <small>{activity.symbol}</small>
        </div>
        <span className="habitat-gesture">
          Drag to orbit · scroll or pinch to zoom
        </span>
      </div>
      <p className="habitat-detail" role="status">
        {activity.detail}
      </p>
      <div className="habitat-readings">
        <span>
          Last recorded BUY pool{' '}
          <b>
            {activity.buyHz === null ? '—' : `${activity.buyHz.toFixed(1)} Hz`}
          </b>
        </span>
        <span>
          Last recorded SELL pool{' '}
          <b>
            {activity.sellHz === null
              ? '—'
              : `${activity.sellHz.toFixed(1)} Hz`}
          </b>
        </span>
        <span>
          Desk animation{' '}
          <b>{motion ? 'Gentle typing loop' : 'Motion paused'}</b>
        </span>
      </div>
      <footer>
        The screen shows measured paper-account equity, gain/loss since the
        experiment began, and the latest neural readings. Green/red segments
        show equity rising/falling. Typing is decorative; pausing motion does
        not stop data updates.
      </footer>
    </div>
  );
}
