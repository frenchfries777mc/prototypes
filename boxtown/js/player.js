// 입력, 캐릭터 이동(Havok 캐릭터 컨트롤러), 3인칭 카메라.
import { clamp, damp } from './util.js';
import { SEA } from './terrain.js';
import { CAR_MASK } from './vehicles.js';
const B = window.BABYLON;

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.lookX = 0; this.lookY = 0; // 이번 프레임에 쌓인 시점 이동량(픽셀)
    this.stick = { x: 0, y: 0 };
    this.jumpQueued = false;
    this.useQueued = false;
    this.touchUse = false;
    this.driving = false;
    this.attackHeld = false; this.attackQueued = false; this.weaponPick = -1; this.weaponNext = false;
    this.wheel = 0; this.gas = 0; this.pedalBrake = 0;
    this.jumpHeld = false;
    this.touchRun = false;
    this.locked = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
      if (e.code === 'KeyE' && !e.repeat) this.useQueued = true;
      if (/^Digit[1-9]$/.test(e.code)) this.weaponPick = +e.code.slice(5) - 1;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => { if (!this.isTouch && !this.locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    let dragging = false;
    // 마우스가 고정된 상태에서 왼쪽 버튼은 공격이다.
    canvas.addEventListener('mousedown', (e) => { dragging = true; if (this.locked && e.button === 0) { this.attackHeld = true; this.attackQueued = true; } });
    addEventListener('mouseup', () => { dragging = false; this.attackHeld = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked || dragging) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    this._touch(canvas);
  }

  _touch(canvas) {
    const pad = document.getElementById('stick'), knob = document.getElementById('stickKnob');
    const jump = document.getElementById('btnJump'), run = document.getElementById('btnRun'), use = document.getElementById('btnUse');
    let moveId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0;
    const R = 56;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (!this.driving && t.clientX < innerWidth * 0.45 && moveId === null) {
          moveId = t.identifier; ox = t.clientX; oy = t.clientY;
          pad.style.display = 'block'; pad.style.left = ox - 70 + 'px'; pad.style.top = oy - 70 + 'px';
          knob.style.transform = 'translate(0px,0px)';
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          let dx = t.clientX - ox, dy = t.clientY - oy;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          this.stick.x = dx / R; this.stick.y = -dy / R;
          knob.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (t.identifier === lookId) {
          this.lookX += (t.clientX - lx) * 1.6; this.lookY += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) { moveId = null; this.stick.x = this.stick.y = 0; pad.style.display = 'none'; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
    if (jump) {
      jump.addEventListener('touchstart', (e) => { e.preventDefault(); this.jumpQueued = true; this.jumpHeld = true; }, { passive: false });
      jump.addEventListener('touchend', () => { this.jumpHeld = false; });
    }
    if (use) {
      use.addEventListener('touchstart', (e) => { e.preventDefault(); this.useQueued = true; this.touchUse = true; }, { passive: false });
      use.addEventListener('touchend', () => { this.touchUse = false; });
      use.addEventListener('touchcancel', () => { this.touchUse = false; });
    }
    if (run) run.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchRun = !this.touchRun; run.classList.toggle('on', this.touchRun); }, { passive: false });
    this.releaseStick = () => { moveId = null; this.stick.x = this.stick.y = 0; pad.style.display = 'none'; };

    // ----- 운전용 터치 조작: 왼쪽 운전대, 오른쪽 엑셀과 브레이크 -----
    const wheel = document.getElementById('wheel'), rim = document.getElementById('wheelRim');
    const MAX = 2.1; // 운전대를 끝까지 돌린 각도(약 120도)
    let wid = null, last = 0, ang = 0;
    const angleAt = (t) => { const r = wheel.getBoundingClientRect(); return Math.atan2(t.clientX - (r.left + r.width / 2), -(t.clientY - (r.top + r.height / 2))); };
    const setWheel = (a) => { ang = a; this.wheel = a / MAX; rim.style.transform = `rotate(${a}rad)`; };
    wheel.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (wid !== null) return;
      const t = e.changedTouches[0];
      wid = t.identifier; last = angleAt(t); rim.classList.add('hold');
    }, { passive: false });
    wheel.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== wid) continue;
        // 손가락이 운전대 중심 둘레로 돈 만큼 운전대가 돈다.
        const a = angleAt(t);
        let d = a - last;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        last = a;
        setWheel(clamp(ang + d, -MAX, MAX));
      }
    }, { passive: false });
    const wheelEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === wid) { wid = null; rim.classList.remove('hold'); setWheel(0); } }; // 놓으면 가운데로 돌아온다
    wheel.addEventListener('touchend', wheelEnd);
    wheel.addEventListener('touchcancel', wheelEnd);
    this.releaseWheel = () => { wid = null; rim.classList.remove('hold'); setWheel(0); };
    const pedal = (id, prop) => {
      const el = document.getElementById(id);
      const set = (v) => (e) => { if (v) e.preventDefault(); this[prop] = v; el.classList.toggle('on', !!v); };
      el.addEventListener('touchstart', set(1), { passive: false });
      el.addEventListener('touchend', set(0));
      el.addEventListener('touchcancel', set(0));
    };
    // 공격과 무기 바꾸기 버튼
    const atk = document.getElementById('btnAttack'), wp = document.getElementById('btnWeapon');
    atk.addEventListener('touchstart', (e) => { e.preventDefault(); this.attackHeld = true; this.attackQueued = true; atk.classList.add('on'); }, { passive: false });
    for (const ev of ['touchend', 'touchcancel']) atk.addEventListener(ev, () => { this.attackHeld = false; atk.classList.remove('on'); });
    wp.addEventListener('touchstart', (e) => { e.preventDefault(); this.weaponNext = true; }, { passive: false });
    pedal('btnGas', 'gas');
    pedal('btnBrake', 'pedalBrake');
    // 터치가 한 번이라도 들어오면 터치 조작 화면으로 바꾼다(터치 되는 노트북·태블릿 대응).
    addEventListener('touchstart', () => { this.isTouch = true; document.body.classList.add('touch'); }, { once: true, passive: true });
  }

  // 차에 타고 내릴 때 조작 화면을 바꾼다.
  setDriving(on) {
    this.driving = on;
    document.body.classList.toggle('driving', on);
    this.releaseStick(); this.releaseWheel();
    this.gas = this.pedalBrake = 0;
    for (const id of ['btnGas', 'btnBrake']) document.getElementById(id).classList.remove('on');
  }
  // 운전 입력: 키보드와 화면 조작을 합친다. throttle +1 가속, -1 브레이크·후진.
  drive() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.wheel;
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.gas - this.pedalBrake;
    return { throttle: clamp(y, -1, 1), steer: clamp(x, -1, 1), handbrake: this.brake };
  }

  move() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    x += this.stick.x; y += this.stick.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  get useHeld() { return this.keys.has('KeyE') || this.touchUse; }
  get brake() { return this.keys.has('Space') || this.jumpHeld; }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchRun; }
}

