'use strict';
/* 로드스타 — 시뮬레이션: 화면과 무관하게 돌아가는 게임 규칙 전체 */

var G = null;
var UID = 1;
var _seed = 1;
function rnd() { _seed = (_seed + 0x6D2B79F5) | 0; var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function val(v, rk) { return Array.isArray(v) ? v[Math.max(0, Math.min(v.length, rk) - 1)] : v; }
function ev(k, o) { if (G.events.length < 300) { o = o || {}; o.k = k; G.events.push(o); } }
function fx(o) { if (G.fx.length < 400) { o.t = 0; G.fx.push(o); } }
/* 연출 전용: 규칙에는 영향이 없으므로 rnd() 대신 Math.random() 을 쓴다 */
function part(x, y, vx, vy, life, size, color, o) {
  if (G.parts.length > 520) return;
  var p = { x: x, y: y, vx: vx, vy: vy, life: life, t: 0, size: size, color: color, g: 0, drag: 0.93, glow: false, dust: false };
  if (o) for (var k in o) p[k] = o[k];
  G.parts.push(p);
}
function sparks(x, y, n, speed, color, size, life, o) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * 6.2832, sp = speed * (0.3 + Math.random() * 0.7);
    part(x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.75, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color, o);
  }
}
function shake(m) { if (m > (G.shake || 0)) G.shake = m; }
function flash(col, a) { G.flash = { col: col, a: a }; }
function nearP(x, y, R) { return G.player && Math.hypot(G.player.x - x, G.player.y - y) < R; }
function ftext(u, txt, color, size) {
  if (G.texts.length < 80) G.texts.push({ x: u.x + (Math.random() - 0.5) * 50, y: u.y - u.r - 30, txt: txt, color: color, size: size || 26, t: 0 });
}

/* 성석 운반전: 점수 5점 또는 10분, 영웅은 처음부터 완성된 상태(레벨 7 능력치, 스킬 3·3·3·2랭크) */
var WIN_SCORE = 7, MATCH_TIME = 600, RESPAWN_T = 7, FIXED_LEVEL = 7, SKILL_RANKS = [3, 3, 3, 2];
var STONE_R = 75, ALTAR_R = 260, STONE_FREE_T = 12, STONE_WAIT_T = 10, CARRY_SLOW = 0.76, THROW_RANGE = 950, ULT_PASSIVE = 1.1, PACK_T = 20;
var FOUNT_R = 650;

function mkUnit(type, team, x, y, o) {
  var u = {
    id: UID++, type: type, team: team, x: x, y: y, px: x, py: y, vx: 0, vy: 0, r: 30,
    hp: 1, maxHp: 1, bAd: 0, bAs: 1, bMs: 0, bArmor: 0, range: 100,
    ad: 0, as: 1, ms: 0, armor: 0, ap: 0, ls: 0, dmgMul: 1, shield: 0, stealth: false,
    atkCd: 0, target: null, dead: false, buffs: [], vis: [false, false], face: team === 1 ? Math.PI : 0,
    sight: 1000, lastDmgT: -99, stunT: 0, rootT: 0, thinkT: rnd() * 0.3, flash: 0
  };
  for (var k in o) u[k] = o[k];
  u.hp = u.maxHp; u.ad = u.bAd; u.as = u.bAs; u.ms = u.bMs; u.armor = u.bArmor;
  if (team < 2) u.vis[team] = true;
  G.units.push(u);
  return u;
}

function spawnPos(team, slot) {
  var f = MAP.FOUNT[team], a = -Math.PI / 2 + slot * (Math.PI / 4);
  return { x: f.x + (team ? -1 : 1) * (60 + Math.cos(a) * 130), y: f.y + Math.sin(a) * 170 };
}

function recalc(h) {
  var d = h.def, b = d.base, g = d.grow, L = h.level - 1;
  var it = { hp: 0, mp: 0, ad: 0, ap: 0, armor: 0, as: 0, ms: 0, ls: 0, haste: 0, mpr: 0 };
  var oh = h.maxHp, om = h.maxMp;
  h.maxHp = b.hp + g.hp * L + it.hp;
  h.maxMp = b.mp + g.mp * L + it.mp;
  h.bAd = b.ad + g.ad * L + it.ad;
  h.bAp = (g.ap || 0) * L + it.ap;
  h.bArmor = b.armor + g.armor * L + it.armor;
  h.bAs = b.as * (1 + g.as * L + it.as);
  h.bMs = b.ms + it.ms;
  h.range = b.range;
  h.hpr = b.hpr + L * 0.6;
  h.mpr = (b.mpr + L * 0.4) * (1 + it.mpr);
  h.bLs = it.ls; h.haste = it.haste;
  if (oh > 1) { h.hp += h.maxHp - oh; h.mp += h.maxMp - om; }
}

function mkHero(defId, team, isPlayer, slot, role) {
  var d = HEROES[defId], sp = spawnPos(team, slot);
  var h = mkUnit('hero', team, sp.x, sp.y, {
    r: 42, def: d, defId: defId, name: d.name, isPlayer: isPlayer, slot: slot, role: role, ranged: !d.melee,
    level: FIXED_LEVEL, items: [], ranks: SKILL_RANKS.slice(), cds: [0, 0, 0, 0], points: 0, ult: 0, carry: false, scores: 0, healed: 0,
    mp: 0, maxMp: 0, kills: 0, deaths: 0, assists: 0, dmgDealt: 0,
    respawnT: 0, order: null, path: null, dash: null, sight: 1250, hitBy: {},
    empower: 0, gx: 0, gy: 0, repT: 0, aggroT: -99, aggroVictim: null, ai: null, bLs: 0, haste: 0, bAp: 0,
    hpr: 0, mpr: 0, color: d.color
  });
  h.maxHp = 1; recalc(h); h.hp = h.maxHp; h.mp = h.maxMp;
  G.heroes.push(h);
  return h;
}

function pickHero(role, used) {
  var prefs = ROLE_PREF[role].slice();
  if (rnd() < 0.5) { var t = prefs[0]; prefs[0] = prefs[1]; prefs[1] = t; }
  for (var i = 0; i < prefs.length; i++) if (!used[prefs[i]]) { used[prefs[i]] = 1; return prefs[i]; }
  for (var j = 0; j < HERO_IDS.length; j++) if (!used[HERO_IDS[j]]) { used[HERO_IDS[j]] = 1; return HERO_IDS[j]; }
  return HERO_IDS[0];
}

