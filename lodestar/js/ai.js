'use strict';
/* 로드스타 — 봇 AI
   공격로에서 병사만 치지 않고 팀으로 움직인다: 집중 공격, 고립된 적 사냥, 보스 함께 잡기,
   날아오는 스킬 피하기, 원거리 영웅의 거리 유지, 길 막힘 탈출. */

function aiInit(h, role) {
  h.ai = {
    role: role, lane: role === 'sup' ? 'bot' : role === 'jungle' ? 'mid' : role, think: rnd() * 0.3, mode: 'lane',
    build: BUILDS[h.def.cls], bi: 0, defend: null, defendT: 0, gankT: 0, off: (rnd() - 0.5) * 260,
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
function aiShop(h) {
  var s = h.ai;
  while (s.bi < s.build.length && h.items.length < 6) {
    var id = s.build[s.bi];
    if (h.gold < ITEMS[id].cost) break;
    if (!buyItem(h, id)) break;
    s.bi++;
  }
}
function aiNextCost(h) { var s = h.ai; return s.bi < s.build.length && h.items.length < 6 ? ITEMS[s.build[s.bi]].cost : 1e9; }
function aiProg(T, L, s) { return T === 0 ? s : L.len - s; }
function aiLanePoint(T, L, prog, off) {
  var p = MAP.laneAt(L, T === 0 ? prog : L.len - prog);
  var x = p.x - p.uy * off, y = p.y + p.ux * off;
  return MAP.isWalk(x, y) ? { x: x, y: y } : { x: p.x, y: p.y };
}
function aiBack(h, amount) {
  var s = h.ai, L = MAP.lanes[s.curLane || s.lane], pr = MAP.laneProj(L, h.x, h.y);
  if (pr.d > 700) { var f = MAP.FOUNT[h.team]; aiGo(h, f.x, f.y); return; }
  var p = aiLanePoint(h.team, L, Math.max(200, aiProg(h.team, L, pr.s) - amount), s.off * 0.5);
  aiGo(h, p.x, p.y);
}
function aiEnemyTower(h, pad) {
  for (var i = 0; i < G.towers.length; i++) {
    var t = G.towers[i];
    if (!t.dead && t.team !== h.team && dist(h, t) < t.range + pad) return t;
  }
  return null;
}
function aiTowerAt(x, y, team, pad) {
  for (var i = 0; i < G.towers.length; i++) {
    var t = G.towers[i];
    if (!t.dead && t.team !== team && Math.hypot(x - t.x, y - t.y) < t.range + pad) return t;
  }
  return null;
}
function aiMinionsNear(team, s, R) {
  var n = 0;
  for (var i = 0; i < G.units.length; i++) { var u = G.units[i]; if (u.type === 'minion' && u.team === team && !u.dead && dist(u, s) < R) n++; }
  return n;
}

function aiUpdate(h, dt) {
  var s = h.ai;
  if (h.dead) { aiShop(h); return; }
  s.think -= dt;
  if (s.think > 0) return;
  var step = (0.2 + rnd() * 0.1) * (h.team === 1 && G.player ? DIFFS[G.diff].think : 1);
  s.think = step;
  if (h.points > 0) autoSkill(h);
  if (inFountain(h)) aiShop(h);
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
      if (MAP.isWalk(tx, ty) && !aiTowerAt(tx, ty, T, 0)) { cmdMove(h, tx, ty); s.dodgeUntil = G.t + 0.4; return true; }
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
  var dx = h.x - from.x, dy = h.y - from.y, d = Math.hypot(dx, dy) || 1, a0 = Math.atan2(dy, dx), offs = [0, 0.7, -0.7, 1.4, -1.4];
  for (var i = 0; i < offs.length; i++) {
    var a = a0 + offs[i], px = h.x + Math.cos(a) * 260, py = h.y + Math.sin(a) * 260;
    if (MAP.isWalk(px, py) && !aiTowerAt(px, py, h.team, 40)) { cmdMove(h, px, py); return true; }
  }
  return false;
}

/* 직선 스킬이 다른 적에게 먼저 맞아 버리는지 */
function aiBlocked(h, t, sk) {
  if (sk.pierce) return false;
  var dx = t.x - h.x, dy = t.y - h.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  for (var i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || u === t || u.team === h.team || u.type === 'tower' || u.type === 'core') continue;
    var ox = u.x - h.x, oy = u.y - h.y, along = ox * ux + oy * uy;
    if (along < 0 || along > d) continue;
    if (Math.abs(ox * uy - oy * ux) < sk.width / 2 + u.r * 0.6) return true;
  }
  return false;
}

function aiDecide(h) {
  var s = h.ai, T = h.team, E = 1 - T;
  var hpP = h.hp / h.maxHp, mpP = h.mp / h.maxMp;
  var foes = [], pals = [], foeMin = [], i, u, d;
  for (i = 0; i < G.units.length; i++) {
    u = G.units[i];
    if (u.dead || u === h) continue;
    d = dist(h, u);
    if (d > 1600) continue;
    if (u.type === 'hero') { if (u.team === T) pals.push(u); else if (u.vis[T]) foes.push(u); }
    else if (u.type === 'minion' && u.team === E && d < 900) foeMin.push(u);
  }
  var myPow = aiPow(h), palPow = 0, foePow = 0, nearFoe = null, nd = 1e9;
  for (i = 0; i < pals.length; i++) if (dist(h, pals[i]) < 1100) palPow += aiPow(pals[i]);
  for (i = 0; i < foes.length; i++) { d = dist(h, foes[i]); if (d < 1300) foePow += aiPow(foes[i]); if (d < nd) { nd = d; nearFoe = foes[i]; } }
  var fount = MAP.FOUNT[T];
  s.curLane = (s.defend && s.defend.lane) || G.groupLane[T] || s.lane;

  aiSupport(h, pals, foes, hpP);

  /* 1. 후퇴 */
  if (s.mode === 'retreat') {
    if (inFountain(h)) {
      if (hpP > 0.9 && mpP > 0.7) s.mode = 'lane';
      else { h.order = null; return; }
    } else {
      if (nearFoe && nd < 750) aiEscape(h, fount);
      if (h.recallT > 0) return;
      if ((!nearFoe || nd > 1300) && G.t - h.lastDmgT > 2.5 && dist(h, fount) > 2600 && !aiEnemyTower(h, 200)) { startRecall(h); return; }
      aiGo(h, fount.x, fount.y);
      return;
    }
  }
  var nc = aiNextCost(h);
  if (hpP < 0.27 || (hpP < 0.42 && foePow > myPow + palPow) || (mpP < 0.1 && hpP < 0.55 && !foes.length) ||
      (!foes.length && (h.gold >= nc + 900 || (h.gold >= nc && hpP < 0.6)))) {
    s.mode = 'retreat'; s.defend = null;
    aiGo(h, fount.x, fount.y);
    return;
  }

  /* 2. 적 포탑·우물 사거리에서 무리하지 않기 */
  var tw = aiEnemyTower(h, h.r + 110);
  if (tw || dist(h, MAP.FOUNT[E]) < 1000) {
    var safe = tw && aiMinionsNear(T, tw, tw.range) >= 1 && tw.target !== h;
    var dive = nearFoe && nearFoe.hp / nearFoe.maxHp < 0.22 && nd < 450 && hpP > 0.55;
    if (!tw || (!safe && !dive)) { aiBack(h, 700); return; }
  }

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
      var ttw = null;
      for (i = 0; i < G.towers.length; i++) { var q = G.towers[i]; if (!q.dead && q.team === E && dist(tgt, q) < q.range + 40) ttw = q; }
      if (ttw && !(tp < 0.22 && hpP > 0.55) && !(aiMinionsNear(T, ttw, ttw.range) >= 2 && ttw.target !== h)) {
        aiSkills(h, tgt, td, false, foes.length);
      } else if (adv) {
        aiSkills(h, tgt, td, true, foes.length);
        if (!h.dash) {
          if (!h.def.melee && h.atkCd > 0.15 && td < h.range * 0.85 && nd < 520 && aiKite(h, nearFoe || tgt)) return;
          if (!h.order || h.order.target !== tgt) cmdAttack(h, tgt);
        }
        return;
      } else if (td < 800 && foePow > (myPow + palPow) * 1.3) {
        aiSkills(h, tgt, td, false, foes.length);
        if (td < 500) aiEscape(h, fount);
        aiBack(h, 800);
        return;
      } else aiSkills(h, tgt, td, false, foes.length);
    }
  }

  /* 4. 목표 */
  if (s.defend && (G.t > s.defendT || s.defend.dead)) s.defend = null;
  if (s.defend) return aiLane(h, s.defend.lane, foeMin, myPow + palPow, foePow, s.defend);
  var bp = G.bossPlan[T];
  if (bp && bp.alive > 0 && hpP > 0.55 && dist(h, bp) < 4800) return aiBoss(h, bp);
  if (s.role === 'jungle' && !G.groupLane[T]) return aiJungle(h, foeMin, myPow + palPow, foePow);
  var prey = aiHunt(h, hpP);
  if (prey) { aiGo(h, prey.x, prey.y); return; }
  return aiLane(h, G.groupLane[T] || s.lane, foeMin, myPow + palPow, foePow, null);
}

