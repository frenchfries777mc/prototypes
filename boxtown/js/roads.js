// 마을 밖 길. 점 몇 개로 그린 선을 매끄럽게 이어 띠 모양 도로를 만들고, 지형을 길 높이에 맞춰 다진다.
// 물 위를 지나는 구간은 다리가 된다(상판, 난간, 교각, 충돌 상자).
import { ROADS } from './world.js';
import { baseHeight, setRoadMod, SEA } from './terrain.js';
import { clamp, lerp, smoothstep, flatMat } from './util.js';
const B = window.BABYLON;

const STEP = 4;
const HALF = { road: 4.2, dirt: 2.6 };

// 점들을 지나는 매끄러운 곡선(Catmull-Rom)을 STEP 간격으로 다시 찍는다.
function resample(pts) {
  const out = [];
  const P = (i) => pts[clamp(i, 0, pts.length - 1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = pts[pts.length - 1];
  out.push({ x: last[0], z: last[1] });
  return out;
}

const GRADE = { road: 0.13, dirt: 0.19 }; // 길이 가질 수 있는 가장 가파른 기울기
export const paths = [];
for (const r of ROADS) {
  const pts = resample(r.pts);
  let dist = 0;
  pts.forEach((p, i) => {
    if (i) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    p.s = dist;
    const raw = baseHeight(p.x, p.z);
    p.water = raw < SEA + 0.9;
    p.raw = p.water ? SEA + 6.2 : Math.max(raw, SEA + 2.4); // 물 위는 다리 높이
  });
  // 기울기 제한: 지형이 길보다 가파르게 솟는 곳은 땅을 깎아 길을 낸다(길은 지형보다 높아지지 않는다).
  const G = GRADE[r.type];
  pts.forEach((p) => { let y = 1e9; for (const q of pts) y = Math.min(y, q.raw + G * Math.abs(p.s - q.s)); p.y = y; });
  for (let pass = 0; pass < 3; pass++) {
    const ys = pts.map((p) => p.y);
    pts.forEach((p, i) => { let sum = 0; for (let k = -4; k <= 4; k++) sum += ys[clamp(i + k, 0, pts.length - 1)]; p.y = sum / 9; });
  }
  // 끝이 다른 길이나 마을 도로와 만나면 그 높이에 맞춘다.
  const joinY = (p) => {
    let best = null, bd = 9;
    for (const other of paths) other.pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = { pts: other.pts, i }; } });
    if (!best) return null;
    // 만나는 길이 비탈이면 점 사이를 보간해서 정확한 높이를 얻는다.
    const q = best.pts[best.i];
    let y = q.y, dmin = bd;
    for (const o of [best.pts[best.i - 1], best.pts[best.i + 1]]) {
      if (!o) continue;
      const vx = o.x - q.x, vz = o.z - q.z, t = clamp(((p.x - q.x) * vx + (p.z - q.z) * vz) / (vx * vx + vz * vz), 0, 1);
      const d = Math.hypot(p.x - q.x - vx * t, p.z - q.z - vz * t);
      if (d < dmin) { dmin = d; y = lerp(q.y, o.y, t); }
    }
    return y;
  };
  const y0 = r.pin !== undefined ? r.pin : joinY(pts[0]), y1 = joinY(pts[pts.length - 1]);
  pts.forEach((p) => {
    // 만나는 곳의 높이를 같게 맞춘다(갈림길에 턱이 생기지 않게).
    if (y0 !== null) p.y = lerp(y0, p.y, smoothstep(5, 66, p.s));
    if (y1 !== null) p.y = lerp(y1, p.y, smoothstep(5, 66, dist - p.s));
    if (p.water) p.y = Math.max(p.y, SEA + 3.2);
  });
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.tx = (b.x - a.x) / l; p.tz = (b.z - a.z) / l;
  });
  paths.push({ type: r.type, half: HALF[r.type], pts });
}

// 가까운 길 점을 빨리 찾기 위한 칸 나누기
const CELL = 24, hash = new Map();
const key = (x, z) => Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663;
for (const path of paths) for (const p of path.pts) {
  p.half = path.half;
  const k = key(p.x, p.z);
  if (!hash.has(k)) hash.set(k, []);
  hash.get(k).push(p);
}
for (const path of paths) path.pts.forEach((p, i) => { p.prev = path.pts[i - 1] || null; p.next = path.pts[i + 1] || null; });
// 가장 가까운 길 위의 점: 거리 d, 그 지점의 길 높이 y, 다리 구간인지 water.
const near = { d: 1e9, y: 0, half: 0, water: false, hit: false };
function nearest(x, z) {
  let best = null, bd = 1e9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = hash.get(key(x + i * CELL, z + j * CELL));
    if (!list) continue;
    for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  }
  near.hit = !!best; near.d = bd;
  if (!best) return near;
  near.y = best.y; near.half = best.half; near.water = best.water;
  // 점과 점 사이는 선분 위로 내려 보간한다(비탈길에서 높이가 계단지지 않게).
  for (const q of [best.prev, best.next]) {
    if (!q) continue;
    const vx = q.x - best.x, vz = q.z - best.z, t = clamp(((x - best.x) * vx + (z - best.z) * vz) / (vx * vx + vz * vz), 0, 1);
    const d = Math.hypot(x - best.x - vx * t, z - best.z - vz * t);
    if (d < near.d) { near.d = d; near.y = lerp(best.y, q.y, t); near.water = best.water && q.water; }
  }
  return near;
}
// 길 한가운데까지의 거리(길이 없으면 큰 값)
export function roadDist(x, z) { return nearest(x, z).d; }

