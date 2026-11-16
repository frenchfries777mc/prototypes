'use strict';
/* 로드스타 — 캐릭터 그리기: 영웅 8명, 병사 3종, 정글 몬스터.
   모든 그림은 발끝을 (0,0), 위쪽을 -y, 오른쪽을 정면으로 둔 국소 좌표에서 그린 뒤 뒤집고 키운다.
   같은 함수로 전장, 초상화, 메뉴 미리보기를 모두 그린다. */

var Spr = (function () {
  var INK = '#0b1114', TAU = Math.PI * 2;

  /* ── 기본 도형 ── */
  function circ(c, x, y, r, fill, lw) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.lineWidth = lw === undefined ? 2.4 : lw; c.strokeStyle = INK; if (c.lineWidth > 0) c.stroke();
  }
  function ell(c, x, y, rx, ry, fill, lw, rot) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.lineWidth = lw === undefined ? 2.4 : lw; c.strokeStyle = INK; if (c.lineWidth > 0) c.stroke();
  }
  function path(c, pts, fill, lw, open) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    if (!open) c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.lineWidth = lw === undefined ? 2.4 : lw; c.strokeStyle = INK; c.lineJoin = 'round';
    if (c.lineWidth > 0) c.stroke();
  }
  function limb(c, x0, y0, x1, y1, w, col) {
    c.lineCap = 'round';
    c.strokeStyle = INK; c.lineWidth = w + 4.4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* 두 마디 팔다리: 어깨(고관절)에서 손(발)까지, 관절이 자연스럽게 꺾인다 */
  function ik(sx, sy, hx, hy, l1, l2, dir) {
    var dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 0.01, m = Math.min(d, l1 + l2 - 0.5);
    if (d > m) { dx *= m / d; dy *= m / d; d = m; hx = sx + dx; hy = sy + dy; }
    var a = Math.atan2(dy, dx), A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), ang = a + dir * A;
    return [sx + Math.cos(ang) * l1, sy + Math.sin(ang) * l1, hx, hy];
  }
  function arm(c, sx, sy, hx, hy, w, col, hand) {
    var e = ik(sx, sy, hx, hy, 15, 15, 1);
    limb(c, sx, sy, e[0], e[1], w, col); limb(c, e[0], e[1], e[2], e[3], w * 0.92, col);
    circ(c, e[2], e[3], w * 0.55 + 1, hand, 2);
    return e;
  }
  function legs(c, k, col, colB, boot, w, hipY) {
    for (var i = 0; i < 2; i++) {
      var back = i === 0, ph = k.ph + (back ? 0 : Math.PI), hx = back ? -4 : 4, hy = -hipY - k.bob;
      var fx = hx + Math.sin(ph) * 11 * k.mv + (back ? -3 : 3) * (1 - k.mv), fy = -Math.max(0, Math.cos(ph)) * 7 * k.mv;
      if (k.dash) { fx = hx + (back ? -15 : 13); fy = back ? -2 : -7; }
      var e = ik(hx, hy, fx, fy, 18, 18, -1), cc = back ? colB : col;
      limb(c, hx, hy, e[0], e[1], w, cc); limb(c, e[0], e[1], fx, fy, w * 0.92, cc);
      path(c, [[fx - 5, fy - 6], [fx + 3, fy - 7], [fx + 12, fy - 1], [fx + 12, fy + 2.5], [fx - 5, fy + 2.5]], boot);
    }
  }
  function eye(c, x, y, col) { ell(c, x, y, 1.9, 2.8, col || '#101820', 0); ell(c, x + 0.6, y - 1, 0.8, 1, '#ffffff', 0); }
  function glow(c, x, y, r, col, a) {
    var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.globalAlpha = a === undefined ? 1 : a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
  }
  function sweep(c, cx, cy, r, a0, a1, col) {
    c.save(); c.globalAlpha = 0.55; c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = 9;
    c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke(); c.globalAlpha = 0.9; c.lineWidth = 3; c.strokeStyle = '#fff';
    c.beginPath(); c.arc(cx, cy, r, a1 - 0.6, a1); c.stroke(); c.restore();
  }
  /* 자루를 따라 손 위치에서 ang 방향으로 놓인 도구 */
  function at(c, x, y, ang, fn) { c.save(); c.translate(x, y); c.rotate(ang); fn(); c.restore(); }
  /* 공격 진행도 → 휘두르는 각. 예비 동작 뒤 빠르게 내리친다 */
  function swingAng(p, a0, a1) { return p < 0.25 ? lerp(a0 + 0.35, a0 - 0.15, p / 0.25) : lerp(a0 - 0.15, a1, ease((p - 0.25) / 0.75)); }

  /* ───────── 영웅 ───────── */
  var HERO = {};

  HERO.kael = function (c, k) {
    var b = k.bob, S = -62 - b, fl = Math.sin(k.t * 6) * 3 + k.mv * 8;
    path(c, [[-5, S - 1], [-20 - fl, S + 4 + fl * 0.2], [-36 - fl, S + 14 + fl * 0.5], [-18 - fl * 0.6, S + 15], [-3, S + 9]], '#b8332e');
    arm(c, -6, S + 4, -12 - Math.sin(k.ph) * 5 * k.mv, -43 - b, 9, '#8f5f1c', '#f0c9a0');
    legs(c, k, '#6b4a22', '#4d3418', '#2e2018', 10, 33);
    path(c, [[-11, -40 - b], [11, -40 - b], [15, -19], [0, -14], [-15, -20]], '#a82f2a');
    path(c, [[-4, -40 - b], [4, -40 - b], [5, -17], [-5, -17]], '#e8b04a', 1.5);
    path(c, [[-14, S + 1], [14, S + 1], [11, -38 - b], [-11, -38 - b]], '#c98a2b');
    path(c, [[-9, S + 5], [8, S + 5], [7, -48 - b], [-7, -48 - b]], '#e0a548', 0);
    path(c, [[-12, -43 - b], [12, -43 - b], [12, -37 - b], [-12, -37 - b]], '#4e321a', 2);
    circ(c, 0, -40 - b, 3.2, '#ffd76a', 1.5);
    circ(c, -13, S + 3, 8.5, '#f0c060'); circ(c, 13, S + 3, 8.5, '#f0c060');
    circ(c, 1, -76 - b, 11, '#f0c9a0');
    path(c, [[-11, -78 - b], [-10, -90 - b], [-3, -88 - b], [1, -96 - b], [6, -89 - b], [12, -91 - b], [12, -80 - b], [8, -83 - b], [-4, -81 - b]], '#3b2a20');
    path(c, [[-11.5, -79 - b], [12, -80.5 - b], [12, -76 - b], [-11.5, -75 - b]], '#b8332e', 1.6);
    eye(c, 6, -72 - b);
    var ang, e;
    if (k.atk >= 0) ang = swingAng(k.atk, -2.3, 0.9); else if (k.dash) ang = 0.1; else ang = -1.15 - k.cast * 0.5 + Math.sin(k.t * 2) * 0.03;
    e = arm(c, 6, S + 4, 6 + Math.cos(ang) * 17, S + 12 + Math.sin(ang) * 17, 9.5, '#8f5f1c', '#f0c9a0');
    if (k.atk > 0.18 && k.atk < 0.85) sweep(c, 6, S + 8, 50, ang - 1.1, ang, '#ffe9a8');
    at(c, e[2], e[3], ang, function () {
      path(c, [[-12, -2.5], [2, -2.5], [2, 2.5], [-12, 2.5]], '#4e321a', 2);
      path(c, [[1, -9], [5, -9], [5, 9], [1, 9]], '#e8b04a', 2);
      path(c, [[5, -5.5], [52, -6.5], [64, 0], [52, 6.5], [5, 5.5]], '#d8e2e8');
      path(c, [[6, -1], [58, -0.5], [58, 0.5], [6, 1.5]], '#fff', 0);
      path(c, [[6, 1.5], [54, 1.5], [52, 6.5], [5, 5.5]], '#a9b7bf', 0);
    });
  };

  HERO.lyra = function (c, k) {
    var b = k.bob, S = -62 - b, fl = Math.sin(k.t * 5) * 2.5 + k.mv * 7;
    path(c, [[-6, S], [-22 - fl, -34], [-26 - fl, -12 + fl * 0.3], [-4, -20], [6, -30]], '#2a6f95');
    path(c, [[-8, S - 1], [-17, S + 5], [-11, -32 - b], [-5, -38 - b]], '#6b4a2a');
    for (var q = 0; q < 3; q++) path(c, [[-13 + q * 2, S + 1 - q * 2], [-15 + q * 2, S - 9 - q * 2], [-12 + q * 2, S + 0 - q * 2]], '#f4f0e0', 1.2);
    legs(c, k, '#3d6178', '#2d4a5c', '#5a3a22', 9, 33);
    path(c, [[-11, S + 1], [11, S + 1], [10, -38 - b], [-10, -38 - b]], '#e9f3f6');
    path(c, [[-10, -45 - b], [10, -45 - b], [10, -40 - b], [-10, -40 - b]], '#2f7fa8', 2);
    path(c, [[-10, -38 - b], [10, -38 - b], [13, -22], [-13, -22]], '#2f7fa8');
    path(c, [[-12, S + 1], [12, S + 1], [8, S + 8], [-8, S + 8]], '#7fd4ff');
    circ(c, -1, -77 - b, 13.5, '#2a6f95');
    path(c, [[-8, -70 - b], [-18, -56 - b], [-14, -48 - b], [-6, -62 - b]], '#f2d977');
    circ(c, 3, -76 - b, 10.5, '#f4d6bc');
    path(c, [[-8, -78 - b], [2, -90 - b], [14, -80 - b], [15, -83 - b], [4, -94 - b], [-9, -86 - b]], '#2f7fa8');
    path(c, [[-6, -80 - b], [4, -85 - b], [12, -79 - b], [8, -78 - b], [0, -80 - b]], '#f2d977', 1.5);
    eye(c, 8, -75 - b, '#1b6e9c');
    var pull = 0;
    if (k.atk >= 0) pull = k.atk < 0.5 ? k.atk / 0.5 : clamp(1 - (k.atk - 0.5) / 0.12, 0, 1);
    var lift = Math.sin(k.cast * Math.PI) * 10, bx = 23, by = -52 - b - lift;
    arm(c, -3, S + 4, bx - 2 - pull * 15, by, 8.5, '#e9f3f6', '#f4d6bc');
    c.lineCap = 'round';
    c.strokeStyle = INK; c.lineWidth = 7.4; c.beginPath(); c.moveTo(bx, by - 30); c.quadraticCurveTo(bx + 17, by, bx, by + 30); c.stroke();
    c.strokeStyle = '#a8703a'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(bx, by - 30); c.quadraticCurveTo(bx + 17, by, bx, by + 30); c.stroke();
    c.strokeStyle = '#f6f6f0'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(bx, by - 30); c.lineTo(bx - pull * 15, by); c.lineTo(bx, by + 30); c.stroke();
    if (k.atk >= 0 && k.atk < 0.6) {
      c.strokeStyle = INK; c.lineWidth = 4.4; c.beginPath(); c.moveTo(bx - pull * 15, by); c.lineTo(bx + 34, by); c.stroke();
      c.strokeStyle = '#e8eef0'; c.lineWidth = 2; c.stroke();
      path(c, [[bx + 34, by - 3.5], [bx + 42, by], [bx + 34, by + 3.5]], '#7fd4ff', 1.5);
    }
    arm(c, 4, S + 4, bx, by + 2, 9, '#e9f3f6', '#f4d6bc');
  };

  HERO.morgen = function (c, k) {
    var b = k.bob, S = -62 - b, sw = Math.sin(k.t * 3) * 2 + k.mv * Math.sin(k.ph) * 4;
    legs(c, k, '#2a3570', '#222b5a', '#1a1f40', 9, 33);
    path(c, [[-12, S + 1], [12, S + 1], [18 + sw, -14], [22 + sw, -2], [-22 + sw, -2], [-18 + sw, -14]], '#3b4ea0');
    path(c, [[-18 + sw, -14], [18 + sw, -14], [22 + sw, -2], [-22 + sw, -2]], '#9fb8ff', 0);
    path(c, [[-20 + sw, -5], [20 + sw, -5], [22 + sw, -2], [-22 + sw, -2]], '#dff3ff', 1.6);
    path(c, [[-2, S + 8], [2, S + 8], [3, -12], [-3, -12]], '#6d82d8', 0);
    path(c, [[-14, S - 1], [14, S - 1], [11, S + 14], [-11, S + 14]], '#dff3ff');
    for (var q = -1; q <= 1; q++) { circ(c, q * 6, S + 7 + (q ? 0 : 2), 1.6, '#7fb0e8', 0); }
    path(c, [[-10, -43 - b], [10, -43 - b], [10, -39 - b], [-10, -39 - b]], '#c9d8ff', 2);
    circ(c, 0, -41 - b, 3, '#9ff1ff', 1.5);
    arm(c, -5, S + 5, -12 - Math.sin(k.ph) * 4 * k.mv, -42 - b, 9, '#2f3f8c', '#dbe5f2');
    circ(c, 1, -76 - b, 11, '#dbe5f2');
    path(c, [[-6, -70 - b], [10, -70 - b], [8, -58 - b], [1, -52 - b], [-5, -60 - b]], '#f4f8ff');
    path(c, [[-14, -72 - b], [-12, -90 - b], [-2, -108 - b], [6, -104 - b], [14, -88 - b], [13, -72 - b], [6, -82 - b], [-6, -80 - b]], '#3b4ea0');
    path(c, [[-12, -88 - b], [13, -88 - b], [14, -85 - b], [-13, -83 - b]], '#9fb8ff', 1.6);
    path(c, [[-2, -108 - b], [-6, -118 - b - Math.sin(k.t * 2) * 2], [6, -104 - b]], '#9fb8ff', 1.8);
    eye(c, 6.5, -75 - b, '#22a8e0');
    var lift = Math.sin(k.cast * Math.PI) * 26, px = 21, hand = -50 - b - lift - (k.atk >= 0 ? Math.sin(k.atk * Math.PI) * 6 : 0);
    var lean = k.atk >= 0 ? Math.sin(k.atk * Math.PI) * 0.22 : 0;
    c.save(); c.translate(px, hand); c.rotate(lean);
    limb(c, 0, 56, 0, -60, 3.8, '#7d5a30');
    path(c, [[-4, -60], [0, -74], [4, -60], [0, -50]], '#bfe9ff', 2);
    glow(c, 0, -62, 20 + (k.atk >= 0 ? 12 : 0) + k.cast * 18, '#9ff1ff', 0.55 + Math.sin(k.t * 4) * 0.1);
    c.restore();
    arm(c, 4, S + 5, px, hand + 2 + 8, 9, '#2f3f8c', '#dbe5f2');
  };

  HERO.brom = function (c, k) {
    var b = k.bob, S = -64 - b;
    path(c, [[-34, -64 - b], [-18, -68 - b], [-14, -26], [-30, -22]], '#6b5d44');
    path(c, [[-31, -60 - b], [-20, -63 - b], [-17, -30], [-28, -27]], '#8f7e5e', 0);
    circ(c, -24, -45 - b, 5, '#c9b78a', 1.8);
    legs(c, k, '#6b5d44', '#4d4331', '#2d261a', 13, 32);
    path(c, [[-18, -34 - b], [18, -34 - b], [20, -17], [0, -12], [-20, -18]], '#4a3a2a');
    path(c, [[-20, S], [20, S], [17, -36 - b], [-17, -36 - b]], '#8a7a5c');
    path(c, [[-14, S + 4], [14, S + 4], [12, -48 - b], [-12, -48 - b]], '#b9a27a', 0);
    path(c, [[-18, -44 - b], [18, -44 - b], [18, -37 - b], [-18, -37 - b]], '#4a3a2a', 2);
    path(c, [[-3, S + 4], [3, S + 4], [4, -36 - b], [-4, -36 - b]], '#6b5d44', 0);
    path(c, [[-27, S + 3], [-12, S - 4], [-8, S + 12], [-22, S + 18]], '#9d8a66');
    path(c, [[27, S + 3], [12, S - 4], [8, S + 12], [22, S + 18]], '#b9a27a');
    circ(c, 0, -76 - b, 12, '#c99a76');
    path(c, [[-9, -72 - b], [11, -72 - b], [10, -58 - b], [0, -52 - b], [-8, -58 - b]], '#5a3f28');
    path(c, [[-14, -78 - b], [-12, -92 - b], [0, -97 - b], [13, -92 - b], [14, -78 - b], [9, -80 - b], [8, -84 - b], [-6, -84 - b], [-9, -80 - b]], '#8a7a5c');
    path(c, [[-2, -97 - b], [2, -97 - b], [3, -85 - b], [-3, -85 - b]], '#c9b78a', 1.6);
    path(c, [[-14, -90 - b], [-23, -97 - b], [-19, -85 - b]], '#e8e0c8', 1.8);
    path(c, [[14, -90 - b], [23, -97 - b], [19, -85 - b]], '#e8e0c8', 1.8);
    eye(c, 6, -75 - b, '#2a1a10');
    var ang, e;
    if (k.atk >= 0) ang = swingAng(k.atk, -2.2, 1.1); else if (k.dash) ang = 0.3; else ang = -1.2 - k.cast * 0.6;
    e = arm(c, 8, S + 6, 8 + Math.cos(ang) * 18, S + 14 + Math.sin(ang) * 18, 12, '#6b5d44', '#c99a76');
    if (k.atk > 0.2 && k.atk < 0.9) sweep(c, 8, S + 10, 56, ang - 1.1, ang, '#e6d3a8');
    at(c, e[2], e[3], ang, function () {
      path(c, [[-16, -3], [50, -3], [50, 3], [-16, 3]], '#5a3f28', 2);
      path(c, [[44, -17], [74, -17], [74, 17], [44, 17]], '#9d8a66');
      path(c, [[48, -13], [70, -13], [70, -4], [48, -4]], '#c9b78a', 0);
      path(c, [[44, -17], [74, -17], [74, -12], [44, -12]], '#6b5d44', 1.4);
    });
  };

  HERO.sera = function (c, k) {
    var b = k.bob, S = -62 - b, sw = Math.sin(k.t * 3) * 2 + k.mv * Math.sin(k.ph) * 4;
    var wing = Math.sin(k.t * 2.4) * 3;
    glow(c, -8, S + 8, 40, 'rgba(255,224,138,.5)', 0.8);
    path(c, [[-6, S + 4], [-30, S - 14 - wing], [-44, S - 6 - wing], [-26, S + 12], [-38, S + 20], [-12, S + 20]], 'rgba(255,238,170,.85)', 1.8);
    legs(c, k, '#d9b45a', '#b99440', '#7a5a1c', 9, 33);
    path(c, [[-11, S + 1], [11, S + 1], [17 + sw, -14], [21 + sw, -2], [-21 + sw, -2], [-17 + sw, -14]], '#fff3c8');
    path(c, [[-3, S + 8], [3, S + 8], [4, -10], [-4, -10]], '#f4cf6a', 1.6);
    path(c, [[-20 + sw, -6], [20 + sw, -6], [21 + sw, -2], [-21 + sw, -2]], '#d49a2a', 1.6);
    path(c, [[-12, S + 1], [12, S + 1], [10, -38 - b], [-10, -38 - b]], '#fff8dc');
    path(c, [[-10, -43 - b], [10, -43 - b], [10, -39 - b], [-10, -39 - b]], '#d49a2a', 2);
    circ(c, 0, -41 - b, 3, '#ffe08a', 1.5);
    path(c, [[-13, S - 1], [13, S - 1], [10, S + 10], [-10, S + 10]], '#f4cf6a');
    path(c, [[-6, -70 - b], [-18, -56 - b], [-24, -34 - b], [-14, -30 - b], [-8, -52 - b]], '#c0782a');
    arm(c, -5, S + 5, -12 - Math.sin(k.ph) * 4 * k.mv, -42 - b, 8.5, '#fff3c8', '#f6d9c0');
    var hy = -77 - b;
    c.save(); c.globalAlpha = 0.95; c.strokeStyle = INK; c.lineWidth = 7.6; c.beginPath(); c.ellipse(1, hy - 17, 14, 4.6, 0, 0, TAU); c.stroke();
    c.strokeStyle = '#ffe08a'; c.lineWidth = 4; c.beginPath(); c.ellipse(1, hy - 17, 14, 4.6, 0, 0, TAU); c.stroke(); c.restore();
    circ(c, 1, hy, 11, '#f6d9c0');
    path(c, [[-12, hy + 2], [-12, hy - 10], [-3, hy - 15], [8, hy - 13], [13, hy - 5], [11, hy - 3], [4, hy - 7], [-4, hy - 5]], '#c0782a');
    eye(c, 6.5, hy + 3, '#b36a14');
    var lift = Math.sin(k.cast * Math.PI) * 24, px = 21, hand = -50 - b - lift - (k.atk >= 0 ? Math.sin(k.atk * Math.PI) * 6 : 0);
    c.save(); c.translate(px, hand);
    limb(c, 0, 56, 0, -58, 3.6, '#d9b45a');
    circ(c, 0, -66, 9, '#fff3c8', 2.2);
    glow(c, 0, -66, 24 + k.cast * 16 + (k.atk >= 0 ? 10 : 0), '#ffe08a', 0.7 + Math.sin(k.t * 4) * 0.1);
    for (var r = 0; r < 8; r++) { var a = r * TAU / 8 + k.t; limb(c, Math.cos(a) * 11, -66 + Math.sin(a) * 11, Math.cos(a) * 16, -66 + Math.sin(a) * 16, 1.6, '#ffe08a'); }
    c.restore();
    arm(c, 4, S + 5, px, hand + 10, 8.5, '#fff3c8', '#f6d9c0');
  };

  HERO.nyx = function (c, k) {
    var b = k.bob - (k.mv ? 2 : 0), S = -60 - b, fl = Math.sin(k.t * 7) * 4 + k.mv * 10;
    path(c, [[-6, S - 2], [-24 - fl, S - 6 + fl * 0.3], [-46 - fl, S + 6 + fl * 0.7], [-28 - fl, S + 8], [-4, S + 8]], '#c58bff');
    path(c, [[-6, S + 8], [-22 - fl, S + 12], [-38 - fl, S + 24 + fl * 0.5], [-18 - fl, S + 18]], '#8a56c8', 1.8);
    arm(c, -4, S + 4, -10 - Math.sin(k.ph) * 5 * k.mv, -42 - b, 8, '#2c1f45', '#cdb7e0');
    legs(c, k, '#2c1f45', '#1f1632', '#15101f', 8.4, 32);
    path(c, [[-10, -38 - b], [10, -38 - b], [12, -22], [-12, -22]], '#3a2a5a');
    path(c, [[-11, S + 1], [11, S + 1], [9, -36 - b], [-9, -36 - b]], '#3a2a5a');
    path(c, [[-7, S + 5], [7, S + 5], [5, -46 - b], [-5, -46 - b]], '#4d3a78', 0);
    path(c, [[-10, -42 - b], [10, -42 - b], [10, -38 - b], [-10, -38 - b]], '#8a56c8', 1.8);
    path(c, [[-12, S - 1], [12, S - 1], [9, S + 8], [-9, S + 8]], '#8a56c8');
    circ(c, 1, -75 - b, 11, '#2c1f45');
    path(c, [[-13, -72 - b], [-11, -91 - b], [-1, -99 - b - 2], [11, -91 - b], [14, -72 - b], [6, -80 - b], [-5, -80 - b]], '#3a2a5a');
    path(c, [[-6, -75 - b], [11, -75 - b], [10, -67 - b], [-3, -66 - b]], '#cdb7e0');
    path(c, [[-3, -69 - b], [11, -69 - b], [10, -66 - b], [-3, -65 - b]], '#3a2a5a', 0);
    ell(c, 6, -74 - b, 2.4, 2.1, '#ff6ad5', 0); glow(c, 6, -74 - b, 7, '#ff6ad5', 0.6);
    var p = k.atk, f = 0, bk = 0;
    if (p >= 0) { var q = k.alt ? 1 : -1; f = q > 0 ? ease(Math.sin(p * Math.PI)) : 0; bk = q < 0 ? ease(Math.sin(p * Math.PI)) : 0; }
    var thrust = k.dash ? 14 : 0;
    var h1 = [20 + f * 22 + thrust, -50 - b + Math.sin(k.cast * Math.PI) * -12], h2 = [-2 + bk * 22 + thrust, -48 - b];
    arm(c, -3, S + 4, h2[0], h2[1], 8, '#2c1f45', '#cdb7e0');
    function dagger(x, y, ang) {
      at(c, x, y, ang, function () {
        path(c, [[-6, -2], [3, -2], [3, 2], [-6, 2]], '#15101f', 1.6);
        path(c, [[3, -6], [6, -6], [6, 6], [3, 6]], '#8a56c8', 1.6);
        path(c, [[6, -3.4], [30, -1], [38, 1.6], [6, 3.4]], '#dfe6f4', 1.8);
        path(c, [[6, 1.6], [32, 1.6], [38, 1.6], [6, 3.4]], '#98a4c0', 0);
      });
    }
    dagger(h2[0], h2[1], -0.4 + bk * 0.9);
    if (k.atk > 0.15 && k.atk < 0.8) sweep(c, h1[0] - 6, h1[1], 30, -1.1, 1.0, '#e8c8ff');
    arm(c, 4, S + 4, h1[0], h1[1], 8.5, '#2c1f45', '#cdb7e0');
    dagger(h1[0], h1[1], -0.2 + f * 0.6);
  };

  HERO.ignis = function (c, k) {
    var b = k.bob, S = -62 - b, fl = Math.sin(k.t * 6) * 3 + k.mv * 6;
    path(c, [[-6, S - 2], [-22 - fl, S + 2], [-30 - fl, -24], [-10, -22]], '#b53f12');
    path(c, [[-14, S + 2], [-6, S - 6], [-2, S + 4], [-12, -36 - b]], '#5a4630');
    circ(c, -14, S - 2, 6, '#7a5a3c'); glow(c, -14, S - 2, 14, '#ffb050', 0.7);
    legs(c, k, '#3a2a22', '#2a1d18', '#5a3a22', 9.5, 33);
    path(c, [[-11, -38 - b], [11, -38 - b], [17, -16], [-17, -16]], '#c9501c');
    path(c, [[-13, S], [13, S], [10, -36 - b], [-10, -36 - b]], '#c9501c');
    path(c, [[-8, S + 4], [8, S + 4], [6, -46 - b], [-6, -46 - b]], '#ff8a4c', 0);
    for (var q = 0; q < 3; q++) circ(c, 3, S + 10 + q * 7, 1.8, '#ffd76a', 1.2);
    path(c, [[-11, -43 - b], [11, -43 - b], [11, -37 - b], [-11, -37 - b]], '#4a2a14', 2);
    path(c, [[-14, S - 3], [14, S - 3], [12, S + 8], [-12, S + 8]], '#ff8a4c');
    arm(c, -4, S + 5, -10 - Math.sin(k.ph) * 4 * k.mv, -42 - b, 9, '#a53f14', '#e8b890');
    circ(c, 1, -76 - b, 11, '#e8b890');
    var fk = Math.sin(k.t * 9) * 2;
    path(c, [[-10, -80 - b], [-14, -92 - b], [-8, -98 - b + fk], [-5, -108 - b], [1, -100 - b - fk], [6, -112 - b], [10, -100 - b + fk], [15, -104 - b], [13, -88 - b], [10, -80 - b], [2, -84 - b]], '#ff6a2a');
    path(c, [[-4, -88 - b], [1, -102 - b], [6, -88 - b]], '#ffd76a', 0);
    path(c, [[-12, -82 - b], [13, -83 - b], [13, -78 - b], [-12, -77 - b]], '#4a2a14', 1.8);
    circ(c, 0, -80 - b, 5.4, '#ffd76a', 2); circ(c, 0, -80 - b, 2.6, '#7fd4ff', 0);
    circ(c, 8, -80 - b, 4.6, '#ffd76a', 2); circ(c, 8, -80 - b, 2.2, '#7fd4ff', 0);
    path(c, [[3, -70 - b], [9, -68 - b], [7, -66 - b]], '#7a4a2a', 1.4);
    var rec = k.atk >= 0 ? Math.sin(k.atk * Math.PI) * 7 : 0, lift = Math.sin(k.cast * Math.PI) * 20;
    var gx = 21 - rec, gy = -52 - b - lift;
    arm(c, 5, S + 5, gx, gy, 9.5, '#a53f14', '#e8b890');
    at(c, gx, gy, -0.06, function () {
      path(c, [[-12, 3], [-3, 3], [-2, 13], [-10, 13]], '#4a2a14', 1.8);
      path(c, [[-14, -8], [26, -7], [30, -10], [44, -10], [44, 4], [30, 4], [26, 6], [-14, 7]], '#c9a14a');
      path(c, [[-12, -6], [24, -5], [24, -2], [-12, -2]], '#f0d37a', 0);
      path(c, [[26, -7], [30, -10], [44, -10], [46, -13], [46, 7], [44, 4], [30, 4], [26, 6]], '#8a6a2a', 1.8);
      circ(c, 4, -8, 4.2, '#ff8a4c', 1.8);
      if (k.atk >= 0 && k.atk < 0.45) { glow(c, 52, -3, 24, '#ffd76a', 1 - k.atk * 1.6); path(c, [[46, -3], [64, -9], [74, -3], [64, 3]], '#ffb050', 0); }
    });
    arm(c, -2, S + 6, gx + 12, gy + 6, 9, '#a53f14', '#e8b890');
  };

  HERO.garr = function (c, k) {
    var b = k.bob, S = -63 - b;
    legs(c, k, '#4a3420', '#34241a', '#2a1c12', 10.4, 33);
    path(c, [[-12, -40 - b], [12, -40 - b], [13, -22], [0, -17], [-13, -22]], '#4a3420');
    for (var q = 0; q < 4; q++) path(c, [[-12 + q * 6, -22], [-9 + q * 6, -16], [-6 + q * 6, -22]], '#6b5a3a', 1.4);
    path(c, [[-13, S + 1], [13, S + 1], [11, -38 - b], [-11, -38 - b]], '#c89870');
    path(c, [[-9, S + 5], [8, S + 5], [7, -47 - b], [-7, -47 - b]], '#dcae84', 0);
    path(c, [[-13, S + 1], [-4, -38 - b], [-1, -38 - b], [-10, S + 1]], '#4a3420', 1.6);
    path(c, [[13, S + 1], [4, -38 - b], [1, -38 - b], [10, S + 1]], '#4a3420', 1.6);
    path(c, [[-12, -42 - b], [12, -42 - b], [12, -37 - b], [-12, -37 - b]], '#34241a', 2);
    circ(c, 0, -39.5 - b, 3, '#e8e0c8', 1.5);
    arm(c, -7, S + 4, -13 - Math.sin(k.ph) * 5 * k.mv, -42 - b, 11, '#c89870', '#c89870');
    path(c, [[-22, S - 2], [-8, S - 9], [8, S - 9], [22, S - 2], [24, S + 12], [14, S + 8], [6, S + 16], [-2, S + 9], [-10, S + 17], [-16, S + 9], [-24, S + 13]], '#5f8f3c');
    path(c, [[-17, S - 1], [-6, S - 6], [6, S - 6], [17, S - 1], [8, S + 3], [-8, S + 3]], '#8fcf6a', 0);
    for (var w = 0; w < 5; w++) limb(c, -18 + w * 9, S + 1, -16 + w * 9, S + 10, 1.4, '#46712a');
    circ(c, 1, -77 - b, 11.5, '#c89870');
    path(c, [[-6, -70 - b], [10, -70 - b], [9, -58 - b], [0, -55 - b], [-5, -60 - b]], '#4a3420');
    path(c, [[-13, -78 - b], [-12, -92 - b], [0, -97 - b], [13, -92 - b], [14, -78 - b], [8, -82 - b], [-8, -82 - b]], '#5a4630');
    path(c, [[-12, -89 - b], [-24, -98 - b], [-26, -112 - b], [-17, -102 - b], [-8, -94 - b]], '#e8e0c8', 1.8);
    path(c, [[12, -89 - b], [24, -98 - b], [26, -112 - b], [17, -102 - b], [8, -94 - b]], '#e8e0c8', 1.8);
    path(c, [[7, -81 - b], [12, -73 - b], [10, -72 - b], [6, -78 - b]], '#7a2a20', 0);
    eye(c, 6.5, -76 - b, '#2a1a10');
    var ang, e;
    if (k.atk >= 0) ang = swingAng(k.atk, -2.2, 1.0); else if (k.dash) ang = 0.4; else ang = -1.1 - k.cast * 0.5;
    e = arm(c, 7, S + 5, 7 + Math.cos(ang) * 18, S + 13 + Math.sin(ang) * 18, 11, '#c89870', '#c89870');
    if (k.atk > 0.18 && k.atk < 0.85) sweep(c, 7, S + 10, 54, ang - 1.1, ang, '#cdf0a8');
    at(c, e[2], e[3], ang, function () {
      path(c, [[-16, -2.6], [52, -2.6], [52, 2.6], [-16, 2.6]], '#5a3f28', 2);
      path(c, [[40, -3], [52, -22], [68, -26], [74, -12], [68, 4], [52, 3]], '#cfd8dc');
      path(c, [[50, -15], [66, -20], [70, -11], [52, -3]], '#f4f8fa', 0);
      path(c, [[40, 3], [52, 22], [68, 26], [74, 12], [68, -4], [52, -3]], '#b5c0c6');
      circ(c, 8, 0, 3, '#e8e0c8', 1.5);
    });
  };

  /* ───────── 병사 ───────── */
  var MIN = {};
  MIN.melee = function (c, k, tc) {
    var b = k.bob;
    legs(c, k, '#5a5f66', '#43484e', '#2d3036', 9, 30);
    path(c, [[-10, -34 - b], [10, -34 - b], [13, -18], [-13, -18]], tc);
    path(c, [[-11, -58 - b], [11, -58 - b], [9, -33 - b], [-9, -33 - b]], '#8a9199');
    path(c, [[-6, -56 - b], [6, -56 - b], [5, -44 - b], [-5, -44 - b]], '#aab2ba', 0);
    path(c, [[-11, -39 - b], [11, -39 - b], [11, -35 - b], [-11, -35 - b]], '#3a3f46', 1.8);
    circ(c, -12, -56 - b, 6, '#aab2ba', 2); circ(c, 12, -56 - b, 6, '#aab2ba', 2);
    circ(c, 1, -70 - b, 10, '#e0b894');
    path(c, [[-11, -70 - b], [-10, -84 - b], [0, -89 - b], [11, -84 - b], [12, -68 - b], [8, -70 - b], [8, -74 - b], [-7, -74 - b], [-8, -70 - b]], '#8a9199');
    path(c, [[-1, -89 - b], [3, -89 - b], [4, -78 - b], [-2, -78 - b]], '#aab2ba', 1.6);
    path(c, [[-2, -89 - b], [4, -99 - b], [8, -88 - b]], tc, 1.8);
    eye(c, 6, -69 - b);
    var ang = k.atk >= 0 ? swingAng(k.atk, -2.0, 0.9) : -1.0;
    var e = arm(c, 6, -56 - b, 6 + Math.cos(ang) * 15, -50 - b + Math.sin(ang) * 15, 8, '#8a9199', '#e0b894');
    at(c, e[2], e[3], ang, function () { path(c, [[-6, -2], [30, -2.4], [36, 0], [30, 2.4], [-6, 2]], '#d8e2e8', 1.8); path(c, [[-4, -5], [-1, -5], [-1, 5], [-4, 5]], '#4e321a', 1.6); });
    arm(c, -5, -56 - b, -4, -42 - b, 8, '#8a9199', '#e0b894');
    ell(c, 2, -42 - b, 9, 12, tc, 2.4); ell(c, 2, -42 - b, 3.4, 4.6, '#e8eef0', 1.8);
  };
  MIN.ranged = function (c, k, tc) {
    var b = k.bob;
    legs(c, k, '#4a4f58', '#383c44', '#2d3036', 8.4, 29);
    path(c, [[-9, -32 - b], [9, -32 - b], [12, -12], [-12, -12]], tc);
    path(c, [[-10, -56 - b], [10, -56 - b], [8, -32 - b], [-8, -32 - b]], tc);
    path(c, [[-6, -54 - b], [6, -54 - b], [5, -42 - b], [-5, -42 - b]], '#ffffff', 0);
    path(c, [[-10, -40 - b], [10, -40 - b], [10, -36 - b], [-10, -36 - b]], '#2a2f36', 1.8);
    circ(c, 0, -66 - b, 12, tc, 2.4);
    circ(c, 2, -66 - b, 8.4, '#e0b894');
    path(c, [[-10, -68 - b], [-2, -80 - b], [10, -70 - b], [4, -73 - b], [-4, -72 - b]], tc, 1.8);
    eye(c, 6.4, -65 - b);
    var lift = k.atk >= 0 ? Math.sin(k.atk * Math.PI) * 7 : 0, px = 16;
    arm(c, -4, -52 - b, -8, -40 - b, 7.4, tc, '#e0b894');
    c.save(); c.translate(px, -46 - b - lift); limb(c, 0, 34, 0, -42, 3, '#7d5a30'); circ(c, 0, -46, 6.4, '#ffffff', 2); glow(c, 0, -46, 16 + (k.atk >= 0 ? 8 : 0), tc, 0.75); c.restore();
    arm(c, 4, -52 - b, px, -44 - b - lift, 7.4, tc, '#e0b894');
  };
  MIN.siege = function (c, k, tc) {
    var b = Math.abs(Math.sin(k.ph * 0.5)) * 1.4 * k.mv, rot = k.ph * 0.5;
    path(c, [[-26, -22 - b], [26, -22 - b], [22, -8 - b], [-22, -8 - b]], '#7d5a30');
    path(c, [[-24, -20 - b], [24, -20 - b], [24, -16 - b], [-24, -16 - b]], '#a07840', 0);
    path(c, [[-26, -24 - b], [26, -24 - b], [26, -20 - b], [-26, -20 - b]], tc, 2);
    var rec = k.atk >= 0 ? Math.sin(k.atk * Math.PI) * 8 : 0;
    at(c, 4 - rec, -30 - b, -0.3, function () {
      path(c, [[-18, -8], [32, -11], [38, -14], [38, 14], [32, 11], [-18, 8]], '#5a5f66');
      path(c, [[-16, -6], [30, -8], [30, -4], [-16, -3]], '#8a9199', 0);
      path(c, [[30, -12], [40, -15], [40, 15], [30, 12]], '#3a3f46', 1.8);
      if (k.atk >= 0 && k.atk < 0.4) glow(c, 46, 0, 22, '#ffd76a', 1 - k.atk * 2.2);
    });
    for (var i = 0; i < 2; i++) {
      var wx = i ? 16 : -16;
      c.save(); c.translate(wx, -9 - b); circ(c, 0, 0, 11, '#5a3f28', 2.6); circ(c, 0, 0, 3.6, '#c9b78a', 1.6);
      for (var s = 0; s < 4; s++) { var a = rot + s * Math.PI / 2; limb(c, 0, 0, Math.cos(a) * 9, Math.sin(a) * 9, 2.2, '#8a6a40'); }
      c.restore();
    }
    limb(c, -18, -26 - b, -18, -52 - b, 2.4, '#5a3f28');
    path(c, [[-18, -52 - b], [-4, -48 - b], [-18, -42 - b]], tc, 1.8);
  };

  /* ───────── 정글 몬스터 ───────── */
  var MON = {};
  MON.small = function (c, k) {
    var b = Math.abs(Math.sin(k.ph)) * 2 * k.mv, ph = k.ph;
    for (var i = 0; i < 4; i++) {
      var fx = (i < 2 ? 14 : -14) + (i % 2 ? 3 : -3), sw = Math.sin(ph + (i % 2) * Math.PI) * 6 * k.mv;
      limb(c, fx, -16 - b, fx + sw, 0, 5.4, i % 2 ? '#6b6f78' : '#50545c');
    }
    var tl = Math.sin(k.t * 5) * 5;
    path(c, [[-20, -26 - b], [-38, -30 - b - tl], [-44, -20 - tl], [-24, -18 - b]], '#7d818a');
    ell(c, 0, -26 - b, 24, 13, '#8a8f98', 2.6);
    ell(c, -2, -22 - b, 16, 6, '#c9ccd2', 0);
    path(c, [[8, -34 - b], [14, -44 - b], [18, -34 - b]], '#6b6f78', 1.8);
    path(c, [[14, -36 - b], [32, -38 - b], [40, -30 - b], [34, -22 - b], [16, -22 - b]], '#8a8f98');
    path(c, [[34, -30 - b], [46, -27 - b], [40, -22 - b], [34, -24 - b]], '#3a3d44', 1.8);
    path(c, [[22, -39 - b], [25, -46 - b], [29, -38 - b]], '#6b6f78', 1.6);
    ell(c, 28, -33 - b, 2.6, 2, '#ffd76a', 1.2);
    path(c, [[34, -24 - b], [36, -19 - b], [38, -24 - b]], '#fff', 1);
  };
  MON.wisp = function (c, k) {
    var f = Math.sin(k.t * 4) * 4 + Math.sin(k.t * 9) * 1.4, y = -34 + f;
    glow(c, 0, y, 38, 'rgba(160,140,255,.7)', 0.9);
    path(c, [[-9, y + 4], [-3, y + 26 + Math.sin(k.t * 7) * 3], [0, y + 14], [4, y + 30], [9, y + 4]], 'rgba(130,110,230,.9)', 1.8);
    circ(c, 0, y, 14, '#b9a6ff', 2.6); circ(c, 0, y - 2, 9, '#e6dcff', 0);
    ell(c, -4.4, y - 2, 2, 3.2, '#2a1a5a', 0); ell(c, 4.4, y - 2, 2, 3.2, '#2a1a5a', 0);
  };
  MON.big = function (c, k) {
    var b = Math.abs(Math.sin(k.ph)) * 2 * k.mv;
    limb(c, -9, -24, -9 + Math.sin(k.ph) * 5 * k.mv, 0, 15, '#6e6a62'); limb(c, 9, -24, 9 - Math.sin(k.ph) * 5 * k.mv, 0, 15, '#5a564f');
    limb(c, -26, -60 - b, -30, -30 - b, 13, '#6e6a62');
    path(c, [[-24, -26 - b], [24, -26 - b], [28, -70 - b], [14, -86 - b], [-14, -86 - b], [-28, -70 - b]], '#8a857a');
    path(c, [[-16, -34 - b], [10, -34 - b], [14, -66 - b], [-4, -78 - b], [-18, -62 - b]], '#a59f92', 0);
    path(c, [[6, -46 - b], [20, -54 - b], [12, -70 - b]], '#5f8f4c', 1.6); path(c, [[-20, -70 - b], [-8, -80 - b], [-14, -58 - b]], '#5f8f4c', 1.6);
    path(c, [[-12, -86 - b], [12, -86 - b], [10, -102 - b], [-10, -102 - b]], '#8a857a');
    ell(c, 4, -94 - b, 3, 2.4, '#ffd76a', 0); ell(c, -4, -94 - b, 3, 2.4, '#ffd76a', 0);
    glow(c, 0, -52 - b, 14, '#ffd76a', 0.45);
    limb(c, 26, -60 - b, 32 + Math.sin(k.ph) * 4, -28 - b, 13, '#8a857a');
    circ(c, 32 + Math.sin(k.ph) * 4, -24 - b, 8, '#a59f92', 2.4);
  };
  function boss(c, k, body, light, core, horn) {
    var b = Math.abs(Math.sin(k.ph)) * 2 * k.mv, br = Math.sin(k.t * 1.6) * 2;
    limb(c, -16, -40, -16 + Math.sin(k.ph) * 6 * k.mv, 0, 22, body); limb(c, 16, -40, 16 - Math.sin(k.ph) * 6 * k.mv, 0, 22, body);
    limb(c, -40, -96 - b, -46, -52 - b, 20, body); circ(c, -46, -46 - b, 12, light, 3);
    path(c, [[-34, -40 - b], [34, -40 - b], [42, -104 - b], [22, -134 - b - br], [-22, -134 - b - br], [-42, -104 - b]], body, 3);
    path(c, [[-24, -52 - b], [14, -52 - b], [22, -98 - b], [-2, -122 - b], [-26, -98 - b]], light, 0);
    glow(c, 0, -88 - b, 30, core, 0.8); path(c, [[0, -104 - b], [10, -88 - b], [0, -72 - b], [-10, -88 - b]], core, 2);
    path(c, [[-20, -134 - b - br], [20, -134 - b - br], [16, -158 - b - br], [-16, -158 - b - br]], body, 3);
    path(c, [[-16, -156 - b - br], [-34, -178 - b - br], [-26, -150 - b - br]], horn, 2.4); path(c, [[16, -156 - b - br], [34, -178 - b - br], [26, -150 - b - br]], horn, 2.4);
    glow(c, 7, -148 - b - br, 8, core, 1); glow(c, -7, -148 - b - br, 8, core, 1);
    limb(c, 40, -96 - b, 48 + Math.sin(k.ph) * 4, -52 - b, 20, body); circ(c, 48 + Math.sin(k.ph) * 4, -46 - b, 12, light, 3);
  }
  MON.titan = function (c, k) { boss(c, k, '#4a4470', '#7068a8', '#9ff1ff', '#cfc8ff'); };
  MON.hoard = function (c, k) { boss(c, k, '#a8801f', '#e8c050', '#fff2a8', '#fff2c0'); };

  /* ───────── 공개 함수 ───────── */
  function begin(c, x, y, s, dir) { c.save(); c.translate(x, y); c.scale(s * dir, s); c.lineJoin = 'round'; c.lineCap = 'round'; }
  function poseOf(k) {
    k = k || {};
    k.t = k.t || 0; k.mv = k.mv || 0; k.ph = k.ph === undefined ? k.t * 11 : k.ph;
    k.bob = k.mv > 0.05 ? Math.abs(Math.sin(k.ph)) * 3.2 * k.mv + Math.sin(k.t * 2) * 0.5 * (1 - k.mv) : Math.sin(k.t * 2) * 1.3;
    k.atk = k.atk === undefined ? -1 : k.atk; k.cast = k.cast || 0;
    return k;
  }
  function hero(c, id, x, y, s, dir, k) { begin(c, x, y, s, dir); HERO[id](c, poseOf(k)); c.restore(); }
  function minion(c, type, x, y, s, dir, tc, k) { begin(c, x, y, s, dir); MIN[type](c, poseOf(k), tc); c.restore(); }
  function monster(c, type, x, y, s, dir, k) { begin(c, x, y, s, dir); MON[type](c, poseOf(k)); c.restore(); }

  /* 초상화: 상반신(bust) 또는 전신. 캔버스를 통째로 채운다 */
  function portrait(cv, id, o) {
    o = o || {}; var c = cv.getContext('2d'), W = cv.width, H = cv.height, col = HEROES[id].color;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    var g = c.createRadialGradient(W * 0.5, H * 0.38, W * 0.04, W * 0.5, H * 0.55, W * 0.85);
    g.addColorStop(0, col); g.addColorStop(0.55, '#16282c'); g.addColorStop(1, '#0b1417');
    c.globalAlpha = o.full ? 0.55 : 0.8; c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    var s = o.full ? H / 124 : H / 64, ty = o.full ? H - H * 0.03 : H + 36 * s;
    var k = o.k || { t: 0 };
    hero(c, id, W * (o.full ? 0.5 : 0.46), ty, s, 1, k);
  }

  return { hero: hero, minion: minion, monster: monster, portrait: portrait, ease: ease };
})();
