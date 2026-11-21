// 입력, 캐릭터 이동(Havok 캐릭터 컨트롤러), 3인칭 카메라.
import { clamp, damp } from './util.js';
import { SEA } from './terrain.js';
const B = window.BABYLON;

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.lookX = 0; this.lookY = 0; // 이번 프레임에 쌓인 시점 이동량(픽셀)
    this.stick = { x: 0, y: 0 };
    this.jumpQueued = false;
    this.touchRun = false;
    this.locked = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => { if (!this.isTouch && !this.locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    let dragging = false;
    canvas.addEventListener('mousedown', () => { dragging = true; });
    addEventListener('mouseup', () => { dragging = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked || dragging) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    this._touch(canvas);
  }

  _touch(canvas) {
    const pad = document.getElementById('stick'), knob = document.getElementById('stickKnob');
    const jump = document.getElementById('btnJump'), run = document.getElementById('btnRun');
    let moveId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0;
    const R = 56;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && moveId === null) {
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
    if (jump) jump.addEventListener('touchstart', (e) => { e.preventDefault(); this.jumpQueued = true; }, { passive: false });
    if (run) run.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchRun = !this.touchRun; run.classList.toggle('on', this.touchRun); }, { passive: false });
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
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchRun; }
}

const CAP_H = 1.7, CAP_R = 0.4, GRAVITY = -24;
const WALK = 6.2, SPRINT = 9.8, JUMP_V = 9.4;
const FOOT_PAD = 0.13; // 컨트롤러가 바닥과 띄워 두는 간격만큼 몸을 내려 그린다

export class Player {
  constructor(scene, input, character, spawn) {
    this.scene = scene; this.input = input; this.chr = character; this.spawn = spawn;
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
    this.cam.fov = 0.95; this.cam.minZ = 0.25; this.cam.maxZ = 3000;
    this.cam.inputs.clear();
    this.yaw = spawn.yaw || 0; this.pitch = 0.3; this.dist = 6.8; this.curDist = 6.8;
    this.target = new B.Vector3(spawn.x, spawn.y + 1.5, spawn.z);
    this.ray = new B.PhysicsRaycastResult();
    this.freeCam = null; // 디버그·촬영용 고정 시점
    this.chr.heading = this.yaw;

    scene.onAfterPhysicsObservable.add(() => this.step());
    scene.onBeforeRenderObservable.add(() => this.frame());
  }

  step() {
    const dt = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
    if (dt <= 0) return;
    const inp = this.input, cc = this.cc;
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
    const dx = tx - hx, dz = tz - hz, dl = Math.hypot(dx, dz);
    if (dl <= acc) { hx = tx; hz = tz; } else { hx += (dx / dl) * acc; hz += (dz / dl) * acc; }
    let vy = v.y;
    if (this.grounded) vy = -7; // 내리막에서 떠오르지 않도록 바닥 쪽으로 눌러 준다
    else vy = Math.max(vy + GRAVITY * dt, -45);
    if (this.jumpBuf > 0 && (this.grounded || this.airT < 0.12) && vy <= 0.5) {
      vy = JUMP_V; this.jumpBuf = 0; this.jumped = true; this.airT = 1; this.grounded = false; this.jumpGrace = 0.18;
    }
    this.vel.set(hx, vy, hz);
    cc.setVelocity(this.vel);
    cc.integrate(dt, sup, this.grav);
    this.wishHeading = mag > 0.1 ? Math.atan2(wx, wz) : null;

    const p = cc.getPosition();
    if (p.y < SEA - 2.2) this.respawn(); // 물에 빠지면 출발 지점으로
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
    inp.lookX = inp.lookY = 0;
    if (this.freeCam) {
      this.cam.position.copyFrom(this.freeCam.pos);
      this.cam.setTarget(this.freeCam.target);
      return;
    }
    const t = this.target;
    t.x = damp(t.x, this.feet.x, 18, dt);
    t.z = damp(t.z, this.feet.z, 18, dt);
    t.y = damp(t.y, this.feet.y + 1.45, 9, dt); // 높이는 천천히 따라가서 점프가 덜 어지럽다
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new B.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
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
  }
}
