// 경기 시뮬레이션: 병사·무기·점령·병력·봇 AI. 렌더와 무관해서 Node 에서 그대로 돌려 시험할 수 있다.
// 규칙과 수치는 이전(Godot) 판의 Sim.gd 와 같다. 30Hz 고정 틱.
import { World, RNG, NPOINTS, POINT_R, POINT_X, POINT_Z } from './world.js';

export const TICK = 1 / 30, GRAV = 17, WALK = 4.8, SPRINT = 5.8, JUMP = 5.6, EYE = 1.62, RADIUS = 0.38;
export const START_TICKETS = 250, MATCH_TIME = 480, POINT_RATE = 0.022, BLEED_EVERY = 4;

export const WEAPONS = [
  { name: '볼트액션 소총', dmg: 70, cd: 1.15, mag: 5, reload: 2.9, spread: 0.0015, range: 240, auto: false, fall0: 150, botHit: 0.42, botCd: 2.4 },
  { name: '기관단총', dmg: 17, cd: 0.085, mag: 32, reload: 2.3, spread: 0.022, range: 90, auto: true, fall0: 25, botHit: 0.24, botCd: 3.4 },
  { name: '경기관총', dmg: 24, cd: 0.11, mag: 50, reload: 4.2, spread: 0.014, range: 160, auto: true, fall0: 70, botHit: 0.22, botCd: 3.2 },
];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const turn = (cur, target, step) => cur + clamp(wrapPi(target - cur), -step, step);

export class Unit {
  constructor(id, team) {
    this.id = id; this.team = team; this.isBot = true; this.alive = false; this.label = '';
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0; this.hp = 100;
    this.weapon = 0; this.loadout = 0; this.ammo = 0; this.fireCd = 0; this.reloadT = 0;
    this.respawnT = 1; this.invT = 0; this.deathAge = 0;
    this.kills = 0; this.deaths = 0; this.killer = -1; this.killW = 0; this.killDist = 0; this.killHp = 0;
    this.onGround = true; this.speedNow = 0; this.walkDist = 0;
    // 입력(사람은 키보드, 봇은 AI 가 채운다)
    this.moveX = 0; this.moveY = 0; this.jump = false; this.fire = false; this.reload = false; this.sprint = false; this.ads = false;
    this.trigger = false;
    // 봇
    this.target = -1; this.obj = -1; this.wp = { x: 0, z: 0 }; this.wpT = 0; this.thinkT = 0; this.stuckT = 0;
    this.lastX = 0; this.lastZ = 0; this.avoid = 1; this.strafe = 1; this.strafeT = 0; this.role = 0; this.botSpeed = WALK;
  }
}

export class Sim {
  constructor(seed = 20260101, perTeam = 16, smooth = false) {
    this.world = new World(seed, smooth);
    this.rng = new RNG(seed * 7 + 1);
    this.reset(perTeam);
  }

  reset(perTeam) {
    this.perTeam = perTeam;
    this.tickets = [START_TICKETS, START_TICKETS];
    this.time = 0; this.bleedT = 0; this.winner = -1; this.winReason = ''; this.events = [];
    this.pts = [];
    for (let i = 0; i < NPOINTS; i++) {
      const p = this.world.pointPos(i);
      this.pts.push({ x: p.x, y: p.y, z: p.z, owner: i === 0 ? 0 : i === NPOINTS - 1 ? 1 : -1, cap: i === 0 ? 1 : i === NPOINTS - 1 ? -1 : 0, nA: 0, nB: 0 });
    }
    this.units = [];
    for (let t = 0; t < 2; t++) for (let k = 0; k < perTeam; k++) {
      const u = new Unit(this.units.length, t);
      u.respawnT = this.rng.range(0.3, 5);
      u.weapon = this.botWeapon();
      u.avoid = this.rng.next() < 0.5 ? 1 : -1;
      u.label = (t === 0 ? 'A' : 'B') + u.id;
      this.units.push(u);
    }
  }

  botWeapon() { const r = this.rng.next(); return r < 0.25 ? 0 : r < 0.7 ? 1 : 2; }

  // 사람이 맡는 슬롯. 한 번도 죽지 않았다면 기다리지 않고 바로 투입한다.
  claim(id, loadout = 0, name = '나') {
    const u = this.units[id];
    u.isBot = false; u.loadout = loadout; u.weapon = loadout; u.label = name;
    if (!u.alive) {
      if (u.deaths === 0 && this.tickets[u.team] > 0) this.spawn(u); else u.respawnT = Math.min(u.respawnT, 0.15);
    }
  }
  teamAlive(team) { let n = 0; for (const u of this.units) if (u.team === team && u.alive) n++; return n; }
  owned(team) { let n = 0; for (const p of this.pts) if (p.owner === team) n++; return n; }

