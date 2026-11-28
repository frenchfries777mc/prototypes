// PvP: 같은 방 친구끼리 겨루기.
// - 개인 PvP 스위치(P 키 또는 ⚔ 버튼): 둘 다 켜져 있을 때만 서로 다친다. 끄려면 전투가 끝나고 8초가 지나야 한다.
// - 쓰러뜨리면 현상금(연속 처치 보너스, 같은 사람 반복은 40초 쿨타임, 하루 한도), 쓰러지면 병원에서 깨어나고 3초 동안 보호받는다.
// - 투기장: 판매장 동쪽의 벽으로 둘러싼 경기장. 방 안 누구나 경기를 열 수 있고, 5분 안에 먼저 10킬을 하면 이긴다.
//   경기장 안에서는 PvP가 강제로 켜지고, 들어갈 때 권총을 받으며, 곳곳의 무기 상자로 무기를 바꿀 수 있다. 나오면 원래대로 돌아간다.
import { SITES } from './world.js';
import { Panel } from './panel.js';
import { stats } from './stats.js';
import { WEAPONS } from './weapons.js';
import { flatMat } from './util.js';
const B = window.BABYLON;
const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const KEY = 'boxtown.pvp';
const DAILY_CAP = 1800; // 하루에 PvP로 받을 수 있는 상금 한도
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.date === today() ? d : { date: today(), got: 0 }; } catch (e) { return { date: today(), got: 0 }; } };
const DMG = 0.8, DMG_CAP = 85; // 친구 사이 피해 비율과 한 번에 받는 최대 피해(저격 한 방에 쓰러지지 않게)
const MATCH = { time: 300, target: 10 };
const CRATES = [[-6, 0, 'rifle'], [6, 0, 'shotgun'], [0, 8, 'sniper'], [0, -8, 'smg']];
const SPAWNS = [[-18, -17], [18, -17], [-18, 18], [18, 18]];
const COVER = [[-10, 6, 4, 1.6, 2], [10, -6, 4, 1.6, 2], [0, 0, 3, 2.4, 3], [-12, -10, 2, 1.4, 6], [12, 10, 2, 1.4, 6], [0, 14, 6, 1.2, 1.6], [0, -14, 6, 1.2, 1.6], [-16, 16, 3, 2, 3], [16, -16, 3, 2, 3]];
const HALF = 24;

