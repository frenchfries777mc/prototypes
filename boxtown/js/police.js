// 경찰: 주민을 때리거나 차를 터뜨리면 수배되고, 경찰차가 쫓아온다.
// 멀리 떨어지거나 건물 안에 숨으면 따돌린다. 붙잡히면 벌금을 내고 마을 앞에서 다시 시작한다.
import { Vehicle } from './vehicles.js';
import { stats } from './stats.js';
import { GRID, CELL, SPAWN } from './mapdata.js';
import { paths } from './roads.js';
import { clamp, angDiff, flatMat } from './util.js';
import { Character, randomLook } from './character.js';
const B = window.BABYLON;

const LOT = [[123.7, 20, 0], [123.7, 27, 0], [123.7, 34, 0]]; // 평소 세워 두는 자리(동쪽 세로길 가)
const LOSE_DIST = 150; // 이보다 멀어지면 따돌리기 시작
const $ = (id) => document.getElementById(id);
const isRoad = (cx, cz) => { const c = GRID[cz] && GRID[cz][cx]; return c === '#' || c === 'x'; };

// ----- 길 그물: 마을 도로 칸과 마을 밖 길의 점들을 이어 놓고, 그 위에서 가장 짧은 길을 찾는다 -----
const NODES = []; // { x, z, y, e: [[이웃 번호, 거리]] }
(function buildNav() {
  const link = (a, b) => { const d = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z); NODES[a].e.push([b, d]); NODES[b].e.push([a, d]); };
  const cell = new Map();
  for (let j = 0; j < GRID.length; j++) for (let i = 0; i < GRID[j].length; i++) if (isRoad(i, j)) { cell.set(i + j * 64, NODES.length); NODES.push({ x: i * CELL, z: j * CELL, y: 0.12, e: [], town: true }); }
  for (const [k, n] of cell) { const i = k % 64, j = Math.floor(k / 64); for (const [di, dj] of [[1, 0], [0, 1]]) { const o = cell.get(i + di + (j + dj) * 64); if (o !== undefined) link(n, o); } }
  const townN = NODES.length, starts = [];
  for (const path of paths) {
    if (path.type === 'rail') continue;
    const first = NODES.length;
    for (let k = 0; k < path.pts.length; k += 2) { const q = path.pts[Math.min(k, path.pts.length - 1)]; NODES.push({ x: q.x, z: q.z, y: q.y, e: [] }); if (NODES.length - 1 > first) link(NODES.length - 2, NODES.length - 1); }
    const last = path.pts[path.pts.length - 1], tail = NODES[NODES.length - 1];
    if (tail.x !== last.x || tail.z !== last.z) { NODES.push({ x: last.x, z: last.z, y: last.y, e: [] }); link(NODES.length - 2, NODES.length - 1); }
    starts.push([first, NODES.length]);
  }
  // 서로 다른 길이 만나는 곳과 마을 어귀를 잇는다.
  const near = (a, b, r) => Math.abs(NODES[a].x - NODES[b].x) < r && Math.abs(NODES[a].z - NODES[b].z) < r && Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z) < r;
  for (let p = 0; p < starts.length; p++) {
    for (let a = starts[p][0]; a < starts[p][1]; a++) {
      for (let q = p + 1; q < starts.length; q++) for (let b = starts[q][0]; b < starts[q][1]; b++) if (near(a, b, 8.5)) link(a, b);
      for (let t = 0; t < townN; t++) if (near(a, t, 11)) link(a, t);
    }
  }
})();
function nearestNode(x, z) { let best = -1, bd = 1e9; for (let i = 0; i < NODES.length; i++) { const n = NODES[i], d = Math.abs(n.x - x) + Math.abs(n.z - z); if (d < bd) { bd = d; best = i; } } return best; }
// 가장 짧은 길(다익스트라). 길 위의 점 번호들을 돌려준다.
function route(from, to) {
  const dist = new Float64Array(NODES.length).fill(1e9), prev = new Int32Array(NODES.length).fill(-1), heap = [[0, from]];
  dist[from] = 0;
  while (heap.length) {
    let mi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[mi][0]) mi = i;
    const [d, u] = heap.splice(mi, 1)[0];
    if (u === to) break;
    if (d > dist[u]) continue;
    for (const [v, w] of NODES[u].e) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; heap.push([d + w, v]); }
  }
  if (prev[to] < 0) return null;
  const out = []; for (let u = to; u >= 0; u = prev[u]) out.push(u);
  return out.reverse();
}

