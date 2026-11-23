// 교통: 주민이 모는 차, 신호등, 신호 위반 단속.
// 차는 물리 없이 차선을 따라 달린다(우측통행). 플레이어가 건드리면(타기, 쏘기, 들이받기, 폭발) 진짜 물리 자동차로 바뀐다.
import { paths, halfAt } from './roads.js';
import { JUNCTIONS } from './world.js';
import { Vehicle } from './vehicles.js';
import { clamp, damp, angDiff, flatMat, rng } from './util.js';
const B = window.BABYLON;

const KEYS = ['cars/sedan', 'cars/taxi', 'cars/suv', 'cars/van', 'cars/hatchback-sports', 'cars/truck', 'cars/delivery', 'cars/sedan-sports', 'cars/suv-luxury', 'cars/sedan', 'cars/suv'];
const ROAD_Y = 0.12;
// 항구 마을의 길(타일)은 경로가 아니라서, 차가 다닐 줄을 따로 만든다: [x0, z0, x1, z1]
const TOWN_LINES = [[12, 12, 120, 12], [-3, 48, 135, 48], [12, 84, 120, 84], [12, 12, 12, 99], [60, 12, 60, 84], [120, 12, 120, 84]];
const TOWN_J = [];
for (const x of [12, 60, 120]) for (const z of [12, 48, 84]) TOWN_J.push({ x, z, h: 4.2 });

function makeLine([x0, z0, x1, z1]) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 4), pts = [];
  for (let i = 0; i <= n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, y: ROAD_Y - 0.1, s: (len * i) / n, tx: (x1 - x0) / len, tz: (z1 - z0) / len });
  return { pts, half: 4.2, town: true };
}

