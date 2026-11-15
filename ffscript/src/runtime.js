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
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function color(c) { return own(COLORS, c) ? COLORS[c] : String(c); }
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
const MUSIC = {
  chill: { tempo: 260, wave: 'sine', vol: 0.05, bassEvery: 8, bass: [131, 110, 87, 98], lead: [523, 0, 659, 0, 784, 659, 0, 523, 587, 0, 698, 0, 880, 698, 0, 587, 523, 0, 659, 0, 784, 0, 659, 523, 494, 0, 587, 0, 784, 0, 0, 0] },
  happy: { tempo: 170, wave: 'triangle', vol: 0.06, bassEvery: 4, bass: [131, 131, 175, 196], lead: [523, 659, 784, 659, 523, 659, 784, 1047, 587, 698, 880, 698, 587, 698, 880, 1175] },
  action: { tempo: 140, wave: 'square', vol: 0.03, bassEvery: 2, bass: [110, 110, 131, 98], lead: [440, 0, 523, 440, 0, 659, 523, 0, 392, 0, 494, 392, 0, 587, 494, 0] }
};
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
  toggleMute() { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : 0.5; return this.muted; },
  setMusic(name) {
    clearInterval(this.mt); this.mt = 0;
    const P = MUSIC[name];
    if (!this.ctx || !P) return;
    let step = 0;
    this.mt = setInterval(() => {
      if (this.ctx.state !== 'running') return;
      const n = P.lead[step % P.lead.length];
      if (n) this.tone(P.wave, n, n, P.tempo / 1000 * 1.6, P.vol);
      if (step % P.bassEvery === 0) { const b = P.bass[(step / P.bassEvery | 0) % P.bass.length]; this.tone('triangle', b, b, P.tempo / 1000 * P.bassEvery * 0.9, P.vol * 1.6); }
      step++;
    }, P.tempo);
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
      case 'laser': this.tone('sawtooth', 1400 * p, 200, 0.18, 0.12); break;
      case 'click': this.tone('square', 1800, 1200, 0.03, 0.1); break;
      case 'magic': [784, 988, 1319, 1568].forEach((f, i) => this.tone('sine', f * p, f * p, 0.14, 0.14, i * 0.05)); break;
      case 'hurt': this.tone('sawtooth', 220 * p, 90, 0.2, 0.22); this.hiss(0.1, 0.25, 1500, 200); break;
      case 'whoosh': this.hiss(0.35, 0.3, 300, 4000); break;
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

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
look('text', {
  size: 48, color: '#ffffff', hit: 0.38,
  draw(ctx, o) {
    ctx.font = `${o.size * 0.9}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = o.color; ctx.fillText(o.text, 0, o.size * 0.04);
  }
});
look('platform', {
  size: 180, color: '#8a5a38', hit: 0.01, solid: true, ph: 22,
  draw(ctx, o) {
    const w = o.size, h = 22, c = o.color;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(c, 0.15)); g.addColorStop(1, shade(c, -0.45));
    ctx.fillStyle = g; roundRect(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill();
    ctx.fillStyle = '#5fd06a'; roundRect(ctx, -w / 2, -h / 2 - 3, w, 10, 5); ctx.fill();
    ctx.fillStyle = '#8df08f'; roundRect(ctx, -w / 2 + 4, -h / 2 - 2, w - 8, 3, 2); ctx.fill();
    ctx.fillStyle = rgba('#000000', 0.18);
    for (let x = -w / 2 + 14; x < w / 2 - 8; x += 26) { ctx.beginPath(); ctx.arc(x, 4, 2.4, 0, TAU); ctx.fill(); }
  }
});
look('spike', {
  size: 44, color: '#c9cfe0', hit: 0.34,
  draw(ctx, o) {
    const s = o.size / 2, c = o.color, n = 3, w = s * 2 / n;
    for (let i = 0; i < n; i++) {
      const x = -s + i * w;
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, shade(c, 0.4)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -0.5));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, s); ctx.lineTo(x + w / 2, -s); ctx.lineTo(x + w, s); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = rgba('#000000', 0.3); ctx.fillRect(-s, s - 4, s * 2, 4);
  }
});
look('flag', {
  size: 64, color: '#ff4d5e', hit: 0.45, glow: 0.35,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color;
    ctx.fillStyle = '#e8e8f0'; ctx.fillRect(-s * 0.7, -s, s * 0.14, s * 2);
    ctx.fillStyle = '#ffd93d'; ctx.beginPath(); ctx.arc(-s * 0.63, -s, s * 0.14, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.56, -s * 0.9);
    for (let i = 0; i <= 10; i++) { const u = i / 10; ctx.lineTo(-s * 0.56 + u * s * 1.5, -s * 0.9 + Math.sin(t * 6 + u * 5) * 4 * u); }
    for (let i = 10; i >= 0; i--) { const u = i / 10; ctx.lineTo(-s * 0.56 + u * s * 1.5, -s * 0.2 + Math.sin(t * 6 + u * 5) * 4 * u); }
    ctx.closePath(); ctx.fillStyle = c; ctx.fill();
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


look('gem', {
  size: 38, color: '#5ee7ff', hit: 0.45, glow: 0.4,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color;
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, shade(c, 0.6)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -0.45));
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.8); ctx.lineTo(s * 0.55, -s * 0.8); ctx.lineTo(s, -s * 0.2); ctx.lineTo(0, s); ctx.lineTo(-s, -s * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-s, -s * 0.2); ctx.lineTo(s, -s * 0.2); ctx.moveTo(-s * 0.55, -s * 0.8); ctx.lineTo(-s * 0.25, -s * 0.2); ctx.lineTo(0, s);
    ctx.moveTo(s * 0.55, -s * 0.8); ctx.lineTo(s * 0.25, -s * 0.2); ctx.lineTo(0, s); ctx.stroke();
    const k = Math.max(0, Math.sin(t * 3 + o.seed)) ** 6;
    ctx.fillStyle = rgba('#ffffff', k); ctx.fillRect(-s * 0.5 - 4, -s * 0.5 - 1, 8, 2); ctx.fillRect(-s * 0.5 - 1, -s * 0.5 - 4, 2, 8);
  }
});
look('bomb', {
  size: 44, color: '#2b2b38', hit: 0.4,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color;
    const g = ctx.createRadialGradient(-s * 0.35, -s * 0.3, s * 0.05, 0, s * 0.1, s);
    g.addColorStop(0, shade(c, 0.7)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, s * 0.12, s * 0.82, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8b8b9c'; ctx.fillRect(-s * 0.18, -s * 0.78, s * 0.36, s * 0.22);
    ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -s * 0.78); ctx.quadraticCurveTo(s * 0.3, -s * 1.1, s * 0.5, -s * 0.95); ctx.stroke();
    const f = 0.6 + 0.4 * Math.sin(t * 30);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(s * 0.5, -s * 0.95); glowHalo(ctx, s * 0.5 * f + 4, '#ffb43c', 0.9); ctx.restore();
  }
});
look('ghost', {
  size: 54, color: '#f4f6ff', hit: 0.4,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color, b = Math.sin(t * 3 + o.seed) * 3;
    ctx.translate(0, b);
    const g = ctx.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(c, -0.25));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-s * 0.8, s * 0.8); ctx.lineTo(-s * 0.8, -s * 0.1);
    ctx.bezierCurveTo(-s * 0.8, -s * 1.1, s * 0.8, -s * 1.1, s * 0.8, -s * 0.1); ctx.lineTo(s * 0.8, s * 0.8);
    for (let i = 0; i < 4; i++) { const x1 = s * 0.8 - (i + 0.5) * s * 0.4, x2 = s * 0.8 - (i + 1) * s * 0.4; ctx.quadraticCurveTo(x1, s * (i % 2 ? 0.8 : 1.1) + Math.sin(t * 6 + i) * 2, x2, s * 0.8); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.15, s * 0.11, s * 0.17, 0, 0, TAU); ctx.ellipse(s * 0.3, -s * 0.15, s * 0.11, s * 0.17, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.1, s * 0.14, 0, 0, TAU); ctx.fill();
  }
});
look('fish', {
  size: 56, color: '#ff9a3c', hit: 0.38,
  draw(ctx, o, t) {
    const s = o.size / 2, c = o.color;
    if (o.vx < 0) ctx.scale(-1, 1);
    const w = Math.sin(t * 9 + o.seed) * s * 0.18;
    ctx.fillStyle = shade(c, -0.25); ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(-s * 1.05, -s * 0.5 + w); ctx.lineTo(-s * 1.05, s * 0.5 + w); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(0, -s * 0.6, 0, s * 0.6);
    g.addColorStop(0, shade(c, 0.4)); g.addColorStop(1, shade(c, -0.3));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.75, s * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.35); ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.2, s * 0.35, s * 0.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.1, s * 0.13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(s * 0.43, -s * 0.1, s * 0.06, 0, TAU); ctx.fill();
  }
});
look('cloud', {
  size: 110, color: '#ffffff', hit: 0.3,
  draw(ctx, o) {
    const s = o.size / 2, c = o.color;
    ctx.fillStyle = rgba(c, 0.92); ctx.beginPath();
    [[-0.5, 0.1, 0.38], [-0.1, -0.2, 0.5], [0.35, 0.05, 0.4], [0, 0.2, 0.42]].forEach(([x, y, r]) => { ctx.moveTo(x * s + r * s, y * s); ctx.arc(x * s, y * s, r * s, 0, TAU); });
    ctx.fill();
  }
});
look('tree', {
  size: 90, color: '#3fae5a', hit: 0.3,
  draw(ctx, o) {
    const s = o.size / 2, c = o.color;
    ctx.fillStyle = '#7a4e2c'; ctx.fillRect(-s * 0.12, s * 0.35, s * 0.24, s * 0.65);
    [[0.35, 0.8], [0.0, 0.62], [-0.32, 0.45]].forEach(([y, w], i) => {
      const g = ctx.createLinearGradient(-s * w, 0, s * w, 0);
      g.addColorStop(0, shade(c, -0.25 + i * 0.05)); g.addColorStop(0.5, shade(c, 0.1 + i * 0.05)); g.addColorStop(1, shade(c, -0.35));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, y * s - s * 0.55); ctx.lineTo(s * w, y * s + s * 0.2); ctx.lineTo(-s * w, y * s + s * 0.2); ctx.closePath(); ctx.fill();
    });
  }
});
look('block', {
  size: 48, color: '#8a6a4a', hit: 0.01, solid: true, full: true,
  draw(ctx, o) {
    const s = o.size, c = o.color, h = s / 2;
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, shade(c, 0.12)); g.addColorStop(1, shade(c, -0.4));
    ctx.fillStyle = g; ctx.fillRect(-h, -h, s, s);
    ctx.strokeStyle = rgba('#000000', 0.22); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, 0); ctx.moveTo(-h * 0.1, -h); ctx.lineTo(-h * 0.1, 0); ctx.moveTo(h * 0.45, 0); ctx.lineTo(h * 0.45, h); ctx.stroke();
    ctx.strokeStyle = rgba('#000000', 0.3); ctx.strokeRect(-h + 0.5, -h + 0.5, s - 1, s - 1);
    if (o.grassTop) {
      ctx.fillStyle = '#5fd06a'; ctx.fillRect(-h, -h, s, s * 0.2);
      ctx.fillStyle = '#8df08f'; ctx.fillRect(-h, -h, s, 3);
      ctx.fillStyle = '#4aa552'; for (let x = -h + 3; x < h - 3; x += 9) ctx.fillRect(x, -h + s * 0.2, 4, 4);
    }
  }
});

const PAL = { k: '#14141c', w: '#ffffff', r: '#ff4d5e', o: '#ff9a3c', y: '#ffd93d', g: '#4ade80', b: '#4d8dff', p: '#a66bff', c: '#5ee7ff', n: '#a86b45', m: '#ff7ac6', d: '#6b7080' };
function defineArt(name, rows, col) {
  const R = rows.length, C = Math.max(1, ...rows.map(r => r.length));
  LOOKS[name] = {
    size: 56, color: color(col || 'white'), hit: 0.4,
    draw(ctx, o) {
      const ps = o.size / Math.max(R, C), x0 = -C * ps / 2, y0 = -R * ps / 2;
      for (let r = 0; r < R; r++) for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c]; if (ch === '.' || ch === ' ') continue;
        ctx.fillStyle = ch === '#' ? o.color : (PAL[ch] || o.color);
        ctx.fillRect(x0 + c * ps, y0 + r * ps, ps + 0.6, ps + 0.6);
      }
    }
  };
}

function tree(ctx, x, base, h, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + h * 0.3, base); ctx.lineTo(x - h * 0.3, base); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, base - h * 1.3); ctx.lineTo(x + h * 0.22, base - h * 0.5); ctx.lineTo(x - h * 0.22, base - h * 0.5); ctx.fill();
}
Object.assign(BACKGROUNDS, {
  sunset(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b1055'); g.addColorStop(0.55, '#d4457a'); g.addColorStop(1, '#ffb36b'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W * 0.5, H * 0.66); glowHalo(ctx, 300, '#ffd28a', 0.55); ctx.fillStyle = '#fff1c9'; ctx.beginPath(); ctx.arc(0, 0, 72, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(40,10,50,0.7)'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const x = ((t * 40 + i * 260) % (W + 200)) - 100, y = 110 + (i % 2) * 60 + Math.sin(t * 2 + i) * 6, f = Math.sin(t * 9 + i) * 5;
      ctx.beginPath(); ctx.moveTo(x - 12, y - f); ctx.quadraticCurveTo(x - 5, y - 6, x, y); ctx.quadraticCurveTo(x + 5, y - 6, x + 12, y - f); ctx.stroke();
    }
    hills(ctx, t, '#4a1d5e', 0.5, 420, 35); hills(ctx, t, '#2a0f3d', 1.2, 470, 28);
  },
  forest(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d2430'); g.addColorStop(1, '#1f5a44'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(780, 90); glowHalo(ctx, 120, '#cfffe0', 0.25); ctx.fillStyle = '#e6fff0'; ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.fill(); ctx.restore();
    for (let i = 0; i < 16; i++) tree(ctx, i * 66 + 20, 430, 120 + (i * 37) % 40, '#12392f');
    for (let i = 0; i < 12; i++) tree(ctx, i * 90 + 50, 480, 170 + (i * 53) % 50, '#0b2a22');
    hills(ctx, t, '#0a2219', 1, 500, 20);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, b] of STARS[1]) {
      const px = x + Math.sin(t * 0.7 + y) * 20, py = 180 + y * 0.6 + Math.cos(t * 0.9 + x) * 14, a = 0.2 + 0.7 * Math.max(0, Math.sin(t * 2 + x));
      ctx.fillStyle = rgba('#ffee88', a); ctx.beginPath(); ctx.arc(px, py, 1.5 + b * 1.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
  lava(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#12040a'); g.addColorStop(0.6, '#3d0c08'); g.addColorStop(1, '#8a2a08'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0c0306'; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 330 + ((x * 7) % 90) + Math.sin(x * 0.02) * 30);
    ctx.lineTo(W, H); ctx.fill();
    const lg = ctx.createLinearGradient(0, H - 170, 0, H); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, 'rgba(255,120,30,0.65)');
    ctx.fillStyle = lg; ctx.fillRect(0, H - 170, W, 170);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, b] of STARS[1]) {
      const yy = H - ((H - y + t * (30 + b * 70)) % H), a = Math.min(1, yy / H * 1.6);
      ctx.fillStyle = rgba('#ff9a3c', 0.25 + 0.6 * a * b); ctx.beginPath(); ctx.arc(x + Math.sin(t + y) * 10, yy, 1 + b * 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
  snow(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8cc7ff'); g.addColorStop(1, '#eaf5ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    hills(ctx, t, '#f7fbff', 0.5, 420, 38); hills(ctx, t, '#d3e5f7', 1.3, 475, 26);
    for (const [x, y, b] of STARS[0]) {
      const yy = (y + t * (22 + b * 50)) % H, xx = x + Math.sin(t * 0.8 + y) * 18;
      ctx.fillStyle = `rgba(255,255,255,${0.5 + b * 0.5})`; ctx.beginPath(); ctx.arc(xx, yy, 1.4 + b * 2.4, 0, TAU); ctx.fill();
    }
  },
  grid(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0220'); g.addColorStop(0.62, '#3b0a5a'); g.addColorStop(1, '#12031f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const hz = 330;
    const sg = ctx.createLinearGradient(0, hz - 220, 0, hz); sg.addColorStop(0, '#ffe15a'); sg.addColorStop(1, '#ff3d8b');
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, hz - 10, 130, Math.PI, TAU); ctx.closePath(); ctx.fillStyle = sg; ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,60,200,0.75)'; ctx.lineWidth = 1.5;
    for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 14, hz); ctx.lineTo(W / 2 + i * 130, H); ctx.stroke(); }
    for (let i = 0; i < 10; i++) { const u = ((i + (t * 0.6) % 1) / 10), y = hz + (u * u) * (H - hz); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = '#12031f'; ctx.fillRect(0, hz - 1, W, 2);
  }
});

/* ---------- objects ---------- */
let seedN = 1;
class Obj {
  constructor(G, kind, lookName) {
    const L = own(LOOKS, lookName) ? LOOKS[lookName] : LOOKS.ball;
    this.G = G; this.kind = kind; this.name = null; this.L = L; this.lookName = lookName;
    this.x = W / 2; this.y = H / 2; this.vx = 0; this.vy = 0; this.size = L.size; this.color = L.color;
    this.angle = 0; this.spinV = L.spin ? rnd(-90, 90) : 0; this.alive = true; this.age = 0;
    this.ctrl = null; this.speed = 300; this.bounce = false; this.seed = (seedN++ * 1.7) % 10;
    this.flash = 0; this.pop = 0; this.homing = null; this.hp = 1;
    this.text = ''; this.gravity = 0; this.solid = !!L.solid; this.ph = L.ph || 0; this.onGround = false; this.standing = null;
    this.jumpV = 760; this.coyote = 0; this.jumpHeld = false;
    this.maxHp = 1; this.alpha = 1; this.glowC = null; this.trailC = null; this.wrap = false; this.stay = false;
    this.lifeLeft = 0; this.flipX = false; this.patrol = null; this.wander = 0; this.wanderT = 0; this.bounceK = 1; this.full = !!L.full;
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
  control(type) { this.ctrl = type; if (type === 'platformer' && !this.gravity) this.gravity = 1900; return this; }
  setSpeed(v) { this.speed = v; return this; }
  setSize(v) { this.size = v; if (this.full) this.ph = v; return this; }
  setHealth(n) { this.hp = this.maxHp = n; return this; }
  hurt(n) {
    if (n == null) n = 1;
    this.hp -= n; this.flash = 0.35; this.pop = 0.6;
    if (this.hp <= 0) this.G.explode(this); else { Sfx.play('hurt'); this.G.sparkBits(this, 8); }
    return this;
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + (n == null ? 1 : n)); return this; }
  setAlpha(v) { this.alpha = clamp(v, 0, 1); return this; }
  hide() { this.alpha = 0; return this; }
  show() { this.alpha = 1; return this; }
  setGlow(c) { this.glowC = c ? color(c) : this.color; return this; }
  setTrail(c) { this.trailC = c ? color(c) : this.color; return this; }
  setWrap() { this.wrap = true; return this; }
  setStay() { this.stay = true; return this; }
  setLife(n) { this.lifeLeft = n; return this; }
  flip() { this.flipX = !this.flipX; return this; }
  setPatrol(range, sp) { this.patrol = { x0: this.x, range, sp: sp == null ? 80 : sp, dir: 1 }; return this; }
  setWander(sp) { this.wander = sp == null ? 80 : sp; return this; }
  setColor(c) { this.color = color(c); return this; }
  spin(v) { this.spinV = v; return this; }
  setBounce(k) { this.bounce = true; this.bounceK = k == null ? 1 : k; return this; }
  setLook(n) {
    const L = own(LOOKS, n) ? LOOKS[n] : null;
    if (L) { this.L = L; this.lookName = n; if (L.init) L.init(this); } else { this.L = LOOKS.text; this.lookName = 'text'; this.text = String(n); }
    return this;
  }
  setGravity(v) { this.gravity = v == null ? 1900 : v; return this; }
  setSolid() { this.solid = true; if (!this.ph) this.ph = this.size * 0.5; return this; }
  jump(v) {
    if (v != null) this.jumpV = v;
    if (this.onGround || !this.gravity) { this.vy = -this.jumpV; this.onGround = false; this.standing = null; Sfx.play('jump'); }
    return this;
  }
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
['move', 'toward', 'stop', 'control', 'setSpeed', 'setSize', 'setColor', 'spin', 'setBounce', 'setLook', 'setGravity', 'setSolid', 'jump', 'explode', 'sparkle', 'remove', 'say',
  'setHealth', 'hurt', 'heal', 'setAlpha', 'hide', 'show', 'setGlow', 'setTrail', 'setWrap', 'setStay', 'setLife', 'flip', 'setPatrol', 'setWander']
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
  const bestKey = () => 'ffscript-best:' + (G.titleText || '');
  function loadBest() { best = 0; try { best = +(global.localStorage.getItem(bestKey()) || 0); } catch (e) { } }
  function saveBest() {
    G.newBest = false;
    if (G.score > best) { best = G.score; G.newBest = true; try { global.localStorage.setItem(bestKey(), best); } catch (e) { } }
  }

  function reset() {
    G.objs = []; G.parts = []; G.texts = []; G.labels = []; G.timers = []; G.always = []; G.touches = []; G.keyEvents = []; G.leaves = []; G.conds = [];
    G.contacts = new Set(); G.time = 0; G.score = 0; G.lives = null; G.titleText = ''; G.bg = 'space'; G.bgColor = null;
    G.shakeAmt = 0; G.flashA = 0; G.flashC = '#ffffff'; G.slow = 1; G.slowT = 0; G.scorePop = 0; G.livesPop = 0; G.overT = 0;
    G.level = 1; G.showLevel = false; G.bannerT = 0; G.bannerText = ''; G.paused = false; G.hintT = 0; G.musicName = null; G.newBest = false;
  }
  G.rand = (a, b) => (Number.isInteger(a) && Number.isInteger(b)) ? Math.floor(rnd(a, b + 1)) : rnd(a, b);
  G.count = name => G.objs.filter(o => o.alive && (o.kind === name || o.name === name)).length;
  G.group = name => new Group(G, name);
  G.title = t => { G.titleText = String(t); };
  G.background = b => { if (own(BACKGROUNDS, b)) { G.bg = b; G.bgColor = null; } else { G.bg = null; G.bgColor = color(b); } };
  G.setLives = n => { G.lives = n; };

  G.make = function (kind, look, pos, from) {
    const o = new Obj(G, kind, look);
    if (look === 'text') o.text = String(kind);
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
  G.onCond = (cond, fn) => { G.conds.push({ cond, fn, prev: false }); };

  G.particle = p => { p.max = p.life; if (G.parts.length < 1500) G.parts.push(p); };
  G.floatText = (text, x, y, col, big) => { G.texts.push({ text: String(text), x, y, col: col || '#fff', life: 1, big }); };
  G.label = (text, pos) => {
    const o = { x: W / 2, y: H / 2, size: 30 }; G.place(o, pos);
    const a0 = pos && pos[0], align = a0 === 'left' ? 'left' : a0 === 'right' ? 'right' : 'center';
    const x = align === 'left' ? 24 : align === 'right' ? W - 24 : o.x;
    G.labels.push({ text, x, y: o.y, align, born: G.time });
  };
  G.shake = n => { G.shakeAmt = Math.max(G.shakeAmt, n == null ? 10 : n); };
  G.sound = n => Sfx.play(n);
  G.banner = (text, sec) => { G.bannerText = String(text); G.bannerDur = G.bannerT = sec || 2; };
  G.choose = (...a) => a[Math.floor(Math.random() * a.length)];
  G.chance = p => Math.random() * 100 < p;
  G.dist = (a, b) => { const A = a === 'mouse' ? G.mouse : a, B = b === 'mouse' ? G.mouse : b; return Math.hypot((A.x || 0) - (B.x || 0), (A.y || 0) - (B.y || 0)); };
  G.flashScreen = c => { G.flashA = 0.45; G.flashC = color(c || 'white'); };
  G.slowmo = sec => { G.slow = 0.3; G.slowT = sec == null ? 1 : sec; };
  G.sparkBits = (o, n) => {
    for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(50, 220); G.particle({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.25, 0.5), size: rnd(2, 4), color: o.color, drag: 3 }); }
  };
  G.burst = (n, c, pos) => {
    const o = { x: W / 2, y: H / 2, size: 30 }; G.place(o, pos);
    const col = color(c || 'gold');
    for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(60, 380); G.particle({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 0.9), size: rnd(2, 5), color: i % 3 ? col : '#ffffff', drag: 2.2, star: i % 4 === 0 }); }
    G.particle({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.35, size: 70, color: col, ring: true });
  };
  G.confetti = () => {
    for (let i = 0; i < 160; i++) G.particle({ x: rnd(0, W), y: rnd(-200, 0), vx: rnd(-60, 60), vy: rnd(80, 260), life: rnd(1.5, 3), size: rnd(4, 8), color: ['#ff4d5e', '#ffd93d', '#4ade80', '#4d8dff', '#ff7ac6'][i % 5], confetti: true, rot: rnd(0, TAU) });
  };
  G.defineArt = defineArt;
  G.buildMap = rows => {
    const R = rows.length, C = Math.max(1, ...rows.map(r => r.length));
    const cell = Math.max(16, Math.min(48, Math.floor(H / R), Math.floor(W / C)));
    const ox = (W - C * cell) / 2, oy = H - R * cell;
    const at = (r, c) => (rows[r] || '')[c] || '.';
    let player;
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]; if (ch === '.' || ch === ' ') continue;
        const x = ox + (c + 0.5) * cell, y = oy + (r + 0.5) * cell, bottom = oy + (r + 1) * cell;
        let o;
        const item = (look, k) => { o = G.make(look, look, [x, y]); o.size = cell * k; };
        const ground = (look, k) => { o = G.make(look, look, [x, bottom - cell * k / 2]); o.size = cell * k; };
        switch (ch) {
          case '#': o = G.make('block', 'block', [x, y]); o.size = cell; o.ph = cell; o.grassTop = at(r - 1, c) !== '#'; break;
          case '=': o = G.make('platform', 'platform', [x, oy + r * cell + 11]); o.size = cell; break;
          case 'C': item('coin', 0.72); break;
          case 'G': item('gem', 0.8); break;
          case 'S': item('star', 0.85); break;
          case 'H': item('heart', 0.8); break;
          case 'B': ground('bomb', 0.9); break;
          case '^': ground('spike', 0.9); break;
          case 'F': ground('flag', 1.5); break;
          case 'E': ground('slime', 0.95); break;
          case 'P': ground('hero', 0.95); o.name = 'player'; o.control('platformer'); o.speed = 340; player = o; break;
        }
      }
    });
    return player;
  };
  G.music = n => { G.musicName = n; if (G.state === 'play') Sfx.setMusic(n); };
  G.useLevel = () => { G.showLevel = true; };
  G.levelUp = () => {
    G.level++; G.showLevel = true; G.banner('LEVEL ' + G.level, 2); G.flashA = 0.2; G.flashC = '#ffd93d';
    Sfx.play('power');
  };

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
    saveBest(); Sfx.setMusic(null);
  };
  G.win = function () {
    if (G.state !== 'play') return;
    G.state = 'won'; G.overT = 0; saveBest(); Sfx.setMusic(null); Sfx.play('win');
    for (let i = 0; i < 160; i++) G.particle({ x: rnd(0, W), y: rnd(-200, 0), vx: rnd(-60, 60), vy: rnd(80, 260), life: rnd(1.5, 3), size: rnd(4, 8), color: ['#ff4d5e', '#ffd93d', '#4ade80', '#4d8dff', '#ff7ac6'][i % 5], confetti: true, rot: rnd(0, TAU) });
  };

  let program = null;
  G.load = function (fn, keepPlaying) {
    program = fn; reset();
    const was = G.state;
    G.state = G.autostart || (keepPlaying && (was === 'play' || was === 'over' || was === 'won')) ? 'play' : 'title';
    try { program(G); } catch (e) { if (G.onError) G.onError(e); else throw e; }
    loadBest();
    if (G.state !== 'play') Sfx.setMusic(null);
  };
  function restart() { G.load(program, true); Sfx.play('start'); }
  function start() { Sfx.init(); if (G.state === 'title') { G.state = 'play'; Sfx.play('start'); Sfx.setMusic(G.musicName); } }

  function ownerDead(ev) { return ev.owner && !ev.owner.alive; }
  function run(fn, ...a) { try { fn(...a); } catch (e) { if (G.onError) { G.onError(e); G.state = 'error'; } else throw e; } }
  function matches(o, n) { return o.alive && (o.kind === n || o.name === n); }

  function update(dt) {
    G.time += dt;
    for (const ev of G.always) if (!ownerDead(ev)) run(ev.fn);
    for (const c of G.conds) {
      let v = false;
      run(() => { v = !!c.cond(); });
      if (v && !c.prev) run(c.fn);
      c.prev = v;
    }
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
      if (o.lifeLeft > 0) { o.lifeLeft -= dt; if (o.lifeLeft <= 0) { G.sparkBits(o, 6); o.alive = false; continue; } }
      if (o.patrol) {
        const pt = o.patrol; if (o.x - pt.x0 > pt.range) pt.dir = -1; else if (o.x - pt.x0 < -pt.range) pt.dir = 1;
        o.vx = pt.dir * pt.sp; o.flipX = pt.dir < 0;
      }
      if (o.wander) {
        o.wanderT -= dt;
        if (o.wanderT <= 0) { o.wanderT = rnd(0.6, 1.6); const a = rnd(0, TAU); o.vx = Math.cos(a) * o.wander; if (!o.gravity) o.vy = Math.sin(a) * o.wander; o.flipX = o.vx < 0; }
      }
      if (o.gravity) o.vy += o.gravity * dt;
      if (o.standing && o.standing.alive) { o.x += o.standing.vx * dt; o.y += o.standing.vy * dt; }
      const py = o.y;
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.angle += o.spinV * Math.PI / 180 * dt;
      if (o.L.update) o.L.update(o, G, dt);
      if (o.bounce) {
        const r = o.size / 2;
        if (o.x < r && o.vx < 0 || o.x > W - r && o.vx > 0) { o.vx *= -o.bounceK; o.x = clamp(o.x, r, W - r); }
        if (o.y < r && o.vy < 0 || o.y > H - r && o.vy > 0) { o.vy *= -o.bounceK; o.y = clamp(o.y, r, H - r); if (o.gravity && Math.abs(o.vy) < 60) o.vy = 0; }
      }
      if (o.wrap) {
        const h = o.size / 2;
        if (o.x < -h) o.x = W + h; else if (o.x > W + h) o.x = -h;
        if (o.y < -h) o.y = H + h; else if (o.y > H + h) o.y = -h;
      }
      if (o.stay) { const r = o.size / 2; o.x = clamp(o.x, r, W - r); o.y = clamp(o.y, r, H - r); }
      if (o.trailC) G.particle({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.32, size: o.size * 0.2, color: o.trailC });
      if (o.ctrl) { const r = o.size / 2; o.x = clamp(o.x, r, W - r); o.y = clamp(o.y, r, H - r); }
      if (o.gravity) land(o, py);
      const out = o.x < -o.size * 2 || o.x > W + o.size * 2 || o.y < -o.size * 2 || o.y > H + o.size * 2;
      if (out && !o.ctrl && !o.wrap) {
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

  function land(o, py) {
    const r = o.size / 2, hw = r * 0.62;
    o.onGround = false;
    for (const p of G.objs) {
      if (!p.full || !p.solid || !p.alive || p === o) continue;
      const hx = p.size / 2, hy = p.ph / 2, dx = o.x - p.x, dy = o.y - p.y;
      const ox = hw + hx - Math.abs(dx), oy = r + hy - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      const pb = py + r, pt = py - r, top = p.y - hy, bot = p.y + hy;
      const downTo = () => { o.y = top - r; o.vy = 0; o.onGround = true; o.standing = p; };
      const upTo = () => { o.y = bot + r; o.vy = 0; };
      if (ox > 3 && pb <= top + 8 && o.vy >= 0) downTo();
      else if (ox > 3 && pt >= bot - 8 && o.vy < 0) upTo();
      else if (ox < oy) { o.x += (dx >= 0 ? 1 : -1) * ox; o.vx = 0; }
      else if (dy < 0 && o.vy >= 0) downTo();
      else if (o.vy < 0) upTo();
      else { o.x += (dx >= 0 ? 1 : -1) * ox; o.vx = 0; }
    }
    if (o.vy >= 0 && !o.onGround) {
      const pb = py + r, nb = o.y + r;
      for (const p of G.objs) {
        if (!p.solid || p.full || !p.alive || p === o) continue;
        const top = p.y - p.ph / 2;
        if (pb <= top + 8 && nb >= top && Math.abs(o.x - p.x) < p.size / 2 + r * 0.45) { o.y = top - r; o.vy = 0; o.onGround = true; o.standing = p; break; }
      }
      if (!o.onGround && o.y + r >= H) { o.y = H - r; o.vy = 0; o.onGround = true; o.standing = null; }
    }
    if (!o.onGround) o.standing = null;
  }

  function controlStep(o, dt) {
    if (o.ctrl === 'platformer') {
      const k = G.keys, follow = G.mouse.active && G.mouse.down;
      let tx = ((k.right || k.d ? 1 : 0) - (k.left || k.a ? 1 : 0)) * o.speed;
      if (follow) { const dx = G.mouse.x - o.x; tx = Math.abs(dx) > 24 ? Math.sign(dx) * o.speed : 0; }
      o.vx = lerp(o.vx, tx, 1 - Math.exp(-(tx ? 14 : 10) * dt));
      const want = k.up || k.w || k.space || (follow && G.mouse.y < o.y - 60);
      o.coyote = o.onGround ? 0.1 : o.coyote - dt;
      if (want && o.coyote > 0 && !o.jumpHeld) { o.vy = -o.jumpV; o.coyote = 0; o.jumpHeld = true; o.onGround = false; o.standing = null; Sfx.play('jump'); }
      if (!want) { o.jumpHeld = false; if (o.vy < -150) o.vy *= Math.exp(-12 * dt); }
      return;
    }
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
      ctx.globalAlpha = o.alpha * (o.flash > 0 ? 0.45 + 0.55 * Math.abs(Math.sin(rt * 50)) : 1);
      if (o.L.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowHalo(ctx, o.size * 1.1, o.color, o.L.glow); ctx.restore(); }
      if (o.glowC) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowHalo(ctx, o.size * (1.3 + 0.1 * Math.sin(rt * 5)), o.glowC, 0.5); ctx.restore(); }
      if (o.flipX) ctx.scale(-1, 1);
      ctx.rotate(o.angle + (o.ctrl && o.lookName === 'ship' ? clamp(o.vx / 2000, -0.3, 0.3) : 0));
      if (o.ctrl && o.lookName === 'ship') ctx.scale(1 - Math.min(0.25, Math.abs(o.vx) / 2400), 1);
      ctx.scale(popK, popK);
      o.L.draw(ctx, o, rt);
      ctx.restore();
      if (o.maxHp > 1 && o.alpha > 0) {
        const bw = Math.max(40, o.size * 0.9), bx = o.x - bw / 2, by = o.y - o.size * 0.62 - 12, k = clamp(o.hp / o.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, bx - 2, by - 2, bw + 4, 9, 4); ctx.fill();
        ctx.fillStyle = k > 0.5 ? '#4ade80' : k > 0.25 ? '#ffd93d' : '#ff4d5e'; roundRect(ctx, bx, by, Math.max(2, bw * k), 5, 2.5); ctx.fill();
      }
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
      let txt = ''; try { txt = typeof l.text === 'function' ? l.text() : l.text; } catch (e) { txt = '?'; }
      ctx.textAlign = l.align || 'center'; ctx.font = `800 30px ${FONT}`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(txt, l.x, l.y); ctx.fillStyle = '#fff'; ctx.fillText(txt, l.x, l.y);
    }
    ctx.textAlign = 'center';
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
      ctx.textAlign = 'left'; ctx.font = `700 13px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('BEST ' + Math.max(best, G.score), 24, 76);
      if (G.showLevel) {
        const lt = 'LEVEL ' + G.level; ctx.font = `800 16px ${FONT}`;
        const lw = ctx.measureText(lt).width + 36; pill(W / 2 - lw / 2, 16, lw, 36);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe680'; ctx.fillText(lt, W / 2, 35);
      }
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
    if (G.bannerT > 0 && G.state === 'play') {
      const k = G.bannerT / G.bannerDur, a = Math.min(1, k * 3, (1 - k) * 6 + 0.2);
      ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.textAlign = 'center';
      ctx.font = `900 ${56 + (1 - k) * 10}px ${FONT}`; ctx.shadowColor = 'rgba(255,200,60,0.9)'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#fff3b0'; ctx.fillText(G.bannerText, W / 2, H * 0.3 - (1 - k) * 20); ctx.restore();
    }
    if (G.touchUI && G.state === 'play' && !G.paused) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const b of TBTN) {
        const on = G.keys[b.k];
        ctx.fillStyle = on ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `800 ${b.r * 0.7}px ${FONT}`; ctx.fillText(b.g, b.x, b.y + 2);
      }
      ctx.restore();
    }
    if (G.state === 'play' && !G.paused && G.hintT < 5 && !G.touchUI) {
      ctx.save(); ctx.globalAlpha = Math.min(0.55, (5 - G.hintT) * 0.5); ctx.textAlign = 'right'; ctx.font = `600 13px ${FONT}`; ctx.fillStyle = '#fff';
      ctx.fillText('P 일시정지  ·  M 소리 끄기', W - 18, H - 16); ctx.restore();
    }
    if (G.paused) {
      ctx.fillStyle = 'rgba(5,5,20,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `900 54px ${FONT}`; ctx.fillText('PAUSED', W / 2, H / 2 - 16);
      ctx.font = `600 18px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText('P 키나 화면을 눌러 계속', W / 2, H / 2 + 30);
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
  const kb = {}, pad = {}, touch = {}, touchPts = new Map();
  const KEYSET = ['left', 'right', 'up', 'down', 'space', 'a', 'd', 'w', 's'];
  const TBTN = [
    { k: 'left', x: 62, y: H - 88, r: 38, g: '◀' }, { k: 'right', x: 158, y: H - 88, r: 38, g: '▶' },
    { k: 'up', x: 110, y: H - 142, r: 38, g: '▲' }, { k: 'down', x: 110, y: H - 34, r: 30, g: '▼' },
    { k: 'space', x: W - 92, y: H - 84, r: 52, g: 'A' }
  ];
  let padStart = false;
  function pollPad() {
    for (const k in pad) pad[k] = false;
    const pads = global.navigator && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find(x => x && x.connected);
    if (!gp) return;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => gp.buttons[i] && gp.buttons[i].pressed;
    pad.left = ax < -0.4 || b(14); pad.right = ax > 0.4 || b(15); pad.up = ay < -0.5 || b(12); pad.down = ay > 0.5 || b(13);
    pad.space = b(0) || b(2);
    const st = b(9);
    if (st && !padStart) togglePause();
    padStart = st;
  }
  function mergeInput() {
    pollPad();
    for (const k in touch) touch[k] = false;
    for (const pt of touchPts.values()) for (const b of TBTN) if (Math.hypot(pt.x - b.x, pt.y - b.y) < b.r * 1.2) touch[b.k] = true;
    for (const k of KEYSET) {
      const v = !!(kb[k] || pad[k] || touch[k]);
      if (v && !G.keys[k] && !kb[k] && G.state === 'play' && !G.paused) fireKey(k);
      G.keys[k] = v;
    }
  }
  function togglePause() {
    if (G.state !== 'play') return;
    G.paused = !G.paused;
    if (G.paused) Sfx.setMusic(null); else Sfx.setMusic(G.musicName);
  }
  function frame(now) {
    raf = global.requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - (last || now)) / 1000); last = now; rt += real;
    if (G.slowT > 0) G.slowT -= real; else G.slow = lerp(G.slow, 1, 1 - Math.exp(-8 * real));
    const dt = real * G.slow;
    mergeInput();
    if (G.paused) { fit(); ctx.setTransform(scale, 0, 0, scale, 0, 0); draw(rt); return; }
    if (G.state === 'play' && G.hintT < 6) G.hintT += real;
    if (G.state === 'play') update(dt);
    if (G.state === 'over' || G.state === 'won') {
      G.overT += real;
      for (const o of G.objs) if (o.alive && !o.ctrl) { o.x += o.vx * dt; o.y += o.vy * dt; o.angle += o.spinV * Math.PI / 180 * dt; }
    }
    for (const o of G.objs) { if (o.pop > 0) o.pop = Math.max(0, o.pop - real * 4.5); if (o.flash > 0) o.flash -= real; }
    stepParticles(dt);
    G.shakeAmt *= Math.exp(-10 * real); G.flashA *= Math.exp(-6 * real);
    if (G.bannerT > 0) G.bannerT -= real;
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
    const fresh = !Sfx.ctx;
    Sfx.init();
    if (fresh && G.state === 'play') Sfx.setMusic(G.musicName);
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
    if (k === 'p' || k === 'escape') { if (!e.repeat) togglePause(); return; }
    if (k === 'm') { if (!e.repeat) { Sfx.init(); Sfx.toggleMute(); G.floatText(Sfx.muted ? '🔇' : '🔊', W - 60, 90, '#fff', true); } return; }
    if (G.paused) return;
    if (!kb[k] && G.state === 'play') fireKey(k);
    kb[k] = true; G.keys[k] = true;
  };
  const onKeyUp = e => { const k = keyName(e); kb[k] = false; G.keys[k] = !!(pad[k] || touch[k]); };
  const onDown = e => {
    const p = toWorld(e); G.mouse.x = p.x; G.mouse.y = p.y;
    if (e.pointerType !== 'mouse') { G.mouse.active = true; G.touchUI = true; }
    if (press()) return;
    if (G.paused) { togglePause(); return; }
    if (G.touchUI && e.pointerType !== 'mouse' && TBTN.some(b => Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.2)) { touchPts.set(e.pointerId, p); return; }
    G.mouse.down = true;
    if (G.state === 'play') fireKey('click');
  };
  const onMove = e => { const p = toWorld(e); G.mouse.x = p.x; G.mouse.y = p.y; if (touchPts.has(e.pointerId)) touchPts.set(e.pointerId, p); };
  const onUp = e => { G.mouse.down = false; touchPts.delete(e.pointerId); };
  const onVis = () => { if (document.visibilityState === 'hidden' && G.state === 'play' && !G.paused) togglePause(); };
  global.addEventListener('keydown', onKeyDown);
  global.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onDown);
  global.addEventListener('pointermove', onMove);
  global.addEventListener('pointerup', onUp);
  global.addEventListener('pointercancel', onUp);
  if (global.document) document.addEventListener('visibilitychange', onVis);
  canvas.style.touchAction = 'none';
  G.restart = restart;
  G.destroy = () => {
    global.cancelAnimationFrame(raf); Sfx.setMusic(null);
    global.removeEventListener('keydown', onKeyDown); global.removeEventListener('keyup', onKeyUp);
    global.removeEventListener('pointermove', onMove); global.removeEventListener('pointerup', onUp); global.removeEventListener('pointercancel', onUp);
    if (global.document) document.removeEventListener('visibilitychange', onVis);
  };
  reset(); G.state = 'title';
  raf = global.requestAnimationFrame(frame);
}

global.FFRuntime = { Engine, LOOKS, BACKGROUNDS, COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
