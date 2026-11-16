'use strict';
/* 로드스타 — 봇 AI (라운드 섬멸전)
   부활이 없으므로 혼자 죽지 않는 것이 먼저다. 팀이 뭉쳐 전장 안쪽으로 움직이고,
   수적으로 밀리면 아군 쪽으로 물러나며, 줄어드는 전장 밖으로는 나가지 않는다.
   싸울 때는 집중 공격, 스킬 피하기, 거리 유지를 하고, 라운드 사이에는 직업에 맞는 강화를 고른다. */

function aiInit(h, role) {
  h.ai = { role: role, think: rnd() * 0.3, heal: false, off: rnd() * 6.28, dodgeUntil: 0, sT: 0, lx: h.x, ly: h.y };
}
function aiPow(u) { return u.hp * (1 + 0.09 * u.level) + (u.shield || 0) + 150; }
function aiReact(h) { return h.team === 1 && G.player ? DIFFS[G.diff].react : 0.6; }
function aiGo(h, x, y) {
  var o = h.order;
  if (o && o.type === 'move' && Math.hypot(o.x - x, o.y - y) < 130 && h.path && h.path.length) return;
  if (Math.hypot(h.x - x, h.y - y) < 40) { h.order = null; return; }
  cmdMove(h, x, y);
}
function aiGoWalk(h, x, y) { var q = MAP.nearestWalk(x, y); aiGo(h, q[0], q[1]); }
/* 전장 밖(또는 곧 밖이 될 가장자리)인지 */
function aiDanger(x, y) { return Math.hypot(x - G.zone.x, y - G.zone.y) > G.zone.r - 60; }
/* 직업에 맞는 강화를 우선 고른다 */
function aiPickAug(h) {
  var pref = AUG_PREF[h.def.cls] || [], best = 0, bs = -1;
  for (var i = 0; i < h.offer.length; i++) { var r = pref.indexOf(h.offer[i]), sc = (r >= 0 ? 6 - r : 0) + rnd() * 3; if (sc > bs) { bs = sc; best = i; } }
  pickAug(h, best);
}

function aiUpdate(h, dt) {
  var s = h.ai;
  if (G.phase === 'pick') { if (h.offer && G.phaseT < PICK_T - 1 - h.slot * 0.2) aiPickAug(h); return; }
  if (h.dead || G.phase !== 'fight') return;
  s.think -= dt;
  if (s.think > 0) return;
  var step = (0.2 + rnd() * 0.1) * (h.team === 1 && G.player ? DIFFS[G.diff].think : 1);
  s.think = step;
  if (h.dash || h.stunT > 0) return;
  aiUnstick(h, step);
  if (aiDodge(h)) return;
  aiDecide(h);
}

/* 길이 막혀 제자리에서 맴돌면 근처 다른 곳으로 빠져나온다 */
function aiUnstick(h, step) {
  var s = h.ai;
  s.sT += step;
  if (s.sT < 2.6) return;
  var o = h.order, moved = Math.hypot(h.x - s.lx, h.y - s.ly);
  if (o && moved < 30 && h.rootT <= 0 && !(o.type === 'attack' && inRange(h, o.target))) {
    var q = MAP.nearestWalk(h.x + (rnd() - 0.5) * 500, h.y + (rnd() - 0.5) * 500);
    h.path = null; cmdMove(h, q[0], q[1]);
  }
  s.lx = h.x; s.ly = h.y; s.sT = 0;
}

