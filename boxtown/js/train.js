// 기차와 역. 기차는 물리 없이 선로(roads.js의 rail 경로)를 따라 오가며 역마다 선다.
// 역 승강장에서 E로 타고, 다른 역에 섰을 때 E로 내린다.
import { paths, STATION_PADS, CROSSINGS } from './roads.js';
import { STATIONS } from './world.js';
import { flatMat, clamp, lerp, smoothstep } from './util.js';
const B = window.BABYLON;

export class Train {
  constructor({ scene, player, jobs, assets, lazyCollider, addShadow, garage, sfx }) {
    Object.assign(this, { scene, player, jobs, garage, sfx });
    this.pts = paths.find((p) => p.type === 'rail').pts;
    this.len = this.pts[this.pts.length - 1].s;
    const M = (hex, o) => flatMat('train_' + hex + (o ? 'e' : ''), hex, scene, o);
    const col = lazyCollider();
    // ----- 역: 승강장, 지붕, 이름판 -----
    this.stations = STATIONS.map(([f, name]) => {
      const s = f * this.len, q = this.at(s), nx = -q.tz, nz = q.tx, yaw = Math.atan2(q.tx, q.tz);
      const cx = q.x + nx * 5.0, cz = q.z + nz * 5.0, y = q.y - 0.1;
      const put = (w, h, d, ox, oy, oz, m, solid) => {
        const b = B.MeshBuilder.CreateBox('station', { width: w, height: h, depth: d }, scene);
        const x = cx + nx * ox + q.tx * oz, z = cz + nz * ox + q.tz * oz;
        b.position.set(x, y + oy, z); b.rotation.y = yaw; b.material = m; b.isPickable = false; b.receiveShadows = true; b.freezeWorldMatrix();
        addShadow([b]);
        if (solid) col.add(x, y + oy, z, Math.abs(Math.cos(yaw)) > 0.7 ? w : d, h, Math.abs(Math.cos(yaw)) > 0.7 ? d : w);
        return b;
      };
      // 승강장: 돌 바닥, 가장자리 띠, 노란 안전선, 양 끝 계단
      put(5.6, 5.2, 30, 0, -1.9, 0, M('#c9cede'), true); put(5.8, 0.12, 30.2, 0, 0.72, 0, M('#aeb3c6'));
      put(0.5, 0.05, 30, -2.5, 0.8, 0, M('#f4f1ea')); put(0.45, 0.05, 30, -1.95, 0.8, 0, M('#ffd84a'));
      for (let i = -14; i <= 14; i += 2) put(5.2, 0.02, 0.06, 0.2, 0.79, i, M('#9aa1b3'));
      for (const e of [-1, 1]) for (let k = 0; k < 3; k++) put(4, 3.4, 0.9, 0.6, -1.0 - k * 0.3, e * (15.4 + k * 0.9), M('#b9bfd0'), true);
      // 지붕: 기둥과 가로대, 처마, 유리 채광창
      for (const oz of [-12, -6, 0, 6, 12]) { put(0.3, 3.6, 0.3, 1.9, 2.6, oz, M('#34456f')); put(3.6, 0.18, 0.18, 0.2, 4.2, oz, M('#34456f')); put(0.5, 0.2, 0.5, 1.9, 0.9, oz, M('#22202b')); }
      put(5.4, 0.22, 28, 0, 4.45, 0, M('#e5553f')); put(5.8, 0.14, 28.4, 0, 4.32, 0, M('#f4f1ea')); put(1.4, 0.1, 24, -0.8, 4.6, 0, M('#bfe6ff', { emissive: '#4f86a8' }));
      for (const oz of [-9, -3, 3, 9]) put(0.5, 0.16, 0.5, -0.4, 4.1, oz, M('#fff2c2', { emissive: '#ffe9a8' }));
      // 역사: 벽, 문, 창, 매표 창구, 시계
      put(3.4, 3.2, 6, 1.0, 2.3, -10, M('#f6efe0'), true); put(3.7, 0.3, 6.4, 1.0, 4.0, -10, M('#34456f')); put(3.5, 0.5, 6.1, 1.0, 0.95, -10, M('#8a5a2b'));
      put(0.1, 2.2, 1.2, -0.72, 1.85, -11.4, M('#5a4636')); put(0.1, 1.2, 1.8, -0.72, 2.3, -9.2, M('#bfe6ff', { emissive: '#4f86a8' })); put(0.3, 0.1, 2, -0.82, 1.65, -9.2, M('#8a5a2b'));
      put(0.12, 0.9, 0.9, -0.74, 3.35, -10, M('#f4f1ea')); put(0.14, 0.08, 0.42, -0.76, 3.45, -10, M('#22202b')); put(0.14, 0.34, 0.08, -0.76, 3.3, -10, M('#22202b'));
      // 뒤쪽 난간과 노선도 판
      for (let i = -4; i <= 14; i += 2) put(0.12, 1.1, 0.12, 2.65, 1.3, i, M('#34456f')); put(0.1, 0.1, 19, 2.65, 1.85, 5, M('#34456f')); put(0.1, 0.1, 19, 2.65, 1.35, 5, M('#34456f'));
      put(0.14, 1.5, 2.4, 2.5, 2.5, 10, M('#f4f1ea')); put(0.16, 0.12, 2, 2.42, 2.5, 10, M('#e5553f'));
      for (const k of [-0.7, -0.2, 0.3, 0.8]) put(0.18, 0.22, 0.22, 2.4, 2.5, 10 + k, M('#34456f'));
      // 벤치, 휴지통, 화분, 가로등(가구 모델)
      const prop = (key, ox, oz, rot, sc = 1) => assets.place('furniture/' + key, cx + nx * ox + q.tx * oz, y + 0.78, cz + nz * ox + q.tz * oz, yaw + rot, sc);
      for (const oz of [-3, 3, 9]) prop('bench', 1.6, oz, Math.PI / 2); prop('benchCushion', 1.6, 6, Math.PI / 2); prop('trashcan', 1.9, -5, 0); prop('trashcan', 1.9, 11.4, 0);
      prop('pottedPlant', 1.9, -6.4, 0, 1.2); prop('pottedPlant', 1.9, 13, 0, 1.2); prop('lampRoundFloor', 2.2, 0, 0, 1.5); prop('lampRoundFloor', 2.2, 12, 0, 1.5);
      const tex = new B.DynamicTexture('stationSign' + name, { width: 512, height: 128 }, scene, true), ctx = tex.getContext();
      ctx.fillStyle = '#34456f'; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 84px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; ctx.fillText(name, 256, 70); tex.update();
      const sm = new B.StandardMaterial('stationSignMat' + name, scene); sm.diffuseTexture = tex; sm.emissiveTexture = tex; sm.emissiveColor = new B.Color3(0.5, 0.5, 0.5); sm.backFaceCulling = false;
      const sign = B.MeshBuilder.CreatePlane('stationSignPlane', { width: 5, height: 1.25 }, scene);
      sign.position.set(cx + nx * 0.2, y + 3.75, cz + nz * 0.2); sign.rotation.y = yaw + Math.PI / 2; sign.material = sm; sign.isPickable = false; sign.freezeWorldMatrix();
      return { s, name, x: cx, z: cz, y: y + 0.8 };
    });
    col.done();
    // ----- 기차: 기관차 하나와 객차 둘 -----
    // ----- 기차: 전동차 모델 네 량(앞머리, 객차 둘, 뒷머리) -----
    this.gap = 8.0;
    this.cars = ['a', 'b', 'b', 'b', 'b', 'c'].map((k) => { const m = assets.spawn('train/train-electric-subway-' + k, 'trainCar_' + k); m.rotationQuaternion = null; return m; });
    assets.flush();
    this.s = this.stations[0].s; this.dir = 1; this.v = 0; this.wait = 6; this.stop = 0; this.seat = new B.Vector3(); this.hitCd = 0;
    // 앞머리 전조등
    this.lamp = B.MeshBuilder.CreateBox('trainLamp', { width: 1.5, height: 0.28, depth: 0.12 }, scene);
    this.lamp.material = M('#fff6c8', { emissive: '#fff2b0' }); this.lamp.isPickable = false;
    this.buildCrossings(M, addShadow);
    this.closed = []; this.bellT = 0; this.hornCd = 0;
    this.place();
  }

