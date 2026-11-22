// 마을 밖 지구들: 농장, 공단, 해변, 호수 마을, 요새, 유적, 야영장, 전망대, 섬마을…
// 건물과 소품은 에셋 팩 모델을 놓고, 팩에 없는 것(등대, 잔교, 전망대, 밭)은 상자로 짓는다.
import { SITES } from './world.js';
import { height, SEA } from './terrain.js';
import { roadDist } from './roads.js';
import { rng, flatMat } from './util.js';

const DEG = Math.PI / 180;

// h: { scene, assets, box, addBox, collideModel, bucket }
export function buildDistricts(h) {
  const { scene, assets } = h;
  const mats = new Map();
  const M = (hex, opts) => {
    const k = hex + JSON.stringify(opts || {});
    if (!mats.has(k)) mats.set(k, flatMat('d_' + k, hex, scene, opts));
    return mats.get(k);
  };
  const r = rng(2468);
  // 터 하나를 기준으로 한 배치 도구
  const at = (site, id) => {
    h.bucket(id, site.x, site.z);
    const P = (key, dx, dz, yaw = 0, scale = 1, shrink = 0.92) => {
      const x = site.x + dx, z = site.z + dz, y = height(x, z);
      if (y < SEA + 0.4) return false; // 물속이면 놓지 않는다
      if (roadDist(x, z) < 5.5) return false; // 길 위에도 놓지 않는다
      assets.place(key, x, y - 0.06, z, yaw * DEG, scale);
      if (key.startsWith('suburban/building-type') && scale === 1) h.houses.push({ key, x, z, yaw: yaw * DEG, area: id });
      if (shrink) h.collideModel(key, x, y, z, yaw * DEG, scale, shrink);
      return true;
    };
    const Bx = (name, w, hh, d, dx, dy, dz, m, opts = {}) => {
      const x = site.x + dx, z = site.z + dz;
      const y = (opts.base !== undefined ? opts.base : height(x, z)) + dy;
      return h.box(id + '_' + name, w, hh, d, x, y, z, m, opts);
    };
    return { P, Bx };
  };
  // 물가 찾기: (x,z)에서 (dx,dz) 방향으로 가다가 처음 물을 만나는 지점
  const shore = (x, z, dx, dz, max = 200) => {
    for (let t = 0; t < max; t += 2) if (height(x + dx * t, z + dz * t) < SEA + 0.2) return { x: x + dx * t, z: z + dz * t, t };
    return null;
  };
  // 나무 잔교: (x,z)에서 yaw 방향으로 len만큼
  const DOCK_NAMES = { resortDock: '동쪽 해변', lakeDock: '호수 마을', gullDock: '갈매기섬', fortDock: '요새섬', woodsDock: '고요숲 섬', millDock: '풍차섬', twinDock: '쌍둥이섬' };
  const dock = (id, x, z, yaw, len, w = 3.2) => {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const y = 0.5;
    h.box(id + '_deck', w, 0.3, len, x + (s * len) / 2, y, z + (c * len) / 2, M('#b9814f'), { yaw, collide: true });
    for (let t = 2; t < len; t += 5) for (const sd of [-1, 1]) {
      h.box(id + '_post', 0.45, 6, 0.45, x + s * t + c * sd * (w / 2), y - 2.6, z + c * t - s * sd * (w / 2), M('#8b5d3a'), { yaw });
    }
    // 잔교 끝 옆에 탈 수 있는 배를 한 척 댄다.
    h.boatSpots.push({ x: x + s * (len - 4) + c * (w / 2 + 2.3), z: z + c * (len - 4) - s * (w / 2 + 2.3), yaw });
    h.docks.push({ id, name: DOCK_NAMES[id] || id, x: x + s * (len - 2), z: z + c * (len - 2), y: y + 0.15 });
    return { x: x + s * len, z: z + c * len, y: y + 0.15 };
  };
  const lighthouse = (id, x, z, colA = '#f4f1ea', colB = '#e5553f') => {
    const gy = height(x, z);
    if (gy < SEA + 0.5) return;
    h.box(id + '_base', 8, 2.4, 8, x, gy + 0.6, z, M('#b9bfd0'), { collide: true });
    let y = gy + 1.8;
    for (let i = 0; i < 6; i++) { const s = 5.8 - i * 0.5; h.box(id + '_band' + i, s, 3.2, s, x, y + 1.6, z, M(i % 2 ? colB : colA), { collide: true }); y += 3.2; }
    h.box(id + '_deck', 5.6, 0.5, 5.6, x, y + 0.25, z, M('#3a3d4d'));
    h.box(id + '_lamp', 2.6, 2.4, 2.6, x, y + 1.7, z, M('#fff2b0', { emissive: '#ffe680' }), { noShadow: true });
    h.box(id + '_roof', 4, 0.6, 4, x, y + 3.2, z, M(colB));
    h.box(id + '_cap', 2.2, 0.8, 2.2, x, y + 3.9, z, M(colB));
  };
  const SUB = (c) => 'suburban/building-type-' + c;
  const IND = (c) => 'industrial/building-' + c;

  // ===================== 서쪽 농장 =====================
  {
    const S = SITES.farm, { P, Bx } = at(S, 'farm');
    P(SUB('b'), -8, 52, 0); P(SUB('n'), 26, 56, 0); P(SUB('g'), -38, 46, 0);
    P(IND('s'), -50, 8, 90); P(IND('k'), 66, -34, 90);
    P('industrial/windmill', 58, 40, 30); P('industrial/windmill', -64, 34, -20);
    P('industrial/water-tower', -62, -6, 0);
    // 밭 여섯 뙈기: 줄 맞춰 심은 작물
    const crops = [['nature/crops_cornStageD', 0.36, '#9c6b43'], ['nature/crops_wheatStageB', 0.5, '#d8b455'], ['nature/crop_pumpkin', 0.42, '#9c6b43'],
      ['nature/crops_wheatStageB', 0.5, '#d8b455'], ['nature/crop_melon', 0.42, '#8a6240'], ['nature/crops_cornStageD', 0.36, '#9c6b43']];
    crops.forEach(([key, sc, soil], i) => {
      const fx = -36 + (i % 3) * 34, fz = -28 - Math.floor(i / 3) * 30;
      Bx('field' + i, 30, 0.16, 25, fx, 0.06, fz, M(soil), { noShadow: true, base: S.y });
      for (let a = -13; a <= 13; a += 2.9) for (let b = -10.5; b <= 10.5; b += 3) assets.place(key, S.x + fx + a, S.y + 0.12, S.z + fz + b, r() * 6.28, sc * r.range(0.9, 1.15));
    });
    for (let x = -54; x <= 50; x += 3) { assets.place('nature/fence_simple', S.x + x, S.y, S.z - 12, 0, 0.5); assets.place('nature/fence_simple', S.x + x, S.y, S.z - 74, 0, 0.5); }
    for (let z = -72; z <= -14; z += 3) { assets.place('nature/fence_simple', S.x - 54, S.y, S.z + z, 90 * DEG, 0.5); assets.place('nature/fence_simple', S.x + 51, S.y, S.z + z, 90 * DEG, 0.5); }
    for (let i = 0; i < 9; i++) Bx('hay' + i, 1.9, 1.5, 2.6, 8 + (i % 3) * 2.3, 0.75 + Math.floor(i / 6) * 1.5, 0 + Math.floor((i % 6) / 3) * 3, M('#e3c55a'), { collide: i < 6 });
    P('nature/log_stackLarge', 62, 10, 20, 0.6); P('pirate/barrel', 34, 2, 0, 1, 0); P('pirate/crate', 36, 4, 30, 1, 0);
  }

  // ===================== 풍차 언덕 =====================
  {
    const S = SITES.wind, { P } = at(S, 'wind');
    for (let i = 0; i < 5; i++) P('industrial/windmill', -36 + i * 18, Math.sin(i * 1.7) * 10, 200 + i * 8, 1.25);
    P(SUB('k'), 6, -28, 180); P('nature/log_stack', -14, -24, 40, 0.6);
  }

  // ===================== 공단 =====================
  {
    const S = SITES.works, { P, Bx } = at(S, 'works');
    P(IND('a'), -40, 34, 180); P(IND('b'), -40, -8, 0); P(IND('c'), 12, 44, 180); P(IND('e'), 14, 2, 90);
    P(IND('f'), 52, 34, 180); P(IND('l'), -4, -46, 0); P(IND('m'), 46, -34, 270); P(IND('r'), -52, -52, 0); P(IND('g'), 60, 2, 270);
    P('industrial/chimney-large', 34, 22, 0); P('industrial/chimney-medium', -18, 14, 0); P('industrial/chimney-medium', -12, 14, 0);
    P('industrial/detail-tank-large', -68, 14, 0); P('industrial/detail-tank-large', -68, 34, 0); P('industrial/water-tower', 70, 44, 0);
    const cont = ['industrial/shipping-container-a', 'industrial/shipping-container-b', 'industrial/shipping-container-c'];
    for (let i = 0; i < 4; i++) {
      P(cont[i % 3], 20 + i * 5.2, -66, 0);
      if (i % 2) assets.place(cont[(i + 1) % 3], S.x + 20 + i * 5.2, S.y + 4.15, S.z - 66, 0); // 위에 한 층 더
    }
    for (let i = 0; i < 6; i++) P('industrial/solar-panel-landscape-group', -70 + (i % 3) * 20, 62 + Math.floor(i / 3) * 12, 0);
    Bx('yard', 150, 0.1, 150, 0, 0.04, 0, M('#aeb3c2'), { noShadow: true, base: S.y });
  }

  // ===================== 동쪽 해변 =====================
  {
    const S = SITES.resort, { P, Bx } = at(S, 'resort');
    P('commercial/building-n', -14, 12, 0); P('commercial/building-skyscraper-a', 24, 14, 0); P('commercial/building-e', -44, -6, 0); P('commercial/building-c', 46, -14, 0);
    // 모래사장(터에서 남쪽으로 46m 내려간 곳): 오두막, 파라솔, 감시탑
    const bz = -46;
    for (let i = 0; i < 8; i++) {
      const dx = -74 + i * 21, dz = bz - 58 - Math.sin(i * 1.3) * 4;
      if (P('pirate/structure', dx, dz, 0, 1.7, 0.9)) assets.place('pirate/structure-roof', S.x + dx, height(S.x + dx, S.z + dz) + 3.6, S.z + dz, 0, 1.7);
    }
    for (let i = 0; i < 22; i++) P(i % 2 ? 'commercial/detail-parasol-a' : 'commercial/detail-parasol-b', r.range(-95, 95), bz + r.range(-84, -70), r() * 360, 1, 0.15);
    P('pirate/tower-watch', 4, bz - 78, 0, 1.6);
    for (let i = 0; i < 12; i++) P('pirate/palm-detailed-straight', r.range(-100, 100), bz + r.range(-66, -46), r() * 360, r.range(1.6, 2.3), 0.12);
    // 배구 네트
    Bx('netPostA', 0.3, 2.6, 0.3, -30, 1.3, bz - 76, M('#f4f1ea')); Bx('netPostB', 0.3, 2.6, 0.3, -18, 1.3, bz - 76, M('#f4f1ea'));
    Bx('net', 12, 1.0, 0.08, -24, 2.0, bz - 76, M('#ffffff', { alpha: 0.55 }), { noShadow: true });
    const sh = shore(S.x + 40, S.z + bz - 60, 0, -1);
    if (sh) dock('resortDock', sh.x, sh.z + 8, Math.PI, 46, 4);
  }

  // ===================== 동해 야영장 =====================
  {
    const S = SITES.camp, { P } = at(S, 'camp');
    P('nature/campfire_stones', 0, 0, 0, 0.55, 0.6);
    const tents = ['nature/tent_detailedOpen', 'nature/tent_smallOpen', 'nature/tent_detailedClosed'];
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; P(tents[i % 3], Math.sin(a) * 14, Math.cos(a) * 14, a / DEG + 180, 0.95, 0.8); }
    P('nature/log_stack', 5, 6, 30, 0.55); P('nature/log_stackLarge', -22, -8, 70, 0.6); P('nature/sign', -10, -22, 180, 0.9, 0.3);
    for (let i = 0; i < 4; i++) P('nature/stump_round', Math.sin(i * 1.6) * 4.2, Math.cos(i * 1.6) * 4.2, 0, 0.5, 0.7);
  }

  // ===================== 호수 마을 =====================
  {
    const S = SITES.lake, { P } = at(S, 'lake');
    const ring = [['e', -30, 22, 120], ['c', -8, 36, 180], ['j', 18, 34, 180], ['o', 38, 14, 250], ['q', 36, -14, 300], ['i', 12, -34, 0], ['h', -14, -32, 0], ['t', -36, -10, 70]];
    for (const [c, dx, dz, yaw] of ring) P(SUB(c), dx, dz, yaw + 180); // 정면이 마을 가운데를 보게
    P('nature/campfire_stones', 0, 0, 0, 0.55, 0.6); P('nature/log_stack', 4, 5, 20, 0.5); P('pirate/barrel', -4, 6, 0, 1, 0);
    // 호수 쪽 물가에 잔교와 배
    const dx = 60 - S.x, dz = 615 - S.z, l = Math.hypot(dx, dz);
    const sh = shore(S.x, S.z, dx / l, dz / l);
    if (sh) {
      const yaw = Math.atan2(dx, dz);
      dock('lakeDock', sh.x - (dx / l) * 6, sh.z - (dz / l) * 6, yaw, 30);
      h.boats.push({ m: 'watercraft/boat-sail-a', x: 60, z: 630, r: 100 }, { m: 'watercraft/boat-fishing-small', x: 30, z: 600, r: 10 });
    }
  }

  // ===================== 산 전망대 =====================
  {
    const S = SITES.lookout, { P, Bx } = at(S, 'lookout');
    for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) Bx('leg', 0.5, 11, 0.5, dx, 5.5, dz, M('#8b5d3a'), { base: S.y, collide: true });
    Bx('floor', 7, 0.4, 7, 0, 11.2, 0, M('#b9814f'), { base: S.y, collide: true });
    for (const [dx, dz, w, d] of [[0, 3.4, 7, 0.2], [0, -3.4, 7, 0.2], [3.4, 0, 0.2, 7], [-3.4, 0, 0.2, 7]]) Bx('rail', w, 1.0, d, dx, 11.9, dz, M('#8b5d3a'), { base: S.y });
    Bx('roof', 8.4, 0.5, 8.4, 0, 15, 0, M('#e5553f'), { base: S.y }); Bx('roofTop', 5, 0.6, 5, 0, 15.55, 0, M('#e5553f'), { base: S.y });
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) Bx('post', 0.3, 3.4, 0.3, dx, 13.1, dz, M('#8b5d3a'), { base: S.y });
    // 올라가는 계단
    for (let i = 0; i < 22; i++) Bx('step' + i, 2.2, 0.3, 1.1, -5.2, 0.4 + i * 0.5, -11.5 + i * 0.75, M('#b9814f'), { base: S.y, collide: true });
    Bx('antenna', 0.4, 9, 0.4, 14, 4.5, 6, M('#d8dcec')); Bx('antennaDish', 2.2, 2.2, 0.5, 14, 8, 6.4, M('#f4f1ea')); Bx('antennaLamp', 0.6, 0.6, 0.6, 14, 9.3, 6, M('#ff5a4a', { emissive: '#ff2a1a' }), { noShadow: true });
    P('pirate/flag-high', -12, 4, 0, 2.2, 0.2); P('nature/sign', 4, -12, 180, 0.9, 0.3); P('nature/tent_smallOpen', 10, -10, 220, 0.9, 0.8); P('nature/campfire_stones', 5, -6, 0, 0.5, 0.6);
  }

  // ===================== 갈매기섬 마을 =====================
  {
    const S = SITES.gull, { P, Bx } = at(S, 'gull');
    const homes = [['a', -40, 30, 135], ['f', -14, 46, 180], ['k', 14, 46, 180], ['m', 42, 30, 225], ['s', 54, 0, 270], ['d', 40, -32, 315], ['c', 8, -48, 0], ['i', -22, -44, 0], ['o', -50, -18, 60]];
    for (const [c, dx, dz, yaw] of homes) P(SUB(c), dx, dz, yaw + 180);
    P('commercial/building-h', -4, 6, 0); P('commercial/building-c', 20, 4, 90);
    Bx('plaza', 30, 0.14, 26, 8, 0.06, -18, M('#d8dcec'), { noShadow: true, base: S.y });
    Bx('well', 2.6, 1.0, 2.6, 8, 0.5, -18, M('#b9bfd0'), { base: S.y, collide: true }); Bx('wellRoof', 3.4, 0.4, 3.4, 8, 3.2, -18, M('#e5553f'), { base: S.y });
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) Bx('wellPost', 0.2, 2.2, 0.2, 8 + dx, 2, -18 + dz, M('#8b5d3a'), { base: S.y });
    const sh = shore(S.x, S.z - 60, 0, -1);
    if (sh) { const end = dock('gullDock', sh.x, sh.z + 8, Math.PI, 40, 4); h.boats.push({ m: 'watercraft/boat-fishing-small', x: end.x + 5, z: end.z + 6, r: 0 }, { m: 'watercraft/boat-speed-a', x: end.x - 5, z: end.z + 14, r: 180 }); }
    const cape = shore(S.x + 60, S.z, 1, 0);
    if (cape) lighthouse('gullLight', cape.x - 14, cape.z, '#f4f1ea', '#3f8fe8');
  }

  // ===================== 옛 요새 =====================
  {
    const S = SITES.fort, { P } = at(S, 'fort');
    const R = 30, N = 34, sc = 2.6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (i === 0) { P('pirate/castle-gate', Math.sin(a) * R, Math.cos(a) * R, a / DEG, sc, 0); continue; }
      if (i === 1 || i === N - 1) continue;
      if (i % 9 === 4 && r() < 0.6) continue; // 무너진 곳
      P('pirate/castle-wall', Math.sin(a) * R, Math.cos(a) * R, a / DEG, sc);
    }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; P('pirate/tower-complete-large', Math.sin(a) * (R + 2), Math.cos(a) * (R + 2), 0, 2.5); }
    P('pirate/tower-complete-small', 0, 0, 0, 3.2);
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.5; P(i % 2 ? 'pirate/cannon' : 'pirate/cannon-mobile', Math.sin(a) * 22, Math.cos(a) * 22, a / DEG, 1.5, 0.8); }
    P('pirate/flag-pirate-high', 8, 8, 0, 2.6, 0.2); P('pirate/flag-pirate-high', -9, -7, 90, 2.6, 0.2); P('pirate/flag-high', 0, 40, 0, 2.4, 0.2);
    P('pirate/chest', -8, 10, 30, 1.3, 0.8); P('pirate/chest', 10, -12, 200, 1.3, 0.8); P('pirate/barrel', 14, 10, 0, 1.2, 0.8); P('pirate/crate', -14, -4, 20, 1.2, 0.8);
    const fd = shore(S.x, S.z + 40, 0, 1);
    if (fd) dock('fortDock', fd.x, fd.z - 8, 0, 28);
    const wreck = shore(S.x - 50, S.z + 30, -1, 0.2);
    if (wreck) assets.place('pirate/ship-wreck', wreck.x + 6, SEA - 0.6, wreck.z, 0.6, 1.9);
  }

  // ===================== 고요숲 섬: 오두막과 돌기둥 터 =====================
  {
    const S = SITES.woods, { P } = at(S, 'woods');
    P(SUB('k'), 0, 6, 200); P('nature/campfire_stones', 6, -8, 0, 0.5, 0.6); P('nature/log_stackLarge', -10, -4, 80, 0.6); P('nature/tent_detailedOpen', 14, -14, 300, 0.9, 0.8);
    for (let x = -16; x <= 16; x += 3) assets.place('nature/fence_simple', S.x + x, S.y, S.z + 20, 0, 0.5);
    const R2 = SITES.ruins, Q = at(R2, 'ruins').P;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; Q(i % 4 === 3 ? 'nature/statue_columnDamaged' : 'nature/statue_column', Math.sin(a) * 15, Math.cos(a) * 15, 0, 1.25, 0.9); }
    Q('nature/statue_obelisk', 0, 0, 0, 2.2); Q('nature/statue_head', 6, 5, 200, 1.1); Q('nature/statue_ring', -7, 3, 60, 1.2); Q('nature/statue_block', 3, -7, 20, 1.4); Q('nature/statue_block', -4, -6, 50, 1.1);
    const sh = shore(S.x, S.z, 1, 0.1);
    if (sh) dock('woodsDock', sh.x - 8, sh.z, Math.PI / 2, 26);
  }

  // ===================== 풍차섬 =====================
  {
    const S = SITES.mill, { P, Bx } = at(S, 'mill');
    for (let i = 0; i < 6; i++) { const a = i * 1.05; P('industrial/windmill', Math.sin(a) * 52, Math.cos(a) * 44, a / DEG + 90, 1.3); }
    P(SUB('b'), -10, 12, 180); P(SUB('h'), 18, 10, 180); P(SUB('g'), 4, -22, 0); P(IND('s'), -34, -14, 90);
    for (let i = 0; i < 2; i++) {
      const fx = 34, fz = -30 + i * 28;
      Bx('field' + i, 26, 0.16, 22, fx, 0.06, fz, M(i ? '#d8b455' : '#9c6b43'), { noShadow: true, base: S.y });
      for (let a = -11; a <= 11; a += 2.9) for (let b = -9; b <= 9; b += 3) assets.place(i ? 'nature/crops_wheatStageB' : 'nature/crop_pumpkin', S.x + fx + a, S.y + 0.12, S.z + fz + b, r() * 6.28, i ? 0.5 : 0.42);
    }
    const sh = shore(S.x, S.z - 60, 0.2, -1);
    if (sh) dock('millDock', sh.x, sh.z + 8, Math.PI, 30);
  }

  // ===================== 쌍둥이섬 선착장 =====================
  {
    const S = SITES.twin, { P } = at(S, 'twin');
    P(SUB('q'), 0, 8, 200); P(SUB('i'), -18, -6, 120);
    P('nature/canoe', 12, -10, 40, 1.2, 0.8); P('nature/canoe', 15, -8, 55, 1.2, 0.8); P('pirate/barrel', 6, -4, 0, 1, 0);
    const sh = shore(S.x, S.z, -1, 0);
    if (sh) { dock('twinDock', sh.x + 8, sh.z, -Math.PI / 2, 30); h.boats.push({ m: 'watercraft/boat-sail-b', x: sh.x - 60, z: sh.z + 20, r: 200 }); }
  }

  // ===================== 교도소 =====================
  {
    const S = SITES.prison, { Bx } = at(S, 'prison'), G = '#aab0c2', D = '#6b7285';
    Bx('yard', 46, 0.12, 40, 0, 0.06, 0, M('#b9bfd0'), { noShadow: true, base: S.y });
    Bx('block', 22, 7.5, 15, 0, 3.75, 0, M(G), { base: S.y, collide: true }); Bx('roof', 23, 0.6, 16, 0, 7.8, 0, M(D), { base: S.y });
    Bx('wing', 9, 5, 9, -14, 2.5, -2, M(G), { base: S.y, collide: true }); Bx('wingRoof', 9.8, 0.5, 9.8, -14, 5.25, -2, M(D), { base: S.y });
    Bx('door', 2.2, 3, 0.3, 0, 1.5, 7.6, M('#34456f'), { base: S.y }); Bx('doorTop', 4, 0.5, 1.4, 0, 3.4, 8, M(D), { base: S.y });
    // 쇠창살 창문
    for (const lx of [-8, -4, 4, 8]) for (const ly of [2.2, 5.2]) { Bx('win', 2, 1.3, 0.12, lx, ly, 7.56, M('#22202b'), { base: S.y, noShadow: true }); for (const k of [-0.6, 0, 0.6]) Bx('bar', 0.1, 1.3, 0.16, lx + k, ly, 7.6, M(D), { base: S.y, noShadow: true }); }
    // 담장과 망루
    const W = 23, Dp = 20;
    for (const [w, d, lx, lz] of [[2 * W, 0.6, 0, -Dp], [0.6, 2 * Dp, -W, 0], [0.6, 2 * Dp, W, 0], [W - 4, 0.6, -W / 2 - 2, Dp], [W - 4, 0.6, W / 2 + 2, Dp]]) {
      Bx('wall', w, 4.2, d, lx, 2.1, lz, M(G), { base: S.y, collide: true }); Bx('wire', w, 0.3, d + 0.2, lx, 4.35, lz, M('#3a3d4d'), { base: S.y, noShadow: true });
    }
    for (const [lx, lz] of [[-W, -Dp], [W, -Dp], [-W, Dp], [W, Dp]]) {
      Bx('tower', 3.4, 8, 3.4, lx, 4, lz, M(G), { base: S.y, collide: true }); Bx('towerDeck', 4.6, 0.4, 4.6, lx, 8.2, lz, M(D), { base: S.y });
      Bx('towerGlass', 3, 1.6, 3, lx, 9.2, lz, M('#7fc4f0', { emissive: '#2a5f86' }), { base: S.y, noShadow: true }); Bx('towerRoof', 4.6, 0.5, 4.6, lx, 10.25, lz, M('#d9473c'), { base: S.y });
    }
    Bx('gateL', 0.8, 5, 0.8, -4, 2.5, Dp, M(D), { base: S.y, collide: true }); Bx('gateR', 0.8, 5, 0.8, 4, 2.5, Dp, M(D), { base: S.y, collide: true }); Bx('gateTop', 9, 0.8, 1, 0, 5.4, Dp, M(D), { base: S.y });
    Bx('signBack', 7, 1.5, 0.3, 0, 6.6, Dp, M('#34456f'), { base: S.y });
  }

  // ===================== 외딴 오두막들 =====================
  [['cabinA', 'k', 40], ['cabinB', 'h', 200], ['cabinC', 'i', 120], ['cabinD', 'q', 300]].forEach(([id, c, yaw]) => {
    const S = SITES[id], { P } = at(S, id);
    P(SUB(c), 0, 0, yaw); P('nature/log_stack', 10, 6, 30, 0.55); P('nature/campfire_stones', -9, -8, 0, 0.5, 0.6); P('nature/stump_round', -11, -5, 0, 0.5, 0.7);
    for (let x = -12; x <= 12; x += 3) assets.place('nature/fence_simple', S.x + x, S.y, S.z - 16, 0, 0.5);
  });

  // ===================== 강변 공원 =====================
  {
    const S = SITES.park, { P, Bx } = at(S, 'park');
    Bx('gazeboFloor', 8, 0.4, 8, 0, 0.2, 0, M('#d8dcec'), { base: S.y, collide: true });
    for (const [dx, dz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) Bx('gazeboPost', 0.4, 3.4, 0.4, dx, 2.1, dz, M('#f4f1ea'), { base: S.y, collide: true });
    Bx('gazeboRoof', 9.6, 0.5, 9.6, 0, 4.05, 0, M('#3fa868'), { base: S.y }); Bx('gazeboRoofTop', 6, 0.6, 6, 0, 4.6, 0, M('#3fa868'), { base: S.y }); Bx('gazeboCap', 2.4, 0.7, 2.4, 0, 5.25, 0, M('#f4f1ea'), { base: S.y });
    P('nature/statue_obelisk', 0, 22, 0, 1.6);
    for (let i = 0; i < 8; i++) { const a = i * 0.785; Bx('bench' + i, 2.6, 0.5, 0.8, Math.sin(a) * 15, 0.3, Math.cos(a) * 15, M('#b9814f'), { base: S.y, yaw: a, collide: true }); }
    const trees = ['nature/tree_blocks', 'nature/tree_blocks_fall', 'nature/tree_fat', 'nature/tree_oak'];
    for (let i = 0; i < 14; i++) { const a = i * 0.449 + 0.2, d = 26 + (i % 3) * 6; P(trees[i % 4], Math.sin(a) * d, Math.cos(a) * d, r() * 360, r.range(0.9, 1.3), 0.14); }
    for (let i = 0; i < 6; i++) P(i % 2 ? 'commercial/detail-parasol-a' : 'commercial/detail-parasol-b', r.range(-22, 22), r.range(-30, -14), r() * 360, 1, 0.15);
  }

  // ===================== 그 밖: 등대, 모래섬의 보물, 바다 위 배 =====================
  h.bucket('spire', 900, 960);
  const sp = shore(900, 960, 0.4, -1, 260);
  if (sp) lighthouse('spireLight', sp.x - 6, sp.z + 14, '#f4f1ea', '#2c2c36');
  h.bucket('palm', 600, -660);
  {
    const y = height(600, -660);
    if (y > SEA + 0.5) {
      assets.place('pirate/structure', 600, y, -660, 0.4, 1.7); assets.place('pirate/structure-roof', 600, y + 3.7, -660, 0.4, 1.7);
      assets.place('pirate/chest', 606, height(606, -664), -664, 1, 1.4); assets.place('pirate/flag-pirate-high', 594, height(594, -656), -656, 0, 2.2);
    }
    const y2 = height(-390, -450);
    if (y2 > SEA + 0.5) { assets.place('pirate/chest', -390, y2, -450, 2, 1.4); assets.place('pirate/barrel', -386, height(-386, -448), -448, 0, 1.2); }
  }
  h.boats.push(
    { m: 'watercraft/boat-sail-a', x: 220, z: -150, r: 60 }, { m: 'watercraft/boat-sail-b', x: -260, z: -180, r: 200 }, { m: 'watercraft/boat-sail-a', x: 520, z: -200, r: 310 },
    { m: 'watercraft/boat-sail-b', x: 760, z: 80, r: 20 }, { m: 'watercraft/boat-fishing-small', x: -420, z: 30, r: 140 }, { m: 'watercraft/boat-speed-a', x: 640, z: -120, r: 90 },
    { m: 'watercraft/boat-sail-a', x: -560, z: 420, r: 250 }, { m: 'watercraft/boat-fishing-small', x: 820, z: 620, r: 30 }, { m: 'watercraft/boat-sail-b', x: 300, z: 1040, r: 170 },
    { m: 'watercraft/boat-sail-a', x: -200, z: 1010, r: 280 }, { m: 'watercraft/boat-speed-a', x: 60, z: -480, r: 220 },
  );
}