  step(dt) {
    if (this.winner >= 0) { for (const u of this.units) if (!u.alive) u.deathAge += dt; return; }
    this.time += dt;
    for (const u of this.units) this.stepUnit(u, dt);
    this.stepPoints(dt);
    this.bleed(dt);
    this.checkEnd();
    if (this.events.length > 600) this.events.splice(0, this.events.length - 300);
  }

  stepUnit(u, dt) {
    if (!u.alive) {
      u.deathAge += dt; u.respawnT -= dt;
      if (u.respawnT <= 0 && this.tickets[u.team] > 0) this.spawn(u);
      return;
    }
    if (u.invT > 0) u.invT -= dt;
    u.fireCd = Math.max(0, u.fireCd - dt);
    if (u.reloadT > 0) { u.reloadT -= dt; if (u.reloadT <= 0) u.ammo = WEAPONS[u.weapon].mag; }
    if (u.isBot) this.botAi(u, dt);
    else {
      const w = WEAPONS[u.weapon];
      if (u.reload) { u.reload = false; if (u.ammo < w.mag && u.reloadT <= 0) this.startReload(u); }
      if (u.fire && u.fireCd <= 0 && u.reloadT <= 0) {
        if (u.ammo <= 0) this.startReload(u);
        else if (w.auto || !u.trigger) this.shoot(u);
      }
      u.trigger = u.fire;
    }
    this.integrate(u, dt);
  }

  startReload(u) { u.reloadT = WEAPONS[u.weapon].reload; this.events.push({ t: 'reload', id: u.id }); }

