// mapdata.js의 설계 데이터와 지형 규칙으로 월드를 실제로 세운다.
import { CELL, GRID, BUILDINGS, PROPS, DYNAMIC, BOATS, PIER, LIGHTHOUSE, JOB_SITES } from './mapdata.js';
import { height, slope, SEA, WORLD } from './terrain.js';
import { rng, makeNoise, flatMat } from './util.js';
import { buildJobSites } from './jobsites.js';
const B = window.BABYLON;

const FACE = { S: 0, W: Math.PI / 2, N: Math.PI, E: (3 * Math.PI) / 2 };
const DEG = Math.PI / 180;
export const SLAB_Y = 0.24; // 보도 윗면 높이
export const ROAD_Y = 0.12; // 아스팔트 윗면 높이
const LAWN_Y = 0.34;
// 자연 팩은 나무 크기에 맞춰 키웠기 때문에 꽃·풀·덤불은 따로 줄인다.
const SMALL = (key) => (key.includes('flower') ? 0.38 : key.includes('grass') ? 0.5 : 0.62);

const isRoad = (cx, cz) => {
  const row = GRID[cz];
  const c = row && row[cx];
  return c === '#' || c === 'x';
};
const cellAt = (x, z) => {
  const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
  const row = GRID[cz];
  return (row && row[cx]) || ' ';
};
// 발밑 높이: 도로/보도, 공원 잔디, 그 밖은 지형.
export function groundY(x, z) {
  // 잔교 위
  if (z < -6 && ((Math.abs(x - PIER.x) < PIER.w / 2 && z > PIER.z1 - 0.6) || (Math.abs(x - PIER.x) < 8.5 && z < PIER.z1 + 1 && z > PIER.z1 - 4))) return SLAB_Y;
  const c = cellAt(x, z);
  if (c === 'g') return LAWN_Y;
  if (c === '#' || c === 'x') {
    // 도로 칸의 가장자리 1.2m는 보도다(이웃이 도로가 아닌 쪽, 그리고 네 귀퉁이).
    const cx = Math.round(x / CELL), cz = Math.round(z / CELL), dx = x - cx * CELL, dz = z - cz * CELL;
    const ex = Math.abs(dx) > 4.8, ez = Math.abs(dz) > 4.8;
    if ((ex && ez) || (ex && !isRoad(cx + Math.sign(dx), cz)) || (ez && !isRoad(cx, cz + Math.sign(dz)))) return SLAB_Y;
    return ROAD_Y;
  }
  if (c === 'p' || c === 'q') return SLAB_Y;
  return height(x, z);
}