const CAP_H = 1.7, CAP_R = 0.4, GRAVITY = -24;
const WALK = 6.2, SPRINT = 9.8, JUMP_V = 9.4;
const FOOT_PAD = 0.13; // 컨트롤러가 바닥과 띄워 두는 간격만큼 몸을 내려 그린다

export class Player {
  constructor(scene, input, character, spawn, garage) {
    this.scene = scene; this.input = input; this.chr = character; this.spawn = spawn; this.garage = garage;
    this.vehicle = null; // 타고 있는 차
    this.nearCar = null; // 탈 수 있을 만큼 가까운 차
    this.lookIdle = 9; // 마우스로 시점을 안 건드린 시간
    this.onUse = null;
    this.faceT = 0; this.faceYaw = 0; this.kick = null;
    this.shoulder = 0; this.shoulderK = 0; // 총을 들면 카메라가 어깨 너머로 옮겨 간다
    this.shake = 0;
    this.inside = false; // 건물 안에 있는지 // E를 눌렀을 때 먼저 불리는 함수(직업 시스템이 건다)
    this.cc = new B.PhysicsCharacterController(new B.Vector3(spawn.x, spawn.y + CAP_H / 2 + 0.2, spawn.z), { capsuleHeight: CAP_H, capsuleRadius: CAP_R }, scene);
    this.cc.maxSlopeCosine = Math.cos(50 * Math.PI / 180);
    this.cc.characterMass = 70;
    this.cc.characterStrength = 6000;
    this.grav = new B.Vector3(0, GRAVITY, 0);
    this.down = new B.Vector3(0, -1, 0);
    this.vel = new B.Vector3();
    this.grounded = false; this.airT = 0; this.jumpBuf = 0; this.landed = 0; this.jumped = false; this.jumpGrace = 0;
    this.wishHeading = null;
    this.feet = new B.Vector3(spawn.x, spawn.y, spawn.z);

    this.cam = new B.FreeCamera('cam', new B.Vector3(spawn.x, spawn.y + 6, spawn.z - 10), scene);
    this.cam.fov = 0.95; this.cam.minZ = 0.3; this.cam.maxZ = 4500;
    this.cam.inputs.clear();
    this.yaw = spawn.yaw || 0; this.pitch = 0.3; this.dist = 6.8; this.curDist = 6.8;
    this.target = new B.Vector3(spawn.x, spawn.y + 1.5, spawn.z);
    this.ray = new B.PhysicsRaycastResult();
    this.freeCam = null; // 디버그·촬영용 고정 시점
    this.chr.heading = this.yaw;

    scene.onBeforePhysicsObservable.add(() => this.fixed());
    scene.onAfterPhysicsObservable.add(() => this.step());
    scene.onBeforeRenderObservable.add(() => this.frame());
  }

