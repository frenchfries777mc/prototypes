// 직업 시스템. 직업 건물 앞 표시에서 E로 시작하고, 목표 지점은 빛기둥과 화면 화살표로 알려 준다.
// 직업 하나는 { start, update, use, prompt, stop }만 구현하면 된다.
import { BUILDINGS, CELL } from './mapdata.js';
import { Character, randomLook } from './character.js';
import { RINGS, ringPoint } from './npc.js';
import { SEA, height, coast } from './terrain.js';
import { paths } from './roads.js';
import { ISLANDS, SITES } from './world.js';
import { rng, clamp, flatMat } from './util.js';
const B = window.BABYLON;

const FACE_DIR = { S: [0, -1], W: [-1, 0], N: [0, 1], E: [1, 0] };
const $ = (id) => document.getElementById(id);
const won = (n) => n.toLocaleString('ko-KR');
const dist2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);

export class Jobs {
  constructor({ scene, player, garage, assets, groundY, sites, docks, addShadow }) {
    Object.assign(this, { scene, player, garage, assets, groundY, sites, docks, addShadow });
    this.r = rng((Date.now() & 0xffff) + 7);
    this.money = 0;
    try { this.money = parseInt(localStorage.getItem('boxtown.money') || '0', 10) || 0; } catch (e) { /* 저장소를 못 쓰는 환경 */ }
    this.active = null;
    this.target = null; // { x, y, z, label }
    this.toastT = 0;
    this._prompt = '';
    // 건물 정문 앞 지점들: 배달지·화재 현장으로 쓴다.
    this.doors = BUILDINGS.filter((b) => !b.m.startsWith('industrial')).map((b) => {
      const bb = assets.bounds(b.m), d = FACE_DIR[b.f];
      const half = (bb.max.z - bb.min.z) / 2;
      const x = b.cx * CELL + d[0] * (half + 1.3), z = b.cz * CELL + d[1] * (half + 1.3);
      return { x, z, y: groundY(x, z), dir: d, h: Math.min(bb.max.y, 9) };
    });
    // 목표 지점 빛기둥
    const pm = new B.StandardMaterial('targetMat', scene);
    pm.emissiveColor = new B.Color3(1, 0.85, 0.25); pm.disableLighting = true; pm.alpha = 0.34; pm.fogEnabled = false;
    this.pillar = B.MeshBuilder.CreateCylinder('targetPillar', { diameter: 2.6, height: 60, tessellation: 4 }, scene);
    this.pillar.material = pm; this.pillar.isPickable = false; this.pillar.setEnabled(false);
    const rm = pm.clone('targetRingMat'); rm.alpha = 0.75;
    this.ring = B.MeshBuilder.CreateBox('targetRing', { width: 3.2, height: 0.12, depth: 3.2 }, scene);
    this.ring.material = rm; this.ring.isPickable = false; this.ring.setEnabled(false);
    // 직업 건물 앞 시작 표시
    this.pads = [];
    for (const id of Object.keys(sites)) {
      const s = sites[id], def = DEFS[id];
      const m = new B.StandardMaterial('padMat_' + id, scene);
      m.emissiveColor = B.Color3.FromHexString(def.color); m.disableLighting = true; m.alpha = 0.8;
      const pad = B.MeshBuilder.CreateBox('pad_' + id, { width: 2.4, height: 0.1, depth: 2.4 }, scene);
      pad.position.set(s.x, s.y + 0.06, s.z); pad.material = m; pad.isPickable = false;
      const gem = B.MeshBuilder.CreateBox('gem_' + id, { size: 0.7 }, scene);
      gem.position.set(s.x, s.y + 2.6, s.z); gem.material = m; gem.isPickable = false;
      const tex = new B.DynamicTexture('padLabel_' + id, { width: 512, height: 128 }, scene, true);
      const ctx = tex.getContext();
      ctx.fillStyle = 'rgba(22,34,58,0.82)'; ctx.beginPath(); ctx.roundRect(4, 14, 504, 100, 26); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 62px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(def.name, 256, 68);
      tex.update(); tex.hasAlpha = true;
      const lm = new B.StandardMaterial('padLabelMat_' + id, scene);
      lm.diffuseTexture = tex; lm.emissiveTexture = tex; lm.opacityTexture = tex; lm.disableLighting = true; lm.backFaceCulling = false; lm.fogEnabled = false;
      const label = B.MeshBuilder.CreatePlane('padLabelPlane_' + id, { width: 3.6, height: 0.9 }, scene);
      label.position.set(s.x, s.y + 3.7, s.z); label.material = lm; label.billboardMode = B.Mesh.BILLBOARDMODE_ALL; label.isPickable = false;
      this.pads.push({ id, s, pad, gem, color: def.color, name: def.name });
    }
    this.t = 0;
    addEventListener('keydown', (e) => { if (e.code === 'KeyQ' && this.active) this.quit(); });
    $('btnQuit').addEventListener('click', () => this.quit());
    this.renderMoney();
  }

  // ---------- 공용 도구 ----------
  renderMoney() { $('money').textContent = won(this.money); }
  pay(n, text) {
    n = Math.round(n);
    this.money += n;
    try { localStorage.setItem('boxtown.money', String(this.money)); } catch (e) { /* 무시 */ }
    this.renderMoney();
    this.toast(`${text}  +${won(n)}원`, true);
    $('moneyBox').classList.remove('pop'); void $('moneyBox').offsetWidth; $('moneyBox').classList.add('pop');
  }
  toast(text, good = false) {
    const el = $('toast');
    el.textContent = text; el.className = good ? 'show good' : 'show';
    this.toastT = 2.8;
  }
  setTarget(x, z, label, y) { this.target = { x, z, y: y === undefined ? this.groundY(x, z) : y, label }; }
  panel(title, text, sub = '') {
    $('job').hidden = false;
    $('jobTitle').textContent = title; $('jobText').textContent = text; $('jobSub').textContent = sub;
  }
  randomDoor(from, minDist) {
    const far = this.doors.filter((d) => dist2(from, d.x, d.z) > minDist);
    return this.r.pick(far.length ? far : this.doors);
  }
  curbPoint(from, minDist) {
    for (let i = 0; i < 40; i++) {
      const ring = this.r.pick(RINGS), [x, z] = ringPoint(ring, this.r() * 400);
      if (!from || dist2(from, x, z) > minDist) return { x, z, y: this.groundY(x, z) };
    }
    const [x, z] = ringPoint(RINGS[0], 0);
    return { x, z, y: this.groundY(x, z) };
  }
  get onFoot() { return !this.player.vehicle; }
  get pos() { return this.player.feet; }

