'use strict';
/* 로드스타 — 렌더링: 캔버스 2D로 지형, 유닛, 효과, 전장의 안개, 미니맵을 그린다 */

var R = (function () {
  var vig = null, cv, ctx, cw = 1, ch = 1, dpr = 1, S = 0.5, zoom = 1;
  var cam = { x: 1500, y: 3200 };
  var fogCv, fogCtx, miniCv, miniCtx, miniBase, mw = 1, mh = 1;
  var C = {
    forest: '#0c181b', tree1: '#12292a', tree2: '#1a3835', edge: '#17282a', path: '#27383a', camp: '#293a3b',
    lane: '#34443f', road: '#43534b', river: '#1b4d63', river2: '#27708a', pit: '#243f4a',
    ally: '#4fe0d2', enemy: '#ff6b5e', neutral: '#b9a6ff', gold: '#ffd76a', me: '#f4f7c8', ink: '#e8f1ee'
  };
  var trees = {}, TB = 500;

  function init(canvas, mini) {
    cv = canvas; ctx = cv.getContext('2d');
    fogCv = document.createElement('canvas'); fogCtx = fogCv.getContext('2d');
    miniCv = mini; miniCtx = mini.getContext('2d');
    var seed = 7;
    function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var y = 60; y < MAP.H; y += 115) for (var x = 60; x < MAP.W; x += 115) {
      var tx = x + (r() - 0.5) * 90, ty = y + (r() - 0.5) * 90;
      if (MAP.isWalk(tx, ty) || MAP.isWalk(tx + 70, ty) || MAP.isWalk(tx - 70, ty) || MAP.isWalk(tx, ty + 70) || MAP.isWalk(tx, ty - 70)) continue;
      var k = ((tx / TB) | 0) + ',' + ((ty / TB) | 0);
      (trees[k] = trees[k] || []).push({ x: tx, y: ty, r: 48 + r() * 34 });
    }
    resize();
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth || 1, h = cv.clientHeight || 1;
    cw = Math.round(w * dpr); ch = Math.round(h * dpr);
    cv.width = cw; cv.height = ch;
    fogCv.width = Math.ceil(cw / 3); fogCv.height = Math.ceil(ch / 3);
    vig = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.42, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6); vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    S = Math.max(cw / 2700, ch / 1560) * zoom;
    var mwc = miniCv.clientWidth || 200, mhc = miniCv.clientHeight || 128;
    mw = Math.round(mwc * dpr); mh = Math.round(mhc * dpr);
    miniCv.width = mw; miniCv.height = mh;
    miniBase = document.createElement('canvas'); miniBase.width = mw; miniBase.height = mh;
    var m = miniBase.getContext('2d');
    m.fillStyle = '#0a1316'; m.fillRect(0, 0, mw, mh);
    m.save(); m.scale(mw / MAP.W, mh / MAP.H);
    terrain(m, true);
    m.restore();
  }
  function setZoom(z) { zoom = Math.max(0.6, Math.min(1.7, z)); S = Math.max(cw / 2700, ch / 1560) * zoom; }
  function getZoom() { return zoom; }
  function s2w(px, py) { return { x: cam.x + (px * dpr - cw / 2) / S, y: cam.y + (py * dpr - ch / 2) / S }; }
  function clampCam() {
    var hw = cw / 2 / S, hh = ch / 2 / S;
    cam.x = hw * 2 >= MAP.W ? MAP.W / 2 : Math.max(hw, Math.min(MAP.W - hw, cam.x));
    cam.y = hh * 2 >= MAP.H ? MAP.H / 2 : Math.max(hh - 200, Math.min(MAP.H - hh + 200, cam.y));
  }

  function strokeShape(c, s, extra) {
    c.beginPath();
    if (s.c) { c.arc(s.c[0], s.c[1], s.r + extra / 2, 0, 6.2832); c.fill(); return; }
    c.moveTo(s.pts[0][0], s.pts[0][1]);
    for (var i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i][0], s.pts[i][1]);
    c.lineWidth = s.hw * 2 + extra; c.stroke();
  }
  function terrain(c, mini) {
    var sh = MAP.shapes, i;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = c.fillStyle = mini ? '#31474a' : C.edge;
    for (i = 0; i < sh.length; i++) strokeShape(c, sh[i], mini ? 110 : 70);
    var col = { path: C.path, camp: C.camp, lane: C.lane, base: C.lane, pit: C.pit };
    if (mini) col = { path: '#4a6062', camp: '#4a6062', lane: '#667c76', base: '#667c76', pit: '#3d6a7c' };
    var order = ['path', 'camp', 'pit', 'lane', 'base'];
    for (var o = 0; o < order.length; o++) {
      c.strokeStyle = c.fillStyle = col[order[o]];
      for (i = 0; i < sh.length; i++) if (sh[i].kind === order[o]) strokeShape(c, sh[i], mini ? 60 : 0);
    }
    c.globalAlpha = 0.82;
    c.strokeStyle = mini ? '#2f7e9c' : C.river;
    for (i = 0; i < sh.length; i++) if (sh[i].kind === 'river') strokeShape(c, sh[i], mini ? 40 : -30);
    if (!mini) {
      c.globalAlpha = 0.35; c.strokeStyle = C.river2;
      for (i = 0; i < sh.length; i++) if (sh[i].kind === 'river') strokeShape(c, sh[i], -300);
      c.globalAlpha = 0.5; c.strokeStyle = C.road;
      for (i = 0; i < sh.length; i++) if (sh[i].kind === 'lane') strokeShape(c, sh[i], -300);
    }
    c.globalAlpha = 1;
    for (var T = 0; T < 2; T++) {
      var b = MAP.BASE[T], g = c.createRadialGradient(b.x, b.y, 100, b.x, b.y, 950);
      g.addColorStop(0, T ? 'rgba(255,107,94,0.20)' : 'rgba(79,224,210,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, 950, 0, 6.2832); c.fill();
    }
  }

  function drawTrees(x0, y0, x1, y1) {
    var list = [], bx, by, i;
    for (by = ((y0 - 100) / TB) | 0; by <= ((y1 + 100) / TB) | 0; by++) for (bx = ((x0 - 100) / TB) | 0; bx <= ((x1 + 100) / TB) | 0; bx++) {
      var t = trees[bx + ',' + by]; if (t) for (i = 0; i < t.length; i++) list.push(t[i]);
    }
    ctx.fillStyle = C.tree1; ctx.beginPath();
    for (i = 0; i < list.length; i++) { ctx.moveTo(list[i].x + list[i].r, list[i].y + 14); ctx.arc(list[i].x, list[i].y + 14, list[i].r, 0, 6.2832); }
    ctx.fill();
    ctx.fillStyle = C.tree2; ctx.beginPath();
    for (i = 0; i < list.length; i++) { var q = list[i].r * 0.62; ctx.moveTo(list[i].x + q - 8, list[i].y - 10); ctx.arc(list[i].x - 8, list[i].y - 10, q, 0, 6.2832); }
    ctx.fill();
  }

  function teamCol(u, me) { return u.team === 2 ? C.neutral : u.team === me ? C.ally : C.enemy; }
  function bar(x, y, w, h, frac, col, shield) {
    ctx.fillStyle = 'rgba(4,9,11,0.85)'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
    if (shield > 0) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - w / 2 + w * Math.min(1, frac), y, Math.min(w * shield, w * (1 - Math.min(1, frac)) + 6), h); }
  }
  function poly(x, y, r, n, rot) {
    ctx.beginPath();
    for (var i = 0; i < n; i++) { var a = rot + i * 6.2832 / n; if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }

  /* 걷는 중인지, 어느 쪽을 보는지 등 그림에 필요한 상태를 유닛에서 뽑는다 */
  function pose(u, t) {
    var sp = Math.hypot(u.vx || 0, u.vy || 0), want = sp > 25 ? 1 : 0;
    u.mvS = (u.mvS || 0) + (want - (u.mvS || 0)) * 0.25;
    var cx = Math.cos(u.face);
    if (u.dx === undefined) u.dx = cx < 0 ? -1 : 1;
    if (cx > 0.3) u.dx = 1; else if (cx < -0.3) u.dx = -1;
    return {
      t: t + u.id * 0.7, mv: u.mvS, ph: t * (6 + Math.min(8, sp / 60)) + u.id,
      atk: u.swing > 0 ? 1 - u.swing / (u.swingMax || 0.2) : -1, cast: u.castT > 0 ? 1 - u.castT / 0.4 : 0,
      dash: !!u.dash, alt: (u.atkN || 0) & 1
    };
  }
  function foot(u, r, col, a) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(u.x, u.y + r * 0.62, r * 1.15, r * 0.46, 0, 0, 6.2832); ctx.fill();
    if (col) { ctx.globalAlpha = a || 1; ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(u.x, u.y + r * 0.62, r * 1.15, r * 0.46, 0, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; }
  }

  function drawUnit(u, me, t) { drawHero(u, me, t); }
  function label(txt, x, y, size, col) {
    ctx.font = '700 ' + size + 'px "IBM Plex Sans KR", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(4,9,11,0.9)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  }
  var HS = 1.32; /* 영웅 그림 배율. 발끝 기준 키는 약 130 */
  function drawHero(h, me, t) {
    if (h.dead) return;
    var mine = h.team === me, x = h.x, y = h.y, r = h.r, col = h.isPlayer ? C.me : teamCol(h, me), fy = y + r * 0.62;
    ctx.globalAlpha = h.stealth ? 0.4 : 1;
    foot(h, r, col, h.isPlayer ? 0.95 : 0.75);
    if (h.carry) { ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 7; ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3; ctx.beginPath(); ctx.ellipse(x, fy, r + 30, (r + 30) * 0.42, 0, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = h.stealth ? 0.4 : 1; }
    if (h.recallT > 0) { ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, fy, r + 26, -1.57, -1.57 + 6.2832 * (1 - h.recallT / 6)); ctx.stroke(); }
    if (h.shield > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, fy, r + 16, (r + 16) * 0.4, 0, 0, 6.2832); ctx.stroke(); }
    var k = pose(h, t);
    if (h.dash) { var a = Math.atan2(h.dash.uy, h.dash.ux); h.dx = Math.cos(a) < 0 ? -1 : 1; }
    Spr.hero(ctx, h.defId, x, fy, HS, h.dx, k);
    if (h.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(x, fy - 62, 24, 52, 0, 0, 6.2832); ctx.fill(); }
    if (h.stunT > 0) { ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 5; ctx.setLineDash([14, 12]); ctx.lineDashOffset = -t * 60; ctx.beginPath(); ctx.ellipse(x, fy - 150, 26, 8, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
    if (h.rootT > 0) { ctx.strokeStyle = '#9fd6ff'; ctx.lineWidth = 5; poly(x, fy, r + 12, 6, t); ctx.stroke(); }
    for (var b = 0; b < h.buffs.length; b++) if (h.buffs[b].titan) { ctx.strokeStyle = 'rgba(168,130,255,0.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, fy, r + 24, (r + 24) * 0.42, 0, 0, 6.2832); ctx.stroke(); }
    /* 체력·마나 막대 */
    var by = fy - 172, w = 104;
    bar(x + 10, by, w, 11, h.hp / h.maxHp, h.isPlayer ? '#8ef08a' : mine ? C.ally : C.enemy, h.shield / h.maxHp);
    ctx.fillStyle = 'rgba(4,9,11,0.55)';
    for (var k2 = 250; k2 < h.maxHp; k2 += 250) ctx.fillRect(x + 10 - w / 2 + w * k2 / h.maxHp, by, 1.5, 11);
    if (mine) { ctx.fillStyle = 'rgba(4,9,11,0.85)'; ctx.fillRect(x + 10 - w / 2 - 2, by + 13, w + 4, 6); ctx.fillStyle = '#5aa8ff'; ctx.fillRect(x + 10 - w / 2, by + 13, w * h.mp / h.maxMp, 4); }
    ctx.fillStyle = '#0b1417'; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x - w / 2 - 4, by + 7, 15, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.font = '700 18px "IBM Plex Sans KR", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(h.level, x - w / 2 - 4, by + 8);
    label(h.name, x + 10, by - 8, 19, col);
    ctx.globalAlpha = 1;
  }

  /* 제단과 회복 구슬: 땅 위에 그린다 */
  function drawWorld(me, t, x0, y0, x1, y1) {
    var i, a, col;
    for (i = 0; i < 2; i++) {
      a = MAP.ALTAR[i]; col = i === me ? C.ally : C.enemy;
      if (a.x + 400 < x0 || a.x - 400 > x1 || a.y + 500 < y0 || a.y - 500 > y1) continue;
      ctx.save(); ctx.translate(a.x, a.y); ctx.scale(1, 0.62);
      ctx.fillStyle = col; ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(0, 0, ALTAR_R, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.setLineDash([34, 22]); ctx.lineDashOffset = t * 24; ctx.beginPath(); ctx.arc(0, 0, ALTAR_R, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      var c = G.stone.carrier, near = c && c.team === i && Math.hypot(c.x - a.x, c.y - a.y) < ALTAR_R * 2.2;
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(a.x, a.y + 10, 90, 30, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#101c1f'; ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(a.x - 70, a.y + 6); ctx.lineTo(a.x - 42, a.y - 150); ctx.lineTo(a.x + 42, a.y - 150); ctx.lineTo(a.x + 70, a.y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#16282c'; ctx.beginPath(); ctx.ellipse(a.x, a.y - 150, 54, 18, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
      glowAt(a.x, a.y - 168, near ? 90 : 56, col, near ? 0.9 : 0.5);
      label((i === me ? '아군 제단 ' : '적 제단 ') + G.score[i], a.x, a.y - 200, 26, col);
    }
    for (i = 0; i < G.packs.length; i++) {
      var p = G.packs[i];
      if (p.x < x0 - 200 || p.x > x1 + 200 || p.y < y0 - 200 || p.y > y1 + 200) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 38, 13, 0, 0, 6.2832); ctx.fill();
      if (p.ready) {
        var bob = Math.sin(t * 3 + i) * 7;
        glowAt(p.x, p.y - 30 + bob, 54, '#9dffb0', 0.7);
        ctx.fillStyle = '#0f2a1a'; ctx.strokeStyle = '#9dffb0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y - 30 + bob, 20, 0, 6.2832); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d8ffe2'; ctx.fillRect(p.x - 3, p.y - 42 + bob, 6, 24); ctx.fillRect(p.x - 12, p.y - 33 + bob, 24, 6);
      } else {
        ctx.strokeStyle = 'rgba(157,255,176,0.45)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 26, -1.5708, -1.5708 + 6.2832 * (1 - p.t / PACK_T)); ctx.stroke();
      }
    }
  }
  function glowAt(x, y, r, col, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.restore();
  }
  /* 성석: 바닥·하늘·운반자 머리 위. 어디에 있든 보이도록 빛기둥을 세운다 */
  function drawStone(me, t) {
    var s = G.stone, x = s.x, y = s.y, up, col = '#ffe9a8';
    if (s.state === 'carried') { var c = s.carrier; x = c.x; y = c.y + c.r * 0.62 - 214; up = 0; col = c.team === me ? C.ally : C.enemy; }
    else up = 38 + Math.sin(t * 2.4) * 8 + (s.z || 0);
    var gy = s.state === 'carried' ? y : y - up;
    if (s.state === 'wait') {
      ctx.globalAlpha = 0.4 + Math.sin(t * 4) * 0.2; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 5; ctx.setLineDash([16, 12]); ctx.beginPath(); ctx.ellipse(MAP.STONE.x, MAP.STONE.y, 120, 50, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      label('성석 ' + Math.ceil(s.waitT), MAP.STONE.x, MAP.STONE.y - 40, 26, '#ffe9a8');
      return;
    }
    if (s.state !== 'carried') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 8, 36, 12, 0, 0, 6.2832); ctx.fill(); }
    /* 빛기둥 */
    var bx = x, by = gy, g = ctx.createLinearGradient(0, by - 1500, 0, by);
    g.addColorStop(0, 'rgba(255,233,168,0)'); g.addColorStop(1, 'rgba(255,233,168,0.32)');
    ctx.fillStyle = g; ctx.fillRect(bx - 26, by - 1500, 52, 1500);
    glowAt(x, gy, 90, col, 0.8);
    ctx.save(); ctx.translate(x, gy); ctx.lineJoin = 'round';
    ctx.fillStyle = '#fff6d8'; ctx.strokeStyle = '#0b1114'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(22, -8); ctx.lineTo(14, 26); ctx.lineTo(-14, 26); ctx.lineTo(-22, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(22, -8); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-4, -22); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (s.state === 'free') { ctx.strokeStyle = 'rgba(255,233,168,0.8)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y - 6, 56, -1.5708, -1.5708 + 6.2832 * (s.freeT / STONE_FREE_T)); ctx.stroke(); }
  }
  /* 화면 밖에 있는 성석을 가리키는 화살표 */
  function drawStoneArrow(me) {
    var s = G.stone; if (s.state === 'wait') return;
    var sx = cw / 2 + (s.x - cam.x) * S, sy = ch / 2 + (s.y - cam.y) * S, m = 54 * dpr;
    if (sx > m && sx < cw - m && sy > m * 1.6 && sy < ch - m) return;
    var dx = sx - cw / 2, dy = sy - ch / 2, k = Math.min((cw / 2 - m) / Math.abs(dx || 1e-6), (ch / 2 - m * 1.4) / Math.abs(dy || 1e-6)), ax = cw / 2 + dx * k, ay = ch / 2 + dy * k, ang = Math.atan2(dy, dx);
    var col = s.state === 'carried' ? (s.carrier.team === me ? C.ally : C.enemy) : '#ffe9a8';
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(11,20,23,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 3 * dpr;
    ctx.beginPath(); ctx.moveTo(26 * dpr, 0); ctx.lineTo(-10 * dpr, -20 * dpr); ctx.lineTo(-4 * dpr, 0); ctx.lineTo(-10 * dpr, 20 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.moveTo(ax, ay - 9 * dpr); ctx.lineTo(ax + 7 * dpr, ay); ctx.lineTo(ax, ay + 9 * dpr); ctx.lineTo(ax - 7 * dpr, ay); ctx.closePath(); ctx.fill();
  }

  function drawFx(t) {
    var i, f, k, a;
    for (i = 0; i < G.fx.length; i++) {
      f = G.fx[i]; k = f.t / f.dur;
      var fxX = f.follow ? f.follow.x : f.x, fxY = f.follow ? f.follow.y : f.y;
      ctx.globalAlpha = 1 - k;
      if (f.type === 'ring') {
        var rr = f.r * (0.55 + 0.45 * k);
        if (f.fill) { ctx.fillStyle = f.color; ctx.globalAlpha = (1 - k) * 0.35; ctx.beginPath(); ctx.arc(fxX, fxY, f.r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1 - k; }
        ctx.strokeStyle = f.color; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(fxX, fxY, rr, 0, 6.2832); ctx.stroke();
      } else if (f.type === 'shock') {
        /* 땅 위로 퍼지는 충격파: 납작한 이중 링 + 안쪽 빛 */
        var e = 1 - Math.pow(1 - k, 3), sr = f.r * e;
        ctx.save(); ctx.translate(fxX, fxY); ctx.scale(1, 0.62); ctx.globalCompositeOperation = 'lighter';
        var gg = ctx.createRadialGradient(0, 0, sr * 0.2, 0, 0, Math.max(1, sr)); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.75, f.color); gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - k) * 0.28; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, sr, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = (1 - k) * 0.95; ctx.strokeStyle = f.color; ctx.lineWidth = (f.w || 10) * (1 - k) + 2; ctx.beginPath(); ctx.arc(0, 0, sr, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, (f.w || 10) * 0.3 * (1 - k)); ctx.beginPath(); ctx.arc(0, 0, sr * 0.96, 0, 6.2832); ctx.stroke();
        ctx.restore();
      } else if (f.type === 'pillar') {
        /* 빛기둥: 아래가 밝고 위로 사라진다 */
        var w = f.w * (1 - k * 0.55), h = 620 * Math.min(1, k * 5 + 0.25), g2 = ctx.createLinearGradient(0, fxY - h, 0, fxY);
        g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, f.color);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.pow(1 - k, 0.8) * 0.75; ctx.fillStyle = g2; ctx.fillRect(fxX - w, fxY - h, w * 2, h);
        ctx.globalAlpha = Math.pow(1 - k, 0.8) * 0.9; ctx.fillStyle = '#ffffff'; ctx.fillRect(fxX - w * 0.22, fxY - h * 0.8, w * 0.44, h * 0.8); ctx.restore();
      } else if (f.type === 'burst') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var bg = ctx.createRadialGradient(fxX, fxY, 0, fxX, fxY, Math.max(1, f.r * (0.35 + 0.65 * k)));
        bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.35, f.color); bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - k) * 0.85; ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(fxX, fxY, f.r * (0.35 + 0.65 * k), 0, 6.2832); ctx.fill(); ctx.restore();
      } else if (f.type === 'spark') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (a = 0; a < 8; a++) {
          var an = a * 0.785 + f.x, l0 = f.r * k * 0.5, l1 = f.r * (0.45 + k);
          ctx.strokeStyle = a % 2 ? '#ffffff' : f.color; ctx.lineWidth = a % 2 ? 3 : 6;
          ctx.beginPath(); ctx.moveTo(fxX + Math.cos(an) * l0, fxY + Math.sin(an) * l0); ctx.lineTo(fxX + Math.cos(an) * l1, fxY + Math.sin(an) * l1); ctx.stroke();
        }
        ctx.globalAlpha = (1 - k) * 0.8; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(fxX, fxY, f.r * 0.22 * (1 - k * 0.6), 0, 6.2832); ctx.fill(); ctx.restore();
      } else if (f.type === 'slash') {
        /* 칼 궤적: 굵은 반투명 호 위에 밝은 호 */
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        var sa = f.a - 1.15 + k * 1.1, ea = f.a + 1.15 + k * 1.1;
        ctx.globalAlpha = (1 - k) * 0.55; ctx.strokeStyle = f.color; ctx.lineWidth = 22 * (1 - k * 0.5); ctx.beginPath(); ctx.arc(fxX, fxY - 34, f.r, sa, ea); ctx.stroke();
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7 * (1 - k * 0.5); ctx.beginPath(); ctx.arc(fxX, fxY - 34, f.r, sa + 0.3, ea - 0.1); ctx.stroke(); ctx.restore();
      } else if (f.type === 'trail') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.color; ctx.globalAlpha = (1 - k) * 0.45;
        ctx.beginPath(); ctx.ellipse(fxX, fxY - 36, f.r * (1 - k * 0.4), f.r * 1.5 * (1 - k * 0.3), 0, 0, 6.2832); ctx.fill(); ctx.restore();
      } else if (f.type === 'mark') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 5; poly(fxX, fxY, f.r * (1 - k * 0.6), 4, Math.PI / 4 + k * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* 파티클: 먼지는 일반 합성, 불꽃은 더해서 번쩍이게 */
  function drawParts(x0, y0, x1, y1) {
    var i, p, a, sz;
    for (i = 0; i < G.parts.length; i++) {
      p = G.parts[i];
      if (!p.dust || p.x < x0 - 60 || p.x > x1 + 60 || p.y < y0 - 60 || p.y > y1 + 60) continue;
      a = 1 - p.t / p.life; ctx.globalAlpha = a * 0.6; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - a * 0.5), 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < G.parts.length; i++) {
      p = G.parts[i];
      if (p.dust || p.x < x0 - 60 || p.x > x1 + 60 || p.y < y0 - 60 || p.y > y1 + 60) continue;
      a = 1 - p.t / p.life; sz = p.size * (0.35 + 0.65 * a);
      ctx.fillStyle = p.color;
      if (sz > 4.5) { ctx.globalAlpha = a * 0.28; ctx.beginPath(); ctx.arc(p.x, p.y, sz * 2.6, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, 6.2832); ctx.fill();
      if (sz > 6) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a * 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.4, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /* 지역 스킬: 발광하는 바닥 + 돌아가는 룬 */
  function drawZones(me, t) {
    for (var i = 0; i < G.zones.length; i++) {
      var z = G.zones[i], col = z.team === me ? z.color : C.enemy;
      if (z.sk.ai === 'heal' && !z.t0) continue;
      var k = z.delay > 0 ? (z.t0 > 0 ? 1 - z.delay / z.t0 : 1) : 1;
      ctx.save(); ctx.translate(z.x, z.y); ctx.scale(1, 0.62);
      var gz = ctx.createRadialGradient(0, 0, z.r * 0.1, 0, 0, z.r); gz.addColorStop(0, col); gz.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = z.delay > 0 ? 0.16 + k * 0.3 : 0.3 + Math.sin(t * 8) * 0.06; ctx.fillStyle = gz; ctx.beginPath(); ctx.arc(0, 0, z.r, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.globalAlpha = 0.95;
      if (z.delay > 0) { ctx.beginPath(); ctx.arc(0, 0, z.r, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(0, 0, z.r * k, 0, 6.2832); ctx.stroke(); }
      else { ctx.setLineDash([30, 20]); ctx.lineDashOffset = -t * 100; ctx.beginPath(); ctx.arc(0, 0, z.r, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
      /* 룬: 돌아가는 별 */
      ctx.globalAlpha = 0.55 + 0.3 * k; ctx.lineWidth = 4; ctx.rotate(t * (z.delay > 0 ? 2.4 : 0.8));
      var s;
      ctx.beginPath(); for (s = 0; s < 3; s++) { ctx.lineTo(Math.cos(s * 2.0944) * z.r * 0.82, Math.sin(s * 2.0944) * z.r * 0.82); } ctx.closePath(); ctx.stroke();
      ctx.beginPath(); for (s = 0; s < 3; s++) { ctx.lineTo(Math.cos(s * 2.0944 + 3.1416) * z.r * 0.82, Math.sin(s * 2.0944 + 3.1416) * z.r * 0.82); } ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* 투사체: 머리에 후광, 꼬리는 길게 */
  function drawProj(me) {
    for (var i = 0; i < G.proj.length; i++) {
      var p = G.proj[i];
      if (p.homing) {
        if (p.team !== me && !p.target.vis[me] && !(p.src && p.src.vis[me])) continue;
        var rb = p.big ? 17 : 11;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(p.x, p.y - 36, rb * 2.6, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(p.x, p.y - 36, rb, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(p.x, p.y - 36, rb * 0.5, 0, 6.2832); ctx.fill(); ctx.restore();
      } else {
        var a = Math.atan2(p.vy, p.vx), col = p.team === me ? p.color : C.enemy, w = p.w * 0.5, len = Math.min(280, p.w * 3.4);
        ctx.save(); ctx.translate(p.x, p.y - 20); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createLinearGradient(-len, 0, 24, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, col); g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(-len * 0.1, -w * 0.9); ctx.lineTo(w * 1.5, 0); ctx.lineTo(-len * 0.1, w * 0.9); ctx.closePath(); ctx.fill();
        var hg = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 2.2); hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.3, col); hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.8; ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, w * 2.2, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawAim(aim, p) {
    var sk = p.def.skills[aim.slot], dx = aim.x - p.x, dy = aim.y - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    ctx.strokeStyle = 'rgba(244,247,200,0.75)'; ctx.fillStyle = 'rgba(244,247,200,0.16)'; ctx.lineWidth = 3;
    var reach = skillReach(sk);
    if (sk.kind === 'shot' || sk.kind === 'dash' || sk.kind === 'blink') {
      var len = sk.kind === 'shot' ? sk.range : Math.max(140, Math.min(d, sk.range)), w = (sk.width || (sk.hitRadius ? sk.hitRadius * 2 : 60)) / 2;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(uy, ux));
      ctx.beginPath(); ctx.rect(0, -w, len, w * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      var lr = sk.landRadius || sk.aoe;
      if (lr) { ctx.beginPath(); ctx.arc(p.x + ux * len, p.y + uy * len, lr, 0, 6.2832); ctx.fill(); ctx.stroke(); }
    } else if (sk.kind === 'area') {
      var dd = Math.min(d, sk.range);
      ctx.setLineDash([18, 14]); ctx.beginPath(); ctx.arc(p.x, p.y, sk.range, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x + ux * dd, p.y + uy * dd, sk.radius, 0, 6.2832); ctx.fill(); ctx.stroke();
    } else if (reach) {
      ctx.beginPath(); ctx.arc(p.x, p.y, reach, 0, 6.2832); ctx.fill(); ctx.stroke();
    }
  }

  /* 메인 장면. view = {me: 시야 팀, aim, player, fog} */
  function draw(view, t) {
    var me = view.me, i, u, shx = 0, shy = 0;
    clampCam();
    if (G.shake) { shx = (Math.random() - 0.5) * 2 * G.shake * dpr; shy = (Math.random() - 0.5) * 2 * G.shake * dpr; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.forest; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(S, 0, 0, S, cw / 2 - cam.x * S + shx, ch / 2 - cam.y * S + shy);
    var x0 = cam.x - cw / 2 / S, x1 = cam.x + cw / 2 / S, y0 = cam.y - ch / 2 / S, y1 = cam.y + ch / 2 / S;
    terrain(ctx, false);
    /* 우물 */
    for (var T = 0; T < 2; T++) {
      var f = MAP.FOUNT[T], col = T === me ? C.ally : C.enemy;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 6; ctx.setLineDash([30, 22]); ctx.lineDashOffset = t * 30;
      ctx.beginPath(); ctx.arc(f.x, f.y, 300, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(f.x, f.y, 300, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
    }
    drawTrees(x0, y0, x1, y1);
    drawWorld(me, t, x0, y0, x1, y1);
    drawZones(me, t);
    var p = view.player;
    var list = [];
    for (i = 0; i < G.units.length; i++) {
      u = G.units[i];
      if (u.dead || !u.vis[me]) continue;
      if (u.x < x0 - 250 || u.x > x1 + 250 || u.y < y0 - 250 || u.y > y1 + 250) continue;
      list.push(u);
    }
    list.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < list.length; i++) drawUnit(list[i], me, t);
    drawStone(me, t);
    drawProj(me);
    drawFx(t);
    drawParts(x0, y0, x1, y1);
    if (view.aim && p && !p.dead) drawAim(view.aim, p);
    if (view.hover && !view.hover.dead) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(view.hover.x, view.hover.y, view.hover.r + 12, 0, 6.2832); ctx.stroke(); }
    /* 전장의 안개 */
    if (view.fog) {
      var fs = fogCv.width / cw;
      fogCtx.setTransform(1, 0, 0, 1, 0, 0); fogCtx.globalCompositeOperation = 'source-over';
      fogCtx.clearRect(0, 0, fogCv.width, fogCv.height);
      fogCtx.fillStyle = 'rgba(4,10,13,0.62)'; fogCtx.fillRect(0, 0, fogCv.width, fogCv.height);
      fogCtx.globalCompositeOperation = 'destination-out';
      for (i = 0; i < G.units.length; i++) {
        u = G.units[i];
        if (u.dead || u.team !== me) continue;
        var sr = u.sight;
        if (u.x < x0 - sr || u.x > x1 + sr || u.y < y0 - sr || u.y > y1 + sr) continue;
        var sx = (cw / 2 + (u.x - cam.x) * S) * fs, sy = (ch / 2 + (u.y - cam.y) * S) * fs, rr = sr * S * fs;
        var g = fogCtx.createRadialGradient(sx, sy, rr * 0.55, sx, sy, rr);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        fogCtx.fillStyle = g; fogCtx.beginPath(); fogCtx.arc(sx, sy, rr, 0, 6.2832); fogCtx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(fogCv, 0, 0, cw, ch);
      ctx.setTransform(S, 0, 0, S, cw / 2 - cam.x * S + shx, ch / 2 - cam.y * S + shy);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); drawStoneArrow(me); ctx.setTransform(S, 0, 0, S, cw / 2 - cam.x * S + shx, ch / 2 - cam.y * S + shy);
    /* 떠오르는 숫자 */
    for (i = 0; i < G.texts.length; i++) {
      var x = G.texts[i];
      ctx.globalAlpha = Math.min(1, (1 - x.t / 0.9) * 1.6);
      label(x.txt, x.x, x.y, (x.size || 26) * (x.t < 0.1 ? 1.45 - 0.45 * (x.t / 0.1) : 1), x.color);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (G.flash) { ctx.globalAlpha = Math.min(0.45, G.flash.a); ctx.fillStyle = G.flash.col; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; }
    if (vig) { ctx.fillStyle = vig; ctx.fillRect(0, 0, cw, ch); }
  }

  function drawMini(me, player) {
    var c = miniCtx, sx = mw / MAP.W, sy = mh / MAP.H, i, u, t = performance.now() / 1000;
    c.drawImage(miniBase, 0, 0);
    for (i = 0; i < G.packs.length; i++) {
      var p = G.packs[i];
      c.fillStyle = p.ready ? '#9dffb0' : 'rgba(157,255,176,.3)'; c.beginPath(); c.arc(p.x * sx, p.y * sy, 3 * dpr, 0, 6.2832); c.fill();
    }
    for (i = 0; i < 2; i++) {
      var a = MAP.ALTAR[i], w = 5 * dpr; c.fillStyle = i === me ? C.ally : C.enemy; c.fillRect(a.x * sx - w, a.y * sy - w, w * 2, w * 2); c.strokeStyle = '#061013'; c.lineWidth = dpr; c.strokeRect(a.x * sx - w, a.y * sy - w, w * 2, w * 2);
    }
    for (i = 0; i < G.heroes.length; i++) {
      u = G.heroes[i];
      if (u.dead || !u.vis[me]) continue;
      c.fillStyle = u.color; c.strokeStyle = u.isPlayer ? '#ffffff' : teamCol(u, me); c.lineWidth = (u.isPlayer ? 2.4 : 1.8) * dpr;
      c.beginPath(); c.arc(u.x * sx, u.y * sy, (u.isPlayer ? 5.5 : 4.5) * dpr, 0, 6.2832); c.fill(); c.stroke();
    }
    var s = G.stone;
    if (s.state !== 'wait') {
      var px = s.x * sx, py = s.y * sy, pr = (7 + Math.sin(t * 5) * 1.5) * dpr;
      c.fillStyle = '#fff6d8'; c.strokeStyle = s.state === 'carried' ? (s.carrier.team === me ? C.ally : C.enemy) : '#ffd76a'; c.lineWidth = 2.5 * dpr;
      c.beginPath(); c.moveTo(px, py - pr); c.lineTo(px + pr * 0.8, py); c.lineTo(px, py + pr); c.lineTo(px - pr * 0.8, py); c.closePath(); c.fill(); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = dpr;
    var vw = cw / S, vh = ch / S;
    c.strokeRect((cam.x - vw / 2) * sx, (cam.y - vh / 2) * sy, vw * sx, vh * sy);
  }

  return { init: init, resize: resize, draw: draw, drawMini: drawMini, cam: cam, s2w: s2w, setZoom: setZoom, getZoom: getZoom, C: C };
})();
