import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFlyModel, type ModelLeg } from './desktopfly-model.mjs';
import type { FlyActivity } from './activity';

// Ground clearance and joint conventions adapted from DesktopFly's LegDynamics.
// Rendering poses are illustrative telemetry animations, never a trading controller.
function groundLift(leg: ModelLeg, knee: number) {
  const g = leg.geometry;
  const a =
    g.femur + g.tibia * Math.cos(knee) + g.tarsus * Math.cos(knee + 0.35);
  const b = g.tibia * Math.sin(knee) + g.tarsus * Math.sin(knee + 0.35);
  return (
    Math.atan2(b, a) -
    Math.asin(T.MathUtils.clamp(g.attachZ / Math.hypot(a, b), -1, 1))
  );
}
export function makeFlyScene(
  host: HTMLElement,
  read: () => FlyActivity,
  moving: () => boolean,
) {
  const scene = new T.Scene();
  scene.background = new T.Color('#1a1830');
  scene.fog = new T.Fog('#1a1830', 10, 23);
  const camera = new T.PerspectiveCamera(34, 1, 0.05, 40);
  camera.up.set(0, 0, 1);
  camera.position.set(3.6, 4.6, 3.8);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.setAttribute(
    'aria-label',
    'Articulated fruit fly with red compound eyes, banded abdomen and folded wings',
  );
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.1, 0.55);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.7;
  controls.maxDistance = 10;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.47;
  const sky = new T.HemisphereLight('#faf0e6', '#343048', 2.1);
  sky.position.set(0, 0, 10);
  scene.add(sky);
  const key = new T.DirectionalLight('#fff0df', 3.1);
  key.position.set(1, 3, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.normalBias = 0.015;
  key.shadow.bias = -0.0001;
  scene.add(key);
  const rim = new T.DirectionalLight('#919ef7', 2);
  rim.position.set(-4, -3, 3);
  scene.add(rim);
  const floor = new T.Mesh(
    new T.PlaneGeometry(60, 60),
    new T.MeshStandardMaterial({ color: '#24203b', roughness: 0.95 }),
  );
  floor.position.z = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  const stage = new T.Mesh(
    new T.CylinderGeometry(2.65, 2.68, 0.12, 96),
    new T.MeshStandardMaterial({
      color: '#4a4364',
      roughness: 0.8,
      metalness: 0.05,
    }),
  );
  stage.rotation.x = Math.PI / 2;
  stage.position.z = -0.06;
  stage.receiveShadow = true;
  scene.add(stage);
  const ring = new T.Mesh(
    new T.TorusGeometry(2.58, 0.008, 6, 100),
    new T.MeshBasicMaterial({ color: '#847aab' }),
  );
  ring.position.z = 0.004;
  scene.add(ring);
  const specimen = buildFlyModel();
  specimen.root.scale.setScalar(0.1);
  const body = new T.Group();
  body.add(specimen.root);
  scene.add(body);
  specimen.legs.forEach((leg) => {
    leg.kneeAngle = 0.95;
    leg.lift = groundLift(leg, 0.95);
    leg.apply();
  });
  // Fine thoracic setae and wing veins give the anatomical model texture at close range.
  const hairPoints: T.Vector3[] = [];
  for (let i = 0; i < 84; i++) {
    const phi = i * 2.39996,
      z = 0.1 + 0.88 * ((i + 0.5) / 84),
      r = Math.sqrt(1 - z * z);
    const p = new T.Vector3(
      4.37 * r * Math.cos(phi),
      2.5 + 5.29 * r * Math.sin(phi),
      6.2 + 3.91 * z,
    );
    hairPoints.push(
      p,
      p
        .clone()
        .add(
          new T.Vector3(r * Math.cos(phi), r * Math.sin(phi), z).multiplyScalar(
            0.48 + (i % 5) * 0.12,
          ),
        ),
    );
  }
  specimen.root.add(
    new T.LineSegments(
      new T.BufferGeometry().setFromPoints(hairPoints),
      new T.LineBasicMaterial({
        color: '#32251d',
        transparent: true,
        opacity: 0.72,
      }),
    ),
  );
  const veinMaterial = new T.LineBasicMaterial({
    color: '#7e715e',
    transparent: true,
    opacity: 0.38,
  });
  specimen.foldedWings.children.forEach((wing) => {
    for (const side of [-1, 1]) {
      const points = [
        [0, -0.7, 0.1],
        [side * 1.0, -4, 0.1],
        [side * 1.9, -8, 0.1],
        [side * 1.2, -13, 0.1],
        [0, -15.8, 0.1],
      ].map((p) => new T.Vector3(...(p as [number, number, number])));
      wing.add(
        new T.Line(new T.BufferGeometry().setFromPoints(points), veinMaterial),
      );
    }
    wing.add(
      new T.Line(
        new T.BufferGeometry().setFromPoints([
          new T.Vector3(0, -1, 0.1),
          new T.Vector3(0.4, -8, 0.1),
          new T.Vector3(0, -15, 0.1),
        ]),
        veinMaterial,
      ),
    );
    (wing as T.Mesh).castShadow = false;
  });
  let visible = true,
    lastTime = 0,
    t = 0,
    gait = 0,
    mode = '',
    transitionAge = 0,
    flight = 0,
    heading = 0;
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
  const observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
  });
  observer.observe(host);
  renderer.setAnimationLoop((now) => {
    if (now - lastTime < 1000 / 45) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!visible || document.hidden) return;
    const a = read(),
      active = moving();
    const event = a.mood + ':' + a.key;
    if (event !== mode) {
      mode = event;
      transitionAge = 0;
    }
    if (active) {
      t += dt;
      transitionAge += dt;
      const walking = a.mood === 'SCANNING' || a.mood === 'SELL';
      const grooming = a.mood === 'HOLD' || a.mood === 'PENDING';
      const reaching = a.mood === 'BUY';
      // A short flutter after a new confirmed fill, rather than endless celebration.
      const liftTarget =
        a.mood === 'FILLED' && transitionAge < 1.6
          ? Math.sin(Math.min(1, transitionAge / 1.6) * Math.PI)
          : 0;
      flight = T.MathUtils.damp(flight, liftTarget, 9, dt);
      const blend = 1 - Math.exp(-14 * dt);
      if (walking) gait = (gait + dt * 3.4) % 1;
      specimen.legs.forEach((leg) => {
        let angle = 0,
          knee = 0.95,
          lift = groundLift(leg, knee);
        if (walking) {
          const phase = (gait + leg.phase) % 1,
            stance = 0.72;
          angle =
            0.25 *
            (phase < stance
              ? 1 - (2 * phase) / stance
              : -1 +
                2 *
                  T.MathUtils.smoothstep(
                    (phase - stance) / (1 - stance),
                    0,
                    1,
                  ));
          if (a.mood === 'SELL') angle = -angle;
          lift +=
            phase > stance
              ? 0.28 * Math.sin(((phase - stance) / (1 - stance)) * Math.PI)
              : 0;
        }
        if ((grooming || reaching) && leg.isFront) {
          angle =
            0.35 + 0.16 * Math.sin(t * (reaching ? 8 : 13) + leg.swingSign);
          knee = 0.85;
          lift = 0.55 + 0.09 * Math.sin(t * 12 + leg.swingSign);
        }
        if (flight > 0.03) {
          angle = T.MathUtils.lerp(angle, -0.28, flight);
          knee = T.MathUtils.lerp(knee, 1.15, flight);
          lift = T.MathUtils.lerp(lift, 0.7, flight);
        }
        leg.angle += (angle - leg.angle) * blend;
        leg.kneeAngle += (knee - leg.kneeAngle) * blend;
        leg.lift += (lift - leg.lift) * blend;
        if (flight < 0.03)
          leg.lift = Math.max(leg.lift, groundLift(leg, leg.kneeAngle));
        leg.apply();
      });
      const targetHeading = walking
        ? 0.17 * Math.sin(t * 0.65)
        : reaching
          ? -0.12
          : 0;
      heading = T.MathUtils.damp(heading, targetHeading, 7, dt);
      body.rotation.z = heading;
      body.position.y = T.MathUtils.damp(
        body.position.y,
        walking ? 0.1 * Math.sin(t * 0.8) : 0,
        5,
        dt,
      );
      body.position.z = flight * 0.35;
      body.rotation.x = T.MathUtils.damp(body.rotation.x, -flight * 0.1, 8, dt);
      specimen.abdomen.scale.z =
        0.75 * (1 + 0.012 * Math.sin(t * (walking ? 3 : 1.5)));
      const stroke = Math.sin(t * 2 * Math.PI * 19),
        beat = T.MathUtils.smoothstep(flight, 0.25, 0.7);
      specimen.foldedWings.children.forEach((wing, i) => {
        const side = i === 0 ? -1 : 1;
        wing.rotation.set(
          stroke * 0.3 * beat,
          0,
          side * (0.13 + flight * 0.97 + stroke * 0.13 * beat),
        );
      });
      [specimen.blurWingL, specimen.blurWingR].forEach((wing, i) => {
        wing.visible = flight > 0.08;
        (wing.material as T.MeshBasicMaterial).opacity =
          (0.08 + 0.09 * Math.abs(stroke)) * flight;
        wing.rotation.z = (i === 0 ? 1 : -1) * (0.45 + stroke * 0.15);
      });
    }
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    resetCamera() {
      camera.position.set(3.6, 4.6, 3.8);
      controls.target.set(0, -0.1, 0.55);
      controls.update();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      observer.disconnect();
      controls.dispose();
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>(),
        textures = new Set<T.Texture>();
      scene.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.Line) {
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            materials.add(m);
            for (const v of Object.values(m))
              if (v instanceof T.Texture) textures.add(v);
          }
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((v) => v.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
