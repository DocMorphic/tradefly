import * as T from 'three';

// Original stylized geometry. Visual references: TuragaLab/flybody's separate
// membrane/vein meshes and DesktopFly's folded, translucent wing treatment.
// No source meshes or simulation code are imported from either project.
export function makeWings(parent: T.Object3D): T.Group[] {
  // A narrow hinge, stronger leading edge, rounded tip and broad trailing lobe.
  // u goes out from the body; v goes back along the abdomen.
  const outline = new T.Shape();
  outline.moveTo(0, 0);
  outline.bezierCurveTo(0.12, 0.02, 0.38, 0.17, 0.53, 0.43);
  outline.bezierCurveTo(0.70, 0.72, 0.70, 1.14, 0.50, 1.40);
  outline.bezierCurveTo(0.42, 1.52, 0.27, 1.55, 0.18, 1.42);
  outline.bezierCurveTo(0.04, 1.23, 0.04, 0.84, 0.02, 0.59);
  outline.bezierCurveTo(-0.035, 0.40, -0.065, 0.18, 0, 0);
  const membrane = new T.MeshPhysicalMaterial({
    color: '#dce8f5',
    transparent: true,
    opacity: 0.34,
    roughness: 0.27,
    metalness: 0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.2,
    iridescence: 0.55,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [180, 340],
    side: T.DoubleSide,
    depthWrite: false,
  });
  const veinMaterial = new T.MeshStandardMaterial({
    color: '#879bb3',
    roughness: 0.5,
    transparent: true,
    opacity: 0.60,
    depthWrite: false,
  });
  const rimMaterial = new T.MeshStandardMaterial({
    color: '#c8d4e9',
    roughness: 0.35,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  // Veins branch from the same hinge and stay within the membrane boundary.
  const veins = [
    [[0, 0], [0.23, 0.21], [0.45, 0.52], [0.57, 0.94], [0.50, 1.39]],
    [[0, 0], [0.16, 0.27], [0.31, 0.63], [0.38, 1.02], [0.36, 1.49]],
    [[0, 0], [0.09, 0.30], [0.17, 0.69], [0.21, 1.10], [0.23, 1.47]],
    [[0.02, 0.18], [0.055, 0.51], [0.08, 0.84], [0.09, 1.09]],
    [[0.17, 0.69], [0.24, 0.71], [0.33, 0.72]],
    [[0.38, 1.02], [0.46, 1.06], [0.565, 1.10]],
  ];
  return [-1, 1].map((side) => {
    const wing = new T.Group();
    wing.position.set(side * 0.22, 1.43 + (side > 0 ? 0.018 : 0), 0.01);
    wing.rotation.set(0, side * -0.08, side * 0.055);
    parent.add(wing);
    // Shared curvature keeps both membrane and fine veins on the same surface.
    const point = (u: number, v: number, offset = 0) => new T.Vector3(
      side * u,
      0.045 * Math.sin(Math.PI * v / 1.55) * Math.sin(Math.PI * (u + 0.07) / 0.8) + offset,
      -v,
    );
    const flat = new T.ShapeGeometry(outline, 48);
    // Subdivide the interior before curving it, so the membrane meets its veins.
    const source = flat.getAttribute('position');
    const indices = flat.getIndex()!;
    const vertices: number[] = [];
    function triangle(a: T.Vector2, b: T.Vector2, c: T.Vector2, depth: number) {
      if (depth === 0) {
        for (const p of [a, b, c]) vertices.push(p.x, p.y, 0);
        return;
      }
      const ab = a.clone().add(b).multiplyScalar(0.5);
      const bc = b.clone().add(c).multiplyScalar(0.5);
      const ca = c.clone().add(a).multiplyScalar(0.5);
      triangle(a, ab, ca, depth - 1);
      triangle(ab, b, bc, depth - 1);
      triangle(ca, bc, c, depth - 1);
      triangle(ab, bc, ca, depth - 1);
    }
    for (let i = 0; i < indices.count; i += 3) {
      const uv = [0, 1, 2].map(j => {
        const k = indices.getX(i + j);
        return new T.Vector2(source.getX(k), source.getY(k));
      });
      triangle(uv[0], uv[1], uv[2], 2);
    }
    flat.dispose();
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const p = point(positions.getX(i), positions.getY(i));
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    geometry.computeVertexNormals();
    const leaf = new T.Mesh(geometry, membrane);
    wing.add(leaf);
    function stroke(points: T.Vector3[], radius: number, material: T.Material, closed = false) {
      const curve = new T.CatmullRomCurve3(points, closed, 'centripetal');
      wing.add(new T.Mesh(new T.TubeGeometry(curve, closed ? 180 : 36, radius, 5, closed), material));
    }
    const edge = outline.getPoints(40);
    edge.pop(); // Tube closes the contour without a duplicate control point.
    stroke(edge.map(p => point(p.x, p.y)), 0.004, rimMaterial, true);
    veins.forEach((path, i) => stroke(path.map(([u, v]) => point(u, v, 0.003)), i === 0 ? 0.004 : 0.0025, veinMaterial));
    return wing;
  });
}
