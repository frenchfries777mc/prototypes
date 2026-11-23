// HUD: DOM 요소 갱신과 미니맵. 게임 상태를 읽기만 하고 규칙에는 관여하지 않는다.
import { NPOINTS, HALF_X, HALF_Z, POINT_R } from './world.js';
import { WEAPONS, MATCH_TIME } from './sim.js';

const $ = (id) => document.getElementById(id);
const A = '#5a8cff', B = '#ffc83c', N = '#bdbdbd';
const hexSvg = (fill, stroke) => `<svg viewBox="0 0 52 56"><polygon points="26,2 49,15 49,41 26,54 3,41 3,15" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/></svg>`;
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'ta', 'tb', 'tab', 'tbb', 'timer', 'pts', 'feed', 'msg', 'cross', 'hitm', 'hpn', 'hpb', 'wn', 'am', 'mg', 'ammo', 'capbox', 'capwarn', 'captxt', 'capb', 'low', 'dmg', 'death', 'dcard', 'dspec', 'dring', 'score', 'mini', 'dbg']) this.el[id] = $(id);
    this.hx = [];
    for (let i = 0; i < NPOINTS; i++) { const d = document.createElement('div'); d.className = 'hx'; d.innerHTML = hexSvg('#444', '#999') + `<span class="num">${'ABCDE'[i]}</span><small></small>`; this.el.pts.appendChild(d); this.hx.push(d); }
    this.mm = this.el.mini.getContext('2d');
    this.msgT = 0; this.hitT = 0; this.dmgT = 0; this.last = {};
    this.mmBase = null;
  }
  show(on) { this.el.hud.classList.toggle('on', on); }
  set(id, key, html) { if (this.last[id + key] !== html) { this.last[id + key] = html; this.el[id].innerHTML = html; } }
  text(id, v) { if (this.last[id] !== v) { this.last[id] = v; this.el[id].textContent = v; } }

  message(t, ms = 2200) { this.el.msg.textContent = t; this.el.msg.classList.add('on'); this.msgT = ms / 1000; }
  hitMarker(head) { const h = this.el.hitm; h.classList.toggle('head', !!head); h.classList.add('on'); this.hitT = 0.12; }
  damage() { this.el.dmg.classList.add('on'); this.dmgT = 0.12; }
  feed(html, cls, me) { const d = document.createElement('div'); d.className = (cls || '') + (me ? ' me' : ''); d.innerHTML = html; this.el.feed.prepend(d); while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove(); setTimeout(() => d.remove(), 6000); }

  update(dt, sim, me, ctx) {
    if (this.msgT > 0 && (this.msgT -= dt) <= 0) this.el.msg.classList.remove('on');
    if (this.hitT > 0 && (this.hitT -= dt) <= 0) this.el.hitm.classList.remove('on');
    if (this.dmgT > 0 && (this.dmgT -= dt) <= 0) this.el.dmg.classList.remove('on');
    const e = this.el;
    this.text('ta', sim.tickets[0]); this.text('tb', sim.tickets[1]);
    e.tab.style.width = (sim.tickets[0] / 250 * 100) + '%'; e.tbb.style.width = (sim.tickets[1] / 250 * 100) + '%';
    this.text('timer', mmss(MATCH_TIME - sim.time));
    for (let i = 0; i < NPOINTS; i++) {
      const p = sim.pts[i], col = p.owner === 0 ? A : p.owner === 1 ? B : N, fillc = p.cap > 0 ? A : B;
      const k = p.owner === -1 ? Math.abs(p.cap) : 1;
      const svg = hexSvg(p.owner === -1 && k > 0.02 ? fillc + '88' : (p.owner >= 0 ? col + 'cc' : '#3a3a3a'), p.nA && p.nB ? '#fff' : col);
      const key = svg + (p.owner === -1 ? Math.round(k * 100) : 'x');
      if (this.last['hx' + i] === key) continue; this.last['hx' + i] = key;
      this.hx[i].innerHTML = svg + `<span class="num">${'ABCDE'[i]}</span><small>${p.owner === -1 && k > 0.02 ? Math.round(k * 100) + '%' : ''}</small>`;
    }
    if (!me.alive) { this.drawMini(sim, me, ctx); return; }
    const w = WEAPONS[me.weapon];
    this.text('hpn', Math.ceil(me.hp)); e.hpb.style.width = me.hp + '%'; e.hpb.style.background = me.hp > 55 ? 'var(--ok)' : me.hp > 28 ? '#e0b23a' : 'var(--bad)';
    e.low.style.opacity = me.hp < 30 ? '1' : '0';
    this.text('wn', w.name);
    this.text('am', me.reloadT > 0 ? '장전' : me.ammo); this.text('mg', '/ ' + w.mag);
    e.ammo.classList.toggle('low', me.ammo <= Math.ceil(w.mag * 0.25) && me.reloadT <= 0);
    // 점령 중인 거점 안내
    let inside = -1;
    for (let i = 0; i < NPOINTS; i++) { const p = sim.pts[i]; if ((me.x - p.x) ** 2 + (me.z - p.z) ** 2 < POINT_R * POINT_R) inside = i; }
    if (inside >= 0) {
      const p = sim.pts[inside], ok = sim.eligible(0, inside);
      e.capbox.style.display = 'block';
      this.text('captxt', `거점 ${'ABCDE'[inside]} · ${p.owner === 0 ? '아군 점령' : p.owner === 1 ? '적군 점령' : '중립'}  (아군 ${p.nA} · 적 ${p.nB})`);
      this.text('capwarn', ok ? '' : `거점 ${'ABCDE'[inside - 1]} 를 먼저 점령해야 합니다`);
      e.capb.style.width = ((p.cap + 1) / 2 * 100) + '%';
    } else e.capbox.style.display = 'none';
    this.drawMini(sim, me, ctx);
  }

  // 사망 화면: 한 번이라도 죽은 뒤에만 보인다
  death(sim, me, killer) {
    const d = this.el.death;
    const on = !me.alive && me.deaths > 0 && sim.winner < 0;
    d.classList.toggle('on', on);
    if (!on) return;
    const k = killer, w = WEAPONS[me.killW] || WEAPONS[0];
    this.set('dcard', 'h', `<div><small>처치한 적</small><b>${k ? k.label : '?'}</b></div><div style="text-align:right"><small>${w.name}</small><b class="num">${Math.round(me.killDist)}m</b></div>`);
    this.text('dspec', k ? `관전 중 · ${k.label}` : '');
    this.text('dring', Math.max(0, Math.ceil(me.respawnT)));
  }

  scoreboard(on, sim, me) {
    const s = this.el.score; s.classList.toggle('on', on);
    if (!on) return;
    const rows = (t) => sim.units.filter((u) => u.team === t).sort((a, b) => b.kills - a.kills).slice(0, 10).map((u) => `<tr class="${u === me ? 'me' : ''}"><td>${u.label}</td><td>${u.kills}</td><td>${u.deaths}</td></tr>`).join('');
    const html = `<div class="cols"><div class="a"><h3>아군 · 병력 ${sim.tickets[0]}</h3><table><tr><td></td><td>처치</td><td>사망</td></tr>${rows(0)}</table></div><div class="b"><h3>적군 · 병력 ${sim.tickets[1]}</h3><table><tr><td></td><td>처치</td><td>사망</td></tr>${rows(1)}</table></div></div>`;
    this.set('score', 'h', html);
  }

  drawMini(sim, me, ctx) {
    const c = this.mm, W = 480, H = 268, sx = W / (HALF_X * 2 + 40), sz = H / (HALF_Z * 2 + 20);
    const X = (x) => (x + HALF_X + 20) * sx, Z = (z) => (z + HALF_Z + 10) * sz;
    if (!this.mmBase) {
      const b = document.createElement('canvas'); b.width = W; b.height = H; const g = b.getContext('2d');
      g.fillStyle = '#26301f'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1a2014'; g.fillRect(X(-HALF_X), Z(-HALF_Z), HALF_X * 2 * sx, HALF_Z * 2 * sz);
      g.strokeStyle = '#7a6a4c'; g.lineWidth = 5; g.beginPath();
      for (let x = -HALF_X; x <= HALF_X; x += 8) { const y = Z(ctx.world.roadZ(x)); x === -HALF_X ? g.moveTo(X(x), y) : g.lineTo(X(x), y); } g.stroke();
      g.strokeStyle = '#4a3a28'; g.lineWidth = 2.5;
      for (const tx of ctx.trenchX) { g.beginPath(); for (let z = -HALF_Z; z <= HALF_Z; z += 6) { const x = ctx.world.trenchCenter(tx, z); z === -HALF_Z ? g.moveTo(X(x), Z(z)) : g.lineTo(X(x), Z(z)); } g.stroke(); }
      g.fillStyle = '#9a8a70'; for (const h of ctx.world.houses) g.fillRect(X(h.cx - h.hw), Z(h.cz - h.hd), h.hw * 2 * sx, h.hd * 2 * sz);
      this.mmBase = b;
    }
    c.drawImage(this.mmBase, 0, 0);
    for (let i = 0; i < NPOINTS; i++) {
      const p = sim.pts[i];
      c.beginPath(); c.arc(X(p.x), Z(p.z), POINT_R * sx, 0, 7);
      c.fillStyle = (p.owner === 0 ? A : p.owner === 1 ? B : N) + '44'; c.fill();
      c.lineWidth = 3; c.strokeStyle = p.owner === 0 ? A : p.owner === 1 ? B : N; c.stroke();
      c.fillStyle = '#fff'; c.font = '700 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ABCDE'[i], X(p.x), Z(p.z));
    }
    for (const u of sim.units) {
      if (!u.alive || u === me) continue;
      if (u.team !== 0 && Math.hypot(u.x - me.x, u.z - me.z) > 45) continue;
      c.fillStyle = u.team === 0 ? A : B; c.fillRect(X(u.x) - 3, Z(u.z) - 3, 6, 6);
    }
    if (me.alive) {
      c.save(); c.translate(X(me.x), Z(me.z)); c.rotate(-me.yaw);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill(); c.restore();
    }
  }
}
