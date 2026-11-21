// 주민: 인도를 따라 걷고, 횡단보도를 건너고, 플레이어를 보면 손을 흔든다.
// 물리 강체 없이 직접 움직이며, 플레이어가 밀면 비켜나고 차에 치이면 날아갔다가 일어난다.
import { Character, randomLook } from './character.js';
import { rng, clamp, damp, angDiff } from './util.js';
const B = window.BABYLON;

// 블록을 한 바퀴 도는 인도(블록 터 가장자리에서 0.75m 바깥). 좌표는 mapdata의 도로 격자에서 나온다.
const E = 0.75;
const RINGS = [
  { x0: 18 - E, x1: 54 + E, z0: 18 - E, z1: 42 + E }, // A
  { x0: 66 - E, x1: 114 + E, z0: 18 - E, z1: 42 + E }, // B
  { x0: 18 - E, x1: 54 + E, z0: 54 - E, z1: 78 + E }, // C
  { x0: 66 - E, x1: 114 + E, z0: 54 - E, z1: 78 + E }, // D
];
// 횡단보도: 두 인도 고리를 잇는다.
const CROSSINGS = [
  { a: 0, b: 2, pa: [36, 42 + E], pb: [36, 54 - E] },
  { a: 1, b: 3, pa: [72, 42 + E], pb: [72, 54 - E] },
  { a: 1, b: 3, pa: [108, 42 + E], pb: [108, 54 - E] },
  { a: 0, b: 1, pa: [54 + E, 24], pb: [66 - E, 24] },
  { a: 2, b: 3, pa: [54 + E, 60], pb: [66 - E, 60] },
];
// 서서 쉬는 주민 자리: [x, z, 바라보는 방향]
const SPOTS = [[83.6, 68.6, -1.9], [72.5, 61, 0.6], [80.6, 60.4, -0.6], [74, -44, 3.0], [69, -45.5, 2.6], [80.5, -1.5, 3.3], [44, 3.5, 2.8], [100, 4, 3.1]];

const perim = (r) => 2 * (r.x1 - r.x0 + r.z1 - r.z0);
function ringPoint(r, s) {
  const w = r.x1 - r.x0, h = r.z1 - r.z0, P = 2 * (w + h);
  s = ((s % P) + P) % P;
  if (s < w) return [r.x0 + s, r.z0];
  if (s < w + h) return [r.x1, r.z0 + (s - w)];
  if (s < 2 * w + h) return [r.x1 - (s - w - h), r.z1];
  return [r.x0, r.z1 - (s - 2 * w - h)];
}
function ringS(r, x, z) {
  const w = r.x1 - r.x0, h = r.z1 - r.z0;
  const d = [Math.abs(z - r.z0), Math.abs(x - r.x1), Math.abs(z - r.z1), Math.abs(x - r.x0)];
  const i = d.indexOf(Math.min(...d));
  if (i === 0) return clamp(x - r.x0, 0, w);
  if (i === 1) return w + clamp(z - r.z0, 0, h);
  if (i === 2) return w + h + clamp(r.x1 - x, 0, w);
  return 2 * w + h + clamp(r.z1 - z, 0, h);
}

export class Residents {
  constructor(scene, groundY, walkers = 16) {
    this.groundY = groundY;
    this.list = [];
    this.meshes = [];
    const r = rng(31337);
    for (let i = 0; i < walkers; i++) {
      const chr = new Character(scene, randomLook(1000 + i * 7));
      const ring = i % RINGS.length;
      const n = { chr, mode: 'walk', ring, s: r() * perim(RINGS[ring]), dir: r() < 0.5 ? 1 : -1, speed: r.range(1.5, 2.4), pause: 0, cool: r.range(2, 8),
        pos: new B.Vector3(), vel: new B.Vector3(), vy: 0, lie: 0, t: 0, r: rng(500 + i) };
      const [x, z] = ringPoint(RINGS[ring], n.s);
      n.pos.set(x, groundY(x, z), z);
      chr.heading = r() * 6.28;
      this.list.push(n);
      this.meshes.push(...chr.meshes);
    }
    SPOTS.forEach(([x, z, yaw], i) => {
      const chr = new Character(scene, randomLook(4000 + i * 13));
      chr.heading = yaw;
      const n = { chr, mode: 'stand', home: [x, z, yaw], pos: new B.Vector3(x, groundY(x, z), z), vel: new B.Vector3(), vy: 0, lie: 0, t: r() * 5, look: 0, r: rng(900 + i) };
      this.list.push(n);
      this.meshes.push(...chr.meshes);
    });
  }

