// 온라인: PeerJS(WebRTC) 자동 매칭. 방 만들기·방장 같은 개념은 화면에 없다.
//  - 출격하면 공용 방 번호(1..N)를 차례로 확인해서, 비어 있으면 그 자리를 잡고 판을 돌리고, 이미 있으면 거기에 들어간다.
//  - 판을 돌리던 사람이 나가면 남은 사람 중 먼저 자리를 잡는 사람이 이어받는다(상태는 모두가 갖고 있다).
//  - 모두 같은 방식으로 들어오고 나가며, 중간 참가·이탈이 자유롭다.
const ROOMS = 4;            // 공용 방 수
export const MAX_HUMANS = 16;
const PREFIX = 'ironline-ff-r';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

export class Net {
  constructor(opts = {}) {
    this.opts = opts;               // { host, port, secure, path } 비우면 PeerJS 기본 서버
    this.role = 'solo';             // solo | hub | client | connecting
    this.peer = null; this.room = 0; this.myPid = '';
    this.remotes = new Map();       // (판을 도는 쪽) pid → { r, u, unit, last }
    this.hubR = null; this.hubU = null; this.lastSnap = 0;
    this.cb = {};
    this.humans = 1; this.status = '';
  }
  popts() {
    const o = { debug: 0, config: { iceServers: ICE } };
    const h = this.opts;
    if (h.host) { o.host = h.host; o.port = h.port || 443; o.secure = h.secure !== false; o.path = h.path || '/'; }
    return o;
  }
  openPeer(id) {
    return new Promise((res, rej) => {
      let done = false;
      let p;
      try { p = new window.Peer(id, this.popts()); } catch (e) { rej({ type: 'init' }); return; }
      const fail = (e) => { if (done) return; done = true; try { p.destroy(); } catch (x) { /* */ } rej(e); };
      p.on('open', () => { if (done) return; done = true; res(p); });
      p.on('error', (e) => { if (!done) fail(e); else this.peerError(e); });
      setTimeout(() => fail({ type: 'timeout' }), 6000);
    });
  }
  peerError(e) { if (e && e.type === 'network') this.status = '시그널 서버 연결 불안정'; }

