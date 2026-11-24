// 마을 밖 길. 점 몇 개로 그린 선을 매끄럽게 이어 띠 모양 도로를 만들고, 지형을 길 높이에 맞춰 다진다.
// 물 위를 지나는 구간은 다리가 된다(상판, 난간, 교각, 충돌 상자).
import { ROADS, JUNCTIONS, STATIONS, SITES } from './world.js';
import { baseHeight, setRoadMod, SEA } from './terrain.js';
import { clamp, lerp, smoothstep, flatMat } from './util.js';
const B = window.BABYLON;

const STEP = 4;
const HALF = { road: 6.6, dirt: 2.6, rail: 2.6 }; // 포장도로는 4차선
const TOWN_HALF = 4.2; // 마을 도로 타일의 아스팔트 반폭

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

// 길 끝이 시가지 길 끝과 맞닿는 곳: 꺾여서 만나면 두 띠의 끝이 어긋나 틈과 턱이 생긴다.
// 시가지 길이 뻗는 방향으로 16m 나간 점을 하나 끼워, 곧게 이어진 다음에 휘도록 한다.
for (const r of ROADS) {
  if (r.city || r.type === 'rail') continue;
  for (const atEnd of [false, true]) {
    const e = r.pts[atEnd ? r.pts.length - 1 : 0];
    for (const o of ROADS) {
      if (!o.city) continue;
      for (const oEnd of [false, true]) {
        const q = o.pts[oEnd ? o.pts.length - 1 : 0], n = o.pts[oEnd ? o.pts.length - 2 : 1];
        if (Math.hypot(q[0] - e[0], q[1] - e[1]) > 3) continue;
        const l = Math.hypot(q[0] - n[0], q[1] - n[1]) || 1, c = [q[0] + ((q[0] - n[0]) / l) * 16, q[1] + ((q[1] - n[1]) / l) * 16];
        // 원래 있던 가까운 점은 치운다(끼운 점과 뒤엉켜 길이 꼬이지 않게).
        const near = r.pts[atEnd ? r.pts.length - 2 : 1];
        if (r.pts.length > 3 && Math.hypot(near[0] - c[0], near[1] - c[1]) < 26) r.pts.splice(atEnd ? r.pts.length - 2 : 1, 1);
        r.pts.splice(atEnd ? r.pts.length - 1 : 1, 0, c);
      }
    }
  }
}

const GRADE = { road: 0.13, dirt: 0.19, rail: 0.06 }; // 길이 가질 수 있는 가장 가파른 기울기
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
  const pinY = r.pinSite ? SITES[r.pinSite].y : r.pin;
  const y0 = pinY !== undefined ? pinY : joinY(pts[0]), y1 = joinY(pts[pts.length - 1]);
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
  paths.push({ type: r.type, half: HALF[r.type], pts, city: r.city, ns: !!r.ns, pin: r.pin !== undefined, noTraffic: !!r.noTraffic });
}

// 끝과 끝이 맞닿은 길은 맞닿는 단면의 방향을 똑같이 맞춘다(띠의 끝 모서리가 정확히 겹치게).
for (const A of paths) for (const B2 of paths) {
  if (A === B2 || A.type === 'rail' || B2.type === 'rail' || !B2.city || A.city) continue;
  for (const e of [A.pts[0], A.pts[A.pts.length - 1]]) for (const q of [B2.pts[0], B2.pts[B2.pts.length - 1]]) {
    if (Math.hypot(e.x - q.x, e.z - q.z) > 3) continue;
    const sgn = Math.sign(e.tx * q.tx + e.tz * q.tz) || 1;
    e.x = q.x; e.z = q.z; e.tx = q.tx * sgn; e.tz = q.tz * sgn;
  }
}

