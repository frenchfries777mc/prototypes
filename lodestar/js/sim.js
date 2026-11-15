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
function ftext(u, txt, color) {
  if (G.texts.length < 80) G.texts.push({ x: u.x + (rnd() - 0.5) * 40, y: u.y - u.r - 20, txt: txt, color: color, t: 0 });
}

var TOWER_F = { 1: 0.38, 2: 0.24, 3: 0.10 };
var TOWER_HP = [0, 2600, 3000, 3400], TOWER_AD = [0, 150, 170, 190];
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
  for (var i = 0; i < h.items.length; i++) { var I = ITEMS[h.items[i]]; for (var k in it) if (I[k]) it[k] += I[k]; }
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
    level: 1, xp: 0, gold: 500, items: [], ranks: [0, 0, 0, 0], cds: [0, 0, 0, 0], points: 1,
    mp: 0, maxMp: 0, kills: 0, deaths: 0, assists: 0, cs: 0, dmgDealt: 0, earned: 500,
    respawnT: 0, order: null, path: null, dash: null, recallT: 0, sight: 1250, hitBy: {},
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
    t: 0, units: [], heroes: [], proj: [], zones: [], fx: [], texts: [], events: [], camps: [], towers: [], cores: [],
    kills: [0, 0], over: null, waveN: 0, waveT: 12, visT: 0, stratT: 1, groupLane: [null, null], focus: [0, 0], bossPlan: [null, null], behind: [false, false],
    player: null, diff: opt.diff === undefined ? 1 : opt.diff, playerLane: 'mid', plCand: 'mid', plCandT: 0
  };
  for (var T = 0; T < 2; T++) {
    var c = mkUnit('core', T, MAP.CORE[T].x, MAP.CORE[T].y, { r: 130, maxHp: 5000, bArmor: 45, invuln: true, sight: 1300, name: '로드스톤', fixed: true, lane: 'mid' });
    G.cores[T] = c;
    LANES.forEach(function (ln, li) {
      var L = MAP.lanes[ln];
      for (var tier = 1; tier <= 3; tier++) {
        var s = T === 0 ? TOWER_F[tier] * L.len : (1 - TOWER_F[tier]) * L.len, p = MAP.laneAt(L, s);
        var sd = (li === 2 ? -1 : 1) * 150;
        var tw = mkUnit('tower', T, p.x - p.uy * sd, p.y + p.ux * sd, {
          r: 75, tier: tier, lane: ln, maxHp: TOWER_HP[tier], bAd: TOWER_AD[tier], bAs: 0.85, range: 780, bArmor: 40,
          invuln: tier > 1, sight: 1300, ranged: true, fixed: true, ramp: 0, pressured: false, name: '포탑', laneS: s
        });
        G.towers.push(tw);
      }
    });
  }
  MAP.camps.forEach(function (c) { G.camps.push({ x: c.x, y: c.y, type: c.type, side: c.side, units: [], alive: 0, respawnT: 40, target: null }); });
  MAP.bosses.forEach(function (b) { G.camps.push({ x: b.x, y: b.y, type: b.type, side: 2, boss: true, units: [], alive: 0, respawnT: 300, target: null }); });

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
  u.as = u.bAs * (1 + as);
  u.ad = u.bAd + ad;
  u.armor = u.bArmor + armor;
  u.ls = (u.bLs || 0) + ls;
  u.stealth = st; u.shield = sh; u.dmgMul = 1 + dm; u.regenB = rg;
  if (u.type === 'hero') u.ap = u.bAp;
}

/* ───────── 피해와 처치 ───────── */
function gainMul(h) { return (h.team === 1 && G.player) ? DIFFS[G.diff].gain : 1; }
function give(h, g) { g *= gainMul(h); h.gold += g; h.earned += g; if (h.isPlayer && g >= 10) ftext(h, '+' + Math.round(g), '#ffd76a'); }
function xpNeed(l) { return 160 + 110 * l; }
function gainXp(h, x) {
  if (h.level >= MAX_LEVEL) return;
  /* 뒤처진 팀은 경험치를 더 받는다 (상대 평균 레벨과의 차이 1당 9%, 최대 45%) */
  var sum = 0, n = 0;
  for (var q = 0; q < G.heroes.length; q++) { var e = G.heroes[q]; if (e.team !== h.team) { sum += e.level; n++; } }
  var catchUp = n ? 1 + Math.max(0, Math.min(0.45, 0.09 * (sum / n - h.level))) : 1;
  h.xp += x * gainMul(h) * catchUp;
  while (h.level < MAX_LEVEL && h.xp >= xpNeed(h.level)) {
    h.xp -= xpNeed(h.level); h.level++; h.points++; recalc(h);
    fx({ type: 'ring', x: h.x, y: h.y, r: 120, dur: 0.6, color: '#ffe9a8', follow: h });
    if (h.isPlayer) ev('level', { level: h.level });
  }
  if (h.level >= MAX_LEVEL) h.xp = 0;
}
function healUnit(u, a) {
  if (u.dead || a <= 0) return;
  var b = u.hp; u.hp = Math.min(u.maxHp, u.hp + a);
  if (G.player && u === G.player && u.hp - b >= 12) ftext(u, '+' + Math.round(u.hp - b), '#7dffa0');
}

