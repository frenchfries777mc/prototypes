// CC0 모델(Kenney Nature Kit · Poly Haven)을 불러 같은 모델끼리 InstancedMesh 로 묶어 놓는다. 출처: assets/models/LICENSES.md
// 월드 좌표에 놓일 위치는 시드에서 결정적으로 뽑는다(모든 플레이어가 같은 풍경을 본다).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { RNG, TRENCH_X, POINT_R, POINT_X, POINT_Z, HALF_X, HALF_Z } from './world.js';

export class Models {
  constructor() { this.loader = new GLTFLoader(); this.cache = new Map(); }
  url(name) { return name.includes('/') ? `assets/models/${name}.glb` : `assets/models/${name}/${name}.gltf`; }
  async load(names) {
    await Promise.all([...new Set(names)].map(async (name) => {
      if (this.cache.has(name)) return;
      try {
        const gltf = await this.loader.loadAsync(this.url(name));
        gltf.scene.updateMatrixWorld(true);
        const parts = [], bb = new THREE.Box3();
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          const mat = o.material.clone();
          mat.roughness = Math.max(mat.roughness ?? 0.9, 0.8); mat.metalness = Math.min(mat.metalness ?? 0, 0.1);
          if (mat.map) mat.map.anisotropy = 4;
          geo.computeBoundingBox(); bb.union(geo.boundingBox);
          parts.push({ geo, mat });
        });
        const size = bb.getSize(new THREE.Vector3());
        this.cache.set(name, { parts, size, minY: bb.min.y, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2 });
      } catch (e) { console.warn('모델을 못 읽음', name, e); this.cache.set(name, null); }
    }));
  }
  get(name) { return this.cache.get(name) || null; }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _pre = new THREE.Matrix4(), _e = new THREE.Euler();

// 같은 모델의 배치 목록을 모았다가 한 번에 InstancedMesh 로 만든다.
export class Batch {
  constructor(models) { this.models = models; this.items = new Map(); this.count = 0; }
  // size: byHeight 이면 높이(m), 아니면 가장 긴 변(m). tiltX: 눕히기(라디안). color: 곱해지는 색.
  add(name, x, y, z, yaw, size, byHeight = true, color = null, tiltX = 0, sy = 1) {
    const m = this.models.get(name);
    if (!m) return false;
    _e.set(tiltX, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    // 눕힌 뒤의 크기 기준으로 배율을 정한다
    const ex = tiltX ? new THREE.Vector3(m.size.x, m.size.z, m.size.y) : m.size;
    const ref = byHeight ? ex.y : Math.max(ex.x, ex.y, ex.z);
    const k = size / Math.max(ref, 1e-4);
    _s.set(k, k * sy, k);
    _pre.makeTranslation(-m.cx, -m.minY, -m.cz);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s).multiply(_pre);
    let a = this.items.get(name);
    if (!a) this.items.set(name, (a = []));
    a.push({ m: _m.clone(), color });
    this.count++;
    return true;
  }
  build({ cast = true, receive = true } = {}) {
    const g = new THREE.Group(); g.name = 'decor';
    for (const [name, list] of this.items) {
      const model = this.models.get(name);
      for (const part of model.parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        const col = new THREE.Color();
        list.forEach((it, i) => { im.setMatrixAt(i, it.m); if (it.color) { col.set(it.color); im.setColorAt(i, col); } });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = cast; im.receiveShadow = receive; im.frustumCulled = false;
        g.add(im);
      }
    }
    return g;
  }
}

const TREES = ['kenney/tree_pineTallA', 'kenney/tree_pineTallB', 'kenney/tree_pineTallC', 'kenney/tree_pineTallD', 'kenney/tree_pineDefaultA', 'kenney/tree_pineRoundA',
  'kenney/tree_default', 'kenney/tree_oak', 'kenney/tree_thin', 'kenney/tree_tall', 'kenney/tree_simple', 'kenney/tree_fat', 'kenney/tree_oak_fall', 'kenney/tree_default_dark', 'kenney/tree_thin_fall'];
