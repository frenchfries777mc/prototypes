// 네모 캐릭터: 둥근 상자로 조립한 몸과, 물리가 아니라 스프링으로 만드는 흐느적거림.
// 플레이어와 주민이 같은 부품(지오메트리)을 공유하고 색만 인스턴스별로 다르게 넣는다.
import { roundedBox, damp, clamp, lerp, rng } from './util.js';
const B = window.BABYLON;

// 감쇠 스프링. 목표를 지나쳤다가 돌아오는 출렁임을 만든다.
class Spring {
  constructor(freq, damping) { this.x = 0; this.v = 0; this.f = freq; this.d = damping; }
  step(target, dt) {
    const w = this.f * 2 * Math.PI;
    this.v += (-2 * this.d * w * this.v - w * w * (this.x - target)) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export const LOOKS = {
  courier: { skin: '#ffd3a8', shirt: '#f2644b', pants: '#34456f', shoes: '#f5f1e8', head: 'cap', hat: '#f2644b', brim: '#fff7e6' },
};
const SKINS = ['#ffd3a8', '#f6c193', '#e0a878', '#c68a5c', '#9c6843', '#ffe0c2'];
const SHIRTS = ['#4f9bea', '#57c27a', '#f4c542', '#b072e0', '#f08fb0', '#3fc1c9', '#f28b3c', '#e8e4dc', '#6b7a99', '#d9534f'];
const PANTS = ['#34456f', '#4a4f5e', '#7a5b45', '#2f6b5a', '#8a8fa3', '#3b3b4d'];
const HAIRS = ['#3a2a22', '#6b4226', '#d8a657', '#1f1f28', '#b5482e', '#8d8d99'];
export function randomLook(seed) {
  const r = rng(seed);
  const head = r.pick(['hair', 'hair', 'cap', 'beanie', 'hair']);
  return { skin: r.pick(SKINS), shirt: r.pick(SHIRTS), pants: r.pick(PANTS), shoes: r.pick(['#f5f1e8', '#2c2c36', '#b55b3c']), head, hat: head === 'hair' ? r.pick(HAIRS) : r.pick(SHIRTS), brim: '#fff7e6' };
}

// 같은 크기의 부품은 원본 메시 하나를 공유한다.
const masters = new Map();
let partMat = null;
function master(scene, w, h, d, r) {
  const key = [w, h, d, r].join('_');
  let m = masters.get(key);
  if (!m) {
    m = roundedBox('part_' + key, w, h, d, r, scene);
    if (!partMat) {
      partMat = new B.StandardMaterial('characterMat', scene);
      partMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
      partMat.ambientColor = new B.Color3(1, 1, 1);
    }
    m.material = partMat;
    m.registerInstancedBuffer('color', 4);
    m.instancedBuffers.color = new B.Color4(1, 1, 1, 1);
    m.receiveShadows = true;
    m.isPickable = false;
    m.isVisible = false; // 원본은 그리지 않고 인스턴스만 그린다
    masters.set(key, m);
  }
  return m;
}

export class Character {
  constructor(scene, look = LOOKS.courier) {
    this.scene = scene;
    this.meshes = [];
    const part = (name, w, h, d, r, hex, parent, x, y, z) => {
      const p = master(scene, w, h, d, r).createInstance(name);
      const c = B.Color3.FromHexString(hex);
      p.instancedBuffers.color = new B.Color4(c.r, c.g, c.b, 1);
      p.parent = parent;
      p.position.set(x, y, z);
      p.isPickable = false;
      this.meshes.push(p);
      return p;
    };
    const node = (name, parent, x, y, z) => {
      const n = new B.TransformNode(name, scene);
      n.parent = parent;
      n.position.set(x, y, z);
      return n;
    };

    this.root = new B.TransformNode('character', scene); // 발바닥 위치, 몸의 방향
    this.tilt = node('tilt', this.root, 0, 0, 0); // 기울기와 찌그러짐
    const LEG = 0.42, TORSO = 0.58;
    this.hips = node('hips', this.tilt, 0, LEG, 0);
    this.torso = node('torso', this.hips, 0, 0, 0);
    part('torsoMesh', 0.66, TORSO, 0.44, 0.12, look.shirt, this.torso, 0, TORSO / 2, 0);

    this.neck = node('neck', this.torso, 0, TORSO - 0.02, 0);
    part('head', 0.94, 0.82, 0.88, 0.2, look.skin, this.neck, 0, 0.41, 0);
    if (look.head === 'cap') {
      part('capTop', 0.98, 0.3, 0.92, 0.12, look.hat, this.neck, 0, 0.74, -0.01);
      part('capBrim', 0.8, 0.07, 0.36, 0.03, look.brim, this.neck, 0, 0.63, 0.55);
    } else if (look.head === 'beanie') {
      part('beanie', 0.98, 0.3, 0.92, 0.12, look.hat, this.neck, 0, 0.74, 0);
      part('pom', 0.21, 0.2, 0.23, 0.08, look.brim, this.neck, 0, 0.95, 0);
    } else {
      part('hairTop', 0.98, 0.3, 0.92, 0.12, look.hat, this.neck, 0, 0.74, -0.02);
      part('hairBack', 0.8, 0.07, 0.36, 0.03, look.hat, this.neck, 0, 0.55, -0.42).rotation.x = Math.PI / 2;
    }
    this.eyeL = part('eyeL', 0.13, 0.24, 0.06, 0.03, '#22202b', this.neck, -0.2, 0.36, 0.43);
    this.eyeR = part('eyeR', 0.13, 0.24, 0.06, 0.03, '#22202b', this.neck, 0.2, 0.36, 0.43);
    part('cheekL', 0.14, 0.08, 0.04, 0.02, '#ff9d8a', this.neck, -0.33, 0.2, 0.43);
    part('cheekR', 0.14, 0.08, 0.04, 0.02, '#ff9d8a', this.neck, 0.33, 0.2, 0.43);
    part('mouth', 0.14, 0.08, 0.04, 0.02, '#22202b', this.neck, 0, 0.17, 0.44).scaling.y = 0.6;

    const arm = (side) => {
      const sh = node('shoulder' + side, this.torso, side * 0.42, TORSO - 0.1, 0);
      part('arm', 0.2, 0.34, 0.22, 0.07, look.shirt, sh, 0, -0.14, 0);
      part('hand', 0.21, 0.2, 0.23, 0.08, look.skin, sh, 0, -0.39, 0);
      return sh;
    };
    this.armL = arm(-1);
    this.armR = arm(1);
    const leg = (side) => {
      const hip = node('hip' + side, this.hips, side * 0.17, 0.04, 0);
      part('leg', 0.25, 0.3, 0.28, 0.07, look.pants, hip, 0, -0.15, 0);
      part('shoe', 0.27, 0.16, 0.38, 0.06, look.shoes, hip, 0, -0.36, 0.05);
      return hip;
    };
    this.legL = leg(-1);
    this.legR = leg(1);

    this.heading = 0;
    this.phase = Math.random() * 6;
    this.sPitch = new Spring(2.6, 0.32);
    this.sRoll = new Spring(2.6, 0.32);
    this.sSquash = new Spring(4.2, 0.3);
    this.sHeadP = new Spring(3.2, 0.3);
    this.sHeadR = new Spring(3.2, 0.3);
    this.sArm = new Spring(3.0, 0.35);
    this.blinkT = 1 + Math.random() * 3;
    this.air = 0;
    this.amp = 0;
    this.idleT = Math.random() * 10;
    this.wave = 0; // 0..1, 손 흔들기
    this.prevVel = new B.Vector3();
  }

  setVisible(v) { this.root.setEnabled(v); }
  // 부딪혔을 때 몸을 출렁이게 한다. (fx, fz)는 월드 기준 밀린 방향.
  bump(fx, fz, power = 1) {
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    this.sPitch.v += (fx * sh + fz * ch) * 2.4 * power;
    this.sRoll.v -= (fx * ch - fz * sh) * 2.4 * power;
    this.sSquash.v -= 1.2 * power;
  }

  // state: { pos(발바닥), vel, grounded, wishHeading|null, landed(충격 속도), jumped }
  update(dt, st) {
    const speed = Math.hypot(st.vel.x, st.vel.z);
    // 몸 방향은 가려는 쪽으로 부드럽게 돈다.
    let turn = 0;
    if (st.wishHeading !== null && st.wishHeading !== undefined) {
      let d = (st.wishHeading - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      const step = d * (1 - Math.exp(-13 * dt));
      this.heading += step;
      turn = step / Math.max(dt, 1e-4);
    }
    this.root.position.copyFrom(st.pos);
    this.root.rotation.y = this.heading;

    // 가속도를 몸 기준으로 바꿔서 반대쪽으로 기울인다. 스프링이라 멈출 때 앞뒤로 출렁인다.
    const ax = (st.vel.x - this.prevVel.x) / Math.max(dt, 1e-4), az = (st.vel.z - this.prevVel.z) / Math.max(dt, 1e-4);
    this.prevVel.copyFrom(st.vel);
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const aF = clamp(ax * sh + az * ch, -40, 40), aR = clamp(ax * ch - az * sh, -40, 40);
    const pitch = this.sPitch.step(aF * 0.011 + speed * 0.012, dt);
    const roll = this.sRoll.step(-aR * 0.011 - clamp(turn, -8, 8) * 0.018 * Math.min(speed / 6, 1), dt);

    if (st.jumped) this.sSquash.v += 3.2;
    if (st.landed > 0) this.sSquash.v -= clamp(st.landed * 0.55, 1.2, 6.5);
    const sq = clamp(this.sSquash.step(0, dt), -0.38, 0.4);
    this.tilt.scaling.set(1 - sq * 0.45, 1 + sq, 1 - sq * 0.45);
    this.tilt.rotation.x = pitch + (st.lie || 0);
    this.tilt.rotation.z = roll;

    this.air = damp(this.air, st.grounded ? 0 : 1, 14, dt);
    const moving = st.grounded && speed > 0.4;
    this.phase += dt * (moving ? 6.5 + speed * 0.95 : 0);
    const amp = moving ? clamp(speed / 6.5, 0.25, 1.15) : 0;
    this.amp = damp(this.amp, amp, 12, dt);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    this.idleT += dt;
    const breath = Math.sin(this.idleT * 2.1) * 0.012 * (1 - this.amp);

    // 다리: 걷기 흔들기 / 공중에서는 벌리고 버둥거린다.
    const kick = Math.sin(this.idleT * 13) * 0.35 * this.air;
    this.legL.rotation.x = lerp(s * 0.95 * this.amp, -0.35 + kick, this.air);
    this.legR.rotation.x = lerp(-s * 0.95 * this.amp, 0.3 - kick, this.air);
    this.legL.rotation.z = -0.12 * this.air;
    this.legR.rotation.z = 0.12 * this.air;
    this.hips.position.y = 0.42 + Math.abs(c) * 0.07 * this.amp + breath;
    this.torso.rotation.y = s * 0.16 * this.amp;
    this.torso.rotation.z = c * 0.05 * this.amp;

    // 팔: 다리와 반대로 흔들고, 스프링으로 한 박자 늦게 따라온다. 공중에서는 번쩍 든다.
    const armLag = this.sArm.step(pitch * 1.6, dt);
    const up = this.air * 2.5;
    this.armL.rotation.x = -s * 1.05 * this.amp - armLag - up * 0.25;
    this.armR.rotation.x = s * 1.05 * this.amp - armLag - up * 0.25;
    this.armL.rotation.z = -0.1 - up + Math.sin(this.idleT * 11) * 0.25 * this.air - roll * 1.2;
    const wv = this.wave * (2.6 + Math.sin(this.idleT * 12) * 0.35);
    this.armR.rotation.z = 0.1 + up - Math.sin(this.idleT * 11 + 1) * 0.25 * this.air - roll * 1.2 + wv;

    // 머리는 몸보다 늦게, 더 크게 흔들린다.
    this.neck.rotation.x = this.sHeadP.step(-pitch * 0.9, dt) + breath * 2;
    this.neck.rotation.z = this.sHeadR.step(-roll * 0.9, dt) + s * 0.04 * this.amp;
    this.neck.rotation.y = clamp(turn * 0.03, -0.5, 0.5) + (st.lookYaw || 0);

    this.blinkT -= dt;
    const blink = this.blinkT < 0.11 ? 0.12 : 1;
    if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3.5;
    this.eyeL.scaling.y = this.eyeR.scaling.y = blink;
  }
}
