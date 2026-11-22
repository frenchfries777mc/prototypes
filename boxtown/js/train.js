// 기차와 역. 기차는 물리 없이 선로(roads.js의 rail 경로)를 따라 오가며 역마다 선다.
// 역 승강장에서 E로 타고, 다른 역에 섰을 때 E로 내린다.
import { paths } from './roads.js';
import { STATIONS } from './world.js';
import { flatMat, clamp, lerp } from './util.js';
const B = window.BABYLON;

export class Train {
  constructor({ scene, player, jobs, lazyCollider, addShadow }) {
    Object.assign(this, { scene, player, jobs });
    this.pts = paths.find((p) => p.type === 'rail').pts;
    this.len = this.pts[this.pts.length - 1].s;
    const M = (hex, o) => flatMat('train_' + hex + (o ? 'e' : ''), hex, scene, o);
    const col = lazyCollider();
    // ----- 역: 승강장, 지붕, 이름판 -----
    this.stations = STATIONS.map(([f, name]) => {
      const s = f * this.len, q = this.at(s), nx = -q.tz, nz = q.tx, yaw = Math.atan2(q.tx, q.tz);
      const cx = q.x + nx * 5.4, cz = q.z + nz * 5.4, y = q.y;
      const put = (w, h, d, ox, oy, oz, m, solid) => {
        const b = B.MeshBuilder.CreateBox('station', { width: w, height: h, depth: d }, scene);
        const x = cx + nx * ox + q.tx * oz, z = cz + nz * ox + q.tz * oz;
        b.position.set(x, y + oy, z); b.rotation.y = yaw; b.material = m; b.isPickable = false; b.receiveShadows = true; b.freezeWorldMatrix();
        addShadow([b]);
        if (solid) col.add(x, y + oy, z, Math.abs(Math.cos(yaw)) > 0.7 ? w : d, h, Math.abs(Math.cos(yaw)) > 0.7 ? d : w);
        return b;
      };
      put(5, 1.2, 26, 0, 0.1, 0, M('#d8dcec'), true); put(0.5, 0.06, 26, -2.2, 0.72, 0, M('#ffd84a'));
      for (const oz of [-9, 0, 9]) put(0.35, 3.4, 0.35, 1.6, 2.4, oz, M('#34456f'));
      put(4.6, 0.3, 24, 0.4, 4.2, 0, M('#e5553f')); put(3, 2.6, 4, 1.2, 2, -9, M('#f4f1ea'), true); put(3.2, 0.3, 4.4, 1.2, 3.4, -9, M('#34456f'));
      put(0.2, 0.5, 3, 1.6, 0.95, 5, M('#8b5d3a')); put(0.2, 0.9, 3, 2, 1.2, 5, M('#8b5d3a'));
      const tex = new B.DynamicTexture('stationSign' + name, { width: 512, height: 128 }, scene, true), ctx = tex.getContext();
      ctx.fillStyle = '#34456f'; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 84px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; ctx.fillText(name, 256, 70); tex.update();
      const sm = new B.StandardMaterial('stationSignMat' + name, scene); sm.diffuseTexture = tex; sm.emissiveTexture = tex; sm.emissiveColor = new B.Color3(0.5, 0.5, 0.5); sm.backFaceCulling = false;
      const sign = B.MeshBuilder.CreatePlane('stationSignPlane', { width: 5, height: 1.25 }, scene);
      sign.position.set(cx + nx * 0.4, y + 3.3, cz + nz * 0.4); sign.rotation.y = yaw + Math.PI / 2; sign.material = sm; sign.isPickable = false; sign.freezeWorldMatrix();
      return { s, name, x: cx, z: cz, y: y + 0.72 };
    });
    col.done();
    // ----- 기차: 기관차 하나와 객차 둘 -----
    const car = (kind) => {
      const root = new B.TransformNode('trainCar', scene);
      const part = (w, h, d, x, y, z, m) => { const b = B.MeshBuilder.CreateBox('trainPart', { width: w, height: h, depth: d }, scene); b.parent = root; b.position.set(x, y, z); b.material = m; b.isPickable = false; addShadow([b]); return b; };
      part(2.9, 0.5, 10.4, 0, 0.75, 0, M('#3a3d4d'));
      for (const z of [-3.4, 3.4]) for (const x of [-1.05, 1.05]) part(0.3, 0.9, 1.9, x, 0.6, z, M('#22202b'));
      if (kind === 'loco') {
        part(2.8, 2.5, 6.6, 0, 2.25, -1.5, M('#d9473c')); part(2.8, 1.5, 3, 0, 1.75, 3.6, M('#d9473c')); part(2.9, 0.3, 6.8, 0, 3.6, -1.5, M('#f4f1ea'));
        part(2.3, 0.9, 0.1, 0, 2.7, 1.82, M('#bfe6ff', { emissive: '#5f9fc8' })); part(0.5, 0.4, 0.2, -0.8, 1.5, 5.1, M('#ffe9a8', { emissive: '#ffe9a8' })); part(0.5, 0.4, 0.2, 0.8, 1.5, 5.1, M('#ffe9a8', { emissive: '#ffe9a8' }));
        part(0.7, 1, 0.7, 0, 3.0, 3.6, M('#22202b')); part(2.9, 0.3, 10.4, 0, 1.2, 0, M('#ffd84a'));
      } else {
        part(2.8, 2.6, 10, 0, 2.3, 0, M('#4f6fb0')); part(2.9, 0.3, 10.2, 0, 3.7, 0, M('#f4f1ea')); part(2.9, 0.3, 10.4, 0, 1.2, 0, M('#ffd84a'));
        for (const z of [-3.2, -1.1, 1.1, 3.2]) for (const x of [-1.41, 1.41]) part(0.06, 1, 1.5, x, 2.7, z, M('#bfe6ff', { emissive: '#5f9fc8' }));
      }
      return root;
    };
    this.cars = [car('loco'), car('coach'), car('coach')];
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
      const q = this.at(this.s - this.dir * k * 11);
      c.position.set(q.x, q.y, q.z);
      c.rotation.set(-Math.atan(q.dy) * this.dir, Math.atan2(q.tx, q.tz) + (this.dir < 0 ? Math.PI : 0), 0);
    });
    const q = this.at(this.s - this.dir * 11);
    this.seat.set(q.x, q.y + 1.2, q.z); // 첫 객차
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
        if (Math.abs(lx) < 1.9 && Math.abs(lz) < 5.6) { this.hitCd = 1; this.onHit(sy * this.v, cy * this.v, lx); break; }
      }
    }
  }
}
