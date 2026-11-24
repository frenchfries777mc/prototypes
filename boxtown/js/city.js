// 시가지 채우기: world.js의 CITY마다 길가에 건물을 정면이 길을 보게 세우고, 보도·가로등·가로수를 놓는다.
import { CITY, CITY_STEP } from './world.js';
import { height } from './terrain.js';
import { roadDist } from './roads.js';
import { rng, flatMat } from './util.js';

const C = (list) => list.split('').map((c) => 'commercial/building-' + c);
const SKY = 'abcde'.split('').map((c) => 'commercial/building-skyscraper-' + c);
const SUB = 'abcdefghijklmnopqrstu'.split('').map((c) => 'suburban/building-type-' + c);
const IND = 'abegmr'.split('').map((c) => 'industrial/building-' + c);
const POOL = {
  downtown: [...C('abcdefghijklmn'), ...SKY, ...SKY, ...C('lmn')],
  homes: [...SUB, ...SUB, ...C('ceh')],
  mixed: [...C('abcdehk'), ...IND, ...SUB.slice(0, 6)],
};
const HW = 6.6;

// h: { scene, assets, box, addBox, collideModel, bucket, houses }
export function buildCity(h) {
  const { assets, scene } = h, pave = flatMat('cityPave', '#c9cede', scene);
  const trees = ['nature/tree_blocks', 'nature/tree_fat', 'nature/tree_oak', 'nature/tree_blocks_fall'];
  for (const c of CITY) {
    h.bucket('city_' + c.id, c.x, c.z);
    const r = rng(c.x * 7 + c.z), pool = POOL[c.kind], placed = [], y0 = height(c.x, c.z);
    for (const o of c.offsets) for (const ns of [false, true]) {
      const half = c.half(o);
      // 길 위의 점(t)과 옆으로 벗어난 점
      const at = (t, side, off) => (ns ? [c.x + o + side * off, c.z + t] : [c.x + t, c.z + o + side * off]);
      for (const side of [-1, 1]) {
        // 보도: 네거리 사이 구간마다 한 줄
        const cuts = [-half, ...c.offsets.filter((q) => Math.abs(q) < half - 12), half];
        for (let i = 0; i < cuts.length - 1; i++) {
          const a = cuts[i] + (i === 0 ? 0 : 9), b = cuts[i + 1] - (i === cuts.length - 2 ? 0 : 9);
          // 비탈에서도 뜨거나 묻히지 않게 짧게 끊어 그 자리 땅 높이에 놓는다.
          const n = Math.max(1, Math.ceil((b - a) / 6)), len = (b - a) / n;
          if (b - a > 4) for (let k = 0; k < n; k++) {
            const [px, pz] = at(a + (k + 0.5) * len, side, HW + 1.3);
            h.box('pave', ns ? 2.6 : len + 0.1, 0.5, ns ? len + 0.1 : 2.6, px, height(px, pz) - 0.22, pz, pave, { noShadow: true }); // 윗면이 땅 위 3cm
          }
        }
        // 가로등과 가로수
        for (let t = -half + 18, k = 0; t < half - 10; t += 15, k++) {
          if (c.offsets.some((q) => Math.abs(q - t) < 13)) continue;
          const [x, z] = at(t, side, HW + 1.2), y = height(x, z);
          if (k % 2 === 0) { assets.place('roads/light-square', x, y + 0.1, z, ns ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI); h.addBox(x, y + 2, z, 0.45, 4, 0.45); }
          else { assets.place(r.pick(trees), x, y + 0.1, z, r() * 6.28, r.range(0.75, 1)); h.addBox(x, y + 1.5, z, 0.6, 3, 0.6); }
        }
        // 건물: 길을 따라가며 들어갈 자리가 있으면 세운다.
        let t = -half + 8;
        while (t < half - 8) {
          const key = r.pick(pool), bb = assets.bounds(key), w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
          const setback = HW + 3.4 + d / 2, [x, z] = at(t + w / 2, side, setback), rad = Math.max(w, d) / 2;
          const ok = Math.hypot(x - c.x, z - c.z) < c.r - rad * 0.6 && roadDist(x, z) > setback - 0.8 && !placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < (q[2] + rad) * 0.86);
          if (!ok) { t += 4; continue; }
          // 정면(-Z)이 길을 보게 돌린다.
          const fx = ns ? -side : 0, fz = ns ? 0 : -side, yaw = Math.atan2(-fx, -fz), y = height(x, z) - 0.05;
          assets.place(key, x, y, z, yaw);
          h.collideModel(key, x, y, z, yaw, 1, 0.95);
          placed.push([x, z, rad]);
          if (key.startsWith('suburban/')) h.houses.push({ key, x, z, yaw, area: c.id });
          t += w + r.range(2.5, 5);
        }
      }
    }
  }
}