  begin(id) {
    if (this.active) this.quit(true);
    const job = DEFS[id].make(this, this.sites[id]);
    this.active = { id, job, def: DEFS[id] };
    $('btnQuit').hidden = false;
    this.toast(`${DEFS[id].name} 시작!`);
    job.start();
  }
  quit(silent) {
    if (!this.active) return;
    this.active.job.stop();
    if (!silent) this.toast(`${this.active.def.name}을(를) 마쳤어요`);
    this.active = null; this.target = null;
    $('job').hidden = true; $('btnQuit').hidden = true;
  }

  // E를 눌렀을 때. 처리했으면 true(차 타기보다 먼저다).
  use() {
    if (!this.onFoot) return false;
    if (this.active && this.active.job.use && this.active.job.use()) return true;
    const pad = this.nearPad();
    if (pad) { if (this.active && this.active.id === pad.id) this.quit(); else this.begin(pad.id); return true; }
    return false;
  }
  nearPad() {
    if (!this.onFoot) return null;
    return this.pads.find((p) => dist2(this.pos, p.s.x, p.s.z) < 2.3 && Math.abs(this.pos.y - p.s.y) < 2) || null;
  }
  // 화면에 띄울 안내 문구(없으면 빈 문자열)
  prompt() {
    if (!this.onFoot) return '';
    const jp = this.active && this.active.job.prompt ? this.active.job.prompt() : '';
    if (jp) return jp;
    const pad = this.nearPad();
    if (pad) return this.active && this.active.id === pad.id ? '일 그만두기' : `${DEFS[pad.id].name} 시작`;
    return '';
  }

  update(dt) {
    this.t += dt;
    for (const p of this.pads) {
      p.gem.rotation.y += dt * 1.5;
      p.gem.position.y = p.s.y + 2.6 + Math.sin(this.t * 2 + p.s.x) * 0.15;
      const on = this.active && this.active.id === p.id;
      p.pad.scaling.x = p.pad.scaling.z = on ? 1 + Math.sin(this.t * 5) * 0.08 : 1;
    }
    if (this.active) this.active.job.update(dt);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').className = ''; }
    // 목표 빛기둥과 화면 화살표
    const tg = this.target, arrow = $('arrow');
    this.pillar.setEnabled(!!tg); this.ring.setEnabled(!!tg);
    if (!tg) { arrow.hidden = true; return; }
    this.pillar.position.set(tg.x, tg.y + 30, tg.z);
    this.pillar.rotation.y = this.t * 0.8;
    this.ring.position.set(tg.x, tg.y + 0.08, tg.z);
    this.ring.rotation.y = -this.t * 0.8;
    const cam = this.scene.activeCamera, canvas = this.scene.getEngine().getRenderingCanvas();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const world = new B.Vector3(tg.x, tg.y + 2.2, tg.z);
    const p = B.Vector3.Project(world, B.Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), new B.Viewport(0, 0, w, h));
    const fwd = cam.getForwardRay(1).direction;
    const behind = B.Vector3.Dot(world.subtract(cam.position), fwd) < 0;
    let x = p.x, y = p.y;
    if (behind) { x = w - x; y = h; }
    const m = 46, off = behind || x < m || x > w - m || y < m || y > h - m;
    x = clamp(x, m, w - m); y = clamp(y, m + 30, h - m - 40);
    arrow.hidden = false;
    arrow.style.transform = `translate(${x}px, ${y}px)`;
    arrow.classList.toggle('edge', off);
    const d = dist2(this.pos, tg.x, tg.z);
    $('arrowText').textContent = `${tg.label} · ${d < 1000 ? Math.round(d) + 'm' : (d / 1000).toFixed(1) + 'km'}`;
  }
}

// ======================= 직업들 =======================

// ---------- 피자 배달 ----------
function pizzaJob(J, site) {
  let state, dest, time, box;
  const order = () => {
    dest = J.randomDoor(site, 45);
    time = dist2(site, dest.x, dest.z) / 4.2 + 24;
    state = 'deliver';
    box.setEnabled(true);
    J.setTarget(dest.x, dest.z, '배달지', dest.y);
    J.toast('주문이 들어왔어요. 식기 전에 배달하세요!');
  };
  return {
    start() {
      box = B.MeshBuilder.CreateBox('pizzaBox', { width: 0.62, height: 0.1, depth: 0.62 }, J.scene);
      box.material = flatMat('pizzaBoxMat', '#fff3d6', J.scene);
      box.parent = J.player.chr.torso; box.position.set(0, 0.26, 0.5); box.isPickable = false;
      J.addShadow([box]);
      order();
    },
    update(dt) {
      if (state === 'deliver') {
        time -= dt;
        J.panel('피자 배달', '빛기둥이 선 집 문 앞까지 피자를 가져가세요', time > 0 ? `남은 시간 ${Math.ceil(time)}초` : '피자가 식었어요 (기본 요금만 받아요)');
        if (J.onFoot && dist2(J.pos, dest.x, dest.z) < 2.3) {
          J.pay(time > 0 ? 260 + time * 9 : 120, time > 0 ? '따끈한 배달 완료' : '식은 피자 배달');
          box.setEnabled(false); state = 'return';
          J.setTarget(site.x, site.z, '피자 가게', site.y);
        }
      } else {
        J.panel('피자 배달', '가게로 돌아가 다음 주문을 받으세요');
        if (J.onFoot && dist2(J.pos, site.x, site.z) < 2.6) order();
      }
    },
    stop() { box.dispose(); },
  };
}