export const NAV = { NODES, nearestNode, route };
export class Police {
  constructor({ scene, assets, garage, player, jobs, height, weapons, groundY }) {
    Object.assign(this, { scene, garage, player, jobs, height });
    this.groundY = groundY || height;
    this.heat = 0; this.level = 0; this.lostT = 0; this.catchT = 0; this.t = 0; this.weapons = weapons || null;
    const red = flatMat('sirenRed', '#ff3b30', scene, { emissive: '#ff3b30' }), blue = flatMat('sirenBlue', '#2f6bff', scene, { emissive: '#2f6bff' });
    this.units = LOT.map(([x, z, yaw], i) => {
      const car = new Vehicle(scene, assets, 'cars/police', x, 0.12, z, yaw);
      car.police = true;
      garage.cars.push(car);
      const lamp = (m, dx) => { const b = B.MeshBuilder.CreateBox('siren', { width: 0.34, height: 0.2, depth: 0.3 }, scene); b.parent = car.root; b.position.set(dx, car.height + 0.1, car.zc - 0.1); b.material = m; b.isPickable = false; b.setEnabled(false); return b; };
      // 차에서 내려 뛰어 쫓는 경찰관
      const chr = new Character(scene, { ...randomLook(8800 + i * 37), shirt: '#2f4fa8', pants: '#1f2a4a', shoes: '#22202b', head: 'police', hat: '#1f2a4a', brim: '#ffd84a', face: 'none', neck: 'badge', back: 'none' });
      chr.setVisible(false);
      const u = { car, i, cop: { chr, pos: new B.Vector3(), vel: new B.Vector3(), out: false }, active: false, stuck: 0, rev: 0, lamps: [lamp(red, -0.3), lamp(blue, 0.3)], way: null, wayT: 0, wi: 0, revSteer: 0 };
      car.ai = (dt) => (u.active ? this.drive(u, dt) : null);
      return u;
    });
  }

  // 나쁜 짓 신고
  report(amount, force = false) {
    if (this.player.jailed && !force) return; // 갇혀 있는 동안에는 수배되지 않는다(탈옥하다 들킨 경우만 예외)
    const was = this.level;
    this.heat = Math.min(260, this.heat + amount);
    this.lostT = 0;
    this.level = this.heat >= 170 ? 3 : this.heat >= 90 ? 2 : this.heat >= 28 ? 1 : 0;
    if (this.level > was) this.jobs.toast(was === 0 ? '경찰이 출동했어요! 달아나세요' : '수배 단계가 올랐어요!');
  }

