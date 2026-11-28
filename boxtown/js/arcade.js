// 오락실·볼링장: 판매장 남쪽 평지에 있다. 오락실에서는 두더지 잡기와 뱀 게임을, 볼링장에서는 진짜 물리로 핀이 쓰러지는 범퍼 볼링을 할 수 있다.
// 상금은 하루에 번 만큼 정해진 한도까지만 나온다(노가다로 돈을 벌 수 없게).
import { SITES } from './world.js';
import { Panel } from './panel.js';
import { stats } from './stats.js';
import { flatMat } from './util.js';
const B = window.BABYLON;
const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const DAILY_CAP = 900; // 하루에 놀이로 받을 수 있는 상금 한도
const KEY = 'boxtown.arcade';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.date === today() ? d : { date: today(), got: 0 }; } catch (e) { return { date: today(), got: 0 }; } };

export class Arcade {
  constructor({ scene, player, jobs, groundY, lazyCollider }) {
    Object.assign(this, { scene, player, jobs, groundY });
    this.day = load(); this.mode = 'idle'; this.lobby = null;
    const S = SITES.arcade, y = groundY(S.x, S.z);
    this.S = S; this.y = y;
    const col = lazyCollider();
    const put = (w, h, d, x, yy, z, hex, solid, o) => {
      const m = B.MeshBuilder.CreateBox('arcade', { width: w, height: h, depth: d }, scene); m.position.set(S.x + x, y + yy, S.z + z);
      m.material = flatMat('arc_' + hex + (o ? 'e' : ''), hex, scene, o); m.isPickable = false; m.freezeWorldMatrix();
      if (solid) col.add(S.x + x, y + yy, S.z + z, w, h, d);
      return m;
    };
    put(34, 0.3, 40, 0, -0.13, 0, '#cfd3e2', true); // 바닥 (윗면이 땅 위 2cm)
    // 오락실 건물(서쪽): 앞이 트인 지붕 아래에 오락기 세 대
    put(13, 0.3, 9, -9, 3.9, -8, '#e5553f', false); put(0.3, 3.8, 0.3, -15, 1.9, -12, '#34456f', true); put(0.3, 3.8, 0.3, -3, 1.9, -12, '#34456f', true);
    put(13, 3.8, 1.2, -9, 1.9, -3.4, '#34456f', true); // 뒤 벽
    this.cabs = [-13, -9, -5].map((x, i) => { put(2.2, 2.6, 1.4, x, 1.3, -4.4, ['#2f6fd0', '#e5553f', '#35b7a8'][i], true); put(1.6, 1.1, 0.12, x, 1.7, -3.65, '#9fd3f2', false, { emissive: ['#2a5aa0', '#a03a2a', '#1f8478'][i] }); return x; });
    // 볼링 레인(동쪽): z 방향으로 24m
    const LX = 9;
    put(3.4, 0.3, 26, LX, -0.05, 0, '#d9a867', true); // 레인 바닥(윗면 +0.1)
    put(0.3, 0.5, 26, LX - 1.85, 0.2, 0, '#2f6fd0', true); put(0.3, 0.5, 26, LX + 1.85, 0.2, 0, '#2f6fd0', true); // 범퍼
    put(3.4, 1.6, 0.4, LX, 0.8, 13.4, '#34456f', true); // 끝 벽
    put(4.2, 0.1, 0.3, LX, 0.12, -9, '#ffffff', false); // 파울 라인
    this.laneY = y + 0.1; this.LX = LX;
    this.foul = { x: S.x + LX, z: S.z - 10.8 };
    this.cabSpot = { x: S.x - 9, z: S.z - 1.6 };
    // 간판
    const sign = (text, w, x, yy, z, bg, ry = 0) => {
      const tex = new B.DynamicTexture('arcSign' + text, { width: 768, height: 140 }, scene, true), c = tex.getContext();
      c.fillStyle = bg; c.fillRect(0, 0, 768, 140); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 84px "Noto Sans KR","Malgun Gothic",sans-serif'; c.fillText(text, 384, 76); tex.update();
      const m = new B.StandardMaterial('arcSignM' + text, scene); m.diffuseTexture = tex; m.emissiveTexture = tex; m.specularColor = B.Color3.Black(); m.backFaceCulling = false;
      const p = B.MeshBuilder.CreatePlane('arcSign', { width: w, height: w * 140 / 768 }, scene); p.position.set(S.x + x, y + yy, S.z + z); p.rotation.y = ry; p.material = m; p.isPickable = false;
    };
    sign('🎮 박스 오락실', 8, -9, 4.9, -12.4, '#16223a'); sign('🎳 박스 볼링', 6, LX, 3.4, -12.6, '#2f6fd0');
    col.done();
    // 핀과 공(물리)
    this.pins = []; this.ball = null; this.pinMat = flatMat('pinMat', '#f6f3ea', scene); this.pinStripe = flatMat('pinStripe', '#e5322d', scene);
    this.build();
    // 화면
    const hud = document.createElement('div'); hud.id = 'bowlHud'; hud.hidden = true; document.body.appendChild(hud); this.hud = hud;
    this.buildOverlay();
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.mode !== 'idle') { this.stop(); } });
  }

  // ----- 오락실 / 볼링 자리 -----
  nearCab() { const p = this.player.feet; return this.mode === 'idle' && !this.player.vehicle && !this.player.inside && Math.hypot(p.x - this.cabSpot.x, p.z - this.cabSpot.z) < 4.6 && Math.abs(p.y - this.y) < 3; }
  nearFoul() { const p = this.player.feet; return this.mode === 'idle' && !this.player.vehicle && !this.player.inside && Math.hypot(p.x - this.foul.x, p.z - this.foul.z) < 2.8 && Math.abs(p.y - this.y) < 3; }
  prompt() {
    if (this.mode === 'bowl') return this.hudState === 'aim' ? '방향 정하기' : this.hudState === 'power' ? '세기 정하기' : '';
    if (this.nearCab()) return '오락실 게임하기';
    if (this.nearFoul()) return '볼링 치기 (100원)';
    return '';
  }
  use() {
    if (this.mode === 'bowl') { this.press(); return true; }
    if (this.mode !== 'idle') return true;
    if (this.nearCab()) { this.openMenu(); return true; }
    if (this.nearFoul()) { this.startBowl(); return true; }
    return false;
  }
  // 상금: 하루 한도까지만 준다. 받은 금액을 돌려준다.
  reward(n, text) {
    this.day = load();
    const give = Math.max(0, Math.min(n, DAILY_CAP - this.day.got));
    if (give > 0) {
      this.day.got += give; try { localStorage.setItem(KEY, JSON.stringify(this.day)); } catch (e) { /* 무시 */ }
      this.jobs.money += give; try { localStorage.setItem('boxtown.money', String(this.jobs.money)); } catch (e) { /* 무시 */ }
      this.jobs.renderMoney();
    }
    this.jobs.notice(give > 0 ? `${text} · 상금 +${won(give)}원${give < n ? ' (오늘 한도)' : ''}` : `${text} · 오늘 받을 상금을 다 받았어요`, give > 0 ? 'good' : '');
    return give;
  }
  capLeft() { this.day = load(); return Math.max(0, DAILY_CAP - this.day.got); }

  // ================= 볼링 =================
  build() {
    const S = this.S, ly = this.laneY;
    // 핀 10개: 삼각형 배열(맨 앞 1개, 뒤로 2·3·4개)
    const rows = [1, 2, 3, 4], sp = 0.32;
    let z = S.z + 11.2;
    const home = [];
    for (let r = 0; r < rows.length; r++) { for (let k = 0; k < rows[r]; k++) home.push({ x: S.x + this.LX + (k - (rows[r] - 1) / 2) * sp, z: z + r * 0.28 }); }
    home.forEach((h) => {
      const root = new B.TransformNode('pin', this.scene), a = B.MeshBuilder.CreateCylinder('pinBody', { diameterTop: 0.13, diameterBottom: 0.2, height: 0.62, tessellation: 8 }, this.scene), b = B.MeshBuilder.CreateCylinder('pinStripe', { diameter: 0.15, height: 0.05, tessellation: 8 }, this.scene);
      a.parent = root; a.position.y = 0.31; a.material = this.pinMat; a.isPickable = false; b.parent = root; b.position.y = 0.5; b.material = this.pinStripe; b.isPickable = false;
      root.position.set(h.x, ly + 0.005, h.z); root.rotationQuaternion = B.Quaternion.Identity();
      const shape = new B.PhysicsShapeCylinder(new B.Vector3(0, 0.02, 0), new B.Vector3(0, 0.6, 0), 0.1, this.scene);
      shape.material = { friction: 0.5, restitution: 0.25 };
      const body = new B.PhysicsBody(root, B.PhysicsMotionType.DYNAMIC, false, this.scene); body.shape = shape;
      body.setMassProperties({ mass: 1.6, centerOfMass: new B.Vector3(0, 0.22, 0) });
      body.setLinearDamping(0.25); body.setAngularDamping(0.4);
      this.pins.push({ root, body, home: h, up: new B.Vector3(0, 1, 0), down: false, restore: 0 });
    });
    const ball = new B.TransformNode('ball', this.scene), bm = B.MeshBuilder.CreateSphere('ballMesh', { diameter: 0.46, segments: 8 }, this.scene);
    bm.parent = ball; bm.material = flatMat('ballMat', '#2f4fa8', this.scene); bm.isPickable = false;
    ball.position.set(S.x + this.LX, ly + 0.23, S.z - 9.6); ball.rotationQuaternion = B.Quaternion.Identity();
    const bs = new B.PhysicsShapeSphere(B.Vector3.Zero(), 0.23, this.scene); bs.material = { friction: 0.2, restitution: 0.2 };
    const bb = new B.PhysicsBody(ball, B.PhysicsMotionType.DYNAMIC, false, this.scene); bb.shape = bs; bb.setMassProperties({ mass: 6 }); bb.setLinearDamping(0.04); bb.setAngularDamping(0.2);
    this.ball = { root: ball, body: bb, restore: 0 };
    this.park(this.ball.root, this.ball.body, new B.Vector3(S.x + this.LX, ly + 4, S.z - 9.6), true); // 평소에는 레인 위 높은 곳에 얼려 둔다
  }
  // 몸을 옮겨 놓는다(물리가 새 위치를 받아들일 때까지 잠깐 위치 동기화를 켠다).
  park(root, body, p, hold) {
    body.disablePreStep = false; root.position.copyFrom(p); root.rotationQuaternion.copyFrom(B.Quaternion.Identity());
    body.setLinearVelocity(B.Vector3.Zero()); body.setAngularVelocity(B.Vector3.Zero());
    body.setMotionType(hold ? B.PhysicsMotionType.STATIC : B.PhysicsMotionType.DYNAMIC);
    (root === this.ball?.root ? this.ball : this.pins.find((q) => q.root === root)).restore = 3;
  }
  standPins() { // 서 있는 핀은 제자리로, 쓰러진 핀은 치운다
    for (const p of this.pins) {
      if (p.down) { this.park(p.root, p.body, new B.Vector3(p.home.x, this.laneY - 20, p.home.z), true); p.root.setEnabled(false); }
      else this.park(p.root, p.body, new B.Vector3(p.home.x, this.laneY + 0.01, p.home.z), false);
    }
  }
  resetPins() {
    for (const p of this.pins) { p.down = false; p.root.setEnabled(true); this.park(p.root, p.body, new B.Vector3(p.home.x, this.laneY + 0.01, p.home.z), false); }
  }
  startBowl() {
    if (!this.jobs.spend(100)) { this.jobs.notice('볼링 한 판은 100원이에요'); return; }
    this.mode = 'bowl'; this.round = 1; this.throwN = 1; this.score = 0; this.strikes = 0; this.hudState = 'aim'; this.aimT = 0; this.powT = 0; this.rollT = 0;
    this.player.input.blocked = true;
    const S = this.S, y = this.laneY;
    this.player.freeCam = { pos: new B.Vector3(S.x + this.LX + 0.4, y + 1.7, S.z - 14), target: new B.Vector3(S.x + this.LX, y + 0.4, S.z + 8) };
    this.resetPins(); this.prepBall();
    this.paintHud();
  }
  prepBall() {
    const S = this.S; this.park(this.ball.root, this.ball.body, new B.Vector3(S.x + this.LX, this.laneY + 0.3, S.z - 9.6), true);
  }
  press() { // E를 누를 때마다: 방향 → 세기 → 던지기
    if (this.hudState === 'aim') { this.aimLocked = Math.sin(this.aimT * 2.2); this.hudState = 'power'; this.powT = 0; }
    else if (this.hudState === 'power') { this.powLocked = Math.abs(((this.powT * 1.15) % 2) - 1); this.throwBall(); }
  }
  throwBall() {
    const b = this.ball, S = this.S;
    b.body.setMotionType(B.PhysicsMotionType.DYNAMIC); b.body.disablePreStep = false;
    // 방향(-1~1)은 핀 앞에 닿을 가로 위치(레인 가운데에서 ±0.55m)가 된다. 센 공일수록 곧게 가고, 약한 공은 느려서 조금 더 휘청인다.
    const x0 = this.aimLocked * 0.15, fwd = 8.5 + 8 * this.powLocked, tx = this.aimLocked * 0.55;
    b.root.position.set(S.x + this.LX + x0, this.laneY + 0.26, S.z - 9.6);
    const side = ((tx - x0) * fwd) / 20.8;
    b.body.setLinearVelocity(new B.Vector3(side, 0, fwd)); b.body.setAngularVelocity(new B.Vector3(fwd * 3, 0, 0));
    b.restore = 3; this.hudState = 'roll'; this.rollT = 0; this.paintHud();
  }
  settle() { // 공이 굴러간 뒤 쓰러진 핀을 센다
    let down = 0;
    for (const p of this.pins) {
      if (p.down) continue;
      const q = p.root.rotationQuaternion; B.Vector3.Up().rotateByQuaternionToRef(q, p.up);
      const moved = Math.hypot(p.root.position.x - p.home.x, p.root.position.z - p.home.z);
      if (p.up.y < 0.8 || moved > 0.45 || p.root.position.y < this.laneY - 0.2) { p.down = true; down++; }
    }
    const standing = this.pins.filter((p) => !p.down).length;
    this.score += down;
    const strike = this.throwN === 1 && standing === 0;
    if (strike) { this.strikes++; this.jobs.notice('🎳 스트라이크!', 'good'); }
    else if (this.throwN === 2 && standing === 0) this.jobs.notice('🎳 스페어!', 'good');
    if (this.throwN === 1 && !strike) { this.throwN = 2; this.standPins(); this.prepBall(); }
    else {
      if (this.round >= 3) return this.endBowl();
      this.round++; this.throwN = 1; this.resetPins(); this.prepBall();
    }
    this.hudState = 'aim'; this.aimT = 0; this.paintHud();
  }
  endBowl() {
    const pay = this.score * 7 + this.strikes * 25;
    this.stop();
    this.reward(pay, `🎳 볼링 ${this.score}핀${this.strikes ? ` (스트라이크 ${this.strikes})` : ''}`);
    stats.bump('bowls');
  }
  paintHud() {
    this.hud.hidden = false;
    const st = { aim: '방향을 정하세요 (E)', power: '세기를 정하세요 (E)', roll: '굴러가는 중…' }[this.hudState] || '';
    this.hud.innerHTML = `<b>🎳 ${this.round}/3번째 판 · ${this.throwN}구</b><span>${this.score}핀</span><small>${st}</small><div class="meter" ${this.hudState === 'aim' || this.hudState === 'power' ? '' : 'hidden'}><i id="bowlMark"></i></div>`;
  }

  // ================= 오락실 =================
  buildOverlay() {
    const el = document.createElement('div'); el.id = 'arcade'; el.hidden = true;
    el.innerHTML = `<div class="box"><header><b id="arcTitle">🎮 박스 오락실</b><button data-close>✕</button></header><div id="arcMenu"></div><div id="arcPlay" hidden><div id="arcInfo"></div><canvas id="arcCv" width="360" height="360"></canvas><div id="arcPad" hidden><button data-d="U">▲</button><div><button data-d="L">◀</button><button data-d="D">▼</button><button data-d="R">▶</button></div></div></div></div>`;
    document.body.appendChild(el); this.el = el;
    el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) this.stop(); const g = e.target.closest('[data-game]'); if (g) this.startGame(g.dataset.game); const d = e.target.closest('[data-d]'); if (d) this.dir(d.dataset.d); });
    const cv = $('arcCv');
    cv.addEventListener('pointerdown', (e) => { if (this.game && this.game.tap) { const r = cv.getBoundingClientRect(); this.game.tap((e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)); } });
    addEventListener('keydown', (e) => { if (this.mode !== 'game' || !this.game) return; const k = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' }[e.code]; if (k) { e.preventDefault(); this.dir(k); } });
    let sx = 0, sy = 0;
    cv.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    cv.addEventListener('touchend', (e) => { const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) this.dir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); }, { passive: true });
  }
  openMenu() {
    this.mode = 'menu'; this.player.input.blocked = true; this.el.hidden = false; this.day = load();
    $('arcPlay').hidden = true; $('arcMenu').hidden = false; $('arcTitle').textContent = '🎮 박스 오락실';
    $('arcMenu').innerHTML = `<p class="cap">오늘 받을 수 있는 상금 ${won(this.capLeft())}원 남음 · 한 판 50원</p>
      <button data-game="mole"><b>🔨 두더지 잡기</b><small>30초 동안 올라오는 상자를 두드리세요 (폭탄은 피하세요)</small></button>
      <button data-game="snake"><b>🐍 뱀 게임</b><small>화살표·WASD, 폰은 화면을 밀거나 버튼으로</small></button>`;
  }
  startGame(id) {
    if (!this.jobs.spend(50)) { $('arcMenu').querySelector('.cap').textContent = '한 판은 50원이에요. 돈이 모자라요'; return; }
    this.mode = 'game'; $('arcMenu').hidden = true; $('arcPlay').hidden = false;
    $('arcPad').hidden = id !== 'snake';
    this.game = id === 'mole' ? this.mole() : this.snake();
    $('arcTitle').textContent = id === 'mole' ? '🔨 두더지 잡기' : '🐍 뱀 게임';
  }
  dir(d) { if (this.game && this.game.dir) this.game.dir(d); }
  finishGame(score, pay, text) {
    this.game = null; this.mode = 'menu'; $('arcPlay').hidden = true; $('arcMenu').hidden = false;
    const got = this.reward(pay, text); stats.bump('arcade');
    this.openMenu(); $('arcMenu').querySelector('.cap').textContent = `${text} → 상금 ${won(got)}원 · 오늘 ${won(this.capLeft())}원 더 받을 수 있어요`;
  }
  mole() {
    const cv = $('arcCv'), c = cv.getContext('2d'), info = $('arcInfo'), cells = Array.from({ length: 9 }, () => ({ t: 0, kind: 0, hit: 0 }));
    let t = 30, score = 0, spawn = 0, last = performance.now(), alive = true;
    const g = {
      tap: (x, y) => {
        const i = Math.floor(x / 120) + Math.floor(y / 120) * 3, m = cells[i]; if (!m || m.t <= 0) return;
        if (m.kind === 1) { score = Math.max(0, score - 3); m.hit = 0.3; m.t = 0; } else { score++; m.hit = 0.3; m.t = 0; m.kind = 2; }
      },
    };
    const loop = (now) => {
      if (!alive) return; const dt = Math.min(0.5, (now - last) / 1000); last = now;
      if (this.mode !== 'game' || this.game !== g) { alive = false; return; }
      t -= dt; spawn -= dt;
      const speed = 1 - (30 - t) / 30 * 0.5;
      if (spawn <= 0) { const free = cells.map((m, i) => (m.t <= 0 ? i : -1)).filter((i) => i >= 0); if (free.length) { const m = cells[free[Math.floor(Math.random() * free.length)]]; m.t = 0.5 + 0.7 * speed; m.kind = Math.random() < 0.2 ? 1 : 0; m.hit = 0; } spawn = 0.35 + 0.4 * speed; }
      c.fillStyle = '#3d9a52'; c.fillRect(0, 0, 360, 360);
      cells.forEach((m, i) => {
        const x = (i % 3) * 120, y = Math.floor(i / 3) * 120; m.t -= dt; m.hit -= dt;
        c.fillStyle = '#2b6b39'; c.fillRect(x + 14, y + 66, 92, 40);
        if (m.t > 0 || m.hit > 0) {
          c.fillStyle = m.kind === 1 ? '#222' : m.kind === 2 ? '#ffd84a' : '#9a6a3a'; c.fillRect(x + 24, y + 22, 72, 62);
          c.fillStyle = m.kind === 1 ? '#e5322d' : '#16223a'; c.fillRect(x + 40, y + 40, 10, 10); c.fillRect(x + 70, y + 40, 10, 10); c.fillRect(x + 50, y + 62, 20, 6);
        }
      });
      info.textContent = `남은 시간 ${Math.max(0, Math.ceil(t))}초 · ${score}점`;
      if (t <= 0) { alive = false; this.finishGame(score, score * 3 + (score >= 25 ? 40 : 0), `🔨 두더지 ${score}점`); return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return g;
  }
  snake() {
    const cv = $('arcCv'), c = cv.getContext('2d'), info = $('arcInfo'), N = 16, Z = 22.5;
    let body = [[8, 8], [7, 8], [6, 8]], dirv = [1, 0], next = [1, 0], food = [12, 8], score = 0, acc = 0, alive = true, last = performance.now();
    const place = () => { for (let k = 0; k < 200; k++) { const f = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; if (!body.some((s) => s[0] === f[0] && s[1] === f[1])) return f; } return [0, 0]; };
    const g = { dir: (d) => { const v = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }[d]; if (v && !(v[0] === -dirv[0] && v[1] === -dirv[1])) next = v; } };
    const draw = () => {
      c.fillStyle = '#16223a'; c.fillRect(0, 0, 360, 360);
      c.fillStyle = '#e5322d'; c.fillRect(food[0] * Z + 3, food[1] * Z + 3, Z - 6, Z - 6);
      body.forEach((s, i) => { c.fillStyle = i ? '#57c27a' : '#a8f0b8'; c.fillRect(s[0] * Z + 1, s[1] * Z + 1, Z - 2, Z - 2); });
      info.textContent = `먹이 ${score}개`;
    };
    const loop = (now) => {
      if (!alive) return; const dt = Math.min(0.5, (now - last) / 1000); last = now;
      if (this.mode !== 'game' || this.game !== g) { alive = false; return; }
      acc += dt; const step = Math.max(0.07, 0.17 - score * 0.004);
      while (acc >= step) {
        acc -= step; dirv = next;
        const h = [body[0][0] + dirv[0], body[0][1] + dirv[1]];
        if (h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N || body.some((s) => s[0] === h[0] && s[1] === h[1])) { alive = false; draw(); setTimeout(() => this.finishGame(score, Math.min(score, 15) * 8, `🐍 뱀 ${score}개`), 450); return; }
        body.unshift(h);
        if (h[0] === food[0] && h[1] === food[1]) { score++; food = place(); } else body.pop();
      }
      draw(); requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return g;
  }
  stop() {
    this.game = null; this.mode = 'idle'; this.el.hidden = true; this.hud.hidden = true;
    this.player.input.blocked = false; this.player.freeCam = null; this.player.snap = true;
    if (this.ball) this.park(this.ball.root, this.ball.body, new B.Vector3(this.S.x + this.LX, this.laneY + 4, this.S.z - 9.6), true);
  }

  update(dt) {
    if (this.lobby && this.lobby.open && this.mode !== 'idle') { this.stop(); return; }
    // 위치를 옮겨 놓은 몸은 물리가 받아들인 뒤에 다시 물리가 주도하게 한다.
    for (const p of [...this.pins, this.ball]) if (p && p.restore > 0 && --p.restore === 0) p.body.disablePreStep = true;
    if (this.mode !== 'bowl') return;
    if (this.hudState === 'aim') { this.aimT += dt; this.mark(Math.sin(this.aimT * 2.2) * 0.5 + 0.5); }
    else if (this.hudState === 'power') { this.powT += dt; this.mark(Math.abs(((this.powT * 1.15) % 2) - 1)); }
    else if (this.hudState === 'roll') {
      this.rollT += dt;
      const b = this.ball.root.position, v = this.ball.body.getLinearVelocity().length();
      const pinsMoving = this.pins.some((p) => !p.down && p.body.getLinearVelocity().length() > 0.25);
      if (this.rollT > 3 && ((v < 0.35 && !pinsMoving) || this.rollT > 8 || b.z > this.S.z + 14.5)) { if (this.rollT > 4.2 || (v < 0.35 && !pinsMoving)) this.settle(); }
    }
  }
  mark(r) { const m = $('bowlMark'); if (m) m.style.left = Math.round(r * 100) + '%'; }
}
