// 공용 수학·난수·노이즈·메시 도우미.
const B = window.BABYLON;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// 프레임 속도와 무관한 지수 감쇠 보간. rate가 클수록 빨리 따라간다.
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export const angDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// 씨앗 고정 난수. 같은 씨앗이면 항상 같은 맵이 나온다.
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

// 2D 값 노이즈와 fbm. 반환 범위는 0..1.
export function makeNoise(seed) {
  const r = rng(seed);
  const perm = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) perm[i] = r();
  const hash = (x, y) => perm[((x * 73856093) ^ (y * 19349663)) & 1023];
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  const fbm = (x, y, oct = 4) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * n2(x * f + i * 17.3, y * f - i * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  };
  return { n2, fbm };
}

// 모서리가 둥근 상자. 네모 캐릭터의 모든 부품이 이걸로 만들어진다.
export function roundedBox(name, w, h, d, r, scene, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const half = [w / 2, h / 2, d / 2];
  const axisCoords = (a) => {
    const out = [];
    for (let i = 0; i <= seg; i++) out.push(-a + (r * i) / seg);
    for (let i = seg; i >= 0; i--) out.push(a - (r * i) / seg);
    return out;
  };
  const pos = [], nor = [], idx = [];
  // 각 면: 법선 축 n, 평면 축 u, v
  const faces = [
    [0, 1, 2, 1], [0, 2, 1, -1], [1, 2, 0, 1], [1, 0, 2, -1], [2, 0, 1, 1], [2, 1, 0, -1],
  ];
  for (const [n, u, v, sign] of faces) {
    const cu = axisCoords(half[u]), cv = axisCoords(half[v]);
    const base = pos.length / 3;
    for (let j = 0; j < cv.length; j++) {
      for (let i = 0; i < cu.length; i++) {
        const p = [0, 0, 0];
        p[n] = sign * half[n];
        p[u] = cu[i];
        p[v] = cv[j];
        const inner = [0, 1, 2].map((k) => clamp(p[k], -half[k] + r, half[k] - r));
        let dx = p[0] - inner[0], dy = p[1] - inner[1], dz = p[2] - inner[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        pos.push(inner[0] + dx * r, inner[1] + dy * r, inner[2] + dz * r);
        nor.push(dx, dy, dz);
      }
    }
    const W = cu.length;
    for (let j = 0; j < cv.length - 1; j++) {
      for (let i = 0; i < W - 1; i++) {
        const a = base + j * W + i, b = a + 1, c = a + W, e = c + 1;
        if (sign > 0) idx.push(a, b, e, a, e, c);
        else idx.push(a, e, b, a, c, e);
      }
    }
  }
  const mesh = new B.Mesh(name, scene);
  const vd = new B.VertexData();
  vd.positions = pos;
  vd.normals = nor;
  vd.indices = idx;
  vd.applyToMesh(mesh);
  return mesh;
}

export function flatMat(name, hex, scene, opts = {}) {
  const m = new B.StandardMaterial(name, scene);
  m.diffuseColor = B.Color3.FromHexString(hex);
  m.specularColor = new B.Color3(0.04, 0.04, 0.04);
  if (opts.emissive) m.emissiveColor = B.Color3.FromHexString(opts.emissive);
  if (opts.alpha !== undefined) m.alpha = opts.alpha;
  return m;
}