function damage(src, tgt, amt, kind) {
  if (tgt.dead || tgt.invuln || amt <= 0) return 0;
  var a = amt;
  if (src) a *= src.dmgMul || 1;
  if (kind !== 'true') a *= 100 / (100 + Math.max(0, tgt.armor));
  var struct = tgt.type === 'tower' || tgt.type === 'core';
  if (src && src.type === 'minion') {
    if (tgt.type === 'hero') a *= 0.6;
    else if (struct) a *= src.siege ? 1.3 : 0.6;
  }
  if (struct && !tgt.pressured) a *= 0.35;
  if (src && src.type === 'tower' && tgt.type === 'minion') a *= tgt.siege ? 0.7 : 1.6;
  var dealt = a;
  if (tgt.shield > 0) {
    for (var i = 0; i < tgt.buffs.length && a > 0; i++) {
      var b = tgt.buffs[i];
      if (b.shield > 0) { var ab = Math.min(b.shield, a); b.shield -= ab; a -= ab; tgt.shield -= ab; }
    }
  }
  tgt.hp -= a; tgt.lastDmgT = G.t; tgt.flash = 0.12;
  if (tgt.recallT > 0) tgt.recallT = 0;
  if (src) {
    tgt.lastAttacker = src;
    if (src.type === 'hero') {
      if (tgt.type === 'hero') { tgt.hitBy[src.id] = G.t; src.aggroT = G.t; src.aggroVictim = tgt; src.dmgDealt += dealt; }
      else if (tgt.type === 'monster' && !tgt.camp.target) tgt.camp.target = src;
      if (kind === 'basic' && src.ls > 0 && !src.dead && !struct) healUnit(src, dealt * src.ls);
    }
    if (G.player && (src === G.player || tgt === G.player) && dealt >= 4) {
      ftext(tgt, String(Math.round(dealt)), tgt === G.player ? '#ff7b7b' : (kind === 'skill' ? '#ffd27a' : '#ffffff'));
    }
  }
  if (tgt.hp <= 0) { tgt.hp = 0; kill(src, tgt); }
  return dealt;
}

function nearHeroes(team, x, y, R) {
  var out = [];
  for (var i = 0; i < G.heroes.length; i++) { var h = G.heroes[i]; if (h.team === team && !h.dead && Math.hypot(h.x - x, h.y - y) < R) out.push(h); }
  return out;
}
function shareXp(team, x, y, xp, killer) {
  var hs = nearHeroes(team, x, y, 1300);
  if (killer && hs.indexOf(killer) < 0) hs.push(killer);
  var n = hs.length; if (!n) return;
  var each = xp * (n === 1 ? 1 : n === 2 ? 0.62 : 0.45);
  for (var i = 0; i < n; i++) gainXp(hs[i], each);
}

function refreshInvuln() {
  for (var T = 0; T < 2; T++) {
    var open = false;
    LANES.forEach(function (ln) {
      var low = 9;
      G.towers.forEach(function (t) { if (!t.dead && t.team === T && t.lane === ln && t.tier < low) low = t.tier; });
      if (low === 9) open = true;
      G.towers.forEach(function (t) { if (!t.dead && t.team === T && t.lane === ln) t.invuln = t.tier !== low; });
    });
    G.cores[T].invuln = !open;
  }
}