  // 플레이어에게서 70~130m 떨어진 도로 위의 점
  spawnPoint(p = this.player.feet) {
    const c = [];
    for (let j = 0; j < GRID.length; j++) for (let i = 0; i < GRID[j].length; i++) if (isRoad(i, j)) c.push([i * CELL, j * CELL, 0.12]);
    for (const path of paths) if (path.type !== 'rail') for (let k = 0; k < path.pts.length; k += 5) { const q = path.pts[k]; if (!q.water) c.push([q.x, q.z, q.y]); }
    const ok = c.filter(([x, z]) => { const d = Math.hypot(x - p.x, z - p.z); return d > 70 && d < 130 && !this.units.some((u) => u.active && Math.hypot(u.car.pos.x - x, u.car.pos.z - z) < 12); });
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  dispatch(u, at) {
    const p = at || this.player.feet, s = this.spawnPoint(p);
    if (!s) return false;
    u.car.hp = 100;
    // 길이 난 방향을 보고 나타난다(플레이어 쪽을 보면 건물이나 비탈로 곧장 들이받는다).
    let yaw = Math.atan2(p.x - s[0], p.z - s[1]);
    const r = route(nearestNode(s[0], s[1]), nearestNode(p.x, p.z));
    if (r && r.length > 2) { const n = NODES[r[Math.min(2, r.length - 1)]]; yaw = Math.atan2(n.x - s[0], n.z - s[1]); }
    u.car.reset(s[0], s[2] + 0.7, s[1], yaw);
    u.active = true; u.stuck = 0; u.rev = 0; u.fails = 0; u.way = null; u.wayT = 0; u.quarry = null; u.holdT = 0; this.copIn(u);
    return true;
  }
  // 뺑소니 차를 잡으러 간다(쉬고 있는 경찰차 한 대). 보낼 차가 없으면 false.
  pursue(c) {
    const u = this.units.find((x) => !x.active && !x.car.dead);
    if (!u || !this.dispatch(u, c.pos)) return false;
    u.quarry = c; u.quarryT = 45;
    return true;
  }
  copIn(u) { if (u.cop.out) { u.cop.out = false; u.cop.chr.setVisible(false); } }
  // 경찰관이 내려서 뛰어 쫓는다. 플레이어에게 닿아 있으면 true.
  footChase(u, dt) {
    const P = this.player, cop = u.cop, car = u.car, me = P.feet;
    const dCar = Math.hypot(car.pos.x - me.x, car.pos.z - me.z);
    if (!cop.out) {
      if (P.vehicle || P.inside || u.quarry || car.dead || dCar > 18 || Math.abs(car.speed) > 4) return false;
      cop.out = true; cop.pos.set(car.pos.x + car.right.x * 1.7, car.pos.y, car.pos.z + car.right.z * 1.7); cop.chr.setVisible(true); cop.chr.heading = car.yaw;
    }
    const dx = me.x - cop.pos.x, dz = me.z - cop.pos.z, d = Math.hypot(dx, dz) || 1;
    if (P.vehicle || P.inside || d > 55 || car.dead) { this.copIn(u); return false; }
    const sp = d < 1.3 ? 0 : 7.6; // 걷는 것보다는 빠르고, 달리면 따돌릴 수 있다
    cop.vel.set((dx / d) * sp, 0, (dz / d) * sp);
    const nx = cop.pos.x + cop.vel.x * dt, nz = cop.pos.z + cop.vel.z * dt, gy = this.groundY(nx, nz);
    if (gy > -1.2) cop.pos.set(nx, gy, nz); else cop.vel.set(0, 0, 0); // 물에는 들어가지 않는다
    cop.chr.update(dt, { pos: cop.pos, vel: cop.vel, grounded: true, wishHeading: Math.atan2(dx, dz), landed: 0, jumped: false });
    return d < 1.8 && Math.abs(me.y - cop.pos.y) < 2.2;
  }
  recall(u) {
    u.active = false; u.quarry = null; this.copIn(u);
    u.lamps.forEach((l) => l.setEnabled(false));
    if (!u.car.dead) { u.car.hp = 100; u.car.reset(u.car.home.pos.x, u.car.home.pos.y + 0.3, u.car.home.pos.z, null); }
  }

  // 경찰차 한 대의 운전: 길 그물 위에서 가장 짧은 길을 따라가고, 굽이 앞에서는 속도를 줄인다.
  // 목표가 가깝거나 길에서 벗어나 있으면 곧장 쫓는다.
  drive(u, dt) {
    const car = u.car, P = this.player, target = u.quarry ? u.quarry.pos : P.vehicle ? P.vehicle.pos : P.feet, onFoot = !u.quarry && !P.vehicle;
    if (u.cop.out || u.holdT > 0) return { throttle: car.speed > 1 ? -1 : 0, steer: 0, handbrake: true }; // 경찰관이 내려 있거나 차를 붙잡는 중에는 서 있는다
    const dist = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
    u.wayT -= dt;
    if (u.wayT <= 0) {
      u.wayT = 0.7 + u.i * 0.13;
      u.way = null;
      const b = nearestNode(target.x, target.z), tb = NODES[b];
      // 목표가 길에서 멀리 벗어나 있으면(들판, 해변) 가까워졌을 때 길을 버리고 곧장 간다.
      const off = Math.hypot(tb.x - target.x, tb.z - target.z);
      if (dist > Math.max(22, off + 8)) { const r = route(nearestNode(car.pos.x, car.pos.z), b); if (r && r.length > 2) { u.way = r; u.wi = 0; } }
    }
    let tx = target.x, tz = target.z, bend = 0;
    if (u.way) {
      // 지나온 점은 넘기고, 속도에 맞춰 조금 앞의 점을 겨눈다.
      const look = 7 + Math.abs(car.speed) * 0.45;
      while (u.wi < u.way.length - 1 && Math.hypot(NODES[u.way[u.wi]].x - car.pos.x, NODES[u.way[u.wi]].z - car.pos.z) < look) u.wi++;
      const n = NODES[u.way[u.wi]];
      tx = n.x; tz = n.z;
      // 앞쪽 길이 얼마나 꺾이는지(굽이 앞에서 미리 감속)
      const far = NODES[u.way[Math.min(u.way.length - 1, u.wi + 5)]];
      bend = Math.abs(angDiff(Math.atan2(tx - car.pos.x, tz - car.pos.z), Math.atan2(far.x - tx, far.z - tz)));
      if (u.wi >= u.way.length - 1) u.way = null;
    }
    const diff = angDiff(car.yaw, Math.atan2(tx - car.pos.x, tz - car.pos.z));
    if (u.rev > 0) { u.rev -= dt; return { throttle: -1, steer: clamp(-u.revSteer, -1, 1), handbrake: false }; }
    // 낼 속도: 곧은 길은 빠르게, 굽이와 급한 방향 전환에서는 천천히.
    let want = clamp(30 - bend * 20 - Math.abs(diff) * 16, 8, 30);
    if (onFoot && dist < 16) want = 6; // 걸어서 달아나는 사람 옆에서는 속도를 줄여 멈춰 선다
    if (onFoot && dist < 5) want = 0;
    let throttle = car.speed < want - 1 ? 1 : car.speed > want + 5 ? -1 : car.speed > want + 1.5 ? -0.35 : 0.25;
    if (want === 0) throttle = car.speed > 1 ? -1 : 0;
    // 벽이나 나무에 막히면 반대로 꺾으며 후진한다.
    if (throttle > 0.2 && Math.abs(car.speed) < 0.8) { u.stuck += dt; if (u.stuck > 0.9) { u.stuck = 0; u.rev = 1.3; u.revSteer = Math.sign(diff || 1); u.wayT = 0; u.fails = (u.fails || 0) + 1; } } else u.stuck = 0;
    if (car.speed > 10) u.fails = 0;
    // 여러 번 막혀서 못 빠져나오면, 보이지 않는 곳에서 길 위로 다시 출동한다.
    if (u.fails >= 3 && dist > 45) { this.dispatch(u); return { throttle: 0, steer: 0, handbrake: false }; }
    // 급하게 꺾을 때는 사이드 브레이크로 뒤를 돌린다.
    const hb = Math.abs(diff) > 1.5 && car.speed > 9;
    return { throttle: hb ? 0 : throttle, steer: clamp(diff * 2.2, -1, 1), handbrake: hb };
  }

  arrest() {
    if (this.onArrest) { this.clear(); this.onArrest(); return; } // 감옥으로
    const P = this.player, fine = Math.min(this.jobs.money, 300 + this.level * 300);
    this.jobs.spend(fine);
    if (P.vehicle) P.exit();
    $('fade').classList.add('on'); setTimeout(() => $('fade').classList.remove('on'), 500);
    const y = this.height(SPAWN.x, SPAWN.z);
    P.teleport(SPAWN.x, Math.max(y, 0.24), SPAWN.z);
    this.clear();
    this.jobs.toast(fine > 0 ? `붙잡혔어요. 벌금 ${fine.toLocaleString('ko-KR')}원` : '붙잡혔어요. 다음엔 조심하세요');
  }
  clear() { this.heat = 0; this.level = 0; this.lostT = 0; this.catchT = 0; this.units.forEach((u) => this.recall(u)); }

  // 지도에 찍을 경찰차 위치
  marks() { return this.units.filter((u) => u.active && !u.car.dead).map((u) => ({ x: u.car.pos.x, z: u.car.pos.z })); }

  update(dt) {
    const P = this.player, me = P.vehicle ? P.vehicle.pos : P.feet, el = $('wanted');
    this.t += dt;
    // 뺑소니 차 쫓기(수배와 상관없이 돌아간다)
    let chasing = false;
    for (const u of this.units) {
      if (!u.active || !u.quarry) continue;
      const q = u.quarry, d = Math.hypot(u.car.pos.x - q.pos.x, u.car.pos.z - q.pos.z);
      const on = Math.floor(this.t * 4 + u.i) % 2 === 0;
      u.lamps[0].setEnabled(on); u.lamps[1].setEnabled(!on);
      u.quarryT -= dt;
      if (u.holdT > 0) { u.holdT -= dt; if (u.holdT <= 0) this.recall(u); }
      else if (d < 11) { q.caught = 7; u.holdT = 7; } // 붙잡았다: 둘 다 잠깐 서 있는다
      else if (u.quarryT <= 0 || q.dead || u.car.dead || this.level > 0) { q.fugitive = false; if (this.level > 0) { u.quarry = null; u.holdT = 0; } else this.recall(u); }
      if (u.active && Math.hypot(u.car.pos.x - me.x, u.car.pos.z - me.z) < 110) chasing = true;
    }
    if (this.level === 0) { if (!el.hidden) el.hidden = true; this.siren(chasing); return; }
    // 필요한 만큼 출동시킨다(터진 경찰차는 새로 나타난 뒤 다시 온다).
    let nearest = 1e9, active = 0;
    for (const u of this.units) {
      if (u.active && u.car.dead) u.active = false;
      if (!u.active && !u.car.dead && active < this.level && u.i < this.level) this.dispatch(u);
      if (!u.active) continue;
      active++;
      const d = Math.hypot(u.car.pos.x - me.x, u.car.pos.z - me.z);
      nearest = Math.min(nearest, d);
      const on = Math.floor(this.t * 4 + u.i) % 2 === 0;
      u.lamps[0].setEnabled(on); u.lamps[1].setEnabled(!on);
    }
    // 따돌리기: 멀리 떨어지거나, 건물 안에 숨거나, 경찰이 올 수 없는 곳이면 수배가 식는다.
    this.hotT = Math.max(0, (this.hotT || 0) - dt); // 은행을 턴 직후에는 숨어도 식지 않는다
    const hidden = !P.jailAlarm && this.hotT <= 0 && (P.inside || nearest > LOSE_DIST); // 탈옥 경보 중에는 식지 않는다
    if (hidden) { this.lostT += dt; if (this.lostT > 5) this.heat -= dt * 22; } else this.lostT = 0;
    if (this.heat <= 0) { stats.bump('escapes'); this.clear(); el.hidden = true; this.siren(false); this.jobs.toast('경찰을 따돌렸어요!', true); return; }
    // 붙잡기: 경찰차가 바로 옆에 있는데 거의 멈춰 있으면
    const mySpeed = P.vehicle ? Math.abs(P.vehicle.speed) : Math.hypot(P.vel.x, P.vel.z);
    let tagged = false;
    for (const u of this.units) if (u.active && !u.car.dead) tagged = this.footChase(u, dt) || tagged;
    const close = !P.inside && this.units.some((u) => u.active && !u.car.dead && Math.hypot(u.car.pos.x - me.x, u.car.pos.z - me.z) < (P.vehicle ? 6.5 : 4.2) && Math.abs(u.car.pos.y - me.y) < 3);
    this.catchT = (close && mySpeed < (P.vehicle ? 3 : 6.5)) || tagged ? this.catchT + dt : Math.max(0, this.catchT - dt * 2);
    if (this.catchT > (P.vehicle ? 2.2 : 1.3)) { this.arrest(); el.hidden = true; this.siren(false); return; }
    el.hidden = false;
    el.classList.toggle('flash', !hidden);
    el.innerHTML = '★'.repeat(this.level) + '☆'.repeat(3 - this.level) + `<small>${hidden ? '따돌리는 중…' : this.catchT > 0.2 ? '붙잡히는 중!' : nearest < 1e8 ? `경찰 ${Math.round(nearest)}m` : '경찰 출동 중'}</small>`;
    this.siren(nearest < 110);
  }

  // 사이렌 소리(무기 소리와 같은 오디오 장치를 쓴다)
  siren(on) {
    const ctx = this.weapons && this.weapons.sfx.ctx;
    if (!ctx) return;
    if (on && !this.osc) {
      this.osc = ctx.createOscillator(); this.gain = ctx.createGain();
      this.osc.type = 'triangle'; this.gain.gain.value = 0.035;
      this.osc.connect(this.gain).connect(ctx.destination); this.osc.start();
    }
    if (this.osc) {
      this.gain.gain.value = on ? 0.035 : 0;
      this.osc.frequency.value = Math.floor(this.t * 1.6) % 2 ? 660 : 880;
    }
  }
}
