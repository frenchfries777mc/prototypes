// 헬리콥터: 상자로 조립한 기체. W/S 앞뒤, A/D 회전, Space 상승, Shift 하강. 조종하지 않으면 천천히 내려앉는다.
import { SEA, WORLD } from './terrain.js';
import { CAR_MASK } from './vehicles.js';
import { clamp, damp } from './util.js';
const B = window.BABYLON;
const G = 24; // 게임의 중력(vehicles.js와 같다)

export const HELI_PAL = {
  civ: { body: '#e5553f', trim: '#f4f1ea', glass: '#9fd3f2' },
  police: { body: '#2f4fa8', trim: '#f4f1ea', glass: '#9fd3f2' },
  army: { body: '#55623f', trim: '#3a4430', glass: '#7fa08a' },
};
function build(scene, pal) {
  const parts = [];
  const box = (w, h, d, x, y, z, hex) => {
    const m = B.MeshBuilder.CreateBox('heliPart', { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z);
    const c = B.Color3.FromHexString(hex), cols = [];
    for (let i = 0; i < m.getTotalVertices(); i++) cols.push(c.r, c.g, c.b, 1);
    m.setVerticesData(B.VertexBuffer.ColorKind, cols);
    parts.push(m);
  };
  box(2.0, 1.5, 3.0, 0, 1.25, 0.2, pal.body); box(1.7, 0.9, 1.0, 0, 1.45, 1.9, pal.glass); box(2.02, 0.5, 3.02, 0, 0.75, 0.2, pal.trim); // 몸통, 앞유리, 아래 띠
  box(0.5, 0.5, 3.4, 0, 1.5, -2.9, pal.body); box(0.16, 1.2, 0.7, 0, 2.0, -4.4, pal.trim); box(1.4, 0.1, 0.5, 0, 1.6, -4.3, pal.trim); // 꼬리
  box(0.5, 0.5, 0.5, 0, 2.2, 0.2, '#3a3d4d'); // 회전축
  for (const s of [-1, 1]) { box(0.14, 0.14, 3.4, s * 0.95, 0.12, 0.2, '#3a3d4d'); box(0.1, 0.5, 0.1, s * 0.95, 0.4, 1.0, '#3a3d4d'); box(0.1, 0.5, 0.1, s * 0.95, 0.4, -0.6, '#3a3d4d'); } // 착륙 다리
  const body = B.Mesh.MergeMeshes(parts, true, true);
  const mat = new B.StandardMaterial('heliMat', scene); mat.specularColor = new B.Color3(0.1, 0.1, 0.1); mat.ambientColor = new B.Color3(1, 1, 1);
  body.material = mat; body.useVertexColors = true; body.isPickable = false; body.receiveShadows = true;
  const rotor = B.Mesh.MergeMeshes([B.MeshBuilder.CreateBox('r1', { width: 7.4, height: 0.08, depth: 0.42 }, scene), B.MeshBuilder.CreateBox('r2', { width: 0.42, height: 0.08, depth: 7.4 }, scene)], true, true);
  const rm = new B.StandardMaterial('heliRotor', scene); rm.diffuseColor = B.Color3.FromHexString('#2c2c36'); rm.specularColor = B.Color3.Black(); rm.ambientColor = new B.Color3(1, 1, 1);
  rotor.material = rm; rotor.isPickable = false;
  const tail = B.MeshBuilder.CreateBox('heliTail', { width: 0.08, height: 1.5, depth: 0.22 }, scene); tail.material = rm; tail.isPickable = false;
  return { body, rotor, tail };
}

export class Heli {
  constructor(scene, x, y, z, yaw, addShadow, pal = HELI_PAL.civ) {
    this.scene = scene; this.key = 'heli'; this.isHeli = true;
    this.spec = { mass: 900, vmax: 30 };
    this.root = new B.TransformNode('heli', scene);
    this.root.position.set(x, y + 0.1, z);
    this.root.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
    this.home = { pos: this.root.position.clone(), rot: this.root.rotationQuaternion.clone() };
    const m = build(scene, pal);
    this.tilt = new B.TransformNode('heliTilt', scene); this.tilt.parent = this.root; // 기울어 보이는 것은 겉모습만
    m.body.parent = this.tilt; m.rotor.parent = this.tilt; m.rotor.position.set(0, 2.5, 0.2); m.tail.parent = this.tilt; m.tail.position.set(0.14, 2.0, -4.4);
    this.rotor = m.rotor; this.tailRotor = m.tail;
    this.parts = { body: m.body, wheels: [{ mesh: m.rotor }, { mesh: m.tail }] };
    if (addShadow) addShadow([m.body, m.rotor]);
    this.width = 2.2; this.length = 6.4; this.height = 2.5; this.zc = -1.0;
    const shape = new B.PhysicsShapeBox(new B.Vector3(0, 1.1, -0.2), B.Quaternion.Identity(), new B.Vector3(2.0, 2.2, 4.4), scene);
    shape.filterMembershipMask = CAR_MASK; shape.material = { friction: 0.8, restitution: 0.05 };
    this.body = new B.PhysicsBody(this.root, B.PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = shape;
    this.com = new B.Vector3(0, 0.6, 0);
    this.body.setMassProperties({ mass: this.spec.mass, centerOfMass: this.com, inertia: new B.Vector3(4000, 4000, 4000) });
    this.body.setLinearDamping(0.05); this.body.setAngularDamping(3);
    this.up = new B.Vector3(0, 1, 0); this.fwd = new B.Vector3(0, 0, 1); this.right = new B.Vector3(1, 0, 0);
    this.speed = 0; this.rpm = 0; this.restore = 0; this.wheels = []; this.hp = 100; this.dead = false; this.sunkT = 0; this.pitch = 0; this.roll = 0;
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
    const f = new B.Vector3(this.fwd.x, 0, this.fwd.z).normalize();
    this.speed = v.x * f.x + v.z * f.z;
    const on = !!input && !this.dead;
    this.rpm = damp(this.rpm, on ? 1 : 0, on ? 1.6 : 0.5, dt);
    let th = 0, st = 0, lift = 0;
    if (on) { th = input.throttle; st = input.steer; lift = input.lift || 0; }
    if (this.rpm > 0.25 && !this.dead) {
      // 날개가 도는 동안은 중력을 이기고, 오르내리는 속도와 앞뒤 속도를 목표에 맞춘다. 조종사가 없으면 천천히 내려앉는다.
      const wantY = on ? (lift > 0 ? 8 : lift < 0 ? -7 : 0) : -3.2;
      const wantF = th * (th > 0 ? this.spec.vmax : 10);
      const side = v.x * this.right.x + v.z * this.right.z;
      const imp = new B.Vector3(0, (G + clamp((wantY - v.y) * 3.2, -G * 0.9, 16)) * M * dt * this.rpm, 0);
      imp.addInPlace(f.scale(clamp((wantF - this.speed) * 1.4, -14, 14) * M * dt * this.rpm));
      imp.addInPlace(new B.Vector3(this.right.x, 0, this.right.z).scale(-side * 1.8 * M * dt * this.rpm)); // 옆으로 미끄러지지 않게
      body.applyImpulse(imp, this.com.rotateByQuaternionToRef(q, new B.Vector3()).addInPlace(p));
    }
    // 몸은 늘 바로 서 있고, 방향만 돈다.
    const tx = Math.asin(clamp(this.fwd.y, -1, 1)), tz = Math.asin(clamp(this.right.y, -1, 1));
    const loc = new B.Vector3(tx * 6, 0, -tz * 6);
    const world = this.right.scale(loc.x).add(this.fwd.scale(loc.z));
    body.setAngularVelocity(new B.Vector3(damp(w.x, world.x, 8, dt), damp(w.y, st * 1.7 * this.rpm, 6, dt), damp(w.z, world.z, 8, dt)));
    this.pitch = damp(this.pitch, clamp(this.speed / this.spec.vmax, -1, 1) * 0.3, 4, dt); this.roll = damp(this.roll, -st * 0.25 * this.rpm, 4, dt);
    // 물에 3초 잠기면 가라앉은 것으로 본다.
    this.sunkT = p.y < SEA - 0.6 ? this.sunkT + dt : 0;
    if (this.sunkT > 3) { this.sunkT = 0; this.drowned = true; }
    if (p.y > 260) body.setLinearVelocity(new B.Vector3(v.x, Math.min(v.y, 0), v.z)); // 너무 높이는 못 올라간다
    if (p.y < SEA - 40 || p.x < WORLD.x0 + 20 || p.x > WORLD.x1 - 20 || p.z < WORLD.z0 + 20 || p.z > WORLD.z1 - 20) this.reset(this.home.pos.x, this.home.pos.y + 0.5, this.home.pos.z, null);
  }
  reset(x, y, z, yaw) {
    this.body.disablePreStep = false;
    this.root.position.set(x, y, z);
    this.root.rotationQuaternion.copyFrom(yaw === null ? this.home.rot : B.Quaternion.RotationYawPitchRoll(yaw, 0, 0));
    this.body.setLinearVelocity(B.Vector3.Zero()); this.body.setAngularVelocity(B.Vector3.Zero());
    this.restore = 2; this.rpm = 0;
  }
  frame() {
    const dt = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
    this.rotor.rotation.y += this.rpm * 26 * dt; this.tailRotor.rotation.x += this.rpm * 34 * dt;
    this.tilt.rotation.x = this.pitch; this.tilt.rotation.z = this.roll;
  }
}