function kill(src, v) {
  if (v.dead) return;
  var killer = src && src.type === 'hero' ? src : null;
  if (v.type === 'hero') return killHero(src, v);
  v.dead = true;
  fx({ type: 'burst', x: v.x, y: v.y, r: v.r * 2.2, dur: 0.35, color: v.type === 'minion' ? (v.team ? '#ff8c7a' : '#7fe6dc') : '#d9c7a0' });
  if (v.type === 'minion') {
    if (killer) { give(killer, v.gold); killer.cs++; }
    shareXp(1 - v.team, v.x, v.y, v.xp, killer);
  } else if (v.type === 'monster') {
    var c = v.camp; c.alive--;
    if (killer) { give(killer, v.gold); killer.cs++; shareXp(killer.team, v.x, v.y, v.xp, killer); }
    if (c.alive <= 0) { c.respawnT = c.boss ? 300 : 80; c.target = null; }
    var team = killer ? killer.team : (src && src.team < 2 ? src.team : -1);
    if (v.boss && team >= 0) {
      G.heroes.forEach(function (h) {
        if (h.team !== team) return;
        if (v.boss === 'titan') { give(h, 200); if (!h.dead) addBuff(h, { id: 'titan', t: 150, dmgMul: 0.15, regen: 25, titan: true }); }
        else give(h, 380);
      });
      ev('boss', { team: team, boss: v.boss });
    }
  } else if (v.type === 'tower') {
    G.heroes.forEach(function (h) { if (h.team !== v.team) give(h, 130 + (h === killer ? 100 : 0)); });
    refreshInvuln();
    fx({ type: 'burst', x: v.x, y: v.y, r: 320, dur: 0.8, color: '#ffd9a0' });
    ev('tower', { team: v.team, lane: v.lane, tier: v.tier });
  } else if (v.type === 'core') {
    G.over = { winner: 1 - v.team, t: G.t };
    fx({ type: 'burst', x: v.x, y: v.y, r: 700, dur: 1.6, color: '#ffffff' });
    ev('over', { winner: 1 - v.team });
  }
}

function killHero(src, v) {
  v.dead = true; v.deaths++; v.hp = 0;
  v.respawnT = 6 + 2.3 * v.level + G.t / 120;
  v.buffs.length = 0; v.order = null; v.path = null; v.dash = null; v.recallT = 0; v.stunT = 0; v.rootT = 0; v.empower = 0;
  var killer = src && src.type === 'hero' ? src : null, ass = [], recent = null, rt = -1;
  G.heroes.forEach(function (h) {
    if (h.team === v.team) return;
    var t = v.hitBy[h.id];
    if (t !== undefined && G.t - t < 10) { ass.push(h); if (t > rt) { rt = t; recent = h; } }
  });
  if (!killer) killer = recent;
  G.kills[1 - v.team]++;
  var sharers = ass.slice(); if (killer && sharers.indexOf(killer) < 0) sharers.push(killer);
  /* 현상금: 연속으로 처치한 영웅은 비싸고, 연속으로 죽은 영웅은 싸다 */
  var vs = v.streak || 0, vd = v.dStreak || 0;
  v.streak = 0; v.dStreak = vd + 1;
  if (killer) { killer.kills++; killer.streak = (killer.streak || 0) + 1; killer.dStreak = 0; give(killer, 300 + Math.min(400, 60 * vs) - Math.min(150, 30 * vd)); }
  ass.forEach(function (a) { if (a !== killer) { a.assists++; give(a, 120); } });
  var xp = (140 + 22 * v.level) / (sharers.length > 1 ? sharers.length * 0.7 : 1);
  sharers.forEach(function (h) { gainXp(h, xp); });
  v.hitBy = {};
  fx({ type: 'burst', x: v.x, y: v.y, r: 200, dur: 0.6, color: v.color });
  ev('kill', { killer: killer ? killer.id : 0, victim: v.id, by: src ? src.type : '' });
}

function respawn(h) {
  var sp = spawnPos(h.team, h.slot);
  h.dead = false; h.x = sp.x; h.y = sp.y; h.hp = h.maxHp; h.mp = h.maxMp; h.order = null; h.path = null;
  h.face = h.team ? Math.PI : 0; h.lastDmgT = -99;
  if (h.ai) h.ai.mode = 'lane';
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
    G.proj.push({ homing: true, x: u.x, y: u.y, target: t, speed: u.type === 'tower' ? 1500 : 1350, dmg: dmg, src: u, team: u.team,
      color: u.type === 'hero' ? u.color : (u.team === 0 ? '#7fe6dc' : u.team === 1 ? '#ff8c7a' : '#cfc3ff'), big: u.type === 'tower' });
  } else {
    damage(u, t, dmg, 'basic');
    fx({ type: 'slash', x: t.x, y: t.y, r: 34, dur: 0.16, color: '#ffffff', a: u.face });
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
function rankCap(h, i) {
  if (i === 3) return h.level >= 15 ? 3 : h.level >= 11 ? 2 : h.level >= 6 ? 1 : 0;
  return Math.min(4, Math.ceil(h.level / 2));
}
function levelSkill(h, i) {
  if (h.points <= 0 || h.ranks[i] >= rankCap(h, i)) return false;
  h.ranks[i]++; h.points--; return true;
}
function autoSkill(h) {
  var guard = 0;
  while (h.points > 0 && guard++ < 20) {
    if (levelSkill(h, 3)) continue;
    var ord = h.def.order, okd = false;
    if (h.level <= 3) { for (var a = 0; a < 3 && !okd; a++) if (h.ranks[ord[a]] === 0) okd = levelSkill(h, ord[a]); }
    for (var b = 0; b < 3 && !okd; b++) okd = levelSkill(h, ord[b]);
    if (!okd) break;
  }
}

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
  if (sk.stun) { t.stunT = Math.max(t.stunT, val(sk.stun, rk) * cc); t.dash = null; t.recallT = 0; }
  if (sk.root) { t.rootT = Math.max(t.rootT, sk.root * cc); t.dash = null; }
}
function hittable(u, team) { return !u.dead && u.team !== team && u.type !== 'tower' && u.type !== 'core'; }
function hitCircle(src, x, y, R, sk, rk, dmg, skip) {
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (!hittable(u, src.team) || (skip && skip.has(u.id))) continue;
    if (Math.hypot(u.x - x, u.y - y) <= R + u.r * 0.6) { if (skip) skip.add(u.id); applyHit(src, u, sk, rk, dmg); }
  }
}