function newGame(opt) {
  opt = opt || {};
  UID = 1; _seed = (opt.seed || (Date.now() & 0x7fffffff)) | 0;
  G = {
    t: 0, units: [], heroes: [], proj: [], zones: [], fx: [], texts: [], events: [], kills: [0, 0], score: [0, 0], timeLeft: MATCH_TIME, overtime: false,
    parts: [], shake: 0, flash: null, over: null, visT: 0, stratT: 1, focus: [0, 0], pickers: [[], []], player: null, diff: opt.diff === undefined ? 1 : opt.diff,
    stone: { state: 'center', x: MAP.STONE.x, y: MAP.STONE.y, carrier: null, freeT: 0, waitT: 0, team: -1, thrower: null, lockT: 0, z: 0 },
    packs: MAP.packs.map(function (p, i) { return { i: i, x: p.x, y: p.y, ready: true, t: 0 }; })
  };
  var rolesA = opt.noPlayer ? ['top', 'mid', 'jungle', 'bot', 'sup'] : ['mid', 'top', 'jungle', 'bot', 'sup'];
  var rolesB = ['top', 'mid', 'jungle', 'bot', 'sup'];
  var usedA = {}, usedB = {};
  if (!opt.noPlayer) usedA[opt.heroId] = 1;
  rolesA.forEach(function (role, i) {
    var isP = !opt.noPlayer && i === 0;
    var h = mkHero(isP ? opt.heroId : pickHero(role, usedA), 0, isP, i, role);
    if (isP) G.player = h; else aiInit(h, role);
  });
  rolesB.forEach(function (role, i) { var h = mkHero(pickHero(role, usedB), 1, false, i, role); aiInit(h, role); });
  updVision();
  return G;
}

/* ───────── 상태 효과 ───────── */
function addBuff(u, b) {
  for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].id === b.id) { u.buffs[i] = b; return; }
  u.buffs.push(b);
}
function breakStealth(u) {
  for (var i = u.buffs.length - 1; i >= 0; i--) if (u.buffs[i].stealth) u.buffs.splice(i, 1);
}
function updStatus(u, dt) {
  if (u.stunT > 0) u.stunT -= dt;
  if (u.rootT > 0) u.rootT -= dt;
  if (u.flash > 0) u.flash -= dt;
  if (u.swing > 0) u.swing -= dt;
  if (u.castT > 0) u.castT -= dt;
  var ms = 0, as = 0, ad = 0, armor = 0, slow = 0, ls = 0, st = false, sh = 0, dm = 0, rg = 0;
  for (var i = u.buffs.length - 1; i >= 0; i--) {
    var b = u.buffs[i]; b.t -= dt;
    if (b.t <= 0) { u.buffs.splice(i, 1); continue; }
    if (b.ms) ms += b.ms; if (b.as) as += b.as; if (b.ad) ad += b.ad; if (b.armor) armor += b.armor;
    if (b.slow && b.slow > slow) slow = b.slow; if (b.ls) ls += b.ls; if (b.stealth) st = true;
    if (b.shield > 0) sh += b.shield; if (b.dmgMul) dm += b.dmgMul; if (b.regen) rg += b.regen;
  }
  u.ms = u.bMs * (1 + ms) * (1 - slow);
  if (u.carry) u.ms *= CARRY_SLOW;
  u.as = u.bAs * (1 + as);
  u.ad = u.bAd + ad;
  u.armor = u.bArmor + armor;
  u.ls = (u.bLs || 0) + ls;
  u.stealth = st; u.shield = sh; u.dmgMul = 1 + dm; u.regenB = rg;
  if (u.type === 'hero') u.ap = u.bAp;
}

/* ───────── 피해와 처치 ───────── */
function healUnit(u, a) {
  if (u.dead || a <= 0) return 0;
  var b = u.hp, got; u.hp = Math.min(u.maxHp, u.hp + a); got = u.hp - b;
  if (G.player && u === G.player && got >= 12) ftext(u, '+' + Math.round(got), '#7dffa0');
  return got;
}

function damage(src, tgt, amt, kind) {
  if (tgt.dead || tgt.invuln || amt <= 0) return 0;
  var a = amt;
  if (src) a *= src.dmgMul || 1;
  if (kind !== 'true') a *= 100 / (100 + Math.max(0, tgt.armor));
  var dealt = a;
  if (tgt.shield > 0) {
    for (var i = 0; i < tgt.buffs.length && a > 0; i++) {
      var b = tgt.buffs[i];
      if (b.shield > 0) { var ab = Math.min(b.shield, a); b.shield -= ab; a -= ab; tgt.shield -= ab; }
    }
  }
  tgt.hp -= a; tgt.lastDmgT = G.t; tgt.flash = 0.12;
  if (dealt > 2) {
    var big = Math.min(1, dealt / 200);
    sparks(tgt.x, tgt.y - 44, 4 + ((big * 10) | 0), 230 + big * 300, (src && src.color) || '#ffffff', 6 + big * 8, 0.32 + big * 0.3, { glow: true });
    if (G.player && (tgt === G.player || src === G.player)) shake(Math.min(15, 2 + dealt / 14) * (tgt === G.player ? 1 : 0.55));
  }
  if (src) {
    tgt.lastAttacker = src;
    if (src.type === 'hero') {
      if (tgt.type === 'hero') { tgt.hitBy[src.id] = G.t; src.aggroT = G.t; src.aggroVictim = tgt; src.dmgDealt += dealt; src.ult = Math.min(100, src.ult + dealt / 50); }
      if (kind === 'basic' && src.ls > 0 && !src.dead) healUnit(src, dealt * src.ls);
    }
    if (G.player && (src === G.player || tgt === G.player) && dealt >= 4) {
      ftext(tgt, String(Math.round(dealt)), tgt === G.player ? '#ff7b7b' : (kind === 'skill' ? '#ffd27a' : '#ffffff'), 22 + Math.min(34, dealt / 5));
    }
  }
  if (tgt.hp <= 0) { tgt.hp = 0; kill(src, tgt); }
  return dealt;
}

function kill(src, v) { if (!v.dead && v.type === 'hero') killHero(src, v); }

