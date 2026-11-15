/* 삼원의 등불 — 파티클·투사체·번개·충격파. 화면 전체 캔버스 하나로 그린다. */
(function (root) {
'use strict';

var cv = document.createElement('canvas');
cv.id = 'fxcanvas';
cv.setAttribute('aria-hidden', 'true');
cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:190';
document.body.appendChild(cv);
var ctx = cv.getContext('2d');
var W = 0, H = 0, dpr = 1;
var reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}
resize();
window.addEventListener('resize', resize);

var COL = {
  f: ['#ff5a1e', '#ff9a3a', '#ffd27a', '#fff2c0'],
  i: ['#5cc8ff', '#9adcff', '#e0f6ff', '#ffffff'],
  s: ['#ffd84a', '#fff08a', '#fffbd0', '#ffffff'],
  n: ['#b9a6ff', '#d6c9ff', '#f2edff', '#ffffff'],
  r: ['#ff4a4a', '#ff8a8a', '#ffd0d0', '#ffffff'],
  x: ['#6a6a76', '#8a8a96', '#b0b0ba', '#ffffff']
};
var HEX = { f: '#ff7a3c', i: '#5cc8ff', s: '#ffd84a', n: '#b9a6ff', r: '#ff5a5a', x: '#aaaab4' };

var P = [], BOLT = [], RING = [], PROJ = [], FLASH = [], AMB = [], ambKind = -1, lightning = 0;
var raf = 0, last = 0;

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function ease(t) { return t * t; }

function part(o) {
  if (P.length > 700) return;
  o.life = 0; o.rot = o.rot || 0; o.vr = o.vr || 0; o.drag = o.drag === undefined ? 0.98 : o.drag; o.g = o.g || 0;
  P.push(o);
}

/* 번개 줄기: 두 점 사이를 들쭉날쭉하게 잇는다 */
function bolt(x0, y0, x1, y1, col, w, life) {
  var pts = [[x0, y0]], seg = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 22));
  var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  for (var i = 1; i < seg; i++) {
    var t = i / seg, off = rnd(-1, 1) * Math.min(26, len * 0.14);
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  pts.push([x1, y1]);
  BOLT.push({ pts: pts, col: col, w: w || 3, life: 0, max: life || 0.22 });
  if (Math.random() < 0.7 && pts.length > 3) { // 곁가지
    var k = 1 + Math.floor(Math.random() * (pts.length - 2)), b = pts[k];
    BOLT.push({ pts: [b, [b[0] + rnd(-40, 40), b[1] + rnd(-40, 40)]], col: col, w: (w || 3) * 0.55, life: 0, max: (life || 0.22) * 0.8 });
  }
}