/* 혼자 떨어진 적 영웅을 찾아 덮친다 (정글러는 더 멀리까지, 다른 영웅은 가까이만) */
function aiHunt(h, hpP) {
  var T = h.team, s = h.ai;
  if (hpP < 0.65 || h.level < 3 || G.t < 150 || G.behind[T]) return null;
  var R = s.role === 'jungle' ? 3600 : 2100, best = null, bs = 1e9;
  for (var i = 0; i < G.heroes.length; i++) {
    var e = G.heroes[i];
    if (e.team === T || e.dead || !e.vis[T]) continue;
    var d = dist(h, e); if (d > R) continue;
    if (aiTowerAt(e.x, e.y, T, 60)) continue;
    var escort = 0;
    for (var k = 0; k < G.heroes.length; k++) { var o = G.heroes[k]; if (o.team === T && !o.dead && o !== h && dist(o, e) < 1500) escort++; }
    var theirs = 0;
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
    var px = camp.x + dx / l * 420 + (rnd() - 0.5) * 160, py = camp.y + dy / l * 420;
    var q = MAP.nearestWalk(px, py);
    aiGo(h, q[0], q[1]);
    return;
  }
  if (h.mp / h.maxMp > 0.3) aiFarmSkill(h, m.x, m.y, [m]);
  if (!h.order || h.order.target !== m) cmdAttack(h, m);
}

