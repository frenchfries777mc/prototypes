// 경찰: 주민을 때리거나 차를 터뜨리면 수배되고, 경찰차가 쫓아온다.
// 멀리 떨어지거나 건물 안에 숨으면 따돌린다. 붙잡히면 벌금을 내고 마을 앞에서 다시 시작한다.
import { Vehicle } from './vehicles.js';
import { GRID, CELL, SPAWN } from './mapdata.js';
import { paths } from './roads.js';
import { clamp, angDiff, flatMat } from './util.js';
const B = window.BABYLON;

const LOT = [[123.4, 20, 0], [123.4, 27, 0], [123.4, 34, 0]]; // 평소 세워 두는 자리(동쪽 세로길 가)
const LOSE_DIST = 150; // 이보다 멀어지면 따돌리기 시작
const $ = (id) => document.getElementById(id);
const isRoad = (cx, cz) => { const c = GRID[cz] && GRID[cz][cx]; return c === '#' || c === 'x'; };

// 마을 도로 칸에서의 길 찾기(너비 우선). 다음에 갈 칸의 중심을 돌려준다.
function nextCell(fx, fz, tx, tz) {
  const key = (x, z) => x + z * 32, start = key(fx, fz), goal = key(tx, tz);
  if (start === goal) return null;
  const prev = new Map([[goal, -1]]), q = [[tx, tz]];
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (!isRoad(nx, nz) || prev.has(k)) continue;
      prev.set(k, key(x, z));
      if (k === start) { const p = prev.get(k); return [(p % 32) * CELL, Math.floor(p / 32) * CELL]; }
      q.push([nx, nz]);
    }
  }
  return null;
}
function roadCell(x, z) {
  const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
  if (isRoad(cx, cz)) return [cx, cz];
  let best = null, bd = 3.2;
  for (let j = 0; j < GRID.length; j++) for (let i = 0; i < GRID[j].length; i++) {
    if (!isRoad(i, j)) continue;
    const d = Math.hypot(i - x / CELL, j - z / CELL);
    if (d < bd) { bd = d; best = [i, j]; }
  }
  return best;
}

export class Police {
  constructor({ scene, assets, garage, player, jobs, height, weapons }) {
    Object.assign(this, { scene, garage, player, jobs, height });
    this.heat = 0; this.level = 0; this.lostT = 0; this.catchT = 0; this.t = 0; this.weapons = weapons || null;
    const red = flatMat('sirenRed', '#ff3b30', scene, { emissive: '#ff3b30' }), blue = flatMat('sirenBlue', '#2f6bff', scene, { emissive: '#2f6bff' });
    this.units = LOT.map(([x, z, yaw], i) => {
      const car = new Vehicle(scene, assets, 'cars/police', x, 0.12, z, yaw);
      car.police = true;
      garage.cars.push(car);
      const lamp = (m, dx) => { const b = B.MeshBuilder.CreateBox('siren', { width: 0.34, height: 0.2, depth: 0.3 }, scene); b.parent = car.root; b.position.set(dx, car.height + 0.1, car.zc - 0.1); b.material = m; b.isPickable = false; b.setEnabled(false); return b; };
      const u = { car, i, active: false, stuck: 0, rev: 0, lamps: [lamp(red, -0.3), lamp(blue, 0.3)], way: null, wayT: 0 };
      car.ai = (dt) => (u.active ? this.drive(u, dt) : null);
      return u;
    });
  }

  // 나쁜 짓 신고
  report(amount) {
    const was = this.level;
    this.heat = Math.min(260, this.heat + amount);
    this.lostT = 0;
    this.level = this.heat >= 170 ? 3 : this.heat >= 90 ? 2 : this.heat >= 28 ? 1 : 0;
    if (this.level > was) this.jobs.toast(was === 0 ? '경찰이 출동했어요! 달아나세요' : '수배 단계가 올랐어요!');
  }