function killHero(src, v) {
  v.dead = true; v.deaths++; v.hp = 0;
  v.respawnT = RESPAWN_T;
  v.buffs.length = 0; v.order = null; v.path = null; v.dash = null; v.stunT = 0; v.rootT = 0; v.empower = 0; v.ult *= 0.5;
  if (v.carry) dropStone(v);
  var killer = src && src.type === 'hero' ? src : null, ass = [], recent = null, rt = -1;
  G.heroes.forEach(function (h) {
    if (h.team === v.team) return;
    var t = v.hitBy[h.id];
    if (t !== undefined && G.t - t < 10) { ass.push(h); if (t > rt) { rt = t; recent = h; } }
  });
  if (!killer) killer = recent;
  G.kills[1 - v.team]++;
  if (killer) { killer.kills++; killer.ult = Math.min(100, killer.ult + 15); }
  ass.forEach(function (a) { if (a !== killer) { a.assists++; a.ult = Math.min(100, a.ult + 8); } });
  v.hitBy = {};
  fx({ type: 'burst', x: v.x, y: v.y, r: 260, dur: 0.7, color: v.color });
  fx({ type: 'shock', x: v.x, y: v.y, r: 460, dur: 0.6, color: v.color, w: 16 });
  sparks(v.x, v.y - 40, 38, 560, v.color, 12, 1.0, { g: 380, glow: true }); sparks(v.x, v.y - 40, 16, 420, '#ffffff', 8, 0.7, { g: 300, glow: true });
  if (nearP(v.x, v.y, 1500)) shake(10);
  ev('kill', { killer: killer ? killer.id : 0, victim: v.id, by: src ? src.type : '' });
}

function respawn(h) {
  var sp = spawnPos(h.team, h.slot);
  h.dead = false; h.x = sp.x; h.y = sp.y; h.hp = h.maxHp; h.order = null; h.path = null; h.vx = h.vy = 0;
  h.face = h.team ? Math.PI : 0; h.lastDmgT = -99;
  if (h.ai) h.ai.heal = false;
  fx({ type: 'ring', x: h.x, y: h.y, r: 140, dur: 0.6, color: h.color });
  fx({ type: 'pillar', x: h.x, y: h.y, w: 70, dur: 0.8, color: h.color });
  sparks(h.x, h.y, 18, 300, h.color, 8, 0.8, { g: -140, glow: true });
  if (h.isPlayer) ev('respawn');
}

/* ───────── 이동 ───────── */
function stepTo(u, x, y, dt) {
  if (u.rootT > 0) return false;
  var dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy), st = u.ms * dt;
  if (d <= st) { if (MAP.isWalk(x, y)) { u.x = x; u.y = y; } return true; }
  var nx = u.x + dx / d * st, ny = u.y + dy / d * st;
  u.face = Math.atan2(dy, dx);
  if (MAP.isWalk(nx, ny)) { u.x = nx; u.y = ny; }
  else if (MAP.isWalk(nx, u.y)) u.x = nx;
  else if (MAP.isWalk(u.x, ny)) u.y = ny;
  return false;
}
function followPath(h, dt) {
  var p = h.path; if (!p || !p.length) return true;
  if (stepTo(h, p[0][0], p[0][1], dt)) p.shift();
  return p.length === 0;
}
function moveGoal(h, x, y, dt) {
  h.repT -= dt;
  if (!h.path || !h.path.length || h.repT <= 0 || Math.hypot(h.gx - x, h.gy - y) > 150) {
    h.gx = x; h.gy = y; h.repT = 0.6;
    h.path = MAP.los(h.x, h.y, x, y) ? [[x, y]] : MAP.findPath(h.x, h.y, x, y);
  }
  return followPath(h, dt);
}

/* ───────── 기본 공격 ───────── */
function inRange(u, t) { return dist(u, t) <= u.range + t.r + (u.type === 'hero' ? 0 : u.r * 0.3); }
function tryAttack(u, t) {
  u.face = Math.atan2(t.y - u.y, t.x - u.x);
  if (u.atkCd > 0) return;
  u.atkCd = 1 / u.as;
  var dmg = u.ad;
  if (u.empower) { dmg += u.empower; u.empower = 0; }
  if (u.stealth) breakStealth(u);
  u.swingMax = u.type === 'hero' ? Math.min(0.34, 0.75 / u.as) : 0.2; u.swing = u.swingMax; u.atkN = (u.atkN || 0) + 1;
  if (u.ranged) {
    G.proj.push({ homing: true, x: u.x, y: u.y, target: t, speed: 1350, dmg: dmg, src: u, team: u.team,
      color: u.type === 'hero' ? u.color : (u.team === 0 ? '#7fe6dc' : u.team === 1 ? '#ff8c7a' : '#cfc3ff') });
    sparks(u.x + Math.cos(u.face) * 50, u.y - 30, 4, 280, u.color, 6, 0.25, { glow: true });
  } else {
    damage(u, t, dmg, 'basic');
    fx({ type: 'slash', x: t.x, y: t.y, r: 78, dur: 0.24, color: u.color || '#ffffff', a: u.face });
  }
  if (u.type === 'hero') ev('atk', { id: u.id });
}

function acquire(h, R, heroFirst) {
  var best = null, bd = 1e9;
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || u.team === h.team || u.team === 2 || u.invuln || !u.vis[h.team]) continue;
    var d = dist(h, u) - u.r;
    if (d > R) continue;
    if (heroFirst && u.type === 'hero') d -= 400;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

/* ───────── 스킬 ───────── */
function skillDmg(h, sk, rk) { return sk.dmg ? val(sk.dmg, rk) + (sk.sAd || 0) * h.ad + (sk.sAp || 0) * h.ap : 0; }
function skillHeal(h, sk, rk) { return sk.heal ? val(sk.heal, rk) + (sk.hSAp || 0) * h.ap : 0; }
function skillCd(h, i) { return val(h.def.skills[i].cd, h.ranks[i]) * 100 / (100 + h.haste); }
function skillReach(sk) { return sk.kind === 'nova' ? sk.radius : sk.kind === 'self' ? (sk.allyR || 0) : sk.range; }
function mkBuff(h, sk, rk) {
  var b = sk.buff, o = { id: 'sk:' + sk.name, t: b.dur };
  if (b.ms) o.ms = b.ms; if (b.as) o.as = val(b.as, rk); if (b.ad) o.ad = val(b.ad, rk);
  if (b.armor) o.armor = val(b.armor, rk); if (b.ls) o.ls = val(b.ls, rk); if (b.stealth) o.stealth = true;
  if (b.shield) o.shield = val(b.shield, rk) + (b.shSAd || 0) * h.ad + (b.shSAp || 0) * h.ap;
  return o;
}