// 길과 길이 겹치는 곳(교차로, 합류)은 높이를 하나로 맞춘다. 따로 다듬은 길들이 서로 다른 높이로 겹치면 턱과 벽이 생긴다.
// 철길은 도로를 따라가고, 도로끼리는 평균으로 만난다. 차이는 앞뒤 구간으로 퍼뜨려 서서히 이어지게 한다.
(function reconcile() {
  const ok = (p) => !p.water;
  for (let it = 0; it < 24; it++) {
    const cellMap = new Map(), ck = (x, z) => Math.floor(x / 16) * 73856093 ^ Math.floor(z / 16) * 19349663;
    paths.forEach((P, pi) => P.pts.forEach((p) => { const k = ck(p.x, p.z); if (!cellMap.has(k)) cellMap.set(k, []); cellMap.get(k).push([pi, p]); }));
    const deltas = paths.map((P) => new Float32Array(P.pts.length));
    let worst = 0;
    paths.forEach((P, pi) => P.pts.forEach((p, i) => {
      if (!ok(p)) return;
      const best = new Map();
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = cellMap.get(ck(p.x + a * 16, p.z + b * 16)); if (!list) continue;
        for (const [qi, q] of list) {
          if (qi === pi) continue;
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d < P.half + paths[qi].half + 1.5 && (!best.has(qi) || d < best.get(qi).d)) best.set(qi, { d, q });
        }
      }
      if (!best.size) return;
      let sum = p.y, n = 1;
      for (const [qi, { q }] of best) {
        const Q = paths[qi];
        if (P.type === 'rail' && Q.type !== 'rail') { sum = q.y * 1000; n = 1000; break; } // 철길은 도로 높이를 따른다
        if (Q.type === 'rail' && P.type !== 'rail') continue; // 도로는 철길을 따르지 않는다
        sum += q.y; n++;
      }
      let t = sum / n - p.y;
      // 마을 타일에 닿은 끝은 움직이지 않는다
      if (P.pin) t *= smoothstep(10, 50, p.s);
      deltas[pi][i] = t; worst = Math.max(worst, Math.abs(t));
    }));
    paths.forEach((P, pi) => {
      const RAD = P.type === 'rail' ? 26 : 14, d = deltas[pi], L = P.pts.length, ny = new Float32Array(L);
      for (let i = 0; i < L; i++) {
        let acc = 0;
        for (let k = -RAD; k <= RAD; k++) { const j = i + k; if (j < 0 || j >= L) continue; const w = 1 - Math.abs(k) / (RAD + 1); acc = Math.abs(d[j] * w) > Math.abs(acc) ? d[j] * w : acc; }
        ny[i] = P.pts[i].y + acc * (P.type === 'rail' ? 1 : 0.7);
      }
      P.pts.forEach((p, i) => { p.y = P.pts[i].water ? Math.max(ny[i], SEA + 3.2) : ny[i]; });
    });
    if (worst < 0.03) break;
  }
})();

// 갈림길: 길이 다른 도로 몸통에 와서 닿는 곳은 양쪽 모두 연석과 차선 표시를 빼고 아스팔트만 깐다(줄이 서로 가로지르지 않게).
for (const A of paths) {
  if (A.type !== 'road') continue;
  for (const e of [A.pts[0], A.pts[A.pts.length - 1]]) for (const B of paths) {
    if (B === A || B.type !== 'road') continue;
    let q = null, bd = 1e9;
    for (const p of B.pts) { const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < bd) { bd = d; q = p; } }
    if (!q || bd > B.half + 3 || (q === B.pts[0] || q === B.pts[B.pts.length - 1])) continue;
    for (const p of B.pts) if (Math.hypot(p.x - q.x, p.z - q.z) < 17) p.jn = true;
    for (const p of A.pts) if (Math.hypot(p.x - e.x, p.z - e.z) < 17) p.jn = true;
  }
}