// ---------- 택시 기사 ----------
function taxiJob(J, site) {
  let state, pick, drop, passenger, fare, waitT = 0;
  const inTaxi = () => J.player.vehicle && J.player.vehicle.key === 'cars/taxi';
  const stopped = (p, r) => inTaxi() && dist2(J.player.vehicle.pos, p.x, p.z) < r && Math.abs(J.player.vehicle.speed) < 1.6;
  const stand = (p, wave) => {
    passenger.setVisible(true);
    passenger.wave = wave;
    passenger.heading = Math.atan2(J.pos.x - p.x, J.pos.z - p.z);
    passenger.update(0.016, { pos: new B.Vector3(p.x, p.y, p.z), vel: B.Vector3.Zero(), grounded: true, wishHeading: Math.atan2(J.pos.x - p.x, J.pos.z - p.z), landed: 0, jumped: false });
  };
  const call = () => {
    pick = J.curbPoint(J.pos, 30);
    state = 'pickup';
    J.setTarget(pick.x, pick.z, '손님', pick.y);
  };
  return {
    start() {
      passenger = new Character(J.scene, randomLook(Math.floor(J.r() * 1e6)));
      J.addShadow(passenger.meshes);
      passenger.setVisible(false);
      state = 'gettaxi';
    },
    update(dt) {
      if (state === 'gettaxi') {
        J.panel('택시 기사', '노란 택시에 타세요', 'E로 타고 내립니다');
        const taxi = J.garage.cars.filter((c) => c.key === 'cars/taxi').sort((a, b) => dist2(J.pos, a.pos.x, a.pos.z) - dist2(J.pos, b.pos.x, b.pos.z))[0];
        J.setTarget(taxi.pos.x, taxi.pos.z, '택시', taxi.pos.y);
        if (inTaxi()) call();
      } else if (state === 'pickup') {
        J.panel('택시 기사', '손 흔드는 손님 옆에 차를 세우세요', inTaxi() ? '' : '택시에 다시 타세요');
        stand(pick, 1);
        if (stopped(pick, 6.5)) {
          passenger.setVisible(false);
          drop = J.curbPoint(pick, 70);
          fare = 180 + dist2(pick, drop.x, drop.z) * 3.2;
          state = 'drop';
          J.setTarget(drop.x, drop.z, '목적지', drop.y);
          J.toast('손님이 탔어요. 목적지로 출발!');
        }
      } else if (state === 'drop') {
        J.panel('택시 기사', '목적지 빛기둥 옆에 차를 세우세요', `예상 요금 ${won(Math.round(fare))}원`);
        if (stopped(drop, 7)) {
          J.pay(fare, '손님을 모셔다 드렸어요');
          state = 'bye'; waitT = 2.2; J.target = null;
        }
      } else if (state === 'bye') {
        stand(drop, 1);
        waitT -= dt;
        if (waitT <= 0) { passenger.setVisible(false); call(); }
      }
    },
    stop() { passenger.meshes.forEach((m) => m.dispose()); passenger.root.dispose(); },
  };
}

// ---------- 소방관 ----------
let sparkTex = null;
function spark(scene) {
  if (sparkTex) return sparkTex;
  sparkTex = new B.DynamicTexture('spark', { width: 64, height: 64 }, scene, false);
  const c = sparkTex.getContext(), g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  sparkTex.update(); sparkTex.hasAlpha = true;
  return sparkTex;
}
function fireJob(J, site, opts = {}) {
  const TITLE = opts.title || '소방관';
  let spot, hp, fire, smoke, water, clock, gap = 0, count = 0;
  const ignite = () => {
    spot = opts.spot ? opts.spot() : J.randomDoor(J.pos, 40);
    hp = 100; clock = 0;
    const at = new B.Vector3(spot.x - spot.dir[0] * 0.9, spot.y + 1.4, spot.z - spot.dir[1] * 0.9);
    fire.emitter = at; smoke.emitter = at.add(new B.Vector3(0, 1.5, 0));
    fire.start(); smoke.start();
    J.setTarget(spot.x, spot.z, opts.label || '화재 현장', spot.y);
    J.toast(opts.alarm || '불이 났어요! 출동하세요');
  };
  const mk = (name, cap) => { const p = new B.ParticleSystem(name, cap, J.scene); p.particleTexture = spark(J.scene); return p; };
  return {
    start() {
      fire = mk('fire', 260);
      fire.minEmitBox = new B.Vector3(-1.6, -1, -1.6); fire.maxEmitBox = new B.Vector3(1.6, 1.5, 1.6);
      fire.color1 = new B.Color4(1, 0.75, 0.2, 1); fire.color2 = new B.Color4(1, 0.35, 0.08, 1); fire.colorDead = new B.Color4(0.4, 0.05, 0, 0);
      fire.minSize = 0.9; fire.maxSize = 2.4; fire.minLifeTime = 0.35; fire.maxLifeTime = 0.9; fire.emitRate = 170;
      fire.blendMode = B.ParticleSystem.BLENDMODE_ADD; fire.gravity = new B.Vector3(0, 7, 0);
      fire.direction1 = new B.Vector3(-0.6, 2, -0.6); fire.direction2 = new B.Vector3(0.6, 5, 0.6); fire.minEmitPower = 0.6; fire.maxEmitPower = 1.6; fire.updateSpeed = 0.016;
      smoke = mk('smoke', 120);
      smoke.minEmitBox = new B.Vector3(-1.2, 0, -1.2); smoke.maxEmitBox = new B.Vector3(1.2, 1, 1.2);
      smoke.color1 = new B.Color4(0.25, 0.25, 0.27, 0.6); smoke.color2 = new B.Color4(0.15, 0.15, 0.17, 0.5); smoke.colorDead = new B.Color4(0.4, 0.4, 0.42, 0);
      smoke.minSize = 2; smoke.maxSize = 5; smoke.minLifeTime = 1.5; smoke.maxLifeTime = 3.2; smoke.emitRate = 26;
      smoke.blendMode = B.ParticleSystem.BLENDMODE_STANDARD; smoke.gravity = new B.Vector3(0.6, 2.5, 0);
      smoke.direction1 = new B.Vector3(-0.4, 2, -0.4); smoke.direction2 = new B.Vector3(0.4, 4, 0.4); smoke.minEmitPower = 0.5; smoke.maxEmitPower = 1.5; smoke.updateSpeed = 0.016;
      water = mk('water', 220);
      water.color1 = new B.Color4(0.6, 0.85, 1, 0.9); water.color2 = new B.Color4(0.8, 0.95, 1, 0.8); water.colorDead = new B.Color4(0.8, 0.95, 1, 0);
      water.minSize = 0.25; water.maxSize = 0.6; water.minLifeTime = 0.5; water.maxLifeTime = 0.8; water.emitRate = 0;
      water.blendMode = B.ParticleSystem.BLENDMODE_STANDARD; water.gravity = new B.Vector3(0, -9, 0); water.updateSpeed = 0.016;
      water.minEmitBox = water.maxEmitBox = B.Vector3.Zero();
      water.emitter = new B.Vector3(); water.start();
      ignite();
    },
    get inRange() { return J.onFoot && hp > 0 && dist2(J.pos, spot.x, spot.z) < 11; },
    prompt() { return this.inRange ? '꾹 눌러 물 뿌리기' : ''; },
    use() { return this.inRange; }, // 물을 뿌릴 수 있을 때는 E가 차 타기로 넘어가지 않게 한다
    update(dt) {
      if (hp <= 0) {
        gap -= dt;
        J.panel(TITLE, '다음 신고를 기다리는 중…', `끈 불 ${count}건`);
        if (gap <= 0) ignite();
        return;
      }
      clock += dt;
      const spraying = this.inRange && J.player.input.useHeld;
      if (spraying) {
        const from = new B.Vector3(J.pos.x, J.pos.y + 1.0, J.pos.z), to = fire.emitter;
        const d = to.subtract(from), len = d.length();
        d.normalize();
        water.emitter.copyFrom(from);
        const sp = len / 0.62;
        water.direction1 = d.scale(sp).add(new B.Vector3(-0.8, 2.4, -0.8)); water.direction2 = d.scale(sp).add(new B.Vector3(0.8, 3.2, 0.8));
        water.minEmitPower = water.maxEmitPower = 1;
        water.emitRate = 160;
        J.player.chr.heading = Math.atan2(d.x, d.z);
        hp -= 30 * dt;
      } else water.emitRate = 0;
      fire.emitRate = 40 + hp * 1.4;
      J.panel(TITLE, J.onFoot ? '불 가까이에서 E를 꾹 눌러 물을 뿌리세요' : '현장에 도착하면 차에서 내리세요', `불길 ${Math.max(0, Math.ceil(hp))}%`);
      if (hp <= 0) {
        fire.stop(); smoke.stop(); water.emitRate = 0;
        count++;
        J.pay((opts.pay || 420) + Math.max(0, 60 - clock) * 6, '불을 껐어요');
        J.target = null; gap = 3;
      }
    },
    stop() { fire.dispose(false); smoke.dispose(false); water.dispose(false); },
  };
}