function applyHit(src, t, sk, rk, dmg) {
  var d = dmg;
  if (sk.exec && t.hp / t.maxHp < 0.4) d *= 1 + sk.exec;
  if (d > 0) damage(src, t, d, 'skill');
  if (t.dead) return;
  var cc = t.boss ? 0.3 : 1;
  if (sk.slow) addBuff(t, { id: 'slow:' + sk.name, t: sk.slow[1] * cc, slow: sk.slow[0] });
  if (sk.stun) { t.stunT = Math.max(t.stunT, val(sk.stun, rk) * cc); t.dash = null; }
  if (sk.root) { t.rootT = Math.max(t.rootT, sk.root * cc); t.dash = null; }
}
function hittable(u, team) { return !u.dead && u.team !== team; }
function hitCircle(src, x, y, R, sk, rk, dmg, skip) {
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (!hittable(u, src.team) || (skip && skip.has(u.id))) continue;
    if (Math.hypot(u.x - x, u.y - y) <= R + u.r * 0.6) { if (skip) skip.add(u.id); applyHit(src, u, sk, rk, dmg); }
  }
}

/* 마나는 없다. 일반 스킬은 쿨다운만, 궁극기(3번)는 충전이 가득 차야 쓴다 */
function canCast(h, i) {
  if (h.dead || h.stunT > 0 || h.dash || h.cds[i] > 0) return false;
  return i === 3 ? h.ult >= 100 : true;
}
function castSkill(h, i, tx, ty) {
  if (!canCast(h, i)) return false;
  var sk = h.def.skills[i], rk = h.ranks[i];
  if ((sk.kind === 'dash') && h.rootT > 0) return false;
  var dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
  if (d < 1) { dx = Math.cos(h.face); dy = Math.sin(h.face); d = 1; }
  var ux = dx / d, uy = dy / d;
  if (i === 3) { h.ult = 0; h.cds[3] = 1.2; } else h.cds[i] = skillCd(h, i);
  h.castT = 0.4;
  if (sk.kind !== 'self' && sk.kind !== 'blink') h.face = Math.atan2(uy, ux);
  if (!(sk.buff && sk.buff.stealth)) breakStealth(h);
  var dmg = skillDmg(h, sk, rk);
  switch (sk.kind) {
    case 'shot':
      G.proj.push({ x: h.x, y: h.y, vx: ux * sk.speed, vy: uy * sk.speed, left: sk.range, w: sk.width, team: h.team, src: h, sk: sk, rk: rk, dmg: dmg, hit: new Set(), color: h.color });
      break;
    case 'area': {
      var dd = Math.min(d, sk.range), cx = h.x + ux * dd, cy = h.y + uy * dd, n = sk.count || 1;
      for (var k = 0; k < n; k++) {
        var ox = k ? (rnd() - 0.5) * 300 : 0, oy = k ? (rnd() - 0.5) * 300 : 0, del = (sk.delay || 0) + k * 0.45;
        G.zones.push({ x: cx + ox, y: cy + oy, r: sk.radius, delay: del, t0: del, dur: sk.dur || 0, tickT: 0, team: h.team, src: h, sk: sk, rk: rk, dmg: dmg, heal: skillHeal(h, sk, rk), color: h.color });
      }
      break;
    }
    case 'dash':
      h.dash = { ux: ux, uy: uy, left: Math.max(140, Math.min(d, sk.range)), speed: sk.speed, sk: sk, rk: rk, dmg: dmg, hit: new Set() };
      h.path = null;
      break;
    case 'blink': {
      var bd = Math.min(d, sk.range);
      fx({ type: 'ring', x: h.x, y: h.y, r: 90, dur: 0.3, color: h.color });
      while (bd > 0 && !MAP.isWalk(h.x + ux * bd, h.y + uy * bd)) bd -= 25;
      if (bd > 0) { h.x += ux * bd; h.y += uy * bd; }
      h.path = null;
      fx({ type: 'ring', x: h.x, y: h.y, r: 90, dur: 0.3, color: h.color });
      break;
    }
    case 'nova':
      hitCircle(h, h.x, h.y, sk.radius, sk, rk, dmg, null);
      fx({ type: 'ring', x: h.x, y: h.y, r: sk.radius, dur: 0.4, color: h.color, fill: true });
      break;
    case 'self':
      fx({ type: 'ring', x: h.x, y: h.y, r: sk.allyR || 110, dur: 0.4, color: h.color, follow: sk.allyR ? null : h });
      break;
  }
  if (sk.buff) {
    addBuff(h, mkBuff(h, sk, rk));
    if (sk.allyR) G.heroes.forEach(function (a) { if (a !== h && a.team === h.team && !a.dead && dist(a, h) < sk.allyR) addBuff(a, mkBuff(h, sk, rk)); });
  }
  if (sk.empower) h.empower = val(sk.empower, rk) + (sk.empSAd || 0) * h.ad;
  var cc = h.color, np = nearP(h.x, h.y, 1600);
  sparks(h.x, h.y - 40, 10, 360, cc, 8, 0.5, { glow: true });
  fx({ type: 'shock', x: h.x, y: h.y, r: 150, dur: 0.35, color: cc, w: 8 });
  if (sk.kind === 'shot') {
    var mx = h.x + ux * 70, my = h.y - 30 + uy * 70;
    fx({ type: 'shock', x: mx, y: my, r: 110, dur: 0.25, color: cc, w: 10 }); sparks(mx, my, 10, 620, '#ffffff', 6, 0.3, { glow: true });
  } else if (sk.kind === 'nova') {
    fx({ type: 'shock', x: h.x, y: h.y, r: sk.radius * 1.05, dur: 0.6, color: cc, w: 16 }); fx({ type: 'shock', x: h.x, y: h.y, r: sk.radius * 0.7, dur: 0.45, color: '#ffffff', w: 8 });
    sparks(h.x, h.y, 26, sk.radius * 1.6, cc, 10, 0.7, { glow: true }); if (np) shake(9);
  } else if (sk.kind === 'self') {
    for (var q2 = 0; q2 < 16; q2++) { var an = q2 / 16 * 6.2832, rr = 60 + Math.random() * 40; part(h.x + Math.cos(an) * rr, h.y + 20 + Math.sin(an) * rr * 0.5, 0, -90 - Math.random() * 120, 0.8, 8, cc, { glow: true, drag: 0.97 }); }
  } else if (sk.kind === 'dash') { sparks(h.x, h.y, 14, 520, '#ffffff', 7, 0.4, { glow: true }); }
  if (i === 3) {
    fx({ type: 'pillar', x: h.x, y: h.y, w: 110, dur: 1.0, color: cc }); fx({ type: 'shock', x: h.x, y: h.y, r: 620, dur: 0.8, color: cc, w: 20 });
    sparks(h.x, h.y - 40, 40, 700, cc, 12, 0.9, { glow: true, g: 120 }); if (np) { shake(16); flash(cc, 0.3); }
  }
  ev('cast', { id: h.id, slot: i });
  return true;
}

