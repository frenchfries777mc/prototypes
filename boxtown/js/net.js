// 멀티플레이: 방 코드로 모여 서로의 캐릭터, 옷차림, 탈것, 채팅, 공격을 주고받는다.
// 방장에게 모두가 붙는 별 모양 연결이다(방장이 받은 것을 나머지에게 돌린다). 연결은 PeerJS(WebRTC)를 쓴다.
// 주민, 지나다니는 차, 경찰, 직업은 저마다 자기 화면에서 따로 돌아간다. 기차와 신호등만 방장 기준으로 맞춘다.
import { Character, LOOKS } from './character.js';
import { CAR_MASK } from './vehicles.js';
const B = window.BABYLON;

const PEER_JS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'boxtown-v1-';
const MAX_PLAYERS = 8, SEND_HZ = 12, DELAY = 0.13; // 다른 사람은 0.13초 전 모습을 부드럽게 이어 그린다
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const num = (v) => typeof v === 'number' && isFinite(v);
const HEX = /^#[0-9a-fA-F]{6}$/;

// 남이 보낸 옷차림은 그대로 믿지 않는다: 색은 색 형식만, 나머지는 짧은 글자만 받는다.
function cleanLook(l) {
  const out = { ...LOOKS.courier, face: 'none', neck: 'none', back: 'none' };
  if (!l || typeof l !== 'object') return out;
  for (const k of ['skin', 'shirt', 'pants', 'shoes', 'hat', 'brim']) if (typeof l[k] === 'string' && HEX.test(l[k])) out[k] = l[k];
  for (const k of ['head', 'face', 'neck', 'back']) if (typeof l[k] === 'string' && /^[a-z]{1,16}$/.test(l[k])) out[k] = l[k];
  return out;
}
const cleanName = (n) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) : '') || '손님';

// ----- 연결 방식 둘: PeerJS(진짜), BroadcastChannel(같은 브라우저 안에서 시험용) -----
// 공통 모양: open(), sendTo(id, msg), all(msg, except), close(). 이벤트: onOpen, onPeer(id), onMsg(id, msg), onGone(id), onFail(문구)
class PeerLink {
  constructor(code, host) { this.code = code; this.host = host; this.conns = new Map(); }
  async open() {
    if (!window.Peer) await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = PEER_JS; s.onload = ok; s.onerror = () => bad(new Error('연결 도구를 불러오지 못했어요')); document.head.appendChild(s); });
    const peer = (this.peer = this.host ? new window.Peer(PREFIX + this.code) : new window.Peer());
    peer.on('error', (e) => {
      const t = e && e.type;
      this.onFail(t === 'unavailable-id' ? 'taken' : t === 'peer-unavailable' ? '그런 방이 없어요. 코드를 확인해 주세요' : t === 'network' || t === 'server-error' || t === 'socket-error' ? '연결 서버에 닿지 못했어요' : '연결에 실패했어요');
    });
    peer.on('open', () => {
      if (this.host) { this.onOpen(); return; }
      const c = peer.connect(PREFIX + this.code, { reliable: true });
      this.wire(c, 'host', () => this.onOpen());
      setTimeout(() => { if (!c.open && !this.closed) this.onFail('방에 들어가지 못했어요(시간 초과)'); }, 12000);
    });
    if (this.host) peer.on('connection', (c) => this.wire(c, c.peer, () => this.onPeer(c.peer)));
    peer.on('disconnected', () => { if (!this.closed) { try { peer.reconnect(); } catch (e) { /* 무시 */ } } });
  }
  wire(c, id, opened) {
    c.on('open', () => { this.conns.set(id, c); opened(); });
    c.on('data', (d) => this.onMsg(id, d));
    const gone = () => { if (this.conns.get(id) === c) { this.conns.delete(id); this.onGone(id); } };
    c.on('close', gone); c.on('error', gone);
  }
  sendTo(id, msg) { const c = this.conns.get(id); if (c && c.open) { try { c.send(msg); } catch (e) { /* 끊기는 중 */ } } }
  all(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(msg); } catch (e) { /* 끊기는 중 */ } } }
  close() { this.closed = true; try { this.peer && this.peer.destroy(); } catch (e) { /* 무시 */ } }
}
class LocalLink {
  constructor(code, host) { this.code = code; this.host = host; this.me = host ? 'host' : 'g' + Math.random().toString(36).slice(2, 8); this.peers = new Set(); }
  async open() {
    const ch = (this.ch = new BroadcastChannel(PREFIX + this.code));
    ch.onmessage = (e) => {
      const m = e.data;
      if (m.to && m.to !== this.me) return;
      if (m.c === 'hi' && this.host) { this.peers.add(m.from); ch.postMessage({ to: m.from, from: 'host', c: 'ok' }); this.onPeer(m.from); }
      else if (m.c === 'ok' && !this.host) { this.peers.add('host'); this.onOpen(); }
      else if (m.c === 'bye') { if (this.peers.delete(m.from)) this.onGone(m.from); }
      else if (m.d && this.peers.has(m.from)) this.onMsg(m.from, m.d);
    };
    if (this.host) setTimeout(() => this.onOpen(), 0);
    else { ch.postMessage({ to: 'host', from: this.me, c: 'hi' }); setTimeout(() => { if (!this.peers.size && !this.closed) this.onFail('그런 방이 없어요. 코드를 확인해 주세요'); }, 1500); }
    addEventListener('pagehide', () => this.close());
  }
  sendTo(id, msg) { if (this.peers.has(id)) this.ch.postMessage({ to: id, from: this.me, d: msg }); }
  all(msg, except) { for (const id of this.peers) if (id !== except) this.sendTo(id, msg); }
  close() { if (this.closed) return; this.closed = true; try { this.ch.postMessage({ from: this.me, c: 'bye' }); this.ch.close(); } catch (e) { /* 무시 */ } }
}

