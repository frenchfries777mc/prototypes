// 결정적 월드: 시드가 같으면 어디서나 같은 지형·엄폐물이 나온다. 렌더(three.js)와 무관한 순수 로직이라 Node 에서도 돈다.
// 충돌은 물리 엔진 없이 높이 격자 + 직육면체 목록으로 직접 계산한다(봇 수십 명을 가볍게 돌리기 위해).

export const HALF_X = 180, HALF_Z = 100, GRID = 1.25, MARGIN = 40;
export const BSTEP = 0.5;
export const POINT_R = 14, FLAT_Y = 0.5, STEP_H = 0.55;
export const POINT_X = [-140, -70, 0, 70, 140];
export const POINT_Z = [8, -14, 10, -12, 6];
export const TRENCH_X = [-105, -35, 35, 105];
export const NPOINTS = 5;

export class RNG {
  constructor(seed) { this.s = (seed | 0) >>> 0 || 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// 2D 그래디언트 노이즈(퍼린). 결과는 대략 [-1, 1].
function makeNoise(seed) {
  const r = new RNG(seed);
  const p = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const g = (ix, iy, dx, dy) => { const v = G[p[p[ix & 255] + (iy & 255)] & 7]; return v[0] * dx + v[1] * dy; };
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(g(X, Y, xf, yf), g(X + 1, Y, xf - 1, yf), u), lerp(g(X, Y + 1, xf, yf - 1), g(X + 1, Y + 1, xf - 1, yf - 1), u), v) * 1.4;
  };
}

export class World {
  constructor(seed = 1, smooth = false) {
    this.seed = seed; this.smooth = smooth;
    this.noise = makeNoise(seed);
    this.detail = makeNoise(seed + 7);
    const rng = new RNG(seed * 31 + 7);
    this.craters = [];
    for (let i = 0; i < 26; i++) {
      const cx = rng.range(-165, 165), cz = rng.range(-90, 90);
      if (this.nearPoint(cx, cz, POINT_R + 6)) continue;
      this.craters.push([cx, cz, rng.range(3, 7), rng.range(0.8, 1.7)]);
    }
    this.gx0 = -(HALF_X + MARGIN);
    this.gz0 = -(HALF_Z + MARGIN);
    this.gw = Math.floor((HALF_X + MARGIN) * 2 / GRID) + 1;
    this.gh = Math.floor((HALF_Z + MARGIN) * 2 / GRID) + 1;
    if (smooth) {
      this.hmap = new Float32Array(this.gw * this.gh);
      for (let j = 0; j < this.gh; j++) for (let i = 0; i < this.gw; i++) this.hmap[j * this.gw + i] = this.rawHeight(this.gx0 + i * GRID, this.gz0 + j * GRID);
    }
    // 블록 지형: 한 칸(GRID)마다 높이를 STEP 단위로 깎아 한 덩어리로 만든다. 이웃과의 차이는 한 계단(STEP)까지만 허용해
    // 걸어서 오를 수 있게 한다(낮은 칸을 이웃보다 한 계단 아래까지만 남기고 메운다).
    this.bw = this.gw - 1; this.bh = this.gh - 1;
    const bm = this.bmap = new Float32Array(this.bw * this.bh);
    for (let j = 0; j < this.bh; j++) for (let i = 0; i < this.bw; i++) {
      bm[j * this.bw + i] = Math.round(this.rawHeight(this.gx0 + (i + 0.5) * GRID, this.gz0 + (j + 0.5) * GRID) / BSTEP) * BSTEP;
    }
    for (let pass = 0, ch = true; ch && pass < 12; pass++) {
      ch = false;
      for (let j = 0; j < this.bh; j++) for (let i = 0; i < this.bw; i++) {
        const k = j * this.bw + i;
        let m = bm[k];
        if (i > 0) m = Math.max(m, bm[k - 1] - BSTEP);
        if (i < this.bw - 1) m = Math.max(m, bm[k + 1] - BSTEP);
        if (j > 0) m = Math.max(m, bm[k - this.bw] - BSTEP);
        if (j < this.bh - 1) m = Math.max(m, bm[k + this.bw] - BSTEP);
        if (m > bm[k] + 1e-6) { bm[k] = m; ch = true; }
      }
    }
    this.boxes = [];
    this.houses = [];
    this.cells = new Map();
    this.placeProps(rng);
    this.buildCells();
  }