function updDash(h, dt) {
  var ds = h.dash, st = Math.min(ds.left, ds.speed * dt);
  var nx = h.x + ds.ux * st, ny = h.y + ds.uy * st, blocked = false;
  if (MAP.isWalk(nx, ny)) { h.x = nx; h.y = ny; ds.left -= st; } else blocked = true;
  if (ds.sk.hitRadius) hitCircle(h, h.x, h.y, ds.sk.hitRadius, ds.sk, ds.rk, ds.dmg, ds.hit);
  if (G.fx.length < 300) G.fx.push({ type: 'trail', x: h.x, y: h.y, r: h.r * 1.5, dur: 0.3, color: h.color, t: 0 });
  part(h.x, h.y - 30, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, 0.4, 9, h.color, { glow: true });
  if (!h.dash) return; /* 맞힌 대상의 반격으로 끊길 일은 없지만 안전하게 */
  if (ds.left <= 0.5 || blocked) {
    h.dash = null;
    if (ds.sk.landRadius) {
      hitCircle(h, h.x, h.y, ds.sk.landRadius, ds.sk, ds.rk, ds.dmg, null);
      fx({ type: 'ring', x: h.x, y: h.y, r: ds.sk.landRadius, dur: 0.4, color: h.color, fill: true });
      fx({ type: 'shock', x: h.x, y: h.y, r: ds.sk.landRadius * 1.15, dur: 0.5, color: h.color, w: 14 });
      sparks(h.x, h.y, 24, 500, h.color, 10, 0.7, { g: 200, glow: true }); if (nearP(h.x, h.y, 1500)) shake(9);
    }
  }
}

/* ───────── 영웅 ───────── */
function inFountain(h) { return dist(h, MAP.FOUNT[h.team]) < FOUNT_R; }
function cmdMove(h, x, y) {
  h.order = { type: 'move', x: x, y: y }; h.gx = x; h.gy = y; h.repT = 5;
  h.path = MAP.los(h.x, h.y, x, y) ? [[x, y]] : MAP.findPath(h.x, h.y, x, y);
}
function cmdAttack(h, t) { h.order = { type: 'attack', target: t }; h.path = null; }
function cmdAMove(h, x, y) { h.order = { type: 'amove', x: x, y: y }; h.path = null; }
function cmdStop(h) { h.order = null; h.path = null; }
/* 마우스 커서 가까이에 있는, 사거리 안의 적을 고른다. 영웅을 우선한다 */
function pickAssist(h) {
  var c = h.atkHold, best = null, bs = 1e9;
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || u.team === h.team || u.invuln || !u.vis[h.team] || dist(h, u) > h.range + u.r + 50) continue;
    var sc = Math.hypot(u.x - c.x, u.y - c.y) - (u.type === 'hero' ? 260 : 0);
    if (sc < bs) { bs = sc; best = u; }
  }
  return best;
}
function chase(h, t, dt) {
  if (inRange(h, t)) { tryAttack(h, t); return; }
  moveGoal(h, t.x, t.y, dt);
}
function updHero(h, dt) {
  if (h.dead) { h.respawnT -= dt; if (h.respawnT <= 0) respawn(h); return; }
  if (Math.hypot(h.vx || 0, h.vy || 0) > 120 && Math.random() < dt * 8) part(h.x - Math.cos(h.face) * 14, h.y + h.r * 0.7, (Math.random() - 0.5) * 60, -20 - Math.random() * 30, 0.5, 9, 'rgba(210,200,180,0.55)', { dust: true, drag: 0.9 });
  for (var i = 0; i < 4; i++) if (h.cds[i] > 0) h.cds[i] -= dt;
  h.ult = Math.min(100, h.ult + ULT_PASSIVE * dt);
  var reg = h.hpr + (h.regenB || 0);
  if (inFountain(h)) { reg += h.maxHp * 0.14; h.mp = Math.min(h.maxMp, h.mp + h.maxMp * 0.14 * dt); }
  if (h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + reg * dt);
  if (h.mp < h.maxMp) h.mp = Math.min(h.maxMp, h.mp + h.mpr * dt);
  if (dist(h, MAP.FOUNT[1 - h.team]) < 760) { damage(null, h, h.maxHp * 0.35 * dt, 'true'); if (h.dead) return; }
  if (h.dash) { updDash(h, dt); return; }
  if (h.stunT > 0) return;
  if (h.throwReq) { throwStone(h, h.throwReq.x, h.throwReq.y); h.throwReq = null; }
  var md = h.moveDir, moving = false;
  if (md && (md.x || md.y)) {
    var ml = Math.hypot(md.x, md.y);
    h.order = null; h.path = null; moving = true;
    stepTo(h, h.x + md.x / ml * 200, h.y + md.y / ml * 200, dt);
    if (h.aimF !== null && h.aimF !== undefined) h.face = h.aimF;
  }
  if (h.atkHold) {
    var at = pickAssist(h);
    if (at) { tryAttack(h, at); return; }
    if (h.aimF !== null && h.aimF !== undefined) h.face = h.aimF;
  }
  if (moving) return;
  var o = h.order;
  if (!o) {
    if (h.stealth) return;
    var t0 = acquire(h, h.range + (h.isPlayer ? 20 : 60), false);
    if (t0 && inRange(h, t0)) tryAttack(h, t0);
    return;
  }
  if (o.type === 'move') { if (followPath(h, dt)) h.order = null; }
  else if (o.type === 'attack') {
    var t = o.target;
    if (t.dead || t.invuln || (t.team !== 2 && !t.vis[h.team])) { h.order = null; h.path = null; return; }
    chase(h, t, dt);
  } else if (o.type === 'amove') {
    var t2 = acquire(h, h.range + 320, true);
    if (t2) chase(h, t2, dt);
    else if (moveGoal(h, o.x, o.y, dt)) h.order = null;
  }
}