// ---------- 환경미화원 ----------
function cleanJob(J, site) {
  const N = 8;
  let bags = [], left, mat;
  const scatter = () => {
    bags.forEach((b) => b.mesh.dispose());
    bags = [];
    for (let i = 0; i < N; i++) {
      const p = J.curbPoint(i ? bags[i - 1] : site, 14);
      const mesh = B.MeshBuilder.CreateBox('trashBag', { width: 0.7, height: 0.75, depth: 0.65 }, J.scene);
      mesh.position.set(p.x, p.y + 0.37, p.z); mesh.rotation.y = J.r() * 3; mesh.material = mat; mesh.isPickable = false;
      const knot = B.MeshBuilder.CreateBox('trashKnot', { size: 0.24 }, J.scene);
      knot.parent = mesh; knot.position.y = 0.46; knot.material = mat; knot.isPickable = false;
      J.addShadow([mesh, knot]);
      bags.push({ x: p.x, z: p.z, y: p.y, mesh, got: false });
    }
    left = N;
    J.toast('마을에 쓰레기봉투가 버려졌어요. 모두 주워 오세요');
  };
  return {
    start() { mat = flatMat('trashMat', '#3f4654', J.scene); scatter(); },
    update(dt) {
      if (left > 0) {
        let best = null, bd = 1e9;
        for (const b of bags) {
          if (b.got) continue;
          const d = dist2(J.pos, b.x, b.z);
          if (J.onFoot && d < 1.4) { b.got = true; b.mesh.setEnabled(false); left--; J.toast(`쓰레기봉투를 주웠어요 (${N - left}/${N})`); continue; }
          if (d < bd) { bd = d; best = b; }
        }
        if (best) J.setTarget(best.x, best.z, '쓰레기봉투', best.y);
        J.panel('환경미화원', '쓰레기봉투에 걸어가서 주우세요', `${N - left} / ${N}개`);
        if (left === 0) J.setTarget(site.x, site.z, '청소소', site.y);
      } else {
        J.panel('환경미화원', '청소소로 돌아가 보고하세요', `${N} / ${N}개`);
        if (J.onFoot && dist2(J.pos, site.x, site.z) < 2.6) { J.pay(N * 85 + 240, '마을이 깨끗해졌어요'); scatter(); }
      }
    },
    stop() { bags.forEach((b) => b.mesh.dispose()); },
  };
}

