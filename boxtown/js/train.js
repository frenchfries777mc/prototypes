// 기차와 역. 기차는 물리 없이 선로(roads.js의 rail 경로)를 따라 오가며 역마다 선다.
// 역 승강장에서 E로 타고, 다른 역에 섰을 때 E로 내린다.
import { paths } from './roads.js';
import { STATIONS } from './world.js';
import { flatMat, clamp, lerp } from './util.js';
const B = window.BABYLON;

export class Train {
  constructor({ scene, player, jobs, assets, lazyCollider, addShadow }) {
    Object.assign(this, { scene, player, jobs });
    this.pts = paths.find((p) => p.type === 'rail').pts;
    this.len = this.pts[this.pts.length - 1].s;
    const M = (hex, o) => flatMat('train_' + hex + (o ? 'e' : ''), hex, scene, o);
    const col = lazyCollider();
    // ----- 역: 승강장, 지붕, 이름판 -----
    this.stations = STATIONS.map(([f, name]) => {
      const s = f * this.len, q = this.at(s), nx = -q.tz, nz = q.tx, yaw = Math.atan2(q.tx, q.tz);
      const cx = q.x + nx * 5.0, cz = q.z + nz * 5.0, y = q.y;
      const put = (w, h, d, ox, oy, oz, m, solid) => {
        const b = B.MeshBuilder.CreateBox('station', { width: w, height: h, depth: d }, scene);
        const x = cx + nx * ox + q.tx * oz, z = cz + nz * ox + q.tz * oz;
        b.position.set(x, y + oy, z); b.rotation.y = yaw; b.material = m; b.isPickable = false; b.receiveShadows = true; b.freezeWorldMatrix();
        addShadow([b]);
        if (solid) col.add(x, y + oy, z, Math.abs(Math.cos(yaw)) > 0.7 ? w : d, h, Math.abs(Math.cos(yaw)) > 0.7 ? d : w);
        return b;
      };
      // 승강장: 돌 바닥, 가장자리 띠, 노란 안전선, 양 끝 계단
      put(5.6, 1.2, 30, 0, 0.1, 0, M('#c9cede'), true); put(5.8, 0.12, 30.2, 0, 0.72, 0, M('#aeb3c6'));
      put(0.5, 0.05, 30, -2.5, 0.8, 0, M('#f4f1ea')); put(0.45, 0.05, 30, -1.95, 0.8, 0, M('#ffd84a'));
      for (let i = -14; i <= 14; i += 2) put(5.2, 0.02, 0.06, 0.2, 0.79, i, M('#9aa1b3'));
      for (const e of [-1, 1]) for (let k = 0; k < 3; k++) put(4, 0.4, 0.9, 0.6, 0.5 - k * 0.3, e * (15.4 + k * 0.9), M('#b9bfd0'), true);
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
    this.cars = ['a', 'b', 'b', 'c'].map((k) => { const m = assets.spawn('train/train-electric-subway-' + k, 'trainCar_' + k); m.rotationQuaternion = null; return m; });
    assets.flush();
    this.s = this.stations[0].s; this.dir = 1; this.v = 0; this.wait = 6; this.stop = 0; this.seat = new B.Vector3(); this.hitCd = 0;
    this.place();
  }

  // 선로 위 거리 s의 위치와 방향
  at(s) {
    const P = this.pts;
    s = clamp(s, 0, this.len - 0.01);
    let i = Math.min(P.length - 2, Math.floor((s / this.len) * (P.length - 1)));
    while (i > 0 && P[i].s > s) i--;
    while (i < P.length - 2 && P[i + 1].s <= s) i++;
    const a = P[i], b = P[i + 1], t = (s - a.s) / (b.s - a.s || 1);
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) + 0.3, z: lerp(a.z, b.z, t), tx: a.tx, tz: a.tz, dy: (b.y - a.y) / (b.s - a.s || 1) };
  }
  place() {
    this.cars.forEach((c, k) => {
      const q = this.at(this.s - this.dir * k * this.gap);
      c.position.set(q.x, q.y, q.z);
      c.rotation.set(-Math.atan(q.dy) * this.dir, Math.atan2(q.tx, q.tz) + (this.dir < 0 ? Math.PI : 0), 0);
    });
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
  update(dt) {
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) { // 출발: 끝 역이면 방향을 바꾼다
        if (this.stop === this.stations.length - 1) this.dir = -1; else if (this.stop === 0) this.dir = 1;
        this.next = this.stop + this.dir;
      }
      return;
    }
    const goal = this.stations[this.next].s, left = Math.abs(goal - this.s);
    const want = Math.min(19, Math.sqrt(2 * 3.2 * left) + 0.6); // 역 앞에서 서서히 줄인다
    this.v = this.v < want ? Math.min(want, this.v + 3.5 * dt) : want;
    this.s += this.dir * Math.min(this.v * dt, left);
    if (left < 0.15) { this.v = 0; this.stop = this.next; this.wait = 7; if (Math.hypot(this.stations[this.stop].x - this.player.feet.x, this.stations[this.stop].z - this.player.feet.z) < 60) this.jobs.toast(`${this.stations[this.stop].name}에 도착했어요`); }
    this.place();
    // 달리는 기차에 부딪히면 크게 다친다.
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