/* 날아오는 직선 스킬과 곧 터질 지역 스킬을 보고 옆으로 비킨다. 난이도마다 알아채는 확률이 다르다 */
function aiDodge(h) {
  var s = h.ai, T = h.team, react = aiReact(h), i, p;
  if (G.t < s.dodgeUntil) return true;
  for (i = 0; i < G.proj.length; i++) {
    p = G.proj[i];
    if (p.homing || p.team === T) continue;
    var sp = Math.hypot(p.vx, p.vy); if (sp < 1) continue;
    var dx = h.x - p.x, dy = h.y - p.y, along = (dx * p.vx + dy * p.vy) / sp;
    if (along < 0 || along > Math.min(p.left, 1100) || along / sp > 0.75) continue;
    var perp = (dx * p.vy - dy * p.vx) / sp;
    if (Math.abs(perp) > p.w / 2 + h.r + 25) continue;
    p.seen = p.seen || {};
    if (p.seen[h.id] === undefined) p.seen[h.id] = rnd() < react;
    if (!p.seen[h.id]) continue;
    var nx = p.vy / sp, ny = -p.vx / sp, side = perp === 0 ? (rnd() < 0.5 ? 1 : -1) : (perp > 0 ? 1 : -1), dd = p.w / 2 + h.r + 110;
    for (var t = 0; t < 2; t++) {
      var tx = h.x + nx * side * dd, ty = h.y + ny * side * dd;
      if (MAP.isWalk(tx, ty) && !aiDanger(tx, ty)) { cmdMove(h, tx, ty); s.dodgeUntil = G.t + 0.4; return true; }
      side = -side;
    }
  }
  for (i = 0; i < G.zones.length; i++) {
    var z = G.zones[i];
    if (z.team === T || !(z.delay > 0 || z.dur > 0) || !(z.dmg > 0 || z.sk.stun || z.sk.root)) continue;
    var d = dist(h, z); if (d > z.r + h.r * 0.5 + 10) continue;
    z.seen = z.seen || {};
    if (z.seen[h.id] === undefined) z.seen[h.id] = rnd() < react;
    if (!z.seen[h.id]) continue;
    var ux = d > 1 ? (h.x - z.x) / d : 1, uy = d > 1 ? (h.y - z.y) / d : 0, ex = z.x + ux * (z.r + 130), ey = z.y + uy * (z.r + 130);
    if (!MAP.isWalk(ex, ey)) { ex = z.x - ux * (z.r + 130); ey = z.y - uy * (z.r + 130); }
    if (MAP.isWalk(ex, ey)) { cmdMove(h, ex, ey); s.dodgeUntil = G.t + Math.min(0.55, z.delay > 0 ? z.delay + 0.1 : 0.45); return true; }
  }
  return false;
}

/* 원거리 영웅이 공격 주기 사이에 적에게서 멀어진다 */
function aiKite(h, from) {
  var dx = h.x - from.x, dy = h.y - from.y, a0 = Math.atan2(dy, dx), offs = [0, 0.7, -0.7, 1.4, -1.4];
  for (var i = 0; i < offs.length; i++) {
    var a = a0 + offs[i], px = h.x + Math.cos(a) * 260, py = h.y + Math.sin(a) * 260;
    if (MAP.isWalk(px, py) && !aiDanger(px, py)) { cmdMove(h, px, py); return true; }
  }
  return false;
}

/* 직선 스킬이 다른 적에게 먼저 맞아 버리는지 */
function aiBlocked(h, t, sk) {
  if (sk.pierce) return false;
  var dx = t.x - h.x, dy = t.y - h.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || u === t || u.team === h.team) continue;
    var ox = u.x - h.x, oy = u.y - h.y, along = ox * ux + oy * uy;
    if (along < 0 || along > d) continue;
    if (Math.abs(ox * uy - oy * ux) < sk.width / 2 + u.r * 0.6) return true;
  }
  return false;
}

/* 다쳤을 때 갈 회복 구슬: 전장 안에 있고, 적보다 내가 가까운 것 */
function aiPack(h, foes) {
  var best = null, bd = 1500;
  for (var i = 0; i < G.packs.length; i++) {
    var p = G.packs[i]; if (!p.ready || aiDanger(p.x, p.y)) continue;
    var d = dist(h, p), blocked = false;
    for (var k = 0; k < foes.length; k++) if (dist(foes[k], p) < d * 0.8) blocked = true;
    if (!blocked && d < bd) { bd = d; best = p; }
  }
  return best;
}