function aiLane(h, lane, foeMin, myPow, foePow, defendAt) {
  var s = h.ai, T = h.team, E = 1 - T, L = MAP.lanes[lane], i;
  /* 지원가는 같은 공격로의 원거리 딜러 곁에 붙어 다닌다 */
  if (s.role === 'sup' && lane === s.lane && !defendAt) {
    var cr = null;
    for (i = 0; i < G.heroes.length; i++) { var a = G.heroes[i]; if (a.team === T && !a.dead && a.ai && a.ai.role === 'bot') cr = a; }
    if (cr) {
      var pr0 = MAP.laneProj(L, cr.x, cr.y), bp = aiLanePoint(T, L, Math.max(150, aiProg(T, L, pr0.s) - 260), s.off * 0.4);
      if (dist(h, cr) > 520) { aiGo(h, bp.x, bp.y); return; }
      var near = null, nd2 = 1e9;
      for (i = 0; i < foeMin.length; i++) { var dd = dist(h, foeMin[i]); if (dd < nd2 && dd < h.range + 80) { nd2 = dd; near = foeMin[i]; } }
      if (near && (!h.order || h.order.target !== near)) cmdAttack(h, near);
      else if (!near && Math.hypot(h.x - bp.x, h.y - bp.y) > 200) aiGo(h, bp.x, bp.y);
      return;
    }
  }
  var front = -1, myTw = 250;
  for (i = 0; i < G.units.length; i++) {
    var m = G.units[i];
    if (m.dead || m.team !== T) continue;
    if (m.type === 'minion' && m.lane === lane) { var p = aiProg(T, L, MAP.laneProj(L, m.x, m.y).s); if (p > front) front = p; }
    else if (m.type === 'tower' && m.lane === lane) { var tp = aiProg(T, L, m.laneS); if (tp > myTw) myTw = tp; }
  }
  front = Math.max(front, myTw - 150);
  var es = null, ep = 1e9;
  for (i = 0; i < G.towers.length; i++) {
    var t = G.towers[i];
    if (t.dead || t.team !== E || t.lane !== lane) continue;
    var pp = aiProg(T, L, t.laneS); if (pp < ep) { ep = pp; es = t; }
  }
  if (!es) { es = G.cores[E]; ep = L.len - 60; }
  var atTower = aiMinionsNear(T, es, es.range + 60);
  var hold = front - (h.def.melee ? 40 : 300);
  if (atTower < 2) hold = Math.min(hold, ep - (es.range || 600) - 280);
  if (defendAt) hold = Math.min(hold, aiProg(T, L, MAP.laneProj(L, defendAt.x, defendAt.y).s) + 150);
  if (G.behind[T] && !defendAt) hold = Math.min(hold, myTw + 200);

  /* 병사 정리 */
  var best = null, bs = 1e9, cx = 0, cy = 0, cn = 0;
  for (i = 0; i < foeMin.length; i++) {
    var e = foeMin[i], d = dist(h, e);
    if (d > 780) continue;
    if (atTower < 2 && es.range && dist(e, es) < es.range - 40) continue;
    var eff = h.ad * 100 / (100 + e.armor);
    var sc = (e.hp <= eff ? -500 : 0) + e.hp * 0.3 + d * 0.5;
    if (sc < bs) { bs = sc; best = e; }
    cx += e.x; cy += e.y; cn++;
  }
  if (best) {
    if (cn >= 3 && h.mp / h.maxMp > 0.5 && h.level >= 2) aiFarmSkill(h, cx / cn, cy / cn, foeMin);
    if (!h.order || h.order.target !== best) cmdAttack(h, best);
    return;
  }
  /* 건물 공격 */
  if (atTower >= 2 && !es.invuln && dist(h, es) < 1500 && foePow < myPow * 1.1 && es.target !== h) {
    if (!h.order || h.order.target !== es) cmdAttack(h, es);
    return;
  }
  var gp = aiLanePoint(T, L, Math.max(150, hold), s.off);
  aiGo(h, gp.x, gp.y);
}