export class Traffic {
  constructor({ scene, assets, player, garage, residents, police, jobs, weapons, health, addShadow, count = 34 }) {
    Object.assign(this, { scene, assets, player, garage, residents, police, jobs, weapons, health });
    this.t = 0; this.hitCd = 0; this.temps = []; this.inJ = null; this.redCd = 0;
    // ----- 차가 다니는 길과 네거리 -----
    this.lanes = [...paths.filter((p) => p.type === 'road'), ...TOWN_LINES.map(makeLine)];
    this.junctions = [...JUNCTIONS.map((j) => ({ x: j.x, z: j.z, h: 6.6 })), ...TOWN_J];
    for (const L of this.lanes) {
      L.len = L.pts[L.pts.length - 1].s;
      L.cross = [];
      for (const j of this.junctions) {
        let best = null, bd = 3;
        for (const p of L.pts) { const d = Math.hypot(p.x - j.x, p.z - j.z); if (d < bd) { bd = d; best = p; } }
        if (best) L.cross.push({ s: best.s, j, ns: Math.abs(best.tz) > Math.abs(best.tx) });
      }
    }
    this.buildSignals();
    // ----- 차 -----
    const r = rng(777), total = this.lanes.reduce((a, L) => a + L.len, 0);
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const key = KEYS[i % KEYS.length], parts = assets.spawnCar(key), root = new B.TransformNode('traffic', scene);
      parts.body.parent = root;
      parts.wheels.forEach((w) => { w.mesh.parent = root; w.mesh.position.copyFrom(w.pos); });
      addShadow([parts.body, ...parts.wheels.map((w) => w.mesh)]);
      const c = { key, root, parts, width: parts.max.x - parts.min.x, length: parts.max.z - parts.min.z, zc: (parts.max.z + parts.min.z) / 2, v: 0, yaw: 0, wait: 0, blocked: 0, ghost: 0, pos: new B.Vector3(), r };
      this.cars.push(c);
      // 길이에 비례해 고르게 뿌린다.
      let at = ((i + 0.5) / count) * total;
      for (const L of this.lanes) { if (at <= L.len) { this.put(c, L, clamp(at, 4, L.len - 4), i % 2 ? 1 : -1); break; } at -= L.len; }
    }
  }

  put(c, L, s, dir) {
    c.L = L; c.s = s; c.dir = dir; c.v = 0; c.dead = false; c.wait = 0;
    c.lane = L.town ? 1.25 : r2(c) < 0.5 ? 1.75 : 4.75;
    const q = this.at(L, s);
    c.yaw = Math.atan2(q.tx * dir, q.tz * dir);
    c.root.setEnabled(true);
    this.pose(c);
  }
  at(L, s) {
    const P = L.pts;
    s = clamp(s, 0, L.len - 0.01);
    let i = Math.min(P.length - 2, Math.floor((s / L.len) * (P.length - 1)));
    while (i > 0 && P[i].s > s) i--;
    while (i < P.length - 2 && P[i + 1].s <= s) i++;
    const a = P[i], b = P[i + 1], t = (s - a.s) / (b.s - a.s || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz, k: L.town ? 1 : halfAt(L, a) / L.half };
  }
  pose(c) {
    const q = this.at(c.L, c.s), off = c.lane * q.k * c.dir;
    c.pos.set(q.x + q.tz * off, q.y + 0.12, q.z - q.tx * off); // 진행 방향의 오른쪽 차선
    c.root.position.copyFrom(c.pos);
    c.yaw += angDiff(c.yaw, Math.atan2(q.tx * c.dir, q.tz * c.dir)) * 0.2;
    c.root.rotation.y = c.yaw;
    c.fx = Math.sin(c.yaw); c.fz = Math.cos(c.yaw);
  }

  // ----- 신호등 -----
  green(ns) { const p = this.t % 24; return ns ? p < 10 : p >= 12 && p < 22; }
  yellow(ns) { const p = this.t % 24; return ns ? p >= 10 && p < 12 : p >= 22; }
  buildSignals() {
    const scene = this.scene, sets = { pole: [], nsR: [], nsY: [], nsG: [], ewR: [], ewY: [], ewG: [] };
    const box = (set, w, hh, d, x, y, z) => { const b = B.MeshBuilder.CreateBox('sig', { width: w, height: hh, depth: d }, scene); b.position.set(x, y, z); sets[set].push(b); };
    for (const j of this.junctions) {
      const y = j.h > 5 ? this.jy(j) : ROAD_Y, c = j.h + 1.4;
      // 귀퉁이마다 기둥 하나: 남동·북서는 남북 방향 차, 남서·북동은 동서 방향 차가 본다.
      for (const [sx, sz, ax] of [[1, -1, 'ns'], [-1, 1, 'ns'], [-1, -1, 'ew'], [1, 1, 'ew']]) {
        const x = j.x + sx * c, z = j.z + sz * c;
        box('pole', 0.22, 5.2, 0.22, x, y + 2.6, z); box('pole', 0.5, 1.7, 0.5, x, y + 4.7, z);
        box(ax + 'R', 0.62, 0.38, 0.62, x, y + 5.25, z); box(ax + 'Y', 0.62, 0.38, 0.62, x, y + 4.7, z); box(ax + 'G', 0.62, 0.38, 0.62, x, y + 4.15, z);
      }
    }
    const merge = (list, hex, glow) => { const m = B.Mesh.MergeMeshes(list, true, true); m.material = flatMat('sig_' + hex, hex, scene, glow ? { emissive: hex } : undefined); m.isPickable = false; return m; };
    merge(sets.pole, '#2c2c36');
    this.sig = { nsR: merge(sets.nsR, '#ff3b30', 1), nsY: merge(sets.nsY, '#ffd84a', 1), nsG: merge(sets.nsG, '#3ee06a', 1), ewR: merge(sets.ewR, '#ff3b30', 1), ewY: merge(sets.ewY, '#ffd84a', 1), ewG: merge(sets.ewG, '#3ee06a', 1) };
  }
  jy(j) { let y = 0, bd = 1e9; for (const L of this.lanes) for (const cr of L.cross) if (cr.j === j && bd > 0) { const q = this.at(L, cr.s); y = q.y; bd = 0; } return y + 0.1; }

  // ----- 진짜 자동차로 바꾸기 -----
  convert(c) {
    if (c.dead) return null;
    const v = new Vehicle(this.scene, this.assets, c.key, c.pos.x, c.pos.y + 0.1, c.pos.z, c.yaw);
    v.body.setLinearVelocity(new B.Vector3(c.fx * c.v, 0, c.fz * c.v));
    v.temp = true;
    this.garage.cars.push(v); this.weapons.byBody.set(v.body, v); this.temps.push(v);
    c.dead = true; c.wait = 25; c.root.setEnabled(false);
    return v;
  }
  convertNear(x, z, radius) { for (const c of this.cars) if (!c.dead && Math.hypot(c.pos.x - x, c.pos.z - z) < radius) this.convert(c); }
  rayHit(o, d, maxT) {
    let best = null, bt = maxT;
    for (const c of this.cars) {
      if (c.dead) continue;
      const cx = c.pos.x - o.x, cy = c.pos.y + 0.8 - o.y, cz = c.pos.z - o.z, t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > bt) continue;
      const ex = cx - d.x * t, ey = cy - d.y * t, ez = cz - d.z * t;
      if (ex * ex + ey * ey + ez * ez < 1.5 * 1.5) { bt = t; best = c; }
    }
    return best ? { car: best, t: bt } : null;
  }
  nearCar() {
    const P = this.player;
    if (P.vehicle || P.inside) return null;
    return this.cars.find((c) => !c.dead && Math.hypot(c.pos.x - P.feet.x, c.pos.z - P.feet.z) < 3.3 && Math.abs(c.pos.y - P.feet.y) < 2.5) || null;
  }
  prompt() { return this.nearCar() ? '차 빼앗기' : ''; }
  use() {
    const c = this.nearCar();
    if (!c) return false;
    const v = this.convert(c);
    this.player.enter(v);
    this.police.report(22);
    this.jobs.toast('남의 차를 빼앗았어요!');
    return true;
  }
  cleanup() {
    const P = this.player, me = P.feet;
    for (let i = 0; i < this.temps.length && this.temps.length > 8; i++) {
      const v = this.temps[i];
      if (v === P.vehicle || Math.hypot(v.pos.x - me.x, v.pos.z - me.z) < 110) continue;
      const k = this.garage.cars.indexOf(v);
      if (k >= 0) this.garage.cars.splice(k, 1);
      this.weapons.byBody.delete(v.body);
      const fx = this.weapons.carFx.get(v);
      if (fx) { fx.smoke.dispose(false); fx.fire.dispose(false); this.weapons.carFx.delete(v); }
      v.body.dispose(); v.root.getChildMeshes().forEach((m) => m.dispose()); v.root.dispose();
      this.temps.splice(i, 1); i--;
    }
  }

  update(dt) {
    this.t += dt;
    const P = this.player, me = P.vehicle ? P.vehicle.pos : P.feet, sig = this.sig;
    sig.nsG.setEnabled(this.green(true)); sig.nsY.setEnabled(this.yellow(true)); sig.nsR.setEnabled(!this.green(true) && !this.yellow(true));
    sig.ewG.setEnabled(this.green(false)); sig.ewY.setEnabled(this.yellow(false)); sig.ewR.setEnabled(!this.green(false) && !this.yellow(false));

    // 신호 위반: 빨간불에 네거리로 들어가면 별 하나
    this.redCd -= dt;
    if (P.vehicle && !P.vehicle.police) {
      const v = P.vehicle.body.getLinearVelocity(), sp = Math.hypot(v.x, v.z);
      const j = this.junctions.find((q) => Math.abs(q.x - me.x) < q.h + 0.5 && Math.abs(q.z - me.z) < q.h + 0.5 && Math.abs((q.h > 5 ? this.jy(q) : ROAD_Y) - me.y) < 4) || null;
      if (j && j !== this.inJ && sp > 3.5 && this.redCd <= 0) {
        const ns = Math.abs(v.z) > Math.abs(v.x);
        if (!this.green(ns) && !this.yellow(ns)) { this.redCd = 4; this.police.report(30); this.jobs.toast('신호 위반!'); }
      }
      this.inJ = j;
    } else this.inJ = null;

    // 길을 막는 것들: 플레이어, 서 있는 차, 주민
    const obs = [];
    if (!P.inside) obs.push(me);
    for (const g of this.garage.cars) if (Math.hypot(g.pos.x - me.x, g.pos.z - me.z) < 300) obs.push(g.pos);
    for (const n of this.residents.list) if (n.mode !== 'sky') obs.push(n.pos);

    this.hitCd -= dt;
    for (const c of this.cars) {
      if (c.dead) { c.wait -= dt; if (c.wait <= 0) this.respawn(c, me); continue; }
      const far = Math.hypot(c.pos.x - me.x, c.pos.z - me.z);
      c.root.setEnabled(far < 430);
      if (far > 520) continue;
      const L = c.L, top = L.town ? 8 : 13;
      let limit = 99, hardBlock = false;
      // 끝에 다다르면 속도를 줄이고 돌아선다.
      const toEnd = c.dir > 0 ? L.len - c.s : c.s;
      limit = Math.min(limit, toEnd - 1);
      // 빨간불: 정지선 앞에 선다(이미 들어섰으면 지나간다).
      for (const cr of L.cross) { const ds = (cr.s - c.s) * c.dir - (cr.j.h + 3.5); if (ds > -1.5 && ds < 16 && !this.green(cr.ns)) limit = Math.min(limit, ds); }
      // 건널목 차단기가 내려와 있으면 그 앞에 선다.
      if (this.blocked) for (const x of this.blocked) { const dx = x.x - c.pos.x, dz = x.z - c.pos.z, fw = dx * c.fx + dz * c.fz; if (fw > 5 && fw < 26 && Math.abs(dx * c.fz - dz * c.fx) < 8) limit = Math.min(limit, fw - 8); }
      // 앞차
      for (const o of this.cars) if (o !== c && !o.dead && o.L === L && o.dir === c.dir && Math.abs(o.lane - c.lane) < 1) { const ds = (o.s - c.s) * c.dir; if (ds > 0 && ds < 14) limit = Math.min(limit, ds - 6.5); }
      // 앞을 막은 것
      if (c.ghost <= 0) for (const q of obs) {
        const dx = q.x - c.pos.x, dz = q.z - c.pos.z;
        if (Math.abs(dx) > 12 || Math.abs(dz) > 12 || Math.abs(q.y - c.pos.y) > 3) continue;
        const f = dx * c.fx + dz * c.fz, lat = dx * c.fz - dz * c.fx;
        if (f > 0.5 && f < 10 && Math.abs(lat) < 1.9) { limit = Math.min(limit, f - 5); hardBlock = true; }
      }
      const want = limit <= 0 ? 0 : Math.min(top, Math.sqrt(2 * 4 * limit));
      c.v = c.v < want ? Math.min(want, c.v + 3 * dt) : Math.max(want, c.v - 11 * dt);
      // 너무 오래 막혀 있으면 잠깐 그냥 지나간다(영영 멈춰 서지 않게).
      c.blocked = hardBlock && c.v < 0.3 ? c.blocked + dt : 0;
      if (c.blocked > 7) { c.ghost = 3; c.blocked = 0; }
      c.ghost -= dt;
      c.s += c.dir * c.v * dt;
      if (toEnd < 1.6) { c.dir = -c.dir; c.s = clamp(c.s, 1.7, L.len - 1.7); }
      this.pose(c);
      for (const w of c.parts.wheels) w.mesh.rotation.x += (c.v / Math.max(0.2, w.pos.y)) * dt;

      // 플레이어의 차가 가까이 오면 진짜 차로 바꿔서 부딪힐 수 있게 한다.
      if (P.vehicle && far < 6.2 + Math.abs(P.vehicle.speed) * 0.25) { this.convert(c); continue; }
      // 걸어가다 치이면 다친다.
      if (!P.vehicle && !P.inside && this.hitCd <= 0 && c.v > 4 && far < 4) {
        const dx = me.x - c.pos.x, dz = me.z - c.pos.z, f = dx * c.fx + dz * c.fz, lat = dx * c.fz - dz * c.fx;
        if (Math.abs(lat) < c.width / 2 + 0.45 && Math.abs(f - c.zc) < c.length / 2 + 0.45) {
          this.hitCd = 0.9;
          P.kick = new B.Vector3(c.fx * c.v * 0.9, 6 + c.v * 0.2, c.fz * c.v * 0.9);
          this.health.hurt(clamp(c.v * 4.2, 15, 75), c.fx, c.fz, 'car');
        }
      }
    }
    this.cleanup();
  }
  respawn(c, me) {
    for (let k = 0; k < 12; k++) {
      const L = this.lanes[Math.floor(Math.random() * this.lanes.length)], s = 4 + Math.random() * (L.len - 8), q = this.at(L, s);
      const d = Math.hypot(q.x - me.x, q.z - me.z);
      if (d > 140 && d < 700) { this.put(c, L, s, Math.random() < 0.5 ? 1 : -1); return; }
    }
    c.wait = 5;
  }
}
const r2 = (c) => c.r();