// 역 자리: 승강장 길이만큼 선로를 수평으로 만들고, 승강장이 놓일 땅도 그 높이로 다진다(비탈에서 승강장이 허공에 뜨지 않게).
export const STATION_PADS = [];
{
  const rail = paths.find((p) => p.type === 'rail');
  if (rail) {
    const len = rail.pts[rail.pts.length - 1].s;
    for (const [f, name] of STATIONS) {
      const s0 = f * len;
      let c = rail.pts[0]; for (const p of rail.pts) if (Math.abs(p.s - s0) < Math.abs(c.s - s0)) c = p;
      let sum = 0, n = 0; for (const p of rail.pts) if (Math.abs(p.s - s0) < 20 && !p.water) { sum += p.y; n++; }
      const y = n ? sum / n : c.y;
      for (const p of rail.pts) if (!p.water) p.y = lerp(y, p.y, smoothstep(22, 70, Math.abs(p.s - s0)));
      STATION_PADS.push({ name, s: s0, y, x: c.x - c.tz * 5, z: c.z + c.tx * 5, r: 23 });
    }
  }
}
// 건널목: 철길이 도로를 가로지르는 곳. 도로 쪽은 차선 표시를 빼고, 철길 쪽은 자갈과 침목 없이 레일만 아스팔트에 박는다.
export const CROSSINGS = [];
{
  const rail = paths.find((p) => p.type === 'rail');
  if (rail) for (const P of paths) {
    if (P.type === 'rail') continue;
    let best = null, bd = 3.2, bq = null;
    for (const p of P.pts) for (const q of rail.pts) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < bd) { bd = d; best = p; bq = q; } }
    if (!best) continue;
    CROSSINGS.push({ x: best.x, z: best.z, y: best.y, tx: best.tx, tz: best.tz, half: P.half, s: bq.s, road: P.type === 'road' });
    for (const p of P.pts) if (Math.hypot(p.x - best.x, p.z - best.z) < 9) p.jn = true;
    for (const q of rail.pts) { const d = Math.hypot(q.x - best.x, q.z - best.z); if (d < P.half + 9) { q.xing = d < P.half + 2.5; q.y = best.y; } else if (d < P.half + 70 && !q.water) q.y = lerp(best.y, q.y, smoothstep(P.half + 9, P.half + 70, d)); }
  }
}

// 흙길이 포장도로에서 갈라져 나오는지(같은 너비에서 시작해 좁아진다)
const touches = (path, e) => path.type === 'dirt' && paths.some((o) => o !== path && o.type === 'road' && o.pts.some((q) => Math.hypot(q.x - e.x, q.z - e.z) < 9));
for (const path of paths) { path.len = path.pts[path.pts.length - 1].s; path.joined = touches(path, path.pts[0]); path.joinedEnd = touches(path, path.pts[path.pts.length - 1]); }
// 갈라지는 끝에서 잰 거리(끝이 도로에 닿지 않으면 큰 값)
const joinS = (path, p) => Math.min(path.joined ? p.s : 1e9, path.joinedEnd ? path.len - p.s : 1e9);
// 길의 반폭: 마을 타일과 만나는 곳은 타일 너비에서 시작해 서서히 넓어진다.
export function halfAt(path, p) {
  if (path.type === 'road' && path.pin) return lerp(TOWN_HALF, path.half, smoothstep(6, 56, p.s));
  if (path.joined || path.joinedEnd) return lerp(HALF.road, path.half, smoothstep(0, Math.min(40, path.len * 0.45), joinS(path, p)));
  return path.half;
}
// 시가지 길 위의 점에서 가장 가까운 네거리까지의 거리
function jdist(path, p) { let d = 1e9; if (path.city) for (const j of JUNCTIONS) if (j.city === path.city) d = Math.min(d, Math.hypot(j.x - p.x, j.z - p.z)); return d; }