export class Pvp {
  constructor({ scene, player, jobs, health, weapons, net, interiors, groundY, lazyCollider }) {
    Object.assign(this, { scene, player, jobs, health, weapons, net, interiors, groundY });
    this.on = false; this.shield = 0; this.combatT = 0; this.lastHit = null; this.streak = 0; this.cool = new Map(); this.lobby = null;
    this.down = 0; this.match = null; this.joined = false; this.saved = null; this.day = load();
    const S = SITES.arena; this.S = S;
    // 터가 완전히 평평하지는 않아서, 경기장 바닥은 발자국 안에서 가장 높은 땅에 맞추고 아래는 기초로 받친다.
    let lo = 1e9, hi = -1e9;
    for (let x = -HALF - 2; x <= HALF + 2; x += 3) for (let z = -HALF - 2; z <= HALF + 2; z += 3) { const hh = groundY(S.x + x, S.z + z); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
    const y = hi; this.y = y;
    const col = lazyCollider();
    const put = (w, h, d, x, yy, z, hex, solid, o) => {
      const m = B.MeshBuilder.CreateBox('arena', { width: w, height: h, depth: d }, scene); m.position.set(S.x + x, y + yy, S.z + z);
      m.material = flatMat('are_' + hex + (o ? 'e' : ''), hex, scene, o); m.isPickable = false; m.freezeWorldMatrix();
      if (solid) col.add(S.x + x, y + yy, S.z + z, w, h, d);
      return m;
    };
    put(2 * HALF + 2, 0.3, 2 * HALF + 2, 0, -0.13, 0, '#9aa3b8', true); // 바닥
    const F = hi - lo + 0.9; put(2 * HALF + 1.6, F, 2 * HALF + 1.6, 0, -0.15 - F / 2, 0, '#7d869c', true); // 기초
    // 입구 앞 계단: 바깥 땅에서 바닥까지 0.22m씩
    const gy = groundY(S.x, S.z - HALF - 4), rise = hi - gy;
    if (rise > 0.18) { const n = Math.ceil(rise / 0.22); for (let k = 0; k < n; k++) { const top = gy + ((k + 1) * rise) / n; put(8, 1, 1.2, 0, top - y - 0.5, -HALF - 0.6 - (n - 1 - k) * 1.2, '#b9bfd0', true); } }
    const WH = 3.4, T = 0.8;
    put(2 * HALF + T, WH, T, 0, WH / 2, HALF, '#4a5578', true); put(T, WH, 2 * HALF, HALF, WH / 2, 0, '#4a5578', true); put(T, WH, 2 * HALF, -HALF, WH / 2, 0, '#4a5578', true);
    put(HALF - 4, WH, T, -(HALF + 4) / 2 - 0.0 + 0, WH / 2, -HALF, '#4a5578', true); put(HALF - 4, WH, T, (HALF + 4) / 2, WH / 2, -HALF, '#4a5578', true); // 남쪽 벽은 가운데 8m가 입구
    put(8, 0.8, T, 0, WH - 0.4, -HALF, '#e5553f', false); // 입구 위 가로대
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(1.6, WH + 1, 1.6, sx * HALF, (WH + 1) / 2, sz * HALF, '#2f3a5c', true); // 귀퉁이 탑
    put(WH * 0 + 2 * HALF + T, 0.3, T + 0.2, 0, WH + 0.05, HALF, '#e5553f', false); // 북쪽 벽 윗띠
    COVER.forEach(([x, z, w, h, d], i) => put(w, h, d, x, h / 2, z, ['#7b86a6', '#6a7596', '#8590b0'][i % 3], true));
    SPAWNS.forEach(([x, z]) => put(2.2, 0.05, 2.2, x, 0.04, z, '#57c27a', false, { emissive: '#1f6b3a' }));
    // 무기 상자
    this.crates = CRATES.map(([x, z, id]) => {
      const w = WEAPONS.find((q) => q.id === id), hex = { rifle: '#2f6fd0', shotgun: '#e5883a', sniper: '#35b7a8', smg: '#9b5de5' }[id];
      const m = put(0.9, 0.7, 0.9, x, 0.55, z, hex, false, { emissive: hex });
      const tex = new B.DynamicTexture('crate_' + id, { width: 256, height: 64 }, scene, true), c = tex.getContext();
      c.fillStyle = 'rgba(22,34,58,.85)'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#fff'; c.font = '800 38px "Noto Sans KR","Malgun Gothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(w.name, 128, 34); tex.update();
      const mat = new B.StandardMaterial('crateLbl_' + id, scene); mat.diffuseTexture = tex; mat.emissiveTexture = tex; mat.disableLighting = true; mat.backFaceCulling = false;
      const lbl = B.MeshBuilder.CreatePlane('crateLbl', { width: 1.8, height: 0.45 }, scene); lbl.material = mat; lbl.billboardMode = B.Mesh.BILLBOARDMODE_ALL; lbl.position.set(S.x + x, y + 1.6, S.z + z); lbl.isPickable = false;
      return { x: S.x + x, z: S.z + z, id, m, lbl, cd: 0 };
    });
    // 간판과 입구 표시
    const tex = new B.DynamicTexture('arenaSign', { width: 1024, height: 160 }, scene, true), c = tex.getContext();
    c.fillStyle = '#c62f2a'; c.fillRect(0, 0, 1024, 160); c.fillStyle = '#fff'; c.font = '900 96px "Noto Sans KR","Malgun Gothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚔ 박스 투기장', 512, 86); tex.update();
    const sm = new B.StandardMaterial('arenaSignM', scene); sm.diffuseTexture = tex; sm.emissiveTexture = tex; sm.specularColor = B.Color3.Black(); sm.backFaceCulling = false;
    const sign = B.MeshBuilder.CreatePlane('arenaSign', { width: 8.4, height: 1.3 }, scene); sign.position.set(S.x, y + WH + 0.9, S.z - HALF - 0.5); sign.rotation.y = 0; sign.material = sm; sign.isPickable = false;
    put(5, 0.06, 3, 0, groundY(S.x, S.z - HALF - 5.6) - y + 0.03, -HALF - 5.6, '#ffd84a', false, { emissive: '#7a5a00' }); // 입구 앞 표시
    col.done();
    this.gate = { x: S.x, z: S.z - HALF - 5.6 };
    // 화면
    const mk = (id) => { const e = document.createElement('div'); e.id = id; e.hidden = true; document.body.appendChild(e); return e; };
    this.feed = mk('pvpFeed'); this.hud = mk('arenaHud'); this.downEl = mk('pvpDown'); this.btn = $('btnPvp');
    if (this.btn) this.btn.addEventListener('click', () => this.toggle());
    addEventListener('keydown', (e) => { if (e.code === 'KeyP' && !e.repeat && !e.target.closest('input,textarea')) this.toggle(); });
    this.feedL = []; this.paintBtn();
  }

