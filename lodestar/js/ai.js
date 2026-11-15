'use strict';
/* 로드스타 — 봇 AI (성석 운반전)
   성석이 어디에 있는지가 모든 판단을 정한다.
   바닥에 있으면 가까운 둘이 줍고 나머지는 길목을 지키고, 아군이 들었으면 호위하고,
   적이 들었으면 달라붙거나 앞질러 가로막는다. 운반자는 적이 적은 길을 골라 달리고,
   위험하면 동료에게 던진다. 싸울 때는 집중 공격, 스킬 피하기, 거리 유지를 한다. */

function aiInit(h, role) {
  h.ai = { role: role, think: rnd() * 0.3, heal: false, off: rnd() * 6.28, dodgeUntil: 0, sT: 0, lx: h.x, ly: h.y, route: -1, routeT: 0, wp: 0 };
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
function aiDanger(x, y, team) { var f = MAP.FOUNT[1 - team]; return Math.hypot(x - f.x, y - f.y) < 900; }

function aiUpdate(h, dt) {
  var s = h.ai;
  if (h.dead) return;
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

/* 다쳤을 때 가는 곳: 가까운 회복 구슬, 없으면 우리 우물 */
function aiHealSpot(h) {
  var f = MAP.FOUNT[h.team], best = { x: f.x, y: f.y }, bd = dist(h, f) * 0.8;
  for (var i = 0; i < G.packs.length; i++) {
    var p = G.packs[i]; if (!p.ready) continue;
    var d = dist(h, p); if (d < bd) { bd = d; best = { x: p.x, y: p.y }; }
  }
  return best;
}

/* ── 운반 ── */
/* 길 세 갈래: 가운데로 곧장, 위쪽 길, 아래쪽 길. 위·아래 길에는 거치는 지점이 있다 */
function aiRoutes(T) {
  var W = MAP.W, H = MAP.H, top = [[3400, 800], [2300, 1050], [1500, 2100]];
  function mk(flipY) { return top.map(function (p) { return [T === 0 ? p[0] : W - p[0], flipY ? H - p[1] : p[1]]; }); }
  return [[], mk(false), mk(true)];
}
function aiRouteCost(h, wps) {
  var A = MAP.ALTAR[h.team], pts = [[h.x, h.y]].concat(wps).concat([[A.x, A.y]]), len = 0, danger = 0;
  for (var i = 0; i < pts.length - 1; i++) {
    var ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1], l = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(l / 300));
    len += l;
    for (var k = 1; k <= n; k++) {
      var px = ax + (bx - ax) * k / n, py = ay + (by - ay) * k / n;
      for (var j = 0; j < G.heroes.length; j++) { var e = G.heroes[j]; if (e.team !== h.team && !e.dead && Math.hypot(e.x - px, e.y - py) < 850) danger++; }
    }
  }
  return len + danger * 170;
}
function aiCarry(h, foes, hpP) {
  var s = h.ai, T = h.team, A = MAP.ALTAR[T], nearFoe = null, nd = 1e9, i;
  for (i = 0; i < foes.length; i++) { var d = dist(h, foes[i]); if (d < nd) { nd = d; nearFoe = foes[i]; } }
  /* 위험하면 제단에 더 가까운 동료에게 던진다 */
  if (nearFoe && nd < 650 && (hpP < 0.4 || foes.length >= 3)) {
    var mate = null, md = 1e9;
    for (i = 0; i < G.heroes.length; i++) {
      var a = G.heroes[i];
      if (a.team !== T || a.dead || a === h) continue;
      var da = dist(h, a);
      if (da < 850 && da > 200 && dist(a, A) < dist(h, A) - 150 && dist(a, nearFoe) > 450 && da < md) { md = da; mate = a; }
    }
    if (mate && throwStone(h, mate.x, mate.y)) return;
  }
  if (nearFoe && nd < 520 && hpP < 0.75) aiEscape(h, A);
  /* 길 고르기: 2초마다 다시 계산하되, 확실히 나을 때만 바꾼다 */
  var routes = aiRoutes(T);
  if (G.t >= s.routeT || s.route < 0) {
    s.routeT = G.t + 2;
    var best = -1, bc = 1e9, cur = s.route >= 0 ? aiRouteCost(h, routes[s.route].filter(function (w) { return Math.hypot(w[0] - A.x, w[1] - A.y) < dist(h, A) - 300; })) : 1e9;
    for (i = 0; i < 3; i++) {
      var wps = routes[i].filter(function (w) { return Math.hypot(w[0] - A.x, w[1] - A.y) < dist(h, A) - 300; });
      var c = aiRouteCost(h, wps) + (i ? 400 : 0);
      if (c < bc) { bc = c; best = i; }
    }
    if (s.route < 0 || bc < cur - 900) { s.route = best; s.wp = 0; }
  }
  var wl = routes[s.route].filter(function (w) { return Math.hypot(w[0] - A.x, w[1] - A.y) < dist(h, A) - 300; });
  while (s.wp < wl.length && Math.hypot(h.x - wl[s.wp][0], h.y - wl[s.wp][1]) < 380) s.wp++;
  if (s.wp < wl.length) aiGo(h, wl[s.wp][0], wl[s.wp][1]); else aiGo(h, A.x, A.y);
}