function aiDecide(h) {
  var s = h.ai, T = h.team, Z = G.zone;
  var hpP = h.hp / h.maxHp;
  var foes = [], pals = [], i, u, d, cx = h.x, cy = h.y, cn = 1;
  for (i = 0; i < G.heroes.length; i++) {
    u = G.heroes[i];
    if (u.dead || u === h) continue;
    if (u.team === T) { cx += u.x; cy += u.y; cn++; }
    d = dist(h, u);
    if (d > 1600) continue;
    if (u.team === T) pals.push(u); else if (u.vis[T]) foes.push(u);
  }
  cx /= cn; cy /= cn;
  var myPow = aiPow(h), palPow = 0, foePow = 0, nearFoe = null, nd = 1e9;
  for (i = 0; i < pals.length; i++) if (dist(h, pals[i]) < 1100) palPow += aiPow(pals[i]);
  for (i = 0; i < foes.length; i++) { d = dist(h, foes[i]); if (d < 1300) foePow += aiPow(foes[i]); if (d < nd) { nd = d; nearFoe = foes[i]; } }

  aiSupport(h, pals, foes, hpP);

  /* 1. 전장 밖이거나 가장자리면 안으로 */
  var dz = dist(h, Z), ux = dz > 1 ? (Z.x - h.x) / dz : 0, uy = dz > 1 ? (Z.y - h.y) / dz : 0;
  if (dz > Z.r - 150) {
    if (dz > Z.r - 30) aiEscape(h, Z);
    if (dz > Z.r - 30 || !nearFoe || nd > 500) { aiGoWalk(h, h.x + ux * 500, h.y + uy * 500); return; }
  }

  /* 2. 다쳤으면 회복 구슬 */
  if (hpP < 0.4) {
    var pk = aiPack(h, foes);
    if (pk) { if (nearFoe && nd < 600) aiEscape(h, pk); aiGo(h, pk.x, pk.y); return; }
  }

  /* 3. 교전: 집중 공격 대상과 고립된 적 우선 */
  if (foes.length) {
    var tgt = null, bs = 1e9, focus = G.focus[T];
    for (i = 0; i < foes.length; i++) {
      d = dist(h, foes[i]); if (d > 1500) continue;
      var alone = true;
      for (var k = 0; k < foes.length; k++) if (k !== i && dist(foes[i], foes[k]) < 800) alone = false;
      var sc = foes[i].hp + d * 0.6 - (foes[i].id === focus ? 300 : 0) - (alone ? 150 : 0);
      if (sc < bs) { bs = sc; tgt = foes[i]; }
    }
    if (tgt) {
      var td = dist(h, tgt), tp = tgt.hp / tgt.maxHp;
      var adv = myPow + palPow >= foePow * 0.9 || tp < 0.3 || Z.r < 900;
      if (adv && !aiDanger(tgt.x, tgt.y)) {
        aiSkills(h, tgt, td, true, foes.length);
        if (!h.dash) {
          if (!h.def.melee && h.atkCd > 0.15 && td < h.range * 0.85 && nd < 520 && aiKite(h, nearFoe || tgt)) return;
          if (!h.order || h.order.target !== tgt) cmdAttack(h, tgt);
        }
        return;
      }
      aiSkills(h, tgt, td, false, foes.length);
      if (td < 900 && cn > 1) {
        /* 밀리면 아군 쪽으로 물러난다 */
        if (td < 500) aiEscape(h, { x: cx, y: cy });
        aiGoWalk(h, cx + (cx - tgt.x) * 0.25, cy + (cy - tgt.y) * 0.25);
        return;
      }
    }
  }

  /* 4. 뭉쳐서 전장 한가운데로: 무리에서 떨어졌으면 먼저 합류한다 */
  if (cn > 1 && Math.hypot(h.x - cx, h.y - cy) > 750) { aiGoWalk(h, cx, cy); return; }
  var a = s.off + h.slot * 1.26, rr = Math.min(260, Z.r * 0.3);
  aiGoWalk(h, Z.x + Math.cos(a) * rr - (T ? -1 : 1) * Math.min(500, Z.r * 0.25), Z.y + Math.sin(a) * rr);
}

/* 도주기 */
function aiEscape(h, to) {
  for (var i = 0; i < 4; i++) {
    var sk = h.def.skills[i];
    if (!canCast(h, i)) continue;
    if (sk.ai === 'gap' || sk.ai === 'stealth' || sk.ai === 'haste' || (sk.ai === 'shield' && h.hp / h.maxHp < 0.6)) {
      var p = h.path && h.path.length ? h.path[0] : [to.x, to.y];
      var dx = p[0] - h.x, dy = p[1] - h.y, d = Math.hypot(dx, dy) || 1;
      castSkill(h, i, h.x + dx / d * 600, h.y + dy / d * 600);
      return;
    }
  }
}