  // ----- 내 정보 -----
  myId() { const n = this.net; return n.mode === 'host' ? 'host' : n.id; }
  nameOf(id) { if (id === this.myId()) return this.net.name || '나'; const r = this.net.remotes.get(id); return r ? r.name : '친구'; }
  sendG(k, data = {}) { const n = this.net; if (!n || !n.on) return; const m = { t: 'g', k, ...data }; if (n.mode === 'host') m.i = 'host'; n.send(m); }
  shielded() { return this.shield > 0; }
  paintBtn() {
    if (!this.btn) return;
    const show = this.net.on; this.btn.hidden = !show;
    this.btn.classList.toggle('on', this.on); this.btn.textContent = this.shield > 0 ? '🛡' : '⚔';
    this.btn.title = this.on ? 'PvP 켜짐 (P)' : 'PvP 꺼짐 (P)';
  }
  setOn(v, quiet) {
    this.on = v; this.net.pvpOn = v; this.paintBtn();
    if (!quiet) this.jobs.notice(v ? '⚔ PvP를 켰어요. 켜 둔 사람끼리만 서로 다쳐요' : '🕊 PvP를 껐어요', v ? 'alert' : '');
  }
  toggle() {
    if (!this.net.on) { this.jobs.notice('PvP는 같은 방 친구가 있어야 해요 (로비 → 같이 하기)'); return; }
    if (this.joined) { this.jobs.notice('경기 중에는 PvP를 끌 수 없어요. 경기장 밖으로 나가세요'); return; }
    if (this.on && this.combatT > 0) { this.jobs.notice(`전투 중에는 끌 수 없어요 (${Math.ceil(this.combatT)}초)`, 'alert'); return; }
    this.setOn(!this.on);
  }