/* 아군이 성석을 들었다: 곁을 지킨다. 근접은 앞, 원거리는 뒤 */
function aiEscort(h, c) {
  var T = h.team, A = MAP.ALTAR[T], dx = A.x - c.x, dy = A.y - c.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  var lat = ((h.slot % 3) - 1) * 230, fwd = h.def.melee ? 330 : -180;
  aiGoWalk(h, c.x + ux * fwd - uy * lat, c.y + uy * fwd + ux * lat);
}
/* 적이 성석을 들었다: 가까운 셋은 달라붙고, 나머지는 가는 길 앞을 막는다 */
function aiIntercept(h, c) {
  var T = h.team, E = 1 - T, A = MAP.ALTAR[E], mates = G.heroes.filter(function (a) { return a.team === T && !a.dead; });
  mates.sort(function (a, b) { return dist(a, c) - dist(b, c); });
  var rank = mates.indexOf(h);
  if (rank < 3 || dist(c, A) < 1300) { aiGo(h, c.x + c.vx * 0.5, c.y + c.vy * 0.5); return; }
  var dx = A.x - c.x, dy = A.y - c.y, l = Math.hypot(dx, dy) || 1, ahead = Math.min(1500, l * 0.55);
  aiGoWalk(h, c.x + dx / l * ahead + ((h.slot % 3) - 1) * 200, c.y + dy / l * ahead);
}
/* 성석이 바닥이나 하늘에 있다: 줍는 둘은 달려가고, 나머지는 우리 쪽 길목을 잡는다 */
function aiStoneRace(h) {
  var T = h.team, st = G.stone, spot = { x: st.state === 'flying' ? st.tx : st.x, y: st.state === 'flying' ? st.ty : st.y };
  if (st.state === 'wait') spot = { x: MAP.STONE.x, y: MAP.STONE.y };
  if (G.pickers[T].indexOf(h.id) >= 0 || dist(h, spot) < 650) { aiGo(h, spot.x, spot.y); return; }
  var A = MAP.ALTAR[T], dx = A.x - spot.x, dy = A.y - spot.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, lat = ((h.slot % 3) - 1) * 260;
  aiGoWalk(h, spot.x + ux * 560 - uy * lat, spot.y + uy * 560 + ux * lat);
}