/* 원소별 폭발 */
function burst(x, y, el, power) {
  power = power || 1;
  var c = COL[el] || COL.n, n, i, a, s;
  if (reduce) power = Math.min(power, 0.6);
  if (el === 'f') {
    n = Math.round(14 + 12 * power);
    for (i = 0; i < n; i++) {
      a = rnd(0, Math.PI * 2); s = rnd(40, 200) * (0.6 + 0.4 * power);
      part({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, g: -90, max: rnd(0.45, 1.0), size: rnd(2.5, 6.5) * (0.8 + 0.2 * power), col: pick(c), kind: 'dot', add: true, drag: 0.94 });
    }
    for (i = 0; i < 5 * power; i++) part({ x: x, y: y, vx: rnd(-120, 120), vy: rnd(-260, -80), g: 200, max: rnd(0.4, 0.8), size: 2, col: c[3], kind: 'line', add: true });
    ring(x, y, c[1], 10, 36 + 22 * power, 0.3, 3);
  } else if (el === 'i') {
    n = Math.round(10 + 9 * power);
    for (i = 0; i < n; i++) {
      a = rnd(0, Math.PI * 2); s = rnd(60, 240) * (0.6 + 0.4 * power);
      part({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 160, max: rnd(0.5, 1.0), size: rnd(4, 10) * (0.8 + 0.2 * power), col: pick(c), kind: 'shard', rot: rnd(0, 6.28), vr: rnd(-9, 9), drag: 0.95 });
    }
    for (i = 0; i < 8; i++) part({ x: x, y: y, vx: rnd(-80, 80), vy: rnd(-80, 40), g: 40, max: rnd(0.6, 1.2), size: rnd(1.5, 3), col: '#fff', kind: 'dot', add: true });
    ring(x, y, c[2], 8, 40 + 20 * power, 0.28, 2.5);
  } else if (el === 's') {
    n = Math.round(3 + 2 * power);
    for (i = 0; i < n; i++) { a = rnd(0, Math.PI * 2); bolt(x, y, x + Math.cos(a) * rnd(34, 80) * (0.8 + 0.3 * power), y + Math.sin(a) * rnd(34, 80) * (0.8 + 0.3 * power), pick(c.slice(1)), rnd(2.5, 4), 0.25); }
    for (i = 0; i < 12 * power; i++) {
      a = rnd(0, Math.PI * 2); s = rnd(100, 340);
      part({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rnd(0.2, 0.5), size: 2, col: pick(c), kind: 'line', add: true, drag: 0.9 });
    }
    flash(c[0], 0.12 + 0.05 * power, 0.14);
  } else if (el === 'r') {
    for (i = 0; i < 12 * power; i++) {
      a = rnd(0, Math.PI * 2); s = rnd(120, 360);
      part({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rnd(0.2, 0.45), size: 2.4, col: pick(c), kind: 'line', add: true, drag: 0.9 });
    }
    ring(x, y, c[1], 6, 30 + 14 * power, 0.22, 3);
  } else if (el === 'x') {
    for (i = 0; i < 18 * power; i++) {
      a = rnd(0, Math.PI * 2); s = rnd(30, 180);
      part({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 60, max: rnd(0.6, 1.2), size: rnd(3, 9), col: pick(c), kind: 'dot', drag: 0.94 });
    }
    for (i = 0; i < 10 * power; i++) part({ x: x, y: y, vx: rnd(-90, 90), vy: rnd(-200, -60), g: -40, max: rnd(0.6, 1), size: rnd(2, 4), col: '#ffb347', kind: 'dot', add: true });
  } else {
    n = Math.round(12 + 8 * power);
    for (i = 0; i < n; i++) {
      a = rnd(0, Math.PI * 2); s = rnd(50, 220);
      part({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rnd(0.4, 0.9), size: rnd(4, 9), col: pick(c), kind: 'star', rot: rnd(0, 6.28), vr: rnd(-6, 6), add: true, drag: 0.94 });
    }
    ring(x, y, c[1], 8, 34 + 16 * power, 0.28, 2.5);
  }
}

function ring(x, y, col, r0, r1, dur, w) { RING.push({ x: x, y: y, col: col, r0: r0, r1: r1, life: 0, max: dur || 0.3, w: w || 3 }); }
function flash(col, a, dur) { if (reduce) a *= 0.4; FLASH.push({ col: col, a: a, life: 0, max: dur || 0.2 }); }

/* 카드 위치에서 목표까지 날아가는 투사체. 도착하면 done() 호출 */
function shoot(x0, y0, x1, y1, el, done) {
  if (reduce) { if (done) done(); return; }
  var c = COL[el] || COL.n;
  if (el === 's') {
    bolt(x0, y0, x1, y1, c[2], 4, 0.26); bolt(x0, y0, x1, y1, c[1], 2.4, 0.2);
    ring(x0, y0, c[1], 4, 26, 0.2, 2);
    setTimeout(function () { if (done) done(); }, 70);
    wake(); return;
  }
  PROJ.push({ x: x0, y: y0, x0: x0, y0: y0, x1: x1, y1: y1, t: 0, dur: Math.max(0.16, Math.min(0.3, Math.hypot(x1 - x0, y1 - y0) / 1700)), el: el, c: c, done: done, rot: 0 });
  wake();
}

/* 공명 충격파: 이을수록 커진다 */
function resonance(x, y, el, n) {
  var c = COL[el] || COL.n, k = Math.min(n, 7);
  ring(x, y, c[1], 10, 50 + k * 22, 0.45, 2 + k * 0.5);
  if (k >= 2) ring(x, y, c[2], 4, 36 + k * 16, 0.36, 2);
  if (k >= 3) ring(x, y, '#ffffff', 4, 60 + k * 18, 0.5, 1.6);
  var cnt = reduce ? 0 : 8 + k * 8;
  for (var i = 0; i < cnt; i++) {
    var a = rnd(0, Math.PI * 2), s = rnd(80, 160 + k * 40);
    part({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rnd(0.4, 0.8), size: rnd(2, 4.5), col: pick(c), kind: 'dot', add: true, drag: 0.93 });
  }
  flash(c[0], 0.06 + 0.025 * k, 0.25);
  wake();
}

