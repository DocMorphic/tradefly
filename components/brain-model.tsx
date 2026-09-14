'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { NeuralActivity } from '@/lib/backend';
import type {
  BrainGeometry,
  BrainPick,
  makeBrainScene,
} from '@/lib/fly/brain-scene';

export function BrainModel({
  activity,
  recordId,
  label,
}: {
  activity?: NeuralActivity;
  recordId: string;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof makeBrainScene> | null>(null);
  const current = useRef(activity);
  current.current = activity;
  const reduced = useRef(false);
  const [geometry, setGeometry] = useState<BrainGeometry | null>(null),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(0.25),
    [picked, setPicked] = useState<BrainPick | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = media.matches;
    const change = () => {
      reduced.current = media.matches;
      if (media.matches) scene.current?.setPlaying(false);
    };
    media.addEventListener('change', change);
    Promise.all([
      fetch('/brain/flywire-v783.json', { signal: abort.signal }).then((r) => {
        if (!r.ok) throw Error('Coordinates unavailable');
        return r.json() as Promise<BrainGeometry>;
      }),
      import('@/lib/fly/brain-scene'),
    ])
      .then(([data, mod]) => {
        if (cancelled || !host.current) return;
        setGeometry(data);
        scene.current = mod.makeBrainScene(
          host.current,
          data,
          (t, p) => {
            setTime(t);
            setPlaying(p);
          },
          setPicked,
        );
        scene.current.setActivity(current.current, !reduced.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'The 3D viewer could not load. Check WebGL support and reopen this window.',
          );
      });
    return () => {
      cancelled = true;
      abort.abort();
      media.removeEventListener('change', change);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    scene.current?.setActivity(current.current, !reduced.current);
    setPicked(null);
  }, [recordId]);
  const mapped = useMemo(
    () => new Set(geometry?.points.map((p) => p[0]) ?? []),
    [geometry],
  );
  const missing =
    geometry && activity
      ? activity.neuron_ids.filter((id) => !mapped.has(id)).length
      : 0;
  return (
    <section className="brain-model">
      <div className="brain-model-stage">
        <div ref={host} className="brain-model-canvas" />
        {(!ready || error) && (
          <p className="brain-model-loading" role="status">
            {error || 'Loading FlyWire neuron coordinates…'}
          </p>
        )}
        <div className="brain-model-heading">
          <span>FLYWIRE v783</span>
          <strong>{label}</strong>
          <small>
            {activity
              ? `${activity.displayed_events.toLocaleString()} of ${activity.recorded_events.toLocaleString()} recorded spikes${activity.sampled ? ' · sampled playback' : ''}`
              : 'Anatomy only · no spike recording for this calculation'}
          </small>
        </div>
        <div className="brain-model-help">
          Drag to rotate · scroll to zoom · click a neuron
        </div>
        {picked && (
          <div className="brain-neuron-pick">
            <span>{picked.classification}</span>
            <code>{picked.id}</code>
            <strong>
              {activity
                ? `${picked.visibleSpikes} visible spikes in this replay`
                : 'No spike recording available'}
            </strong>
          </div>
        )}
      </div>
      <div className="brain-model-controls paper-actions">
        <button
          disabled={!activity || !ready}
          onClick={() => scene.current?.setPlaying(!playing)}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}{' '}
          {playing ? 'Pause replay' : 'Play replay'}
        </button>
        <button disabled={!ready} onClick={() => scene.current?.reset()}>
          <RotateCcw size={14} /> Reset view
        </button>
        <NativeSelect
          aria-label="Neural replay speed"
          value={speed}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpeed(v);
            scene.current?.setSpeed(v);
          }}
        >
          <NativeSelectOption value={0.25}>¼ speed</NativeSelectOption>
          <NativeSelectOption value={0.5}>½ speed</NativeSelectOption>
          <NativeSelectOption value={1}>Simulation speed</NativeSelectOption>
        </NativeSelect>
        <span>
          {time.toFixed(0)} / {activity?.duration_ms ?? 500} ms
        </span>
      </div>
      <Slider
        aria-label="Neural replay time in milliseconds"
        min={0}
        max={activity?.duration_ms ?? 500}
        step={1}
        value={[time]}
        disabled={!activity}
        onValueChange={(v) => {
          scene.current?.setPlaying(false);
          scene.current?.seek(Array.isArray(v) ? v[0] : v);
        }}
      />
      <p className="neural-caption">
        {geometry
          ? `${geometry.mapped_neurons.toLocaleString()} matched neuron locations · ${geometry.unmapped_neurons} missing coordinates.`
          : 'Loading anatomy.'}{' '}
        {missing ? `${missing} recorded neurons cannot be mapped.` : ''} Flashes
        replay recorded simulation timestamps; their glow is extended for
        visibility. Playback does not stimulate neurons or place trades.
      </p>
      <details className="brain-attribution">
        <summary>About this brain map</summary>
        <p>
          Each point is the first published FlyWire annotation coordinate for
          one neuron, not its full branching shape. FlyWire Consortium,
          Dorkenwald et al. and Schlegel et al. (Nature, 2024). Data: CC BY-NC
          4.0.{' '}
          <a
            href="https://home.flywire.ai/gallery"
            target="_blank"
            rel="noreferrer"
          >
            Explore FlyWire anatomy
          </a>
          .
        </p>
      </details>
    </section>
  );
}
