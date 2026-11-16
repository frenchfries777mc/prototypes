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

/* 라운드 섬멸전: 부활 없음, 5라운드 선취. 영웅은 처음부터 완성된 상태(레벨 7 능력치, 스킬 3·3·3·2랭크) */
var WIN_ROUNDS = 5, ROUND_TIME = 100, PREP_T = 4, PICK_T = 10, FIXED_LEVEL = 7, SKILL_RANKS = [3, 3, 3, 2], ULT_PASSIVE = 1.1;
/* 전장: 반지름 3000 에서 시작해 12초부터 80초까지 650 으로, 그 뒤 100초까지 260 으로 줄어든다. 밖에 있으면 초당 최대 체력의 7% 피해 */
var HP_SCALE = 1.3; /* 부활이 없으니 교전이 순식간에 끝나지 않게 체력을 올린다 */
var ZONE_R0 = 3000, ZONE_R1 = 650, ZONE_R2 = 260, ZONE_DPS = 0.07;
var ARENAS = [[5000, 3200], [5000, 800], [5000, 5600], [3700, 3200], [6300, 3200]];

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
  h.maxHp = (b.hp + g.hp * L + it.hp) * HP_SCALE;
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
  /* 강화 */
  var A = { hpPct: 0, adPct: 0, skillPct: 0, msPct: 0, asPct: 0, armor: 0, ls: 0, haste: 0, ultPct: 0, exec: 0, lastStand: 0, regenPct: 0, openShield: 0, killHeal: 0, giant: 0 };
  for (var id in h.augs) { var ag = AUGS[id], n = h.augs[id]; for (var k in A) if (ag[k]) A[k] += ag[k] * n; }
  h.maxHp *= 1 + A.hpPct; h.bAd *= 1 + A.adPct; h.bMs *= 1 + A.msPct; h.bAs *= 1 + A.asPct; h.bArmor += A.armor; h.bLs += A.ls; h.haste += A.haste;
  h.skillMul = 1 + A.skillPct; h.ultMul = 1 + A.ultPct; h.exec = A.exec; h.lastStand = A.lastStand; h.regenPct = A.regenPct; h.openShield = A.openShield; h.killHeal = A.killHeal; h.giant = A.giant;
  if (oh > 1) { h.hp += h.maxHp - oh; h.mp += h.maxMp - om; }
}