  // 플레이어에게서 70~130m 떨어진 도로 위의 점
  spawnPoint() {
    const p = this.player.feet, c = [];
    for (let j = 0; j < GRID.length; j++) for (let i = 0; i < GRID[j].length; i++) if (isRoad(i, j)) c.push([i * CELL, j * CELL, 0.12]);
    for (const path of paths) if (path.type !== 'rail') for (let k = 0; k < path.pts.length; k += 5) { const q = path.pts[k]; if (!q.water) c.push([q.x, q.z, q.y]); }
    const ok = c.filter(([x, z]) => { const d = Math.hypot(x - p.x, z - p.z); return d > 70 && d < 130 && !this.units.some((u) => u.active && Math.hypot(u.car.pos.x - x, u.car.pos.z - z) < 12); });
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  dispatch(u) {
    const s = this.spawnPoint();
    if (!s) return false;
    const p = this.player.feet;
    u.car.hp = 100;
    u.car.reset(s[0], s[2] + 0.7, s[1], Math.atan2(p.x - s[0], p.z - s[1]));
    u.active = true; u.stuck = 0; u.rev = 0;
    return true;
  }
  recall(u) {
    u.active = false;
    u.lamps.forEach((l) => l.setEnabled(false));
    if (!u.car.dead) { u.car.hp = 100; u.car.reset(u.car.home.pos.x, u.car.home.pos.y + 0.3, u.car.home.pos.z, null); }
  }

  // 경찰차 한 대의 운전: 마을 안에서는 도로 칸을 따라가고, 그 밖에서는 곧장 쫓는다.
  drive(u, dt) {
    const car = u.car, P = this.player, target = P.vehicle ? P.vehicle.pos : P.feet;
    let tx = target.x, tz = target.z;
    u.wayT -= dt;
    if (u.wayT <= 0) {
      u.wayT = 0.4;
      u.way = null;
      const a = roadCell(car.pos.x, car.pos.z), b = roadCell(target.x, target.z);
      if (a && b && Math.hypot(target.x - car.pos.x, target.z - car.pos.z) > 16) u.way = nextCell(a[0], a[1], b[0], b[1]);
    }
    if (u.way) { tx = u.way[0]; tz = u.way[1]; }
    const dx = tx - car.pos.x, dz = tz - car.pos.z, dist = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
    const diff = angDiff(car.yaw, Math.atan2(dx, dz));
    if (u.rev > 0) { u.rev -= dt; return { throttle: -1, steer: clamp(-diff * 2, -1, 1), handbrake: false }; }
    // 걸어서 달아나는 사람 옆에서는 속도를 줄여 멈춰 선다.
    const onFoot = !P.vehicle;
    let throttle = Math.abs(diff) > 1.3 ? 0.45 : 1;
    if (onFoot && dist < 14) throttle = car.speed > 6 ? -0.6 : 0.5;
    if (onFoot && dist < 5) throttle = car.speed > 1 ? -1 : 0;
    // 벽이나 나무에 막히면 잠깐 후진한다.
    if (throttle > 0.3 && Math.abs(car.speed) < 0.8) { u.stuck += dt; if (u.stuck > 1.1) { u.stuck = 0; u.rev = 1.0; } } else u.stuck = 0;
    return { throttle, steer: clamp(diff * 1.7, -1, 1), handbrake: false };
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
    if (this.level === 0) { if (!el.hidden) el.hidden = true; this.siren(false); return; }
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
    const hidden = P.inside || nearest > LOSE_DIST;
    if (hidden) { this.lostT += dt; if (this.lostT > 5) this.heat -= dt * 22; } else this.lostT = 0;
    if (this.heat <= 0) { this.clear(); el.hidden = true; this.siren(false); this.jobs.toast('경찰을 따돌렸어요!', true); return; }
    // 붙잡기: 경찰차가 바로 옆에 있는데 거의 멈춰 있으면
    const mySpeed = P.vehicle ? Math.abs(P.vehicle.speed) : Math.hypot(P.vel.x, P.vel.z);
    const close = !P.inside && this.units.some((u) => u.active && !u.car.dead && Math.hypot(u.car.pos.x - me.x, u.car.pos.z - me.z) < (P.vehicle ? 6.5 : 4.2) && Math.abs(u.car.pos.y - me.y) < 3);
    this.catchT = close && mySpeed < (P.vehicle ? 3 : 6.5) ? this.catchT + dt : Math.max(0, this.catchT - dt * 2);
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