export function buildTown(scene, assets) {
  const colliders = new B.PhysicsShapeContainer(scene);
  const casters = [];
  const updaters = [];
  // 고정 충돌 상자 추가. (cx,cy,cz)는 상자 중심.
  const addBox = (cx, cy, cz, sx, sy, sz, yaw = 0) => {
    const shape = new B.PhysicsShapeBox(
      new B.Vector3(cx, cy, cz), B.Quaternion.RotationYawPitchRoll(yaw, 0, 0), new B.Vector3(sx, sy, sz), scene);
    colliders.addChild(shape);
  };
  // 모델 경계 상자 그대로 충돌 상자를 만든다. shrink로 가로·세로를 줄일 수 있다.
  const collideModel = (key, x, y, z, yaw, scale = 1, shrink = 1) => {
    const bb = assets.bounds(key);
    const sx = (bb.max.x - bb.min.x) * scale * shrink, sy = (bb.max.y - bb.min.y) * scale, sz = (bb.max.z - bb.min.z) * scale * shrink;
    const lx = ((bb.max.x + bb.min.x) / 2) * scale, lz = ((bb.max.z + bb.min.z) / 2) * scale;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    addBox(x + lx * c + lz * s, y + bb.min.y * scale + sy / 2, z - lx * s + lz * c, sx, sy, sz, yaw);
  };
  const box = (name, w, h, d, x, y, z, mat, opts = {}) => {
    const m = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z);
    if (opts.yaw) m.rotation.y = opts.yaw;
    m.material = mat;
    m.receiveShadows = true;
    m.isPickable = false;
    if (!opts.noShadow) casters.push(m);
    if (opts.collide) addBox(x, y, z, w, h, d, opts.yaw || 0);
    if (!opts.dynamic) m.freezeWorldMatrix();
    return m;
  };

  // ---------- 도로와 바닥 ----------
  for (let cz = 0; cz < GRID.length; cz++) {
    for (let cx = 0; cx < GRID[cz].length; cx++) {
      const c = GRID[cz][cx];
      const x = cx * CELL, z = cz * CELL;
      if (c === 'p' || c === 'q') { assets.place('roads/tile-low', x, 0, z); addBox(x, SLAB_Y - 0.5, z, CELL, 1, CELL); }
      if (c !== '#' && c !== 'x') continue;
      const n = isRoad(cx, cz + 1), e = isRoad(cx + 1, cz), s = isRoad(cx, cz - 1), w = isRoad(cx - 1, cz);
      const cnt = n + e + s + w;
      let piece, k = 0;
      if (cnt === 4) piece = 'road-crossroad';
      else if (cnt === 3) { piece = 'road-intersection'; k = !s ? 0 : !w ? 1 : !n ? 2 : 3; }
      else if (cnt === 2 && e && w) { piece = c === 'x' ? 'road-crossing' : 'road-straight'; k = 0; }
      else if (cnt === 2 && n && s) { piece = c === 'x' ? 'road-crossing' : 'road-straight'; k = 1; }
      else if (cnt === 2) { piece = 'road-bend'; k = n && e ? 0 : e && s ? 1 : s && w ? 2 : 3; }
      else { piece = 'road-end'; k = w ? 0 : n ? 1 : e ? 2 : 3; }
      assets.place('roads/' + piece, x, 0, z, k * Math.PI / 2);
      // 직선 도로 양옆의 보도 턱
      if (cnt === 2 && e && w) for (const sd of [-1, 1]) addBox(x, SLAB_Y - 0.5, z + sd * 5.4, CELL, 1, 1.2);
      if (cnt === 2 && n && s) for (const sd of [-1, 1]) addBox(x + sd * 5.4, SLAB_Y - 0.5, z, 1.2, 1, CELL);
      // 가로등: 직선 구간에 한 칸 걸러 하나씩, 양쪽을 번갈아 세운다.
      if (cnt === 2 && c === '#' && (cx + cz) % 2 === 0) {
        const side = (cx + cz) % 4 === 0 ? 1 : -1;
        if (e && w) {
          assets.place('roads/light-square', x, SLAB_Y, z + side * 5.85, side > 0 ? 0 : Math.PI);
          addBox(x, 2, z + side * 5.85, 0.45, 4, 0.45);
        } else if (n && s) {
          assets.place('roads/light-square', x + side * 5.85, SLAB_Y, z, side > 0 ? Math.PI / 2 : -Math.PI / 2);
          addBox(x + side * 5.85, 2, z, 0.45, 4, 0.45);
        }
      }
    }
  }
  // 바닥 충돌판(도로와 보도 윗면)
  addBox(66, ROAD_Y - 1, 42, 120, 2, 96);
  addBox(132, ROAD_Y - 1, 48, 12, 2, 12);

  // ---------- 건물 ----------
  for (const b of BUILDINGS) {
    const x = b.cx * CELL, z = b.cz * CELL, yaw = FACE[b.f];
    const y = groundY(x, z) - 0.02;
    assets.place(b.m, x, y, z, yaw);
    collideModel(b.m, x, y, z, yaw, 1, 0.96);
  }

  // ---------- 소품 ----------
  for (const p of PROPS) {
    const x = p.cx * CELL, z = p.cz * CELL, yaw = (p.r || 0) * DEG;
    const y = groundY(x, z) + (p.y || 0);
    assets.place(p.m, x, y, z, yaw, p.s || 1);
    collideModel(p.m, x, y, z, yaw, p.s || 1, p.m.includes('parasol') ? 0.15 : 0.95);
  }
  // ---------- 공원 ----------
  const M = {
    lawn: flatMat('lawn', '#6cc35a', scene),
    kerb: flatMat('kerb', '#d8dcec', scene),
    stone: flatMat('stone', '#c9cede', scene),
    water: flatMat('poolWater', '#56c8e0', scene, { emissive: '#1c5a70', alpha: 0.85 }),
    wood: flatMat('wood', '#b9814f', scene),
    woodDark: flatMat('woodDark', '#8b5d3a', scene),
    concrete: flatMat('concrete', '#b9bfd0', scene),
    concreteDark: flatMat('concreteDark', '#8f95a8', scene),
    white: flatMat('lhWhite', '#f4f1ea', scene),
    red: flatMat('lhRed', '#e5553f', scene),
    dark: flatMat('lhDark', '#3a3d4d', scene),
    lamp: flatMat('lhLamp', '#fff2b0', scene, { emissive: '#ffe680' }),
    yellow: flatMat('bollard', '#f4c542', scene),
    path: flatMat('path', '#e6d9b8', scene),
  };
  {
    const px = 6.5 * CELL, pz = 5.5 * CELL; // 공원 중심 (78, 66)
    box('lawnKerb', 24, 0.3, 24, px, 0.15, pz, M.kerb, { noShadow: true });
    box('lawn', 23.2, 0.34, 23.2, px, 0.17, pz, M.lawn, { noShadow: true });
    addBox(px, LAWN_Y - 1, pz, 24, 2, 24);
    // 십자 산책로
    box('pathA', 23.2, 0.02, 2.4, px, LAWN_Y + 0.005, pz, M.path, { noShadow: true });
    box('pathB', 2.4, 0.02, 23.2, px, LAWN_Y + 0.006, pz, M.path, { noShadow: true });
    // 분수: 네모난 수조와 상자를 쌓은 기둥
    const ring = [[0, 3.1, 6.8, 0.6], [0, -3.1, 6.8, 0.6], [3.1, 0, 0.6, 5.6], [-3.1, 0, 0.6, 5.6]];
    for (const [ox, oz, w, d] of ring) box('fountainRim', w, 0.8, d, px + ox, LAWN_Y + 0.4, pz + oz, M.stone, { collide: true });
    box('fountainWater', 5.6, 0.5, 5.6, px, LAWN_Y + 0.25, pz, M.water, { noShadow: true });
    const pillar = [[1.5, 1.4, 0], [1.1, 1.1, 0.5], [0.75, 0.9, 1.0]];
    let py = LAWN_Y;
    const spinners = [];
    pillar.forEach(([s, h, rot], i) => {
      const m = box('fountainBlock' + i, s, h, s, px, py + h / 2, pz, i === 2 ? M.red : M.white, { dynamic: true });
      m.rotation.y = rot;
      spinners.push(m);
      py += h;
    });
    addBox(px, LAWN_Y + 1.7, pz, 1.5, 3.4, 1.5);
    let t = 0;
    updaters.push((dt) => {
      t += dt;
      spinners[1].rotation.y = 0.5 + t * 0.4;
      spinners[2].rotation.y = 1.0 - t * 0.7;
      spinners[2].position.y = LAWN_Y + 2.5 + 0.45 + Math.sin(t * 1.6) * 0.12;
    });
    // 벤치 대신 놓은 나무 상자 의자
    for (const [ox, oz, yaw] of [[5.2, 2.4, 0], [-5.2, -2.4, 0], [2.4, -5.2, Math.PI / 2], [-2.4, 5.2, Math.PI / 2]]) {
      box('benchSeat', 0.8, 0.12, 2.6, px + ox, LAWN_Y + 0.5, pz + oz, M.wood, { yaw, collide: true });
      box('benchLegA', 0.7, 0.44, 0.16, px + ox + Math.sin(yaw) * 1.0, LAWN_Y + 0.22, pz + oz + Math.cos(yaw) * 1.0, M.woodDark, { yaw });
      box('benchLegB', 0.7, 0.44, 0.16, px + ox - Math.sin(yaw) * 1.0, LAWN_Y + 0.22, pz + oz - Math.cos(yaw) * 1.0, M.woodDark, { yaw });
    }
    // 공원 나무와 꽃
    const r = rng(5);
    const trees = ['nature/tree_blocks', 'nature/tree_blocks_dark', 'nature/tree_blocks_fall', 'nature/tree_fat', 'nature/tree_oak'];
    for (const [ox, oz] of [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5], [-9.6, 3.8], [9.6, -3.8], [3.8, 9.6], [-3.8, -9.6], [-6.2, 6.4], [6.3, -6.2]]) {
      const s = r.range(0.85, 1.25);
      assets.place(r.pick(trees), px + ox, LAWN_Y, pz + oz, r() * 6.28, s);
      addBox(px + ox, LAWN_Y + 1.5, pz + oz, 0.7, 3, 0.7);
    }
    const flowers = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA'];
    for (let i = 0; i < 90; i++) {
      const ox = r.range(-11, 11), oz = r.range(-11, 11);
      if (Math.abs(ox) < 1.8 || Math.abs(oz) < 1.8 || (Math.abs(ox) < 4.4 && Math.abs(oz) < 4.4)) continue;
      const kind = r() < 0.45 ? r.pick(flowers) : r() < 0.6 ? 'nature/grass' : 'nature/plant_bush';
      assets.place(kind, px + ox, LAWN_Y, pz + oz, r() * 6.28, r.range(0.8, 1.4) * SMALL(kind));
    }
  }

  // ---------- 가로수 ----------
  {
    const spots = [];
    for (let cx = 2; cx <= 9; cx++) if (cx !== 5) { spots.push([cx + 0.5, 1.58], [cx + 0.5, 3.42], [cx + 0.5, 4.58], [cx + 0.5, 6.42]); }
    for (const [cx, cz] of spots) {
      const x = cx * CELL, z = cz * CELL;
      if (cellAt(x, z) !== 'p') continue;
      if (JOB_SITES.some((j) => Math.abs(j.cx * CELL - x) < 7 && Math.abs(j.cz * CELL - z) < 9)) continue; // 가게 정면은 비워 둔다
      assets.place(cx % 2 < 1 ? 'suburban/tree-large' : 'suburban/tree-small', x, SLAB_Y, z, 0, 0.75);
      addBox(x, 2, z, 0.5, 4, 0.5);
    }
  }

  // ---------- 부두 벽, 계선주, 잔교 ----------
  box('quayWall', 126, 9, 2.6, 66, SLAB_Y - 4.5, -7.2, M.concrete, { collide: true });
  box('quayCapW', 66.5, 0.3, 1.0, 36.25, SLAB_Y + 0.15, -6.3, M.concreteDark, { collide: true });
  box('quayCapE', 54.5, 0.3, 1.0, 101.75, SLAB_Y + 0.15, -6.3, M.concreteDark, { collide: true });
  for (let x = 12; x <= 120; x += 9) {
    if (Math.abs(x - PIER.x) < 4) continue;
    box('bollard', 0.6, 0.7, 0.6, x, SLAB_Y + 0.65, -6.3, M.yellow, { collide: true });
  }
  {
    const { x, z0, z1, w } = PIER;
    const len = z0 - z1, zc = (z0 + z1) / 2;
    box('pierDeck', w, 0.3, len, x, SLAB_Y - 0.15, zc - 0.6, M.wood, { collide: true });
    box('pierHead', 17, 0.3, 5, x, SLAB_Y - 0.15, z1 - 1.5, M.wood, { collide: true });
    for (let z = z0 - 3; z >= z1 - 3; z -= 6.5) {
      for (const sx of [-1, 1]) box('pierPost', 0.55, 7, 0.55, x + sx * (w / 2 - 0.1), SLAB_Y - 2.9, z, M.woodDark, { collide: true });
    }
    for (const sx of [-1, 1]) box('pierHeadPost', 0.55, 7, 0.55, x + sx * 8.2, SLAB_Y - 2.9, z1 - 1.5, M.woodDark);
    for (let i = 0; i < 12; i++) box('plankLine', w, 0.31, 0.08, x, SLAB_Y - 0.15, z0 - 2 - i * 3, M.woodDark, { noShadow: true });
  }

  // ---------- 등대 ----------
  {
    const { x, z } = LIGHTHOUSE;
    const gy = height(x, z);
    box('lhBase', 9, 2.4, 9, x, gy + 0.6, z, M.concrete, { collide: true });
    const bands = 6, bandH = 3.4;
    let y = gy + 1.8;
    for (let i = 0; i < bands; i++) {
      const s = 6.4 - i * 0.55;
      box('lhBand' + i, s, bandH, s, x, y + bandH / 2, z, i % 2 ? M.red : M.white, { collide: true });
      y += bandH;
    }
    box('lhDeck', 6.2, 0.5, 6.2, x, y + 0.25, z, M.dark);
    box('lhLamp', 2.8, 2.6, 2.8, x, y + 1.8, z, M.lamp, { noShadow: true });
    for (const [ox, oz] of [[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) box('lhPost', 0.3, 2.6, 0.3, x + ox, y + 1.8, z + oz, M.dark);
    box('lhRoofA', 4.4, 0.6, 4.4, x, y + 3.4, z, M.red);
    box('lhRoofB', 2.8, 0.7, 2.8, x, y + 4.05, z, M.red);
    box('lhRoofC', 1.2, 0.9, 1.2, x, y + 4.85, z, M.dark);
    // 돌아가는 불빛
    const beam = B.MeshBuilder.CreateBox('lhBeam', { width: 1.6, height: 1.6, depth: 70 }, scene);
    const bm = new B.StandardMaterial('beamMat', scene);
    bm.emissiveColor = new B.Color3(1, 0.95, 0.7);
    bm.disableLighting = true;
    bm.alpha = 0.16;
    bm.fogEnabled = false;
    beam.material = bm;
    beam.isPickable = false;
    const pivot = new B.TransformNode('lhPivot', scene);
    pivot.position.set(x, y + 1.8, z);
    beam.parent = pivot;
    beam.position.z = 36;
    updaters.push((dt) => { pivot.rotation.y += dt * 0.5; });
    const r = rng(11);
    const rocks = ['pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c', 'pirate/rocks-sand-a', 'pirate/rocks-sand-b'];
    for (let i = 0; i < 16; i++) {
      const a = r() * 6.28, d = r.range(8, 24);
      const rx = x + Math.cos(a) * d, rz = z + Math.sin(a) * d * 0.8, s = r.range(0.8, 1.6);
      const ry = Math.max(height(rx, rz), SEA - 1.2) - 0.4;
      const key = r.pick(rocks);
      assets.place(key, rx, ry, rz, r() * 6.28, s);
      collideModel(key, rx, ry, rz, 0, s, 0.7);
    }
  }

  // ---------- 섬의 나무와 풀 ----------
  scatter(assets, addBox);

  // ---------- 먼바다의 작은 섬 ----------
  {
    const r = rng(404);
    for (let i = 0; i < 9; i++) {
      const a = -2.6 + (i / 8) * 2.1 + r.range(-0.1, 0.1), d = r.range(520, 880);
      assets.place(r.pick(['pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c']), 66 + Math.cos(a) * d, SEA - 4, 150 + Math.sin(a) * d, r() * 6.28,
        new B.Vector3(r.range(24, 50), r.range(12, 27), r.range(24, 50)));
    }
  }

  // ---------- 직업 건물 ----------
  const jobSites = buildJobSites({ scene, box, addBox, casters, groundY, updaters });

  assets.flush();

  // ---------- 고정 충돌체 등록 ----------
  const staticNode = new B.TransformNode('statics', scene);
  const body = new B.PhysicsBody(staticNode, B.PhysicsMotionType.STATIC, false, scene);
  body.shape = colliders;

  // ---------- 밀 수 있는 물건 ----------
  const dynamics = [];
  for (const d of DYNAMIC) {
    const m = assets.spawn(d.m);
    const x = d.cx * CELL, z = d.cz * CELL;
    const baseY = z < -6.5 ? SLAB_Y : groundY(x, z);
    m.position.set(x, baseY + 0.05 + (d.y || 0), z);
    m.rotation.y = (x * 7.3 + z * 3.1) % 6.28;
    const type = d.m.includes('barrel') ? B.PhysicsShapeType.CYLINDER : d.m.includes('cone') ? B.PhysicsShapeType.CONVEX_HULL : B.PhysicsShapeType.BOX;
    const agg = new B.PhysicsAggregate(m, type, { mass: d.mass, friction: 0.45, restitution: 0.2 }, scene);
    agg.body.setLinearDamping(0.15);
    agg.body.setAngularDamping(0.4);
    dynamics.push({ mesh: m, agg, home: m.position.clone() });
  }
  // 바다에 빠진 물건은 제자리로 돌려놓는다.
  let checkT = 0;
  updaters.push((dt) => {
    checkT += dt;
    if (checkT < 1) return;
    checkT = 0;
    for (const d of dynamics) {
      if (d.mesh.position.y < SEA - 3) {
        d.agg.body.disablePreStep = false;
        d.mesh.position.copyFrom(d.home).addInPlaceFromFloats(0, 1.5, 0);
        d.agg.body.setLinearVelocity(B.Vector3.Zero());
        d.agg.body.setAngularVelocity(B.Vector3.Zero());
      }
    }
  });

  // ---------- 배 ----------
  const boats = BOATS.map((b, i) => {
    const m = assets.spawn(b.m);
    m.position.set(b.x, SEA, b.z);
    m.rotation.y = (b.r || 0) * DEG;
    if (b.s) m.scaling.setAll(b.s);
    return { m, ph: i * 1.7, big: !!b.s };
  });
  let bt = 0;
  updaters.push((dt) => {
    bt += dt;
    for (const b of boats) {
      const k = b.big ? 0.35 : 1;
      b.m.position.y = SEA - 0.12 + Math.sin(bt * 1.1 + b.ph) * 0.09 * k;
      b.m.rotation.x = Math.sin(bt * 0.9 + b.ph) * 0.035 * k;
      b.m.rotation.z = Math.cos(bt * 0.7 + b.ph * 1.3) * 0.05 * k;
    }
  });

  return { casters, jobSites, update: (dt) => updaters.forEach((u) => u(dt)) };
}

// 규칙 기반 배치: 높이·경사·마을과의 거리를 보고 나무, 바위, 풀을 뿌린다.
function scatter(assets, addBox) {
  const r = rng(9001);
  const noise = makeNoise(4242);
  const inGrid = (x, z, pad) => x > -6 - pad && x < 138 + pad && z > -6 - pad && z < 90 + pad;
  const nearBuilding = (x, z, pad) => BUILDINGS.some((b) => Math.abs(b.cx * CELL - x) < 12 + pad && Math.abs(b.cz * CELL - z) < 9 + pad);
  const leafy = ['nature/tree_blocks', 'nature/tree_blocks', 'nature/tree_blocks_dark', 'nature/tree_default', 'nature/tree_oak', 'nature/tree_fat', 'nature/tree_detailed', 'nature/tree_plateau', 'nature/tree_simple'];
  const pines = ['nature/tree_pineRoundA', 'nature/tree_pineTallA_detailed', 'nature/tree_blocks_dark'];
  const palms = ['pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/palm-straight'];
  const rocks = ['nature/stone_largeA', 'nature/stone_largeB', 'nature/stone_largeD', 'nature/stone_largeF', 'nature/stone_tallA', 'nature/stone_tallC'];
  const W = WORLD;
  let trees = 0, tries = 0;
  while (trees < 620 && tries++ < 40000) {
    const x = r.range(W.x0 + 10, W.x1 - 10), z = r.range(W.z0 + 10, W.z1 - 10);
    const h = height(x, z);
    if (h < SEA + 3.6 || slope(x, z) > 0.55 || inGrid(x, z, 3) || nearBuilding(x, z, 2)) continue;
    const dens = noise.fbm(x * 0.012, z * 0.012, 3);
    if (r() > (dens - 0.34) * 3.2) continue;
    const key = h > 30 ? r.pick(pines) : r() < 0.12 ? r.pick(pines) : r.pick(leafy);
    const s = r.range(0.8, 1.55);
    assets.place(key, x, h - 0.15, z, r() * 6.28, s);
    addBox(x, h + 1.5, z, 0.8, 4, 0.8);
    trees++;
  }
  let n = 0;
  tries = 0;
  while (n < 46 && tries++ < 20000) {
    const x = r.range(W.x0 + 10, W.x1 - 10), z = r.range(W.z0 + 10, 190);
    const h = height(x, z);
    if (h < SEA + 1.1 || h > SEA + 3.3 || slope(x, z) > 0.35 || inGrid(x, z, 2)) continue;
    assets.place(r.pick(palms), x, h - 0.2, z, r() * 6.28, r.range(1.5, 2.4));
    addBox(x, h + 2, z, 0.7, 4, 0.7);
    n++;
  }
  n = 0;
  tries = 0;
  while (n < 60 && tries++ < 30000) {
    const x = r.range(W.x0 + 10, W.x1 - 10), z = r.range(W.z0 + 10, W.z1 - 10);
    const h = height(x, z), sl = slope(x, z);
    if (h < SEA - 0.6 || inGrid(x, z, 4) || nearBuilding(x, z, 2)) continue;
    if (!(sl > 0.5 || (h < SEA + 1.2 && r() < 0.25) || r() < 0.02)) continue;
    const key = r.pick(rocks), s = r.range(0.7, 1.9);
    assets.place(key, x, h - 0.3, z, r() * 6.28, s);
    const bb = assets.bounds(key);
    addBox(x, h + 0.2, z, (bb.max.x - bb.min.x) * s * 0.7, (bb.max.y - bb.min.y) * s, (bb.max.z - bb.min.z) * s * 0.7);
    n++;
  }
  // 풀, 덤불, 꽃: 꽃은 무리 지어 핀다.
  const small = ['nature/grass', 'nature/grass_large', 'nature/grass', 'nature/plant_bush', 'nature/plant_bushDetailed', 'nature/plant_bushLarge'];
  const flowers = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA'];
  n = 0;
  tries = 0;
  while (n < 1500 && tries++ < 60000) {
    const x = r.range(-150, 290), z = r.range(-40, 300);
    const h = height(x, z);
    if (h < SEA + 3.3 || slope(x, z) > 0.6 || inGrid(x, z, 0.5) || nearBuilding(x, z, -4)) continue;
    const sk = r.pick(small);
    assets.place(sk, x, h - 0.05, z, r() * 6.28, r.range(0.9, 1.9) * SMALL(sk));
    n++;
  }
  for (let c = 0; c < 70; c++) {
    const cx = r.range(-120, 260), cz = r.range(-30, 260), kind = r.pick(flowers);
    for (let i = 0; i < 9; i++) {
      const x = cx + r.range(-4, 4), z = cz + r.range(-4, 4), h = height(x, z);
      if (h < SEA + 3.3 || slope(x, z) > 0.5 || inGrid(x, z, 0.5) || nearBuilding(x, z, -4)) continue;
      assets.place(kind, x, h - 0.03, z, r() * 6.28, r.range(1, 1.6) * SMALL(kind));
    }
  }
}