// 지형을 길에 맞춰 다진다. 길 가장자리에서 6m까지는 평평하게(지형 격자가 4m라서 그보다 좁으면 흙이 길 위로 삐져나온다).
// 다리 구간은 건드리지 않는다(아래는 물길 그대로).
setRoadMod((x, z, h) => {
  const n = nearest(x, z);
  if (!n.hit || n.water) return h;
  const flat = n.half + 6;
  return lerp(h, n.y - 0.05, 1 - smoothstep(flat, flat + 16, n.d));
});

// h: { scene, addBox, casters }
export function buildRoads(h) {
  const { scene } = h;
  const mat = new B.StandardMaterial('roadMat', scene);
  mat.specularColor = B.Color3.Black();
  mat.ambientColor = new B.Color3(1, 1, 1);
  mat.zOffset = -4; // 지형과 겹쳐 깜빡이지 않도록 살짝 앞에 그린다
  mat.backFaceCulling = false;
  const deckMat = flatMat('bridgeDeck', '#aab0c2', scene);
  const railMat = flatMat('bridgeRail', '#e8e4dc', scene);
  const pierMat = flatMat('bridgePier', '#8f95a8', scene);
  const pos = [], col = [], idx = [], nor = [];
  const ASPH = [0.34, 0.35, 0.41], EDGE = [0.74, 0.76, 0.83], DIRT = [0.72, 0.6, 0.42], DIRT2 = [0.62, 0.52, 0.36], LINE = [0.93, 0.93, 0.9];
  const quad = (a, b, c, d, color) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(p[0], p[1], p[2]); nor.push(0, 1, 0); col.push(color[0], color[1], color[2], 1); }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  const boxes = [];
  for (const path of paths) {
    const road = path.type === 'road', hw = path.half;
    const across = (p, o, lift) => [p.x - p.tz * o, p.y + lift, p.z + p.tx * o];
    for (let i = 0; i < path.pts.length - 1; i++) {
      const a = path.pts[i], b = path.pts[i + 1];
      const lift = 0.1;
      if (road) {
        quad(across(a, -hw, lift), across(b, -hw, lift), across(a, -hw + 0.55, lift), across(b, -hw + 0.55, lift), EDGE);
        quad(across(a, -hw + 0.55, lift), across(b, -hw + 0.55, lift), across(a, hw - 0.55, lift), across(b, hw - 0.55, lift), ASPH);
        quad(across(a, hw - 0.55, lift), across(b, hw - 0.55, lift), across(a, hw, lift), across(b, hw, lift), EDGE);
        if (i % 3 === 0) quad(across(a, -0.16, lift + 0.03), across(b, -0.16, lift + 0.03), across(a, 0.16, lift + 0.03), across(b, 0.16, lift + 0.03), LINE);
      } else {
        quad(across(a, -hw, lift), across(b, -hw, lift), across(a, hw, lift), across(b, hw, lift), i % 2 ? DIRT : DIRT2);
      }
      // 다리 구간(양 끝 한 칸씩 더 덮어서 둑과 이어지게 한다)
      const span = a.water || b.water || (path.pts[i + 2] && path.pts[i + 2].water) || (i > 0 && path.pts[i - 1].water);
      if (span) {
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
        const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.3, yaw = Math.atan2(b.x - a.x, b.z - a.z);
        boxes.push({ w: hw * 2 + 1.6, h: 0.9, d: len, x: mx, y: my - 0.42, z: mz, yaw, mat: deckMat, collide: true });
        for (const sd of [-1, 1]) {
          const rx = mx - ((a.tz + b.tz) / 2) * sd * (hw + 0.55), rz = mz + ((a.tx + b.tx) / 2) * sd * (hw + 0.55);
          boxes.push({ w: 0.4, h: 1.2, d: len, x: rx, y: my + 0.6, z: rz, yaw, mat: railMat, collide: true });
        }
        if (i % 5 === 0 && (a.water && b.water)) {
          const depth = my - (SEA - 7);
          boxes.push({ w: hw * 2 - 1, h: depth, d: 1.6, x: mx, y: my - 0.8 - depth / 2, z: mz, yaw, mat: pierMat });
          boxes.push({ w: hw * 2 + 2.6, h: 0.7, d: 2.2, x: mx, y: my - 1.1, z: mz, yaw, mat: pierMat });
        }
      }
    }
  }
  const mesh = new B.Mesh('roads', scene);
  const vd = new B.VertexData();
  vd.positions = pos; vd.normals = nor; vd.colors = col; vd.indices = idx;
  vd.applyToMesh(mesh);
  mesh.material = mat; mesh.useVertexColors = true; mesh.receiveShadows = true; mesh.isPickable = false; mesh.freezeWorldMatrix();
  // 다리 부품은 재질별로 하나의 메시로 합친다.
  const byMat = new Map();
  for (const b of boxes) {
    const m = B.MeshBuilder.CreateBox('bridgePart', { width: b.w, height: b.h, depth: b.d }, scene);
    m.position.set(b.x, b.y, b.z); m.rotation.y = b.yaw;
    if (b.collide) h.addBox(b.x, b.y, b.z, b.w, b.h, b.d, b.yaw);
    if (!byMat.has(b.mat)) byMat.set(b.mat, []);
    byMat.get(b.mat).push(m);
  }
  for (const [m, list] of byMat) {
    const merged = B.Mesh.MergeMeshes(list, true, true);
    merged.material = m; merged.receiveShadows = true; merged.isPickable = false; merged.freezeWorldMatrix();
    h.casters.push(merged);
  }
  return mesh;
}
