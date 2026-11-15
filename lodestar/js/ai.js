'use strict';
/* 로드스타 — 봇 AI (노드 점령전)
   봇은 항상 가야 할 점령 지점이 있다. 지점은 팀이 3초마다 나눠 맡기고(aiAssignNodes),
   공격받는 지점은 서로 구하러 간다. 싸울 때는 집중 공격, 고립된 적 사냥, 스킬 피하기, 거리 유지,
   보스 함께 잡기를 한다. */

function aiInit(h, role) {
  h.ai = {
    role: role, node: -1, think: rnd() * 0.3, mode: 'node', defend: null, off: rnd() * 6.28,
    dodgeUntil: 0, sT: 0, lx: h.x, ly: h.y
  };
}
function aiPow(u) { return u.hp * (1 + 0.09 * u.level) + (u.shield || 0) + 150; }
function aiReact(h) { return h.team === 1 && G.player ? DIFFS[G.diff].react : 0.6; }
function aiGo(h, x, y) {
  var o = h.order;
  if (o && o.type === 'move' && Math.hypot(o.x - x, o.y - y) < 130 && h.path && h.path.length) return;
  if (Math.hypot(h.x - x, h.y - y) < 40) { h.order = null; return; }
  cmdMove(h, x, y);
}
function aiDanger(x, y, team) { var f = MAP.FOUNT[1 - team]; return Math.hypot(x - f.x, y - f.y) < 900; }

/* 레벨업으로 생긴 유물 선택: 직업에 맞는 것을 우선한다 */
function aiPickRelic(h) {
  var offer = h.relicOffer, build = BUILDS[h.def.cls] || [], best = 0, bs = -1;
  for (var i = 0; i < offer.length; i++) {
    var r = build.indexOf(offer[i]), sc = (r >= 0 ? 10 - r : 0) + rnd() * 3;
    if (sc > bs) { bs = sc; best = i; }
  }
  pickRelic(h, best);
}

/* ── 팀: 누가 어느 지점으로 갈지 나눈다 ── */
function aiNodeValue(T, n) {
  var base = n.heart ? 1.7 : 1, p = nodeProg(n, T);
  if (p >= 100) return base * (n.present[1 - T] > 0 ? 2.2 : 0.3);   /* 내 것: 적이 올 때만 급하다 */
  if (n.owner === 1 - T) return base * 2.0;                          /* 적의 것: 빼앗기 */
  if (p > 0) return base * 2.2;                                      /* 내 쪽으로 기운 지점: 마무리 */
  return base * 1.6;                                                 /* 중립 */
}
function aiAssignNodes(T) {
  var bots = G.heroes.filter(function (h) { return h.team === T && h.ai && !h.dead; });
  bots.sort(function (a, b) { return a.slot - b.slot; });
  var load = {}, carry = null;
  bots.forEach(function (h) {
    var s = h.ai;
    if (s.role === 'sup') return;
    var best = -1, bs = -1e9;
    for (var i = 0; i < G.nodes.length; i++) {
      var n = G.nodes[i], sc = aiNodeValue(T, n) - dist(h, n) / 2600;
      if (s.node === i) sc += 0.35;
      if (s.node === i && n.present[T] > 0 && nodeProg(n, T) < 100) sc += 0.8;
      var cnt = load[i] || 0; if (cnt >= 1) sc -= 1.2 * cnt;
      if (s.role === 'top' && n.lane === 'top') sc += 0.3;
      if (s.role === 'bot' && n.lane === 'bot') sc += 0.3;
      if (s.role === 'mid' && n.heart) sc += 0.4;
      if (sc > bs) { bs = sc; best = i; }
    }
    s.node = best; load[best] = (load[best] || 0) + 1;
    if (s.role === 'bot') carry = h;
  });
  /* 지원가는 원거리 딜러와 같은 지점으로 간다 */
  bots.forEach(function (h) { if (h.ai.role === 'sup') h.ai.node = carry ? carry.ai.node : (h.ai.node >= 0 ? h.ai.node : 4); });
}