// ----- 다른 플레이어 한 명 -----
class Remote {
  constructor(net, id, name, look) {
    this.net = net; this.id = id; this.name = cleanName(name);
    const scene = net.scene;
    this.chr = new Character(scene, cleanLook(look));
    this.chr.onMeshes = (old, added) => { net.dropShadow(old); net.addShadow(added); };
    net.addShadow(this.chr.meshes);
    this.pos = new B.Vector3(0, -500, 0); this.vel = new B.Vector3(); this.heading = 0; this.snaps = []; this.flags = 0; this.swingN = -1; this.car = null; this.cars = new Map();
    this.say = ''; this.sayT = 0; this.seen = false; this.heard = performance.now() / 1000;
    // 이름표(말을 하면 잠깐 말풍선이 된다)
    this.tex = new B.DynamicTexture('tag_' + id, { width: 512, height: 160 }, scene, true);
    const m = new B.StandardMaterial('tagMat_' + id, scene);
    m.diffuseTexture = this.tex; m.emissiveTexture = this.tex; m.opacityTexture = this.tex; m.disableLighting = true; m.backFaceCulling = false; this.tex.hasAlpha = true;
    this.tag = B.MeshBuilder.CreatePlane('tag_' + id, { width: 3.2, height: 1 }, scene);
    this.tag.material = m; this.tag.billboardMode = B.Mesh.BILLBOARDMODE_ALL; this.tag.isPickable = false; this.tag.renderingGroupId = 1;
    this.drawTag();
    this.chr.setVisible(false); this.tag.setEnabled(false);
  }
  drawTag() {
    const c = this.tex.getContext(), text = this.say ? this.say : this.name, two = !!this.say;
    c.clearRect(0, 0, 512, 160);
    c.font = '800 46px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const draw = (str, y, bg, fg, size) => {
      c.font = `800 ${size}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
      let s = str; while (c.measureText(s).width > 470 && s.length > 2) s = s.slice(0, -2) + '…';
      const w = Math.min(500, c.measureText(s).width + 36), h = size + 22;
      c.fillStyle = bg; c.beginPath(); c.roundRect(256 - w / 2, y - h / 2, w, h, 16); c.fill();
      c.fillStyle = fg; c.fillText(s, 256, y + 2);
    };
    if (two) { draw(text, 44, 'rgba(255,255,255,.95)', '#16223a', 40); draw(this.name, 120, 'rgba(22,34,58,.8)', '#fff', 34); } else draw(text, 112, 'rgba(22,34,58,.8)', '#fff', 42);
    this.tex.update();
  }
  speak(text) { this.say = text; this.sayT = 6; this.drawTag(); }
  // 받은 모습을 쌓아 두었다가 조금 늦게 이어 그린다.
  push(m, now) {
    if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(num) || !num(m.h)) return;
    const s = { t: now, p: m.p, h: m.h, v: Array.isArray(m.v) && m.v.every(num) ? m.v : [0, 0, 0], g: m.g ? 1 : 0, f: m.f | 0, n: m.n | 0, c: null };
    if (Array.isArray(m.c) && typeof m.c[0] === 'string' && m.c.length === 10 && m.c.slice(1, 8).every(num)) s.c = m.c;
    this.snaps.push(s); this.heard = now;
    if (this.snaps.length > 12) this.snaps.shift();
    this.seen = true;
  }
  carFor(key, boat) {
    let v = this.cars.get(key);
    if (v) return v;
    const net = this.net, scene = net.scene, root = new B.TransformNode('rcar_' + this.id, scene);
    root.rotationQuaternion = new B.Quaternion();
    let w = 2, h = 1.4, l = 4, zc = 0;
    try {
      if (boat) { const mesh = net.assets.spawn(key); mesh.parent = root; const bb = net.assets.bounds(key); w = bb.max.x - bb.min.x; l = bb.max.z - bb.min.z; h = 1.1; zc = (bb.max.z + bb.min.z) / 2; net.addShadow([mesh]); }
      else {
        const parts = net.assets.spawnCar(key);
        parts.body.parent = root; for (const wh of parts.wheels) { wh.mesh.parent = root; wh.mesh.position.copyFrom(wh.pos); }
        w = parts.max.x - parts.min.x; l = parts.max.z - parts.min.z; h = parts.max.y; zc = (parts.max.z + parts.min.z) / 2;
      }
    } catch (e) { return null; } // 모르는 탈것 이름
    // 부딪힐 수 있게 움직이는 충돌 상자를 붙인다.
    const shape = new B.PhysicsShapeBox(new B.Vector3(0, h / 2 + 0.2, zc), B.Quaternion.Identity(), new B.Vector3(w * 0.94, Math.max(0.4, h - 0.3), l * 0.97), scene);
    shape.filterMembershipMask = CAR_MASK;
    const body = new B.PhysicsBody(root, B.PhysicsMotionType.ANIMATED, false, scene);
    body.shape = shape; body.disablePreStep = false;
    v = { root, h, boat, body };
    this.cars.set(key, v);
    return v;
  }
  update(dt, now, hideInside) {
    const S = this.snaps;
    if (!S.length) return;
    const t = now - DELAY;
    let a = S[0], b = S[S.length - 1];
    for (let i = S.length - 1; i > 0; i--) if (S[i - 1].t <= t) { a = S[i - 1]; b = S[i]; break; }
    if (t <= S[0].t) b = a = S[0];
    const k = b.t > a.t ? Math.min(1.25, Math.max(0, (t - a.t) / (b.t - a.t))) : 1; // 살짝 앞질러 그려 끊김을 메운다
    const far = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]) > 30; // 순간 이동은 건너뛴다
    const L = (i) => (far ? b.p[i] : a.p[i] + (b.p[i] - a.p[i]) * k);
    this.pos.set(L(0), L(1), L(2));
    this.vel.set(b.v[0], b.v[1], b.v[2]);
    let dh = (b.h - a.h) % (Math.PI * 2); if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this.heading = a.h + dh * Math.min(1, k);
    this.flags = b.f;
    const stale = now - S[S.length - 1].t > 4; // 한동안 소식이 없으면 숨긴다
    const inside = !!(b.f & 1), hidden = stale || !!(b.f & 16) || (inside && hideInside);
    // 탈것
    // 처음부터 세워져 있던 차는 모든 화면에 같은 번호로 있다. 그 차라면 내 화면의 그 차를 그대로 움직인다(두 대로 보이지 않게).
    const cs = b.c;
    let car = null;
    if (cs && !stale) {
      const L = cs[9] >= 0 ? this.net.garage.cars[cs[9]] : null;
      if (L && L.netIndex === cs[9] && L.key === cs[0] && L !== this.net.player.vehicle && !L.dead && (!L.netHeld || L.netHeld === this.id)) {
        if (!L.netHeld) { L.netHeld = this.id; L.body.disablePreStep = false; L.body.setMotionType(B.PhysicsMotionType.ANIMATED); }
        car = this.heldCar && this.heldCar.held === L ? this.heldCar : (this.heldCar = { root: L.root, h: L.height, held: L });
      } else car = this.carFor(cs[0], !!cs[8]);
    }
    if (this.car && this.car !== car) this.release(this.car);
    this.car = car;
    if (car) {
      if (!car.held) car.root.setEnabled(true);
      const ca = a.c && a.c[0] === cs[0] && !far ? a.c : cs, kk = Math.min(1, k);
      car.root.position.set(ca[1] + (cs[1] - ca[1]) * k, ca[2] + (cs[2] - ca[2]) * k, ca[3] + (cs[3] - ca[3]) * k);
      B.Quaternion.SlerpToRef(new B.Quaternion(ca[4], ca[5], ca[6], ca[7]), new B.Quaternion(cs[4], cs[5], cs[6], cs[7]), kk, car.root.rotationQuaternion);
    }
    const showChr = !hidden && !car;
    if (this.chr.root.isEnabled() !== showChr) this.chr.setVisible(showChr);
    if (showChr) {
      this.chr.wave = b.f & 2 ? 1 : 0; this.chr.aim = b.f & 8 ? 1 : 0;
      if (b.n !== this.swingN) { if (this.swingN >= 0) { this.chr.swing = 1; this.chr.swingTime = 0.3; } this.swingN = b.n; }
      this.chr.update(dt, { pos: this.pos, vel: this.vel, grounded: !!b.g, wishHeading: this.heading, landed: 0, jumped: false });
    }
    const showTag = !hidden;
    if (this.tag.isEnabled() !== showTag) this.tag.setEnabled(showTag);
    if (showTag) { const top = car ? car.root.position : this.pos; this.tag.position.set(top.x, top.y + (car ? car.h + 1.3 : 2.55), top.z); }
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) { this.say = ''; this.drawTag(); } }
    this.hidden = hidden;
  }
  // 타던 차에서 내렸다: 빌려 쓰던 내 화면의 차는 그 자리에 두고 다시 물리로 돌려보낸다. 따로 만든 차는 치운다.
  release(car) {
    if (car.held) { const L = car.held; L.netHeld = null; L.body.setMotionType(B.PhysicsMotionType.DYNAMIC); L.body.setLinearVelocity(B.Vector3.Zero()); L.body.setAngularVelocity(B.Vector3.Zero()); L.restore = 2; this.heldCar = null; }
    else { car.root.position.set(0, -500, 0); car.root.setEnabled(false); }
  }
  dispose() {
    if (this.car) this.release(this.car);
    this.net.dropShadow(this.chr.meshes); this.chr.onMeshes = null;
    this.chr.meshes.forEach((m) => m.dispose()); this.chr.root.dispose();
    this.tag.dispose(); this.tex.dispose();
    for (const v of this.cars.values()) { const ms = v.root.getChildMeshes(); this.net.dropShadow(ms); if (v.body) v.body.dispose(); ms.forEach((m) => m.dispose()); v.root.dispose(); }
  }
}

export class Net {
  constructor(o) {
    Object.assign(this, o);
    this.garage.cars.forEach((c, i) => { c.netIndex = i; }); // 처음부터 있던 탈것의 번호(모든 화면에서 같다)
    this.seat = { seat: new B.Vector3(), r: null }; // 친구 차에 얻어 탈 때의 자리
    // scene, assets, player, character, wardrobe, weapons, health, train, traffic, addShadow, local(시험용 연결)
    this.mode = null; this.code = ''; this.id = ''; this.status = ''; this.link = null; this.remotes = new Map(); this.sendT = 0; this.worldT = 0; this.swingN = 0; this.swingWas = 0; this.log = [];
    this.name = '';
    try { this.name = localStorage.getItem('boxtown.name') || ''; } catch (e) { /* 무시 */ }
    if (!this.name) this.name = '박스' + Math.floor(100 + Math.random() * 900);
    addEventListener('pagehide', () => this.leave(true));
  }
  get on() { return !!this.mode && this.ready; }
  get count() { return this.on ? this.remotes.size + 1 : 0; }
  setName(n) { this.name = cleanName(n); try { localStorage.setItem('boxtown.name', this.name); } catch (e) { /* 무시 */ } }
  changed() { if (this.onChange) this.onChange(); }
  say(text, who = '') { this.log.push({ who, text }); if (this.log.length > 30) this.log.shift(); if (this.onChat) this.onChat(); }

  // ----- 방 만들기 / 들어가기 / 나가기 -----
  async host(tries = 0) {
    this.leave(true);
    this.mode = 'host'; this.ready = false; this.code = newCode(); this.id = 'host'; this.status = '방을 만드는 중…'; this.changed();
    const link = (this.link = this.local ? new LocalLink(this.code, true) : new PeerLink(this.code, true));
    link.onOpen = () => { this.ready = true; this.status = ''; this.say(`방을 만들었어요. 코드 ${this.code}`); this.changed(); };
    link.onPeer = () => {}; // 인사(hello)가 오면 그때 들인다
    link.onMsg = (id, m) => this.fromGuest(id, m);
    link.onGone = (id) => this.drop(id, true);
    link.onFail = (why) => { if (this.link !== link) return; if (why === 'taken' && tries < 4) return this.host(tries + 1); this.fail(why === 'taken' ? '방을 만들지 못했어요. 다시 해 보세요' : why); };
    try { await link.open(); } catch (e) { if (this.link === link) this.fail(e.message); }
  }
  async join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) { this.status = '방 코드는 다섯 글자예요'; this.changed(); return; }
    this.leave(true);
    this.mode = 'guest'; this.ready = false; this.code = code; this.status = '방에 들어가는 중…'; this.changed();
    const link = (this.link = this.local ? new LocalLink(code, false) : new PeerLink(code, false));
    this.hostHeard = performance.now() / 1000 + 20;
    link.onOpen = () => link.sendTo('host', { t: 'hello', name: this.name, look: this.wardrobe.look });
    link.onPeer = () => {};
    link.onMsg = (id, m) => this.fromHost(m);
    link.onGone = () => { if (this.link === link) { this.leave(true); this.status = '방장과 연결이 끊겼어요'; this.say('방장과 연결이 끊겼어요'); this.changed(); } };
    link.onFail = (why) => { if (this.link === link) this.fail(why); };
    try { await link.open(); } catch (e) { if (this.link === link) this.fail(e.message); }
  }
  fail(why) { this.leave(true); this.status = why; this.changed(); }
  leave(quiet) {
    if (this.link) { this.link.close(); this.link = null; }
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    if (this.player.riding === this.seat) this.getOff();
    const was = this.mode; this.mode = null; this.ready = false; this.code = '';
    if (!quiet) { this.status = ''; if (was) this.say('방에서 나왔어요'); this.changed(); }
  }

  // ----- 사람 들이고 내보내기 -----
  add(id, name, look) {
    if (this.remotes.has(id)) return this.remotes.get(id);
    const r = new Remote(this, id, name, look);
    this.remotes.set(id, r);
    this.say(`${r.name} 님이 들어왔어요`);
    this.changed();
    return r;
  }
  drop(id, tell) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.say(`${r.name} 님이 나갔어요`);
    r.dispose(); this.remotes.delete(id);
    if (tell && this.mode === 'host') this.link.all({ t: 'leave', i: id });
    this.changed();
  }

  // ----- 받은 것 처리 -----
  fromGuest(id, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.remotes.size + 1 >= MAX_PLAYERS) { this.link.sendTo(id, { t: 'full' }); return; }
      const peers = [{ i: 'host', name: this.name, look: this.wardrobe.look }, ...[...this.remotes.values()].map((r) => ({ i: r.id, name: r.name, look: r.chr.look }))];
      const r = this.add(id, m.name, m.look);
      this.link.sendTo(id, { t: 'welcome', you: id, peers, w: this.world() });
      this.link.all({ t: 'join', i: id, name: r.name, look: r.chr.look }, id);
      return;
    }
    if (!this.remotes.has(id)) return;
    m.i = id; // 보낸 사람은 연결로 정한다(남인 척 못 하게)
    if (m.t === 'hit') { if (m.to === 'host') this.gotHit(m); else if (this.remotes.has(m.to)) this.link.sendTo(m.to, m); return; }
    this.apply(m);
    if (m.t === 's' || m.t === 'look' || m.t === 'chat' || m.t === 'fx') this.link.all(m, id);
  }
  fromHost(m) {
    if (!m || typeof m !== 'object') return;
    this.hostHeard = performance.now() / 1000;
    if (m.t === 'welcome') {
      this.id = m.you; this.ready = true; this.status = '';
      for (const p of m.peers || []) this.add(p.i, p.name, p.look);
      this.say(`방 ${this.code}에 들어왔어요`);
      this.applyWorld(m.w); this.changed();
    } else if (m.t === 'full') this.fail('방이 가득 찼어요');
    else if (m.t === 'join') this.add(m.i, m.name, m.look);
    else if (m.t === 'leave') this.drop(m.i, false);
    else if (m.t === 'w') this.applyWorld(m.w);
    else if (m.t === 'hit') this.gotHit(m);
    else this.apply(m);
  }
  apply(m) {
    const r = this.remotes.get(m.i);
    if (!r) return;
    if (m.t === 's') r.push(m, performance.now() / 1000);
    else if (m.t === 'look') r.chr.setLook(cleanLook(m.look));
    else if (m.t === 'chat' && typeof m.text === 'string') { const text = m.text.replace(/[\u0000-\u001f]/g, ' ').slice(0, 80); if (text.trim()) { r.speak(text); this.say(text, r.name); } }
    else if (m.t === 'fx' && Array.isArray(m.p) && m.p.every(num) && this.weapons) {
      const far = Math.hypot(m.p[0] - this.player.feet.x, m.p[2] - this.player.feet.z);
      if (far > 220) return;
      if (m.k === 'boom') { this.weapons.emit('boom', m.p[0], m.p[1] + 0.5, m.p[2], 110); this.weapons.emit('puff', m.p[0], m.p[1] + 1, m.p[2], 40); if (far < 140) this.weapons.sfx.play('boom'); }
      else if (m.k === 'shot') { this.weapons.emit('spark', m.p[0], m.p[1], m.p[2], 8); if (far < 90) this.weapons.sfx.play('shot'); }
    }
  }
  send(m) { if (!this.on) return; if (this.mode === 'host') this.link.all(m); else this.link.sendTo('host', m); }

  // ----- 방장 기준으로 맞추는 것: 기차, 신호등 -----
  world() { const T = this.train, F = this.traffic; return { tr: [r2(T.s), T.dir, r2(T.v), r2(T.wait), T.stop, T.next === undefined ? -1 : T.next], tt: r2(F.t), day: r3(this.daynight.t) }; }
  applyWorld(w) {
    if (!w || !Array.isArray(w.tr) || !w.tr.every(num) || !num(w.tt)) return;
    const T = this.train, [s, dir, v, wait, stop, next] = w.tr;
    if (stop < 0 || stop >= T.stations.length || next >= T.stations.length || Math.abs(dir) !== 1) return;
    if (Math.abs(T.s - s) > 4 || T.dir !== dir || T.stop !== stop || (T.wait > 0) !== (wait > 0)) { T.s = Math.max(0, Math.min(T.len, s)); T.dir = dir; T.v = Math.max(0, Math.min(30, v)); T.wait = wait; T.stop = stop; if (next >= 0) T.next = next; T.place(); }
    if (Math.abs(this.traffic.t - w.tt) > 0.5) this.traffic.t = w.tt;
    if (num(w.day) && w.day >= 0 && w.day < 1) { const d = Math.abs(this.daynight.t - w.day); if (Math.min(d, 1 - d) > 0.004) this.daynight.t = w.day; }
  }

  // ----- 서로 때리기 -----
  // 총알이 다른 플레이어(걸어 다니는 사람, 또는 탄 차)에 맞는지
  rayHit(o, d, maxT) {
    let best = null, bt = maxT;
    for (const r of this.remotes.values()) {
      if (r.hidden || !r.seen) continue;
      const c = r.car ? r.car.root.position : r.pos, rad = r.car ? 1.5 : 0.8, up = r.car ? 0.8 : 1.0;
      const cx = c.x - o.x, cy = c.y + up - o.y, cz = c.z - o.z, t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > bt) continue;
      const ex = cx - d.x * t, ey = cy - d.y * t, ez = cz - d.z * t;
      if (ex * ex + ey * ey + ez * ez < rad * rad) { bt = t; best = r; }
    }
    return best ? { r: best, t: bt } : null;
  }
  // 주먹·방망이가 닿는 곳에 있는 다른 플레이어들
  near(x, y, z, range) { const out = []; for (const r of this.remotes.values()) { if (r.hidden || !r.seen) continue; const p = r.car ? r.car.root.position : r.pos; if (Math.abs(p.y - y) < 2.5 && Math.hypot(p.x - x, p.z - z) < range + (r.car ? 1.6 : 0)) out.push(r); } return out; }
  hit(r, dmg, dx, dz) { const m = { t: 'hit', to: r.id, d: Math.round(dmg), x: r2(dx), z: r2(dz) }; if (this.mode === 'host') this.link.sendTo(r.id, m); else this.send(m); }
  blast(x, y, z, radius) {
    this.send({ t: 'fx', k: 'boom', p: [r2(x), r2(y), r2(z)] });
    for (const r of this.remotes.values()) { if (r.hidden || !r.seen) continue; const p = r.car ? r.car.root.position : r.pos, d = Math.hypot(p.x - x, p.y + 1 - y, p.z - z); if (d < radius + 1) this.hit(r, 110 * (1 - d / (radius + 1)), p.x - x, p.z - z); }
  }
  shot(p) { this.send({ t: 'fx', k: 'shot', p: [r2(p.x), r2(p.y), r2(p.z)] }); }
  gotHit(m) {
    const P = this.player, d = Math.max(0, Math.min(150, +m.d || 0)), l = Math.hypot(+m.x || 0, +m.z || 0) || 1, dx = (+m.x || 0) / l, dz = (+m.z || 0) / l;
    if (!d || P.inside || P.jailed) return; // 건물 안이나 감옥에서는 맞지 않는다
    if (P.vehicle) { P.vehicle.hp -= d * 0.5; P.shake = Math.max(P.shake, 0.4); return; }
    this.health.hurt(d * 0.4, dx, dz, 'player', 3); // 친구끼리는 덜 아프게
  }

  // ----- 친구 차에 얻어 타기 -----
  rideable() {
    const P = this.player;
    if (!this.on || P.vehicle || P.riding || P.inside) return null;
    let best = null, bd = 3.6;
    for (const r of this.remotes.values()) { if (!r.car || r.hidden) continue; const p = r.car.root.position, d = Math.hypot(p.x - P.feet.x, p.z - P.feet.z); if (d < bd && Math.abs(p.y - P.feet.y) < 3) { bd = d; best = r; } }
    return best;
  }
  prompt() { const P = this.player; if (P.riding === this.seat) return '내리기'; const r = this.rideable(); return r ? `${r.name} 차에 타기` : ''; }
  use() {
    const P = this.player;
    if (P.riding === this.seat) { this.getOff(); return true; }
    const r = this.rideable();
    if (!r) return false;
    this.seat.r = r; this.seat.seat.copyFrom(r.car.root.position);
    P.riding = this.seat; P.inside = true; P.chr.setVisible(false); // 타는 동안은 다치지 않는다
    P.cc.setPosition(new B.Vector3(r.car.root.position.x, r.car.root.position.y + 400, r.car.root.position.z));
    return true;
  }
  getOff() {
    const P = this.player, s = this.seat.seat;
    if (P.riding !== this.seat) return;
    P.riding = null; P.inside = false; P.chr.setVisible(true);
    P.teleport(s.x + 2.2, s.y + 0.4, s.z);
    this.seat.r = null;
  }
  chat(text) {
    text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
    if (!text) return;
    this.say(text, this.name);
    this.send({ t: 'chat', text });
  }
  sendLook() { this.send({ t: 'look', look: this.wardrobe.look }); }
  marks() { const out = []; for (const r of this.remotes.values()) if (r.seen && !r.hidden) { const p = r.car ? r.car.root.position : r.pos; out.push({ x: p.x, z: p.z, name: r.name }); } return out; }
  list() { return this.on ? [{ name: this.name, me: true, host: this.mode === 'host' }, ...[...this.remotes.values()].map((r) => ({ name: r.name, host: r.id === 'host' }))] : []; }

  update(dt) {
    if (!this.on) return;
    const now = performance.now() / 1000, P = this.player, chr = P.chr;
    for (const r of this.remotes.values()) r.update(dt, now, !P.inside || P.riding === this.seat);
    // 얻어 탄 차를 따라간다. 운전하던 친구가 내리거나 나가면 나도 내린다.
    if (P.riding === this.seat) { const r = this.seat.r; if (!r || !this.remotes.has(r.id) || !r.car) this.getOff(); else { const p = r.car.root.position; this.seat.seat.set(p.x, p.y + 0.3, p.z); } }
    // 소식이 끊긴 사람 정리: 방장은 그 사람을 내보내고, 손님은 방장이 조용하면 방이 닫힌 것으로 본다.
    if (this.mode === 'host') { for (const r of [...this.remotes.values()]) if (now - r.heard > 15) this.drop(r.id, true); }
    else if (now - this.hostHeard > 15) { this.leave(true); this.status = '방장과 연결이 끊겼어요'; this.say('방장과 연결이 끊겼어요'); this.changed(); return; }
    // 내 모습 보내기
    if (chr.swing > this.swingWas) this.swingN = (this.swingN + 1) % 1000;
    this.swingWas = chr.swing;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / SEND_HZ;
      const f = P.feet, car = P.vehicle, hidden = !!P.riding;
      // 내가 모는 차를 남이 붙잡고 있었다면(동시에 탄 경우) 내 쪽이 이긴다.
      if (car && car.netHeld) { car.netHeld = null; car.body.setMotionType(B.PhysicsMotionType.DYNAMIC); }
      const m = { t: 's', p: [r2(f.x), r2(f.y), r2(f.z)], h: r3(chr.heading), v: [r2(P.vel.x), r2(P.vel.y), r2(P.vel.z)], g: P.grounded || P.airT < 0.1 ? 1 : 0,
        f: (P.inside ? 1 : 0) | (chr.wave > 0.5 ? 2 : 0) | (chr.aim > 0.5 ? 8 : 0) | (hidden ? 16 : 0), n: this.swingN };
      if (car) { const q = car.root.rotationQuaternion, p = car.root.position; m.c = [car.key, r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), car.isBoat ? 1 : 0, car.netIndex === undefined ? -1 : car.netIndex]; }
      if (this.mode === 'host') { m.i = 'host'; this.link.all(m); } else this.link.sendTo('host', m);
    }
    if (this.mode === 'host') { this.worldT -= dt; if (this.worldT <= 0) { this.worldT = 1; this.link.all({ t: 'w', w: this.world() }); } }
  }
}