function aiDecide(h) {
  var s = h.ai, T = h.team, st = G.stone;
  var hpP = h.hp / h.maxHp;
  var foes = [], pals = [], i, u, d;
  for (i = 0; i < G.heroes.length; i++) {
    u = G.heroes[i];
    if (u.dead || u === h) continue;
    d = dist(h, u);
    if (d > 1600 && !(u.carry && u.team !== T)) continue;
    if (u.team === T) pals.push(u); else if (u.vis[T]) foes.push(u);
  }
  var myPow = aiPow(h), palPow = 0, foePow = 0, nearFoe = null, nd = 1e9;
  for (i = 0; i < pals.length; i++) if (dist(h, pals[i]) < 1100) palPow += aiPow(pals[i]);
  for (i = 0; i < foes.length; i++) { d = dist(h, foes[i]); if (d < 1300) foePow += aiPow(foes[i]); if (d < nd) { nd = d; nearFoe = foes[i]; } }

  aiSupport(h, pals, foes, hpP);

  /* 운반 중이면 달리는 것이 전부다 */
  if (h.carry) { aiCarry(h, foes, hpP); return; }

  /* 다쳤으면 회복 구슬이나 우물로 */
  if (hpP < 0.32 || (hpP < 0.45 && foePow > myPow + palPow)) s.heal = true;
  if (s.heal && (hpP > 0.8 || (G.stone.state === 'carried' && G.stone.carrier.team === T && hpP > 0.5))) s.heal = false;
  if (s.heal) {
    var sp = aiHealSpot(h);
    if (nearFoe && nd < 650) aiEscape(h, sp);
    aiGo(h, sp.x, sp.y);
    return;
  }

  /* 줍는 담당은 눈앞에 적이 붙지 않으면 곧장 성석으로 */
  var racing = (st.state === 'center' || st.state === 'free' || st.state === 'flying') && G.pickers[T].indexOf(h.id) >= 0;
  if (racing && (!nearFoe || nd > 260)) { aiStoneRace(h); return; }

  /* 교전: 성석을 든 적을 가장 먼저, 집중 공격 대상과 고립된 적 우선 */
  if (foes.length) {
    var tgt = null, bs = 1e9, reach = hpP > 0.6 ? 1500 : 1150, focus = G.focus[T];
    for (i = 0; i < foes.length; i++) {
      d = dist(h, foes[i]); if (d > reach && !foes[i].carry) continue;
      var alone = true;
      for (var k = 0; k < foes.length; k++) if (k !== i && dist(foes[i], foes[k]) < 800) alone = false;
      var sc = foes[i].hp + d * 0.6 - (foes[i].id === focus ? 300 : 0) - (alone ? 150 : 0) - (foes[i].carry ? 900 : 0);
      if (sc < bs) { bs = sc; tgt = foes[i]; }
    }
    if (tgt) {
      var td = dist(h, tgt), tp = tgt.hp / tgt.maxHp;
      var adv = myPow + palPow >= foePow * 0.85 || tp < 0.3 || tgt.carry;
      if (adv) {
        aiSkills(h, tgt, td, true, foes.length);
        if (!h.dash) {
          if (!h.def.melee && h.atkCd > 0.15 && td < h.range * 0.85 && nd < 520 && !tgt.carry && aiKite(h, nearFoe || tgt)) return;
          if (!h.order || h.order.target !== tgt) cmdAttack(h, tgt);
        }
        return;
      } else if (td < 800 && foePow > (myPow + palPow) * 1.3) {
        aiSkills(h, tgt, td, false, foes.length);
        var sp3 = aiHealSpot(h);
        if (td < 500) aiEscape(h, sp3);
        aiGo(h, sp3.x, sp3.y);
        return;
      } else aiSkills(h, tgt, td, false, foes.length);
    }
  }

  /* 목표: 성석 상태에 따라 */
  if (st.state === 'carried') {
    if (st.carrier.team === T) aiEscort(h, st.carrier); else aiIntercept(h, st.carrier);
    return;
  }
  aiStoneRace(h);
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
      var fighters = 0; for (var f = 0; f < pals.length; f++) if (dist(h, pals[f]) < sk.allyR && (G.t - pals[f].aggroT < 1.5 || pals[f].carry)) fighters++;
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
    if (ult && !(allIn && (tp < 0.75 || nFoes >= 2 || t.carry))) continue;
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
