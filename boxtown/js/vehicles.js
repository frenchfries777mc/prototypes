// 운전할 수 있는 자동차. 차체는 Havok 강체 하나이고, 바퀴는 강체가 아니라
// 아래로 쏜 광선 네 개로 서스펜션·접지력·구동력을 계산한다(레이캐스트 차량).
import { clamp, damp } from './util.js';
import { SEA } from './terrain.js';
const B = window.BABYLON;

export const CAR_MASK = 4; // 차체 충돌 그룹. 바퀴 광선과 카메라 광선이 자기 차를 무시하는 데 쓴다.
const G = 24;
const SUS_TOP = 0.45; // 바퀴 중심에서 광선 시작점까지의 높이
const SAG = 0.14; // 정지 상태에서 스프링이 눌린 길이
const DROOP = 0.3; // 바퀴가 아래로 늘어질 수 있는 길이

const SPECS = {
  default: { mass: 900, engine: 11, vmax: 27, grip: 11 },
  'cars/hatchback-sports': { mass: 800, engine: 15, vmax: 36, grip: 12 },
  'cars/sedan-sports': { mass: 820, engine: 14, vmax: 34, grip: 12 },
  'cars/police': { mass: 900, engine: 14, vmax: 33, grip: 12 },
  'cars/truck': { mass: 1400, engine: 8, vmax: 22, grip: 10 },
  'cars/firetruck': { mass: 1800, engine: 8, vmax: 22, grip: 10 },
  'cars/delivery': { mass: 1300, engine: 9, vmax: 23, grip: 10 },
  'cars/van': { mass: 1200, engine: 9, vmax: 24, grip: 10 },
};

const tmp = { a: new B.Vector3(), b: new B.Vector3(), c: new B.Vector3() };

