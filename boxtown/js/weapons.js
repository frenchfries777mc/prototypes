// 무기: 주먹, 방망이, 권총, 기관단총, 로켓 발사기.
// 주민은 체력이 다하면 하늘로 날아가 별이 되고(잠시 뒤 돌아온다), 차는 연기 → 불길 → 폭발 순서로 망가진다. 피는 없다.
import { stats } from './stats.js';
import { spark } from './jobs.js';
import { flatMat, clamp, damp } from './util.js';
import { SEA } from './terrain.js';
const B = window.BABYLON;

export const WEAPONS = [
  { id: 'fist', name: '주먹', melee: true, range: 2.1, arc: 0.5, dmg: 34, carDmg: 4, cd: 0.36, push: 4 },
  { id: 'bat', name: '방망이', melee: true, range: 2.7, arc: 0.35, dmg: 60, carDmg: 14, cd: 0.55, push: 9 },
  { id: 'pistol', name: '권총', dmg: 50, carDmg: 14, cd: 0.3, spread: 0.004, range: 170 },
  { id: 'smg', name: '기관단총', dmg: 22, carDmg: 6, cd: 0.085, spread: 0.02, range: 130, auto: true },
  { id: 'rifle', name: '돌격소총', dmg: 34, carDmg: 11, cd: 0.11, spread: 0.009, range: 210, auto: true },
  { id: 'shotgun', name: '산탄총', dmg: 26, carDmg: 7, cd: 0.85, spread: 0.07, range: 70, pellets: 8 },
  { id: 'sniper', name: '저격소총', dmg: 140, carDmg: 34, cd: 1.15, spread: 0.0006, range: 420 },
  { id: 'rocket', name: '로켓 발사기', cd: 1.3, rocket: true, range: 260 },
];