function aiUpdate(h, dt) {
  var s = h.ai;
  if (h.dead) { while (h.relicPicks > 0 && h.relicOffer) aiPickRelic(h); return; }
  s.think -= dt;
  if (s.think > 0) return;
  var step = (0.2 + rnd() * 0.1) * (h.team === 1 && G.player ? DIFFS[G.diff].think : 1);
  s.think = step;
  if (h.points > 0) autoSkill(h);
  while (h.relicPicks > 0 && h.relicOffer) aiPickRelic(h);
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
  if (o && moved < 30 && h.rootT <= 0 && h.recallT <= 0 && !(o.type === 'attack' && inRange(h, o.target))) {
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
      if (MAP.isWalk(tx, ty) && !aiDanger(tx, ty, T)) { cmdMove(h, tx, ty); s.dodgeUntil = G.t + 0.4; return true; }
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
    if (MAP.isWalk(px, py) && !aiDanger(px, py, h.team)) { cmdMove(h, px, py); return true; }
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

/* 물러날 곳: 우물, 또는 적이 없는 가까운 내 지점 */
function aiSafeSpot(h) {
  var T = h.team, f = MAP.FOUNT[T], best = { x: f.x, y: f.y, node: false }, bd = dist(h, f) * 0.6;
  for (var i = 0; i < G.nodes.length; i++) {
    var n = G.nodes[i];
    if (n.owner !== T || n.present[1 - T] > 0) continue;
    var d = dist(h, n); if (d < bd) { bd = d; best = { x: n.x, y: n.y, node: true }; }
  }
  return best;
}

function aiDecide(h) {
  var s = h.ai, T = h.team, E = 1 - T;
  var hpP = h.hp / h.maxHp, mpP = h.mp / h.maxMp;
  var foes = [], pals = [], i, u, d;
  for (i = 0; i < G.units.length; i++) {
    u = G.units[i];
    if (u.dead || u === h || u.type !== 'hero') continue;
    d = dist(h, u);
    if (d > 1600) continue;
    if (u.team === T) pals.push(u); else if (u.vis[T]) foes.push(u);
  }
  var myPow = aiPow(h), palPow = 0, foePow = 0, nearFoe = null, nd = 1e9;
  for (i = 0; i < pals.length; i++) if (dist(h, pals[i]) < 1100) palPow += aiPow(pals[i]);
  for (i = 0; i < foes.length; i++) { d = dist(h, foes[i]); if (d < 1300) foePow += aiPow(foes[i]); if (d < nd) { nd = d; nearFoe = foes[i]; } }

  aiSupport(h, pals, foes, hpP);

  /* 1. 후퇴 */
  if (s.mode === 'retreat') {
    var sp = aiSafeSpot(h);
    if (dist(h, sp) < (sp.node ? 260 : 400) || inFountain(h)) {
      if (hpP > 0.85 && mpP > 0.55) s.mode = 'node';
      else if (nearFoe && nd < 900) { /* 쉴 곳까지 쫓아오면 싸운다 */ s.mode = 'node'; }
      else { h.order = null; return; }
    } else {
      if (nearFoe && nd < 750) aiEscape(h, sp);
      aiGo(h, sp.x, sp.y);
      return;
    }
  }
  if (hpP < 0.27 || (hpP < 0.42 && foePow > myPow + palPow) || (mpP < 0.08 && hpP < 0.55 && !foes.length)) {
    s.mode = 'retreat'; s.defend = null;
    var sp2 = aiSafeSpot(h); aiGo(h, sp2.x, sp2.y);
    return;
  }

  /* 2. 적 우물 근처는 피한다 */
  if (dist(h, MAP.FOUNT[E]) < 1100) { var nn = G.nodes[s.node >= 0 ? s.node : 6]; aiGo(h, nn.x, nn.y); return; }

  /* 3. 교전: 집중 공격 대상과 고립된 적을 우선한다 */
  if (foes.length) {
    var tgt = null, bs = 1e9, reach = hpP > 0.6 ? 1500 : 1150, focus = G.focus[T];
    for (i = 0; i < foes.length; i++) {
      d = dist(h, foes[i]); if (d > reach) continue;
      var alone = true;
      for (var k = 0; k < foes.length; k++) if (k !== i && dist(foes[i], foes[k]) < 800) alone = false;
      var sc = foes[i].hp + d * 0.6 - (foes[i].id === focus ? 300 : 0) - (alone ? 150 : 0);
      if (sc < bs) { bs = sc; tgt = foes[i]; }
    }
    if (tgt) {
      var td = dist(h, tgt), tp = tgt.hp / tgt.maxHp;
      var adv = myPow + palPow >= foePow * 0.85 || tp < 0.3;
      if (adv) {
        aiSkills(h, tgt, td, true, foes.length);
        if (!h.dash) {
          if (!h.def.melee && h.atkCd > 0.15 && td < h.range * 0.85 && nd < 520 && aiKite(h, nearFoe || tgt)) return;
          if (!h.order || h.order.target !== tgt) cmdAttack(h, tgt);
        }
        return;
      } else if (td < 800 && foePow > (myPow + palPow) * 1.3) {
        aiSkills(h, tgt, td, false, foes.length);
        var sp3 = aiSafeSpot(h);
        if (td < 500) aiEscape(h, sp3);
        aiGo(h, sp3.x, sp3.y);
        return;
      } else aiSkills(h, tgt, td, false, foes.length);
    }
  }

  /* 4. 목표: 보스 → 정글(초반 정글러) → 사냥 → 맡은 지점 */
  var bp = G.bossPlan[T];
  if (bp && bp.alive > 0 && hpP > 0.55 && dist(h, bp) < 4800) return aiBoss(h, bp);
  if (s.role === 'jungle' && h.level < 6 && G.t < 330 && aiJungle(h)) return;
  var prey = aiHunt(h, hpP);
  if (prey) { aiGo(h, prey.x, prey.y); return; }
  aiNode(h);
}

/* 맡은 지점으로 간다. 도착하면 지점 안을 천천히 돌며 지킨다 */
function aiNode(h) {
  var s = h.ai, n = G.nodes[s.node >= 0 ? s.node : 6];
  if (dist(h, n) > n.r * 0.55) { aiGo(h, n.x, n.y); return; }
  var a = G.t * 0.35 + s.off, px = n.x + Math.cos(a) * n.r * 0.4, py = n.y + Math.sin(a) * n.r * 0.4;
  if (!MAP.isWalk(px, py)) { px = n.x; py = n.y; }
  aiGo(h, px, py);
}

/* 혼자 떨어진 적 영웅을 찾아 덮친다 (정글러는 더 멀리까지, 다른 영웅은 가까이만) */
function aiHunt(h, hpP) {
  var T = h.team, s = h.ai;
  if (hpP < 0.65 || h.level < 3 || G.t < 120 || G.behind[T]) return null;
  var R = s.role === 'jungle' ? 3600 : 2100, best = null, bs = 1e9;
  for (var i = 0; i < G.heroes.length; i++) {
    var e = G.heroes[i];
    if (e.team === T || e.dead || !e.vis[T]) continue;
    var d = dist(h, e); if (d > R || aiDanger(e.x, e.y, T)) continue;
    var escort = 0, theirs = 0, k;
    for (k = 0; k < G.heroes.length; k++) { var o = G.heroes[k]; if (o.team === T && !o.dead && o !== h && dist(o, e) < 1500) escort++; }
    for (k = 0; k < G.heroes.length; k++) { var q = G.heroes[k]; if (q.team !== T && !q.dead && q !== e && dist(q, e) < 1100) theirs++; }
    if (theirs > escort) continue;
    var sc = e.hp / e.maxHp * 1500 + d * 0.5 - escort * 200;
    if (sc < bs) { bs = sc; best = e; }
  }
  return best;
}

/* 보스: 가까이 모여 함께 친다 */
function aiBoss(h, camp) {
  var T = h.team, m = null, md = 1e9, i;
  for (i = 0; i < camp.units.length; i++) { var u = camp.units[i]; if (!u.dead) { var d = dist(h, u); if (d < md) { md = d; m = u; } } }
  if (!m) return;
  if (md > 650) {
    var f = MAP.FOUNT[T], dx = f.x - camp.x, dy = f.y - camp.y, l = Math.hypot(dx, dy) || 1;
    var q = MAP.nearestWalk(camp.x + dx / l * 420 + (rnd() - 0.5) * 160, camp.y + dy / l * 420);
    aiGo(h, q[0], q[1]);
    return;
  }
  if (h.mp / h.maxMp > 0.3) aiFarmSkill(h, m.x, m.y, [m]);
  if (!h.order || h.order.target !== m) cmdAttack(h, m);
}

/* 초반 정글러: 우리 쪽 정글 캠프를 돈다. 할 일이 있으면 true */
function aiJungle(h) {
  var T = h.team, best = null, bd = 1e9, i;
  for (i = 0; i < G.camps.length; i++) {
    var c = G.camps[i];
    if (c.alive <= 0 || c.boss || c.side !== T) continue;
    var d = Math.hypot(c.x - h.x, c.y - h.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return false;
  if (Math.hypot(best.x - h.x, best.y - h.y) > 520) { aiGo(h, best.x, best.y); return true; }
  var m = null, md = 1e9;
  for (i = 0; i < best.units.length; i++) { var u = best.units[i]; if (!u.dead) { var dd = dist(h, u) + u.hp * 0.2; if (dd < md) { md = dd; m = u; } } }
  if (!m) return false;
  if (h.mp / h.maxMp > 0.35) aiFarmSkill(h, m.x, m.y, best.units);
  if (!h.order || h.order.target !== m) cmdAttack(h, m);
  return true;
}

/* 정글 몬스터에 쓰는 범위 스킬 */
function aiFarmSkill(h, x, y, list) {
  for (var i = 0; i < 3; i++) {
    var sk = h.def.skills[i];
    if (!canCast(h, i) || !sk.dmg) continue;
    var d = Math.hypot(x - h.x, y - h.y);
    if (sk.kind === 'shot' && (sk.pierce || sk.aoe) && d < sk.range * 0.85) { castSkill(h, i, x, y); return; }
    if (sk.kind === 'area' && d < sk.range) { castSkill(h, i, x, y); return; }
    if (sk.kind === 'nova' && d < sk.radius * 0.7) { castSkill(h, i, x, y); return; }
    if (sk.kind === 'shot' && list.length && list[0].type === 'monster' && d < sk.range * 0.8) { castSkill(h, i, x, y); return; }
  }
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
        if (!allIn && h.mp / h.maxMp < 0.4) continue;
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
