// 운전할 수 있는 자동차. 차체는 Havok 강체 하나이고, 바퀴는 강체가 아니라
// 아래로 쏜 광선 네 개로 서스펜션·접지력·구동력을 계산한다(레이캐스트 차량).
import { clamp, damp } from './util.js';
import { SEA, WORLD } from './terrain.js';
const B = window.BABYLON;

export const CAR_MASK = 4; // 차체 충돌 그룹. 바퀴 광선과 카메라 광선이 자기 차를 무시하는 데 쓴다.
const G = 24;
const SUS_TOP = 0.45; // 바퀴 중심에서 광선 시작점까지의 높이
const SAG = 0.14; // 정지 상태에서 스프링이 눌린 길이
const DROOP = 0.3; // 바퀴가 아래로 늘어질 수 있는 길이

// 차종별 성격: mass 무게, engine 가속력, vmax 최고 속도(m/s), grip 접지력, steer 핸들이 꺾이는 정도.
const SPECS = {
  default: { mass: 900, engine: 10, vmax: 26, grip: 12, steer: 0.5 },
  'cars/sedan': { mass: 950, engine: 10, vmax: 27, grip: 12, steer: 0.5 },
  'cars/taxi': { mass: 950, engine: 11, vmax: 28, grip: 12, steer: 0.52 },
  'cars/hatchback-sports': { mass: 780, engine: 15, vmax: 36, grip: 14, steer: 0.58 },
  'cars/sedan-sports': { mass: 820, engine: 14, vmax: 34, grip: 13, steer: 0.55 },
  'cars/race': { mass: 650, engine: 19, vmax: 46, grip: 16, steer: 0.5 },
  'cars/suv': { mass: 1250, engine: 10, vmax: 26, grip: 12, steer: 0.46 },
  'cars/suv-luxury': { mass: 1300, engine: 12, vmax: 31, grip: 13, steer: 0.48 },
  'cars/police': { mass: 900, engine: 13, vmax: 27, grip: 13, steer: 0.55 },
  'cars/van': { mass: 1250, engine: 8.5, vmax: 23, grip: 11, steer: 0.44 },
  'cars/delivery': { mass: 1400, engine: 8, vmax: 22, grip: 11, steer: 0.42 },
  'cars/truck': { mass: 1500, engine: 7.5, vmax: 21, grip: 11, steer: 0.4 },
  'cars/garbage-truck': { mass: 2000, engine: 6.5, vmax: 18, grip: 11, steer: 0.36 },
  'cars/firetruck': { mass: 1900, engine: 8, vmax: 24, grip: 11, steer: 0.38 },
  'cars/tractor': { mass: 1100, engine: 7, vmax: 13, grip: 15, steer: 0.62 },
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
    this.parts = parts;
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
    this.body.setAngularDamping(1.0);
    this.ray = new B.PhysicsRaycastResult();
    this.steer = 0;
    this.speed = 0; // 앞쪽 방향 속도(m/s)
    this.hp = 100; this.dead = false;
    this.flipT = 0;
    this.safeT = 0; this.safe = null;
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
    const maxSteer = (this.spec.steer || 0.5) / (1 + speedAbs / 9);
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
      const mu = hand ? 0.6 : 1.9; // 접지 한계를 넉넉하게: 웬만해선 미끄러지지 않는다
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
    // 부딪힘: 속도가 한순간에 크게 바뀌면 차가 망가진다.
    if (this.pv && this.restore === 0 && !this.dead) {
      const dv = Math.hypot(v.x - this.pv.x, v.y - this.pv.y, v.z - this.pv.z);
      if (dv > 4.5) { this.hp -= (dv - 3.5) * 3; if (this.onCrash) this.onCrash(dv); }
    }
    this.pv = v.clone();
    // 뒤집히면 잠시 뒤 바로 세운다.
    this.flipT = this.up.y < 0.25 ? this.flipT + dt : 0;
    if (this.flipT > 1.6 && !this.dead) { this.reset(p.x, p.y + 1.2, p.z, this.yaw); this.flipT = 0; }
    // 바다에 빠지면 마지막으로 멀쩡히 서 있던 곳으로 돌아간다.
    this.safeT += dt;
    if (this.safeT > 1 && grounded >= 3 && this.up.y > 0.85 && p.y > SEA + 0.9) { this.safeT = 0; this.safe = { x: p.x, y: p.y, z: p.z, yaw: this.yaw }; }
    // 물에 빠지면 건져 주지 않는다: 3초 잠겨 있으면 가라앉은 것으로 본다(차는 사라져 제자리에 새로 나타나고, 타고 있던 사람은 쓰러진다).
    this.sunkT = p.y < SEA - 0.75 ? (this.sunkT || 0) + dt : 0;
    if (this.sunkT > 3) { this.sunkT = 0; this.drowned = true; }
    if (p.y < SEA - 40) this.reset(this.home.pos.x, this.home.pos.y + 0.5, this.home.pos.z, null);
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

// 배: 차와 같은 방식으로 타고 내린다. 네 귀퉁이의 부력으로 물에 뜨고, 뒤에서 미는 힘과 물의 저항으로 움직인다.
const BOAT_SPECS = { default: { mass: 600, thrust: 12.5, vmax: 19 }, 'watercraft/boat-tug-a': { mass: 900, thrust: 6, vmax: 11 } };
export class Boat {
  constructor(scene, assets, key, x, z, yaw) {
    this.scene = scene; this.key = key; this.isBoat = true;
    this.spec = BOAT_SPECS[key] || BOAT_SPECS.default;
    const mesh = assets.spawn(key);
    const bb = assets.bounds(key);
    this.root = new B.TransformNode('boat_' + key, scene);
    this.root.position.set(x, SEA - 0.3, z);
    this.root.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
    this.home = { pos: this.root.position.clone(), rot: this.root.rotationQuaternion.clone() };
    mesh.parent = this.root;
    this.width = bb.max.x - bb.min.x; this.length = bb.max.z - bb.min.z; this.height = 1.1; this.zc = (bb.max.z + bb.min.z) / 2;
    const shape = new B.PhysicsShapeBox(new B.Vector3(0, 0.55, this.zc), B.Quaternion.Identity(), new B.Vector3(this.width * 0.9, 1.1, this.length * 0.95), scene);
    shape.filterMembershipMask = CAR_MASK;
    shape.material = { friction: 0.04, restitution: 0.1 };
    this.body = new B.PhysicsBody(this.root, B.PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = shape;
    this.com = new B.Vector3(0, 0.15, this.zc);
    this.body.setMassProperties({ mass: this.spec.mass, centerOfMass: this.com });
    this.body.setLinearDamping(0.12); this.body.setAngularDamping(2.6);
    this.corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => new B.Vector3(a * this.width * 0.38, 0, this.zc + b * this.length * 0.4));
    this.up = new B.Vector3(0, 1, 0); this.fwd = new B.Vector3(0, 0, 1); this.right = new B.Vector3(1, 0, 0);
    this.speed = 0; this.steer = 0; this.flipT = 0; this.restore = 0; this.t = x * 0.37; this.wheels = [];
    this.hp = 100; this.dead = false; this.parts = { body: mesh };
  }
  get pos() { return this.root.position; }
  get yaw() { return Math.atan2(this.fwd.x, this.fwd.z); }
  fixedUpdate(dt, input) {
    const body = this.body, q = this.root.rotationQuaternion, p = this.root.position, M = this.spec.mass;
    if (this.restore > 0 && --this.restore === 0) body.disablePreStep = true;
    B.Vector3.Up().rotateByQuaternionToRef(q, this.up);
    B.Vector3.Forward().rotateByQuaternionToRef(q, this.fwd);
    B.Vector3.Right().rotateByQuaternionToRef(q, this.right);
    const v = body.getLinearVelocity(), w = body.getAngularVelocity();
    const comW = this.com.rotateByQuaternionToRef(q, new B.Vector3()).addInPlace(p);
    this.t += dt;
    const level = SEA + 0.05 + Math.sin(this.t * 1.1) * 0.05; // 잔잔한 너울
    let wet = 0;
    for (const c of this.corners) {
      const pt = c.rotateByQuaternionToRef(q, new B.Vector3()).addInPlace(p);
      const depth = level - pt.y;
      if (depth <= 0) continue;
      wet++;
      const vy = v.y + B.Vector3.Cross(w, pt.subtract(comW)).y;
      const F = clamp((M * G / 4) * (depth / 0.35) - vy * M * 1.6, 0, M * G);
      body.applyImpulse(new B.Vector3(0, F * dt, 0), pt);
    }
    const flatF = new B.Vector3(this.fwd.x, 0, this.fwd.z).normalize(), flatR = new B.Vector3(this.right.x, 0, this.right.z).normalize();
    const vf = B.Vector3.Dot(v, flatF), vs = B.Vector3.Dot(v, flatR);
    this.speed = vf;
    const afloat = wet >= 2;
    let imp = flatR.scale(-vs * M * (afloat ? 3.2 : 0.5) * dt).add(flatF.scale(-vf * M * (afloat ? 0.3 : 0.1) * dt));
    let yawRate = 0;
    if (input) {
      const th = input.throttle, top = th >= 0 ? this.spec.vmax : 6;
      imp = imp.add(flatF.scale(th * this.spec.thrust * (afloat ? 1 : 0.6) * M * Math.max(0, 1 - Math.pow(Math.abs(vf) / top, 2)) * dt));
      this.steer = damp(this.steer, input.steer, 6, dt);
      yawRate = this.steer * 1.0 * clamp(vf / 5, -1, 1) + this.steer * 0.25 * Math.abs(th);
    } else this.steer = damp(this.steer, 0, 6, dt);
    body.applyImpulse(imp, comW);
    body.setAngularVelocity(new B.Vector3(w.x, damp(w.y, yawRate, 5, dt), w.z));
    this.flipT = this.up.y < 0.2 ? this.flipT + dt : 0;
    if (this.flipT > 1.5 && !this.dead) { this.reset(p.x, SEA + 0.4, p.z, this.yaw); this.flipT = 0; }
    if (p.y < SEA - 4 || p.x < WORLD.x0 + 20 || p.x > WORLD.x1 - 20 || p.z < WORLD.z0 + 20 || p.z > WORLD.z1 - 20) this.reset(this.home.pos.x, SEA + 0.3, this.home.pos.z, null);
  }
  reset(x, y, z, yaw) {
    this.body.disablePreStep = false;
    this.root.position.set(x, y, z);
    this.root.rotationQuaternion.copyFrom(yaw === null ? this.home.rot : B.Quaternion.RotationYawPitchRoll(yaw, 0, 0));
    this.body.setLinearVelocity(B.Vector3.Zero()); this.body.setAngularVelocity(B.Vector3.Zero());
    this.restore = 2;
  }
  frame() {}
}

export class Garage {
  constructor(scene, assets, list, cell, roadY, heightFn) {
    // 마을 안은 칸 좌표(cx, cz), 마을 밖은 월드 좌표(x, z)로 적혀 있다.
    this.cars = list.map((p) => (p.x === undefined
      ? new Vehicle(scene, assets, p.m, p.cx * cell, roadY, p.cz * cell, ((p.r || 0) * Math.PI) / 180)
      : new Vehicle(scene, assets, p.m, p.x, heightFn(p.x, p.z) + 0.3, p.z, ((p.r || 0) * Math.PI) / 180)));
  }
  addBoats(scene, assets, spots) { for (const b of spots) this.cars.push(new Boat(scene, assets, b.m || 'watercraft/boat-speed-a', b.x, b.z, b.yaw)); }
  // 터진 차는 움직이지 않는다. 경찰차처럼 스스로 모는 차는 ai()가 조작을 돌려준다.
  fixedUpdate(dt, driven, input) { for (const c of this.cars) c.fixedUpdate(dt, c.dead ? null : c.ai ? c.ai(dt) : c === driven ? input : null); }
  frame() { for (const c of this.cars) c.frame(); }
  nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) - c.width * 0.5;
      if (d < bd && !c.police && Math.abs(c.pos.y - pos.y) < 3) { bd = d; best = c; }
    }
    return best;
  }
}