export class Vehicle {
  constructor(scene, assets, key, x, y, z, yaw) {
    this.scene = scene;
    this.key = key;
    this.spec = SPECS[key] || SPECS.default;
    const parts = assets.spawnCar(key);
    this.root = new B.TransformNode('car_' + key, scene);
    this.root.position.set(x, y + 0.05, z);
    this.root.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
    this.home = { pos: this.root.position.clone(), rot: this.root.rotationQuaternion.clone() };
    parts.body.parent = this.root;
    this.width = parts.max.x - parts.min.x;
    this.length = parts.max.z - parts.min.z;
    this.height = parts.max.y;
    this.zc = (parts.max.z + parts.min.z) / 2;
    this.wheels = parts.wheels.map((w) => {
      w.mesh.parent = this.root;
      w.mesh.position.copyFrom(w.pos);
      return { mesh: w.mesh, lx: w.pos.x, lz: w.pos.z, r: w.pos.y, front: w.pos.z > 0, y: w.pos.y, spin: 0, grounded: false };
    });
    const M = this.spec.mass;
    this.k = (M * G) / (4 * SAG);
    this.c = 2 * Math.sqrt((this.k * M) / 4) * 0.5;
    const bottom = 0.42;
    const shape = new B.PhysicsShapeBox(new B.Vector3(0, (this.height + bottom) / 2, this.zc), B.Quaternion.Identity(),
      new B.Vector3(this.width * 0.94, this.height - bottom, this.length * 0.97), scene);
    shape.filterMembershipMask = CAR_MASK;
    shape.material = { friction: 0.3, restitution: 0.1 };
    this.body = new B.PhysicsBody(this.root, B.PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = shape;
    this.com = new B.Vector3(0, 0.42, this.zc);
    this.body.setMassProperties({ mass: M, centerOfMass: this.com });
    this.body.setLinearDamping(0.04);
    this.body.setAngularDamping(1.1);
    this.ray = new B.PhysicsRaycastResult();
    this.steer = 0;
    this.speed = 0; // 앞쪽 방향 속도(m/s)
    this.flipT = 0;
    this.driven = false;
    this.restore = 0;
    this.up = new B.Vector3(0, 1, 0); this.fwd = new B.Vector3(0, 0, 1); this.right = new B.Vector3(1, 0, 0);
  }

  get pos() { return this.root.position; }
  get yaw() { return Math.atan2(this.fwd.x, this.fwd.z); }

  // 물리 한 스텝 직전에 호출. input이 null이면 아무도 타지 않은 상태(주차 브레이크).
  fixedUpdate(dt, input) {
    const body = this.body, q = this.root.rotationQuaternion, p = this.root.position;
    // reset()으로 옮긴 위치가 물리 쪽에 한 스텝 반영된 뒤에 다시 물리가 위치를 주도하게 한다.
    if (this.restore > 0 && --this.restore === 0) body.disablePreStep = true;
    B.Vector3.Up().rotateByQuaternionToRef(q, this.up);
    B.Vector3.Forward().rotateByQuaternionToRef(q, this.fwd);
    B.Vector3.Right().rotateByQuaternionToRef(q, this.right);
    const v = body.getLinearVelocity(), w = body.getAngularVelocity();
    const comW = this.com.rotateByQuaternionToRef(q, tmp.a).add(p);
    this.speed = B.Vector3.Dot(v, this.fwd);
    const M4 = this.spec.mass / 4;
    const throttle = input ? input.throttle : 0;
    const speedAbs = Math.abs(this.speed);
    // 빠를수록 핸들이 덜 꺾인다.
    const maxSteer = 0.62 / (1 + speedAbs / 11);
    this.steer = damp(this.steer, input ? input.steer * maxSteer : 0, 9, dt);
    const phys = this.scene.getPhysicsEngine();
    const pointVel = (pt) => v.add(B.Vector3.Cross(w, pt.subtract(comW)));
    let grounded = 0;
    for (const wh of this.wheels) {
      const top = new B.Vector3(wh.lx, wh.r + SUS_TOP, wh.lz).rotateByQuaternionToRef(q, new B.Vector3()).addInPlace(p);
      const len = SUS_TOP + wh.r + DROOP;
      const end = top.subtract(this.up.scale(len));
      phys.raycastToRef(top, end, this.ray, { collideWith: ~CAR_MASK });
      if (!this.ray.hasHit) { wh.grounded = false; wh.y = damp(wh.y, wh.r - DROOP, 14, dt); continue; }
      wh.grounded = true; grounded++;
      const d = this.ray.hitDistance;
      const n = this.ray.hitNormalWorld.y > 0.35 ? this.ray.hitNormalWorld.clone() : this.up.clone();
      const hit = this.ray.hitPointWorld.clone();
      wh.y = clamp(wh.r + SUS_TOP - d + wh.r, wh.r - DROOP, wh.r + 0.25);
      // 서스펜션: 스프링 + 댐퍼
      const x = SUS_TOP + wh.r + SAG - d;
      const vUp = B.Vector3.Dot(pointVel(top), n);
      const F = clamp(this.k * x - this.c * vUp, 0, this.k * 0.6);
      body.applyImpulse(n.scale(F * dt), top);
      // 접지면 기준 앞/옆 방향
      const a = wh.front ? this.steer : 0;
      let f = this.fwd.scale(Math.cos(a)).add(this.right.scale(Math.sin(a)));
      f = f.subtract(n.scale(B.Vector3.Dot(f, n))).normalize();
      const s = B.Vector3.Cross(n, f).normalize();
      const vc = pointVel(hit), vf = B.Vector3.Dot(vc, f), vs = B.Vector3.Dot(vc, s);
      const hand = input && input.handbrake && !wh.front;
      // 옆 방향: 미끄러지는 속도를 지운다. 접지 한계를 넘으면 미끄러진다(드리프트).
      const mu = hand ? 0.55 : 1.55;
      const Fs = clamp(-vs * M4 * this.spec.grip, -mu * F, mu * F);
      // 앞 방향: 구동, 제동, 굴림 저항
      let Fl;
      if (!input) Fl = clamp(-vf * M4 * 8, -F, F);
      else if (hand) Fl = clamp(-vf * M4 * 10, -0.9 * F, 0.9 * F);
      else if (Math.abs(throttle) > 0.05) {
        if (Math.sign(throttle) !== Math.sign(vf) && Math.abs(vf) > 1.2) Fl = -Math.sign(vf) * 22 * M4; // 반대로 밟으면 브레이크
        else {
          const top2 = throttle > 0 ? this.spec.vmax : 9;
          Fl = throttle * this.spec.engine * M4 * Math.max(0, 1 - Math.pow(Math.abs(vf) / top2, 2));
        }
      } else Fl = -vf * M4 * 0.9;
      // 힘을 무게중심 높이 근처에 줘서 가속·선회 때 차가 과하게 쏠리지 않게 한다.
      const at = hit.add(this.up.scale(0.32));
      body.applyImpulse(f.scale(Fl * dt).add(s.scale(Fs * dt)), at);
      wh.spin += (vf / wh.r) * dt;
    }
    this.groundedWheels = grounded;
    // 뒤집히면 잠시 뒤 바로 세운다.
    this.flipT = this.up.y < 0.25 ? this.flipT + dt : 0;
    if (this.flipT > 1.6) { this.reset(p.x, p.y + 1.2, p.z, this.yaw); this.flipT = 0; }
    if (p.y < SEA - 2.5) this.reset(this.home.pos.x, this.home.pos.y + 0.5, this.home.pos.z, null); // 바다에 빠지면 제자리로
  }

  reset(x, y, z, yaw) {
    this.body.disablePreStep = false;
    this.root.position.set(x, y, z);
    this.root.rotationQuaternion.copyFrom(yaw === null ? this.home.rot : B.Quaternion.RotationYawPitchRoll(yaw, 0, 0));
    this.body.setLinearVelocity(B.Vector3.Zero());
    this.body.setAngularVelocity(B.Vector3.Zero());
    this.restore = 2;
  }

  // 바퀴 모양 갱신(화면용)
  frame() {
    for (const wh of this.wheels) {
      wh.mesh.position.y = wh.y;
      wh.mesh.rotation.set(wh.spin, wh.front ? this.steer : 0, 0);
    }
  }
}

export class Garage {
  constructor(scene, assets, list, cell, roadY) {
    this.cars = list.map((p) => new Vehicle(scene, assets, p.m, p.cx * cell, roadY, p.cz * cell, ((p.r || 0) * Math.PI) / 180));
  }
  fixedUpdate(dt, driven, input) { for (const c of this.cars) c.fixedUpdate(dt, c === driven ? input : null); }
  frame() { for (const c of this.cars) c.frame(); }
  nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) - c.width * 0.5;
      if (d < bd && Math.abs(c.pos.y - pos.y) < 3) { bd = d; best = c; }
    }
    return best;
  }
}
