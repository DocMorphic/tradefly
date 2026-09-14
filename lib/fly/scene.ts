import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { FlyActivity } from './activity';
export function makeFlyScene(
  host: HTMLElement,
  read: () => FlyActivity,
  moving: () => boolean,
) {
  const scene = new T.Scene();
  scene.background = new T.Color('#17132d');
  scene.fog = new T.Fog('#17132d', 8, 19);
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(4.6, 3.2, 5.2);
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
    'Interactive stylized 3D fruit fly at a trading terminal',
  );
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);
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
    wing: new T.MeshPhysicalMaterial({
      color: '#ded4ff',
      transparent: true,
      opacity: 0.43,
      roughness: 0.18,
      metalness: 0.1,
      side: T.DoubleSide,
      depthWrite: false,
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
    new T.CylinderGeometry(2.2, 2.28, 0.18, 64),
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
    new T.TorusGeometry(2.16, 0.012, 6, 100),
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
        c = new T.Vector3(side * 0.48, -0.85, 0.43 - i * 0.25);
      bone(leg, a, b, 0.028);
      bone(leg, b, c, 0.018);
      oval(leg, mats.dark, c.toArray(), [0.07, 0.023, 0.13]);
    }
  const wings: T.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new T.Group();
    wing.position.set(side * 0.2, 1.44, 0.02);
    fly.add(wing);
    wings.push(wing);
    const leaf = oval(
      wing,
      mats.wing,
      [side * 0.51, 0, -0.48],
      [0.43, 0.018, 0.83],
    );
    leaf.rotation.y = side * 0.46;
    const veins = new T.LineBasicMaterial({
      color: '#e0d8f1',
      transparent: true,
      opacity: 0.55,
    });
    for (let j = 0; j < 3; j++) {
      const points = [
        new T.Vector3(0, 0.025, 0),
        new T.Vector3(side * (0.35 + j * 0.08), 0.025, -0.5),
        new T.Vector3(side * (0.45 + j * 0.1), 0.025, -1.05 + j * 0.13),
      ];
      wing.add(new T.Line(new T.BufferGeometry().setFromPoints(points), veins));
    }
  }
  // A tiny physical keyboard; front-leg movements mirror activity, never submit orders.
  const keyboard = new T.Group();
  keyboard.position.set(0.3, 0.18, 0.87);
  scene.add(keyboard);
  box(keyboard, mats.dark, [0, 0, 0], [1.08, 0.1, 0.43]);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 9; col++)
      box(
        keyboard,
        mats.keys,
        [-0.46 + col * 0.115, 0.061, -0.13 + row * 0.13],
        [0.086, 0.025, 0.09],
      );
  const monitor = new T.Group();
  monitor.position.set(-1.22, 0.78, -0.24);
  monitor.rotation.y = 0.35;
  scene.add(monitor);
  box(monitor, mats.dark, [0, 0, 0], [1.12, 0.76, 0.1]);
  box(monitor, mats.dark, [0, -0.49, -0.015], [0.12, 0.36, 0.1]);
  box(monitor, mats.dark, [0, -0.65, 0.06], [0.5, 0.04, 0.33]);
  const screen = document.createElement('canvas');
  screen.width = 512;
  screen.height = 320;
  const ctx = screen.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const texture = new T.CanvasTexture(screen);
  texture.colorSpace = T.SRGBColorSpace;
  const display = new T.Mesh(
    new T.PlaneGeometry(1, 0.63),
    new T.MeshBasicMaterial({ map: texture }),
  );
  display.position.z = 0.056;
  monitor.add(display);
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
    ctx!.fillStyle = '#191229';
    ctx!.fillRect(0, 0, 512, 320);
    ctx!.fillStyle = '#a591c7';
    ctx!.font = '22px monospace';
    ctx!.fillText(a.demo ? 'ANIMATION DEMO' : 'TRADEFLY / PAPER', 28, 44);
    ctx!.fillStyle = '#ede1ff';
    ctx!.font = 'bold 54px monospace';
    ctx!.fillText(a.symbol.slice(0, 12), 28, 126);
    ctx!.font = '32px monospace';
    ctx!.fillStyle =
      a.mood === 'BUY' ? '#b1d6cd' : a.mood === 'SELL' ? '#daa4c5' : '#b8a9e3';
    ctx!.fillText(a.mood, 28, 190);
    ctx!.fillStyle = '#8b79a8';
    ctx!.font = '17px monospace';
    ctx!.fillText(
      a.demo ? 'No orders generated' : 'Recorded activity display',
      28,
      270,
    );
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
    const working = ['SCANNING', 'BUY', 'SELL', 'PENDING', 'FILLED'].includes(
        a.mood,
      ),
      buy = a.mood === 'BUY',
      sell = a.mood === 'SELL',
      fill = a.mood === 'FILLED';
    const key = a.mood + a.symbol + a.demo;
    if (key !== lastText) {
      paint(a);
      lastText = key;
    }
    fly.position.y =
      (working ? 0.022 : 0.007) * Math.sin(t * (working ? 4 : 1.3)) +
      (fill ? 0.09 * Math.abs(Math.sin(t * 4)) : 0);
    fly.rotation.y = sell
      ? -0.14 + 0.06 * Math.sin(t * 3)
      : buy
        ? 0.12
        : working
          ? 0.075 * Math.sin(t * 1.4)
          : 0.015 * Math.sin(t * 0.5);
    head.rotation.y = working
      ? 0.17 * Math.sin(t * 1.7)
      : 0.03 * Math.sin(t * 0.5);
    head.rotation.x =
      a.mood === 'PAUSED' || a.mood === 'CLOSED' ? 0.13 : buy ? -0.08 : 0;
    legs.forEach((leg, i) => {
      leg.rotation.x =
        working && i % 3 === 0
          ? 0.14 * Math.sin(t * (buy || sell ? 15 : 7) + i)
          : 0.015 * Math.sin(t + i);
      leg.rotation.z = fill ? 0.06 * Math.sin(t * 10 + i) : 0;
    });
    wings.forEach((wing, i) => {
      const side = i === 0 ? -1 : 1;
      wing.rotation.z =
        side *
        ((fill ? 0.35 : 0.1) +
          (working ? 0.11 : 0.015) *
            Math.sin(t * (fill ? 28 : working ? 15 : 2)));
    });
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    resetCamera() {
      camera.position.set(4.6, 3.2, 5.2);
      controls.target.set(0, 0.9, 0);
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