const BUSHES = ['kenney/plant_bush', 'kenney/plant_bushLarge', 'kenney/plant_bushSmall', 'kenney/plant_bushDetailed', 'kenney/plant_bushLargeTriangle'];
const ROCKS = ['kenney/rock_smallA', 'kenney/rock_smallB', 'kenney/rock_smallC', 'kenney/rock_smallD', 'kenney/rock_smallFlatA', 'kenney/rock_smallFlatB', 'kenney/rock_largeA', 'kenney/rock_largeB', 'kenney/rock_largeC', 'kenney/rock_tallD', 'kenney/stone_largeA'];
const BIG_ROCKS = ['kenney/rock_largeD', 'kenney/rock_largeE', 'kenney/rock_tallA', 'kenney/rock_tallC', 'kenney/stone_tallA'];
const LOGS = ['kenney/log', 'kenney/log_large', 'kenney/log_stack', 'kenney/stump_old', 'kenney/stump_round', 'kenney/stump_square', 'kenney/stump_oldTall'];
const FENCES = ['kenney/fence_simple', 'kenney/fence_planks', 'kenney/fence_simple', 'kenney/fence_simpleLow'];
const FLOWERS = ['kenney/flower_redA', 'kenney/flower_redB', 'kenney/flower_redC', 'kenney/flower_redA', 'kenney/flower_yellowA', 'kenney/flower_purpleA'];
const PH = ['wooden_ladder_02', 'wooden_bucket_01', 'picke_dirty_01', 'wooden_axe_02', 'crowbar_01', 'cross_pein_hammer', 'oil_tin', 'can_rusted', 'russian_food_cans_01', 'medical_box', 'old_tyre',
  'stone_fire_pit', 'painted_wooden_chair_01', 'painted_wooden_shelves', 'painted_wooden_stool', 'jug_01', 'barrel_03', 'wooden_crate_02', 'old_military_crate', 'ammo_box', 'metal_jerrycan_green'];
export const MODEL_NAMES = [...TREES, ...BUSHES, ...ROCKS, ...BIG_ROCKS, ...LOGS, ...FENCES, ...FLOWERS, 'kenney/mushroom_redGroup', 'kenney/mushroom_tanGroup', 'kenney/campfire_logs', ...PH];

// Kenney 의 파스텔을 전장의 어두운 올리브·갈색으로 끌어내리는 곱셈 색(잎·덤불·나무에 쓴다)
const LEAF = [0x6f8a4a, 0x7a8f4c, 0x62804a, 0x8a8648];
const WOOD = 0x8a7a66;

function freeSpot(w, x, z, nearR, trenchR, allowRoad = false) {
  const y = w.heightAt(x, z);
  if (y < -0.4 || w.nearPoint(x, z, POINT_R + nearR)) return false;
  if (!allowRoad && w.roadMask(x, z) > 0.2) return false;
  if (w.insideBox(x, y + 0.3, z)) return false;
  return !TRENCH_X.some((tx) => Math.abs(x - w.trenchCenter(tx, z)) < trenchR);
}

