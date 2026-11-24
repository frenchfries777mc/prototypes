// 규칙 기반 자연물 배치: 높이·경사·해안 거리·섬 성격을 보고 나무, 야자, 바위, 풀, 꽃을 세계 전체에 뿌린다.
import { height, slope, coast, islandAt, SEA, WORLD } from './terrain.js';
import { roadEdge } from './roads.js';
import { SITES } from './world.js';
import { BUILDINGS, CELL, JOB_SITES } from './mapdata.js';
import { rng, makeNoise } from './util.js';

const SMALL = (key) => (key.includes('flower') ? 0.38 : key.includes('grass') ? 0.5 : 0.62);
const sites = Object.values(SITES);

export function scatterNature(assets, addBox) {
  const r = rng(9001), noise = makeNoise(4242);
  const inTown = (x, z, pad) => x > -6 - pad && x < 138 + pad && z > -6 - pad && z < 90 + pad;
  const nearBuilding = (x, z, pad) => x > -40 && x < 170 && z > -20 && z < 130 &&
    (BUILDINGS.some((b) => Math.abs(b.cx * CELL - x) < 12 + pad && Math.abs(b.cz * CELL - z) < 9 + pad) || JOB_SITES.some((b) => Math.abs(b.cx * CELL - x) < 12 + pad && Math.abs(b.cz * CELL - z) < 9 + pad));
  const inSite = (x, z, pad) => sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + pad);
  const W = WORLD;
  const rnd = () => [r.range(W.x0 + 8, W.x1 - 8), r.range(W.z0 + 8, W.z1 - 8)];

  const leafy = ['nature/tree_blocks', 'nature/tree_blocks', 'nature/tree_default', 'nature/tree_oak', 'nature/tree_fat', 'nature/tree_detailed', 'nature/tree_plateau', 'nature/tree_simple', 'nature/tree_blocks_dark'];
  const dark = ['nature/tree_blocks_dark', 'nature/tree_oak_dark', 'nature/tree_pineRoundA', 'nature/tree_pineRoundC', 'nature/tree_blocks_dark', 'nature/tree_oak'];
  const fall = ['nature/tree_blocks_fall', 'nature/tree_default_fall', 'nature/tree_detailed_fall', 'nature/tree_blocks_fall', 'nature/tree_oak'];
  const pines = ['nature/tree_pineRoundA', 'nature/tree_pineRoundC', 'nature/tree_pineTallA_detailed', 'nature/tree_pineTallB_detailed', 'nature/tree_pineDefaultA'];
  const palms = ['pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/palm-straight', 'nature/tree_palmTall', 'nature/tree_palmDetailedTall', 'nature/tree_palmBend'];
  const rocks = ['nature/stone_largeA', 'nature/stone_largeB', 'nature/stone_largeD', 'nature/stone_largeF', 'nature/stone_tallA', 'nature/stone_tallC'];

  // ----- 나무 -----
  let n = 0, tries = 0;
  while (n < 5600 && tries++ < 400000) {
    const [x, z] = rnd();
    const kd = coast(x, z);
    if (kd < 32) continue;
    const h = height(x, z);
    if (h < SEA + 3.4 || h > 98 || slope(x, z) > 0.62) continue;
    if (inTown(x, z, 3) || nearBuilding(x, z, 2) || roadEdge(x, z) < 2.5 || inSite(x, z, 3)) continue;
    const isl = islandAt(x, z);
    if (!isl.forest) continue;
    const dens = noise.fbm(x * 0.006, z * 0.006, 3);
    if (r() > (dens - 0.4) * 3.3 * isl.forest + (h > 34 ? 0.2 : 0)) continue;
    const autumn = noise.fbm(x * 0.0035 + 40, z * 0.0035 + 9, 2) > 0.66;
    const set = h > 46 ? pines : isl.id === 'woods' ? dark : autumn ? fall : r() < 0.1 ? pines : leafy;
    assets.place(r.pick(set), x, h - 0.15, z, r() * 6.28, r.range(0.8, 1.6));
    addBox(x, h + 1.5, z, 0.8, 4, 0.8);
    n++;
  }
  // ----- 야자: 모래사장 -----
  n = 0; tries = 0;
  while (n < 520 && tries++ < 300000) {
    const [x, z] = rnd();
    const kd = coast(x, z);
    if (kd < 7 || kd > 30 || z > 700) continue; // 북쪽 해안에는 야자가 없다
    const h = height(x, z);
    if (h < SEA + 1.1 || h > SEA + 5 || slope(x, z) > 0.38 || inTown(x, z, 2) || roadEdge(x, z) < 2) continue;
    const key = r.pick(palms);
    assets.place(key, x, h - 0.2, z, r() * 6.28, key.startsWith('nature') ? r.range(1.2, 1.9) : r.range(1.5, 2.4));
    addBox(x, h + 2, z, 0.7, 4, 0.7);
    n++;
  }
  // ----- 바위: 비탈과 물가 -----
  n = 0; tries = 0;
  while (n < 420 && tries++ < 300000) {
    const [x, z] = rnd();
    const kd = coast(x, z);
    if (kd < -6) continue;
    const h = height(x, z), sl = slope(x, z);
    if (h < SEA - 0.6 || inTown(x, z, 4) || nearBuilding(x, z, 2) || roadEdge(x, z) < 2 || inSite(x, z, 0)) continue;
    if (!(sl > 0.5 || (kd < 14 && r() < 0.12) || r() < 0.012)) continue;
    const key = r.pick(rocks), s = r.range(0.7, h > 40 ? 3.2 : 2);
    assets.place(key, x, h - 0.3, z, r() * 6.28, s);
    const bb = assets.bounds(key);
    addBox(x, h + 0.2, z, (bb.max.x - bb.min.x) * s * 0.7, (bb.max.y - bb.min.y) * s, (bb.max.z - bb.min.z) * s * 0.7);
    n++;
  }
  // ----- 풀과 덤불 -----
  const small = ['nature/grass', 'nature/grass_large', 'nature/grass', 'nature/plant_bush', 'nature/plant_bushDetailed', 'nature/plant_bushLarge'];
  n = 0; tries = 0;
  while (n < 12000 && tries++ < 400000) {
    const [x, z] = rnd();
    if (coast(x, z) < 34) continue;
    const h = height(x, z);
    if (h < SEA + 3.3 || h > 92 || slope(x, z) > 0.6 || inTown(x, z, 0.5) || nearBuilding(x, z, -4) || roadEdge(x, z) < 1.4) continue;
    const k = r.pick(small);
    assets.place(k, x, h - 0.05, z, r() * 6.28, r.range(0.9, 1.9) * SMALL(k));
    n++;
  }
  // ----- 꽃: 무리 지어 핀다 -----
  const flowers = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA'];
  n = 0; tries = 0;
  while (n < 460 && tries++ < 100000) {
    const [cx, cz] = rnd();
    if (coast(cx, cz) < 40 || height(cx, cz) > 80) continue;
    const kind = r.pick(flowers);
    for (let i = 0; i < 9; i++) {
      const x = cx + r.range(-4, 4), z = cz + r.range(-4, 4), h = height(x, z);
      if (h < SEA + 3.3 || slope(x, z) > 0.5 || inTown(x, z, 0.5) || nearBuilding(x, z, -4) || roadEdge(x, z) < 1.4) continue;
      assets.place(kind, x, h - 0.03, z, r() * 6.28, r.range(1, 1.6) * SMALL(kind));
    }
    n++;
  }
}