/* 배경 분위기 입자: 0 불씨, 1 눈, 2 비와 번개 */
function ambient(kind) {
  if (ambKind === kind) return;
  ambKind = kind; AMB = [];
  if (kind < 0 || reduce) return;
  var count = kind === 2 ? 60 : 44;
  for (var i = 0; i < count; i++) AMB.push(ambNew(kind, true));
  wake();
}
function ambNew(kind, anywhere) {
  var x = rnd(0, W), y = anywhere ? rnd(0, H) : (kind === 0 ? H + 10 : -10);
  if (kind === 0) return { x: x, y: y, vx: rnd(-8, 8), vy: rnd(-42, -14), size: rnd(1, 2.8), a: rnd(0.15, 0.6), ph: rnd(0, 6.28), col: pick(['#ff7a3c', '#ffb347', '#ffd27a']) };
  if (kind === 1) return { x: x, y: y, vx: rnd(-10, 6), vy: rnd(18, 48), size: rnd(1, 3), a: rnd(0.25, 0.7), ph: rnd(0, 6.28), col: '#e0f6ff' };
  return { x: rnd(-40, W + 40), y: y, vx: -60, vy: rnd(520, 760), size: rnd(0.8, 1.4), len: rnd(10, 22), a: rnd(0.1, 0.32), ph: 0, col: '#9ab4ff' };
}