// 모든 CC0 장식의 위치를 정해 배치 목록에 넣는다.
export function scatter(world, batch) {
  const w = world, rng = new RNG(w.seed * 13 + 5);
  const gy = (x, z) => w.heightAt(x, z);
  // 맵 가장자리의 나무
  for (let n = 0, tries = 0; n < 44 && tries < 900; tries++) {
    const x = rng.range(-215, 215), z = rng.range(-135, 135);
    if (Math.abs(x) < HALF_X - 8 && Math.abs(z) < HALF_Z - 8) continue;
    batch.add(rng.pick(TREES), x, gy(x, z) - 0.12, z, rng.next() * 6.283, rng.range(6.5, 11.5), true, rng.pick(LEAF));
    n++;
  }
  // 덤불
  for (let n = 0, tries = 0; n < 50 && tries < 900; tries++) {
    const x = rng.range(-190, 190), z = rng.range(-105, 105);
    if (!freeSpot(w, x, z, 3, 5)) continue;
    const nm = rng.pick(BUSHES), col = rng.pick(LEAF);
    for (let k = rng.int(1, 3); k > 0; k--) { const px = x + rng.range(-0.9, 0.9), pz = z + rng.range(-0.9, 0.9); batch.add(nm, px, gy(px, pz) - 0.03, pz, rng.next() * 6.283, rng.range(0.7, 1.25), true, col); }
    n++;
  }
  // 바위
  for (let n = 0, tries = 0; n < 70 && tries < 1500; tries++) {
    const x = rng.range(-195, 195), z = rng.range(-110, 110);
    if (!freeSpot(w, x, z, 2, 4.5)) continue;
    const big = rng.next() < 0.16, cnt = big ? 1 : rng.int(1, 3);
    for (let k = 0; k < cnt; k++) {
      const px = x + (k ? rng.range(-0.9, 0.9) : 0), pz = z + (k ? rng.range(-0.9, 0.9) : 0);
      batch.add(rng.pick(big ? BIG_ROCKS : ROCKS), px, gy(px, pz) - 0.06, pz, rng.next() * 6.283, big ? rng.range(1.8, 3.4) : rng.range(0.55, 1.3), false, 0xb4aca0);
    }
    n++;
  }
  // 통나무와 그루터기
  for (let n = 0, tries = 0; n < 14 && tries < 500; tries++) {
    const x = rng.range(-190, 190), z = rng.range(-105, 105);
    if (!freeSpot(w, x, z, 3, 4.5)) continue;
    const nm = rng.pick(LOGS), stump = nm.includes('stump');
    batch.add(nm, x, gy(x, z) - 0.03, z, rng.next() * 6.283, stump ? rng.range(0.5, 0.95) : rng.range(1.6, 3.2), stump, WOOD);
    n++;
  }
  // 양귀비 무더기와 버섯
  for (let n = 0, tries = 0; n < 6 && tries < 400; tries++) {
    const x = rng.range(-185, 185), z = rng.range(-100, 100);
    if (!freeSpot(w, x, z, 3, 4.5)) continue;
    for (let k = rng.int(4, 6); k > 0; k--) { const px = x + rng.range(-1.7, 1.7), pz = z + rng.range(-1.7, 1.7); batch.add(rng.pick(FLOWERS), px, gy(px, pz) - 0.02, pz, rng.next() * 6.283, rng.range(0.32, 0.5)); }
    n++;
  }
  for (let n = 0, tries = 0; n < 5 && tries < 300; tries++) {
    const x = rng.range(-185, 185), z = rng.range(-100, 100);
    if (!freeSpot(w, x, z, 3, 4.5)) continue;
    batch.add(rng.next() < 0.5 ? 'kenney/mushroom_redGroup' : 'kenney/mushroom_tanGroup', x, gy(x, z) - 0.02, z, rng.next() * 6.283, rng.range(0.28, 0.45));
    n++;
  }
  // 길가 나무 울타리
  for (let st = 0, tries = 0; st < 4 && tries < 80; tries++) {
    const x0 = rng.range(-165, 150), side = rng.next() < 0.5 ? -1 : 1, segs = rng.int(5, 8);
    let placed = 0;
    for (let s = 0; s < segs; s++) {
      const x = x0 + s * 2.4, z = w.roadZ(x) + side * 3.8;
      if (!freeSpot(w, x, z, 3, 5, true)) continue;
      const dz = w.roadZ(x + 1.2) - w.roadZ(x - 1.2);
      batch.add(rng.pick(FENCES), x, gy(x, z) - 0.02, z, -Math.atan2(dz, 2.4), 2.4, false, 0xb89e80);
      placed++;
    }
    if (placed >= 3) st++;
  }
  // 천막 옆 모닥불 자리와 보급품
  let camps = 0;
  for (const b of w.boxes) {
    if (b.kind !== 6) continue;
    const cx = (b.mn[0] + b.mx[0]) / 2, cz = (b.mn[2] + b.mx[2]) / 2;
    if (camps < 5) {
      const a = rng.next() * 6.283, r = (b.mx[0] - b.mn[0]) / 2 + 2.6, fx = cx + Math.cos(a) * r, fz = cz + Math.sin(a) * r, fy = gy(fx, fz);
      if (fy > -0.3 && !w.insideBox(fx, fy + 0.3, fz)) {
        batch.add('stone_fire_pit', fx, fy - 0.02, fz, rng.next() * 6.283, 1.15, false);
        batch.add('kenney/campfire_logs', fx, fy + 0.05, fz, rng.next() * 6.283, 0.65, false, WOOD);
        const ang = a + Math.PI * 0.8, sx = fx + Math.cos(ang) * 1.6, sz = fz + Math.sin(ang) * 1.6;
        if (!w.insideBox(sx, gy(sx, sz) + 0.3, sz)) batch.add('painted_wooden_stool', sx, gy(sx, sz), sz, Math.atan2(fx - sx, fz - sz), 0.5);
        camps++;
      }
    }
    for (let q = 0; q < 2; q++) {
      const a = rng.next() * 6.283, off = (b.mx[0] - b.mn[0]) / 2 + 0.9, px = cx + Math.cos(a) * off, pz = cz + Math.sin(a) * off;
      if (q === 0) batch.add('ammo_box', px, gy(px, pz), pz, rng.next() * 6.283, 0.35, true);
      else batch.add('metal_jerrycan_green', px, gy(px, pz), pz, rng.next() * 6.283, 0.55);
    }
  }
  // 참호 바닥과 가장자리의 잡동사니
  for (const tx of TRENCH_X) {
    for (let z = -80; z < 80;) {
      z += rng.range(16, 30);
      const cx = w.trenchCenter(tx, z);
      if (w.nearPoint(cx, z, POINT_R + 4) || rng.next() < 0.35) continue;
      const side = rng.next() < 0.5 ? -1 : 1, px = cx + side * rng.range(0.5, 1.3), py = gy(px, z), yaw = rng.next() * 6.283, roll = rng.next(), LAY = Math.PI / 2;
      if (roll < 0.08) { const lx = cx + side * 1.9; batch.add('wooden_ladder_02', lx, gy(lx, z) - 0.04, z, yaw, 1.5); }
      else if (roll < 0.16) batch.add('wooden_bucket_01', px, py, z, yaw, 0.34);
      else if (roll < 0.26) batch.add('picke_dirty_01', px, py + 0.02, z, yaw, 1.1, false, null, LAY);
      else if (roll < 0.42) batch.add('wooden_axe_02', px, py + 0.02, z, yaw, 0.6, false, null, LAY);
      else if (roll < 0.58) batch.add(rng.next() < 0.6 ? 'crowbar_01' : 'cross_pein_hammer', px, py + 0.02, z, yaw, 0.5, false, null, LAY);
      else if (roll < 0.84) { const pk = rng.next(); batch.add(pk < 0.4 ? 'oil_tin' : pk < 0.7 ? 'can_rusted' : 'russian_food_cans_01', px, py, z, yaw, pk < 0.4 ? 0.22 : pk < 0.7 ? 0.15 : 0.1); }
      else if (roll < 0.91) batch.add('medical_box', px, py, z, yaw, 0.5, false);
      else batch.add('old_tyre', px, py, z, yaw, 0.17, true, null, LAY);
    }
  }
  // 집 안: 탁자 위 항아리, 의자, 벽 선반
  for (const h of w.houses) {
    const gyy = h.gy + 0.08;
    batch.add('jug_01', h.cx - 1.0, gyy + 0.75, h.cz + 0.55, rng.next() * 6.283, 0.24);
    batch.add('painted_wooden_chair_01', h.cx - 1.2, gyy, h.cz + 1.45, Math.PI, 0.92);
    const sx = rng.next() < 0.5 ? 1 : -1, shx = h.cx + sx * (h.hw - 0.9), shz = h.cz - h.hd + 0.8;
    batch.add('painted_wooden_shelves', shx, gyy, shz, Math.atan2(h.cx - shx, h.cz - shz), 1.1);
  }
  // 상자·통(충돌 상자 위에 모델을 입힌다)
  for (const b of w.boxes) {
    const sx = b.mx[0] - b.mn[0], sz = b.mx[2] - b.mn[2], cx = (b.mn[0] + b.mx[0]) / 2, cz = (b.mn[2] + b.mx[2]) / 2, base = b.mn[1] + 0.25, h = b.mx[1] - base;
    if (b.kind === 5) batch.add('barrel_03', cx, base, cz, rng.next() * 6.283, h, true, 0x8f8a82);
    else if (b.kind === 2) {
      const big = Math.max(sx, sz) > 1.45, nm = big ? 'old_military_crate' : 'wooden_crate_02', m = batch.models.get(nm);
      if (!m) continue;
      const k = Math.max(sx, sz) / Math.max(m.size.x, m.size.z), layer = m.size.y * k, n = Math.max(1, Math.round(h / layer));
      for (let i = 0; i < n; i++) batch.add(nm, cx, base + layer * i, cz, rng.range(-0.12, 0.12) + (sx < sz ? Math.PI / 2 : 0) + (i % 2 ? rng.range(-0.2, 0.2) : 0), Math.max(sx, sz), false);
    }
  }
}