/* ───────── 투사체와 지역 효과 ───────── */
function updProj(dt) {
  for (var i = G.proj.length - 1; i >= 0; i--) {
    var p = G.proj[i], rm = false;
    if (p.homing) {
      var t = p.target;
      if (t.dead) rm = true;
      else {
        var dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), st = p.speed * dt;
        if (d <= st + t.r * 0.6) { damage(p.src, t, p.dmg, 'basic'); fx({ type: 'spark', x: t.x, y: t.y - 40, r: 56, dur: 0.24, color: p.color }); rm = true; }
        else { p.x += dx / d * st; p.y += dy / d * st; if (Math.random() < 0.7) part(p.x, p.y, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, 0.28, 7, p.color, { glow: true }); }
      }
    } else {
      var step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.left -= step;
      part(p.x, p.y, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 0.4, Math.max(6, p.w * 0.14), p.color, { glow: true });
      if (Math.random() < 0.6) part(p.x, p.y, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 0.3, 5, '#ffffff', { glow: true });
      for (var j = 0; j < G.units.length && !rm; j++) {
        var u = G.units[j];
        if (!hittable(u, p.team) || p.hit.has(u.id)) continue;
        if (p.sk.heroOnly && u.type !== 'hero') continue;
        if (u.stealth && !u.vis[p.team] && false) continue;
        if (Math.hypot(u.x - p.x, u.y - p.y) > p.w / 2 + u.r) continue;
        p.hit.add(u.id);
        if (p.sk.aoe) { burst(p); rm = true; }
        else { applyHit(p.src, u, p.sk, p.rk, p.dmg); fx({ type: 'spark', x: u.x, y: u.y - 40, r: 96, dur: 0.28, color: p.color }); if (!p.sk.pierce) rm = true; }
      }
      if (!rm && p.left <= 0) { if (p.sk.endBurst) burst(p); rm = true; }
    }
    if (rm) G.proj.splice(i, 1);
  }
}
function burst(p) {
  hitCircle(p.src, p.x, p.y, p.sk.aoe, p.sk, p.rk, p.dmg, null);
  fx({ type: 'ring', x: p.x, y: p.y, r: p.sk.aoe, dur: 0.35, color: p.color, fill: true });
  fx({ type: 'shock', x: p.x, y: p.y, r: p.sk.aoe * 1.15, dur: 0.5, color: p.color, w: 14 });
  fx({ type: 'pillar', x: p.x, y: p.y, w: p.sk.aoe * 0.5, dur: 0.5, color: p.color });
  sparks(p.x, p.y, 26, 540, p.color, 10, 0.7, { g: 220, glow: true });
  if (nearP(p.x, p.y, 1500)) shake(8);
}
function zoneBlast(z) {
  fx({ type: 'ring', x: z.x, y: z.y, r: z.r, dur: 0.4, color: z.color, fill: true });
  fx({ type: 'shock', x: z.x, y: z.y, r: z.r * 1.15, dur: 0.55, color: z.color, w: 14 });
  fx({ type: 'pillar', x: z.x, y: z.y, w: z.r * 0.45, dur: 0.55, color: z.color });
  sparks(z.x, z.y, 24, z.r * 1.6, z.color, 10, 0.8, { g: 200, glow: true });
  if (nearP(z.x, z.y, 1500)) shake(7);
}
function zoneHit(z) {
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || Math.hypot(u.x - z.x, u.y - z.y) > z.r + u.r * 0.5) continue;
    if (u.team === z.team) {
      if (z.heal && u.type === 'hero') { var got = healUnit(u, z.heal); if (z.src && got > 0) { z.src.healed += got; z.src.ult = Math.min(100, z.src.ult + got / 60); } }
    }
    else if (hittable(u, z.team) && (z.dmg > 0 || z.sk.slow || z.sk.root)) applyHit(z.src, u, z.sk, z.rk, z.dmg);
  }
}
function updZones(dt) {
  for (var i = G.zones.length - 1; i >= 0; i--) {
    var z = G.zones[i];
    if (z.delay > 0) {
      z.delay -= dt;
      if (z.delay > 0) continue;
      if (!z.dur) { zoneHit(z); zoneBlast(z); G.zones.splice(i, 1); continue; }
    } else if (!z.dur && z.t0 === 0 && !z.fired) {
      zoneHit(z); zoneBlast(z); G.zones.splice(i, 1); continue;
    }
    z.tickT -= dt;
    if (Math.random() < dt * 22) { var za = Math.random() * 6.2832, zr = Math.random() * z.r; part(z.x + Math.cos(za) * zr, z.y + Math.sin(za) * zr * 0.6, 0, -60 - Math.random() * 80, 0.9, 7, z.color, { glow: true, drag: 0.98 }); }
    if (z.tickT <= 0) { z.tickT += 0.5; zoneHit(z); }
    z.dur -= dt;
    if (z.dur <= 0) G.zones.splice(i, 1);
  }
}

/* ───────── 시야 ───────── */
function updVision() {
  var us = G.units, n = us.length, i, j;
  for (i = 0; i < n; i++) { var u = us[i]; u.vis[0] = u.team === 0; u.vis[1] = u.team === 1; }
  for (i = 0; i < n; i++) {
    var s = us[i];
    if (s.dead || s.team === 2) continue;
    var T = s.team, s2 = s.sight * s.sight;
    for (j = 0; j < n; j++) {
      var v = us[j];
      if (v.team === T || v.vis[T] || v.dead) continue;
      var dx = v.x - s.x, dy = v.y - s.y, d2 = dx * dx + dy * dy;
      if (d2 > s2) continue;
      if (v.stealth && d2 > 78400) continue;
      v.vis[T] = true;
    }
  }
  /* 성석을 든 영웅은 양 팀 모두에게 보인다 */
  var cr = G.stone.carrier;
  if (cr && !cr.dead) { cr.vis[0] = true; cr.vis[1] = true; }
}

