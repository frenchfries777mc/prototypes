// 지도: 지형 높이 격자에서 한 번 그려 둔 그림 위에, 미니맵(오른쪽 위)과 전체 지도(M)를 그린다.
import { WORLD, height, coast, groundColor, SEA } from './terrain.js';
import { paths } from './roads.js';
import { PLACES } from './world.js';
import { GRID, CELL } from './mapdata.js';
import { clamp } from './util.js';

const PX = 1 / WORLD.cell; // 격자 한 칸 = 1픽셀
const W = Math.round((WORLD.x1 - WORLD.x0) * PX), H = Math.round((WORLD.z1 - WORLD.z0) * PX);
const mx = (x) => (x - WORLD.x0) * PX, mz = (z) => H - (z - WORLD.z0) * PX; // 북쪽이 위

function render() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = WORLD.x0 + (i + 0.5) * WORLD.cell, z = WORLD.z1 - (j + 0.5) * WORLD.cell;
      const h = height(x, z);
      let c;
      if (h < SEA) { const t = clamp((SEA - h) / 7, 0, 1); c = [0.42 - t * 0.26, 0.82 - t * 0.34, 0.86 - t * 0.14]; }
      else {
        const sl = Math.hypot(height(x + 4, z) - height(x - 4, z), height(x, z + 4) - height(x, z - 4)) / 8;
        c = groundColor(x, z, h, sl, coast(x, z));
        const shade = 1 + clamp((height(x - 4, z + 4) - height(x + 4, z - 4)) * 0.035, -0.22, 0.22); // 북서쪽에서 비추는 음영
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
      }
      const o = (j * W + i) * 4;
      d[o] = clamp(c[0], 0, 1) * 255; d[o + 1] = clamp(c[1], 0, 1) * 255; d[o + 2] = clamp(c[2], 0, 1) * 255; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const pass of [0, 1]) for (const p of paths) {
    if (p.type === 'rail') { // 철도는 검은 줄에 흰 토막
      ctx.strokeStyle = pass ? '#f4f1ea' : '#22202b'; ctx.lineWidth = pass ? 1 : 3; ctx.setLineDash(pass ? [3, 3] : []);
      ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(mx(q.x), mz(q.z)) : ctx.moveTo(mx(q.x), mz(q.z)))); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    const road = p.type === 'road';
    ctx.strokeStyle = pass ? (road ? '#f4f1ea' : '#e9cf9a') : 'rgba(40,44,60,0.75)';
    ctx.lineWidth = (road ? 2.2 : 1.3) + (pass ? 0 : 1.2);
    ctx.beginPath();
    p.pts.forEach((q, i) => (i ? ctx.lineTo(mx(q.x), mz(q.z)) : ctx.moveTo(mx(q.x), mz(q.z))));
    ctx.stroke();
  }
  for (let cz = 0; cz < GRID.length; cz++) for (let cx = 0; cx < GRID[cz].length; cx++) {
    const c = GRID[cz][cx];
    if (c === '.') continue;
    ctx.fillStyle = c === '#' || c === 'x' ? '#f4f1ea' : c === 'g' ? '#6cc35a' : '#aeb3c6';
    ctx.fillRect(mx(cx * CELL - 6), mz(cz * CELL + 6), CELL * PX + 0.5, CELL * PX + 0.5);
  }
  return cv;
}

export class MapView {
  // info(): { x, z, yaw, target: {x,z}|null, pads: [{x,z,color}] }
  constructor(info) {
    this.info = info;
    this.img = render();
    this.mini = document.getElementById('minimap');
    this.full = document.getElementById('fullmap');
    this.wrap = document.getElementById('mapWrap');
    this.open = false;
    this.t = 0;
    const toggle = () => this.toggle();
    addEventListener('keydown', (e) => { if (e.code === 'KeyM') toggle(); if (e.code === 'Escape' && this.open) toggle(); });
    this.mini.addEventListener('click', toggle);
    this.wrap.addEventListener('click', toggle);
  }
  toggle() {
    this.open = !this.open;
    this.wrap.hidden = !this.open;
    if (this.open) { if (document.pointerLockElement) document.exitPointerLock(); this.drawFull(); }
  }
  arrow(ctx, x, y, yaw, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(yaw);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.72, s * 0.8); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.72, s * 0.8); ctx.closePath();
    ctx.fillStyle = '#f2644b'; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * 0.22); ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }
  diamond(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color; ctx.fillRect(-s, -s, s * 2, s * 2); ctx.lineWidth = Math.max(1.5, s * 0.35); ctx.strokeStyle = '#fff'; ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();
  }
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    const cv = this.mini, ctx = cv.getContext('2d'), S = cv.width, I = this.info();
    const span = 460, k = S / span; // 화면에 담는 폭(m)
    ctx.fillStyle = '#2a6aa8'; ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, mx(I.x) - (span / 2) * PX, mz(I.z) - (span / 2) * PX, span * PX, span * PX, 0, 0, S, S);
    const P = (x, z) => [S / 2 + (x - I.x) * k, S / 2 - (z - I.z) * k];
    for (const p of I.pads) { const [x, y] = P(p.x, p.z); if (x > 4 && x < S - 4 && y > 4 && y < S - 4) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, S * 0.028, 0, 7); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); } }
    if (I.target) {
      let [x, y] = P(I.target.x, I.target.z);
      const dx = x - S / 2, dy = y - S / 2, r = Math.hypot(dx, dy), lim = S / 2 - S * 0.09;
      if (r > lim) { x = S / 2 + (dx / r) * lim; y = S / 2 + (dy / r) * lim; }
      this.diamond(ctx, x, y, S * 0.04, '#ffd84a');
    }
    this.arrow(ctx, S / 2, S / 2, I.yaw, S * 0.065);
    if (this.open) this.drawFull();
  }
  drawFull() {
    const cv = this.full, I = this.info();
    const size = Math.floor(Math.min(innerWidth, innerHeight) * 0.9), dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== size * dpr) { cv.width = cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px'; }
    const ctx = cv.getContext('2d'), k = cv.width / W;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, 0, 0, cv.width, cv.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const p of PLACES) {
      ctx.font = `${p.big ? 900 : 700} ${(p.big ? 15 : 11.5) * dpr}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
      ctx.lineWidth = 3.5 * dpr; ctx.strokeStyle = 'rgba(22,34,58,0.85)'; ctx.fillStyle = p.big ? '#ffe98a' : '#fff';
      ctx.strokeText(p.name, mx(p.x) * k, mz(p.z) * k); ctx.fillText(p.name, mx(p.x) * k, mz(p.z) * k);
    }
    for (const p of I.pads) {
      const x = mx(p.x) * k, y = mz(p.z) * k;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 4 * dpr, 0, 7); ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
      // 마을 밖 직업은 이름도 적는다(마을 안은 다섯 곳이 붙어 있어 겹친다).
      if (p.name && Math.hypot(p.x - 66, p.z - 48) > 150) {
        ctx.font = `800 ${10.5 * dpr}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(22,34,58,0.9)'; ctx.fillStyle = p.color;
        ctx.textAlign = 'left';
        ctx.strokeText(p.name, x + 6 * dpr, y - 13 * dpr); ctx.fillText(p.name, x + 6 * dpr, y - 13 * dpr);
        ctx.textAlign = 'center';
      }
    }
    if (I.target) this.diamond(ctx, mx(I.target.x) * k, mz(I.target.z) * k, 6 * dpr, '#ffd84a');
    this.arrow(ctx, mx(I.x) * k, mz(I.z) * k, I.yaw, 9 * dpr);
  }
}