  // ----- 건널목: 양쪽에 경보등과 차단기. 기차가 다가오면 등이 번갈아 깜빡이고 차단기가 내려온다 -----
  buildCrossings(M, addShadow) {
    const scene = this.scene, on = M('#ff3b30', { emissive: '#ff3b30' }), off = M('#5a1f1c'), pole = M('#e8e4dc'), dark = M('#22202b'), stripe = M('#e5553f');
    this.xings = CROSSINGS.filter((c) => c.road).map((c) => {
      const nx = -c.tz, nz = c.tx, lamps = [], arms = [];
      for (const sd of [-1, 1]) {
        const x = c.x + c.tx * sd * 5.4 + nx * sd * (c.half + 1.1), z = c.z + c.tz * sd * 5.4 + nz * sd * (c.half + 1.1), yaw = Math.atan2(c.tx, c.tz);
        const box = (w, h, d, oy, m, rz = 0, ox = 0) => { const b = B.MeshBuilder.CreateBox('xing', { width: w, height: h, depth: d }, scene); b.position.set(x + Math.cos(yaw) * ox, c.y + oy, z - Math.sin(yaw) * ox); b.rotation.y = yaw; b.rotation.z = rz; b.material = m; b.isPickable = false; return b; };
        const parts = [box(0.18, 3.6, 0.18, 1.8, pole), box(0.5, 0.5, 0.5, 0.25, dark), box(1.5, 0.2, 0.06, 3.3, pole, 0.7), box(1.5, 0.2, 0.06, 3.3, pole, -0.7), box(1.3, 0.34, 0.1, 2.5, dark)];
        addShadow(parts);
        for (const ox of [-0.42, 0.42]) { const l = box(0.3, 0.3, 0.16, 2.5, off, 0, ox); lamps.push(l); }
        // 차단기: 기둥에 달린 막대가 길 쪽으로 내려온다.
        const hinge = new B.TransformNode('xingHinge', scene);
        hinge.position.set(x, c.y + 1.15, z); hinge.rotation.y = Math.atan2(nz * sd, -nx * sd); hinge.rotation.z = 1.4;
        const L = c.half + 0.6;
        for (let k = 0; k < 4; k++) { const seg = B.MeshBuilder.CreateBox('xingArm', { width: L / 4, height: 0.14, depth: 0.1 }, scene); seg.parent = hinge; seg.position.x = L / 8 + (k * L) / 4; seg.material = k % 2 ? pole : stripe; seg.isPickable = false; }
        arms.push(hinge);
      }
      return { ...c, lamps, arms, on, off, k: 0 };
    });
  }