// ---------- 낚시 ----------
const FISH = [['멸치', 35, 38], ['고등어', 90, 28], ['참돔', 210, 15], ['문어', 320, 7], ['낡은 장화', 5, 8], ['황금 물고기', 700, 4]];
const SPOT = { x: 78.2, z: -46.2 };
function fishJob(J, site) {
  let state = 'idle', t = 0, bob, bx, bz, caught = 0;
  const atSpot = () => J.onFoot && dist2(J.pos, SPOT.x, SPOT.z) < 2.6;
  return {
    start() {
      bob = B.MeshBuilder.CreateBox('bobber', { width: 0.3, height: 0.42, depth: 0.3 }, J.scene);
      bob.material = flatMat('bobMat', '#ff4a3a', J.scene, { emissive: '#7a1a10' });
      const cap = B.MeshBuilder.CreateBox('bobCap', { width: 0.32, height: 0.14, depth: 0.32 }, J.scene);
      cap.material = flatMat('bobCapMat', '#ffffff', J.scene); cap.parent = bob; cap.position.y = 0.2;
      bob.setEnabled(false); bob.isPickable = false;
      J.setTarget(SPOT.x, SPOT.z, '낚시 자리', J.groundY(SPOT.x, SPOT.z));
    },
    prompt() { return !atSpot() ? '' : state === 'idle' ? '낚싯대 던지기' : state === 'bite' ? '지금 당기기!' : '기다리는 중…'; },
    use() {
      if (!atSpot()) return false;
      if (state === 'idle') {
        state = 'wait'; t = 2 + J.r() * 4.5;
        bx = SPOT.x + 1.5 + J.r() * 2; bz = SPOT.z - 5 - J.r() * 3;
        bob.setEnabled(true);
        J.player.chr.heading = Math.atan2(bx - J.pos.x, bz - J.pos.z);
      } else if (state === 'wait') {
        state = 'idle'; bob.setEnabled(false); J.toast('너무 빨리 당겼어요');
      } else if (state === 'bite') {
        let roll = J.r() * 100, pick = FISH[0];
        for (const f of FISH) { if (roll < f[2]) { pick = f; break; } roll -= f[2]; }
        caught++;
        J.pay(pick[1], `${pick[0]}을(를) 낚았어요`);
        state = 'idle'; bob.setEnabled(false);
        J.player.chr.sSquash.v += 3;
      }
      return true;
    },
    update(dt) {
      if (state !== 'idle' && !atSpot()) { state = 'idle'; bob.setEnabled(false); }
      if (state === 'wait') {
        t -= dt;
        bob.position.set(bx, SEA + 0.1 + Math.sin(J.t * 2.2) * 0.05, bz);
        if (t <= 0) { state = 'bite'; t = 1.0; }
      } else if (state === 'bite') {
        t -= dt;
        bob.position.set(bx, SEA - 0.25 + Math.sin(J.t * 30) * 0.06, bz);
        if (t <= 0) { state = 'idle'; bob.setEnabled(false); J.toast('놓쳤어요…'); }
      }
      J.target = atSpot() ? null : { x: SPOT.x, z: SPOT.z, y: J.groundY(SPOT.x, SPOT.z), label: '낚시 자리' };
      J.panel('낚시', atSpot() ? '찌가 쑥 들어가면 E를 누르세요' : '잔교 끝 낚시 자리로 가세요', `잡은 수 ${caught}마리`);
    },
    stop() { bob.dispose(); },
  };
}

// ======================= 마을 밖 직업들 =======================
const inVehicle = (J, test) => J.player.vehicle && test(J.player.vehicle);
const stoppedAt = (J, p, r, test, maxSpeed = 2.2) => inVehicle(J, test) && dist2(J.player.vehicle.pos, p.x, p.z) < r && Math.abs(J.player.vehicle.speed) < maxSpeed;
const nearestVehicle = (J, test) => J.garage.cars.filter(test).sort((a, b) => dist2(J.pos, a.pos.x, a.pos.z) - dist2(J.pos, b.pos.x, b.pos.z))[0];
// 손님을 한 자리에 세워 둔다(플레이어 쪽을 보며 손을 흔든다).
function standAt(J, chr, p, wave = 1) {
  chr.setVisible(true);
  chr.wave = wave;
  const yaw = Math.atan2(J.pos.x - p.x, J.pos.z - p.z);
  chr.heading = yaw;
  chr.update(0.016, { pos: new B.Vector3(p.x, p.y, p.z), vel: B.Vector3.Zero(), grounded: true, wishHeading: yaw, landed: 0, jumped: false });
}
function makePassenger(J) {
  const chr = new Character(J.scene, randomLook(Math.floor(J.r() * 1e6)));
  J.addShadow(chr.meshes);
  chr.setVisible(false);
  return chr;
}
const disposeChr = (chr) => { chr.meshes.forEach((m) => m.dispose()); chr.root.dispose(); };

// ---------- 농부: 밭에서 수확해 헛간 앞 부스로 ----------
function farmerJob(J, site) {
  const N = 10, F = SITES.farm;
  let items = [], left, mat, leaf;
  const sow = () => {
    items.forEach((b) => b.mesh.dispose());
    items = [];
    for (let i = 0; i < N; i++) {
      const f = Math.floor(J.r() * 6);
      const x = F.x - 36 + (f % 3) * 34 + (J.r() - 0.5) * 24, z = F.z - 28 - Math.floor(f / 3) * 30 + (J.r() - 0.5) * 19;
      const y = height(x, z);
      const mesh = B.MeshBuilder.CreateBox('harvest', { width: 0.8, height: 0.55, depth: 0.8 }, J.scene);
      mesh.position.set(x, y + 0.5, z); mesh.material = mat; mesh.isPickable = false;
      const top = B.MeshBuilder.CreateBox('harvestTop', { width: 0.6, height: 0.3, depth: 0.6 }, J.scene);
      top.parent = mesh; top.position.y = 0.4; top.material = leaf; top.isPickable = false;
      J.addShadow([mesh, top]);
      items.push({ x, z, y, mesh, got: false });
    }
    left = N;
    J.toast('다 익은 작물이 밭에 있어요. 바구니를 모두 거둬 오세요');
  };
  return {
    start() { mat = flatMat('harvestMat', '#e58a2e', J.scene); leaf = flatMat('harvestLeaf', '#4fae4a', J.scene); sow(); },
    update(dt) {
      if (left > 0) {
        let best = null, bd = 1e9;
        for (const b of items) {
          if (b.got) continue;
          b.mesh.rotation.y += dt;
          const d = dist2(J.pos, b.x, b.z);
          if (J.onFoot && d < 1.5) { b.got = true; b.mesh.setEnabled(false); left--; J.toast(`수확했어요 (${N - left}/${N})`); continue; }
          if (d < bd) { bd = d; best = b; }
        }
        if (best) J.setTarget(best.x, best.z, '수확 바구니', best.y);
        J.panel('농부', '밭의 주황색 바구니에 걸어가서 거두세요', `${N - left} / ${N}개`);
        if (left === 0) J.setTarget(site.x, site.z, '농장 부스', site.y);
      } else {
        J.panel('농부', '부스로 돌아가 납품하세요', `${N} / ${N}개`);
        if (J.onFoot && dist2(J.pos, site.x, site.z) < 2.8) { J.pay(N * 75 + 220, '수확을 납품했어요'); sow(); }
      }
    },
    stop() { items.forEach((b) => b.mesh.dispose()); },
  };
}

