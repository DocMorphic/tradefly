import type { Object3D, Mesh, MeshPhongMaterial, Texture } from 'three';
export interface ModelLeg {
  root: Object3D;
  knee: Object3D;
  ankle: Object3D;
  angle: number;
  lift: number;
  kneeAngle: number;
  phase: number;
  swingSign: number;
  isFront: boolean;
  geometry: { attachZ: number; femur: number; tibia: number; tarsus: number };
  apply(): void;
}
export function buildFlyModel(): {
  root: Object3D;
  legs: ModelLeg[];
  foldedWings: Object3D;
  blurWingL: Mesh;
  blurWingR: Mesh;
  abdomen: Mesh;
  wingFlightSpread: number;
};
