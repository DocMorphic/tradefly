'use client';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { flushSync } from 'react-dom';
import { FlyHabitat } from '@/components/fly-habitat';
import { SwarmResearch } from '@/components/swarm-research';
import { FlyLog } from '@/components/fly-log';
import { PaperView, useBackend } from '@/components/paper-views';
import { ExperimentView } from '@/components/experiment-views';
import { Slider } from '@/components/ui/slider';
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

type AppId =
  | 'overview'
  | 'brain'
  | 'ledger'
  | 'analysis'
  | 'notes'
  | 'log'
  | 'swarm'
  | 'habitat';
const APPS = {
  habitat: { title: 'Fly habitat', icon: Bug },
  swarm: { title: 'Swarm research', icon: FlaskConical },
  log: { title: 'Fly log', icon: Activity },
  overview: { title: 'Observation desk', icon: Grid2X2 },
  brain: { title: 'Decision inspector', icon: Network },
  ledger: { title: 'Trade ledger', icon: Table2 },
  analysis: { title: 'Performance lab', icon: BarChart3 },
  notes: { title: 'Data & definitions', icon: BookOpen },
};
const APP_IDS = Object.keys(APPS) as AppId[];
type Win = {
  id: AppId;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
};
const DEFAULT_WINDOW: Win = {
  id: 'overview',
  x: 132,
  y: 28,
  z: 1,
  minimized: false,
  maximized: false,
};
export default function Desktop() {
  const backend = useBackend();
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
                    y: 52,
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
              y: 42 + (ws.length % 3) * 24,
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
  function content(id: AppId): ReactNode {
    if (id === 'habitat') return <FlyHabitat backend={backend} />;
    if (id === 'swarm') return <SwarmResearch />;
    if (id === 'log') return <FlyLog backend={backend} />;
    if (mode === 'paper') return <PaperView id={id} backend={backend} />;
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
      <nav className="desktop-icons" aria-label="Applications">
        {APP_IDS.map((id) => {
          const Icon = APPS[id].icon;
          return (
            <button key={id} onClick={() => open(id)}>
              <span className="desktop-icon">
                <Icon size={29} strokeWidth={1.3} />
              </span>
              <span>{APPS[id].title}</span>
            </button>
          );
        })}
      </nav>
      <div className="workspace" id="workspace" tabIndex={-1}>
        {windows
          .filter((w) => !w.minimized)
          .map((w) => (
            <DesktopWindow
              key={w.id}
              win={w}
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
  focus,
  update,
  close,
  children,
}: {
  win: Win;
  focus: () => void;
  update: (p: Partial<Win>) => void;
  close: () => void;
  children: ReactNode;
}) {
  const drag = useRef<{ x: number; y: number; wx: number; wy: number } | null>(
    null,
  );
  const Icon = APPS[win.id].icon;
  const style = {
    '--win-x': `${win.x}px`,
    '--win-y': `${win.y}px`,
    zIndex: win.z,
  } as CSSProperties;
  return (
    <section
      className={`app-window ${win.maximized ? 'maximized' : ''}`}
      style={style}
      aria-label={APPS[win.id].title}
      onPointerDown={focus}
    >
      <div
        className="titlebar"
        onDoubleClick={() => update({ maximized: !win.maximized })}
        onPointerDown={(e) => {
          if (
            (e.target as HTMLElement).closest('button') ||
            win.maximized ||
            window.innerWidth < 800
          )
            return;
          drag.current = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          update({
            x: Math.max(
              0,
              Math.min(
                window.innerWidth - 240,
                drag.current.wx + e.clientX - drag.current.x,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                window.innerHeight - 160,
                drag.current.wy + e.clientY - drag.current.y,
              ),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
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
            aria-label={`Maximize ${APPS[win.id].title}`}
            onClick={() => update({ maximized: !win.maximized })}
          >
            {win.maximized ? <Square size={12} /> : <Maximize2 size={12} />}
          </button>
          <button aria-label={`Close ${APPS[win.id].title}`} onClick={close}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="window-body">{children}</div>
      <div className="window-status">
        <span>
          <FlaskConical size={12} /> Synthetic demo · no fly or broker connected
        </span>
        <span>TF / {win.id.toUpperCase()}</span>
      </div>
    </section>
  );
}