function canCast(h, i) {
  var rk = h.ranks[i];
  return rk > 0 && h.cds[i] <= 0 && !h.dead && h.stunT <= 0 && !h.dash && h.mp >= val(h.def.skills[i].cost, rk);
}
function castSkill(h, i, tx, ty) {
  if (!canCast(h, i)) return false;
  var sk = h.def.skills[i], rk = h.ranks[i];
  if ((sk.kind === 'dash') && h.rootT > 0) return false;
  var dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
  if (d < 1) { dx = Math.cos(h.face); dy = Math.sin(h.face); d = 1; }
  var ux = dx / d, uy = dy / d;
  h.mp -= val(sk.cost, rk); h.cds[i] = skillCd(h, i); h.recallT = 0; h.castT = 0.4;
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
  ev('cast', { id: h.id, slot: i });
  return true;
}

function updDash(h, dt) {
  var ds = h.dash, st = Math.min(ds.left, ds.speed * dt);
  var nx = h.x + ds.ux * st, ny = h.y + ds.uy * st, blocked = false;
  if (MAP.isWalk(nx, ny)) { h.x = nx; h.y = ny; ds.left -= st; } else blocked = true;
  if (ds.sk.hitRadius) hitCircle(h, h.x, h.y, ds.sk.hitRadius, ds.sk, ds.rk, ds.dmg, ds.hit);
  if (G.fx.length < 300) G.fx.push({ type: 'trail', x: h.x, y: h.y, r: h.r, dur: 0.25, color: h.color, t: 0 });
  if (!h.dash) return; /* 맞힌 대상의 반격으로 끊길 일은 없지만 안전하게 */
  if (ds.left <= 0.5 || blocked) {
    h.dash = null;
    if (ds.sk.landRadius) {
      hitCircle(h, h.x, h.y, ds.sk.landRadius, ds.sk, ds.rk, ds.dmg, null);
      fx({ type: 'ring', x: h.x, y: h.y, r: ds.sk.landRadius, dur: 0.4, color: h.color, fill: true });
    }
  }
}

/* ───────── 영웅 ───────── */
function inFountain(h) { return dist(h, MAP.FOUNT[h.team]) < FOUNT_R; }
function cmdMove(h, x, y) {
  h.order = { type: 'move', x: x, y: y }; h.recallT = 0; h.gx = x; h.gy = y; h.repT = 5;
  h.path = MAP.los(h.x, h.y, x, y) ? [[x, y]] : MAP.findPath(h.x, h.y, x, y);
}
function cmdAttack(h, t) { h.order = { type: 'attack', target: t }; h.recallT = 0; h.path = null; }
function cmdAMove(h, x, y) { h.order = { type: 'amove', x: x, y: y }; h.recallT = 0; h.path = null; }
function cmdStop(h) { h.order = null; h.path = null; h.recallT = 0; }
function startRecall(h) { if (h.dead || h.dash || h.stunT > 0) return; h.order = null; h.path = null; h.recallT = 6; }

function buyItem(h, id) {
  var I = ITEMS[id];
  if (!I || h.items.length >= 6 || h.gold < I.cost || !(h.dead || inFountain(h))) return false;
  if (I.unique && h.items.indexOf(id) >= 0) return false;
  h.gold -= I.cost; h.items.push(id); recalc(h); return true;
}
function sellItem(h, idx) {
  if (idx < 0 || idx >= h.items.length || !(h.dead || inFountain(h))) return false;
  var I = ITEMS[h.items[idx]];
  h.gold += Math.round(I.cost * SELL_RATE); h.items.splice(idx, 1); recalc(h); return true;
}