/* ───────── 밀어내기 ───────── */
function separate() {
  var us = G.units, n = us.length;
  for (var i = 0; i < n; i++) {
    var a = us[i]; if (a.dead || a.dash) continue;
    for (var j = i + 1; j < n; j++) {
      var b = us[j]; if (b.dead || b.dash) continue;
      var rr = a.r + b.r, dx = b.x - a.x; if (dx > rr || dx < -rr) continue;
      var dy = b.y - a.y; if (dy > rr || dy < -rr) continue;
      if (a.fixed && b.fixed) continue;
      var d = Math.hypot(dx, dy); if (d >= rr) continue;
      if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      var ov = rr - d, nx = dx / d, ny = dy / d;
      if (a.fixed) nudge(b, nx * ov, ny * ov);
      else if (b.fixed) nudge(a, -nx * ov, -ny * ov);
      else {
        var wa = a.type === 'hero' && b.type !== 'hero' ? 0.25 : b.type === 'hero' && a.type !== 'hero' ? 0.75 : 0.5;
        nudge(a, -nx * ov * wa * 0.5, -ny * ov * wa * 0.5); nudge(b, nx * ov * (1 - wa) * 0.5, ny * ov * (1 - wa) * 0.5);
      }
    }
  }
}
function nudge(u, dx, dy) { if (MAP.isWalk(u.x + dx, u.y + dy)) { u.x += dx; u.y += dy; } }

/* ───────── 성석 ───────── */
function finish(w) { if (G.over) return; G.over = { winner: w, t: G.t }; ev('over', { winner: w }); }
function dropStone(h) {
  var s = G.stone; if (s.carrier !== h) return;
  h.carry = false; s.carrier = null; s.state = 'free'; s.x = h.x; s.y = h.y; s.freeT = STONE_FREE_T; s.thrower = null; s.team = -1;
  sparks(h.x, h.y - 50, 18, 380, '#ffe9a8', 9, 0.7, { g: 260, glow: true });
  ev('drop', { id: h.id, team: h.team });
}
function throwStone(h, tx, ty) {
  var s = G.stone; if (s.carrier !== h || h.dead) return false;
  var dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, rng = Math.min(THROW_RANGE, Math.max(350, d)), lx = h.x, ly = h.y;
  for (var k = 40; k <= rng; k += 40) { var px = h.x + ux * k, py = h.y + uy * k; if (!MAP.isWalk(px, py)) break; lx = px; ly = py; }
  h.carry = false; s.carrier = null; s.state = 'flying'; s.sx = h.x; s.sy = h.y; s.tx = lx; s.ty = ly; s.fT = 0;
  s.fDur = 0.3 + Math.hypot(lx - h.x, ly - h.y) / 1800; s.thrower = h; s.lockT = 0.6; s.team = h.team;
  ev('throw', { id: h.id, team: h.team });
  return true;
}
function takeStone(h) {
  var s = G.stone;
  s.state = 'carried'; s.carrier = h; s.team = h.team; h.carry = true; s.thrower = null;
  breakStealth(h); h.dash = null;
  fx({ type: 'ring', x: h.x, y: h.y, r: 150, dur: 0.5, color: '#ffe9a8' });
  fx({ type: 'shock', x: h.x, y: h.y, r: 280, dur: 0.5, color: '#ffe9a8', w: 12 });
  sparks(h.x, h.y - 60, 24, 460, '#ffe9a8', 9, 0.8, { g: -60, glow: true });
  ev('pickup', { id: h.id, team: h.team });
}
function scorePoint(h) {
  var s = G.stone, T = h.team;
  G.score[T]++; h.scores++; h.carry = false; s.carrier = null; s.state = 'wait'; s.waitT = STONE_WAIT_T; s.team = -1; s.x = MAP.STONE.x; s.y = MAP.STONE.y;
  G.heroes.forEach(function (a) { if (a.team === T) a.ult = Math.min(100, a.ult + 25); });
  var A = MAP.ALTAR[T], tc = T === 0 ? '#4fe0d2' : '#ff6b5e';
  fx({ type: 'burst', x: A.x, y: A.y, r: 620, dur: 1.1, color: tc }); fx({ type: 'shock', x: A.x, y: A.y, r: 760, dur: 1.0, color: tc, w: 22 });
  fx({ type: 'pillar', x: A.x, y: A.y - 140, w: 120, dur: 1.4, color: tc });
  for (var fw = 0; fw < 7; fw++) sparks(A.x + (Math.random() - 0.5) * 600, A.y - 160 - Math.random() * 300, 30, 620, fw % 2 ? tc : '#ffe9a8', 11, 1.2, { g: 260, glow: true });
  if (nearP(A.x, A.y, 2200)) { shake(8); flash(tc, 0.22); }
  ev('score', { team: T, id: h.id });
  if (G.score[T] >= WIN_SCORE || G.overtime) finish(T);
}
function updStone(dt) {
  var s = G.stone, C = MAP.STONE;
  if (s.lockT > 0) s.lockT -= dt;
  if (s.state === 'wait') {
    s.waitT -= dt;
    if (s.waitT <= 0) { s.state = 'center'; fx({ type: 'pillar', x: C.x, y: C.y, w: 100, dur: 1.2, color: '#ffe9a8' }); fx({ type: 'shock', x: C.x, y: C.y, r: 420, dur: 0.8, color: '#ffe9a8', w: 16 }); sparks(C.x, C.y - 40, 36, 520, '#ffe9a8', 10, 1, { g: -80, glow: true }); ev('spawn'); }
    return;
  }
  if (s.state === 'flying') {
    s.fT += dt; var k = Math.min(1, s.fT / s.fDur);
    s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k; s.z = Math.sin(k * Math.PI) * 140;
    part(s.x, s.y - 40 - s.z, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 0.45, 8, '#ffe9a8', { glow: true });
    if (k >= 1) { s.state = 'free'; s.freeT = STONE_FREE_T; s.z = 0; }
    return;
  }
  if (s.state === 'carried') {
    var c = s.carrier; s.x = c.x; s.y = c.y; s.z = 0;
    var A = MAP.ALTAR[c.team];
    if (Math.hypot(c.x - A.x, c.y - A.y) < ALTAR_R) scorePoint(c);
    return;
  }
  if (Math.random() < dt * 14) part(s.x + (Math.random() - 0.5) * 60, s.y - 20, 0, -70 - Math.random() * 70, 1.0, 6, '#ffe9a8', { glow: true, drag: 0.98 });
  if (s.state === 'free') { s.freeT -= dt; if (s.freeT <= 0) { s.state = 'center'; s.x = C.x; s.y = C.y; ev('return'); } }
  var best = null, bd = 1e9;
  for (var i = 0; i < G.heroes.length; i++) {
    var h = G.heroes[i];
    if (h.dead || h.stunT > 0 || (s.thrower === h && s.lockT > 0)) continue;
    var d = Math.hypot(h.x - s.x, h.y - s.y);
    if (d < STONE_R + h.r && d < bd) { bd = d; best = h; }
  }
  if (best) takeStone(best);
}

