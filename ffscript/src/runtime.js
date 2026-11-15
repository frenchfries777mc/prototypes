(function (global) {
'use strict';
const W = 960, H = 540, TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

const COLORS = {
  red: '#ff4d5e', orange: '#ff9a3c', yellow: '#ffd93d', green: '#4ade80', blue: '#4d8dff',
  navy: '#4b5bd6', purple: '#a66bff', pink: '#ff7ac6', white: '#ffffff', black: '#1a1a22',
  gray: '#9aa0ad', grey: '#9aa0ad', gold: '#ffcb3d', cyan: '#5ee7ff', sky: '#6fd3ff', brown: '#a86b45'
};
function color(c) { return COLORS[c] || c; }
function shade(hex, f) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rgba(hex, a) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ---------- sound ---------- */
const Sfx = {
  ctx: null, out: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    this.out = this.ctx.createGain(); this.out.gain.value = 0.5;
    this.out.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, len);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  hiss(dur, vol, f0, f1, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; fl.type = 'lowpass';
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur + 0.05);
  },
  play(name) {
    if (!this.ctx) return;
    const p = 1 + rnd(-0.06, 0.06);
    switch (name) {
      case 'boom': this.hiss(0.7, 0.9, 3000, 60); this.tone('sine', 120 * p, 30, 0.5, 0.6); break;
      case 'coin': this.tone('square', 990 * p, 990 * p, 0.07, 0.12); this.tone('square', 1320 * p, 1320 * p, 0.2, 0.12, 0.07); break;
      case 'shoot': this.tone('square', 880 * p, 220, 0.12, 0.08); this.hiss(0.06, 0.15, 6000, 2000); break;
      case 'hit': this.tone('sawtooth', 300 * p, 60, 0.25, 0.25); this.hiss(0.15, 0.4, 2000, 200); break;
      case 'jump': this.tone('sine', 300 * p, 800, 0.18, 0.25); break;
      case 'power': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.18, i * 0.06)); break;
      case 'start': [392, 523, 784].forEach((f, i) => this.tone('triangle', f, f, 0.15, 0.2, i * 0.08)); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.3, 0.22, i * 0.18)); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.14, 0.12, i * 0.1)); break;
      case 'pop': this.tone('sine', 600 * p, 1200, 0.06, 0.15); break;
    }
  }
};

/* ---------- built-in looks ---------- */
const LOOKS = {};
function look(name, def) { LOOKS[name] = def; }

function glowHalo(ctx, r, col, a) {
  const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
}

look('ship', {
  size: 56, color: '#5ee7ff', hit: 0.38,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const fl = s * (0.55 + 0.25 * Math.sin(t * 50) + 0.15 * Math.sin(t * 23));
    const g = ctx.createLinearGradient(0, s * 0.5, 0, s * 0.5 + fl);
    g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(0.4, 'rgba(255,140,40,0.8)'); g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-s * 0.22, s * 0.5); ctx.quadraticCurveTo(0, s * 0.5 + fl * 1.4, s * 0.22, s * 0.5); ctx.fill();
    ctx.restore();
    const body = ctx.createLinearGradient(-s, 0, s, 0);
    body.addColorStop(0, shade(c, -0.45)); body.addColorStop(0.5, shade(c, 0.35)); body.addColorStop(1, shade(c, -0.45));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.bezierCurveTo(s * 0.25, -s * 0.6, s * 0.3, -s * 0.1, s * 0.35, s * 0.15);
    ctx.lineTo(s * 0.95, s * 0.62); ctx.lineTo(s * 0.9, s * 0.78); ctx.lineTo(s * 0.3, s * 0.55);
    ctx.lineTo(0, s * 0.62); ctx.lineTo(-s * 0.3, s * 0.55); ctx.lineTo(-s * 0.9, s * 0.78); ctx.lineTo(-s * 0.95, s * 0.62);
    ctx.lineTo(-s * 0.35, s * 0.15); ctx.bezierCurveTo(-s * 0.3, -s * 0.1, -s * 0.25, -s * 0.6, 0, -s);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = 1.5; ctx.stroke();
    const ck = ctx.createLinearGradient(0, -s * 0.55, 0, 0);
    ck.addColorStop(0, '#e9fbff'); ck.addColorStop(1, '#1d4f7a');
    ctx.fillStyle = ck; ctx.beginPath(); ctx.ellipse(0, -s * 0.25, s * 0.14, s * 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(c, 0.9);
    ctx.fillRect(-s * 0.88, s * 0.6, s * 0.12, s * 0.08); ctx.fillRect(s * 0.76, s * 0.6, s * 0.12, s * 0.08);
  },
  update(o, G, dt) {
    if (Math.random() < 0.8) G.particle({ x: o.x + rnd(-3, 3), y: o.y + o.size * 0.32, vx: rnd(-20, 20), vy: rnd(120, 220), life: 0.35, size: rnd(2, 4), color: '#ff9a3c' });
  }
});