function aiJungle(h, foeMin, myPow, foePow) {
  var s = h.ai, T = h.team, best = null, bd = 1e9, i;
  var prey = aiHunt(h, h.hp / h.maxHp);
  if (prey) { aiGo(h, prey.x, prey.y); return; }
  for (i = 0; i < G.camps.length; i++) {
    var c = G.camps[i];
    if (c.alive <= 0) continue;
    if (c.boss) continue;
    else if (c.side !== T) continue;
    var d = Math.hypot(c.x - h.x, c.y - h.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) {
    if (G.t > s.gankT) { s.gankT = G.t + 28; s.lane = LANES[(rnd() * 3) | 0]; }
    return aiLane(h, s.lane, foeMin, myPow, foePow, null);
  }
  if (Math.hypot(best.x - h.x, best.y - h.y) > 520) { aiGo(h, best.x, best.y); return; }
  var m = null, md = 1e9;
  for (i = 0; i < best.units.length; i++) { var u = best.units[i]; if (!u.dead) { var dd = dist(h, u) + u.hp * 0.2; if (dd < md) { md = dd; m = u; } } }
  if (!m) return;
  if (h.mp / h.maxMp > 0.35) aiFarmSkill(h, m.x, m.y, best.units);
  if (!h.order || h.order.target !== m) cmdAttack(h, m);
}

/* 병사·정글에 쓰는 범위 스킬 */
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
      /* 아군이 싸우러 달려들 때 함께 빨라지게 */
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