  // ---- 지형 ----
  trenchCenter(tx, z) {
    const zig = (Math.abs(((z / 13 + tx * 0.07) % 1 + 1) % 1 - 0.5) * 2 - 0.5) * 2.2;
    return tx + 6 * Math.sin(z * 0.04 + tx * 0.1) + zig;
  }
  roadZ(x) {
    const xs = [-190, -140, -70, 0, 70, 140, 190], zs = [8, 8, -14, 10, -12, 6, 6];
    let i = 0;
    while (i < xs.length - 2 && x >= xs[i + 1]) i++;
    const t = clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1);
    return lerp(zs[i], zs[i + 1], smooth(0, 1, t)) + Math.sin(x * 0.07) * 1.6 + Math.sin(x * 0.19) * 0.5;
  }
  roadMask(x, z) { return 1 - smooth(1.1, 2.7, Math.abs(z - this.roadZ(x))); }
  distPoint(x, z) {
    let d = 1e9;
    for (let i = 0; i < NPOINTS; i++) d = Math.min(d, Math.hypot(x - POINT_X[i], z - POINT_Z[i]));
    return d;
  }
  nearPoint(x, z, r) { return this.distPoint(x, z) < r; }

  rawHeight(x, z) {
    let h = this.noise(x * 0.011, z * 0.011) * 4.5 + this.noise(x * 0.027 + 11, z * 0.027) * 1.4 + this.detail(x * 0.09, z * 0.09) * 0.45;
    const dp = this.distPoint(x, z);
    h = lerp(h, FLAT_Y, 1 - smooth(POINT_R - 3, POINT_R + 9, dp));
    // 참호(거점 근처에서는 얕아진다)
    const fade = smooth(POINT_R + 4, POINT_R + 14, dp);
    for (const tx of TRENCH_X) {
      const d = Math.abs(x - this.trenchCenter(tx, z));
      if (d < 4) h -= 1.75 * (1 - smooth(1.3, 3.4, d)) * fade;
    }
    for (const c of this.craters) {
      const d = Math.hypot(x - c[0], z - c[1]);
      if (d < c[2]) { const t = 1 - d / c[2]; h -= c[3] * t * t * (3 - 2 * t); }
    }
    return h;
  }
  heightAt(x, z) {
    if (this.smooth) {
      const fx = (x - this.gx0) / GRID, fz = (z - this.gz0) / GRID;
      const i = clamp(Math.floor(fx), 0, this.gw - 2), j = clamp(Math.floor(fz), 0, this.gh - 2);
      const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1), W = this.gw, m = this.hmap;
      return lerp(lerp(m[j * W + i], m[j * W + i + 1], tx), lerp(m[(j + 1) * W + i], m[(j + 1) * W + i + 1], tx), tz);
    }
    const i = clamp(Math.floor((x - this.gx0) / GRID), 0, this.bw - 1), j = clamp(Math.floor((z - this.gz0) / GRID), 0, this.bh - 1);
    return this.bmap[j * this.bw + i];
  }
  pointPos(i) { return { x: POINT_X[i], y: this.heightAt(POINT_X[i], POINT_Z[i]), z: POINT_Z[i] }; }

  // ---- 엄폐물 ----
  // kind: 0 석조벽 1 모래주머니 2 상자 3 목재 5 통 6 천막 7 야포 8 회반죽(집) 10 마차
  addBox(cx, cz, sx, sz, h, kind, yaw = 0) {
    const y0 = Math.min(this.heightAt(cx - sx / 2, cz - sz / 2), this.heightAt(cx + sx / 2, cz + sz / 2), this.heightAt(cx, cz)) - 0.25;
    const b = { mn: [cx - sx / 2, y0, cz - sz / 2], mx: [cx + sx / 2, y0 + h + 0.25, cz + sz / 2], kind, yaw };
    this.boxes.push(b);
    return b;
  }
  insideBox(x, y, z) {
    for (const bi of this.near(x, z)) {
      const b = this.boxes[bi];
      if (x > b.mn[0] && x < b.mx[0] && z > b.mn[2] && z < b.mx[2] && y > b.mn[1] && y < b.mx[1]) return true;
    }
    return false;
  }
  placeProps(rng) {
    // 1) 거점마다 엄폐물 고리, 집·천막·야포
    for (let i = 0; i < NPOINTS; i++) {
      const px = POINT_X[i], pz = POINT_Z[i];
      const sgn = pz > 0 ? -1 : 1;
      for (let k = 0; k < 7; k++) {
        const a = rng.next() * Math.PI * 2, r = rng.range(10.5, 20);
        const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
        const roll = rng.next();
        if (roll < 0.4) {
          this.addBox(x, z, 3.6, 0.9, 0.95, 1);
          this.addBox(x + 3, z + (rng.next() < 0.5 ? 1.6 : -1.6), 0.9, 3.6, 0.95, 1);
        } else if (roll < 0.75) {
          const s = rng.range(1.1, 1.6);
          this.addBox(x, z, s, s, s, 2);
        } else {
          const horiz = rng.next() < 0.5;
          this.addBox(x, z, horiz ? 3.2 : 0.7, horiz ? 0.7 : 3.2, rng.range(1.5, 2.3), 0);
        }
      }
      if (i >= 1 && i <= 3) {
        this.addHouse(px - 3, pz + sgn * 22, rng);
        for (let q = 0; q < 2; q++) this.addBox(px - 3 + rng.range(-6, 6), pz + sgn * (22 - 6.4 - rng.next() * 1.5), 0.9, 0.9, 1.05, 5);
      }
      if (i === 1 || i === 3) this.addBox(px + 4, pz - (pz > 0 ? -1 : 1) * 17, 3.8, 2.4, 1.5, 7);
      if (i === 0 || i === 4 || i === 2) {
        const nt = i !== 2 ? 3 : 1;
        for (let t = 0; t < nt; t++) {
          const ta = rng.next() * Math.PI * 2, tr = rng.range(16, 20);
          this.addBox(px + Math.cos(ta) * tr, pz + Math.sin(ta) * tr, 3.4, 2.7, 1.9, 6);
        }
      }
    }
    for (const wx of [-120, 120]) this.addBox(wx, this.roadZ(wx) + 4.2, 4.2, 1.9, 1.5, 10);
    // 2) 참호 가장자리 모래주머니
    for (const tx of TRENCH_X) {
      let z = -86;
      while (z < 86) {
        const cx = this.trenchCenter(tx, z);
        if (!this.nearPoint(cx, z, POINT_R + 14)) {
          const side = rng.next() < 0.5 ? 1 : -1;
          this.addBox(cx + side * 4.6, z, 1.0, 5.0, 0.95, 1);
        }
        z += 11 + rng.next() * 6;
      }
    }
    // 3) 무인지대 잡동사니
    let placed = 0, tries = 0;
    while (placed < 38 && tries < 400) {
      tries++;
      const x = rng.range(-170, 170), z = rng.range(-92, 92);
      if (this.nearPoint(x, z, POINT_R + 8)) continue;
      if (TRENCH_X.some((tx) => Math.abs(x - this.trenchCenter(tx, z)) < 5.5)) continue;
      const roll = rng.next();
      if (roll < 0.45) { const horiz = rng.next() < 0.5; this.addBox(x, z, horiz ? 4.4 : 0.7, horiz ? 0.7 : 4.4, rng.range(1.6, 2.6), 0); }
      else if (roll < 0.75) { const s = rng.range(1, 1.7); this.addBox(x, z, s, s, s, 2); }
      else this.addBox(x, z, 0.9, 4, 1, 1);
      placed++;
    }
  }
  // 창문과 문이 뚫린 벽체. 창으로는 총알이 지나가고, 한 면은 무너져 낮다.
  addHouse(cx, cz, rng) {
    const hw = 4.8, hd = 3.7, t = 0.5, h = rng.range(3, 3.5);
    const gy = this.heightAt(cx, cz);
    const wrecked = rng.int(0, 3);
    const run = (u0, u1, fixed, alongX, openings, low) => {
      // openings: [중심 u, 아래 y, 폭, 위 y]
      const ops = openings.slice().sort((a, b) => a[0] - b[0]);
      let u = u0;
      const seg = (a, b, y0, y1) => {
        if (b - a < 0.05 || y1 - y0 < 0.05) return;
        const mn = alongX ? [a, gy + y0, fixed - t / 2] : [fixed - t / 2, gy + y0, a];
        const mx = alongX ? [b, gy + y1, fixed + t / 2] : [fixed + t / 2, gy + y1, b];
        this.boxes.push({ mn, mx, kind: 8, yaw: 0, house: true });
      };
      const top = low ? h * 0.45 : h;
      for (const o of ops) {
        const a = o[0] - o[2] / 2, b = o[0] + o[2] / 2;
        seg(u, a, 0, top);
        seg(a, b, 0, o[1]);
        seg(a, b, o[3], top);
        u = b;
      }
      seg(u, u1, 0, top);
    };
    const win = (c) => [c, 1.1, 0.95, 2.15];
    const door = [cx, 0, 1.4, 2.25];
    run(cx - hw, cx + hw, cz - hd, true, [win(cx - 3), win(cx + 3)], wrecked === 0);
    run(cx - hw, cx + hw, cz + hd, true, [door, win(cx - 2.8), win(cx + 2.8)].map((o, i) => (i === 0 ? [cx, 0, 1.4, 2.25] : o)), wrecked === 1);
    run(cz - hd, cz + hd, cx - hw, false, [win(cz)], wrecked === 2);
    run(cz - hd, cz + hd, cx + hw, false, [win(cz - 1.6), win(cz + 1.6)], wrecked === 3);
    this.houses.push({ cx, cz, hw, hd, h, gy, wrecked });
  }

  // ---- 공간 해시 ----
  buildCells() {
    this.cells.clear();
    this.boxes.forEach((b, i) => {
      for (let x = Math.floor(b.mn[0] / 8); x <= Math.floor(b.mx[0] / 8); x++) for (let z = Math.floor(b.mn[2] / 8); z <= Math.floor(b.mx[2] / 8); z++) {
        const k = x * 4096 + z;
        let a = this.cells.get(k);
        if (!a) this.cells.set(k, (a = []));
        a.push(i);
      }
    });
  }
  near(x, z, r = 0.5) {
    const out = new Set();
    for (let cx = Math.floor((x - r) / 8); cx <= Math.floor((x + r) / 8); cx++) for (let cz = Math.floor((z - r) / 8); cz <= Math.floor((z + r) / 8); cz++) {
      const a = this.cells.get(cx * 4096 + cz);
      if (a) for (const i of a) out.add(i);
    }
    return out;
  }

  // ---- 이동 충돌 ----
  // u: {x,y,z}. 높은 상자는 밀어내고, 낮은 상자(STEP_H 이하)는 올라설 수 있는 바닥으로 본다. 반환: 서 있는 바닥 높이.
  resolve(u, radius) {
    let ground = this.heightAt(u.x, u.z);
    for (const bi of this.near(u.x, u.z, radius + 1)) {
      const b = this.boxes[bi];
      if (u.y + 1.8 < b.mn[1]) continue;
      if (b.mx[1] <= u.y + STEP_H + 0.02) {
        // 올라설 수 있다: 발이 상자 위에 겹치면 바닥으로
        if (u.x > b.mn[0] - 0.05 && u.x < b.mx[0] + 0.05 && u.z > b.mn[2] - 0.05 && u.z < b.mx[2] + 0.05) ground = Math.max(ground, b.mx[1]);
        continue;
      }
      const cx = clamp(u.x, b.mn[0], b.mx[0]), cz = clamp(u.z, b.mn[2], b.mx[2]);
      let dx = u.x - cx, dz = u.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (radius - d) / d; u.x += dx * k; u.z += dz * k; }
        else {
          // 중심이 상자 안: 가장 가까운 면으로 밀어낸다
          const l = u.x - b.mn[0], r = b.mx[0] - u.x, f = u.z - b.mn[2], bk = b.mx[2] - u.z;
          const m = Math.min(l, r, f, bk);
          if (m === l) u.x = b.mn[0] - radius; else if (m === r) u.x = b.mx[0] + radius; else if (m === f) u.z = b.mn[2] - radius; else u.z = b.mx[2] + radius;
        }
      }
    }
    u.x = clamp(u.x, -HALF_X - 6, HALF_X + 6);
    u.z = clamp(u.z, -HALF_Z - 6, HALF_Z + 6);
    return ground;
  }
  // 이 점이 높은 상자에 막히는가(봇 길찾기용)
  blocked(x, z, radius, feetY) {
    for (const bi of this.near(x, z, radius + 1)) {
      const b = this.boxes[bi];
      if (b.mx[1] <= feetY + STEP_H) continue;
      const cx = clamp(x, b.mn[0], b.mx[0]), cz = clamp(z, b.mn[2], b.mx[2]);
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return b.mx[1];
    }
    return -1e9;
  }

  // ---- 시선·탄도 ----
  // 선분 a→b 위에서 처음 막히는 거리(0..1 비율)를 돌려준다. 막히지 않으면 1.
  rayBlock(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    let best = 1;
    // 지형: 2m 간격으로 표본
    const n = Math.max(2, Math.ceil(len / 2));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      if (this.heightAt(ax + dx * t, az + dz * t) > ay + dy * t) { best = Math.min(best, (s - 1) / n + 1e-4); break; }
    }
    // 상자: 슬랩 교차
    const mnx = Math.min(ax, bx) - 1, mxx = Math.max(ax, bx) + 1, mnz = Math.min(az, bz) - 1, mxz = Math.max(az, bz) + 1;
    const seen = new Set();
    for (let cx = Math.floor(mnx / 8); cx <= Math.floor(mxx / 8); cx++) for (let cz = Math.floor(mnz / 8); cz <= Math.floor(mxz / 8); cz++) {
      const a = this.cells.get(cx * 4096 + cz);
      if (!a) continue;
      for (const bi of a) {
        if (seen.has(bi)) continue;
        seen.add(bi);
        const b = this.boxes[bi];
        let t0 = 0, t1 = best;
        const o = [ax, ay, az], d = [dx, dy, dz];
        let ok = true;
        for (let k = 0; k < 3; k++) {
          if (Math.abs(d[k]) < 1e-9) { if (o[k] < b.mn[k] || o[k] > b.mx[k]) { ok = false; break; } }
          else {
            let ta = (b.mn[k] - o[k]) / d[k], tb = (b.mx[k] - o[k]) / d[k];
            if (ta > tb) [ta, tb] = [tb, ta];
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { ok = false; break; }
          }
        }
        if (ok && t0 < best) best = t0;
      }
    }
    return best;
  }
  los(ax, ay, az, bx, by, bz) { return this.rayBlock(ax, ay, az, bx, by, bz) >= 0.999; }
}
