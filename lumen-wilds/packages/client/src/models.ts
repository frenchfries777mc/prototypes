import * as THREE from 'three';
import { EntityKind, hash2 } from '@lw/shared';

/** 모든 모델은 로컬 +x가 정면이고, 발바닥이 y=0에 오도록 만든다. */
export interface Model {
  root: THREE.Group;
  /** 다쳤을 때 번쩍이게 할 재질들. 엔티티마다 따로 가진다. */
  mats: THREE.MeshLambertMaterial[];
  weapon?: THREE.Group;
  body: THREE.Object3D;
  height: number;
}

const unit = new THREE.BoxGeometry(1, 1, 1);

function box(model: Model, parent: THREE.Object3D, color: number, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ color });
  model.mats.push(mat);
  const m = new THREE.Mesh(unit, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function blank(height: number): Model {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  return { root, mats: [], body, height };
}

const TUNICS = [0xd1495b, 0x3d8bd9, 0x4caf6d, 0xe9a23b, 0x9b6fd6, 0x35b5a8, 0xd96fa8, 0xc8c8d0];
const HAIRS = [0x3a2a1e, 0x6b4423, 0xd9b36a, 0x2a2a35, 0xb5532f, 0xe8e2d0];

export function makePlayer(name: string): Model {
  const m = blank(1.05);
  let h = 7;
  for (const ch of name) h = hash2(h, ch.codePointAt(0)!, 3);
  const tunic = TUNICS[h % TUNICS.length]!, hair = HAIRS[(h >>> 8) % HAIRS.length]!;
  box(m, m.body, 0x39414f, 0.14, 0.2, 0.13, 0, 0.1, -0.09);
  box(m, m.body, 0x39414f, 0.14, 0.2, 0.13, 0, 0.1, 0.09);
  box(m, m.body, tunic, 0.26, 0.38, 0.38, 0, 0.39, 0);
  box(m, m.body, 0xf1c9a5, 0.28, 0.26, 0.3, 0.01, 0.71, 0);
  box(m, m.body, hair, 0.31, 0.1, 0.33, -0.01, 0.87, 0);
  box(m, m.body, 0x22262e, 0.03, 0.06, 0.05, 0.155, 0.72, -0.07);
  box(m, m.body, 0x22262e, 0.03, 0.06, 0.05, 0.155, 0.72, 0.07);
  const weapon = new THREE.Group();
  weapon.position.set(0.08, 0.42, 0.25);
  box(m, weapon, 0x7a5230, 0.12, 0.06, 0.06, 0.06, 0, 0);
  box(m, weapon, 0xdfe6ee, 0.46, 0.05, 0.1, 0.35, 0, 0);
  m.body.add(weapon);
  m.weapon = weapon;
  return m;
}

export function makeMob(kind: number): Model {
  if (kind === EntityKind.Slime) {
    const m = blank(0.55);
    box(m, m.body, 0x58cf8b, 0.62, 0.4, 0.62, 0, 0.2, 0);
    box(m, m.body, 0x8ee8b3, 0.4, 0.08, 0.4, 0, 0.43, 0);
    box(m, m.body, 0x12301f, 0.04, 0.1, 0.08, 0.31, 0.24, -0.12);
    box(m, m.body, 0x12301f, 0.04, 0.1, 0.08, 0.31, 0.24, 0.12);
    return m;
  }
  if (kind === EntityKind.Boar) {
    const m = blank(0.8);
    for (const [x, z] of [[-0.25, -0.13], [-0.25, 0.13], [0.22, -0.13], [0.22, 0.13]] as const) box(m, m.body, 0x4b2c1a, 0.12, 0.18, 0.1, x, 0.09, z);
    box(m, m.body, 0x8a5433, 0.78, 0.38, 0.42, 0, 0.36, 0);
    box(m, m.body, 0x9c6240, 0.28, 0.3, 0.34, 0.5, 0.34, 0);
    box(m, m.body, 0x3a2416, 0.56, 0.12, 0.14, -0.05, 0.6, 0);
    box(m, m.body, 0xf2ead8, 0.1, 0.05, 0.05, 0.62, 0.26, -0.14);
    box(m, m.body, 0xf2ead8, 0.1, 0.05, 0.05, 0.62, 0.26, 0.14);
    return m;
  }
  const m = blank(1.5); // 골렘
  box(m, m.body, 0x6f737c, 0.3, 0.3, 0.26, 0, 0.15, -0.2);
  box(m, m.body, 0x6f737c, 0.3, 0.3, 0.26, 0, 0.15, 0.2);
  box(m, m.body, 0x878b95, 0.62, 0.66, 0.84, 0, 0.62, 0);
  box(m, m.body, 0x9a9ea8, 0.36, 0.32, 0.4, 0.04, 1.1, 0);
  box(m, m.body, 0x6f737c, 0.28, 0.62, 0.24, 0.06, 0.55, -0.56);
  box(m, m.body, 0x6f737c, 0.28, 0.62, 0.24, 0.06, 0.55, 0.56);
  const core = box(m, m.body, 0xff9a3c, 0.06, 0.2, 0.2, 0.32, 0.66, 0);
  (core.material as THREE.MeshLambertMaterial).emissive.setHex(0xc85a10);
  m.mats.pop(); // 핵은 항상 빛나므로 피격 번쩍임 대상에서 뺀다
  return m;
}

export function disposeModel(m: Model): void {
  m.root.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose(); });
}