/* 마우스 커서 가까이에 있는, 사거리 안의 적을 고른다. 영웅을 우선한다 */
function pickAssist(h) {
  var c = h.atkHold, best = null, bs = 1e9;
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || u.team === h.team || u.invuln || !u.vis[h.team] || !inRange(h, u)) continue;
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
  for (var i = 0; i < 4; i++) if (h.cds[i] > 0) h.cds[i] -= dt;
  h.gold += 2 * dt * gainMul(h); h.earned += 2 * dt * gainMul(h);
  var reg = h.hpr + (h.regenB || 0);
  if (inFountain(h)) { reg += h.maxHp * 0.14; h.mp = Math.min(h.maxMp, h.mp + h.maxMp * 0.14 * dt); }
  if (h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + reg * dt);
  if (h.mp < h.maxMp) h.mp = Math.min(h.maxMp, h.mp + h.mpr * dt);
  if (dist(h, MAP.FOUNT[1 - h.team]) < 760) { damage(null, h, h.maxHp * 0.35 * dt, 'true'); if (h.dead) return; }
  if (h.dash) { updDash(h, dt); return; }
  if (h.stunT > 0) return;
  var md = h.moveDir, moving = false;
  if (md && (md.x || md.y)) {
    var ml = Math.hypot(md.x, md.y);
    h.recallT = 0; h.order = null; h.path = null; moving = true;
    stepTo(h, h.x + md.x / ml * 200, h.y + md.y / ml * 200, dt);
    if (h.aimF !== null && h.aimF !== undefined) h.face = h.aimF;
  }
  if (h.atkHold && h.recallT <= 0) {
    var at = pickAssist(h);
    if (at) { tryAttack(h, at); return; }
    if (h.aimF !== null && h.aimF !== undefined) h.face = h.aimF;
  }
  if (moving) return;
  if (h.recallT > 0) {
    h.recallT -= dt;
    if (h.recallT <= 0) {
      var sp = spawnPos(h.team, h.slot);
      fx({ type: 'ring', x: h.x, y: h.y, r: 120, dur: 0.5, color: '#bfe9ff' });
      h.x = sp.x; h.y = sp.y; h.path = null; h.recallT = 0;
      if (h.isPlayer) ev('recalled');
    }
    return;
  }
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

/* ───────── 병사 ───────── */
function spawnWave() {
  G.waveN++;
  var min = G.t / 60, hpM = 1 + 0.045 * min, adM = 1 + 0.035 * min;
  for (var T = 0; T < 2; T++) LANES.forEach(function (ln) {
    var L = MAP.lanes[ln], dir = T === 0 ? 1 : -1, s0 = T === 0 ? 330 : L.len - 330;
    var list = ['melee', 'melee', 'melee', 'ranged', 'ranged', 'ranged'];
    if (G.waveN % 3 === 0) list.push('siege');
    if (min > 18) list.unshift('melee');
    var open = true;
    G.towers.forEach(function (t) { if (!t.dead && t.team !== T && t.lane === ln) open = false; });
    if (open) list.push('siege');
    list.forEach(function (k, i) {
      var d = MINION[k], p = MAP.laneAt(L, s0 - dir * i * 55), off = (rnd() - 0.5) * 180;
      mkUnit('minion', T, p.x - p.uy * off * 0.5, p.y + p.ux * off * 0.5, {
        r: d.r, maxHp: Math.round(d.hp * hpM), bAd: d.ad * adM, bAs: d.as, bMs: d.ms, range: d.range, ranged: !!d.ranged, siege: !!d.siege,
        mtype: k, lane: ln, dir: dir, off: off, gold: d.gold + Math.floor(min * 0.4), xp: d.xp * (1 + 0.03 * min), sight: 900
      });
    });
  });
}
function updMinion(m, dt) {
  if (m.stunT > 0) return;
  var L = MAP.lanes[m.lane];
  m.thinkT -= dt;
  if (m.thinkT <= 0) {
    m.thinkT = 0.3 + rnd() * 0.1;
    var best = null, bd = 1e9;
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.dead || u.team === m.team || u.team === 2 || u.invuln || !u.vis[m.team]) continue;
      var st = u.type === 'tower' || u.type === 'core';
      var d = dist(m, u) - u.r;
      if (d > (st ? m.range + 90 : 600)) continue;
      var sc = d + (u.type === 'hero' ? 160 : 0) + (st ? 250 : 0);
      if (sc < bd) { bd = sc; best = u; }
    }
    m.target = best;
    m.offLane = MAP.laneProj(L, m.x, m.y);
    if (best && m.offLane.d > 430 && best.type === 'hero') m.target = null;
  }
  var t = m.target;
  if (t && !t.dead && !t.invuln) {
    if (inRange(m, t)) tryAttack(m, t); else stepTo(m, t.x, t.y, dt);
    return;
  }
  var pr = m.offLane || MAP.laneProj(L, m.x, m.y), g = MAP.laneAt(L, pr.s + m.dir * 280);
  stepTo(m, g.x - g.uy * m.off * 0.5, g.y + g.ux * m.off * 0.5, dt);
  if (m.offLane) m.offLane.s += m.dir * m.ms * dt;
}

