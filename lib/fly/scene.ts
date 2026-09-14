import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { FlyActivity } from './activity';
import { makeWings } from './wings';
export function makeFlyScene(
  host: HTMLElement,
  read: () => FlyActivity,
  moving: () => boolean,
) {
  const scene = new T.Scene();
  scene.background = new T.Color('#17132d');
  scene.fog = new T.Fog('#17132d', 8, 19);
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(4.8, 3.3, -4.6);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.domElement.setAttribute(
    'aria-label',
    'Friendly fly gently typing in front of a large illustrative trading chart',
  );
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.15, 1.15, 0.35);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.6;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = 0.3;
  scene.add(new T.HemisphereLight('#ddd4ff', '#29223b', 2));
  const key = new T.DirectionalLight('#e9d8ff', 4);
  key.position.set(3, 6, 3);
  scene.add(key);
  const rim = new T.DirectionalLight('#8d8aff', 3);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const mats = {
    body: new T.MeshStandardMaterial({
      color: '#7b6189',
      roughness: 0.45,
      metalness: 0.25,
    }),
    dark: new T.MeshStandardMaterial({ color: '#342b4a', roughness: 0.6 }),
    eye: new T.MeshStandardMaterial({
      color: '#9d4e8f',
      roughness: 0.25,
      metalness: 0.25,
      flatShading: true,
    }),
    desk: new T.MeshStandardMaterial({ color: '#514267', roughness: 0.7 }),
    keys: new T.MeshStandardMaterial({ color: '#9d8cb7', roughness: 0.4 }),
  };
  const sphere = new T.SphereGeometry(1, 24, 16);
  function oval(
    parent: T.Object3D,
    material: T.Material,
    p: number[],
    scale: number[],
  ) {
    const mesh = new T.Mesh(sphere, material);
    mesh.position.set(p[0], p[1], p[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    parent.add(mesh);
    return mesh;
  }
  function box(
    parent: T.Object3D,
    material: T.Material,
    p: number[],
    size: number[],
  ) {
    const mesh = new T.Mesh(
      new T.BoxGeometry(size[0], size[1], size[2]),
      material,
    );
    mesh.position.set(p[0], p[1], p[2]);
    parent.add(mesh);
    return mesh;
  }
  function bone(parent: T.Object3D, a: T.Vector3, b: T.Vector3, r = 0.028) {
    const mesh = new T.Mesh(
      new T.CylinderGeometry(r, r * 0.75, a.distanceTo(b), 7),
      mats.dark,
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    parent.add(mesh);
  }
  const plinth = new T.Mesh(
    new T.CylinderGeometry(2.6, 2.68, 0.18, 64),
    mats.desk,
  );
  plinth.position.y = 0.02;
  scene.add(plinth);
  const ground = new T.Mesh(
    new T.PlaneGeometry(60, 60),
    new T.MeshStandardMaterial({ color: '#211a37', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.09;
  scene.add(ground);
  const ring = new T.Mesh(
    new T.TorusGeometry(2.56, 0.012, 6, 100),
    new T.MeshBasicMaterial({ color: '#ae8dce' }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  scene.add(ring);
  const fly = new T.Group();
  fly.position.set(0.3, 0, -0.15);
  scene.add(fly);
  oval(fly, mats.body, [0, 1.03, -0.52], [0.35, 0.32, 0.64]);
  for (let i = 0; i < 5; i++) {
    const band = new T.Mesh(
      new T.TorusGeometry(0.295 - i * 0.025, 0.027, 6, 30),
      mats.dark,
    );
    band.scale.y = 0.85;
    band.position.set(0, 1.04, -0.35 - i * 0.16);
    fly.add(band);
  }
  oval(fly, mats.body, [0, 1.15, 0.02], [0.37, 0.36, 0.45]);
  const head = new T.Group();
  head.position.set(0, 1.22, 0.5);
  fly.add(head);
  oval(head, mats.dark, [0, 0, 0], [0.31, 0.29, 0.28]);
  for (const side of [-1, 1]) {
    const eye = new T.Mesh(new T.IcosahedronGeometry(0.245, 2), mats.eye);
    eye.scale.set(0.85, 1.1, 0.9);
    eye.position.set(side * 0.23, 0.035, 0.12);
    head.add(eye);
    oval(
      head,
      new T.MeshBasicMaterial({ color: '#eedbff' }),
      [side * 0.28, 0.145, 0.265],
      [0.034, 0.045, 0.019],
    );
    const a = new T.Vector3(side * 0.11, 0.12, 0.24),
      b = new T.Vector3(side * 0.2, 0.35, 0.39);
    bone(head, a, b, 0.012);
    oval(head, mats.body, b.toArray(), [0.04, 0.065, 0.04]);
  }
  const legs: T.Group[] = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const leg = new T.Group();
      leg.position.set(side * 0.25, 1.02, 0.3 - i * 0.38);
      fly.add(leg);
      legs.push(leg);
      const a = new T.Vector3(0, 0, 0),
        b = new T.Vector3(side * 0.4, -0.34, 0.18 - i * 0.12),
        c = new T.Vector3(
          side * (i === 0 ? 0.1 : 0.4),
          i === 0 ? -0.744 : -0.85,
          i === 0 ? 0.58 : 0.43 - i * 0.25,
        );
      bone(leg, a, b, 0.028);
      bone(leg, b, c, 0.018);
      oval(leg, mats.dark, c.toArray(), [0.07, 0.023, 0.13]);
    }
  const wings = makeWings(fly);
  // Decorative keyboard: key travel is synchronized with the front feet.
  const keyboard = new T.Group();
  keyboard.position.set(0.3, 0.18, 0.87);
  scene.add(keyboard);
  box(keyboard, mats.dark, [0, 0, 0], [1.08, 0.1, 0.43]);
  const keycaps: T.Mesh[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 9; col++)
      keycaps.push(
        box(
          keyboard,
          mats.keys,
          [-0.46 + col * 0.115, 0.061, -0.13 + row * 0.13],
          [0.086, 0.025, 0.09],
        ),
      );
  const monitor = new T.Group();
  monitor.position.set(0.15, 1.88, 1.73);
  monitor.rotation.y = Math.PI;
  scene.add(monitor);
  box(monitor, mats.dark, [0, 0, 0], [3.25, 1.88, 0.14]);
  box(monitor, mats.desk, [0, -1.12, -0.02], [0.19, 0.45, 0.16]);
  box(monitor, mats.dark, [0, -1.57, 0.1], [1.12, 0.1, 0.6]);
  box(monitor, mats.desk, [0, -1.35, -0.02], [0.19, 0.48, 0.16]);
  const screen = document.createElement('canvas');
  screen.width = 1200;
  screen.height = 660;
  const ctx = screen.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const texture = new T.CanvasTexture(screen);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const display = new T.Mesh(
    new T.PlaneGeometry(3.05, 1.68),
    new T.MeshBasicMaterial({ map: texture }),
  );
  display.position.z = 0.076;
  monitor.add(display);
  const glow = new T.PointLight('#93bcdb', 1.4, 4);
  glow.position.set(0.2, 1.8, 1.25);
  scene.add(glow);
  let lastText = '',
    lastTime = 0,
    t = 0,
    visible = true;
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (w && h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  });
  resize.observe(host);
  const visibility = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
  });
  visibility.observe(host);
  function paint(a: FlyActivity) {
    const c = ctx!;
    c.fillStyle = '#111b27';
    c.fillRect(0, 0, 1200, 660);
    c.fillStyle = '#b6bcd9';
    c.font = '24px monospace';
    c.fillText('TRADEFLY  /  TRADING DESK', 35, 48);
    c.fillStyle = '#53617c';
    c.fillRect(32, 70, 1136, 1);
    c.fillStyle = '#eff3ff';
    c.font = 'bold 37px monospace';
    c.fillText('MARKET WATCH', 35, 124);
    c.fillStyle = '#8b9bb0';
    c.font = '20px monospace';
    c.fillText('PAPER ACTIVITY', 885, 119);
    c.fillStyle = '#e1d9f5';
    c.font = 'bold 30px monospace';
    c.fillText(a.symbol.slice(0, 12), 885, 168);
    c.font = '20px monospace';
    c.fillStyle = '#98a7bb';
    c.fillText(a.mood, 885, 205);
    for (let i = 0; i < 6; i++) {
      c.strokeStyle = '#253347';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(36, 170 + i * 65);
      c.lineTo(840, 170 + i * 65);
      c.stroke();
    }
    // Deliberately fixed decorative candles, never presented as market prices.
    let previous = 360;
    for (let i = 0; i < 44; i++) {
      const close =
        370 - i * 3.2 + Math.sin(i * 0.72) * 42 + Math.sin(i * 2.1) * 15;
      const open = previous;
      const green = close < open;
      const x = 48 + i * 18;
      c.strokeStyle = c.fillStyle = green ? '#66d9aa' : '#f27886';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + 5, Math.min(open, close) - 12 - (i % 7));
      c.lineTo(x + 5, Math.max(open, close) + 14);
      c.stroke();
      c.fillRect(
        x,
        Math.min(open, close),
        10,
        Math.max(4, Math.abs(close - open)),
      );
      c.globalAlpha = 0.45;
      const volume = 15 + (Math.sin(i * 1.9) + 1) * 33;
      c.fillRect(x, 548 - volume, 10, volume);
      c.globalAlpha = 1;
      previous = close;
    }
    c.fillStyle = '#8b9bb0';
    c.font = '18px monospace';
    c.fillText('BUY OUTPUT', 885, 290);
    c.fillText('SELL OUTPUT', 885, 387);
    c.font = 'bold 32px monospace';
    c.fillStyle = '#66d9aa';
    c.fillText(a.buyHz === null ? '—' : a.buyHz.toFixed(1) + ' Hz', 885, 335);
    c.fillStyle = '#f27886';
    c.fillText(a.sellHz === null ? '—' : a.sellHz.toFixed(1) + ' Hz', 885, 433);
    c.fillStyle = '#253347';
    c.fillRect(32, 583, 1136, 1);
    c.fillStyle = '#a2aec2';
    c.font = '20px monospace';
    c.fillText('ILLUSTRATIVE CHART  ·  LIVE PAPER READINGS AT RIGHT', 35, 625);
    texture.needsUpdate = true;
  }
  renderer.setAnimationLoop((now) => {
    if (now - lastTime < 1000 / 30) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!visible || document.hidden) return;
    const a = read(),
      active = moving();
    if (active) t += dt;
    const key = a.mood + a.symbol + a.buyHz + a.sellHz;
    if (key !== lastText) {
      paint(a);
      lastText = key;
    }
    // One quiet desk loop, independent of orders, decisions and broker state.
    fly.position.y = 0.005 * Math.sin(t * 1.5);
    fly.rotation.y = 0.018 * Math.sin(t * 0.65);
    head.rotation.y = 0.065 * Math.sin(t * 0.85);
    head.rotation.x = 0.05 + 0.025 * Math.sin(t * 1.1);
    legs.forEach((leg, i) => {
      const tap = Math.max(0, Math.sin(t * 4.8 + (i < 3 ? 0 : Math.PI)));
      leg.rotation.x = i % 3 === 0 ? 0.027 * tap : 0;
      leg.rotation.z = 0;
    });
    keycaps.forEach((cap, i) => {
      const tappingKey = i === 1 || i === 7;
      const tap = tappingKey
        ? Math.max(0, Math.sin(t * 4.8 + (i === 1 ? Math.PI : 0)))
        : 0;
      cap.position.y = 0.061 - 0.016 * tap;
    });
    wings.forEach((wing, i) => {
      const side = i === 0 ? -1 : 1;
      wing.rotation.y = side * -0.08;
      wing.rotation.z = side * (0.055 + 0.006 * Math.sin(t * 1.5));
    });
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    resetCamera() {
      camera.position.set(4.8, 3.3, -4.6);
      controls.target.set(0.15, 1.15, 0.35);
      controls.update();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      visibility.disconnect();
      controls.dispose();
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>();
      scene.traverse((object) => {
        if (object instanceof T.Mesh || object instanceof T.Line) {
          geometries.add(object.geometry);
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((m) => materials.add(m));
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