function mkHero(defId, team, isPlayer, slot, role) {
  var d = HEROES[defId], sp = spawnPos(team, slot);
  var h = mkUnit('hero', team, sp.x, sp.y, {
    r: 42, def: d, defId: defId, name: d.name, isPlayer: isPlayer, slot: slot, role: role, ranged: !d.melee,
    level: FIXED_LEVEL, items: [], ranks: SKILL_RANKS.slice(), cds: [0, 0, 0, 0], points: 0, ult: 0, healed: 0, augs: {}, offer: null,
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
    t: 0, units: [], heroes: [], proj: [], zones: [], fx: [], texts: [], events: [], kills: [0, 0], score: [0, 0],
    round: 0, phase: 'prep', phaseT: 0, roundT: ROUND_TIME, zone: { x: 5000, y: 3200, r: ZONE_R0 }, packs: [], arenaOrder: [0, 1, 2, 3, 4],
    parts: [], shake: 0, flash: null, over: null, visT: 0, stratT: 1, focus: [0, 0], player: null, diff: opt.diff === undefined ? 1 : opt.diff
  };
  for (var ao = 4; ao > 0; ao--) { var aj = (rnd() * (ao + 1)) | 0, at = G.arenaOrder[ao]; G.arenaOrder[ao] = G.arenaOrder[aj]; G.arenaOrder[aj] = at; }
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
  startRound();
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
function healUnit(u, a) {
  if (u.dead || a <= 0) return 0;
  var b = u.hp, got; u.hp = Math.min(u.maxHp, u.hp + a); got = u.hp - b;
  if (G.player && u === G.player && got >= 12) ftext(u, '+' + Math.round(got), '#7dffa0');
  return got;
}

function damage(src, tgt, amt, kind) {
  if (tgt.dead || tgt.invuln || amt <= 0) return 0;
  var a = amt;
  if (src) {
    a *= src.dmgMul || 1;
    if (kind === 'skill' && src.skillMul) a *= src.skillMul;
    if (src.exec && tgt.hp / tgt.maxHp < 0.35) a *= 1 + src.exec;
    if (src.giant && tgt.maxHp > src.maxHp) a *= 1 + src.giant;
  }
  if (tgt.lastStand && tgt.hp / tgt.maxHp < 0.3) a *= 1 - tgt.lastStand;
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
      if (tgt.type === 'hero') { tgt.hitBy[src.id] = G.t; src.aggroT = G.t; src.aggroVictim = tgt; src.dmgDealt += dealt; src.ult = Math.min(100, src.ult + dealt / 50 * (src.ultMul || 1)); }
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
  v.buffs.length = 0; v.order = null; v.path = null; v.dash = null; v.stunT = 0; v.rootT = 0; v.empower = 0;
  var killer = src && src.type === 'hero' ? src : null, ass = [], recent = null, rt = -1;
  G.heroes.forEach(function (h) {
    if (h.team === v.team) return;
    var t = v.hitBy[h.id];
    if (t !== undefined && G.t - t < 10) { ass.push(h); if (t > rt) { rt = t; recent = h; } }
  });
  if (!killer) killer = recent;
  G.kills[1 - v.team]++;
  if (killer) { killer.kills++; killer.ult = Math.min(100, killer.ult + 15); if (ass.indexOf(killer) < 0) ass.push(killer); }
  ass.forEach(function (a) {
    if (a !== killer) { a.assists++; a.ult = Math.min(100, a.ult + 8); }
    if (a.killHeal && !a.dead) healUnit(a, a.maxHp * a.killHeal);
  });
  v.hitBy = {};
  fx({ type: 'burst', x: v.x, y: v.y, r: 260, dur: 0.7, color: v.color });
  fx({ type: 'shock', x: v.x, y: v.y, r: 460, dur: 0.6, color: v.color, w: 16 });
  sparks(v.x, v.y - 40, 38, 560, v.color, 12, 1.0, { g: 380, glow: true }); sparks(v.x, v.y - 40, 16, 420, '#ffffff', 8, 0.7, { g: 300, glow: true });
  if (nearP(v.x, v.y, 1500)) shake(10);
  ev('kill', { killer: killer ? killer.id : 0, victim: v.id, by: src ? src.type : '' });
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
  if (h.dead) return;
  if (Math.hypot(h.vx || 0, h.vy || 0) > 120 && Math.random() < dt * 8) part(h.x - Math.cos(h.face) * 14, h.y + h.r * 0.7, (Math.random() - 0.5) * 60, -20 - Math.random() * 30, 0.5, 9, 'rgba(210,200,180,0.55)', { dust: true, drag: 0.9 });
  for (var i = 0; i < 4; i++) if (h.cds[i] > 0) h.cds[i] -= dt;
  h.ult = Math.min(100, h.ult + ULT_PASSIVE * (h.ultMul || 1) * dt);
  var reg = h.hpr + (h.regenB || 0) + h.maxHp * (h.regenPct || 0);
  if (h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + reg * dt);
  if (h.mp < h.maxMp) h.mp = Math.min(h.maxMp, h.mp + h.mpr * dt);
  if (dist(h, G.zone) > G.zone.r) { damage(null, h, h.maxHp * ZONE_DPS * dt, 'true'); if (h.dead) return; }
  if (h.dash) { updDash(h, dt); return; }
  if (h.stunT > 0) return;
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

/* ───────── 라운드 ───────── */
function finish(w) { if (G.over) return; G.over = { winner: w, t: G.t }; ev('over', { winner: w }); }
function aliveCount(T) { var n = 0; for (var i = 0; i < G.heroes.length; i++) if (G.heroes[i].team === T && !G.heroes[i].dead) n++; return n; }
function startRound() {
  G.round++;
  var a = ARENAS[G.arenaOrder[(G.round - 1) % ARENAS.length]];
  G.zone = { x: a[0], y: a[1], r: ZONE_R0 };
  G.phase = 'prep'; G.phaseT = PREP_T; G.roundT = ROUND_TIME; G.proj.length = 0; G.zones.length = 0;
  G.packs = [0, -900, 900].map(function (dx, i) { var q = MAP.nearestWalk(a[0] + dx, a[1]); return { i: i, x: q[0], y: q[1], ready: true }; });
  G.heroes.forEach(function (h) {
    if (h.offer) pickAug(h, 0);
    /* 길 폭(±240) 안에 두 줄로 세운다 */
    var q = MAP.nearestWalk(a[0] + (h.team ? 1 : -1) * (1900 + (h.slot % 2) * 130), a[1] + (h.slot - 2) * 85);
    h.dead = false; h.x = h.px = q[0]; h.y = h.py = q[1]; h.vx = h.vy = 0; h.hp = h.maxHp; h.buffs.length = 0; h.cds = [0, 0, 0, 0];
    h.order = null; h.path = null; h.dash = null; h.stunT = 0; h.rootT = 0; h.empower = 0; h.hitBy = {}; h.lastDmgT = -99; h.face = h.team ? Math.PI : 0;
    if (h.ai) h.ai.heal = false;
  });
  updVision();
  ev('roundStart', { round: G.round });
}
function endRound(w) {
  G.score[w]++; G.lastWin = w;
  ev('round', { winner: w, round: G.round });
  if (G.score[w] >= WIN_ROUNDS) { finish(w); return; }
  G.phase = 'pick'; G.phaseT = PICK_T;
  G.heroes.forEach(function (h) { h.offer = rollAugs(h); h.order = null; h.path = null; h.dash = null; });
}
function updRound(dt) {
  if (G.phase === 'prep') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      G.phase = 'fight';
      G.heroes.forEach(function (h) { if (h.openShield) addBuff(h, { id: 'aug:guard', t: 8, shield: h.maxHp * h.openShield }); });
      ev('go');
    }
    return;
  }
  if (G.phase === 'pick') { G.phaseT -= dt; if (G.phaseT <= 0) startRound(); return; }
  G.roundT -= dt;
  var e = ROUND_TIME - G.roundT, z = G.zone;
  z.r = e < 12 ? ZONE_R0 : e < 80 ? ZONE_R0 + (ZONE_R1 - ZONE_R0) * (e - 12) / 68 : ZONE_R1 + (ZONE_R2 - ZONE_R1) * Math.min(1, (e - 80) / 20);
  var a = aliveCount(0), b = aliveCount(1);
  if (a === 0 || b === 0) { endRound(a > 0 ? 0 : b > 0 ? 1 : (rnd() < 0.5 ? 0 : 1)); return; }
  if (G.roundT <= 0) {
    /* 시간 종료: 살아남은 수, 그다음 남은 체력 합 */
    var ha = 0, hb = 0;
    G.heroes.forEach(function (h) { if (!h.dead) { if (h.team === 0) ha += h.hp / h.maxHp; else hb += h.hp / h.maxHp; } });
    endRound(a !== b ? (a > b ? 0 : 1) : (ha >= hb ? 0 : 1));
  }
}

/* ───────── 강화 ───────── */
function rollAugs(h) {
  var pool = AUG_IDS.filter(function (id) { return (h.augs[id] || 0) < AUG_MAX; }), out = [];
  while (out.length < 3 && pool.length) { var k = (rnd() * pool.length) | 0; out.push(pool[k]); pool.splice(k, 1); }
  return out;
}
function pickAug(h, idx) {
  if (!h.offer || !h.offer[idx]) return false;
  var id = h.offer[idx];
  h.augs[id] = (h.augs[id] || 0) + 1; h.offer = null; recalc(h); h.hp = h.maxHp;
  return true;
}

/* ───────── 회복 구슬 (라운드마다 세 개, 한 번씩) ───────── */
function updPacks() {
  for (var i = 0; i < G.packs.length; i++) {
    var p = G.packs[i];
    if (!p.ready) continue;
    if (Math.random() < 0.04) part(p.x + (Math.random() - 0.5) * 40, p.y - 20, 0, -50 - Math.random() * 40, 1.0, 5, '#9dffb0', { glow: true, drag: 0.98 });
    for (var k = 0; k < G.heroes.length; k++) {
      var h = G.heroes[k];
      if (h.dead || Math.hypot(h.x - p.x, h.y - p.y) > 95 || h.hp > h.maxHp * 0.97) continue;
      healUnit(h, h.maxHp * 0.4); h.ult = Math.min(100, h.ult + 15);
      p.ready = false;
      sparks(p.x, p.y - 30, 24, 420, '#9dffb0', 9, 0.9, { g: -100, glow: true }); fx({ type: 'shock', x: p.x, y: p.y, r: 220, dur: 0.5, color: '#9dffb0', w: 10 });
      ev('pack', { id: h.id, i: i });
      break;
    }
  }
}

/* ───────── 팀 단위 판단 ───────── */
function strategy() {
  for (var T = 0; T < 2; T++) {
    /* 집중 공격 대상: 약하고 가깝고 아군이 몰려 있는 적 */
    var fb = null, fs = -1e9, cx = 0, cy = 0, cn = 0;
    G.heroes.forEach(function (a) { if (a.team === T && !a.dead) { cx += a.x; cy += a.y; cn++; } });
    if (cn) {
      cx /= cn; cy /= cn;
      G.heroes.forEach(function (e) {
        if (e.team === T || e.dead || !e.vis[T]) return;
        var d = Math.hypot(e.x - cx, e.y - cy); if (d > 2800) return;
        var near = 0; G.heroes.forEach(function (a) { if (a.team === T && !a.dead && dist(a, e) < 1500) near++; });
        var sc = (1 - e.hp / e.maxHp) * 800 + (e.armor < 35 ? 150 : 0) - e.hp * 0.12 + near * 140 - d * 0.1;
        if (sc > fs) { fs = sc; fb = e; }
      });
    }
    G.focus[T] = fb ? fb.id : 0;
  }
}

/* ───────── 한 틱 ───────── */
function tick(dt) {
  if (G.over) { ageFx(dt); return; }
  G.t += dt;
  updRound(dt);
  if (G.over) return;
  G.visT -= dt; if (G.visT <= 0) { G.visT = 0.15; updVision(); }
  var us = G.units, n = us.length, i;
  if (G.phase !== 'fight') {
    /* 준비·강화 선택 중에는 영웅이 멈춘다. 봇은 이때 강화를 고른다 */
    for (i = 0; i < n; i++) { var q = us[i]; q.px = q.x; q.py = q.y; q.vx = q.vy = 0; if (q.ai) aiUpdate(q, dt); }
    ageFx(dt);
    return;
  }
  G.stratT -= dt; if (G.stratT <= 0) { G.stratT = 1.5; strategy(); }
  /* 처리 순서가 한 팀에 유리하지 않도록 틱마다 앞뒤를 바꾼다 */
  var rev = (G.tickN = (G.tickN || 0) + 1) & 1;
  for (i = 0; i < n; i++) {
    var u = us[rev ? n - 1 - i : i];
    u.px = u.x; u.py = u.y;
    if (!u.dead) { updStatus(u, dt); u.atkCd -= dt; }
    if (u.ai) aiUpdate(u, dt);
    updHero(u, dt);
    if (G.over || G.phase !== 'fight') break;
  }
  updPacks();
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