/* ───────── 포탑 ───────── */
function updTower(t, dt) {
  t.thinkT -= dt;
  if (t.thinkT <= 0) {
    t.thinkT = 0.25;
    var tg = t.target, press = false, bestM = null, bm = 1e9, bestH = null, bh = 1e9, agg = null;
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.dead || u.team === t.team || u.team === 2) continue;
      var d = dist(t, u) - u.r;
      if (u.type === 'minion' && d < 950) press = true;
      if (d > t.range || (u.stealth && d > 300)) continue;
      if (u.type === 'minion') { if (d < bm) { bm = d; bestM = u; } }
      else if (u.type === 'hero') {
        if (d < bh) { bh = d; bestH = u; }
        if (G.t - u.aggroT < 2 && u.aggroVictim && u.aggroVictim.team === t.team && !u.aggroVictim.dead) agg = u;
      }
    }
    t.pressured = press;
    if (tg && (tg.dead || dist(t, tg) - tg.r > t.range || (tg.stealth && dist(t, tg) > 300))) tg = null;
    if (agg && (!tg || tg.type !== 'hero')) tg = agg;
    if (!tg) tg = bestM || bestH;
    if (tg !== t.target) { t.target = tg; t.ramp = 0; }
  }
  if (t.type === 'core') return;
  var x = t.target;
  if (x && !x.dead && t.atkCd <= 0) {
    t.atkCd = 1 / t.as;
    G.proj.push({ homing: true, x: t.x, y: t.y - 60, target: x, speed: 1500, dmg: t.ad * (1 + (x.type === 'hero' ? 0.3 * t.ramp : 0)), src: t, team: t.team, color: t.team ? '#ff8c7a' : '#7fe6dc', big: true });
    if (x.type === 'hero') t.ramp = Math.min(4, t.ramp + 1);
  }
}

