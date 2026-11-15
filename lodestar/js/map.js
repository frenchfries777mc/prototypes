'use strict';
/* 로드스타 — 맵: 지형 도형, 이동 가능 격자, 길찾기 */

var MAP = (function () {
  var W = 10000, H = 6400, CELL = 50, GW = W / CELL, GH = H / CELL;
  var mxp = function (p) { return [W - p[0], p[1]]; };
  var myp = function (p) { return [p[0], H - p[1]]; };

  function mk(pts) {
    var seg = [], len = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      seg.push({ a: a, b: b, l: l, s: len, ux: (b[0] - a[0]) / l, uy: (b[1] - a[1]) / l });
      len += l;
    }
    return { pts: pts, seg: seg, len: len };
  }

  var laneTop = [[1150, 3200], [1500, 2100], [2300, 1050], [3400, 800], [6600, 800], [7700, 1050], [8500, 2100], [8850, 3200]];
  var lanes = { top: mk(laneTop), mid: mk([[1150, 3200], [8850, 3200]]), bot: mk(laneTop.map(myp)) };

  function laneAt(L, s) {
    s = Math.max(0, Math.min(L.len, s));
    var g = L.seg[L.seg.length - 1];
    for (var i = 0; i < L.seg.length; i++) { if (s <= L.seg[i].s + L.seg[i].l) { g = L.seg[i]; break; } }
    var t = s - g.s;
    return { x: g.a[0] + g.ux * t, y: g.a[1] + g.uy * t, ux: g.ux, uy: g.uy };
  }
  function laneProj(L, x, y) {
    var best = 1e18, bs = 0;
    for (var i = 0; i < L.seg.length; i++) {
      var g = L.seg[i];
      var t = (x - g.a[0]) * g.ux + (y - g.a[1]) * g.uy;
      t = Math.max(0, Math.min(g.l, t));
      var px = g.a[0] + g.ux * t, py = g.a[1] + g.uy * t, d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) { best = d; bs = g.s + t; }
    }
    return { s: bs, d: Math.sqrt(best) };
  }

  /* 지형 도형: 숲(막힘)을 바탕으로 길을 깎아 낸다 */
  var shapes = [];
  var BASE = [{ x: 950, y: 3200 }, { x: W - 950, y: 3200 }];
  var FOUNT = [{ x: 380, y: 3200 }, { x: W - 380, y: 3200 }];
  var CORE = [{ x: 1150, y: 3200 }, { x: W - 1150, y: 3200 }];
  shapes.push({ c: [BASE[0].x, BASE[0].y], r: 950, kind: 'base', team: 0 });
  shapes.push({ c: [BASE[1].x, BASE[1].y], r: 950, kind: 'base', team: 1 });
  LANES.forEach(function (k) { shapes.push({ pts: lanes[k].pts, hw: 240, kind: 'lane' }); });
  var river = [[5000, 500], [4900, 1600], [5100, 2600], [5000, 3200], [4900, 3800], [5100, 4800], [5000, 5900]];
  shapes.push({ pts: river, hw: 250, kind: 'river' });

  var quad = [
    [[2500, 3200], [2450, 2600], [2700, 2000], [2650, 1400], [2700, 950]],
    [[3900, 3200], [3850, 2500], [4050, 1900], [3950, 1300], [4000, 800]],
    [[1750, 2550], [2700, 2000], [3400, 2100], [4050, 1900], [4950, 2000]],
    [[3400, 2100], [3300, 1500]],
    [[3400, 2100], [3250, 2600]],
    [[3850, 2500], [4500, 2550], [4950, 2600]],
    [[3950, 1300], [4950, 1450]]
  ];
  var quadCamps = [{ p: [3300, 1480], type: 'golem' }, { p: [3250, 2600], type: 'wolves' }, { p: [4480, 2550], type: 'wraith' }];
  var maps4 = [function (p) { return p; }, mxp, myp, function (p) { return mxp(myp(p)); }];
  var camps = [];
  maps4.forEach(function (f) {
    quad.forEach(function (p) { shapes.push({ pts: p.map(f), hw: 150, kind: 'path' }); });
    quadCamps.forEach(function (c) {
      var q = f(c.p);
      shapes.push({ c: q, r: 250, kind: 'camp' });
      camps.push({ x: q[0], y: q[1], type: c.type, side: q[0] < W / 2 ? 0 : 1 });
    });
  });
  var bosses = [{ x: 5000, y: 1450, type: 'titan' }, { x: 5000, y: 4950, type: 'hoard' }];
  bosses.forEach(function (b) { shapes.push({ c: [b.x, b.y], r: 360, kind: 'pit' }); });

  function distPoly(pts, x, y) {
    var best = 1e18;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var t = ((x - ax) * dx + (y - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
      var px = ax + dx * t, py = ay + dy * t, d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  function inShapes(x, y, margin) {
    if (x < 70 || y < 70 || x > W - 70 || y > H - 70) return false;
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      if (s.c) { if (Math.hypot(x - s.c[0], y - s.c[1]) < s.r - margin) return true; }
      else if (distPoly(s.pts, x, y) < s.hw - margin) return true;
    }
    return false;
  }

  var grid = new Uint8Array(GW * GH);
  for (var gy = 0; gy < GH; gy++) for (var gx = 0; gx < GW; gx++) {
    grid[gy * GW + gx] = inShapes(gx * CELL + CELL / 2, gy * CELL + CELL / 2, 20) ? 1 : 0;
  }
  function isWalk(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return grid[((y / CELL) | 0) * GW + ((x / CELL) | 0)] === 1;
  }
  function los(x0, y0, x1, y1) {
    var d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 25);
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      if (!isWalk(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }
  function nearestWalk(x, y) {
    if (isWalk(x, y)) return [x, y];
    var cx = Math.max(0, Math.min(GW - 1, (x / CELL) | 0)), cy = Math.max(0, Math.min(GH - 1, (y / CELL) | 0));
    for (var r = 1; r < 40; r++) {
      var best = null, bd = 1e18;
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        var gx2 = cx + dx, gy2 = cy + dy;
        if (gx2 < 0 || gy2 < 0 || gx2 >= GW || gy2 >= GH || !grid[gy2 * GW + gx2]) continue;
        var px = gx2 * CELL + 25, py = gy2 * CELL + 25, d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < bd) { bd = d; best = [px, py]; }
      }
      if (best) return best;
    }
    return [x, y];
  }

  /* A* (8방향, 모서리 가로지르기 금지) */
  var N = GW * GH;
  var gS = new Float32Array(N), from = new Int32Array(N), seen = new Uint32Array(N), done = new Uint32Array(N), gen = 0;
  var hI = new Int32Array(N * 4), hF = new Float32Array(N * 4), hn = 0;
  function hpush(i, f) {
    var k = hn++; hI[k] = i; hF[k] = f;
    while (k > 0) { var p = (k - 1) >> 1; if (hF[p] <= hF[k]) break; var ti = hI[p], tf = hF[p]; hI[p] = hI[k]; hF[p] = hF[k]; hI[k] = ti; hF[k] = tf; k = p; }
  }
  function hpop() {
    var top = hI[0]; hn--;
    if (hn > 0) {
      hI[0] = hI[hn]; hF[0] = hF[hn];
      var k = 0;
      for (;;) {
        var l = k * 2 + 1, r = l + 1, m = k;
        if (l < hn && hF[l] < hF[m]) m = l;
        if (r < hn && hF[r] < hF[m]) m = r;
        if (m === k) break;
        var ti = hI[m], tf = hF[m]; hI[m] = hI[k]; hF[m] = hF[k]; hI[k] = ti; hF[k] = tf; k = m;
      }
    }
    return top;
  }
  var DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  function findPath(x0, y0, x1, y1) {
    var s = nearestWalk(x0, y0), e = nearestWalk(x1, y1);
    var goalExact = isWalk(x1, y1);
    var sx = (s[0] / CELL) | 0, sy = (s[1] / CELL) | 0, ex = (e[0] / CELL) | 0, ey = (e[1] / CELL) | 0;
    var si = sy * GW + sx, ei = ey * GW + ex;
    if (si === ei) return [[goalExact ? x1 : e[0], goalExact ? y1 : e[1]]];
    gen++; hn = 0;
    gS[si] = 0; from[si] = -1; seen[si] = gen; hpush(si, 0);
    var found = false;
    while (hn > 0) {
      var c = hpop();
      if (done[c] === gen) continue;
      done[c] = gen;
      if (c === ei) { found = true; break; }
      var cx = c % GW, cy = (c / GW) | 0;
      for (var k = 0; k < 8; k++) {
        var nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        var ni = ny * GW + nx;
        if (!grid[ni] || done[ni] === gen) continue;
        if (k >= 4 && (!grid[cy * GW + nx] || !grid[ny * GW + cx])) continue;
        var ng = gS[c] + (k >= 4 ? 1.4142 : 1);
        if (seen[ni] !== gen || ng < gS[ni]) {
          gS[ni] = ng; from[ni] = c; seen[ni] = gen;
          var hx = Math.abs(nx - ex), hy = Math.abs(ny - ey);
          hpush(ni, ng + (hx > hy ? hx + 0.4142 * hy : hy + 0.4142 * hx));
        }
      }
    }
    if (!found) return [[e[0], e[1]]];
    var cells = [];
    for (var c2 = ei; c2 !== -1; c2 = from[c2]) cells.push([(c2 % GW) * CELL + 25, ((c2 / GW) | 0) * CELL + 25]);
    cells.reverse();
    cells[0] = [x0, y0];
    if (goalExact) cells[cells.length - 1] = [x1, y1];
    /* 시야선으로 경로를 곧게 편다 */
    var out = [], i = 0, last = cells.length - 1;
    while (i < last) {
      var j = Math.min(last, i + 48);
      while (j > i + 1 && !los(cells[i][0], cells[i][1], cells[j][0], cells[j][1])) j--;
      out.push(cells[j]); i = j;
    }
    return out;
  }

  /* 점령 지점: 위·아래 공격로 길에 3곳씩, 한가운데 '심장' 1곳. 양 끝 둘은 시작할 때 각 팀 것이다 */
  var nodes = [];
  ['top', 'bot'].forEach(function (k) {
    [0.27, 0.5, 0.73].forEach(function (f) {
      var p = laneAt(lanes[k], lanes[k].len * f);
      nodes.push({ x: p.x, y: p.y, lane: k, heart: false, start: f < 0.4 ? 0 : f > 0.6 ? 1 : -1 });
    });
  });
  nodes.push({ x: W / 2, y: H / 2, lane: 'mid', heart: true, start: -1 });

  return {
    nodes: nodes, W: W, H: H, CELL: CELL, GW: GW, GH: GH, grid: grid, shapes: shapes, lanes: lanes, river: river,
    BASE: BASE, FOUNT: FOUNT, CORE: CORE, camps: camps, bosses: bosses,
    laneAt: laneAt, laneProj: laneProj, isWalk: isWalk, los: los, findPath: findPath, nearestWalk: nearestWalk
  };
})();