  // 선로 위 거리 s의 위치와 방향
  at(s) {
    const P = this.pts;
    s = clamp(s, 0, this.len - 0.01);
    let i = Math.min(P.length - 2, Math.floor((s / this.len) * (P.length - 1)));
    while (i > 0 && P[i].s > s) i--;
    while (i < P.length - 2 && P[i + 1].s <= s) i++;
    const a = P[i], b = P[i + 1], t = (s - a.s) / (b.s - a.s || 1);
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) + 0.3 + ((a.xing ? 0 : 0.34) * (1 - t) + (b.xing ? 0 : 0.34) * t), z: lerp(a.z, b.z, t), tx: a.tx, tz: a.tz, dy: (b.y - a.y) / (b.s - a.s || 1) };
  }
  place() {
    this.cars.forEach((c, k) => {
      const q = this.at(this.s - this.dir * k * this.gap);
      c.position.set(q.x, q.y, q.z);
      c.rotation.set(-Math.atan(q.dy) * this.dir, Math.atan2(q.tx, q.tz) + (this.dir < 0 ? Math.PI : 0), 0);
    });
    { const q = this.at(this.s + this.dir * 4.05); this.lamp.position.set(q.x, q.y + 1.15, q.z); this.lamp.rotation.y = Math.atan2(q.tx, q.tz); }
    const q = this.at(this.s - this.dir * this.gap * 1.5);
    this.seat.set(q.x, q.y + 1.2, q.z); // 가운데 객차
  }
  atStation() { return this.wait > 0 ? this.stations[this.stop] : null; }
  nearPlatform() {
    const st = this.atStation(), p = this.player.feet;
    return st && !this.player.vehicle && Math.hypot(st.x - p.x, st.z - p.z) < 13 && Math.abs(st.y - p.y) < 3 ? st : null;
  }
  prompt() {
    if (this.player.riding) return this.atStation() ? `${this.atStation().name}에서 내리기` : '';
    return this.nearPlatform() ? '기차 타기' : '';
  }
  use() {
    const P = this.player;
    if (P.riding) {
      const st = this.atStation();
      if (!st) return true;
      P.riding = null; P.inside = false; P.chr.setVisible(true);
      P.teleport(st.x, st.y, st.z);
      return true;
    }
    if (!this.nearPlatform()) return false;
    P.riding = this; P.inside = true; P.chr.setVisible(false); // 타는 동안은 다치지 않고 경찰도 못 찾는다
    P.cc.setPosition(new B.Vector3(this.seat.x, this.seat.y + 400, this.seat.z));
    this.jobs.toast('기차에 탔어요. 다른 역에 서면 E로 내려요');
    return true;
  }
  // 건널목 경보와 경적. 기차가 서 있어도 돌아간다.
  signals(dt) {
    const me = this.player.vehicle ? this.player.vehicle.pos : this.player.feet, ctx = this.sfx && this.sfx.ctx;
    this.closed.length = 0;
    let ring = 1e9;
    const moving = this.wait <= 0 || this.wait < 1.6;
    for (const x of this.xings) {
      const ahead = (x.s - this.s) * this.dir, tail = this.gap * (this.cars.length - 1) + 8;
      const active = moving && ahead > -tail && ahead < 110;
      x.k = clamp(x.k + (active ? dt : -dt) * 0.9, 0, 1);
      for (const a of x.arms) a.rotation.z = lerp(1.4, 0, smoothstep(0, 1, x.k));
      const blink = Math.floor(performance.now() / 420) % 2;
      x.lamps.forEach((l, i) => { l.material = active && (i % 2 === blink) ? x.on : x.off; });
      if (active) { this.closed.push(x); ring = Math.min(ring, Math.hypot(x.x - me.x, x.z - me.z)); }
    }
    if (!ctx || this.player.inside) return;
    // 땡땡 종소리(가까울수록 크게)
    this.bellT -= dt;
    if (ring < 70 && this.bellT <= 0) { this.bellT = 0.42; this.sfx.tone(this.bellHi ? 932 : 784, this.bellHi ? 930 : 780, 0.2, 0.05 * (1 - ring / 70), 'triangle'); this.bellHi = !this.bellHi; }
    // 경적: 건널목 앞과 출발할 때
    this.hornCd -= dt;
    const far = Math.hypot(this.cars[0].position.x - me.x, this.cars[0].position.z - me.z);
    const due = this.xings.some((x) => { const a = (x.s - this.s) * this.dir; return a > 30 && a < 60; }) && this.v > 6;
    if (far < 150 && this.hornCd <= 0 && (due || this.departed)) {
      this.hornCd = 5; const vol = 0.07 * (1 - far / 150);
      this.sfx.tone(311, 309, 0.9, vol, 'sawtooth'); this.sfx.tone(370, 368, 0.9, vol, 'sawtooth');
    }
    this.departed = false;
  }
  update(dt) {
    this.signals(dt);
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) { // 출발: 끝 역이면 방향을 바꾼다
        if (this.stop === this.stations.length - 1) this.dir = -1; else if (this.stop === 0) this.dir = 1;
        this.next = this.stop + this.dir; this.departed = true;
      }
      return;
    }
    const goal = this.stations[this.next].s, left = Math.abs(goal - this.s);
    const want = Math.min(24, Math.sqrt(2 * 3.2 * left) + 0.6); // 역 앞에서 서서히 줄인다
    this.v = this.v < want ? Math.min(want, this.v + 3.5 * dt) : want;
    this.s += this.dir * Math.min(this.v * dt, left);
    if (left < 0.15) { this.v = 0; this.stop = this.next; this.wait = 7; if (Math.hypot(this.stations[this.stop].x - this.player.feet.x, this.stations[this.stop].z - this.player.feet.z) < 60) this.jobs.toast(`${this.stations[this.stop].name}에 도착했어요`); }
    this.place();
    // 달리는 기차에 받힌 차는 그대로 부서진다(내구도 0).
    if (this.v > 3 && this.garage) for (const car of this.garage.cars) {
      if (car.dead || car.isBoat || car.hp <= 0) continue;
      for (const c of this.cars) {
        const dx = car.pos.x - c.position.x, dz = car.pos.z - c.position.z;
        if (Math.abs(dx) > 9 || Math.abs(dz) > 9 || Math.abs(car.pos.y - c.position.y) > 3.5) continue;
        const sy = Math.sin(c.rotation.y), cy = Math.cos(c.rotation.y), lz = dx * sy + dz * cy, lx = dx * cy - dz * sy;
        if (Math.abs(lx) < 1.5 + car.width / 2 && Math.abs(lz) < 4.1 + car.length / 2) {
          car.hp = 0; car.blame = false;
          const m = car.spec.mass, side = Math.sign(lx || 1);
          car.body.applyImpulse(new B.Vector3((sy * this.v * 0.8 + cy * side * 5) * m, 5 * m, (cy * this.v * 0.8 - sy * side * 5) * m), car.pos);
          if (this.onCarHit) this.onCarHit(car);
          break;
        }
      }
    }
    // 달리는 기차에 부딪히면 그 자리에서 쓰러진다.
    this.hitCd -= dt;
    const P = this.player, me = P.feet;
    if (this.onHit && this.hitCd <= 0 && this.v > 3 && !P.vehicle && !P.inside) {
      for (const c of this.cars) {
        const dx = me.x - c.position.x, dz = me.z - c.position.z;
        if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || Math.abs(me.y - c.position.y) > 3) continue;
        const sy = Math.sin(c.rotation.y), cy = Math.cos(c.rotation.y), lz = dx * sy + dz * cy, lx = dx * cy - dz * sy;
        if (Math.abs(lx) < 2.1 && Math.abs(lz) < 4.2) { this.hitCd = 1; this.onHit(sy * this.v, cy * this.v, lx); break; }
      }
    }
  }
}