/* ───────── 정글 ───────── */
function spawnCamp(c) {
  var list = c.boss ? [c.type] : CAMP_TYPES[c.type], min = G.t / 60, sc = 1 + 0.03 * min;
  c.units = []; c.alive = list.length; c.target = null;
  list.forEach(function (k, i) {
    var d = MONSTER[k], a = i * 2.2 + 0.6, rr = list.length > 1 ? 85 : 0;
    var m = mkUnit('monster', 2, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, {
      r: d.r, maxHp: Math.round(d.hp * sc), bAd: d.ad * sc, bAs: d.as, bMs: 310, range: d.range, bArmor: d.armor || 0, ranged: !!d.ranged,
      mtype: k, camp: c, boss: d.boss || null, gold: d.gold, xp: d.xp, name: d.name, sight: 0
    });
    m.hx = m.x; m.hy = m.y;
    c.units.push(m);
  });
  if (c.boss) ev('bossSpawn', { boss: c.type });
}
function updMonster(m, dt) {
  var c = m.camp, t = c.target;
  if (t && (t.dead || Math.hypot(t.x - c.x, t.y - c.y) > 800 || t.stealth)) { c.target = null; t = null; }
  if (m.stunT > 0) return;
  if (t) { if (inRange(m, t)) tryAttack(m, t); else stepTo(m, t.x, t.y, dt); }
  else {
    if (Math.hypot(m.x - m.hx, m.y - m.hy) > 12) stepTo(m, m.hx, m.hy, dt);
    if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.12 * dt);
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
        if (d <= st + t.r * 0.6) { damage(p.src, t, p.dmg, 'basic'); fx({ type: 'spark', x: t.x, y: t.y, r: p.big ? 50 : 26, dur: 0.18, color: p.color }); rm = true; }
        else { p.x += dx / d * st; p.y += dy / d * st; }
      }
    } else {
      var step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.left -= step;
      for (var j = 0; j < G.units.length && !rm; j++) {
        var u = G.units[j];
        if (!hittable(u, p.team) || p.hit.has(u.id)) continue;
        if (p.sk.heroOnly && u.type !== 'hero') continue;
        if (u.stealth && !u.vis[p.team] && false) continue;
        if (Math.hypot(u.x - p.x, u.y - p.y) > p.w / 2 + u.r) continue;
        p.hit.add(u.id);
        if (p.sk.aoe) { burst(p); rm = true; }
        else { applyHit(p.src, u, p.sk, p.rk, p.dmg); fx({ type: 'spark', x: u.x, y: u.y, r: 40, dur: 0.2, color: p.color }); if (!p.sk.pierce) rm = true; }
      }
      if (!rm && p.left <= 0) { if (p.sk.endBurst) burst(p); rm = true; }
    }
    if (rm) G.proj.splice(i, 1);
  }
}
function burst(p) {
  hitCircle(p.src, p.x, p.y, p.sk.aoe, p.sk, p.rk, p.dmg, null);
  fx({ type: 'ring', x: p.x, y: p.y, r: p.sk.aoe, dur: 0.35, color: p.color, fill: true });
}
function zoneHit(z) {
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || Math.hypot(u.x - z.x, u.y - z.y) > z.r + u.r * 0.5) continue;
    if (u.team === z.team) { if (z.heal && u.type === 'hero') healUnit(u, z.heal); }
    else if (hittable(u, z.team) && (z.dmg > 0 || z.sk.slow || z.sk.root)) applyHit(z.src, u, z.sk, z.rk, z.dmg);
  }
}
function updZones(dt) {
  for (var i = G.zones.length - 1; i >= 0; i--) {
    var z = G.zones[i];
    if (z.delay > 0) {
      z.delay -= dt;
      if (z.delay > 0) continue;
      if (!z.dur) { zoneHit(z); fx({ type: 'ring', x: z.x, y: z.y, r: z.r, dur: 0.4, color: z.color, fill: true }); G.zones.splice(i, 1); continue; }
    } else if (!z.dur && z.t0 === 0 && !z.fired) {
      zoneHit(z); fx({ type: 'ring', x: z.x, y: z.y, r: z.r, dur: 0.4, color: z.color, fill: true }); G.zones.splice(i, 1); continue;
    }
    z.tickT -= dt;
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
      if (v.stealth && d2 > (s.type === 'tower' ? 640000 : 78400)) continue;
      v.vis[T] = true;
    }
  }
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

/* ───────── 팀 단위 판단 (3초마다) ───────── */
function strategy() {
  var lv = [0, 0];
  G.heroes.forEach(function (h) { lv[h.team] += h.level; });
  for (var B = 0; B < 2; B++) {
    var gap = lv[1 - B] - lv[B], kg = G.kills[1 - B] - G.kills[B];
    G.behind[B] = (kg >= 6 && gap >= 4) || gap >= 7;
  }
  for (var T = 0; T < 2; T++) {
    /* 공격받는 건물 방어 */
    var structs = G.towers.concat([G.cores[T]]);
    structs.forEach(function (s) {
      if (s.dead || s.team !== T || G.t - s.lastDmgT > 4) return;
      var need = s.type === 'core' ? 4 : s.tier === 3 ? 3 : s.tier === 2 ? 2 : 1;
      var bots = G.heroes.filter(function (h) { return h.team === T && h.ai && !h.dead && h.ai.mode !== 'retreat'; });
      bots.sort(function (a, b) { return dist(a, s) - dist(b, s); });
      for (var i = 0; i < bots.length && i < need; i++) {
        if (dist(bots[i], s) > 5200) break;
        bots[i].ai.defend = s; bots[i].ai.defendT = G.t + 9;
      }
    });
    /* 집중 공격 대상: 체력이 낮고 몸이 약하고 아군이 가까이 있는 적 영웅 */
    var fb = null, fs = -1e9, cx = 0, cy = 0, cn = 0;
    G.heroes.forEach(function (a) { if (a.team === T && !a.dead) { cx += a.x; cy += a.y; cn++; } });
    if (cn) {
      cx /= cn; cy /= cn;
      G.heroes.forEach(function (e) {
        if (e.team === T || e.dead || !e.vis[T]) return;
        var d = Math.hypot(e.x - cx, e.y - cy); if (d > 2600) return;
        var near = 0; G.heroes.forEach(function (a) { if (a.team === T && !a.dead && dist(a, e) < 1500) near++; });
        var sc = (1 - e.hp / e.maxHp) * 800 + (e.armor < 35 ? 150 : 0) - e.hp * 0.15 + near * 140 - d * 0.1;
        if (sc > fs) { fs = sc; fb = e; }
      });
    }
    G.focus[T] = fb ? fb.id : 0;
    /* 보스: 셋 이상이 건강하게 가까이 있으면 함께 잡으러 간다 */
    G.bossPlan[T] = null;
    if (G.t > 330 && cn && !G.behind[T]) {
      var boss = null, bd = 1e9;
      G.camps.forEach(function (cp) { if (cp.boss && cp.alive > 0) { var d2 = Math.hypot(cp.x - cx, cp.y - cy); if (d2 < bd) { bd = d2; boss = cp; } } });
      if (boss) {
        var sq = G.heroes.filter(function (a) { return a.team === T && !a.dead && a.ai && a.ai.mode !== 'retreat' && a.hp / a.maxHp > 0.6 && Math.hypot(a.x - boss.x, a.y - boss.y) < 4800; });
        if (sq.length >= 3) G.bossPlan[T] = boss;
      }
    }
    /* 중반부터 한 공격로로 뭉친다 */
    if (G.t > 540) {
      var best = null, bn = 9;
      ['mid', 'top', 'bot'].forEach(function (ln) {
        var n = 0; G.towers.forEach(function (t) { if (!t.dead && (G.behind[T] ? t.team === T : t.team !== T) && t.lane === ln) n++; });
        if (n < bn) { bn = n; best = ln; }
      });
      if (G.groupLane[T] !== best && (!G.groupLane[T] || G.t - (G.groupSet || 0) > 45)) { G.groupLane[T] = best; G.groupSet = G.t; }
    }
  }
  /* 플레이어가 선 공격로를 비워 두지 않도록 아군 봇 재배치 */
  var p = G.player;
  if (p && !p.dead && dist(p, MAP.FOUNT[0]) > 2200) {
    var bl = null, bd = 480;
    LANES.forEach(function (ln) { var d = MAP.laneProj(MAP.lanes[ln], p.x, p.y).d; if (d < bd) { bd = d; bl = ln; } });
    if (bl) {
      if (bl === G.plCand) G.plCandT += 3; else { G.plCand = bl; G.plCandT = 0; }
      if (G.plCandT >= 18 && bl !== G.playerLane) {
        G.playerLane = bl;
        var want = bl === 'mid' ? ['top', 'bot', 'bot'] : bl === 'top' ? ['mid', 'bot', 'bot'] : ['top', 'mid', 'bot'];
        var k = 0;
        G.heroes.forEach(function (h) { if (h.team === 0 && h.ai && h.ai.role !== 'jungle') h.ai.lane = want[k++] || 'mid'; });
      }
    }
  }
}

