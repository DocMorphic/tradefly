'use client';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { flushSync } from 'react-dom';
import { trackWindowDrag } from '@/lib/window-drag';
import { EvidenceDesk, type EvidenceTarget } from '@/components/evidence-desk';
import { DesktopIcons } from '@/components/desktop-icons';
import { FlyHabitat } from '@/components/fly-habitat';
import { BrainActivity } from '@/components/brain-activity';
import { SwarmResearch } from '@/components/swarm-research';
import { FlyLog } from '@/components/fly-log';
import { PaperView, useBackend } from '@/components/paper-views';
import { ExperimentView } from '@/components/experiment-views';
import { Slider } from '@/components/ui/slider';
import { OwnerAccess } from '@/components/owner-access';
import {
  Activity,
  Bug,
  BarChart3,
  BookOpen,
  FlaskConical,
  Grid2X2,
  Maximize2,
  Minus,
  Network,
  Pause,
  Play,
  RotateCcw,
  Square,
  Table2,
  X,
} from 'lucide-react';
import { SESSION, metrics } from '@/lib/experiment';
import {
  snapAt,
  windowSnapAt,
  floatingPlacement,
  snapStyle,
  keepTitleVisible,
  restoreAtPointer,
  type SnapZone,
  type WorkspaceBounds,
} from '@/lib/window-layout';

type AppId =
  | 'overview'
  | 'brain'
  | 'ledger'
  | 'analysis'
  | 'notes'
  | 'log'
  | 'swarm'
  | 'habitat'
  | 'activity'
  | 'evidence';
