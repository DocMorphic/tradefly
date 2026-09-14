'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { PaperBackend } from './paper-views';
import { flyActivity, previewActivity, type FlyMood } from '@/lib/fly/activity';
export function FlyHabitat({ backend }: { backend: PaperBackend }) {
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<{ resetCamera: () => void; dispose: () => void } | null>(
      null,
    );
  const [preview, setPreview] = useState<FlyMood | null>(null),
    [motion, setMotion] = useState(true),
    [now, setNow] = useState(0),
    [status, setStatus] = useState('Loading the 3D habitat…');
  const activity = preview
    ? previewActivity(preview)
    : flyActivity(backend.data.snapshot, backend.stale, now);
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
          );
          setStatus('');
        } catch {
          setStatus(
            '3D needs WebGL support. The activity readings and preview controls remain available.',
          );
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('The 3D scene could not load. Reopen this window to retry.');
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
          <span>ONE FLY / A VERY SMALL TRADING DESK</span>
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
          <span>{preview ? 'ANIMATION PREVIEW' : 'PAPER TELEMETRY'}</span>
          <strong>{activity.label}</strong>
          <small>{activity.symbol}</small>
        </div>
        <span className="habitat-gesture">
          Drag to orbit · scroll or pinch to zoom
        </span>
      </div>
      <div className="habitat-source">
        <button
          aria-pressed={preview === null}
          onClick={() => setPreview(null)}
        >
          Follow paper activity
        </button>
        <span>Try an animation:</span>
        {(
          ['SCANNING', 'BUY', 'SELL', 'HOLD', 'FILLED', 'PAUSED'] as FlyMood[]
        ).map((mood) => (
          <button
            key={mood}
            aria-pressed={preview === mood}
            onClick={() => setPreview(mood)}
          >
            {mood === 'FILLED'
              ? 'Fill'
              : mood.charAt(0) + mood.slice(1).toLowerCase()}
          </button>
        ))}
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
          Animation source{' '}
          <b>{preview ? 'Demo controls' : 'Worker telemetry'}</b>
        </span>
      </div>
      <footer>
        Stylized activity avatar. The body movements are illustrative, not a
        biological motor simulation. BUY/SELL show intents; only a
        broker-confirmed fill gets the fill animation. Preview and motion
        controls never place orders or resume trading.
      </footer>
    </div>
  );
}
