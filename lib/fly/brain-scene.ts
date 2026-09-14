import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { NeuralActivity } from '@/lib/backend';

export type BrainGeometry = {
  dataset: string;
  model_neurons: number;
  mapped_neurons: number;
  unmapped_neurons: number;
  coordinate_kind: string;
  classes: string[];
  points: [string, number, number, number, number][];
};
export type BrainPick = {
  id: string;
  classification: string;
  visibleSpikes: number;
};

export function makeBrainScene(
  host: HTMLElement,
  data: BrainGeometry,
  report: (time: number, playing: boolean) => void,
  pick: (n: BrainPick) => void,
) {
  const scene = new T.Scene();
  scene.background = new T.Color('#100d27');
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(0, 1, 28);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.domElement.setAttribute(
    'aria-label',
    'FlyWire neuron positions. Drag to rotate, scroll to zoom, click a point to inspect.',
  );
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 10;
  controls.maxDistance = 55;
  const positions = new Float32Array(data.points.length * 3);
  const colors = new Float32Array(data.points.length * 3);
  const energy = new Float32Array(data.points.length);
  const idToIndex = new Map<string, number>();
  const palette = [
    '#817bbf',
    '#b397d6',
    '#7da7b4',
    '#a39ccc',
    '#a581b6',
    '#aea4eb',
    '#8587a8',
  ];
  data.points.forEach((p, i) => {
    idToIndex.set(p[0], i);
    positions.set([p[1], -p[2], -p[3]], i * 3);
    const c = new T.Color(palette[p[4] % palette.length]);
    colors.set([c.r, c.g, c.b], i * 3);
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(positions, 3));
  geo.setAttribute('color', new T.BufferAttribute(colors, 3));
  geo.setAttribute(
    'energy',
    new T.BufferAttribute(energy, 1).setUsage(T.DynamicDrawUsage),
  );
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 color; attribute float energy; varying vec3 tint; varying float power; uniform float pixelRatio;
      void main(){ tint=color;power=energy;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp((1.35+energy*5.)*pixelRatio*28./-p.z,1.,14.); }`,
    fragmentShader: `varying vec3 tint; varying float power; void main(){ float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float glow=exp(-r*r*3.);gl_FragColor=vec4(mix(tint,vec3(.85,.91,1.),power),glow*(.17+.8*power)); }`,
  });
  const cloud = new T.Points(geo, mat);
  scene.add(cloud);
  const mark = new T.Mesh(
    new T.SphereGeometry(0.13, 12, 12),
    new T.MeshBasicMaterial({ color: '#eee9ff', wireframe: true }),
  );
  mark.visible = false;
  scene.add(mark);
  const ray = new T.Raycaster();
  ray.params.Points!.threshold = 0.11;
  const pointer = new T.Vector2();
  let down = { x: 0, y: 0 };
  let activity: NeuralActivity | undefined,
    time = 0,
    playing = false,
    speed = 0.25;
  let cursor = 0,
    last = 0,
    lastReport = 0,
    raf = 0,
    disposed = false;
  const alive = new Map<number, number>();
  const hits = new Map<string, number>();
  function select(e: PointerEvent) {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObject(cloud)[0];
    if (hit?.index === undefined) return;
    const i = hit.index,
      p = data.points[i];
    mark.position.fromArray(positions, i * 3);
    mark.visible = true;
    pick({
      id: p[0],
      classification: data.classes[p[4]],
      visibleSpikes: hits.get(p[0]) ?? 0,
    });
  }
  const start = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  renderer.domElement.addEventListener('pointerdown', start);
  renderer.domElement.addEventListener('pointerup', select);
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height));
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  function seek(ms: number) {
    time = Math.max(0, Math.min(activity?.duration_ms ?? 0, ms));
    cursor = 0;
    alive.clear();
    energy.fill(0);
    while (
      activity &&
      cursor < activity.events.length &&
      activity.events[cursor][1] <= time
    ) {
      const [n, t] = activity.events[cursor++],
        i = idToIndex.get(activity.neuron_ids[n]);
      if (i !== undefined && time - t < 45) alive.set(i, t);
    }
    (geo.attributes.energy as T.BufferAttribute).needsUpdate = true;
    report(time, playing);
  }
  function draw(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(draw);
    if (now - last < 1000 / 30) return;
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (playing && activity && !document.hidden) {
      time = Math.min(activity.duration_ms, time + dt * speed);
      while (
        cursor < activity.events.length &&
        activity.events[cursor][1] <= time
      ) {
        const [n, t] = activity.events[cursor++],
          i = idToIndex.get(activity.neuron_ids[n]);
        if (i !== undefined) alive.set(i, t);
      }
      if (time >= activity.duration_ms) playing = false;
    }
    for (const [i, t] of alive) {
      const a = Math.max(0, 1 - (time - t) / 45);
      energy[i] = a;
      if (!a) alive.delete(i);
    }
    (geo.attributes.energy as T.BufferAttribute).needsUpdate = true;
    controls.update();
    renderer.render(scene, camera);
    if (now - lastReport > 100) {
      report(time, playing);
      lastReport = now;
    }
  }
  raf = requestAnimationFrame(draw);
  return {
    setActivity(a: NeuralActivity | undefined, autoplay: boolean) {
      activity = a;
      hits.clear();
      mark.visible = false;
      for (const [i] of a?.events ?? []) {
        const id = a!.neuron_ids[i];
        hits.set(id, (hits.get(id) ?? 0) + 1);
      }
      playing = !!a && autoplay;
      seek(0);
    },
    setPlaying(p: boolean) {
      if (p && activity && time >= activity.duration_ms) seek(0);
      playing = p && !!activity;
      report(time, playing);
    },
    setSpeed(s: number) {
      speed = s;
    },
    seek,
    reset() {
      camera.position.set(0, 1, 28);
      controls.target.set(0, 0, 0);
      controls.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', start);
      renderer.domElement.removeEventListener('pointerup', select);
      geo.dispose();
      mat.dispose();
      mark.geometry.dispose();
      mark.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