// ---------- 화물 기사: 트럭으로 섬 곳곳에 배달 ----------
const CARGO_DESTS = [
  { name: '서쪽 농장', x: -334, z: 204 }, { name: '동쪽 해변', x: 462, z: 126 }, { name: '호수 마을', x: 120, z: 516 }, { name: '갈매기섬', x: 352, z: -254 },
  { name: '항구 부두', x: 60, z: 12 }, { name: '동해 야영장', x: 562, z: 428 }, { name: '풍차 언덕', x: -318, z: 556 },
];
const isTruck = (v) => ['cars/truck', 'cars/delivery', 'cars/truck-flat', 'cars/garbage-truck'].includes(v.key);
function cargoJob(J, site) {
  let state = 'get', dest, fare, count = 0;
  const next = () => {
    const from = J.pos;
    const far = CARGO_DESTS.filter((d) => dist2(from, d.x, d.z) > 180 && d !== dest);
    dest = J.r.pick(far);
    fare = 160 + dist2(from, dest.x, dest.z) * 1.5;
    state = 'go';
    J.setTarget(dest.x, dest.z, dest.name, height(dest.x, dest.z));
    J.toast(`${dest.name}까지 화물을 실어다 주세요`);
  };
  return {
    start() {},
    update() {
      if (state === 'get') {
        J.panel('화물 기사', '트럭에 타세요', '트럭·배달차·쓰레기차면 됩니다');
        const t = nearestVehicle(J, isTruck);
        J.setTarget(t.pos.x, t.pos.z, '트럭', t.pos.y);
        if (inVehicle(J, isTruck)) next();
      } else {
        J.panel('화물 기사', `${dest.name}에 가서 빛기둥 옆에 차를 세우세요`, inVehicle(J, isTruck) ? `운임 ${won(Math.round(fare))}원 · 배달 ${count}건` : '트럭에 다시 타세요');
        if (stoppedAt(J, dest, 11, isTruck)) { count++; J.pay(fare, `${dest.name} 배달 완료`); next(); }
      }
    },
    stop() {},
  };
}

// ---------- 집배원: 외딴 집들의 우편함에 편지 넣기 ----------
const MAIL_STOPS = [
  { name: '강가 오두막', s: 'cabinA' }, { name: '동쪽 숲 오두막', s: 'cabinB' }, { name: '북쪽 오두막', s: 'cabinC' }, { name: '산기슭 오두막', s: 'cabinD' },
  { name: '동해 야영장', s: 'camp' }, { name: '풍차 언덕', s: 'wind' }, { name: '산 전망대', s: 'lookout' }, { name: '서쪽 농장', s: 'farm' },
];
function mailJob(J, site) {
  const N = 4;
  let route = [], idx = 0, boxes = [], total = 0, state = 'go';
  const plan = () => {
    boxes.forEach((m) => m.dispose());
    boxes = [];
    // 무작위로 네 곳을 고른 뒤, 가까운 곳부터 돌도록 순서를 잡는다.
    const pool = MAIL_STOPS.slice().sort(() => J.r() - 0.5).slice(0, N).map((d) => { const S = SITES[d.s]; const x = S.x + 5, z = S.z - 13; return { name: d.name, x, z, y: height(x, z) }; });
    route = [];
    let cur = { x: site.x, z: site.z };
    total = 0;
    while (pool.length) {
      pool.sort((a, b) => dist2(cur, a.x, a.z) - dist2(cur, b.x, b.z));
      const nx = pool.shift();
      total += dist2(cur, nx.x, nx.z);
      route.push(nx); cur = nx;
    }
    for (const d of route) {
      const post = B.MeshBuilder.CreateBox('mailPost', { width: 0.16, height: 1.1, depth: 0.16 }, J.scene);
      post.position.set(d.x, d.y + 0.55, d.z); post.material = flatMat('mailPostMat', '#f4f1ea', J.scene); post.isPickable = false;
      const box = B.MeshBuilder.CreateBox('mailBox', { width: 0.5, height: 0.42, depth: 0.7 }, J.scene);
      box.parent = post; box.position.y = 0.72; box.material = flatMat('mailBoxMat', '#e5553f', J.scene); box.isPickable = false;
      J.addShadow([post, box]);
      boxes.push(post);
    }
    idx = 0; state = 'go';
    J.setTarget(route[0].x, route[0].z, route[0].name, route[0].y);
    J.toast(`편지 ${N}통을 배달하세요. 차를 타고 가면 빨라요`);
  };
  return {
    start() { plan(); },
    update() {
      if (state === 'go') {
        const d = route[idx];
        J.panel('집배원', `${d.name}의 빨간 우편함까지 걸어가세요`, `${idx} / ${N}통`);
        if (J.onFoot && dist2(J.pos, d.x, d.z) < 2.6) {
          idx++;
          if (idx < N) { J.toast(`편지를 넣었어요 (${idx}/${N})`); J.setTarget(route[idx].x, route[idx].z, route[idx].name, route[idx].y); }
          else { J.pay(N * 150 + total * 0.55, '편지를 모두 배달했어요'); state = 'back'; J.setTarget(site.x, site.z, '우체국', site.y); }
        }
      } else {
        J.panel('집배원', '우체국으로 돌아가 다음 편지를 받으세요');
        if (J.onFoot && dist2(J.pos, site.x, site.z) < 2.8) plan();
      }
    },
    stop() { boxes.forEach((m) => m.dispose()); },
  };
}