/* 치유·가속처럼 아군에게 쓰는 스킬 */
function aiSupport(h, pals, foes, hpP) {
  for (var i = 0; i < 4; i++) {
    var sk = h.def.skills[i];
    if (!canCast(h, i)) continue;
    if (sk.ai === 'heal') {
      var best = hpP < 0.6 ? h : null, bp = hpP;
      for (var k = 0; k < pals.length; k++) { var a = pals[k], p = a.hp / a.maxHp; if (p < 0.6 && p < bp && dist(h, a) < sk.range + sk.radius * 0.5) { bp = p; best = a; } }
      if (best) { castSkill(h, i, best.x, best.y); return; }
    } else if (sk.ai === 'sanct') {
      var n = hpP < 0.55 ? 1 : 0, low = hpP < 0.5, sx = h.x, sy = h.y, c = 1;
      for (var j = 0; j < pals.length; j++) { var b = pals[j]; if (dist(h, b) < 600) { n++; sx += b.x; sy += b.y; c++; if (b.hp / b.maxHp < 0.5) low = true; } }
      if (n >= 2 && low && foes.length) { castSkill(h, i, sx / c, sy / c); return; }
    } else if (sk.ai === 'shield') {
      if (hpP < 0.75 && G.t - h.lastDmgT < 1 && foes.length) { castSkill(h, i, h.x, h.y); return; }
    } else if (sk.ai === 'haste') {
      var fighters = 0; for (var f = 0; f < pals.length; f++) if (dist(h, pals[f]) < sk.allyR && G.t - pals[f].aggroT < 1.5) fighters++;
      if (fighters >= 1 && foes.length) { castSkill(h, i, h.x, h.y); return; }
    }
  }
}

/* 적 영웅을 상대로 한 스킬 사용. allIn 이면 전력으로, 아니면 견제만 */
function aiSkills(h, t, d, allIn, nFoes) {
  var lead = h.team === 1 && G.player ? DIFFS[G.diff].lead : 0.8;
  var tp = t.hp / t.maxHp;
  for (var i = 3; i >= 0; i--) {
    var sk = h.def.skills[i];
    if (!canCast(h, i)) continue;
    var ult = i === 3, ax = t.x, ay = t.y, tt;
    if (ult && !(allIn && (tp < 0.75 || nFoes >= 2))) continue;
    switch (sk.ai) {
      case 'dmg':
        if (sk.kind === 'shot') {
          if (d > sk.range * 0.9) continue;
          tt = d / sk.speed; ax += t.vx * tt * lead; ay += t.vy * tt * lead;
          if (aiBlocked(h, { x: ax, y: ay, r: t.r }, sk)) continue;
        } else if (sk.kind === 'area') {
          if (d > sk.range + sk.radius * 0.4) continue;
          tt = (sk.delay || 0) * 0.8; ax += t.vx * tt * lead; ay += t.vy * tt * lead;
        } else if (sk.kind === 'nova') { if (d > sk.radius * 0.85) continue; }
        castSkill(h, i, ax, ay); return;
      case 'engage':
        if (!allIn) continue;
        if (d < h.range + 60 && !ult) continue;
        if (d > sk.range + (sk.landRadius || sk.hitRadius || 0) * 0.6) continue;
        if (ult && sk.exec && tp > 0.6) continue;
        castSkill(h, i, t.x + t.vx * 0.15, t.y + t.vy * 0.15); return;
      case 'gap':
        if (!allIn || !h.def.melee) continue;
        if (d < h.range + 120 || d > sk.range + h.range) continue;
        castSkill(h, i, t.x, t.y); return;
      case 'buff':
        if (!allIn || d > h.range + 200) continue;
        castSkill(h, i, t.x, t.y); return;
      case 'stealth':
        if (!allIn || d > 900 || d < h.range + 40) continue;
        castSkill(h, i, t.x, t.y); return;
      case 'haste':
        continue;
    }
  }
}