  // 물리 스텝 직전: 자동차에 힘을 준다.
  fixed() {
    const dt = clamp(this.scene.getEngine().getDeltaTime() / 1000, 0.001, 0.05);
    this.garage.fixedUpdate(dt, this.vehicle, this.input.drive());
  }

  enter(car) {
    this.vehicle = car;
    this.input.setDriving(true);
    this.chr.setVisible(false);
    this.cc.setPosition(new B.Vector3(car.pos.x, car.pos.y + 400, car.pos.z)); // 캐릭터 충돌체는 멀리 치워 둔다
    this.cc.setVelocity(B.Vector3.Zero());
    this.input.jumpQueued = false;
  }
  exit() {
    const car = this.vehicle;
    // 운전석(왼쪽) 문 옆으로 내린다. 막혀 있으면 오른쪽, 그래도 막혀 있으면 지붕 위.
    const phys = this.scene.getPhysicsEngine();
    let out = null;
    for (const side of [-1, 1]) {
      const p = car.pos.add(car.right.scale(side * (car.width / 2 + 0.95))).addInPlaceFromFloats(0, 0.9, 0);
      phys.raycastToRef(car.pos.add(new B.Vector3(0, 0.9, 0)), p, this.ray, { collideWith: ~CAR_MASK });
      if (!this.ray.hasHit) { out = p; break; }
    }
    if (car.isBoat) {
      // 배에서는 가까운 땅이나 잔교를 찾아 내린다. 없으면 갑판 위에 선다.
      out = null;
      for (let rad = 2.5; rad <= 8.5 && !out; rad += 1.5) {
        for (let k = 0; k < 12 && !out; k++) {
          const x = car.pos.x + Math.sin(k * 0.5236) * rad, z = car.pos.z + Math.cos(k * 0.5236) * rad;
          phys.raycastToRef(new B.Vector3(x, car.pos.y + 4, z), new B.Vector3(x, car.pos.y - 3, z), this.ray, { collideWith: ~CAR_MASK });
          if (this.ray.hasHit && this.ray.hitPointWorld.y > SEA + 0.3) out = new B.Vector3(x, this.ray.hitPointWorld.y + 0.9, z);
        }
      }
    }
    if (!out) out = car.pos.add(new B.Vector3(0, car.height + 0.6, 0));
    this.vehicle = null;
    this.input.setDriving(false);
    this.cc.setPosition(new B.Vector3(out.x, out.y + 0.4, out.z));
    this.cc.setVelocity(B.Vector3.Zero());
    this.vel.set(0, 0, 0);
    this.chr.heading = car.yaw;
    this.chr.setVisible(true);
    this.input.jumpQueued = false;
  }