const APPS = {
  evidence: { title: 'Evidence desk', icon: Network },
  habitat: { title: 'Fly habitat', icon: Bug },
  swarm: { title: 'Swarm research', icon: FlaskConical },
  log: { title: 'Fly log', icon: Activity },
  overview: { title: 'Observation desk', icon: Grid2X2 },
  brain: { title: 'Decision inspector', icon: Network },
  ledger: { title: 'Trade ledger', icon: Table2 },
  analysis: { title: 'Performance lab', icon: BarChart3 },
  notes: { title: 'Data & definitions', icon: BookOpen },
  activity: { title: 'Brain activity', icon: Activity },
};
const APP_IDS = Object.keys(APPS) as AppId[];
type Win = {
  id: AppId;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  snap?: SnapZone | null;
  width?: number;
  height?: number;
};
const DEFAULT_WINDOW: Win = {
  id: 'overview',
  x: 132,
  y: 8,
  z: 1,
  minimized: false,
  maximized: false,
};
export default function Desktop() {
  const backend = useBackend();
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(
    null,
  );
  const [mode, setMode] = useState<'paper' | 'demo'>('paper');
  const [windows, setWindows] = useState<Win[]>([DEFAULT_WINDOW]);
  const top = useRef(1);
  const [cursor, setCursor] = useState(77),
    [selected, setSelected] = useState(77),
    [playing, setPlaying] = useState(false);
  const visible = SESSION.slice(0, cursor + 1),
    f = SESSION[cursor],
    selectedFrame = SESSION[Math.min(selected, cursor)],
    m = metrics(visible);
  const latest = useRef({ cursor, selected, metrics: m });
  useEffect(() => {
    latest.current = {
      cursor,
      selected: Math.min(selected, cursor),
      metrics: m,
    };
  }, [cursor, selected, m]);
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              description: string;
              inputSchema: object;
              annotations: { readOnlyHint: boolean };
              execute: (input: unknown) => unknown;
            },
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<typeof ctx.registerTool>[0]) => {
      try {
        Promise.resolve(
          ctx.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(console.error);
      } catch (error) {
        console.error(error);
      }
    };
    register({
      name: 'read_tradefly_demo_report',
      description:
        'Read calculated synthetic-session metrics and the current replay position. No actual fly, market feed, or broker is connected.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({ source: 'synthetic-demo', ...latest.current }),
    });
    register({
      name: 'inspect_tradefly_demo_decision',
      description:
        'Move the synthetic replay to a bar and open its decision inspector. Does not place orders or connect any external service.',
      inputSchema: {
        type: 'object',
        properties: { bar: { type: 'integer', minimum: 0, maximum: 77 } },
        required: ['bar'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        const bar = (input as { bar?: unknown })?.bar;
        if (
          typeof bar !== 'number' ||
          !Number.isInteger(bar) ||
          bar < 0 ||
          bar > 77
        )
          throw new Error('bar must be an integer between 0 and 77');
        flushSync(() => {
          setMode('demo');
          setCursor(bar);
          setSelected(bar);
          setPlaying(false);
          setWindows((ws) =>
            ws.some((w) => w.id === 'brain')
              ? ws.map((w) =>
                  w.id === 'brain'
                    ? { ...w, minimized: false, z: ++top.current }
                    : w,
                )
              : [
                  ...ws,
                  {
                    ...DEFAULT_WINDOW,
                    id: 'brain',
                    x: 156,
                    y: 20,
                    z: ++top.current,
                  },
                ],
          );
        });
        return {
          source: 'synthetic-demo',
          bar,
          action: SESSION[bar].action,
          reason: SESSION[bar].reason,
        };
      },
    });
    return () => lifecycle.abort();
  }, []);
  function open(id: AppId) {
    if (id === 'log') {
      setMode('paper');
      setPlaying(false);
    }
    setWindows((ws) =>
      ws.some((w) => w.id === id)
        ? ws.map((w) =>
            w.id === id ? { ...w, minimized: false, z: ++top.current } : w,
          )
        : [
            ...ws,
            {
              ...DEFAULT_WINDOW,
              id,
              x: 155 + (ws.length % 3) * 24,
              y: 8 + (ws.length % 3) * 12,
              z: ++top.current,
            },
          ],
    );
  }
  function update(id: AppId, changes: Partial<Win>) {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, ...changes } : w)));
  }
  function inspect(i: number) {
    setSelected(i);
    open('brain');
  }
  function reset() {
    setPlaying(false);
    setCursor(0);
    setSelected(0);
  }
  useEffect(() => {
    if (!playing || cursor >= 77) return;
    const timer = setTimeout(() => {
      setCursor(cursor + 1);
      if (cursor + 1 === 77) setPlaying(false);
    }, 550);
    return () => clearTimeout(timer);
  }, [playing, cursor]);
  function toggleReplay() {
    if (cursor === 77) {
      setCursor(0);
      setSelected(0);
    }
    setPlaying((p) => !p);
  }
  function showEvidence(decisionId: string) {
    setEvidenceTarget({ decisionId, nonce: Date.now() });
    open('evidence');
  }
  function windowStatus(id: AppId) {
    if (id === 'swarm')
      return 'Swarm research · live explorer / prototype signals';
    if (
      mode === 'demo' &&
      !['evidence', 'habitat', 'log', 'activity'].includes(id)
    )
      return 'Synthetic demo · simulated trades';
    const snapshot = backend.data.snapshot;
    if (!snapshot) return 'Alpaca paper · waiting for worker telemetry';
    if (backend.stale) return 'Alpaca paper · telemetry stale';
    if (!snapshot.broker.connected) return 'Alpaca paper · broker disconnected';
    const brain = snapshot.brain.loaded
      ? 'fly brain loaded'
      : 'fly brain not loaded';
    const state = snapshot.paused
      ? 'paused'
      : !snapshot.market.is_open
        ? 'market closed'
        : 'running';
    return `Alpaca paper connected · ${brain} · ${state}`;
  }
  function content(id: AppId): ReactNode {
    if (id === 'activity')
      return <BrainActivity backend={backend} onTrace={showEvidence} />;
    if (id === 'evidence')
      return <EvidenceDesk backend={backend} target={evidenceTarget} />;
    if (id === 'habitat') return <FlyHabitat backend={backend} />;
    if (id === 'swarm') return <SwarmResearch />;
    if (id === 'log')
      return <FlyLog backend={backend} onTrace={showEvidence} />;
    if (mode === 'paper')
      return <PaperView id={id} backend={backend} onTrace={showEvidence} />;
    return (
      <ExperimentView
        id={id}
        frames={visible}
        selected={selectedFrame.index}
        onSelect={setSelected}
        onInspect={inspect}
        onOpen={open}
      />
    );
  }
  return (
    <main className="desktop">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="menubar">
        <button className="brand" onClick={() => open('overview')}>
          <Activity size={19} />
          <b>tradefly</b>
          <span>OS</span>
        </button>
        <nav aria-label="Desktop menu">
          <button onClick={() => open('ledger')}>Journal</button>
          <button onClick={() => open('analysis')}>Analysis</button>
          <button onClick={() => open('notes')}>Help</button>
        </nav>
        <div className="menu-right">
          <OwnerAccess />
          <button
            className={mode === 'paper' ? 'mode-active' : ''}
            onClick={() => {
              setMode('paper');
              setPlaying(false);
            }}
          >
            Paper
          </button>
          <button
            className={mode === 'demo' ? 'mode-active' : ''}
            onClick={() => setMode('demo')}
          >
            Demo
          </button>
          <span className="status-dot" />{' '}
          {mode === 'demo'
            ? 'DEMO'
            : backend.stale
              ? 'OFFLINE'
              : backend.data.snapshot?.paused
                ? 'PAUSED'
                : 'RUNNING'}{' '}
          <span className="menubar-divider" />{' '}
          {mode === 'demo'
            ? 'AAPL'
            : `${backend.data.snapshot?.universe?.total ?? 0} STOCKS`}{' '}
          · PAPER
        </div>
      </header>
      <div className="desktop-background" aria-hidden="true">
        <div className="wallpaper-word">tradefly</div>
      </div>
      <DesktopIcons
        apps={APP_IDS.map((id) => {
          const Icon = APPS[id].icon;
          return {
            id,
            title: APPS[id].title,
            icon: <Icon size={29} strokeWidth={1.3} />,
          };
        })}
        onOpen={(id) => open(id as AppId)}
      />
      <div className="workspace" id="workspace" tabIndex={-1}>
        {windows
          .filter((w) => !w.minimized)
          .map((w) => (
            <DesktopWindow
              key={w.id}
              win={w}
              status={windowStatus(w.id)}
              focus={() => update(w.id, { z: ++top.current })}
              update={(changes) => update(w.id, changes)}
              close={() => setWindows((ws) => ws.filter((v) => v.id !== w.id))}
            >
              {content(w.id)}
            </DesktopWindow>
          ))}
      </div>
      <footer className="taskbar">
        <button className="start-button" onClick={() => open('overview')}>
          <Grid2X2 size={17} /> tradefly
        </button>
        <div className="task-apps">
          {windows.map((w) => {
            const Icon = APPS[w.id].icon;
            return (
              <button
                key={w.id}
                className={!w.minimized ? 'running' : ''}
                onClick={() => open(w.id)}
              >
                <Icon size={16} />
                <span>{APPS[w.id].title}</span>
              </button>
            );
          })}
        </div>
        {mode === 'demo' ? (
          <div className="replay">
            <button
              title="Restart demo replay"
              aria-label="Restart demo replay"
              onClick={reset}
            >
              <RotateCcw size={15} />
            </button>
            <button
              title={playing ? 'Pause demo replay' : 'Play demo replay'}
              aria-label={playing ? 'Pause demo replay' : 'Play demo replay'}
              onClick={toggleReplay}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <Slider
              className="replay-slider"
              aria-label="Session replay position"
              min={0}
              max={77}
              step={1}
              value={[cursor]}
              onValueChange={(value) => {
                setPlaying(false);
                setCursor(Array.isArray(value) ? value[0] : value);
              }}
            />
            <span>{f.time} ET</span>
          </div>
        ) : (
          <div className="paper-task-status">
            {backend.data.snapshot?.message ?? 'Waiting for local backend'}
          </div>
        )}
      </footer>
    </main>
  );
}
function DesktopWindow({
  win,
  status,
  focus,
  update,
  close,
  children,
}: {
  win: Win;
  status: string;
  focus: () => void;
  update: (p: Partial<Win>) => void;
  close: () => void;
  children: ReactNode;
}) {
  const frame = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<SnapZone | null>(null);
  const animationFrame = useRef<number | null>(null);
  const lastDragEnded = useRef(-Infinity);
  const stopTracking = useRef<(() => void) | null>(null);
  const drag = useRef<{
    pointer: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    width: number;
    height: number;
    ratio: number;
    titleOffset: number;
    started: boolean;
    original: Win;
    target: SnapZone | null;
    bounds: WorkspaceBounds;
    clientX: number;
    clientY: number;
    position: { x: number; y: number };
    pressX: number;
    snapArmed: boolean;
    blockedZones: (SnapZone | null)[];
  } | null>(null);
  function toggleMaximize() {
    const rect = frame.current?.getBoundingClientRect();
    update(
      win.maximized || win.snap
        ? { maximized: false, snap: null }
        : {
            maximized: true,
            snap: null,
            width: rect?.width,
            height: rect?.height,
          },
    );
  }
  function paintDrag() {
    animationFrame.current = null;
    const d = drag.current,
      element = frame.current;
    if (!d || !element) return;
    if (!d.started) {
      if (Math.hypot(d.clientX - d.startX, d.clientY - d.startY) < 4) return;
      d.started = true;
      if (d.original.maximized || d.original.snap) {
        const restored = restoreAtPointer(
          d.clientX,
          d.clientY,
          d.ratio,
          d.titleOffset,
          d.width,
          d.bounds,
        );
        d.x = restored.x;
        d.y = restored.y;
        d.startX = d.clientX;
        d.startY = d.clientY;
      }
      element.style.setProperty('--drag-width', `${d.width}px`);
      element.style.setProperty('--drag-height', `${d.height}px`);
      element.dataset.dragging = 'true';
    }
    d.position = keepTitleVisible(
      d.x + d.clientX - d.startX,
      d.y + d.clientY - d.startY,
      d.width,
      d.bounds,
    );
    element.style.setProperty('--drag-x', `${d.position.x}px`);
    element.style.setProperty('--drag-y', `${d.position.y}px`);
    // Pulling a tile loose is a restore gesture. Do not snap it straight back
    // into its starting zone until the pointer has actually left that zone.
    const pointerZone = snapAt(d.clientX, d.clientY, d.bounds);
    if (
      !d.snapArmed &&
      (pointerZone === null || !d.blockedZones.includes(pointerZone))
    )
      d.snapArmed = true;
    const target = d.snapArmed
      ? windowSnapAt(
          d.clientX,
          d.clientY,
          d.bounds,
          d.position.x,
          d.width,
          d.clientX - d.pressX,
          d.target,
        )
      : null;
    if (target !== d.target) {
      d.target = target;
      setPreview(target);
    }
  }
  function finishDrag(cancel = false) {
    const d = drag.current;
    if (!d) return;
    if (animationFrame.current !== null)
      cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    // The last painted frame is the drop contract: commit the exact target
    // shown to the user. Pointer-up coordinates can differ from the last move
    // (especially with trackpads); do not silently re-test the zone on release.
    // A very quick drag may finish before its first animation frame.
    if (!cancel && !d.started) paintDrag();
    drag.current = null;
    stopTracking.current?.();
    stopTracking.current = null;
    if (document.documentElement.hasPointerCapture(d.pointer))
      document.documentElement.releasePointerCapture(d.pointer);
    if (d.started) lastDragEnded.current = performance.now();
    flushSync(() => {
      setPreview(null);
      if (!cancel && d.started)
        update({
          ...floatingPlacement(
            d.position.x,
            d.position.y,
            d.width,
            d.height,
            d.bounds,
          ),
          snap: d.target,
          maximized: false,
        });
    });
    if (frame.current) {
      delete frame.current.dataset.dragging;
      for (const name of [
        '--drag-x',
        '--drag-y',
        '--drag-width',
        '--drag-height',
      ])
        frame.current.style.removeProperty(name);
    }
  }
  useEffect(() => {
    return () => {
      stopTracking.current?.();
      if (animationFrame.current !== null)
        cancelAnimationFrame(animationFrame.current);
    };
  }, []);
  const Icon = APPS[win.id].icon;
  const style = {
    '--win-x': `${win.x}px`,
    '--win-y': `${win.y}px`,
    width: win.width,
    height: win.height,
    ...(win.snap ? snapStyle(win.snap) : {}),
    ...(win.maximized
      ? {
          left: 8,
          top: 8,
          width: 'calc(100% - 16px)',
          height: 'calc(100% - 16px)',
        }
      : {}),
    zIndex: win.z,
  } as CSSProperties;
  return (
    <>
      {preview && (
        <div
          className="window-snap-preview"
          style={{ ...snapStyle(preview), zIndex: win.z - 0.5 }}
          aria-hidden="true"
        >
          <span>
            Release to snap ·{' '}
            {preview.includes('-') ? 'Quarter screen' : 'Half screen'}
          </span>
        </div>
      )}
      <section
        ref={frame}
        className={`app-window ${win.maximized ? 'maximized' : ''} ${win.snap ? 'snapped' : ''} ${preview ? 'snap-dragging' : ''}`}
        style={style}
        aria-label={APPS[win.id].title}
        onPointerDown={focus}
      >
        <div
          className="titlebar"
          title="Drag to an edge for half screen, or a corner for quarter screen. Double-click to maximize or restore."
          onDoubleClick={(e) => {
            if (performance.now() - lastDragEnded.current < 400) return;
            if (!(e.target as HTMLElement).closest('button')) toggleMaximize();
          }}
          onPointerDown={(e) => {
            if (
              e.button !== 0 ||
              !e.isPrimary ||
              drag.current ||
              (e.target as HTMLElement).closest('button') ||
              window.innerWidth < 800
            )
              return;
            const rect = frame.current!.getBoundingClientRect();
            const bounds =
              frame.current!.parentElement!.getBoundingClientRect();
            const tiled = win.maximized || win.snap;
            drag.current = {
              pointer: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              x: rect.left - bounds.left,
              y: rect.top - bounds.top,
              width: tiled
                ? (win.width ?? Math.min(1060, bounds.width - 172))
                : rect.width,
              height: tiled
                ? (win.height ?? Math.min(720, bounds.height - 47))
                : rect.height,
              ratio: (e.clientX - rect.left) / rect.width,
              titleOffset: e.clientY - rect.top,
              started: false,
              original: {
                ...win,
                ...(!tiled ? { width: rect.width, height: rect.height } : {}),
              },
              target: null,
              bounds: {
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height,
              },
              clientX: e.clientX,
              clientY: e.clientY,
              position: {
                x: rect.left - bounds.left,
                y: rect.top - bounds.top,
              },
              pressX: e.clientX,
              snapArmed: !tiled,
              blockedZones: [
                win.snap ?? null,
                snapAt(e.clientX, e.clientY, bounds),
              ],
            };
            e.preventDefault();
            stopTracking.current = trackWindowDrag(window, e.pointerId, {
              move: (event) => {
                const d = drag.current;
                if (!d) return;
                d.clientX = event.clientX;
                d.clientY = event.clientY;
                if (animationFrame.current === null)
                  animationFrame.current = requestAnimationFrame(paintDrag);
              },
              finish: finishDrag,
            });
            // Capture on a stable page node, not a title bar being rerendered
            // as the preview appears. Global listeners also survive capture loss.
            document.documentElement.setPointerCapture(e.pointerId);
          }}
          onDragStart={(e) => e.preventDefault()}
        >
          <span>
            <Icon size={15} />
            {APPS[win.id].title}
          </span>
          <div className="titlebar-lines" />
          <div className="window-controls">
            <button
              aria-label={`Minimize ${APPS[win.id].title}`}
              onClick={() => update({ minimized: true })}
            >
              <Minus size={14} />
            </button>
            <button
              aria-label={`${win.maximized || win.snap ? 'Restore' : 'Maximize'} ${APPS[win.id].title}`}
              onClick={toggleMaximize}
            >
              {win.maximized || win.snap ? (
                <Square size={12} />
              ) : (
                <Maximize2 size={12} />
              )}
            </button>
            <button aria-label={`Close ${APPS[win.id].title}`} onClick={close}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="window-body">{children}</div>
        <div className="window-status">
          <span title={status}>
            <FlaskConical size={12} /> {status}
          </span>
          <span>TF / {win.id.toUpperCase()}</span>
        </div>
      </section>
    </>
  );
}