// ---------- 뱃사공: 배로 손님을 선착장에서 선착장으로 ----------
const isBoat = (v) => !!v.isBoat;
function ferryJob(J, site) {
  let state = 'get', pick, drop, passenger, fare, waitT = 0, count = 0;
  const seaDocks = () => J.docks.filter((d) => d.id !== 'lakeDock');
  const call = () => {
    const far = seaDocks().filter((d) => dist2(J.pos, d.x, d.z) > 120 && d !== drop);
    pick = J.r.pick(far);
    state = 'pickup';
    J.setTarget(pick.x, pick.z, `${pick.name} 선착장`, pick.y);
    J.toast(`${pick.name} 선착장에서 손님이 기다려요`);
  };
  return {
    start() { passenger = makePassenger(J); },
    update(dt) {
      if (state === 'get') {
        J.panel('뱃사공', '잔교에 대어 둔 배에 타세요', 'E로 타고 내립니다');
        const b = nearestVehicle(J, isBoat);
        J.setTarget(b.pos.x, b.pos.z, '배', b.pos.y);
        if (inVehicle(J, isBoat)) call();
      } else if (state === 'pickup') {
        J.panel('뱃사공', `${pick.name} 선착장 끝에 배를 대세요`, inVehicle(J, isBoat) ? `태운 손님 ${count}명` : '배에 다시 타세요');
        standAt(J, passenger, pick);
        if (stoppedAt(J, pick, 12, isBoat, 3)) {
          passenger.setVisible(false);
          drop = J.r.pick(seaDocks().filter((d) => d !== pick && dist2(pick, d.x, d.z) > 150));
          fare = 220 + dist2(pick, drop.x, drop.z) * 1.9;
          state = 'drop';
          J.setTarget(drop.x, drop.z, `${drop.name} 선착장`, drop.y);
          J.toast(`손님이 탔어요. ${drop.name}(으)로 가 주세요`);
        }
      } else if (state === 'drop') {
        J.panel('뱃사공', `${drop.name} 선착장 끝에 배를 대세요`, `뱃삯 ${won(Math.round(fare))}원`);
        if (stoppedAt(J, drop, 12, isBoat, 3)) { count++; J.pay(fare, '손님을 건네 드렸어요'); state = 'bye'; waitT = 2.2; J.target = null; }
      } else {
        standAt(J, passenger, drop);
        waitT -= dt;
        if (waitT <= 0) { passenger.setVisible(false); call(); }
      }
    },
    stop() { disposeChr(passenger); },
  };
}

// ---------- 인명 구조원: 바다에 떠내려간 사람을 배로 구해 오기 ----------
function guardJob(J, site) {
  let state = 'get', who, at, clock = 0, count = 0, home;
  const alarm = () => {
    for (let i = 0; i < 60; i++) {
      const a = Math.PI * (1 + J.r()), d = 70 + J.r() * 150; // 해변 남쪽 바다
      const x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d * 0.9 - 30;
      if (height(x, z) < SEA - 2.2) { at = { x, z, y: SEA - 1.05 }; break; }
    }
    state = 'rescue'; clock = 0;
    J.setTarget(at.x, at.z, '구조 요청', SEA);
    J.toast('사람이 바다에 떠내려가고 있어요! 배로 구하러 가세요');
  };
  return {
    start() { who = makePassenger(J); home = J.docks.find((d) => d.id === 'resortDock') || site; },
    update(dt) {
      if (state === 'get') {
        J.panel('인명 구조원', '해변 잔교의 배에 타세요', 'E로 타고 내립니다');
        const b = nearestVehicle(J, isBoat);
        J.setTarget(b.pos.x, b.pos.z, '구조선', b.pos.y);
        if (inVehicle(J, isBoat)) alarm();
      } else if (state === 'rescue') {
        clock += dt;
        at.y = SEA - 1.05 + Math.sin(J.t * 2) * 0.08;
        standAt(J, who, at);
        J.panel('인명 구조원', '손 흔드는 사람 옆에 배를 세우세요', inVehicle(J, isBoat) ? `구한 사람 ${count}명` : '배에 다시 타세요');
        if (stoppedAt(J, at, 8, isBoat, 4)) { who.setVisible(false); state = 'back'; J.setTarget(home.x, home.z, '해변 잔교', home.y); J.toast('구했어요! 잔교로 데려다주세요'); }
      } else if (state === 'back') {
        clock += dt;
        J.panel('인명 구조원', '해변 잔교 끝에 배를 대세요');
        if (stoppedAt(J, home, 12, isBoat, 3)) { count++; J.pay(360 + Math.max(0, 70 - clock) * 5, '무사히 구조했어요'); state = 'wait'; clock = 3; J.target = null; }
      } else {
        clock -= dt;
        J.panel('인명 구조원', '바다를 살피는 중…', `구한 사람 ${count}명`);
        if (clock <= 0) alarm();
      }
    },
    stop() { disposeChr(who); },
  };
}

// ---------- 레이서: 해변에서 바다 다리를 건너 갈매기섬까지 시간 재기 ----------
const isCar = (v) => !v.isBoat;
function raceJob(J, site) {
  // 코스: 동쪽 도로를 따라 갈림길까지 간 다음, 바다 다리를 건너 갈매기섬 끝까지.
  const A = paths[2].pts, Bp = paths[5].pts;
  const near = (pts, x, z) => pts.reduce((b, p, i) => (dist2(p, x, z) < dist2(pts[b], x, z) ? i : b), 0);
  const i0 = near(A, 462, 126), i1 = near(A, 332, 78);
  const line = [...A.slice(i1, i0 + 1).reverse(), ...Bp.slice(2)];
  const cps = [];
  for (let i = 14; i < line.length; i += 14) cps.push(line[i]);
  cps.push(line[line.length - 1]);
  let len = 0;
  for (let i = 1; i < line.length; i++) len += dist2(line[i], line[i - 1].x, line[i - 1].z);
  let state = 'get', idx = 0, time = 0, best = 0;
  const go = () => { state = 'run'; idx = 0; time = len / 14 + 12; J.setTarget(cps[0].x, cps[0].z, `관문 1/${cps.length}`, cps[0].y); J.toast('출발! 빛기둥을 차례로 통과하세요'); };
  return {
    start() {},
    update(dt) {
      if (state === 'get') {
        J.panel('레이서', '경주차에 타세요 (다른 차도 됩니다)', '해변에서 바다 다리 건너 갈매기섬까지');
        const c = J.garage.cars.find((v) => v.key === 'cars/race') || nearestVehicle(J, isCar);
        J.setTarget(c.pos.x, c.pos.z, '경주차', c.pos.y);
        if (inVehicle(J, isCar)) go();
      } else if (state === 'run') {
        time -= dt;
        const c = cps[idx];
        J.panel('레이서', '빛기둥을 차례로 통과하세요', time > 0 ? `남은 시간 ${Math.ceil(time)}초 · 관문 ${idx}/${cps.length}` : `시간 초과 · 관문 ${idx}/${cps.length}`);
        if (inVehicle(J, isCar) && dist2(J.player.vehicle.pos, c.x, c.z) < 10) {
          idx++;
          if (idx < cps.length) J.setTarget(cps[idx].x, cps[idx].z, `관문 ${idx + 1}/${cps.length}`, cps[idx].y);
          else { best = Math.max(best, time); J.pay(time > 0 ? 320 + time * 28 : 140, time > 0 ? '완주! 좋은 기록이에요' : '완주 (시간 초과)'); state = 'done'; J.setTarget(site.x, site.z, '레이싱 부스', site.y); }
        }
      } else {
        J.panel('레이서', '부스로 돌아오면 다시 달릴 수 있어요', best > 0 ? `남긴 시간 최고 ${best.toFixed(1)}초` : '');
        if (dist2(J.pos, site.x, site.z) < 12) { state = 'get'; }
      }
    },
    stop() {},
  };
}