// 가까운 길 점을 빨리 찾기 위한 칸 나누기
const CELL = 24, hash = new Map();
const key = (x, z) => Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663;
for (const path of paths) for (const p of path.pts) {
  p.half = halfAt(path, p);
  const k = key(p.x, p.z);
  if (!hash.has(k)) hash.set(k, []);
  hash.get(k).push(p);
}
for (const path of paths) path.pts.forEach((p, i) => { p.prev = path.pts[i - 1] || null; p.next = path.pts[i + 1] || null; });
// 가장 가까운 길 위의 점: 거리 d, 그 지점의 길 높이 y, 다리 구간인지 water.
const near = { d: 1e9, y: 0, half: 0, water: false, hit: false };
function nearest(x, z) {
  let best = null, bd = 1e9;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { // 48m 안은 빠짐없이 찾는다(다짐 폭보다 넓게)
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
  // 역 터를 먼저 다지고, 그 위에 길을 낸다(역 옆으로 내려가는 선로가 땅에 묻히지 않게).
  for (const s of STATION_PADS) { const d = Math.hypot(x - s.x, z - s.z); if (d < s.r + 26) h = lerp(h, s.y - 0.05, 1 - smoothstep(s.r, s.r + 26, d)); }
  const flat = n.half + 6;
  return lerp(h, n.y + 0.055, 1 - smoothstep(flat, flat + 30, n.d)); // 아스팔트 윗면(+0.1) 바로 밑: 발이 묻히지 않고, 땅이 길 위로 삐져나오지도 않는다 // 길 옆 비탈은 30m에 걸쳐 완만하게 이어진다
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
  const ASPH = [0.34, 0.35, 0.41], EDGE = [0.74, 0.76, 0.83], DIRT = [0.72, 0.6, 0.42], DIRT2 = [0.62, 0.52, 0.36], LINE = [0.93, 0.93, 0.9], YELLOW = [0.96, 0.78, 0.2];
  const quad = (a, b, c, d, color) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(p[0], p[1], p[2]); nor.push(0, 1, 0); col.push(color[0], color[1], color[2], 1); }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  const boxes = [];
  const BALLAST = [0.52, 0.48, 0.44], BALLAST2 = [0.44, 0.4, 0.37], BALLAST3 = [0.4, 0.37, 0.34], SLEEPER = [0.4, 0.28, 0.19], SLEEPER2 = [0.27, 0.18, 0.12], STEEL = [0.78, 0.8, 0.86], STEEL2 = [0.45, 0.47, 0.54];
  for (const path of paths) {
    if (path.type === 'rail') {
      // 철길: 자갈 바닥, 침목, 레일 두 줄
      const at = (p, o, lift, along = 0) => [p.x - p.tz * o + p.tx * along, p.y + lift, p.z + p.tx * o + p.tz * along];
      for (let i = 0; i < path.pts.length - 1; i++) {
        const a = path.pts[i], b = path.pts[i + 1];
        // 입체 선로: 둑처럼 솟은 자갈 바닥, 그 위에 침목, 그 위에 레일. 건널목에서는 도로 높이로 내려가 레일만 남는다.
        const ka = a.xing ? 0 : 1, kb = b.xing ? 0 : 1;
        const A = (o, up, along = 0) => at(a, o, 0.1 + up * ka, along), Bq = (o, up) => at(b, o, 0.1 + up * kb);
        if (ka || kb) {
          quad(A(-1.9, 0.26), Bq(-1.9, 0.26), A(1.9, 0.26), Bq(1.9, 0.26), BALLAST);
          quad(A(-2.8, -0.08), Bq(-2.8, -0.08), A(-1.9, 0.26), Bq(-1.9, 0.26), BALLAST2);
          quad(A(1.9, 0.26), Bq(1.9, 0.26), A(2.8, -0.08), Bq(2.8, -0.08), BALLAST3);
        }
        if (ka) for (const k of [0.5, 2.5]) {
          quad(A(-1.45, 0.36, k), A(-1.45, 0.36, k + 0.5), A(1.45, 0.36, k), A(1.45, 0.36, k + 0.5), SLEEPER);
          quad(A(-1.45, 0.26, k), A(-1.45, 0.36, k), A(1.45, 0.26, k), A(1.45, 0.36, k), SLEEPER2);
          quad(A(-1.45, 0.36, k + 0.5), A(-1.45, 0.26, k + 0.5), A(1.45, 0.36, k + 0.5), A(1.45, 0.26, k + 0.5), SLEEPER2);
        }
        if (!ka && !kb) for (const o of [-0.85, 0.85]) quad(at(a, o - 0.22, 0.2), at(b, o - 0.22, 0.2), at(a, o + 0.22, 0.2), at(b, o + 0.22, 0.2), [0.24, 0.25, 0.3]);
        for (const o of [-0.85, 0.85]) {
          const ta = 0.16 + 0.36 * ka, tb = 0.16 + 0.36 * kb, ba = 0.36 * ka, bb = 0.36 * kb; // 레일 윗면과 아랫면 높이
          quad(at(a, o - 0.08, 0.1 + ta), at(b, o - 0.08, 0.1 + tb), at(a, o + 0.08, 0.1 + ta), at(b, o + 0.08, 0.1 + tb), STEEL);
          quad(at(a, o - 0.08, 0.1 + ba), at(b, o - 0.08, 0.1 + bb), at(a, o - 0.08, 0.1 + ta), at(b, o - 0.08, 0.1 + tb), STEEL2);
          quad(at(a, o + 0.08, 0.1 + ta), at(b, o + 0.08, 0.1 + tb), at(a, o + 0.08, 0.1 + ba), at(b, o + 0.08, 0.1 + bb), STEEL2);
        }
        if ((a.water || b.water) || (path.pts[i + 2] && path.pts[i + 2].water) || (i > 0 && path.pts[i - 1].water)) {
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2, len = Math.hypot(b.x - a.x, b.z - a.z) + 0.3, yaw = Math.atan2(b.x - a.x, b.z - a.z);
          boxes.push({ w: 6.4, h: 0.9, d: len, x: mx, y: my - 0.42, z: mz, yaw, mat: deckMat, collide: true });
        }
      }
      continue;
    }
    const road = path.type === 'road';
    const joined = path.joined;
    const across = (p, o, lift) => { const k = halfAt(path, p) / path.half; return [p.x - p.tz * o * k, p.y + lift, p.z + p.tx * o * k]; };
    const hw = path.half;
    for (let i = 0; i < path.pts.length - 1; i++) {
      const a = path.pts[i], b = path.pts[i + 1];
      const lift = 0.1;
      if (road) {
        // 4차선: 가장자리 턱, 아스팔트, 가운데 노란 두 줄, 차선 점선. 네거리 안은 표시 없이 아스팔트만, 그 앞은 횡단보도.
        const L = lift + (path.ns ? 0.035 : 0), jd = (a.jn || b.jn) ? 0 : Math.min(jdist(path, a), jdist(path, b));
        const Q = (o1, o2, up, c) => quad(across(a, o1, L + up), across(b, o1, L + up), across(a, o2, L + up), across(b, o2, L + up), c);
        if (jd < 9.4) Q(-hw, hw, 0, ASPH);
        else {
          Q(-hw, -hw + 0.55, 0, EDGE); Q(-hw + 0.55, hw - 0.55, 0, ASPH); Q(hw - 0.55, hw, 0, EDGE);
          if (jd < 13.6) for (let o = -5.2; o <= 5.21; o += 1.3) Q(o - 0.42, o + 0.42, 0.03, LINE);
          else { Q(-0.3, -0.14, 0.03, YELLOW); Q(0.14, 0.3, 0.03, YELLOW); if (i % 2 === 0 && !(path.pin && a.s < 52)) { Q(-3.12, -2.98, 0.03, LINE); Q(2.98, 3.12, 0.03, LINE); } }
        }
      } else {
        // 갈라지는 곳은 아스팔트 색에서 흙색으로 물든다.
        const tA = smoothstep(4, Math.min(30, path.len * 0.4), joinS(path, a)), base = i % 2 ? DIRT : DIRT2;
        quad(across(a, -hw, lift), across(b, -hw, lift), across(a, hw, lift), across(b, hw, lift), [lerp(ASPH[0], base[0], tA), lerp(ASPH[1], base[1], tA), lerp(ASPH[2], base[2], tA)]);
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