  // ----- 피해와 처치 -----
  // net.gotHit가 부른다: 조건을 통과한 PvP 피해만 온다.
  hurtBy(id, d, dx, dz) {
    if (this.shield > 0 || this.down > 0) return;
    this.lastHit = { id, t: performance.now() / 1000 }; this.combatT = 8;
    this.health.hurt(Math.min(DMG_CAP, d * DMG), dx, dz, 'pvp', 3);
  }
  // Health.die('pvp')가 부른다.
  died() {
    const P = this.player, now = performance.now() / 1000;
    const by = this.lastHit && now - this.lastHit.t < 10 ? this.lastHit.id : null;
    this.lastHit = null; this.streak = 0; this.combatT = 0;
    stats.bump('pvpDeaths');
    this.sendG('kl', { by, ar: this.joined ? 1 : 0 });
    this.onKill(this.myId(), by, this.joined);
    // 잠깐 쓰러져 있다가 일어난다.
    this.down = 2.6; P.input.blocked = true; this.health.hp = 100;
    this.downEl.hidden = false; this.downEl.innerHTML = `<b>💀 ${by ? this.nameOf(by) + ' 님에게 ' : ''}쓰러졌어요</b><span>잠시 뒤 다시 일어나요</span>`;
    if (this.player.vehicle) P.exit();
  }
  respawn() {
    const P = this.player; this.downEl.hidden = true; P.input.blocked = !!(this.lobby && this.lobby.open);
    this.health.hp = 100; this.shield = 3.2;
    if (this.joined) { const s = this.pickSpawn(); P.teleport(s.x, s.y + 0.4, s.z); this.loadout(); }
    else { this.interiors.send('hospital', -2.6, 1.2); }
    this.paintBtn();
  }
  // 처치 소식(모두에게 간다). 내가 처치했으면 현상금.
  onKill(victim, by, inArena) {
    const mine = this.myId();
    this.pushFeed(by ? `${this.nameOf(by)} ⚔ ${this.nameOf(victim)}` : `${this.nameOf(victim)} 쓰러짐`, by === mine || victim === mine);
    if (this.match && inArena) {
      const sc = this.match.scores, ent = (id) => sc.get(id) || (sc.set(id, { k: 0, d: 0 }), sc.get(id));
      ent(victim).d++; if (by) ent(by).k++;
      this.paintHud();
      if (by && sc.get(by).k >= this.match.target) this.endMatch();
    }
    if (by === mine && victim !== mine) {
      stats.bump('pvpKills'); this.streak++;
      if (!inArena) {
        const now = performance.now() / 1000, last = this.cool.get(victim) || -99;
        if (now - last > 40) {
          this.cool.set(victim, now);
          const pay = 120 + Math.min(4, this.streak - 1) * 40, got = this.reward(pay);
          this.jobs.notice(`⚔ ${this.nameOf(victim)} 처치! +${won(got)}원${this.streak > 1 ? ` (${this.streak}연속)` : ''}`, 'good');
        } else this.jobs.notice(`⚔ ${this.nameOf(victim)} 처치 (같은 사람은 잠시 뒤에 현상금이 나와요)`);
      } else this.jobs.notice(`⚔ ${this.nameOf(victim)} 처치!${this.streak > 1 ? ` ${this.streak}연속` : ''}`, 'good');
    }
  }
  reward(n) {
    this.day = load(); const give = Math.max(0, Math.min(n, DAILY_CAP - this.day.got));
    if (give > 0) {
      this.day.got += give; try { localStorage.setItem(KEY, JSON.stringify(this.day)); } catch (e) { /* 무시 */ }
      this.jobs.money += give; try { localStorage.setItem('boxtown.money', String(this.jobs.money)); } catch (e) { /* 무시 */ }
      this.jobs.renderMoney();
    }
    return give;
  }
  pushFeed(text, mine) {
    this.feedL.push({ text, mine, t: 7 }); if (this.feedL.length > 5) this.feedL.shift(); this.paintFeed();
  }
  paintFeed() {
    this.feed.hidden = !this.feedL.length;
    this.feed.innerHTML = this.feedL.map((f) => `<div class="${f.mine ? 'me' : ''}">${f.text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</div>`).join('');
  }