look('rock', {
  size: 60, color: '#9b7b62', hit: 0.4, spin: true,
  init(o) {
    o.pts = []; const n = 10;
    for (let i = 0; i < n; i++) o.pts.push(rnd(0.72, 1));
    o.craters = [];
    for (let i = 0; i < 3; i++) o.craters.push([rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(0.1, 0.2)]);
  },
  draw(ctx, o) {
    const s = o.size / 2, c = o.color, n = o.pts.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, r = s * o.pts[i % n];
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = ctx.createRadialGradient(-s * 0.35, -s * 0.35, s * 0.1, 0, 0, s);
    g.addColorStop(0, shade(c, 0.35)); g.addColorStop(0.7, c); g.addColorStop(1, shade(c, -0.55));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = shade(c, -0.6); ctx.lineWidth = 2; ctx.stroke();
    for (const [x, y, r] of o.craters) {
      ctx.fillStyle = rgba('#000000', 0.22); ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.1); ctx.beginPath(); ctx.arc(x * s - r * s * 0.25, y * s - r * s * 0.25, r * s * 0.6, 0, TAU); ctx.fill();
    }
  }
});

look('coin', {
  size: 34, color: '#ffcb3d', hit: 0.5, glow: 0.35,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color, k = Math.max(0.15, Math.abs(Math.cos(t * 4 + o.seed)));
    ctx.scale(k, 1);
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, shade(c, 0.5)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -0.4));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, TAU); ctx.stroke();
    ctx.fillStyle = shade(c, -0.3); ctx.font = `bold ${s * 1.1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, s * 0.05);
  }
});

look('star', {
  size: 40, color: '#ffd93d', hit: 0.45, glow: 0.5,
  draw(ctx, o, t) {
    const s = o.size / 2 * (1 + 0.08 * Math.sin(t * 6 + o.seed)), c = o.color;
    ctx.rotate(t * 0.8);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? s * 0.45 : s;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, shade(c, 0.3)); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 1.5; ctx.stroke();
  }
});

look('enemy', {
  size: 56, color: '#a66bff', hit: 0.4,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color;
    const dome = ctx.createLinearGradient(0, -s * 0.7, 0, 0);
    dome.addColorStop(0, 'rgba(220,255,240,0.9)'); dome.addColorStop(1, 'rgba(80,200,160,0.5)');
    ctx.fillStyle = dome; ctx.beginPath(); ctx.ellipse(0, -s * 0.1, s * 0.42, s * 0.5, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#3fd07a'; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.17, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, -s * 0.22, s * 0.07, 0, TAU); ctx.fill();
    const b = ctx.createLinearGradient(0, -s * 0.2, 0, s * 0.4);
    b.addColorStop(0, shade(c, 0.4)); b.addColorStop(1, shade(c, -0.5));
    ctx.fillStyle = b; ctx.beginPath(); ctx.ellipse(0, s * 0.1, s, s * 0.32, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const on = Math.floor(t * 8 + i) % 5 === 0;
      ctx.fillStyle = on ? '#fff6a0' : shade(c, 0.2);
      ctx.beginPath(); ctx.arc((i - 2) * s * 0.36, s * 0.14, s * 0.07, 0, TAU); ctx.fill();
    }
  }
});

look('bullet', {
  size: 14, color: '#5ee7ff', hit: 0.6, glow: 0.8, face: true,
  draw(ctx, o) {
    const s = o.size / 2, c = o.color;
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.6, s * 1.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.3, s * 1.3, 0, 0, TAU); ctx.fill();
  },
  update(o, G) { G.particle({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.18, size: o.size * 0.35, color: o.color }); }
});

look('heart', {
  size: 40, color: '#ff4d5e', hit: 0.45, glow: 0.3,
  draw(ctx, o, t) {
    const b = 1 + 0.1 * Math.max(0, Math.sin(t * 7 + o.seed)) ** 8, s = o.size / 2 * b, c = o.color;
    ctx.beginPath(); ctx.moveTo(0, s * 0.85);
    ctx.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.6, -s * 1.05, 0, -s * 0.4);
    ctx.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.3, -s * 0.1, 0, s * 0.85);
    const g = ctx.createRadialGradient(-s * 0.3, -s * 0.4, 0, 0, 0, s * 1.1);
    g.addColorStop(0, shade(c, 0.5)); g.addColorStop(1, shade(c, -0.3));
    ctx.fillStyle = g; ctx.fill();
  }
});

look('ball', {
  size: 40, color: '#ff7ac6', hit: 0.5,
  draw(ctx, o) {
    const s = o.size / 2, c = o.color;
    const g = ctx.createRadialGradient(-s * 0.35, -s * 0.35, s * 0.05, 0, 0, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, shade(c, 0.3)); g.addColorStop(1, shade(c, -0.5));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
  }
});

look('box', {
  size: 50, color: '#c58a4f', hit: 0.48,
  draw(ctx, o) {
    const s = o.size / 2, c = o.color;
    ctx.fillStyle = shade(c, -0.15); roundRect(ctx, -s, -s, s * 2, s * 2, s * 0.18); ctx.fill();
    ctx.fillStyle = c; roundRect(ctx, -s * 0.8, -s * 0.8, s * 1.6, s * 1.6, s * 0.1); ctx.fill();
    ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = s * 0.16;
    ctx.beginPath(); ctx.moveTo(-s * 0.75, -s * 0.75); ctx.lineTo(s * 0.75, s * 0.75); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = shade(c, -0.55); roundRect(ctx, -s, -s, s * 2, s * 2, s * 0.18); ctx.stroke();
  }
});

look('hero', {
  size: 54, color: '#4d8dff', hit: 0.42,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color, sp = Math.hypot(o.vx, o.vy);
    const sq = 1 + Math.min(0.18, sp / 3000) + 0.04 * Math.sin(t * 5 + o.seed);
    ctx.scale(1 / sq, sq);
    const g = ctx.createRadialGradient(-s * 0.3, -s * 0.4, s * 0.1, 0, 0, s);
    g.addColorStop(0, shade(c, 0.45)); g.addColorStop(1, shade(c, -0.35));
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-s, s * 0.6); ctx.bezierCurveTo(-s, -s * 1.1, s, -s * 1.1, s, s * 0.6);
    ctx.quadraticCurveTo(0, s * 0.95, -s, s * 0.6); ctx.fill();
    const lx = clamp(o.vx / 400, -1, 1) * s * 0.12, ly = clamp(o.vy / 400, -1, 1) * s * 0.1;
    const blink = (Math.floor(t * 10 + o.seed * 7) % 37) === 0 ? 0.15 : 1;
    for (const ex of [-0.32, 0.32]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex * s, -s * 0.15, s * 0.2, s * 0.25 * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.arc(ex * s + lx, -s * 0.12 + ly, s * 0.1 * Math.min(1, blink * 2), 0, TAU); ctx.fill();
    }
    ctx.fillStyle = rgba('#ff7ac6', 0.5);
    ctx.beginPath(); ctx.ellipse(-s * 0.55, s * 0.18, s * 0.12, s * 0.07, 0, 0, TAU); ctx.ellipse(s * 0.55, s * 0.18, s * 0.12, s * 0.07, 0, 0, TAU); ctx.fill();
  }
});

look('slime', {
  size: 50, color: '#4ade80', hit: 0.4,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color, w = 1 + 0.1 * Math.sin(t * 8 + o.seed);
    ctx.scale(w, 1 / w);
    const g = ctx.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, shade(c, 0.4));
    g.addColorStop(1, shade(c, -0.4));
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-s, s * 0.7); ctx.bezierCurveTo(-s * 1.05, -s * 0.2, -s * 0.5, -s * 0.9, 0, -s * 0.9);
    ctx.bezierCurveTo(s * 0.5, -s * 0.9, s * 1.05, -s * 0.2, s, s * 0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.45); ctx.beginPath(); ctx.ellipse(-s * 0.45, -s * 0.45, s * 0.15, s * 0.22, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a2a1a';
    ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.05, s * 0.09, 0, TAU); ctx.arc(s * 0.28, -s * 0.05, s * 0.09, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, s * 0.12, s * 0.15, 0.2, Math.PI - 0.2); ctx.stroke();
  }
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ---------- backgrounds ---------- */
function makeStars(n, seed) {
  const a = []; let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) a.push([r() * W, r() * H, r()]);
  return a;
}
const STARS = [makeStars(120, 7), makeStars(60, 13), makeStars(25, 29)];
const BACKGROUNDS = {
  space(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05030f'); g.addColorStop(1, '#130a2e'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    neb(ctx, 250, 160, 320, '#6a2bd8', 0.16); neb(ctx, 760, 380, 360, '#1e7bd8', 0.13);
    STARS.forEach((layer, li) => {
      const sp = [12, 30, 70][li], sz = [1, 1.6, 2.4][li];
      for (const [x, y, b] of layer) {
        const yy = (y + t * sp) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * b * (0.7 + 0.3 * Math.sin(t * 3 + x))})`;
        ctx.fillRect(x, yy, sz, sz * (li === 2 ? 3 : 1));
      }
    });
  },
  night(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#2a2350'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const [x, y, b] of STARS[0]) {
      ctx.fillStyle = `rgba(255,255,230,${0.2 + 0.6 * b * (0.6 + 0.4 * Math.sin(t * 2 + x))})`; ctx.fillRect(x, y * 0.7, 1.5, 1.5);
    }
    ctx.save(); ctx.translate(800, 100); glowHalo(ctx, 110, '#fff6c8', 0.25);
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.fill(); ctx.restore();
    hills(ctx, t, '#1b1840', 0.6, 380, 40); hills(ctx, t, '#141230', 1.4, 440, 30);
  },
  sky(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4fa8ff'); g.addColorStop(1, '#bfe6ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(120, 90); glowHalo(ctx, 140, '#fff5b0', 0.5); ctx.restore();
    for (let i = 0; i < 6; i++) {
      const x = ((i * 210 + t * (14 + i * 4)) % (W + 300)) - 150, y = 60 + (i * 71) % 260;
      cloud(ctx, x, y, 0.7 + (i % 3) * 0.25);
    }
    hills(ctx, t, '#6cc36a', 0.5, 430, 35); hills(ctx, t, '#4aa552', 1.2, 470, 25);
  },
  sea(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a6fa8'); g.addColorStop(1, '#03243f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = 120 + i * 190 + Math.sin(t * 0.5 + i) * 40;
      const lg = ctx.createLinearGradient(x, 0, x + 80, H);
      lg.addColorStop(0, 'rgba(150,230,255,0.12)'); lg.addColorStop(1, 'rgba(150,230,255,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 140, H); ctx.lineTo(x + 40, H); ctx.fill();
    }
    ctx.restore();
    for (const [x, y, b] of STARS[1]) {
      const yy = H - ((H - y + t * (20 + b * 40)) % H);
      ctx.strokeStyle = `rgba(200,240,255,${0.25 + b * 0.3})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + y) * 6, yy, 2 + b * 4, 0, TAU); ctx.stroke();
    }
  }
};
function neb(ctx, x, y, r, c, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function cloud(ctx, x, y, k) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath();
  [[0, 0, 30], [30, -12, 36], [64, 0, 28], [32, 10, 30]].forEach(([dx, dy, r]) => { ctx.moveTo(x + dx * k + r * k, y + dy * k); ctx.arc(x + dx * k, y + dy * k, r * k, 0, TAU); });
  ctx.fill();
}
function hills(ctx, t, col, f, base, amp) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base + Math.sin(x * 0.006 * f + f * 3) * amp + Math.sin(x * 0.017 * f) * amp * 0.4);
  ctx.lineTo(W, H); ctx.fill();
}

/* ---------- objects ---------- */
let seedN = 1;
class Obj {
  constructor(G, kind, lookName) {
    const L = LOOKS[lookName] || LOOKS.ball;
    this.G = G; this.kind = kind; this.name = null; this.L = L; this.lookName = lookName;
    this.x = W / 2; this.y = H / 2; this.vx = 0; this.vy = 0; this.size = L.size; this.color = L.color;
    this.angle = 0; this.spinV = L.spin ? rnd(-90, 90) : 0; this.alive = true; this.age = 0;
    this.ctrl = null; this.speed = 300; this.bounce = false; this.seed = (seedN++ * 1.7) % 10;
    this.flash = 0; this.pop = 0; this.homing = null; this.hp = 1;
    if (L.init) L.init(this);
  }
  get r() { return this.size * this.L.hit; }
  move(dir, sp) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    if (sp == null) sp = this.speed;
    this.homing = null; this.vx = d[0] * sp; this.vy = d[1] * sp;
    if (this.L.face) this.angle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    return this;
  }
  toward(target, sp, keep) {
    const tg = target === 'mouse' ? this.G.mouse : target;
    if (!tg || tg.alive === false) return this;
    if (sp == null) sp = this.speed;
    const dx = tg.x - this.x, dy = tg.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.vx = dx / d * sp; this.vy = dy / d * sp;
    if (this.L.face) this.angle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    if (keep) this.homing = { tg, sp };
    return this;
  }
  stop() { this.vx = this.vy = 0; this.homing = null; return this; }
  control(type) { this.ctrl = type; return this; }
  setSpeed(v) { this.speed = v; return this; }
  setSize(v) { this.size = v; return this; }
  setColor(c) { this.color = color(c); return this; }
  spin(v) { this.spinV = v; return this; }
  setBounce() { this.bounce = true; return this; }
  setLook(n) { const L = LOOKS[n]; if (L) { this.L = L; this.lookName = n; if (L.init) L.init(this); } return this; }
  explode() { if (this.alive) this.G.explode(this); return this; }
  sparkle() { this.G.sparkle(this); return this; }
  remove() { this.alive = false; return this; }
  say(text) { this.G.floatText(text, this.x, this.y - this.size * 0.7, '#ffffff'); return this; }
}
class Group {
  constructor(G, name) { this.G = G; this.name = name; }
  get list() { return this.G.objs.filter(o => o.alive && (o.kind === this.name || o.name === this.name)); }
  get x() { const l = this.list; return l.length ? l[0].x : 0; }
  get y() { const l = this.list; return l.length ? l[0].y : 0; }
  get alive() { return this.list.length > 0; }
}
['move', 'toward', 'stop', 'control', 'setSpeed', 'setSize', 'setColor', 'spin', 'setBounce', 'setLook', 'explode', 'sparkle', 'remove', 'say']
  .forEach(m => { Group.prototype[m] = function (...a) { this.list.forEach(o => o[m](...a)); return this; }; });

/* ---------- engine ---------- */
const KEYMAP = {
  ' ': 'space', 'Enter': 'enter', 'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right', 'Shift': 'shift'
};
function keyName(e) { return KEYMAP[e.key] || (e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()); }

function Engine(canvas) {
  const G = this;
  const ctx = canvas.getContext('2d');
  G.canvas = canvas; G.W = W; G.H = H; G.looks = LOOKS; G.backgrounds = BACKGROUNDS; G.colors = COLORS;
  G.keys = {}; G.mouse = { x: W / 2, y: H / 2, down: false, active: false };
  G.onError = null;
  let best = 0;
  try { best = +(global.localStorage.getItem('ffscript-best') || 0); } catch (e) { }

  function reset() {
    G.objs = []; G.parts = []; G.texts = []; G.labels = []; G.timers = []; G.always = []; G.touches = []; G.keyEvents = []; G.leaves = [];
    G.contacts = new Set(); G.time = 0; G.score = 0; G.lives = null; G.titleText = ''; G.bg = 'space'; G.bgColor = null;
    G.shakeAmt = 0; G.flashA = 0; G.flashC = '#ffffff'; G.slow = 1; G.slowT = 0; G.scorePop = 0; G.livesPop = 0; G.overT = 0;
  }
  G.rand = (a, b) => (Number.isInteger(a) && Number.isInteger(b)) ? Math.floor(rnd(a, b + 1)) : rnd(a, b);
  G.count = name => G.objs.filter(o => o.alive && (o.kind === name || o.name === name)).length;
  G.group = name => new Group(G, name);
  G.title = t => { G.titleText = String(t); };
  G.background = b => { if (BACKGROUNDS[b]) { G.bg = b; G.bgColor = null; } else { G.bg = null; G.bgColor = color(b); } };
  G.setLives = n => { G.lives = n; };

  G.make = function (kind, look, pos, from) {
    const o = new Obj(G, kind, look);
    G.place(o, pos, from);
    o.pop = 1;
    G.objs.push(o);
    if (look === 'bullet') Sfx.play('shoot');
    return o;
  };
  G.place = function (o, pos, from) {
    const m = o.size * 0.6;
    const XS = { left: m, center: W / 2, right: W - m, random: rnd(m, W - m) };
    const YS = { top: m, middle: H / 2, bottom: H - m, random: rnd(m, H - m) };
    let x = W / 2, y = H / 2;
    const a = pos && pos[0], b = pos && pos[1];
    if (a && typeof a === 'object') {
      x = a.x; y = a.y;
      if (a.lookName === 'ship') y -= a.size * 0.5;
    } else if (pos && pos.length === 1) {
      if (a in XS) x = XS[a]; else if (a in YS) y = YS[a]; else if (a === 'center') { x = W / 2; y = H / 2; } else if (typeof a === 'number') x = a;
      if (a === 'random') y = YS.random;
    } else if (pos && pos.length > 1) {
      x = typeof a === 'number' ? a : (XS[a] != null ? XS[a] : W / 2);
      y = typeof b === 'number' ? b : (b === 'center' ? H / 2 : (YS[b] != null ? YS[b] : H / 2));
    }
    if (from) {
      const free = !(pos && pos.length);
      if (from === 'top') { y = -o.size; if (free) x = rnd(m, W - m); }
      if (from === 'bottom') { y = H + o.size; if (free) x = rnd(m, W - m); }
      if (from === 'left') { x = -o.size; if (free) y = rnd(m, H - m); }
      if (from === 'right') { x = W + o.size; if (free) y = rnd(m, H - m); }
    }
    o.x = x; o.y = y;
  };

  G.every = (sec, fn, owner) => { G.timers.push({ every: Math.max(0.05, sec), left: Math.max(0.05, sec), fn, owner }); };
  G.after = (sec, fn, owner) => { G.timers.push({ every: 0, left: sec, fn, owner }); };
  G.onAlways = (fn, owner) => { G.always.push({ fn, owner }); };
  G.onHit = (a, b, fn) => { G.touches.push({ a, b, fn }); };
  G.onKey = (k, fn) => { G.keyEvents.push({ k, fn }); };
  G.onLeave = (n, fn) => { G.leaves.push({ n, fn }); };

  G.particle = p => { p.max = p.life; if (G.parts.length < 1500) G.parts.push(p); };
  G.floatText = (text, x, y, col, big) => { G.texts.push({ text: String(text), x, y, col: col || '#fff', life: 1, big }); };
  G.label = (text, pos) => {
    const o = { x: W / 2, y: H / 2, size: 30 }; G.place(o, pos);
    G.labels.push({ text: String(text), x: o.x, y: o.y, born: G.time });
  };
  G.shake = n => { G.shakeAmt = Math.max(G.shakeAmt, n == null ? 10 : n); };
  G.sound = n => Sfx.play(n);

  G.explode = function (o) {
    const c = o.color;
    for (let i = 0; i < 46; i++) {
      const a = rnd(0, TAU), s = rnd(60, 420) * (o.size / 50);
      G.particle({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 0.9), size: rnd(2, 5), color: i % 3 ? c : '#ffd27a', drag: 2.5 });
    }
    for (let i = 0; i < 10; i++) {
      const a = rnd(0, TAU), s = rnd(20, 90);
      G.particle({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.6, 1.2), size: rnd(10, 22) * (o.size / 50), color: '#888888', smoke: true, drag: 1.5 });
    }
    G.particle({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.35, size: o.size * 1.8, color: '#ffffff', ring: true });
    G.particle({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.18, size: o.size * 1.2, color: '#fff3c0', flash: true });
    G.shake(Math.min(22, 6 + o.size / 6)); G.slow = 0.35; G.slowT = 0.08;
    Sfx.play('boom'); o.alive = false;
  };
  G.sparkle = function (o) {
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, TAU), s = rnd(40, 200);
      G.particle({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.7), size: rnd(2, 4), color: i % 2 ? o.color : '#ffffff', drag: 3, star: true });
    }
    G.particle({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.3, size: o.size * 1.4, color: o.color, ring: true });
    Sfx.play('coin'); o.alive = false;
  };
  G.addScore = function (n) {
    G.score += n; G.scorePop = 1;
    if (n > 0) { const p = G.lastHit; if (p) G.floatText('+' + n, p.x, p.y - 20, '#ffe680'); }
  };
  G.addLives = function (n) {
    if (G.lives == null) G.lives = 0;
    G.lives = Math.max(0, G.lives + n); G.livesPop = 1;
    if (n < 0) { G.flashA = 0.35; G.flashC = '#ff2040'; G.shake(12); Sfx.play('hit'); if (G.lives <= 0) G.gameOver(); }
    else Sfx.play('power');
  };
  G.gameOver = function () {
    if (G.state !== 'play') return;
    G.state = 'over'; G.overT = 0; G.slow = 0.25; G.slowT = 0.6; Sfx.play('over');
    if (G.score > best) { best = G.score; G.newBest = true; try { global.localStorage.setItem('ffscript-best', best); } catch (e) { } } else G.newBest = false;
  };
  G.win = function () {
    if (G.state !== 'play') return;
    G.state = 'won'; G.overT = 0; Sfx.play('win');
    for (let i = 0; i < 160; i++) G.particle({ x: rnd(0, W), y: rnd(-200, 0), vx: rnd(-60, 60), vy: rnd(80, 260), life: rnd(1.5, 3), size: rnd(4, 8), color: ['#ff4d5e', '#ffd93d', '#4ade80', '#4d8dff', '#ff7ac6'][i % 5], confetti: true, rot: rnd(0, TAU) });
  };

  let program = null;
  G.load = function (fn, keepPlaying) {
    program = fn; reset();
    const was = G.state;
    G.state = keepPlaying && (was === 'play' || was === 'over' || was === 'won') ? 'play' : 'title';
    try { program(G); } catch (e) { if (G.onError) G.onError(e); else throw e; }
  };
  function restart() { G.load(program, true); Sfx.play('start'); }
  function start() { Sfx.init(); if (G.state === 'title') { G.state = 'play'; Sfx.play('start'); } }

  function ownerDead(ev) { return ev.owner && !ev.owner.alive; }
  function run(fn, ...a) { try { fn(...a); } catch (e) { if (G.onError) { G.onError(e); G.state = 'error'; } else throw e; } }
  function matches(o, n) { return o.alive && (o.kind === n || o.name === n); }

  function update(dt) {
    G.time += dt;
    for (const ev of G.always) if (!ownerDead(ev)) run(ev.fn);
    for (const tm of G.timers) {
      if (tm.dead) continue;
      if (ownerDead(tm)) { tm.dead = true; continue; }
      tm.left -= dt;
      if (tm.left <= 0) { if (tm.every) tm.left += tm.every; else tm.dead = true; run(tm.fn); }
    }
    G.timers = G.timers.filter(t => !t.dead);
    for (const o of G.objs) {
      if (!o.alive) continue;
      o.age += dt;
      if (o.ctrl) controlStep(o, dt);
      if (o.homing) o.toward(o.homing.tg, o.homing.sp, true);
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.angle += o.spinV * Math.PI / 180 * dt;
      if (o.L.update) o.L.update(o, G, dt);
      if (o.bounce) {
        const r = o.size / 2;
        if (o.x < r && o.vx < 0 || o.x > W - r && o.vx > 0) { o.vx *= -1; o.x = clamp(o.x, r, W - r); }
        if (o.y < r && o.vy < 0 || o.y > H - r && o.vy > 0) { o.vy *= -1; o.y = clamp(o.y, r, H - r); }
      }
      if (o.ctrl) { const r = o.size / 2; o.x = clamp(o.x, r, W - r); o.y = clamp(o.y, r, H - r); }
      const out = o.x < -o.size * 2 || o.x > W + o.size * 2 || o.y < -o.size * 2 || o.y > H + o.size * 2;
      if (out && !o.ctrl) {
        o.alive = false;
        for (const lv of G.leaves) if (o.kind === lv.n || o.name === lv.n) run(lv.fn, o);
      }
    }
    const nowContacts = new Set();
    for (const t of G.touches) {
      const A = G.objs.filter(o => matches(o, t.a)), B = G.objs.filter(o => matches(o, t.b));
      for (const a of A) for (const b of B) {
        if (a === b || !a.alive || !b.alive) continue;
        const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          const key = t.a + '|' + t.b + '|' + G.objs.indexOf(a) + '|' + G.objs.indexOf(b);
          nowContacts.add(key);
          if (!G.contacts.has(key)) { G.lastHit = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; run(t.fn, a, b); }
        }
      }
    }
    G.contacts = nowContacts;
    if (G.objs.length > 400 || G.objs.some(o => !o.alive)) {
      const before = G.objs; G.objs = before.filter(o => o.alive);
      if (G.objs.length !== before.length) G.contacts = new Set();
    }
  }

  function controlStep(o, dt) {
    const k = G.keys, c = o.ctrl;
    let tx = 0, ty = 0;
    const follow = c === 'mouse' || (G.mouse.active && G.mouse.down);
    if (follow) {
      const dx = G.mouse.x - o.x, dy = c === 'leftright' ? 0 : G.mouse.y - o.y, d = Math.hypot(dx, dy);
      if (d > 4) { const s = Math.min(o.speed * 1.6, d * 10); tx = dx / d * s; ty = dy / d * s; }
    } else {
      const useArrows = c !== 'wasd';
      const l = (useArrows && k.left) || (c !== 'arrows' && k.a), r = (useArrows && k.right) || (c !== 'arrows' && k.d);
      const u = c !== 'leftright' && ((useArrows && k.up) || (c === 'wasd' && k.w)), dn = c !== 'leftright' && ((useArrows && k.down) || (c === 'wasd' && k.s));
      tx = (r ? 1 : 0) - (l ? 1 : 0); ty = (dn ? 1 : 0) - (u ? 1 : 0);
      const n = Math.hypot(tx, ty) || 1; tx = tx / n * o.speed; ty = ty / n * o.speed;
    }
    const a = 1 - Math.exp(-(tx || ty ? 12 : 8) * dt);
    o.vx = lerp(o.vx, tx, a); o.vy = lerp(o.vy, ty, a);
  }

  function stepParticles(dt) {
    for (const p of G.parts) {
      p.life -= dt; if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
      if (p.confetti) { p.vx += Math.sin(G.time * 3 + p.rot) * 40 * dt; p.rot += dt * 6; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    G.parts = G.parts.filter(p => p.life > 0);
    for (const t of G.texts) { t.life -= dt * 0.9; t.y -= 40 * dt; }
    G.texts = G.texts.filter(t => t.life > 0);
  }

  /* ---------- draw ---------- */
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","WenQuanYi Zen Hei",system-ui,sans-serif';
  function draw(rt) {
    ctx.save();
    if (G.shakeAmt > 0.3) ctx.translate(rnd(-1, 1) * G.shakeAmt, rnd(-1, 1) * G.shakeAmt);
    if (G.bg) BACKGROUNDS[G.bg](ctx, rt); else { ctx.fillStyle = G.bgColor; ctx.fillRect(-30, -30, W + 60, H + 60); }

    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of G.parts) if (p.smoke) {
      const k = p.life / p.max; ctx.fillStyle = `rgba(120,110,130,${0.18 * k})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k), 0, TAU); ctx.fill();
    }
    ctx.restore();

    for (const o of G.objs) {
      if (!o.alive) continue;
      const popK = o.pop > 0 ? 1 + Math.sin((1 - o.pop) * Math.PI) * 0.25 - o.pop * 0.6 : 1;
      ctx.save(); ctx.translate(o.x, o.y);
      if (o.L.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowHalo(ctx, o.size * 1.1, o.color, o.L.glow); ctx.restore(); }
      ctx.rotate(o.angle + (o.ctrl && o.lookName === 'ship' ? clamp(o.vx / 2000, -0.3, 0.3) : 0));
      if (o.ctrl && o.lookName === 'ship') ctx.scale(1 - Math.min(0.25, Math.abs(o.vx) / 2400), 1);
      ctx.scale(popK, popK);
      o.L.draw(ctx, o, rt);
      ctx.restore();
    }

    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of G.parts) {
      if (p.smoke) continue;
      const k = p.life / p.max;
      if (p.ring) {
        ctx.strokeStyle = rgba(p.color.startsWith('#') ? p.color : '#ffffff', k * 0.8); ctx.lineWidth = 4 * k + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * k) + 4, 0, TAU); ctx.stroke();
      } else if (p.flash) {
        ctx.save(); ctx.translate(p.x, p.y); glowHalo(ctx, p.size * (1.2 - k * 0.4), p.color, k); ctx.restore();
      } else if (p.confetti) {
        ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 2)); ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      } else {
        ctx.fillStyle = rgba(p.color.startsWith('#') ? p.color : '#ffffff', Math.min(1, k * 1.4));
        const sz = p.size * (0.4 + k * 0.6);
        if (p.star) { ctx.fillRect(p.x - sz * 1.5, p.y - sz * 0.25, sz * 3, sz * 0.5); ctx.fillRect(p.x - sz * 0.25, p.y - sz * 1.5, sz * 0.5, sz * 3); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, TAU); ctx.fill(); }
      }
    }
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = `800 ${t.big ? 42 : 24}px ${FONT}`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.col; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    for (const l of G.labels) {
      ctx.font = `800 30px ${FONT}`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(l.text, l.x, l.y); ctx.fillStyle = '#fff'; ctx.fillText(l.text, l.x, l.y);
    }
    ctx.restore();

    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (G.flashA > 0.01) { ctx.fillStyle = rgba(G.flashC, G.flashA); ctx.fillRect(0, 0, W, H); }

    hud(rt);
  }

  function pill(x, y, w, h) {
    ctx.fillStyle = 'rgba(10,10,25,0.45)'; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function hud(t) {
    ctx.textBaseline = 'middle';
    if (G.state !== 'title') {
      const s = 1 + G.scorePop * 0.35;
      ctx.font = `800 26px ${FONT}`; const txt = String(G.score), w = ctx.measureText(txt).width;
      pill(18, 16, w + 90, 44);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `700 15px ${FONT}`; ctx.fillText('SCORE', 34, 38);
      ctx.save(); ctx.translate(96 + w / 2, 38); ctx.scale(s, s); ctx.textAlign = 'center';
      ctx.font = `800 26px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.fillText(txt, 0, 1); ctx.restore();
      if (G.lives != null) {
        const n = G.lives, hw = 30, tw = Math.max(1, Math.min(n, 10)) * hw + 22;
        pill(W - 18 - tw, 16, tw, 44);
        for (let i = 0; i < Math.min(n, 10); i++) {
          ctx.save(); ctx.translate(W - 18 - tw + 26 + i * hw, 38);
          const k = i === n - 1 ? 1 + G.livesPop * 0.4 : 1; ctx.scale(k, k);
          LOOKS.heart.draw(ctx, { size: 22, color: '#ff4d5e', seed: i }, t); ctx.restore();
        }
      }
    }
    if (G.state === 'title') overlay(G.titleText || 'FF Script', '클릭하거나 아무 키나 눌러 시작', t, 1);
    if (G.state === 'over') {
      const a = clamp((G.overT - 0.3) * 2.5, 0, 1);
      if (a > 0) overlay('GAME OVER', `점수 ${G.score}${G.newBest ? '  ·  최고 기록!' : '  ·  최고 ' + best}`, t, a, G.overT > 0.9 ? '다시 하려면 클릭' : '');
    }
    if (G.state === 'won') {
      const a = clamp((G.overT - 0.3) * 2.5, 0, 1);
      if (a > 0) overlay('YOU WIN!', `점수 ${G.score}`, t, a, G.overT > 0.9 ? '다시 하려면 클릭' : '');
    }
  }
  function overlay(big, small, t, a, extra) {
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,5,20,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    const bob = Math.sin(t * 2) * 4;
    ctx.font = `900 64px ${FONT}`;
    const g = ctx.createLinearGradient(0, H / 2 - 90, 0, H / 2 - 20);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9fd8ff');
    ctx.shadowColor = 'rgba(120,200,255,0.8)'; ctx.shadowBlur = 30;
    ctx.fillStyle = g; ctx.fillText(big, W / 2, H / 2 - 50 + bob);
    ctx.shadowBlur = 0;
    ctx.font = `700 22px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(small, W / 2, H / 2 + 20);
    const ex = extra === undefined ? '' : extra;
    if (ex) { ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(t * 4)); ctx.font = `700 18px ${FONT}`; ctx.fillText(ex, W / 2, H / 2 + 64); }
    ctx.restore();
  }

  /* ---------- loop & input ---------- */
  let last = 0, rt = 0, raf = 0;
  function frame(now) {
    raf = global.requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - (last || now)) / 1000); last = now; rt += real;
    if (G.slowT > 0) G.slowT -= real; else G.slow = lerp(G.slow, 1, 1 - Math.exp(-8 * real));
    const dt = real * G.slow;
    if (G.state === 'play') update(dt);
    if (G.state === 'over' || G.state === 'won') {
      G.overT += real;
      for (const o of G.objs) if (o.alive && !o.ctrl) { o.x += o.vx * dt; o.y += o.vy * dt; o.angle += o.spinV * Math.PI / 180 * dt; }
    }
    for (const o of G.objs) if (o.pop > 0) o.pop = Math.max(0, o.pop - real * 4.5);
    stepParticles(dt);
    G.shakeAmt *= Math.exp(-10 * real); G.flashA *= Math.exp(-6 * real);
    G.scorePop *= Math.exp(-10 * real); G.livesPop *= Math.exp(-8 * real);
    fit();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw(rt);
  }
  let scale = 1;
  function fit() {
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.round(cw * H / W);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    scale = cw / W;
  }
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function fireKey(k) { for (const ev of G.keyEvents) if (ev.k === k) run(ev.fn); }
  function press() {
    Sfx.init();
    if (G.state === 'title') { start(); return true; }
    if ((G.state === 'over' || G.state === 'won') && G.overT > 0.9) { restart(); return true; }
    return false;
  }
  G.focusTarget = canvas;
  const onKeyDown = e => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    const k = keyName(e);
    if (['space', 'up', 'down', 'left', 'right'].includes(k)) e.preventDefault();
    if (press()) return;
    if (!G.keys[k] && G.state === 'play') fireKey(k);
    G.keys[k] = true;
  };
  const onKeyUp = e => { G.keys[keyName(e)] = false; };
  const onDown = e => {
    const p = toWorld(e); G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.down = true;
    if (e.pointerType !== 'mouse') G.mouse.active = true;
    if (press()) return;
    if (G.state === 'play') fireKey('click');
  };
  const onMove = e => { const p = toWorld(e); G.mouse.x = p.x; G.mouse.y = p.y; };
  const onUp = () => { G.mouse.down = false; };
  global.addEventListener('keydown', onKeyDown);
  global.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onDown);
  global.addEventListener('pointermove', onMove);
  global.addEventListener('pointerup', onUp);
  canvas.style.touchAction = 'none';
  G.restart = restart;
  G.destroy = () => {
    global.cancelAnimationFrame(raf);
    global.removeEventListener('keydown', onKeyDown); global.removeEventListener('keyup', onKeyUp);
    global.removeEventListener('pointermove', onMove); global.removeEventListener('pointerup', onUp);
  };
  reset(); G.state = 'title';
  raf = global.requestAnimationFrame(frame);
}

global.FFRuntime = { Engine, LOOKS, BACKGROUNDS, COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
