// 주민: 인도를 따라 걷고, 횡단보도를 건너고, 플레이어를 보면 손을 흔든다.
// 물리 강체 없이 직접 움직이며, 플레이어가 밀면 비켜나고 차에 치이면 날아갔다가 일어난다.
import { Character, randomLook } from './character.js';
import { rng, clamp, damp, angDiff } from './util.js';
import { CITY } from './world.js';
const B = window.BABYLON;

// 블록을 한 바퀴 도는 인도(블록 터 가장자리에서 0.75m 바깥). 좌표는 mapdata의 도로 격자에서 나온다.
const E = 0.75;
export const RINGS = [
  { x0: 18 - E, x1: 54 + E, z0: 18 - E, z1: 42 + E }, // A
  { x0: 66 - E, x1: 114 + E, z0: 18 - E, z1: 42 + E }, // B
  { x0: 18 - E, x1: 54 + E, z0: 54 - E, z1: 78 + E }, // C
  { x0: 66 - E, x1: 114 + E, z0: 54 - E, z1: 78 + E }, // D
];
// 시가지: 길로 둘러싸인 블록마다 보도를 한 바퀴 도는 고리를 하나씩 둔다(보도는 길 가운데에서 7.9m).
const TOWN_RINGS = RINGS.length;
for (const c of CITY) {
  const o = c.offsets;
  for (let i = 0; i < o.length - 1; i++) for (let j = 0; j < o.length - 1; j++) {
    const r = { x0: c.x + o[i] + 7.9, x1: c.x + o[i + 1] - 7.9, z0: c.z + o[j] + 7.9, z1: c.z + o[j + 1] - 7.9 };
    if ([[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].every(([x, z]) => Math.hypot(x - c.x, z - c.z) < c.r - 8)) RINGS.push(r);
  }
}
// 횡단보도: 두 인도 고리를 잇는다.
const CROSSINGS = [
  { a: 0, b: 2, pa: [36, 42 + E], pb: [36, 54 - E] },
  { a: 1, b: 3, pa: [72, 42 + E], pb: [72, 54 - E] },
  { a: 1, b: 3, pa: [108, 42 + E], pb: [108, 54 - E] },
  { a: 0, b: 1, pa: [54 + E, 24], pb: [66 - E, 24] },
  { a: 2, b: 3, pa: [54 + E, 60], pb: [66 - E, 60] },
];
// 서서 쉬는 주민 자리: [x, z, 바라보는 방향]
const SPOTS = [[83.6, 68.6, -1.9], [72.5, 61, 0.6], [80.6, 60.4, -0.6], [74, -44, 3.0], [69, -45.5, 2.6], [88, 3.6, 3.3], [44, 3.5, 2.8], [100, 4, 3.1]];

const perim = (r) => 2 * (r.x1 - r.x0 + r.z1 - r.z0);
export function ringPoint(r, s) {
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

// 불량배와 경찰관은 옷차림으로 구분된다.
const THUG = { pants: '#18161f', shoes: '#18161f' };
// 체력: 불량배와 경찰관은 더 튼튼하다.
const MAXHP = { citizen: 160, thug: 280, cop: 230 };
const SCALE = { citizen: 1, thug: 1.22, cop: 1.05 };
const COP = { shirt: '#2f4fa8', pants: '#1f2a4a', shoes: '#22202b', head: 'police', hat: '#1f2a4a', brim: '#ffd84a', face: 'none', neck: 'badge', back: 'none' };
// 불량배는 공통으로 험상궂은 얼굴(찌푸린 눈썹, 흉터)이고, 머리·얼굴·옷·팔을 섞어서 저마다 다르게 만든다.
const PUNK = ['#e0261c', '#3fc16a', '#ff5fa2', '#ffd84a', '#4f9bea'];
function thugLook(base, seed) {
  const r = rng(seed * 31 + 7), head = r.pick(['beanie', 'beanie', 'mohawk', 'spiky', 'headband', 'capback']);
  const neck = r.pick(['leathervest', 'thugchain', 'skullshirt', 'none']);
  return { ...base, ...THUG, grim: true, head, hat: head === 'mohawk' || head === 'spiky' || head === 'headband' ? r.pick(PUNK) : '#18161f', brim: r.pick(['#e0261c', '#e0261c', '#f2f2f2']),
    face: r.pick(['thugA', 'thugB', 'thugC', 'thugD']), neck, arm: r.pick(['wraps', 'ripped', 'none']), back: 'none', shirt: neck === 'skullshirt' ? '#1c1c22' : r.pick(['#e0261c', '#e0261c', '#2a2a33']) };
}
export function lookFor(kind, seed) {
  const base = randomLook(seed);
  return kind === 'thug' ? thugLook(base, seed) : kind === 'cop' ? { ...base, ...COP } : base;
}

export class Residents {
  // 종류에 맞는 체력과 덩치를 준다. 불량배는 머리 위에 빨간 표식이 떠 있어 멀리서도 보인다.
  setup(n, scene) {
    n.hp = MAXHP[n.kind]; n.scale = SCALE[n.kind];
    n.chr.root.scaling.setAll(n.scale);
    if (n.kind !== 'thug') return;
    if (!this.markMat) { this.markMat = new B.StandardMaterial('thugMark', scene); this.markMat.emissiveColor = new B.Color3(1, 0.16, 0.1); this.markMat.disableLighting = true; }
    const m = B.MeshBuilder.CreatePolyhedron('thugMark', { type: 1, size: 0.17 }, scene);
    m.material = this.markMat; m.parent = n.chr.root; m.position.y = 2.25; m.scaling.y = 1.5; m.isPickable = false;
    n.mark = m;
  }
  constructor(scene, groundY, walkers = 16) {
    const townN = Math.min(walkers, 16); // 항구 마을에 16명, 나머지는 시가지 블록에
    this.groundY = groundY;
    this.list = [];
    this.meshes = [];
    const r = rng(31337);
    for (let i = 0; i < walkers; i++) {
      const kind = [2, 6, 9, 13, 17, 20, 22, 27, 33, 39].includes(i) ? 'thug' : i === 5 || i === 12 || i === 14 || i === 30 || i === 41 ? 'cop' : 'citizen';
      const chr = new Character(scene, lookFor(kind, 1000 + i * 7));
      // 불량배는 켤 때마다 다른 곳에서 어슬렁거린다.
      const ring = kind === 'thug' ? Math.floor(Math.random() * RINGS.length) : i < townN ? i % TOWN_RINGS : TOWN_RINGS + ((i - townN) * 5) % Math.max(1, RINGS.length - TOWN_RINGS);
      const n = { chr, kind, mode: 'walk', ring, s: (kind === 'thug' ? Math.random() : r()) * perim(RINGS[ring]), dir: r() < 0.5 ? 1 : -1, speed: r.range(1.5, 2.4), pause: 0, cool: r.range(2, 8),
        pos: new B.Vector3(), vel: new B.Vector3(), vy: 0, lie: 0, t: 0, r: rng(500 + i) };
      const [x, z] = ringPoint(RINGS[ring], n.s);
      n.pos.set(x, groundY(x, z), z);
      chr.heading = r() * 6.28;
      this.setup(n, scene);
      this.list.push(n);
      this.meshes.push(...chr.meshes);
    }
    SPOTS.forEach(([x, z, yaw], i) => {
      if (i >= 5) return; // 부두 구석 자리는 소품과 겹쳐서 쓰지 않는다
      const kind = 'citizen';
      const chr = new Character(scene, lookFor(kind, 4000 + i * 13));
      chr.heading = yaw;
      const n = { chr, kind, mode: 'stand', home: [x, z, yaw], pos: new B.Vector3(x, groundY(x, z), z), vel: new B.Vector3(), vy: 0, lie: 0, t: r() * 5, look: 0, r: rng(900 + i) };
      this.setup(n, scene);
      this.list.push(n);
      this.meshes.push(...chr.meshes);
    });
  }

  // ----- 공격 받기 -----
  alive(n) { return n.mode !== 'sky'; }
  // 피해를 준다. (dx, dz)는 맞은 방향. 체력이 다하면 하늘로 날아간다.
  damage(n, amount, dx = 0, dz = 0) {
    if (n.mode === 'sky') return false;
    n.hp -= amount;
    const l = Math.hypot(dx, dz) || 1;
    n.chr.bump(dx / l, dz / l, 2);
    if (n.hp <= 0) { this.launch(n, dx / l, dz / l); return true; }
    // 아직 버틸 만하면 뒤로 밀리고 달아난다.
    n.pos.x += (dx / l) * 0.3; n.pos.z += (dz / l) * 0.3;
    // 불량배와 경찰관은 달아나지 않고 덤빈다.
    if (n.mode !== 'fly' && n.mode !== 'down') { n.mode = n.kind === 'citizen' ? 'flee' : 'fight'; n.t = n.kind === 'citizen' ? 3.8 : n.kind === 'thug' ? 40 : 14; n.stagger = n.kind === 'thug' ? 0.4 : 0.75; }
    if (n.kind === 'thug') this.rally(n);
    return false;
  }
  // 불량배가 맞으면 근처 패거리도 함께 덤빈다.
  rally(n) {
    for (const o of this.list) {
      if (o === n || o.kind !== 'thug' || Math.hypot(o.pos.x - n.pos.x, o.pos.z - n.pos.z) > 32) continue;
      if (o.mode === 'walk' || o.mode === 'stand' || o.mode === 'cross' || o.mode === 'return') { o.mode = 'fight'; o.t = 40; o.stagger = 0; }
    }
  }
  launch(n, dx = 0, dz = 0) {
    if (n.mode === 'sky') return;
    n.mode = 'sky'; n.t = 0; n.vy = 15; n.gone = false; n.hp = 0;
    if (this.onDefeat) this.onDefeat(n);
    n.vel.set(dx * 5, 0, dz * 5);
    n.chr.wave = 0;
  }
  // 총소리에 놀라 달아나게 한다.
  scare(x, z, radius) {
    for (const n of this.list) {
      if (n.mode === 'walk' || n.mode === 'stand' || n.mode === 'cross' || n.mode === 'return') {
        if (Math.hypot(n.pos.x - x, n.pos.z - z) < radius) { n.mode = 'flee'; n.t = 2.5 + n.r() * 2; }
      }
    }
  }
  // 광선(o + d*t)에 가장 먼저 맞는 주민. 몸통을 구 하나로 본다.
  rayHit(o, d, maxT) {
    let best = null, bt = maxT;
    for (const n of this.list) {
      if (n.mode === 'sky') continue;
      const cx = n.pos.x - o.x, cy = n.pos.y + 1.0 - o.y, cz = n.pos.z - o.z;
      const t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > bt) continue;
      const ex = cx - d.x * t, ey = cy - d.y * t, ez = cz - d.z * t;
      if (ex * ex + ey * ey + ez * ez < 0.8 * 0.8) { bt = t; best = n; }
    }
    return best ? { n: best, t: bt } : null;
  }

  // player: { pos, vel, active }  cars: Vehicle 배열
  update(dt, player, cars) {
    for (const n of this.list) {
      const chr = n.chr, p = n.pos;
      let wish = null, landed = 0, lookYaw = 0, grounded = true;
      // --- 차에 치였는지 ---
      if (n.mode !== 'fly' && n.mode !== 'down' && n.mode !== 'sky') {
        for (const c of cars) {
          const dx = p.x - c.pos.x, dz = p.z - c.pos.z;
          if (Math.abs(dx) > 6 || Math.abs(dz) > 6 || Math.abs(p.y - c.pos.y) > 2.5) continue;
          const lx = dx * c.right.x + dz * c.right.z, lz = dx * c.fwd.x + dz * c.fwd.z - c.zc;
          if (Math.abs(lx) > c.width / 2 + 0.38 || Math.abs(lz) > c.length / 2 + 0.38) continue;
          const cv = c.body.getLinearVelocity(), sp = Math.hypot(cv.x, cv.z);
          if (sp > 3) {
            if (this.onCarHit) this.onCarHit(c, n);
            // 날아간다
            n.back = n.mode === 'stand' ? 'stand' : 'walk';
            n.mode = 'fly';
            const side = Math.sign(lx) || 1;
            n.vel.set(cv.x * 0.75 + c.right.x * side * 2, 0, cv.z * 0.75 + c.right.z * side * 2);
            n.vy = 4 + sp * 0.22;
            // 차에 치이면 체력도 깎인다. 다 닳으면 그대로 날아가 버린다.
            n.hp -= 35 + sp * 10;
            n.grudge = n.kind === 'thug' && c === player.car; // 불량배는 일어나서 쫓아온다
            if (n.grudge) this.rally(n);
            if (n.hp <= 0) { n.mode = n.back; this.launch(n, cv.x / sp, cv.z / sp); }
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
      const pdx0 = pdx, pdz0 = pdz, pd0 = pd;
      const near = player.active && pd < 4.5 && Math.abs(player.pos.y - p.y) < 2;

      if (n.mode === 'sky') {
        // 체력이 다하면 하늘로 뿅 날아가 별이 되고, 잠시 뒤 제자리에 다시 나타난다.
        n.t += dt;
        grounded = false;
        if (n.t < 1.5) {
          n.vy -= 13 * dt; // 적당히 떠올랐다가 별이 된다
          p.y += n.vy * dt; p.x += n.vel.x * dt; p.z += n.vel.z * dt;
          n.lie += 8 * dt;
          chr.root.scaling.setAll(n.scale * Math.max(0.08, 1 - Math.max(0, n.t - 0.5) / 1.0));
        } else if (!n.gone) {
          n.gone = true;
          chr.setVisible(false);
          if (this.onStar) this.onStar(p.x, p.y, p.z);
        } else if (n.t > 8) {
          if (n.kind === 'thug') { n.ring = Math.floor(Math.random() * RINGS.length); n.s = Math.random() * perim(RINGS[n.ring]); } // 불량배는 다른 곳에 다시 나타난다
          const [x, z] = n.home ? n.home : ringPoint(RINGS[n.ring], n.s);
          p.set(x, this.groundY(x, z), z);
          n.vel.set(0, 0, 0); n.lie = 0; n.hp = MAXHP[n.kind]; n.gone = false; n.vy = 0;
          chr.root.scaling.setAll(n.scale); chr.setVisible(true); chr.sSquash.v += 4; // 뿅 하고 돌아온다
          n.mode = n.home ? 'stand' : 'walk';
        }
      } else if (n.mode === 'fight') {
        // 쫓아와서 주먹을 날린다.
        n.t -= dt;
        if (n.stagger > 0) n.stagger -= dt;
        n.hitT = (n.hitT || 0) - dt;
        const thug = n.kind === 'thug', chase = player.active || (thug && !!player.car), reach = player.car ? 3.1 : 1.9;
        const d = pd0 || 1, sp = n.stagger > 0 || d < reach - 0.5 ? 0 : thug ? 6.2 : 5.6;
        n.vel.set((pdx0 / d) * sp, 0, (pdz0 / d) * sp);
        const nx = p.x + n.vel.x * dt, nz = p.z + n.vel.z * dt, gy = this.groundY(nx, nz);
        if (gy > -1.2) { p.x = nx; p.z = nz; p.y = gy; }
        wish = Math.atan2(pdx0, pdz0);
        if (chase && d < reach && n.hitT <= 0 && n.stagger <= 0 && Math.abs(player.pos.y - p.y) < 2.5) { n.hitT = thug ? 1.05 : 0.95; chr.swing = 1; chr.swingTime = 0.3; if (player.car) { if (this.onPunchCar) this.onPunchCar(n, player.car); } else if (this.onPunch) this.onPunch(n, pdx0 / d, pdz0 / d); }
        if (n.t <= 0 || d > (thug ? 70 : 45) || !chase || (n.kind === 'cop' && !player.wanted && n.t < 8)) { n.back = n.home ? 'stand' : 'walk'; if (!n.home) { let best = 0, bd = 1e9; RINGS.forEach((r, i) => { const [x, z] = ringPoint(r, ringS(r, p.x, p.z)); const dd = Math.hypot(x - p.x, z - p.z); if (dd < bd) { bd = dd; best = i; } }); n.ring = best; n.s = ringS(RINGS[best], p.x, p.z); } n.mode = 'return'; }
      } else if (n.mode === 'flee') {
        // 놀라서 플레이어 반대쪽으로 달아난다.
        n.t -= dt;
        if (n.stagger > 0) n.stagger -= dt; // 맞은 직후에는 잠깐 비틀거린다
        const d = pd0 || 1, sp = n.stagger > 0 ? 0 : 5.2;
        n.vel.set((-pdx0 / d) * sp, 0, (-pdz0 / d) * sp);
        const nx = p.x + n.vel.x * dt, nz = p.z + n.vel.z * dt, gy = this.groundY(nx, nz);
        if (gy > -1.2) { p.x = nx; p.z = nz; p.y = gy; } else n.vel.set(0, 0, 0); // 물가에서는 멈춘다
        wish = Math.atan2(-pdx0, -pdz0);
        chr.wave = 0;
        if (n.t <= 0) { n.back = n.home ? 'stand' : 'walk'; if (!n.home) { let best = 0, bd = 1e9; RINGS.forEach((r, i) => { const [x, z] = ringPoint(r, ringS(r, p.x, p.z)); const dd = Math.hypot(x - p.x, z - p.z); if (dd < bd) { bd = dd; best = i; } }); n.ring = best; n.s = ringS(RINGS[best], p.x, p.z); } n.mode = 'return'; }
      } else if (n.mode === 'fly') {
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
          if (n.grudge) { n.grudge = false; n.mode = 'fight'; n.t = 40; n.stagger = 0; }
          else if (n.back === 'walk') { // 가장 가까운 인도로 돌아간다
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
        // 불량배는 플레이어가 6m 안에 오면 걸음을 멈추고 마주 선다(주먹을 쥐어 보이는 게 잘 보이게).
        if (n.kind === 'thug' && player.active && pd < 6 && Math.abs(player.pos.y - p.y) < 2) { n.pause = Math.max(n.pause, 0.4); wish = Math.atan2(pdx, pdz); }
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
      if (player.active && pd < 0.85 && n.mode !== 'fly' && n.mode !== 'down' && n.mode !== 'sky' && Math.abs(player.pos.y - p.y) < 1.6) {
        const k = (0.85 - pd) / (pd || 1);
        p.x -= pdx * k; p.z -= pdz * k;
        const pv = Math.hypot(player.vel.x, player.vel.z);
        if (pv > 2 && !n.bumped) { chr.bump(-pdx / (pd || 1), -pdz / (pd || 1), clamp(pv / 5, 0.5, 2)); n.bumped = 0.5; }
      }
      n.bumped = Math.max(0, (n.bumped || 0) - dt);

      // 가까이 오면 고개를 돌려 보고 손을 흔든다
      // 수배 중이면 근처 경찰관이 달려든다.
      if (n.kind === 'cop' && player.wanted && player.active && pd < 28 && (n.mode === 'walk' || n.mode === 'stand' || n.mode === 'cross' || n.mode === 'return')) { n.mode = 'fight'; n.t = 14; }
      const menace = n.kind === 'thug' && player.active && pd < 6.5 && Math.abs(player.pos.y - p.y) < 2; // 불량배는 주민보다 멀리서부터 으름장을 놓는다
      if ((near || menace) && n.mode !== 'fly' && n.mode !== 'down' && n.mode !== 'sky' && n.mode !== 'flee' && n.mode !== 'fight') {
        lookYaw = clamp(angDiff(chr.heading, Math.atan2(pdx, pdz)), -1.1, 1.1);
        // 주민은 손을 흔들고, 불량배는 인사 대신 주먹을 쥐어 보인다.
        if (n.kind === 'thug') { chr.wave = 0; chr.fist = 1; } else chr.wave = damp(chr.wave, pd < 3.6 ? 1 : 0, 8, dt);
      } else { chr.wave = damp(chr.wave, 0, 8, dt); chr.fist = 0; }
      n.look = damp(n.look || 0, lookYaw, 6, dt);

      if (n.mark) { n.mark.rotation.y += dt * 2.5; n.mark.position.y = 2.25 + Math.sin(n.mark.rotation.y * 1.3) * 0.07; }
      chr.update(dt, { pos: p, vel: n.vel, grounded, wishHeading: wish, landed, jumped: false, lie: n.lie, lookYaw: n.look });
    }
  }
}