  // ---- 접속: 비어 있는 방을 찾으면 판을 돌리고, 열려 있는 방이 있으면 들어간다 ----
  async connect(want = -1, name = '병사', loadout = 0) {
    this.role = 'connecting'; this.status = '접속 중…';
    let lastErr = null;
    for (let round = 0; round < 3; round++) {
      for (let room = 1; room <= ROOMS; room++) {
        const hid = PREFIX + room;
        try {
          const p = await this.openPeer(hid);
          this.becomeHub(p, room);
          return 'hub';
        } catch (e) {
          lastErr = e;
          if (!e || e.type !== 'unavailable-id') { if (e && (e.type === 'timeout' || e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed' || e.type === 'init')) throw e; continue; }
          const r = await this.tryClient(hid, want, name, loadout);
          if (r === 'ok') { this.room = room; return 'client'; }
          if (r === 'gone') room--;   // 방금까지 있던 방이 사라짐: 같은 번호를 다시 시도
          if (r === 'gone' && round > 1) break;
        }
      }
    }
    throw lastErr || { type: 'no-room' };
  }

  becomeHub(p, room) {
    this.peer = p; this.room = room; this.role = 'hub'; this.myPid = p.id; this.status = '온라인';
    p.on('connection', (c) => this.hubWire(c));
    p.on('disconnected', () => { try { p.reconnect(); } catch (e) { /* */ } });
    p.on('error', (e) => this.peerError(e));
    this.cb.role && this.cb.role('hub');
  }

  hubWire(c) {
    const pid = c.peer;
    let rec = this.remotes.get(pid);
    if (!rec) { rec = { r: null, u: null, unit: -1, last: performance.now(), name: '' }; this.remotes.set(pid, rec); }
    rec[c.label === 'r' ? 'r' : 'u'] = c;
    c.on('data', (m) => this.hubData(pid, rec, m));
    c.on('close', () => { if (c.label === 'r') this.hubDrop(pid); });
    c.on('error', () => { /* 끊김은 close 에서 처리 */ });
  }
  hubData(pid, rec, m) {
    rec.last = performance.now();
    if (!m || !m.t) return;
    if (m.t === 'hi') {
      if (this.remotes.size > MAX_HUMANS) { rec.r && rec.r.send({ t: 'wel', full: 1 }); return; }
      const reply = this.cb.hello(pid, m);
      if (!reply) { rec.r && rec.r.send({ t: 'wel', full: 1 }); return; }
      rec.unit = reply.id; rec.name = m.name || '';
      this.humans = this.remotes.size + 1;
      rec.r && rec.r.send(Object.assign({ t: 'wel' }, reply));
    } else if (m.t === 'in') { if (rec.unit >= 0) this.cb.input(rec.unit, m); }
    else if (m.t === 'bye') this.hubDrop(pid);
  }
  hubDrop(pid) {
    const rec = this.remotes.get(pid); if (!rec) return;
    this.remotes.delete(pid);
    try { rec.r && rec.r.close(); rec.u && rec.u.close(); } catch (e) { /* */ }
    this.humans = this.remotes.size + 1;
    if (rec.unit >= 0) this.cb.leave(rec.unit);
  }
  hubTick() {   // 오래 소식 없는 연결 정리
    const now = performance.now();
    for (const [pid, rec] of this.remotes) if (now - rec.last > 7000) this.hubDrop(pid);
  }
  bcast(ch, msg) {
    for (const rec of this.remotes.values()) { const c = ch === 'r' ? rec.r : rec.u; if (c && c.open) { try { c.send(msg); } catch (e) { /* */ } } }
  }

  // ---- 들어가는 쪽 ----
  async tryClient(hid, want, name, loadout) {
    let p;
    try { p = await this.openPeer(undefined); } catch (e) { throw e; }
    const kill = () => { try { p.destroy(); } catch (e) { /* */ } };
    let gone = false;
    p.on('error', (e) => { if (e && e.type === 'peer-unavailable') gone = true; });
    const r = p.connect(hid, { label: 'r', reliable: true, serialization: 'json' });
    const u = p.connect(hid, { label: 'u', reliable: false, serialization: 'json' });
    const open = (c) => new Promise((res) => { if (c.open) res(true); else { c.on('open', () => res(true)); setTimeout(() => res(false), 6000); } });
    const ok = (await Promise.all([open(r), open(u)])).every(Boolean);
    if (!ok || gone) { kill(); return 'gone'; }
    const wel = await new Promise((res) => {
      const t = setTimeout(() => res(null), 7000);
      r.on('data', (m) => { if (m && m.t === 'wel') { clearTimeout(t); res(m); } });
      r.send({ t: 'hi', name, want, w: loadout });
    });
    if (!wel) { kill(); return 'gone'; }
    if (wel.full) { kill(); return 'full'; }
    this.peer = p; this.hubR = r; this.hubU = u; this.role = 'client'; this.status = '온라인'; this.lastSnap = performance.now();
    const onMsg = (m) => this.clientData(m);
    r.on('data', onMsg); u.on('data', onMsg);
    r.on('close', () => this.lost());
    this.cb.welcome && this.cb.welcome(wel);
    return 'ok';
  }
  clientData(m) {
    if (!m || !m.t) return;
    if (m.t === 's') { this.lastSnap = performance.now(); this.cb.snap(m); }
    else if (m.t === 'e') this.cb.events(m.ev);
    else if (m.t === 'sc') this.cb.score(m);
    else if (m.t === 'wel') { /* 재전송 무시 */ }
  }
  sendInput(msg) { if (this.role === 'client' && this.hubU && this.hubU.open) { try { this.hubU.send(msg); } catch (e) { /* */ } } }
  sendR(msg) { if (this.role === 'client' && this.hubR && this.hubR.open) { try { this.hubR.send(msg); } catch (e) { /* */ } } }
  // 판을 돌리던 쪽이 사라짐: 잠깐 기다렸다가 다시 접속 시도(먼저 자리를 잡는 사람이 이어받는다)
  lost() {
    if (this.role !== 'client') return;
    this.role = 'connecting'; this.status = '다시 연결 중…';
    try { this.peer && this.peer.destroy(); } catch (e) { /* */ }
    this.peer = this.hubR = this.hubU = null;
    this.cb.lost && this.cb.lost();
  }
  watch() { if (this.role === 'client' && performance.now() - this.lastSnap > 5000) this.lost(); }
  close() {
    try { if (this.role === 'client') this.sendR({ t: 'bye' }); } catch (e) { /* */ }
    try { this.peer && this.peer.destroy(); } catch (e) { /* */ }
    this.peer = null; this.remotes.clear(); this.role = 'solo';
  }
}

// ---- 스냅샷 직렬화 ----
export function makeSnap(sim, n, humans) {
  return {
    t: 's', n, tm: r2(sim.time), tk: sim.tickets, w: sim.winner, hc: humans,
    p: sim.pts.map((p) => [p.owner, r3(p.cap), p.nA, p.nB]),
    u: sim.units.map((u) => [r2(u.x), r2(u.y), r2(u.z), r3(u.yaw), r3(u.pitch), Math.round(u.hp), u.alive ? 1 : 0, u.weapon, u.ammo, Math.round(u.speedNow * 10) / 10, r2(u.walkDist), u.isBot ? 0 : 1, u.spawnN, Math.round(u.reloadT * 10) / 10]),
  };
}
export function makeScore(sim) {
  const names = {};
  for (const u of sim.units) if (!u.isBot) names[u.id] = u.label;
  return { t: 'sc', k: sim.units.map((u) => u.kills), d: sim.units.map((u) => u.deaths), names };
}
// 받은 스냅샷을 로컬 sim 에 덮어쓴다. meId 유닛의 위치는 건드리지 않는다(내가 직접 계산). 반환: 내 위치를 새로 받아들여야 하는지.
export function applySnap(sim, s, meId, force = false) {
  let adopt = false;
  sim.time = s.tm; sim.tickets[0] = s.tk[0]; sim.tickets[1] = s.tk[1]; sim.winner = s.w;
  for (let i = 0; i < s.p.length; i++) { const p = sim.pts[i], q = s.p[i]; p.owner = q[0]; p.cap = q[1]; p.nA = q[2]; p.nB = q[3]; }
  for (let i = 0; i < s.u.length; i++) {
    const u = sim.units[i], q = s.u[i];
    const was = u.alive, spawned = q[12] !== u.spawnN;
    if (i === meId) {
      if ((q[6] && (!was || spawned)) || force || (q[6] && Math.hypot(q[0] - u.x, q[2] - u.z) > 4)) { u.x = q[0]; u.y = q[1]; u.z = q[2]; u.yaw = q[3]; u.px = u.x; u.py = u.y; u.pz = u.z; u.pyaw = u.yaw; adopt = true; }
    } else {
      if (spawned || force || !was) { u.x = q[0]; u.y = q[1]; u.z = q[2]; u.yaw = q[3]; u.px = u.x; u.py = u.y; u.pz = u.z; u.pyaw = u.yaw; }
      else { u.px = u.x; u.py = u.y; u.pz = u.z; u.pyaw = u.yaw; u.x = q[0]; u.y = q[1]; u.z = q[2]; u.yaw = q[3]; }
      u.pitch = q[4];
    }
    if (was && !q[6]) u.deathAge = 0;
    u.hp = q[5]; u.alive = !!q[6]; u.isBot = !q[11];
    if (i !== meId) u.weapon = q[7];
    u.ammo = q[8]; u.speedNow = q[9]; u.walkDist = q[10]; u.spawnN = q[12]; u.reloadT = q[13];
  }
  return adopt;
}