/* ───────── 한 틱 ───────── */
function tick(dt) {
  if (G.over) { ageFx(dt); return; }
  G.t += dt;
  G.waveT -= dt; if (G.waveT <= 0) { G.waveT += 30; spawnWave(); }
  for (var c = 0; c < G.camps.length; c++) { var cp = G.camps[c]; if (cp.alive <= 0) { cp.respawnT -= dt; if (cp.respawnT <= 0) spawnCamp(cp); } }
  G.visT -= dt; if (G.visT <= 0) { G.visT = 0.15; updVision(); }
  G.stratT -= dt; if (G.stratT <= 0) { G.stratT = 3; strategy(); }
  var us = G.units, n = us.length;
  for (var i = 0; i < n; i++) {
    var u = us[i];
    if (u.dead && u.type !== 'hero') continue;
    u.px = u.x; u.py = u.y;
    if (!u.dead) { updStatus(u, dt); u.atkCd -= dt; }
    switch (u.type) {
      case 'hero': if (u.ai) aiUpdate(u, dt); updHero(u, dt); break;
      case 'minion': updMinion(u, dt); break;
      case 'monster': updMonster(u, dt); break;
      case 'tower': case 'core': updTower(u, dt); break;
    }
    if (G.over) break;
  }
  separate();
  for (i = 0; i < us.length; i++) { var w = us[i]; w.vx = (w.x - w.px) / dt; w.vy = (w.y - w.py) / dt; }
  updProj(dt); updZones(dt); ageFx(dt);
  var alive = [];
  for (i = 0; i < G.units.length; i++) { var q = G.units[i]; if (!q.dead || q.type === 'hero') alive.push(q); }
  G.units = alive;
  if (G.towers.some(function (t) { return t.dead; })) G.towers = G.towers.filter(function (t) { return !t.dead; });
}
function ageFx(dt) {
  var i;
  for (i = G.fx.length - 1; i >= 0; i--) { var f = G.fx[i]; f.t += dt; if (f.t >= f.dur) G.fx.splice(i, 1); }
  for (i = G.texts.length - 1; i >= 0; i--) { var x = G.texts[i]; x.t += dt; x.y -= 60 * dt; if (x.t >= 0.9) G.texts.splice(i, 1); }
}