  integrate(u, dt) {
    const w = this.world;
    let speed;
    if (u.isBot) speed = u.botSpeed;
    else speed = (u.sprint && u.moveY > 0 && !u.ads) ? SPRINT : (u.ads ? WALK * 0.55 : WALK);
    const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), rx = Math.cos(u.yaw), rz = -Math.sin(u.yaw);
    let wx = rx * u.moveX + fx * u.moveY, wz = rz * u.moveX + fz * u.moveY;
    const l = Math.hypot(wx, wz);
    if (l > 1) { wx /= l; wz /= l; }
    wx *= speed; wz *= speed;
    const k = Math.min(1, (u.onGround ? 14 : 3) * dt);
    u.vx += (wx - u.vx) * k; u.vz += (wz - u.vz) * k;
    if (u.jump && u.onGround) { u.vy = JUMP; u.onGround = false; }
    u.vy -= GRAV * dt;
    {
      const lim = u.y + 0.62, R = RADIUS;
      const nx = u.x + u.vx * dt, nz = u.z + u.vz * dt;
      if (w.heightAt(nx + Math.sign(u.vx) * R, u.z) <= lim) u.x = nx; else u.vx = 0;
      if (w.heightAt(u.x, nz + Math.sign(u.vz) * R) <= lim) u.z = nz; else u.vz = 0;
      u.y += u.vy * dt;
    }
    const ground = w.resolve(u, RADIUS);
    if (u.y <= ground + 0.001) { u.y = ground; if (u.vy < 0) u.vy = 0; u.onGround = true; } else u.onGround = false;
    u.speedNow = Math.hypot(u.vx, u.vz);
    u.walkDist += u.speedNow * dt;
  }

  // ---- 사격 ----
  falloff(w, dist) { return dist <= w.fall0 ? 1 : Math.max(0.45, 1 - (dist - w.fall0) / (w.range - w.fall0) * 0.55); }

  rayUnit(ox, oy, oz, dx, dy, dz, maxT, e) {
    const R = 0.42;
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return null;
    const px = ox - e.x, pz = oz - e.z;
    const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    let t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > maxT) return null;
    const y = oy + dy * t;
    if (y < e.y || y > e.y + 1.78) return null;
    return { t, head: y > e.y + 1.45 };
  }

  shoot(u) {
    const w = WEAPONS[u.weapon];
    u.ammo--; u.fireCd = w.cd;
    const sp = w.spread * (u.ads ? 0.35 : 1) * (1 + Math.min(u.speedNow, 6) * 0.18);
    const cp = Math.cos(u.pitch);
    let dx = -Math.sin(u.yaw) * cp, dy = Math.sin(u.pitch), dz = -Math.cos(u.yaw) * cp;
    dx += (this.rng.next() - 0.5) * 2 * sp; dy += (this.rng.next() - 0.5) * 2 * sp; dz += (this.rng.next() - 0.5) * 2 * sp;
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    const ox = u.x, oy = u.y + EYE, oz = u.z;
    const R = w.range;
    const blockT = this.world.rayBlock(ox, oy, oz, ox + dx * R, oy + dy * R, oz + dz * R) * R;
    let best = blockT, who = null, head = false;
    for (const e of this.units) {
      if (!e.alive || e.team === u.team) continue;
      const h = this.rayUnit(ox, oy, oz, dx, dy, dz, best, e);
      if (h && h.t < best) { best = h.t; who = e; head = h.head; }
    }
    const end = { x: ox + dx * best, y: oy + dy * best, z: oz + dz * best };
    this.events.push({ t: 'shot', id: u.id, team: u.team, a: { x: ox + dx * 0.9, y: oy - 0.18 + dy * 0.9, z: oz + dz * 0.9 }, b: end, hit: !!who, weapon: u.weapon, surface: who ? 'body' : (best >= R - 0.01 ? 'air' : 'world') });
    if (who) this.damage(who, w.dmg * this.falloff(w, best) * (head ? 2 : 1), u, head);
  }

  damage(e, amount, attacker, head) {
    if (!e.alive || e.invT > 0) return;
    e.hp -= amount;
    this.events.push({ t: 'hit', a: attacker.id, v: e.id, head, dmg: amount });
    if (e.hp > 0) return;
    e.alive = false; e.hp = 0; e.deathAge = 0;
    e.respawnT = e.isBot ? this.rng.range(5, 8) : 5;
    e.deaths++; e.vx = e.vz = 0;
    attacker.kills++;
    e.killer = attacker.id; e.killW = attacker.weapon;
    e.killDist = Math.hypot(attacker.x - e.x, attacker.z - e.z); e.killHp = Math.max(attacker.hp, 0);
    this.tickets[e.team] = Math.max(0, this.tickets[e.team] - 1);
    this.events.push({ t: 'kill', k: attacker.id, v: e.id, w: attacker.weapon, head });
  }

  // ---- 스폰 ----
  frontIndex(team) {
    if (team === 0) { let f = 0; for (let i = 0; i < NPOINTS; i++) if (this.pts[i].owner === 0) f = i; return f; }
    let g = NPOINTS - 1;
    for (let i = NPOINTS - 1; i >= 0; i--) if (this.pts[i].owner === 1) g = i;
    return g;
  }
  enemyNear(x, z, team, r) {
    for (const e of this.units) if (e.alive && e.team !== team && (e.x - x) ** 2 + (e.z - z) ** 2 < r * r) return true;
    return false;
  }
  spawnIndex(team) {
    let i = this.frontIndex(team);
    const base = team === 0 ? 0 : NPOINTS - 1;
    if (i !== base && this.enemyNear(this.pts[i].x, this.pts[i].z, team, 26)) i += team === 0 ? -1 : 1;
    return i;
  }
  spawn(u) {
    const w = this.world;
    const c = this.pts[this.spawnIndex(u.team)];
    let px = c.x, pz = c.z;
    for (let k = 0; k < 10; k++) {
      const a = this.rng.next() * Math.PI * 2, r = this.rng.range(3, 9);
      px = c.x + Math.cos(a) * r; pz = c.z + Math.sin(a) * r;
      if (w.blocked(px, pz, RADIUS + 0.2, w.heightAt(px, pz)) < -1e8) break;
    }
    u.x = px; u.z = pz; u.y = w.heightAt(px, pz); u.vx = u.vy = u.vz = 0;
    u.hp = 100; u.alive = true; u.deathAge = 0;
    if (u.isBot) { u.weapon = this.botWeapon(); u.role = this.rng.next() < 0.18 ? 1 : 0; } else u.weapon = u.loadout;
    u.ammo = WEAPONS[u.weapon].mag; u.reloadT = 0; u.fireCd = 0.5;
    u.invT = u.isBot ? 2 : 4;
    u.target = -1; u.obj = -1; u.thinkT = this.rng.next() * 0.3; u.stuckT = 0;
    u.yaw = u.team === 1 ? Math.PI / 2 : -Math.PI / 2; u.pitch = 0;
    u.lastX = px; u.lastZ = pz; u.onGround = true; u.trigger = false;
    this.events.push({ t: 'spawn', id: u.id });
  }

  // ---- 점령 ----
  eligible(team, i) {
    if (this.pts[i].owner === team) return true;
    if (team === 0) return i === 0 || this.pts[i - 1].owner === 0;
    return i === NPOINTS - 1 || this.pts[i + 1].owner === 1;
  }
  stepPoints(dt) {
    const r2 = POINT_R * POINT_R;
    for (let i = 0; i < NPOINTS; i++) {
      const p = this.pts[i];
      let ca = 0, cb = 0;
      for (const u of this.units) {
        if (!u.alive) continue;
        const dx = u.x - p.x, dz = u.z - p.z;
        if (dx * dx + dz * dz < r2 && Math.abs(u.y - p.y) < 8) { if (u.team === 0) ca++; else cb++; }
      }
      p.nA = ca; p.nB = cb;
      const d = ca - cb;
      if (d !== 0) {
        const team = d > 0 ? 0 : 1;
        if (this.eligible(team, i)) p.cap = clamp(p.cap + Math.sign(d) * Math.min(Math.abs(d), 5) * POINT_RATE * dt, -1, 1);
      }
      const prev = p.owner;
      if (p.owner === 0 && p.cap <= 0) p.owner = -1;
      else if (p.owner === 1 && p.cap >= 0) p.owner = -1;
      if (p.owner === -1) { if (p.cap >= 1) p.owner = 0; else if (p.cap <= -1) p.owner = 1; }
      if (p.owner !== prev) this.events.push({ t: 'cap', i, o: p.owner, prev });
    }
  }
  bleed(dt) {
    this.bleedT += dt;
    if (this.bleedT < BLEED_EVERY) return;
    this.bleedT = 0;
    const d = this.owned(0) - this.owned(1);
    if (d > 0) this.tickets[1] = Math.max(0, this.tickets[1] - d);
    else if (d < 0) this.tickets[0] = Math.max(0, this.tickets[0] + d);
  }
  checkEnd() {
    const end = (w, reason) => { this.winner = w; this.winReason = reason; this.events.push({ t: 'end', w, reason }); };
    if (this.pts[NPOINTS - 1].owner === 0) end(0, '적 본진 점령');
    else if (this.pts[0].owner === 1) end(1, '적 본진 점령');
    else if (this.tickets[0] <= 0 && this.tickets[1] <= 0) end(2, '병력 소진');
    else if (this.tickets[0] <= 0) end(1, '적 병력 소진');
    else if (this.tickets[1] <= 0) end(0, '적 병력 소진');
    else if (this.time >= MATCH_TIME) {
      const a = this.owned(0), b = this.owned(1);
      if (a !== b) end(a > b ? 0 : 1, '시간 종료 · 거점 우세');
      else if (this.tickets[0] !== this.tickets[1]) end(this.tickets[0] > this.tickets[1] ? 0 : 1, '시간 종료 · 병력 우세');
      else end(2, '시간 종료');
    }
  }

  // ---- 봇 AI ----
  objective(u) {
    const f = this.frontIndex(u.team);
    if (u.role === 1) return f;
    return u.team === 0 ? Math.min(f + 1, NPOINTS - 1) : Math.max(f - 1, 0);
  }
  botThink(u) {
    const o = this.objective(u);
    u.wpT -= 0.3;
    if (o !== u.obj || u.wpT <= 0) {
      u.obj = o;
      const a = this.rng.next() * Math.PI * 2, r = this.rng.range(1.5, 9);
      u.wp = { x: this.pts[o].x + Math.cos(a) * r, z: this.pts[o].z + Math.sin(a) * r };
      u.wpT = this.rng.range(6, 14);
    }
    if (Math.hypot(u.x - u.lastX, u.z - u.lastZ) < 0.5 && Math.hypot(u.moveX, u.moveY) > 0.1) {
      u.stuckT += 0.3;
      if (u.stuckT > 1.2) { u.avoid = -u.avoid; u.wpT = 0; u.stuckT = 0; }
    } else u.stuckT = 0;
    u.lastX = u.x; u.lastZ = u.z;
    const w = this.world;
    if (u.target >= 0) {
      const t = this.units[u.target];
      if (t.alive && Math.hypot(t.x - u.x, t.z - u.z) < 75 && w.los(u.x, u.y + EYE, u.z, t.x, t.y + 1.2, t.z)) return;
      u.target = -1;
    }
    const cand = [];
    for (const e of this.units) {
      if (!e.alive || e.team === u.team) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z);
      if (d < 60) cand.push([d, e]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(3, cand.length); k++) {
      const e = cand[k][1];
      if (w.los(u.x, u.y + EYE, u.z, e.x, e.y + 1.2, e.z)) { u.target = e.id; return; }
    }
  }
  botAi(u, dt) {
    u.thinkT -= dt;
    if (u.thinkT <= 0) { u.thinkT = 0.25 + this.rng.next() * 0.15; this.botThink(u); }
    u.jump = false; u.sprint = false;
    let tgt = null;
    if (u.target >= 0) { tgt = this.units[u.target]; if (!tgt.alive) { u.target = -1; tgt = null; } }
    if (tgt) {
      const dx = tgt.x - u.x, dz = tgt.z - u.z, dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dx, -dz);
      u.yaw = turn(u.yaw, want, 5.5 * dt);
      u.pitch = Math.atan2((tgt.y + 1.2) - (u.y + EYE), Math.max(dist, 1));
      u.strafeT -= dt;
      if (u.strafeT <= 0) { if (this.rng.next() < 0.6) u.strafe = -u.strafe; u.strafeT = this.rng.range(0.8, 2.2); }
      let fwd = 0;
      if (dist > 38) fwd = 1; else if (dist < 12) fwd = -0.5;
      u.moveX = u.strafe * 0.7; u.moveY = fwd; u.botSpeed = WALK;
      if (u.fireCd <= 0 && u.reloadT <= 0) {
        if (u.ammo <= 0) this.startReload(u);
        else if (Math.abs(wrapPi(want - u.yaw)) < 0.12) this.botFire(u, tgt, dist);
      }
    } else this.botNav(u, dt);
  }
  botNav(u, dt) {
    u.pitch += (0 - u.pitch) * Math.min(1, dt * 1.5);
    const tx = u.wp.x - u.x, tz = u.wp.z - u.z, dist = Math.hypot(tx, tz);
    if (dist < 2.5) {
      u.moveX = 0; u.moveY = 0; u.botSpeed = 0;
      u.yaw = turn(u.yaw, u.team === 1 ? Math.PI / 2 : -Math.PI / 2, 2 * dt);
      return;
    }
    let hd = Math.atan2(-tx, -tz);
    const w = this.world;
    const ahead = (h) => [u.x - Math.sin(h) * 1.1, u.z - Math.cos(h) * 1.1];
    let [lx, lz] = ahead(hd);
    const top = w.blocked(lx, lz, RADIUS, u.y);
    if (top > -1e8) {
      if (top - u.y < 1.05 && u.onGround) u.jump = true;
      else for (const a of [0.9, -0.9, 1.6, -1.6, 2.4, -2.4]) {
        const h2 = hd + a * u.avoid;
        [lx, lz] = ahead(h2);
        if (w.blocked(lx, lz, RADIUS, u.y) < -1e8) { hd = h2; break; }
      }
    }
    u.yaw = turn(u.yaw, hd, 8 * dt);
    u.moveX = 0; u.moveY = 1;
    u.botSpeed = dist > 25 ? SPRINT : WALK;
  }
  botFire(u, tgt, dist) {
    const w = WEAPONS[u.weapon];
    u.ammo--;
    u.fireCd = w.cd * w.botCd * this.rng.range(0.8, 1.3);
    const ex = u.x, ey = u.y + EYE, ez = u.z;
    const cx = tgt.x, cy = tgt.y + 1.2, cz = tgt.z;
    const moving = u.speedNow > 1.2;
    const p = w.botHit * clamp(1.3 - dist / (w.range * 0.5), 0.1, 1) * (moving ? 0.7 : 1);
    const hit = this.rng.next() < p && this.world.los(ex, ey, ez, cx, cy, cz);
    let bx = cx, by = cy, bz = cz;
    if (!hit) { bx += this.rng.range(-1.6, 1.6); by += this.rng.range(-1, 0.6); bz += this.rng.range(-1.6, 1.6); }
    const dx = bx - ex, dy = by - ey, dz = bz - ez, dl = Math.hypot(dx, dy, dz);
    this.events.push({ t: 'shot', id: u.id, team: u.team, a: { x: ex + dx / dl * 0.9, y: ey - 0.15 + dy / dl * 0.9, z: ez + dz / dl * 0.9 }, b: { x: bx, y: by, z: bz }, hit, weapon: u.weapon, surface: hit ? 'body' : 'world' });
    if (hit) this.damage(tgt, w.dmg * this.falloff(w, dist), u, false);
  }
}