/* ───────── 회복 구슬 ───────── */
function updPacks(dt) {
  for (var i = 0; i < G.packs.length; i++) {
    var p = G.packs[i];
    if (!p.ready) { p.t -= dt; if (p.t <= 0) p.ready = true; continue; }
    if (Math.random() < dt * 2.5) part(p.x + (Math.random() - 0.5) * 40, p.y - 20, 0, -50 - Math.random() * 40, 1.0, 5, '#9dffb0', { glow: true, drag: 0.98 });
    for (var k = 0; k < G.heroes.length; k++) {
      var h = G.heroes[k];
      if (h.dead || Math.hypot(h.x - p.x, h.y - p.y) > 95 || (h.hp > h.maxHp * 0.97 && h.ult >= 100)) continue;
      healUnit(h, h.maxHp * 0.45); h.ult = Math.min(100, h.ult + 20);
      p.ready = false; p.t = PACK_T;
      sparks(p.x, p.y - 30, 24, 420, '#9dffb0', 9, 0.9, { g: -100, glow: true }); fx({ type: 'shock', x: p.x, y: p.y, r: 220, dur: 0.5, color: '#9dffb0', w: 10 });
      fx({ type: 'ring', x: p.x, y: p.y, r: 130, dur: 0.5, color: '#9dffb0', fill: true });
      ev('pack', { id: h.id, i: i });
      break;
    }
  }
}

/* ───────── 팀 단위 판단 (3초마다) ───────── */
function strategy() {
  var st = G.stone;
  for (var T = 0; T < 2; T++) {
    /* 집중 공격 대상: 성석을 든 적을 가장 먼저, 그다음 약하고 가까운 적 */
    var fb = null, fs = -1e9, cx = 0, cy = 0, cn = 0;
    G.heroes.forEach(function (a) { if (a.team === T && !a.dead) { cx += a.x; cy += a.y; cn++; } });
    if (cn) {
      cx /= cn; cy /= cn;
      G.heroes.forEach(function (e) {
        if (e.team === T || e.dead || !e.vis[T]) return;
        var d = Math.hypot(e.x - cx, e.y - cy); if (d > 2800 && !e.carry) return;
        var near = 0; G.heroes.forEach(function (a) { if (a.team === T && !a.dead && dist(a, e) < 1500) near++; });
        var sc = (1 - e.hp / e.maxHp) * 800 + (e.armor < 35 ? 150 : 0) - e.hp * 0.12 + near * 140 - d * 0.1 + (e.carry ? 1800 : 0);
        if (sc > fs) { fs = sc; fb = e; }
      });
    }
    G.focus[T] = fb ? fb.id : 0;
    /* 성석이 바닥에 있으면 가장 가까운 둘이 줍는다 */
    G.pickers[T] = [];
    if (st.state === 'center' || st.state === 'free' || st.state === 'flying') {
      var al = G.heroes.filter(function (a) { return a.team === T && !a.dead; });
      al.sort(function (a, b) { return Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y); });
      G.pickers[T] = al.slice(0, 2).map(function (a) { return a.id; });
    }
  }
}

/* ───────── 한 틱 ───────── */
function tick(dt) {
  if (G.over) { ageFx(dt); return; }
  G.t += dt;
  if (!G.overtime) {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) {
      G.timeLeft = 0;
      if (G.score[0] !== G.score[1]) finish(G.score[0] > G.score[1] ? 0 : 1);
      else { G.overtime = true; ev('overtime'); }
    }
  }
  G.visT -= dt; if (G.visT <= 0) { G.visT = 0.15; updVision(); }
  G.stratT -= dt; if (G.stratT <= 0) { G.stratT = 1.5; strategy(); }
  var us = G.units, n = us.length, i;
  for (i = 0; i < n; i++) {
    var u = us[i];
    u.px = u.x; u.py = u.y;
    if (!u.dead) { updStatus(u, dt); u.atkCd -= dt; }
    if (u.ai) aiUpdate(u, dt);
    updHero(u, dt);
    if (G.over) break;
  }
  updStone(dt); updPacks(dt);
  separate();
  for (i = 0; i < us.length; i++) { var w = us[i]; w.vx = (w.x - w.px) / dt; w.vy = (w.y - w.py) / dt; }
  updProj(dt); updZones(dt); ageFx(dt);
}
function ageFx(dt) {
  var i;
  for (i = G.fx.length - 1; i >= 0; i--) { var f = G.fx[i]; f.t += dt; if (f.t >= f.dur) G.fx.splice(i, 1); }
  for (i = G.texts.length - 1; i >= 0; i--) { var x = G.texts[i]; x.t += dt; x.y -= 60 * dt; if (x.t >= 0.9) G.texts.splice(i, 1); }
  for (i = G.parts.length - 1; i >= 0; i--) {
    var q = G.parts[i]; q.t += dt;
    if (q.t >= q.life) { G.parts.splice(i, 1); continue; }
    var dr = Math.pow(q.drag, dt * 60);
    q.vx *= dr; q.vy = q.vy * dr + q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
  }
  if (G.shake) { G.shake *= Math.exp(-9 * dt); if (G.shake < 0.3) G.shake = 0; }
  if (G.flash) { G.flash.a -= dt * 1.8; if (G.flash.a <= 0) G.flash = null; }
}