// 소리는 파일 없이 그 자리에서 합성한다.
class Sfx {
  ensure() {
    if (this.ctx || this.off) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const n = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.off = true; }
  }
  tone(f0, f1, dur, vol, type = 'sine') {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  hiss(freq, dur, vol, type = 'bandpass') {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
    s.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  play(kind) {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (kind === 'shot') { this.hiss(1700, 0.11, 0.3); this.tone(220, 70, 0.08, 0.25, 'square'); }
    else if (kind === 'boom') { this.hiss(260, 0.9, 0.9, 'lowpass'); this.tone(90, 30, 0.6, 0.7); }
    else if (kind === 'hit') { this.tone(190, 70, 0.09, 0.5); this.hiss(700, 0.05, 0.2); }
    else if (kind === 'swing') this.hiss(900, 0.12, 0.12);
    else if (kind === 'pop') this.tone(420, 1900, 0.3, 0.28);
    else if (kind === 'launch') { this.hiss(500, 0.5, 0.35, 'lowpass'); this.tone(300, 120, 0.4, 0.15, 'sawtooth'); }
    else if (kind === 'clank') { this.tone(900, 300, 0.05, 0.2, 'square'); this.hiss(2500, 0.04, 0.15); }
  }
}

export class Weapons {
  constructor({ scene, player, garage, residents, dynamics, addShadow }) {
    Object.assign(this, { scene, player, garage, residents, dynamics });
    this.sfx = new Sfx();
    this.cur = 0; this.cd = 0; this.queue = 0;
    this.ray = new B.PhysicsRaycastResult();
    this.rockets = []; this.carFx = new Map(); this.bursts = [];
    this.byBody = new Map(garage.cars.map((c) => [c.body, c]));
    this.dynByBody = new Map(dynamics.map((d) => [d.agg.body, d]));

    // ----- 손에 드는 무기 모양(상자로 조립) -----
    const hand = player.chr.armR, M = (hex, o) => flatMat('wp_' + hex, hex, scene, o);
    const part = (parent, w, h, d, x, y, z, m) => { const b = B.MeshBuilder.CreateBox('wpPart', { width: w, height: h, depth: d }, scene); b.parent = parent; b.position.set(x, y, z); b.material = m; b.isPickable = false; addShadow([b]); return b; };
    const node = () => { const n = new B.TransformNode('weapon', scene); n.parent = hand; n.position.set(0, -0.4, 0.04); return n; };
    this.models = {};
    { const n = node(); n.rotation.x = -2.0; part(n, 0.11, 0.3, 0.11, 0, -0.1, 0, M('#3a3d4d')); part(n, 0.14, 0.8, 0.14, 0, -0.62, 0, M('#c79a5b')); this.models.bat = n; }
    { const n = node(); part(n, 0.1, 0.44, 0.17, 0, -0.16, 0.1, M('#2a2c36')); part(n, 0.08, 0.2, 0.1, 0, -0.02, -0.03, M('#5a4636')); this.models.pistol = n; }
    { const n = node(); part(n, 0.11, 0.74, 0.18, 0, -0.26, 0.1, M('#2a2c36')); part(n, 0.08, 0.14, 0.3, 0, -0.3, -0.12, M('#3a3d4d')); part(n, 0.09, 0.26, 0.12, 0, 0.14, 0.08, M('#5a4636')); this.models.smg = n; }
    { const n = node(); part(n, 0.11, 1.05, 0.18, 0, -0.42, 0.1, M('#3a3d4d')); part(n, 0.08, 0.16, 0.34, 0, -0.34, -0.14, M('#2a2c36')); part(n, 0.1, 0.4, 0.16, 0, 0.2, 0.06, M('#8b5d3a')); part(n, 0.06, 0.3, 0.06, 0, -1.05, 0.1, M('#2a2c36')); this.models.rifle = n; }
    { const n = node(); part(n, 0.1, 1.0, 0.16, 0, -0.42, 0.1, M('#2a2c36')); part(n, 0.12, 0.34, 0.2, 0, 0.1, 0.08, M('#8b5d3a')); part(n, 0.13, 0.3, 0.2, 0, -0.5, 0.0, M('#5a4636')); this.models.shotgun = n; }
    { const n = node(); part(n, 0.09, 1.3, 0.14, 0, -0.52, 0.1, M('#2f3a2a')); part(n, 0.1, 0.5, 0.18, 0, 0.18, 0.06, M('#3a3d4d')); part(n, 0.14, 0.34, 0.14, 0, -0.4, 0.28, M('#22202b')); part(n, 0.06, 0.2, 0.06, 0, -1.2, 0.1, M('#22202b')); this.models.sniper = n; }
    { const n = node(); part(n, 0.27, 1.5, 0.27, 0, -0.12, 0.26, M('#55693f')); part(n, 0.33, 0.16, 0.33, 0, -0.9, 0.26, M('#3a3d4d')); part(n, 0.2, 0.3, 0.2, 0, -1.02, 0.26, M('#d9473c')); this.models.rocket = n; }
    this.muzzle = { pistol: 0.45, smg: 0.75, rifle: 1.15, shotgun: 1.0, sniper: 1.45, rocket: 1.25 };

    // ----- 입자 효과: 한 번에 터뜨리는 것들은 넷으로 나눠 재사용한다 -----
    const burst = (name, cap, setup) => { const p = new B.ParticleSystem(name, cap, scene); p.particleTexture = spark(scene); p.emitter = new B.Vector3(0, -100, 0); p.emitRate = 0; p.manualEmitCount = 0; p.updateSpeed = 0.016; setup(p); p.start(); return p; };
    this.fx = {
      boom: burst('fxBoom', 500, (p) => { p.color1 = new B.Color4(1, 0.8, 0.3, 1); p.color2 = new B.Color4(1, 0.4, 0.1, 1); p.colorDead = new B.Color4(0.3, 0.05, 0, 0); p.minSize = 1.6; p.maxSize = 4.6; p.minLifeTime = 0.25; p.maxLifeTime = 0.75; p.blendMode = B.ParticleSystem.BLENDMODE_ADD; p.createSphereEmitter(1.4); p.minEmitPower = 4; p.maxEmitPower = 15; p.gravity = new B.Vector3(0, 3, 0); }),
      puff: burst('fxPuff', 300, (p) => { p.color1 = new B.Color4(0.22, 0.22, 0.24, 0.7); p.color2 = new B.Color4(0.1, 0.1, 0.12, 0.6); p.colorDead = new B.Color4(0.4, 0.4, 0.42, 0); p.minSize = 2.4; p.maxSize = 6; p.minLifeTime = 0.9; p.maxLifeTime = 2.4; p.blendMode = B.ParticleSystem.BLENDMODE_STANDARD; p.createSphereEmitter(1.6); p.minEmitPower = 1.5; p.maxEmitPower = 6; p.gravity = new B.Vector3(0, 3.5, 0); }),
      spark: burst('fxSpark', 300, (p) => { p.color1 = new B.Color4(1, 0.95, 0.6, 1); p.color2 = new B.Color4(1, 0.7, 0.2, 1); p.colorDead = new B.Color4(1, 0.5, 0, 0); p.minSize = 0.12; p.maxSize = 0.34; p.minLifeTime = 0.12; p.maxLifeTime = 0.35; p.blendMode = B.ParticleSystem.BLENDMODE_ADD; p.createSphereEmitter(0.1); p.minEmitPower = 3; p.maxEmitPower = 9; p.gravity = new B.Vector3(0, -14, 0); }),
      star: burst('fxStar', 200, (p) => { p.color1 = new B.Color4(1, 0.95, 0.5, 1); p.color2 = new B.Color4(1, 1, 1, 1); p.colorDead = new B.Color4(1, 0.9, 0.3, 0); p.minSize = 0.3; p.maxSize = 0.9; p.minLifeTime = 0.3; p.maxLifeTime = 0.8; p.blendMode = B.ParticleSystem.BLENDMODE_ADD; p.createSphereEmitter(0.3); p.minEmitPower = 2; p.maxEmitPower = 7; }),
    };
    residents.onStar = (x, y, z) => { this.emit('star', x, y, z, 40); this.sfx.play('pop'); };

    // 총알 자국(짧게 번쩍이는 선)
    const tm = new B.StandardMaterial('tracerMat', scene);
    tm.emissiveColor = new B.Color3(1, 0.92, 0.55); tm.disableLighting = true; tm.alpha = 0.85;
    this.tracers = Array.from({ length: 8 }, () => { const m = B.MeshBuilder.CreateBox('tracer', { width: 0.05, height: 0.05, depth: 1 }, scene); m.material = tm; m.isPickable = false; m.setEnabled(false); m.rotationQuaternion = new B.Quaternion(); return { m, t: 0 }; });
    this.burnt = flatMat('burnt', '#2b2b30', scene);

    // ----- 화면 표시 -----
    // 처음에는 주먹뿐이다. 나머지는 사거나 빼앗아서 얻는다.
    this.owned = new Set(['fist']);
    try { const saved = JSON.parse(localStorage.getItem('boxtown.weapons') || '[]').filter((id) => id !== 'fist' && WEAPONS.some((w) => w.id === id)); if (saved.length) this.owned.add(saved[saved.length - 1]); } catch (e) { /* 무시 */ }
    residents.onDefeat = (n) => { if (n.kind === 'thug') stats.bump('kos'); if (n.kind === 'thug') this.unlock('bat', '불량배에게서', '빼앗았어요'); else if (n.kind === 'soldier') this.unlock('rifle', '군인에게서', '빼앗았어요'); else if (n.kind === 'cop') this.unlock('pistol', '경찰관에게서', '빼앗았어요'); };
    this.renderBar();
    this.select(0);
  }

  select(i) {
    i = clamp(i, 0, WEAPONS.length - 1);
    if (!this.owned.has(WEAPONS[i].id)) return; // 없는 무기는 못 든다
    this.cur = i;
    const w = WEAPONS[this.cur];
    for (const id in this.models) this.models[id].setEnabled(id === w.id);
    this.renderBar();
    document.getElementById('btnWeapon').textContent = w.name;
    this.cd = Math.max(this.cd, 0.15);
  }

  emit(kind, x, y, z, count) { this.bursts.push({ kind, x, y, z, count }); }

  // 조준: 카메라 한가운데가 가리키는 방향. 시작점은 캐릭터를 지난 곳.
  aim() {
    const P = this.player, cam = P.cam, d = cam.getForwardRay(1).direction.clone();
    const chest = P.feet.add(new B.Vector3(0, 1.2, 0));
    const along = Math.max(0, B.Vector3.Dot(chest.subtract(cam.position), d));
    return { o: cam.position.add(d.scale(along + 0.9)), d };
  }

  // 광선을 쏴서 무엇에 맞는지 알아낸다: 주민 / 차 / 물건 / 벽.
  trace(o, d, range) {
    const phys = this.scene.getPhysicsEngine(), far = o.add(d.scale(range));
    phys.raycastToRef(o, far, this.ray);
    let t = this.ray.hasHit ? this.ray.hitDistance : range, body = this.ray.hasHit ? this.ray.body : null;
    const res = this.residents.rayHit(o, d, t);
    // 주민이 모는 차에 맞으면 진짜 차로 바뀐다.
    const tc = !res && this.traffic && this.traffic.rayHit(o, d, t);
    if (tc) { const v = this.traffic.convert(tc.car); return { t: tc.t, point: o.add(d.scale(tc.t)), car: v, hit: true }; }
    if (res) return { t: res.t, point: o.add(d.scale(res.t)), resident: res.n };
    // 다른 플레이어
    const rem = this.net && this.net.on && this.net.rayHit(o, d, t);
    if (rem) return { t: rem.t, point: o.add(d.scale(rem.t)), remote: rem.r, hit: true };
    return { t, point: o.add(d.scale(t)), car: body ? this.byBody.get(body) : null, dyn: body ? this.dynByBody.get(body) : null, hit: !!body };
  }

  // dOverride: 시험용(카메라 대신 방향을 직접 준다)
  attack(dOverride, oOverride) {
    const w = WEAPONS[this.cur], P = this.player, chr = P.chr;
    const a = this.aim(), d = dOverride ? dOverride.clone().normalize() : a.d, o = oOverride || (dOverride ? P.feet.add(new B.Vector3(0, 1.2, 0)).add(d.scale(0.9)) : a.o);
    const yaw = Math.atan2(d.x, d.z);
    P.faceYaw = yaw; P.faceT = w.melee ? 0.5 : 1.4; chr.heading = yaw;
    this.cd = w.cd;
    if (w.melee) return this.melee(w, yaw);
    const side = new B.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), fw = new B.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const muzzle = P.feet.add(new B.Vector3(0, 1.12, 0)).add(side.scale(0.42)).add(fw.scale(0.5 + this.muzzle[w.id]));
    chr.aimPitch = Math.asin(clamp(d.y, -1, 1));
    chr.recoil = w.rocket ? -0.5 : -0.28;
    this.residents.scare(P.feet.x, P.feet.z, w.rocket ? 30 : 24);
    if (w.rocket) {
      // 조준점을 향해 날아가는 로켓
      const hit = this.trace(o, d, w.range);
      const dir = hit.point.subtract(muzzle).normalize();
      const mesh = B.MeshBuilder.CreateBox('rocket', { width: 0.22, height: 0.22, depth: 0.9 }, this.scene);
      mesh.material = flatMat('rocketMat', '#d9473c', this.scene, { emissive: '#5a1410' }); mesh.isPickable = false;
      mesh.position.copyFrom(muzzle); mesh.lookAt(muzzle.add(dir));
      const trail = new B.ParticleSystem('rocketTrail', 160, this.scene);
      trail.particleTexture = spark(this.scene); trail.emitter = mesh; trail.emitRate = 110; trail.updateSpeed = 0.016;
      trail.color1 = new B.Color4(1, 0.8, 0.4, 0.9); trail.color2 = new B.Color4(0.8, 0.8, 0.8, 0.6); trail.colorDead = new B.Color4(0.5, 0.5, 0.5, 0);
      trail.minSize = 0.4; trail.maxSize = 1.1; trail.minLifeTime = 0.3; trail.maxLifeTime = 0.7; trail.minEmitPower = 0.2; trail.maxEmitPower = 1; trail.start();
      this.rockets.push({ mesh, trail, dir, t: 0 });
      this.sfx.play('launch');
      return;
    }
    // 총: 맞는 즉시 판정(산탄총은 알갱이 여럿)
    const pellets = w.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      const sd = d.add(new B.Vector3((Math.random() - 0.5) * 2 * w.spread, (Math.random() - 0.5) * 2 * w.spread, (Math.random() - 0.5) * 2 * w.spread)).normalize();
      const hit = this.trace(o, sd, w.range);
      if (this.net && this.net.on) { if (k === 0) this.net.shot(hit.point); if (hit.remote) { this.net.hit(hit.remote, w.dmg, sd.x, sd.z); this.sfx.play('hit'); } }
      if (hit.resident) {
        const gone = this.residents.damage(hit.resident, w.dmg, sd.x, sd.z);
        this.crimeOn(hit.resident, gone);
        this.emit('star', hit.point.x, hit.point.y, hit.point.z, gone ? 0 : 10);
        this.sfx.play(gone ? 'pop' : 'hit');
      } else if (hit.hit) {
        this.emit('spark', hit.point.x, hit.point.y, hit.point.z, 10);
        if (hit.car) { this.hurtCar(hit.car, w.carDmg); this.sfx.play('clank'); }
        if (hit.dyn) hit.dyn.agg.body.applyImpulse(sd.scale(45), hit.point);
      }
      if (k < 3) this.tracer(muzzle, hit.point);
    }
    this.sfx.play('shot');
  }

  // 적대 미사일(경찰 헬리콥터): from에서 dir 방향으로 쏘고, target()이 돌려주는 곳을 향해 한동안 꺾인다.
  missile(from, dir, owner, target) {
    const mesh = B.MeshBuilder.CreateBox('missile', { width: 0.3, height: 0.3, depth: 1.3 }, this.scene);
    mesh.material = flatMat('missileMat', '#cfd3de', this.scene, { emissive: '#7a3a22' }); mesh.isPickable = false;
    mesh.position.copyFrom(from); mesh.lookAt(from.add(dir));
    const trail = new B.ParticleSystem('missileTrail', 160, this.scene);
    trail.particleTexture = spark(this.scene); trail.emitter = mesh; trail.emitRate = 130; trail.updateSpeed = 0.016;
    trail.color1 = new B.Color4(1, 0.75, 0.3, 0.95); trail.color2 = new B.Color4(0.85, 0.85, 0.85, 0.7); trail.colorDead = new B.Color4(0.5, 0.5, 0.5, 0);
    trail.minSize = 0.5; trail.maxSize = 1.3; trail.minLifeTime = 0.35; trail.maxLifeTime = 0.9; trail.minEmitPower = 0.2; trail.maxEmitPower = 1; trail.start();
    this.rockets.push({ mesh, trail, dir: dir.clone().normalize(), t: 0, owner, target, hostile: true, speed: 36, life: 6 });
    this.sfx.play('launch');
  }

  melee(w, yaw) {
    const P = this.player, chr = P.chr, fx = Math.sin(yaw), fz = Math.cos(yaw), me = P.feet;
    chr.swing = 1; chr.swingTime = w.cd * 0.85;
    if (this.traffic) this.traffic.convertNear(me.x, me.z, 4);
    let landed = false;
    const front = (dx, dz, dist, extra = 0) => dist < 0.9 + extra || (dist < w.range + extra && (dx * fx + dz * fz) / (dist || 1) > w.arc);
    if (this.net && this.net.on) for (const r of this.net.near(me.x, me.y, me.z, w.range + 0.4)) {
      const p = r.car ? r.car.root.position : r.pos, dx = p.x - me.x, dz = p.z - me.z, dist = Math.hypot(dx, dz);
      if (!front(dx, dz, dist, r.car ? 1.6 : 0)) continue;
      this.net.hit(r, w.dmg, fx, fz); this.emit('star', p.x, p.y + 1.2, p.z, 12); landed = true;
    }
    for (const n of this.residents.list) {
      if (!this.residents.alive(n)) continue;
      const dx = n.pos.x - me.x, dz = n.pos.z - me.z, dist = Math.hypot(dx, dz);
      if (Math.abs(n.pos.y - me.y) > 2 || !front(dx, dz, dist)) continue;
      const gone = this.residents.damage(n, w.dmg, fx, fz);
      this.crimeOn(n, gone);
      this.emit('star', n.pos.x, n.pos.y + 1.2, n.pos.z, 12);
      if (gone) this.sfx.play('pop');
      landed = true;
    }
    for (const c of this.garage.cars) {
      const dx = c.pos.x - me.x, dz = c.pos.z - me.z;
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || Math.abs(c.pos.y - me.y) > 3) continue;
      // 차 상자에서 나와 가장 가까운 점
      const lx = -dx * c.right.x - dz * c.right.z, lz = -dx * c.fwd.x - dz * c.fwd.z - c.zc;
      const qx = clamp(lx, -c.width / 2, c.width / 2), qz = clamp(lz, -c.length / 2, c.length / 2) + c.zc;
      const wx = c.pos.x + c.right.x * qx + c.fwd.x * qz - me.x, wz = c.pos.z + c.right.z * qx + c.fwd.z * qz - me.z, dist = Math.hypot(wx, wz);
      if (!front(wx, wz, dist)) continue;
      this.hurtCar(c, w.carDmg);
      const M = c.spec.mass;
      c.body.applyImpulse(new B.Vector3(fx * M * w.push * 0.12, M * 0.4, fz * M * w.push * 0.12), new B.Vector3(me.x + wx, c.pos.y + 0.6, me.z + wz));
      this.emit('spark', me.x + wx, c.pos.y + 0.9, me.z + wz, 8);
      landed = true;
    }
    for (const d of this.dynamics) {
      const p = d.mesh.position, dx = p.x - me.x, dz = p.z - me.z, dist = Math.hypot(dx, dz);
      if (Math.abs(p.y - me.y) > 2 || !front(dx, dz, dist)) continue;
      const m = d.agg.body.getMassProperties().mass || 5;
      d.agg.body.applyImpulse(new B.Vector3(fx * m * w.push, m * w.push * 0.45, fz * m * w.push), p);
      landed = true;
    }
    this.sfx.play(landed ? 'hit' : 'swing');
  }

  tracer(a, b) {
    const t = this.tracers.find((x) => x.t <= 0) || this.tracers[0];
    const len = B.Vector3.Distance(a, b);
    t.m.position.copyFrom(a).addInPlace(b).scaleInPlace(0.5);
    t.m.scaling.z = len;
    t.m.lookAt(b);
    t.m.setEnabled(true);
    t.t = 0.06;
  }

  hurtCar(c, amount) { if (!c.dead) { c.hp -= amount; c.blame = true; if (c.police) this.crime(Math.min(30, amount)); } }
  // 나쁜 짓을 하면 경찰이 온다.
  crime(amount) { if (this.onCrime) this.onCrime(amount); }
  // 누구를 때렸느냐에 따라 다르다: 불량배는 죄가 아니고, 경찰관은 큰 죄다.
  crimeOn(n, gone) { if (n.kind !== 'thug') this.crime(n.kind === 'cop' ? (gone ? 90 : 45) : gone ? 35 : 14); }
  // 무기를 얻는다.
  unlock(id, how, verb) {
    if (this.owned.has(id)) return false;
    this.owned = new Set(['fist', id]); // 무기는 하나만 든다: 새로 얻으면 전에 것은 버린다
    try { localStorage.setItem('boxtown.weapons', JSON.stringify([...this.owned])); } catch (e) { /* 무시 */ }
    this.renderBar();
    this.select(WEAPONS.findIndex((w) => w.id === id));
    const OBJ = { bat: '방망이를', pistol: '권총을', smg: '기관단총을', rifle: '돌격소총을', shotgun: '산탄총을', sniper: '저격소총을', rocket: '로켓 발사기를' };
    if (this.toast) this.toast(`${how || ''} ${OBJ[id]} ${verb || '얻었어요'}!`.trim(), true);
    return true;
  }
  // 압수: 주먹만 남는다.
  confiscate() {
    this.owned = new Set(['fist']);
    try { localStorage.setItem('boxtown.weapons', '["fist"]'); } catch (e) { /* 무시 */ }
    this.select(0); this.renderBar();
  }
  renderBar() {
    const bar = document.getElementById('weapons');
    bar.innerHTML = '';
    WEAPONS.forEach((w, i) => { if (i !== this.cur) return; const el = document.createElement('div'); el.className = 'wp' + (i === this.cur ? ' on' : ''); el.dataset.i = i; el.innerHTML = `<b>${i + 1}</b>${w.name}`; bar.appendChild(el); });
    document.getElementById('btnWeapon').style.visibility = this.owned.size > 1 ? '' : 'hidden';
  }

  // 폭발: 주변 주민은 날아가고, 차는 망가지며 밀려나고, 물건과 플레이어도 밀려난다.
  explode(x, y, z, radius = 8, skip = null, opt = null) {
    const P = this.player;
    this.emit('boom', x, y + 0.5, z, 130); this.emit('puff', x, y + 1, z, 46); this.emit('spark', x, y + 0.5, z, 60);
    this.sfx.play('boom');
    if (this.traffic) this.traffic.convertNear(x, z, radius + 4);
    if (this.net && this.net.on) this.net.blast(x, y, z, radius);
    this.residents.scare(x, z, 60);
    for (const n of this.residents.list) {
      if (!this.residents.alive(n)) continue;
      const dx = n.pos.x - x, dz = n.pos.z - z, dist = Math.hypot(dx, dz, n.pos.y - y);
      if (dist > radius) continue;
      const l = Math.hypot(dx, dz) || 1;
      if (dist < radius * 0.8) this.residents.launch(n, dx / l, dz / l); else this.residents.damage(n, 60, dx, dz);
      if (!(opt && opt.silent)) this.crimeOn(n, true);
    }
    for (const c of this.garage.cars) {
      if (c === skip) continue;
      const dx = c.pos.x - x, dy = c.pos.y + 0.6 - y, dz = c.pos.z - z, dist = Math.hypot(dx, dy, dz);
      if (dist > radius + 3) continue;
      const f = clamp(1 - dist / (radius + 3), 0, 1), l = Math.hypot(dx, dz) || 1, M = c.spec.mass;
      if (opt && opt.silent) c.hp -= 140 * f * 0.6; else this.hurtCar(c, 140 * f); // 경찰 미사일은 범죄로 치지 않는다
      c.body.applyImpulse(new B.Vector3((dx / l) * M * 9 * f, M * 7 * f, (dz / l) * M * 9 * f), c.pos.add(new B.Vector3(0, 0.3, 0)));
    }
    for (const d of this.dynamics) {
      const p = d.mesh.position, dx = p.x - x, dy = p.y - y, dz = p.z - z, dist = Math.hypot(dx, dy, dz);
      if (dist > radius + 2) continue;
      const f = 1 - dist / (radius + 2), m = d.agg.body.getMassProperties().mass || 5, l = dist || 1;
      d.agg.body.applyImpulse(new B.Vector3((dx / l) * m * 22 * f, m * 16 * f, (dz / l) * m * 22 * f), p);
    }
    const pd = Math.hypot(P.feet.x - x, P.feet.y + 1 - y, P.feet.z - z);
    if (pd < 90) P.shake = Math.max(P.shake, clamp(1.1 - pd / 60, 0, 0.9));
    if (!P.vehicle && pd < radius + 1) {
      const f = 1 - pd / (radius + 1), l = Math.hypot(P.feet.x - x, P.feet.z - z) || 1;
      P.kick = new B.Vector3(((P.feet.x - x) / l) * 15 * f, 5 + 9 * f, ((P.feet.z - z) / l) * 15 * f);
      P.chr.bump(P.feet.x - x, P.feet.z - z, 2);
      if (this.onBlast) this.onBlast((opt && opt.dmg ? opt.dmg : 65) * f);
    }
  }

  // 차가 터진다: 불덩이가 되어 날아오르고, 까맣게 탄 채 굴러다니다가 얼마 뒤 제자리에 새로 나타난다.
  blow(c) {
    const P = this.player;
    c.dead = true; c.hp = 0; c.respawnT = 13;
    if (c.blame) this.crime(55); // 혼자 사고로 터진 차는 죄가 아니다
    c.blame = false;
    if (P.vehicle === c) { P.exit(); P.kick = new B.Vector3((Math.random() - 0.5) * 8, 13, (Math.random() - 0.5) * 8); if (this.onBlast) this.onBlast(45); }
    this.explode(c.pos.x, c.pos.y + 0.8, c.pos.z, 7.5, c);
    const M = c.spec.mass;
    c.body.applyImpulse(new B.Vector3((Math.random() - 0.5) * M * 8, M * 23, (Math.random() - 0.5) * M * 8), c.pos.add(new B.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)));
    c.body.setAngularVelocity(new B.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 9));
    const meshes = [c.parts.body, ...(c.parts.wheels || []).map((w) => w.mesh)];
    c.paint = meshes.map((m) => [m, m.material, m.useVertexColors]);
    for (const m of meshes) { m.material = this.burnt; m.useVertexColors = false; }
  }

  carEffects(dt) {
    for (const c of this.garage.cars) {
      if (c.hp >= 100 && !c.dead) continue;
      let fx = this.carFx.get(c);
      if (!fx) {
        const mk = (cap) => { const p = new B.ParticleSystem('carFx', cap, this.scene); p.particleTexture = spark(this.scene); p.emitter = new B.Vector3(); p.updateSpeed = 0.016; p.emitRate = 0; p.start(); return p; };
        const smoke = mk(140), fire = mk(180);
        smoke.minEmitBox = new B.Vector3(-0.4, 0, -0.4); smoke.maxEmitBox = new B.Vector3(0.4, 0.3, 0.4);
        smoke.colorDead = new B.Color4(0.4, 0.4, 0.42, 0); smoke.minSize = 0.9; smoke.maxSize = 2.6; smoke.minLifeTime = 1; smoke.maxLifeTime = 2.4;
        smoke.blendMode = B.ParticleSystem.BLENDMODE_STANDARD; smoke.gravity = new B.Vector3(0.5, 2.6, 0); smoke.direction1 = new B.Vector3(-0.3, 1.5, -0.3); smoke.direction2 = new B.Vector3(0.3, 3, 0.3); smoke.minEmitPower = 0.5; smoke.maxEmitPower = 1.4;
        fire.minEmitBox = new B.Vector3(-0.55, 0, -0.6); fire.maxEmitBox = new B.Vector3(0.55, 0.4, 0.6);
        fire.color1 = new B.Color4(1, 0.75, 0.2, 1); fire.color2 = new B.Color4(1, 0.35, 0.08, 1); fire.colorDead = new B.Color4(0.4, 0.05, 0, 0);
        fire.minSize = 0.6; fire.maxSize = 1.7; fire.minLifeTime = 0.25; fire.maxLifeTime = 0.7; fire.blendMode = B.ParticleSystem.BLENDMODE_ADD;
        fire.gravity = new B.Vector3(0, 6, 0); fire.direction1 = new B.Vector3(-0.4, 1.5, -0.4); fire.direction2 = new B.Vector3(0.4, 4, 0.4); fire.minEmitPower = 0.5; fire.maxEmitPower = 1.5;
        this.carFx.set(c, (fx = { smoke, fire }));
      }
      // 연기와 불은 보닛 위에서 난다.
      const at = c.pos.add(c.up.scale(Math.min(c.height * 0.62, 1.2))).add(c.fwd.scale(c.zc + c.length * 0.28));
      fx.smoke.emitter.copyFrom(at); fx.fire.emitter.copyFrom(at);
      const burning = c.hp < 35 && !c.dead;
      const dark = c.hp < 35 ? 0.12 : 0.55;
      fx.smoke.color1 = new B.Color4(dark, dark, dark + 0.02, 0.65); fx.smoke.color2 = new B.Color4(dark * 0.7, dark * 0.7, dark * 0.7, 0.5);
      // 연기와 불은 내구도가 다 떨어져 터졌을 때만 난다(망가져 가는 중에는 나지 않는다).
      fx.smoke.emitRate = c.dead ? 16 : 0;
      fx.fire.emitRate = c.dead ? (c.respawnT > 8 ? 60 : 0) : 0;
      if (c.dead) {
        c.respawnT -= dt;
        if (c.respawnT <= 0) {
          for (const [m, mat, vc] of c.paint) { m.material = mat; m.useVertexColors = vc; }
          c.dead = false; c.hp = 100; c.fuse = undefined;
          c.reset(c.home.pos.x, c.home.pos.y + 0.4, c.home.pos.z, null);
          fx.smoke.dispose(false); fx.fire.dispose(false); this.carFx.delete(c);
          this.emit('star', c.home.pos.x, c.home.pos.y + 1, c.home.pos.z, 30);
        }
      } else if (c.hp <= 0) {
        // 불이 붙은 채 잠깐 버티다가 터진다.
        c.fuse = c.fuse === undefined ? 2.2 : c.fuse - dt;
        if (c.fuse <= 0) this.blow(c);
      }
    }
  }

  update(dt, blocked = false) {
    const P = this.player, inp = P.input;
    // 1: 주먹, 2: 들고 있는 무기
    if (inp.weaponPick >= 0) { const k = inp.weaponPick === 0 ? 0 : WEAPONS.findIndex((x) => x.id !== 'fist' && this.owned.has(x.id)); if (k >= 0) this.select(k); inp.weaponPick = -1; }
    if (inp.weaponNext) { let k = this.cur; do { k = (k + 1) % WEAPONS.length; } while (!this.owned.has(WEAPONS[k].id)); this.select(k); inp.weaponNext = false; }
    const w = WEAPONS[this.cur], can = !P.vehicle && !blocked;
    this.cd -= dt;
    if (inp.attackQueued) { this.queue = 0.2; inp.attackQueued = false; }
    this.queue -= dt;
    if (can && this.cd <= 0 && (this.queue > 0 || (inp.attackHeld && (w.auto || w.melee)))) { this.queue = 0; this.attack(); }
    P.shoulder = can && !w.melee ? 1 : 0;
    P.chr.aim = can && !w.melee && P.faceT > 0 ? 1 : 0;
    if (P.chr.aim) P.chr.aimPitch = Math.asin(clamp(P.cam.getForwardRay(1).direction.y, -1, 1));
    document.getElementById('cross').hidden = !(can && !w.melee);

    // 로켓
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i], step = (r.speed || 58) * dt, from = r.mesh.position.clone();
      r.t += dt;
      // 적대 미사일: 한동안 목표를 따라 꺾이고, 쏜 헬리콥터 자신에게는 맞지 않는다.
      if (r.hostile && r.t < 2.6 && r.target) {
        const tp = r.target(), want = new B.Vector3(tp.x - from.x, tp.y + 0.8 - from.y, tp.z - from.z).normalize();
        r.dir = r.dir.scale(1 - Math.min(1, 1.5 * dt)).add(want.scale(Math.min(1, 1.5 * dt))).normalize();
        r.mesh.lookAt(from.add(r.dir));
      }
      let hit = this.trace(from, r.dir, step + 0.3);
      if (r.hostile && hit.car && hit.car === r.owner && r.t < 1.5) hit = { hit: false, point: from };
      // 플레이어는 물리 충돌체가 아니라서 거리로 따로 맞는지 본다(걷고 있으면 몸, 타고 있으면 차).
      let direct = false;
      if (r.hostile) { const tp = r.target(), dd = Math.hypot(tp.x - from.x, tp.y + 0.8 - from.y, tp.z - from.z); direct = dd < (this.player.vehicle ? 2.6 : 1.8); }
      if (hit.hit || hit.resident || direct || r.t > (r.life || 4.5) || from.y < SEA - 0.5) {
        const p = hit.hit || hit.resident ? hit.point : from;
        this.explode(p.x, p.y, p.z, r.hostile ? 6.5 : 8.5, r.owner || null, r.hostile ? { silent: true, dmg: 42 } : null);
        r.trail.stop(); const tr = r.trail; setTimeout(() => tr.dispose(false), 900);
        r.mesh.dispose();
        this.rockets.splice(i, 1);
      } else r.mesh.position.addInPlace(r.dir.scale(step));
    }
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; if (t.t <= 0) t.m.setEnabled(false); }
    this.carEffects(dt);
    // 터뜨리는 효과는 종류마다 한 프레임에 하나씩 내보낸다.
    const used = {};
    for (let i = 0; i < this.bursts.length;) {
      const b = this.bursts[i];
      if (used[b.kind] || b.count <= 0) { if (b.count <= 0) this.bursts.splice(i, 1); else i++; continue; }
      used[b.kind] = true;
      const p = this.fx[b.kind];
      p.emitter.set(b.x, b.y, b.z); p.manualEmitCount = b.count;
      this.bursts.splice(i, 1);
    }
  }
}