/* 화면 흔들림: #app 을 잠깐 흔든다 */
function shake(mag, ms) {
  if (reduce) return;
  var app = document.getElementById('app');
  if (!app || !app.animate) return;
  var f = [], n = 7, i;
  for (i = 0; i < n; i++) f.push({ transform: 'translate(' + rnd(-mag, mag).toFixed(1) + 'px,' + rnd(-mag, mag).toFixed(1) + 'px)' });
  f.push({ transform: 'translate(0,0)' });
  try { app.animate(f, { duration: ms || 260, easing: 'ease-out' }); } catch (e) {}
}
/* 화면 테두리 번쩍임 */
function vignette(col, strength) {
  var v = document.getElementById('vig');
  if (!v || !v.animate || reduce) return;
  v.style.boxShadow = 'inset 0 0 ' + Math.round(70 + 60 * strength) + 'px ' + Math.round(10 + 22 * strength) + 'px ' + col;
  try { v.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' }); } catch (e) {}
}

/* ---------- 그리기 ---------- */
function drawShard(p, a) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
  ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.45, p.size * 0.6); ctx.lineTo(-p.size * 0.45, p.size * 0.6); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.2, p.size * 0.1); ctx.lineTo(-p.size * 0.1, p.size * 0.1); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawStar(p, a) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath();
  for (var i = 0; i < 8; i++) { var r = i % 2 ? p.size * 0.3 : p.size, an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function frame(ts) {
  raf = 0;
  var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  var i, p, a, t;

  /* 분위기 입자 */
  if (ambKind >= 0 && !reduce) {
    ctx.globalCompositeOperation = ambKind === 0 ? 'lighter' : 'source-over';
    for (i = 0; i < AMB.length; i++) {
      p = AMB[i]; p.ph += dt * 1.6;
      p.x += (p.vx + Math.sin(p.ph) * (ambKind === 2 ? 0 : 14)) * dt; p.y += p.vy * dt;
      if (p.y < -12 || p.y > H + 12 || p.x < -50 || p.x > W + 50) { AMB[i] = ambNew(ambKind, false); continue; }
      ctx.globalAlpha = p.a; ctx.fillStyle = p.col; ctx.strokeStyle = p.col;
      if (ambKind === 2) { ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 0.02 * p.len / 10, p.y - p.len); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill(); }
    }
    if (ambKind === 2) {
      lightning -= dt;
      if (lightning < 0) { lightning = rnd(4, 9); flash('#bcd0ff', 0.1, 0.35); bolt(rnd(W * 0.15, W * 0.85), -10, rnd(W * 0.1, W * 0.9), rnd(H * 0.12, H * 0.3), '#cfe0ff', 2, 0.18); }
    }
  }

  /* 입자 */
  for (i = P.length - 1; i >= 0; i--) {
    p = P[i]; p.life += dt;
    if (p.life >= p.max) { P.splice(i, 1); continue; }
    p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60); p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    t = p.life / p.max; a = 1 - t * t;
    ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    if (p.kind === 'dot') { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, 6.283); ctx.fill(); }
    else if (p.kind === 'line') { ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); ctx.stroke(); }
    else if (p.kind === 'shard') drawShard(p, a);
    else if (p.kind === 'star') drawStar(p, a);
  }

  /* 번개 */
  ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (i = BOLT.length - 1; i >= 0; i--) {
    p = BOLT[i]; p.life += dt;
    if (p.life >= p.max) { BOLT.splice(i, 1); continue; }
    a = 1 - p.life / p.max;
    ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
    for (var k = 1; k < p.pts.length; k++) ctx.lineTo(p.pts[k][0], p.pts[k][1]);
    ctx.globalAlpha = a * 0.3; ctx.strokeStyle = p.col; ctx.lineWidth = p.w * 4; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = p.w * 0.7; ctx.stroke();
    ctx.globalAlpha = a * 0.8; ctx.strokeStyle = p.col; ctx.lineWidth = p.w; ctx.globalCompositeOperation = 'lighter'; ctx.stroke();
  }

  /* 충격파 고리 */
  for (i = RING.length - 1; i >= 0; i--) {
    p = RING[i]; p.life += dt;
    if (p.life >= p.max) { RING.splice(i, 1); continue; }
    t = p.life / p.max; a = 1 - t;
    ctx.globalAlpha = a * 0.9; ctx.strokeStyle = p.col; ctx.lineWidth = p.w * (1 - t * 0.6);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - t, 2)), 0, 6.283); ctx.stroke();
  }

  /* 투사체 */
  for (i = PROJ.length - 1; i >= 0; i--) {
    p = PROJ[i]; p.t += dt / p.dur;
    var e = Math.min(1, p.t), q = ease(e);
    var px = p.x0 + (p.x1 - p.x0) * q, py = p.y0 + (p.y1 - p.y0) * q - Math.sin(e * Math.PI) * 28;
    var vx = px - p.x, vy = py - p.y; p.x = px; p.y = py; p.rot += dt * 18;
    ctx.globalCompositeOperation = 'lighter';
    var r = p.el === 'i' ? 7 : 9;
    ctx.globalAlpha = 0.35; ctx.fillStyle = p.c[0]; ctx.beginPath(); ctx.arc(px, py, r * 2.2, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 0.95; ctx.fillStyle = p.c[2]; ctx.beginPath(); ctx.arc(px, py, r * 0.7, 0, 6.283); ctx.fill();
    for (var j = 0; j < 2; j++) part({ x: px + rnd(-3, 3), y: py + rnd(-3, 3), vx: -vx * 3 + rnd(-30, 30), vy: -vy * 3 + rnd(-30, 30), g: p.el === 'f' ? -60 : 30, max: rnd(0.2, 0.4), size: rnd(2, 5), col: pick(p.c), kind: p.el === 'i' ? 'shard' : 'dot', rot: rnd(0, 6), vr: 8, add: p.el !== 'i' });
    if (p.t >= 1) { PROJ.splice(i, 1); if (p.done) p.done(); }
  }

  /* 화면 번쩍임 */
  ctx.globalCompositeOperation = 'source-over';
  for (i = FLASH.length - 1; i >= 0; i--) {
    p = FLASH[i]; p.life += dt;
    if (p.life >= p.max) { FLASH.splice(i, 1); continue; }
    ctx.globalAlpha = p.a * (1 - p.life / p.max); ctx.fillStyle = p.col; ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

  if (P.length || BOLT.length || RING.length || PROJ.length || FLASH.length || (ambKind >= 0 && !reduce)) raf = requestAnimationFrame(frame);
}
function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

root.FX = { burst: burst, bolt: bolt, ring: ring, shoot: shoot, resonance: resonance, ambient: ambient, shake: shake, vignette: vignette, flash: flash, wake: wake, HEX: HEX };
})(window);