  // player: { pos, vel, active }  cars: Vehicle 배열
  update(dt, player, cars) {
    for (const n of this.list) {
      const chr = n.chr, p = n.pos;
      let wish = null, landed = 0, lookYaw = 0, grounded = true;
      // --- 차에 치였는지 ---
      if (n.mode !== 'fly' && n.mode !== 'down') {
        for (const c of cars) {
          const dx = p.x - c.pos.x, dz = p.z - c.pos.z;
          if (Math.abs(dx) > 6 || Math.abs(dz) > 6 || Math.abs(p.y - c.pos.y) > 2.5) continue;
          const lx = dx * c.right.x + dz * c.right.z, lz = dx * c.fwd.x + dz * c.fwd.z - c.zc;
          if (Math.abs(lx) > c.width / 2 + 0.38 || Math.abs(lz) > c.length / 2 + 0.38) continue;
          const cv = c.body.getLinearVelocity(), sp = Math.hypot(cv.x, cv.z);
          if (sp > 3) {
            // 날아간다
            n.back = n.mode === 'stand' ? 'stand' : 'walk';
            n.mode = 'fly';
            const side = Math.sign(lx) || 1;
            n.vel.set(cv.x * 1.15 + c.right.x * side * 2.5, 0, cv.z * 1.15 + c.right.z * side * 2.5);
            n.vy = 5 + sp * 0.45;
            n.spin = (n.r() - 0.5) * 14;
            chr.bump(cv.x, cv.z, 2);
          } else {
            // 천천히 미는 차에서는 옆으로 비켜선다
            const side = Math.sign(lx) || 1;
            p.x += c.right.x * side * 3 * dt; p.z += c.right.z * side * 3 * dt;
          }
          break;
        }
      }
      const pdx = player.pos.x - p.x, pdz = player.pos.z - p.z, pd = Math.hypot(pdx, pdz);
      const near = player.active && pd < 4.5 && Math.abs(player.pos.y - p.y) < 2;

      if (n.mode === 'fly') {
        n.vy -= 24 * dt;
        p.x += n.vel.x * dt; p.z += n.vel.z * dt; p.y += n.vy * dt;
        n.lie += n.spin * dt;
        grounded = false;
        const gy = this.groundY(p.x, p.z);
        if (p.y <= gy && n.vy < 0) {
          p.y = gy; landed = -n.vy; n.mode = 'down'; n.t = 1.4 + n.r() * 1.2; n.vel.set(0, 0, 0);
          n.lie = Math.PI / 2 * (n.r() < 0.5 ? 1 : -1);
        }
      } else if (n.mode === 'down') {
        n.t -= dt;
        if (n.t < 0.45) n.lie = damp(n.lie, 0, 12, dt); // 벌떡 일어난다
        if (n.t <= 0) {
          n.lie = 0;
          n.mode = n.back;
          if (n.back === 'walk') { // 가장 가까운 인도로 돌아간다
            let best = 0, bd = 1e9;
            RINGS.forEach((r, i) => { const [x, z] = ringPoint(r, ringS(r, p.x, p.z)); const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = i; } });
            n.ring = best; n.s = ringS(RINGS[best], p.x, p.z); n.mode = 'return';
          } else n.mode = 'return';
        }
      } else if (n.mode === 'return') {
        const [tx, tz] = n.back === 'stand' ? n.home : ringPoint(RINGS[n.ring], n.s);
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.25) n.mode = n.back;
        else { const sp = 2.6; n.vel.set((dx / d) * sp, 0, (dz / d) * sp); p.x += n.vel.x * dt; p.z += n.vel.z * dt; wish = Math.atan2(dx, dz); }
        p.y = this.groundY(p.x, p.z);
      } else if (n.mode === 'stand') {
        n.t += dt;
        n.vel.set(0, 0, 0);
        const d = Math.hypot(n.home[0] - p.x, n.home[1] - p.z);
        if (d > 0.6 && !near) { n.back = 'stand'; n.mode = 'return'; }
        wish = near ? Math.atan2(pdx, pdz) : n.home[2] + Math.sin(n.t * 0.35) * 0.5;
        p.y = this.groundY(p.x, p.z);
      } else if (n.mode === 'cross') {
        const [tx, tz] = n.to;
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.15) { n.mode = 'walk'; n.ring = n.toRing; n.s = ringS(RINGS[n.ring], tx, tz); n.cool = 10 + n.r() * 10; }
        else { n.vel.set((dx / d) * n.speed, 0, (dz / d) * n.speed); p.x += n.vel.x * dt; p.z += n.vel.z * dt; wish = Math.atan2(dx, dz); }
        p.y = this.groundY(p.x, p.z);
      } else { // walk
        n.cool -= dt;
        if (n.pause > 0) {
          n.pause -= dt;
          n.vel.set(0, 0, 0);
          if (near) wish = Math.atan2(pdx, pdz);
        } else if (near && pd < 2.2) {
          n.pause = 1.2; // 플레이어가 바로 앞에 있으면 멈춰서 인사한다
        } else {
          const ring = RINGS[n.ring];
          n.s += n.dir * n.speed * dt;
          const [x, z] = ringPoint(ring, n.s);
          const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
          n.vel.set((dx / d) * n.speed, 0, (dz / d) * n.speed);
          p.x = damp(p.x, x, 10, dt); p.z = damp(p.z, z, 10, dt);
          wish = Math.atan2(dx, dz);
          if (n.r() < dt * 0.05) n.pause = 1.5 + n.r() * 3;
          if (n.r() < dt * 0.02) n.dir *= -1;
          if (n.cool <= 0) {
            for (const c of CROSSINGS) {
              const mine = c.a === n.ring ? c.pa : c.b === n.ring ? c.pb : null;
              if (!mine || Math.hypot(mine[0] - p.x, mine[1] - p.z) > 0.5) continue;
              if (n.r() < 0.6) { n.mode = 'cross'; n.to = c.a === n.ring ? c.pb : c.pa; n.toRing = c.a === n.ring ? c.b : c.a; }
              else n.cool = 4;
              break;
            }
          }
        }
        p.y = this.groundY(p.x, p.z);
      }

      // --- 플레이어와 겹치면 밀려난다 ---
      if (player.active && pd < 0.85 && n.mode !== 'fly' && n.mode !== 'down' && Math.abs(player.pos.y - p.y) < 1.6) {
        const k = (0.85 - pd) / (pd || 1);
        p.x -= pdx * k; p.z -= pdz * k;
        const pv = Math.hypot(player.vel.x, player.vel.z);
        if (pv > 2 && !n.bumped) { chr.bump(-pdx / (pd || 1), -pdz / (pd || 1), clamp(pv / 5, 0.5, 2)); n.bumped = 0.5; }
      }
      n.bumped = Math.max(0, (n.bumped || 0) - dt);

      // 가까이 오면 고개를 돌려 보고 손을 흔든다
      if (near && n.mode !== 'fly' && n.mode !== 'down') {
        lookYaw = clamp(angDiff(chr.heading, Math.atan2(pdx, pdz)), -1.1, 1.1);
        chr.wave = damp(chr.wave, pd < 3.6 ? 1 : 0, 8, dt);
      } else chr.wave = damp(chr.wave, 0, 8, dt);
      n.look = damp(n.look || 0, lookYaw, 6, dt);

      chr.update(dt, { pos: p, vel: n.vel, grounded, wishHeading: wish, landed, jumped: false, lie: n.lie, lookYaw: n.look });
    }
  }
}