// ---------- 보물 사냥꾼: 지도의 X 표시를 찾아 섬에서 파내기 ----------
const TREASURE_ISLES = ['sandA', 'sandB', 'sandC', 'sandD', 'palm', 'twinB', 'gull', 'fort'];
function treasureJob(J, site) {
  let spot, mark, dig = 0, count = 0, lastIsle = null;
  const hide = () => {
    for (let i = 0; i < 80; i++) {
      const id = J.r.pick(TREASURE_ISLES), isl = ISLANDS.find((s) => s.id === id);
      if (!isl || isl === lastIsle) continue;
      const a = J.r() * 6.28, d = (0.35 + J.r() * 0.45) * Math.min(isl.rx, isl.rz);
      const x = isl.cx + Math.cos(a) * d, z = isl.cz + Math.sin(a) * d, y = height(x, z);
      if (y < SEA + 1.2 || coast(x, z) < 6) continue;
      spot = { x, z, y }; lastIsle = isl;
      break;
    }
    mark.position.set(spot.x, spot.y + 0.08, spot.z); mark.setEnabled(true);
    dig = 0;
    J.setTarget(spot.x, spot.z, '보물 지도의 X', spot.y);
    J.toast('새 보물 지도를 받았어요. 배를 타고 X 표시를 찾아가세요');
  };
  return {
    start() {
      const m = flatMat('xMat', '#d9473c', J.scene, { emissive: '#5a1410' });
      mark = new B.TransformNode('xMark', J.scene);
      for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = B.MeshBuilder.CreateBox('xBar', { width: 2.4, height: 0.1, depth: 0.5 }, J.scene); b.parent = mark; b.rotation.y = r; b.material = m; b.isPickable = false; }
      hide();
    },
    get inRange() { return J.onFoot && dist2(J.pos, spot.x, spot.z) < 2.8; },
    prompt() { return this.inRange ? '꾹 눌러 땅 파기' : ''; },
    use() { return this.inRange; },
    update(dt) {
      if (this.inRange && J.player.input.useHeld) {
        dig += dt;
        J.player.chr.sSquash.v -= dt * 9; // 삽질하듯 들썩인다
        if (dig >= 2.4) {
          count++;
          mark.setEnabled(false);
          J.pay(520 + dist2(site, spot.x, spot.z) * 0.55, '보물 상자를 찾았어요');
          hide();
          return;
        }
      } else dig = Math.max(0, dig - dt * 2);
      J.panel('보물 사냥꾼', this.inRange ? 'E를 꾹 눌러 땅을 파세요' : 'X 표시가 있는 섬으로 배를 타고 가세요', dig > 0 ? `파는 중 ${Math.round((dig / 2.4) * 100)}%` : `찾은 보물 ${count}개`);
    },
    stop() { mark.dispose(); },
  };
}

// ---------- 산림 감시원: 산속에 난 불 끄기 ----------
function rangerJob(J, site) {
  return fireJob(J, site, {
    title: '산림 감시원', label: '산불', alarm: '숲에서 연기가 올라와요! 가서 불을 끄세요', pay: 480,
    spot() {
      for (let i = 0; i < 80; i++) {
        const a = J.r() * 6.28, d = 60 + J.r() * 200;
        const x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d, y = height(x, z);
        if (y > SEA + 5 && coast(x, z) > 40 && Math.abs(height(x + 4, z) - height(x - 4, z)) < 3.5) return { x, z, y, dir: [0, 0] };
      }
      return { x: site.x + 30, z: site.z, y: height(site.x + 30, site.z), dir: [0, 0] };
    },
  });
}

const DEFS = {
  pizza: { name: '피자 배달', color: '#f2644b', make: pizzaJob },
  taxi: { name: '택시 기사', color: '#ffd84a', make: taxiJob },
  fire: { name: '소방관', color: '#ff7a3c', make: fireJob },
  clean: { name: '환경미화원', color: '#57c27a', make: cleanJob },
  fish: { name: '낚시', color: '#4fb3e8', make: fishJob },
  farmer: { name: '농부', color: '#e3a53a', make: farmerJob },
  cargo: { name: '화물 기사', color: '#6f8fd0', make: cargoJob },
  mail: { name: '집배원', color: '#e5553f', make: mailJob },
  ferry: { name: '뱃사공', color: '#3f9fd0', make: ferryJob },
  guard: { name: '인명 구조원', color: '#ffb03a', make: guardJob },
  race: { name: '레이서', color: '#f2644b', make: raceJob },
  treasure: { name: '보물 사냥꾼', color: '#c99a3a', make: treasureJob },
  ranger: { name: '산림 감시원', color: '#3fa868', make: rangerJob },
};