  step() {
    const dt = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
    if (dt <= 0) return;
    const inp = this.input, cc = this.cc;
    const use = inp.useQueued;
    inp.useQueued = false;
    if (this.vehicle) {
      const car = this.vehicle;
      if (use && Math.abs(car.speed) < 6) { this.exit(); this.feet.copyFrom(this.cc.getPosition()); return; }
      else {
        this.feet.copyFrom(car.pos);
        this.nearCar = null;
        return;
      }
    }
    this.nearCar = this.garage.nearest(this.feet, 2.6);
    // E: 직업 쪽에서 먼저 쓸 일이 있으면 그쪽이 우선이고, 아니면 차에 탄다.
    if (use && !(this.onUse && this.onUse()) && this.nearCar) { this.enter(this.nearCar); this.feet.copyFrom(this.vehicle.pos); return; }
    const sup = cc.checkSupport(dt, this.down);
    const was = this.grounded;
    this.jumpGrace -= dt;
    // 점프 직후 몇 프레임은 아직 바닥에 닿아 있다고 판정되므로, 그동안은 공중으로 취급한다.
    this.grounded = this.jumpGrace <= 0 && sup.supportedState === B.CharacterSupportedState.SUPPORTED;
    const v = cc.getVelocity();
    this.landed = 0; this.jumped = false;
    if (this.grounded && !was) this.landed = Math.max(0, -this.vel.y);
    this.airT = this.grounded ? 0 : this.airT + dt;
    if (inp.jumpQueued) { this.jumpBuf = 0.14; inp.jumpQueued = false; }
    this.jumpBuf -= dt;

    const mv = inp.move();
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = sy * mv.y + cy * mv.x, wz = cy * mv.y - sy * mv.x;
    const mag = Math.hypot(wx, wz);
    const top = inp.sprint ? SPRINT : WALK;
    const tx = wx * top, tz = wz * top;
    // 땅에서는 빠르게 붙고, 공중에서는 살짝만 방향을 바꿀 수 있다.
    const acc = (this.grounded ? (mag > 0.05 ? 46 : 38) : 14) * dt;
    let hx = v.x, hz = v.z;
    // 폭발 등으로 밀려날 때
    const kick = this.kick;
    this.kick = null;
    const dx = tx - hx, dz = tz - hz, dl = Math.hypot(dx, dz);
    if (dl <= acc) { hx = tx; hz = tz; } else { hx += (dx / dl) * acc; hz += (dz / dl) * acc; }
    let vy = v.y;
    if (this.grounded) {
      // 땅 위에서는 비탈면을 따라 움직인다: 내리막에서는 바닥을 따라 내려가고, 가만히 서 있으면 미끄러지지 않는다.
      const n = sup.averageSurfaceNormal;
      vy = n && n.y > 0.3 ? clamp(-(hx * n.x + hz * n.z) / n.y, -12, 12) : 0;
    }
    else vy = Math.max(vy + GRAVITY * dt, -45);
    if (this.jumpBuf > 0 && (this.grounded || this.airT < 0.12)) {
      vy = JUMP_V; this.jumpBuf = 0; this.jumped = true; this.airT = 1; this.grounded = false; this.jumpGrace = 0.18;
    }
    if (kick) { hx += kick.x; hz += kick.z; vy = kick.y; this.grounded = false; this.jumpGrace = 0.25; this.airT = 1; }
    this.vel.set(hx, vy, hz);
    cc.setVelocity(this.vel);
    cc.integrate(dt, sup, this.grav);
    this.wishHeading = mag > 0.1 ? Math.atan2(wx, wz) : null;
    if (this.faceT > 0) { this.faceT -= dt; this.wishHeading = this.faceYaw; } // 공격 중에는 겨눈 쪽을 본다

    const p = cc.getPosition();
    // 물에 빠지면 마지막으로 땅을 딛고 있던 곳으로 돌아간다.
    this.safeT = (this.safeT || 0) + dt;
    if (this.safeT > 0.7 && this.grounded && p.y > SEA + 1.6) { this.safeT = 0; this.spawn = { x: p.x, y: p.y - CAP_H / 2, z: p.z, yaw: this.yaw }; }
    if (p.y < SEA - 30) this.respawn(); // 세계 밖으로 떨어졌을 때만(물에 빠진 것은 health.js가 맡는다)
    this.feet.set(p.x, p.y - CAP_H / 2 - FOOT_PAD, p.z);
    this.chr.update(dt, { pos: this.feet, vel: cc.getVelocity(), grounded: this.grounded || this.airT < 0.1, wishHeading: this.wishHeading, landed: this.landed, jumped: this.jumped });
  }