  // ================= 투기장 =================
  inArena() { const p = this.player.feet, S = this.S; return Math.abs(p.x - S.x) < HALF - 0.6 && Math.abs(p.z - S.z) < HALF - 0.6 && Math.abs(p.y - this.y) < 6; }
  nearGate() { const p = this.player.feet; return !this.player.vehicle && !this.player.inside && Math.hypot(p.x - this.gate.x, p.z - this.gate.z) < 4.2 && Math.abs(p.y - this.y) < 3; }
  prompt() { return this.nearGate() && !Panel.open ? (this.match ? '투기장 경기 중 (안으로 들어가세요)' : '투기장 경기 열기') : ''; }
  use() {
    if (!this.nearGate()) return false;
    if (Panel.open) { Panel.close(); return true; }
    if (this.match) return true;
    Panel.show({
      title: '⚔ 박스 투기장', note: () => (this.net.on ? '방 친구들에게 경기를 알려요. 벽 안으로 들어오면 참가돼요' : '같은 방 친구가 있어야 열 수 있어요 (로비 → 같이 하기)'),
      items: () => [{ id: 'start', label: '⚔ 경기 열기', sub: `${MATCH.time / 60}분 · 먼저 ${MATCH.target}킬`, state: this.net.on ? 'buy' : 'lock' }],
      pick: (id) => { if (id === 'start' && this.net.on) { Panel.close(); this.sendG('ast', { time: MATCH.time, tgt: MATCH.target }); this.startMatch(MATCH.time, MATCH.target, this.myId()); } },
    });
    return true;
  }
  startMatch(time, target, by) {
    if (this.match) return;
    this.match = { left: time, target, scores: new Map(), owner: by };
    this.jobs.notice(`⚔ ${this.nameOf(by)} 님이 투기장 경기를 열었어요! 벽 안으로 들어가 참가하세요`, 'alert');
    this.paintHud();
  }
  pickSpawn() {
    const S = this.S, others = [...this.net.remotes.values()].filter((r) => r.seen && !r.hidden).map((r) => r.pos);
    let best = SPAWNS[0], bd = -1;
    for (const [x, z] of SPAWNS) { const d = others.length ? Math.min(...others.map((o) => Math.hypot(o.x - (S.x + x), o.z - (S.z + z)))) : Math.random() * 10; if (d > bd) { bd = d; best = [x, z]; } }
    return { x: S.x + best[0], z: S.z + best[1], y: this.y };
  }
  loadout(id = 'pistol') { // 경기용 무기: 저장하지 않는 임시 무기
    const W = this.weapons; W.owned = new Set(['fist', id]); W.renderBar(); W.select(WEAPONS.findIndex((w) => w.id === id));
  }
  join() {
    this.joined = true; this.saved = { pvp: this.on, owned: new Set(this.weapons.owned) };
    this.setOn(true, true); this.shield = 3.2; this.loadout();
    this.jobs.notice('⚔ 경기 참가! 무기 상자로 무기를 바꿀 수 있어요', 'alert');
    this.paintHud(); this.paintBtn();
  }
  leave() {
    if (!this.joined) return;
    this.joined = false;
    const s = this.saved; this.saved = null;
    if (s) { this.weapons.owned = s.owned; this.weapons.renderBar(); this.weapons.select(0); this.setOn(s.pvp, true); }
    this.paintHud(); this.paintBtn();
  }
  endMatch() {
    const m = this.match; if (!m) return;
    this.match = null;
    const rows = [...m.scores.entries()].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.k - a.k || a.d - b.d);
    const me = this.myId(), mine = rows.findIndex((r) => r.id === me), was = this.joined;
    this.leave();
    if (!was || !rows.length) { this.hud.hidden = true; return; }
    const pay = mine === 0 ? 700 : mine === 1 ? 400 : mine === 2 ? 250 : rows[mine] && rows[mine].k > 0 ? 100 : 0;
    const got = this.reward(pay + Math.min(10, (rows[mine] || { k: 0 }).k) * 20);
    stats.bump('arenas'); if (mine === 0) stats.bump('arenaWins');
    this.jobs.notice(mine === 0 ? `🏆 투기장 우승! 상금 +${won(got)}원` : `⚔ 투기장 경기 끝 · ${mine + 1}등 · 상금 +${won(got)}원`, mine === 0 ? 'good' : '');
    const big = document.getElementById('raceBig');
    if (big) {
      big.hidden = false; big.className = 'done';
      big.innerHTML = `<b>🏆 투기장 결과</b>` + rows.slice(0, 5).map((r, i) => `<span>${i + 1}등 ${this.nameOf(r.id)} ${r.k}킬 ${r.d}데스</span>`).join('');
      clearTimeout(this.bigT); this.bigT = setTimeout(() => { big.hidden = true; }, 7000);
    }
    this.hud.hidden = true;
  }
  paintHud() {
    const m = this.match; if (!m) { this.hud.hidden = true; return; }
    const sec = Math.max(0, Math.ceil(m.left)), rows = [...m.scores.entries()].sort((a, b) => b[1].k - a[1].k || a[1].d - b[1].d).slice(0, 4), me = this.myId();
    this.hud.hidden = false;
    this.hud.innerHTML = `<b>⚔ 투기장 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</b><small>먼저 ${m.target}킬${this.joined ? '' : ' · 안으로 들어가 참가'}</small>` +
      rows.map(([id, s]) => `<div class="${id === me ? 'me' : ''}"><span>${this.nameOf(id).replace(/[&<>"]/g, '')}</span><em>${s.k}킬 ${s.d}데스</em></div>`).join('');
  }
  marks() { return this.match ? [{ x: this.S.x, z: this.S.z, color: '#e5322d', name: '투기장 경기' }] : [{ x: this.gate.x, z: this.gate.z, color: '#c62f2a', name: '투기장' }]; }

  onNet(m) {
    if (m.k === 'kl') {
      const from = m.i, by = typeof m.by === 'string' ? m.by : null;
      this.onKill(from, by, !!m.ar);
    } else if (m.k === 'ast') {
      const time = Math.max(30, Math.min(900, +m.time || MATCH.time)), tgt = Math.max(3, Math.min(30, +m.tgt || MATCH.target));
      this.startMatch(time, tgt, m.i);
    }
  }

  update(dt) {
    const P = this.player;
    if (!this.net.on) { // 방이 없어지면 PvP도 끝난다
      if (this.on || this.match) { this.on = false; this.net.pvpOn = false; if (this.joined) this.leave(); this.match = null; this.hud.hidden = true; }
      this.paintBtn(); return;
    }
    if (this.btn && this.btn.hidden) this.paintBtn();
    if (this.combatT > 0) this.combatT -= dt;
    if (this.shield > 0) { this.shield -= dt; if (this.shield <= 0) this.paintBtn(); }
    if (this.down > 0) { this.down -= dt; if (this.down <= 0) this.respawn(); }
    for (const f of this.feedL) f.t -= dt;
    if (this.feedL.length && this.feedL[0].t <= 0) { this.feedL.shift(); this.paintFeed(); }
    if (this.lobby && this.lobby.open) return;
    // 경기 진행
    const m = this.match;
    if (m) {
      m.left -= dt;
      const inside = this.inArena() && !P.vehicle && !P.inside && this.down <= 0;
      if (inside && !this.joined) this.join();
      else if (!inside && this.joined && this.down <= 0 && !this.inArena()) { this.leave(); this.jobs.notice('경기장 밖으로 나왔어요'); }
      this.hudT = (this.hudT || 0) - dt; if (this.hudT <= 0) { this.hudT = 0.5; this.paintHud(); }
      if (m.left <= 0) this.endMatch();
      // 무기 상자
      if (this.joined && this.down <= 0) {
        const f = P.feet;
        for (const c of this.crates) { if (c.cd > 0) continue; if (Math.hypot(f.x - c.x, f.z - c.z) < 1.5 && Math.abs(f.y - this.y) < 2.5) { this.loadout(c.id); c.cd = 12; this.jobs.notice(`🔫 ${WEAPONS.find((w) => w.id === c.id).name}을(를) 집었어요`); } }
      }
    }
    for (const c of this.crates) { if (c.cd > 0) { c.cd -= dt; c.m.setEnabled(c.cd <= 0); c.lbl.setEnabled(c.cd <= 0); } c.m.rotation.y += dt; }
  }
}