  respawn() {
    const s = this.spawn;
    this.cc.setPosition(new B.Vector3(s.x, s.y + CAP_H / 2 + 0.5, s.z));
    this.cc.setVelocity(B.Vector3.Zero());
  }
  teleport(x, y, z) { this.cc.setPosition(new B.Vector3(x, y + CAP_H / 2 + 0.1, z)); this.cc.setVelocity(B.Vector3.Zero()); }

  frame() {
    const dt = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
    const inp = this.input;
    this.yaw += inp.lookX * 0.0028;
    this.pitch = clamp(this.pitch + inp.lookY * 0.0024, -0.45, 1.3);
    this.lookIdle = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 0.5 ? 0 : this.lookIdle + dt;
    if (this.vehicle && !this.freeCam) { this.driveCam(dt); inp.lookX = inp.lookY = 0; return; }
    if (this.freeCam) {
      this.cam.position.copyFrom(this.freeCam.pos);
      this.cam.setTarget(this.freeCam.target);
      return;
    }
    let t = this.target;
    t.x = damp(t.x, this.feet.x, 18, dt);
    t.z = damp(t.z, this.feet.z, 18, dt);
    t.y = damp(t.y, this.feet.y + 1.45, 9, dt); // 높이는 천천히 따라가서 점프가 덜 어지럽다
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new B.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    // 어깨 너머 시점: 조준점이 캐릭터에 가리지 않도록 카메라를 오른쪽 위로 옮긴다.
    this.shoulderK = damp(this.shoulderK, this.shoulder, 8, dt);
    const base = t;
    t = base.add(new B.Vector3(Math.cos(this.yaw) * 0.95 * this.shoulderK, 0.3 * this.shoulderK, -Math.sin(this.yaw) * 0.95 * this.shoulderK));
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.2); t.addInPlaceFromFloats((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); }
    // 카메라와 캐릭터 사이에 벽이 있으면 벽 앞까지 당긴다.
    let want = this.dist;
    const phys = this.scene.getPhysicsEngine();
    if (phys) {
      phys.raycastToRef(t, t.add(dir.scale(this.dist + 0.4)), this.ray);
      // 너무 바짝 붙으면 얼굴만 보이므로 2.2m 안쪽으로는 당기지 않는다(가는 기둥은 그냥 통과).
      if (this.ray.hasHit) want = clamp(this.ray.hitDistance - 0.4, 2.2, this.dist);
    }
    this.curDist = want < this.curDist ? want : damp(this.curDist, want, 4, dt);
    this.cam.position.copyFrom(t).addInPlace(dir.scale(this.curDist));
    this.cam.setTarget(t);
    inp.lookX = inp.lookY = 0;
  }

  // 운전 중 카메라: 차 뒤를 따라가고, 마우스를 놓고 달리면 진행 방향으로 돌아온다.
  driveCam(dt) {
    const car = this.vehicle, t = this.target;
    if (this.lookIdle > 1.0 && Math.abs(car.speed) > 2.5) {
      const want = car.speed >= 0 ? car.yaw : car.yaw + Math.PI;
      let d = (want - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-2.6 * dt));
      this.pitch = damp(this.pitch, 0.3, 2, dt);
    }
    t.x = damp(t.x, car.pos.x, 16, dt);
    t.z = damp(t.z, car.pos.z, 16, dt);
    t.y = damp(t.y, car.pos.y + 1.6, 8, dt);
    const pitch = clamp(this.pitch, 0.05, 1.3);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dir = new B.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const full = 9.5 + Math.min(Math.abs(car.speed), 30) * 0.12 + car.length * 0.5;
    let want = full;
    const phys = this.scene.getPhysicsEngine();
    phys.raycastToRef(t, t.add(dir.scale(full + 0.4)), this.ray, { collideWith: ~CAR_MASK });
    if (this.ray.hasHit) want = clamp(this.ray.hitDistance - 0.4, 3.5, full);
    this.curDist = want < this.curDist ? want : damp(this.curDist, want, 3, dt);
    this.cam.position.copyFrom(t).addInPlace(dir.scale(this.curDist));
    this.cam.setTarget(t);
  }
}
