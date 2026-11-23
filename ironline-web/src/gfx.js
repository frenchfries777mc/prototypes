// 장면: 렌더러·하늘·조명·지형·엄폐물. 월드(world.js)의 데이터를 three.js 메시로 바꾼다.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';
import { POINT_R, NPOINTS, HALF_X, HALF_Z, GRID } from './world.js';

const SUN_DIR = new THREE.Vector3(-0.62, 0.34, -0.7).normalize();   // 해가 낮게 걸린 늦은 오후
export const HAZE = new THREE.Color(0.86, 0.68, 0.5);

export function textureLoader() {
  const loader = new THREE.TextureLoader();
  return (url, { repeat = true, srgb = true } = {}) => new Promise((res, rej) => loader.load(url, (t) => {
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    res(t);
  }, undefined, rej));
}

// 하늘: 지평선 주황 → 위쪽 파랑, 해와 구름. 안개의 영향을 받지 않는다.
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR.clone() }, time: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vD; uniform vec3 sun; uniform float time;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+7.1; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vD);
        float y = d.y;
        vec3 top = vec3(0.10,0.22,0.50), mid = vec3(0.42,0.54,0.72), hor = vec3(0.95,0.76,0.56), gnd = vec3(0.30,0.26,0.22);
        vec3 c = y > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.18, 0.75, y)), smoothstep(0.0, 0.28, y)) : mix(hor, gnd, smoothstep(0.0, 0.25, -y));
        float sd = max(dot(d, normalize(sun)), 0.0);
        c += vec3(1.0,0.72,0.42) * (pow(sd, 6.0) * 0.28 + pow(sd, 90.0) * 0.9 + pow(sd, 1400.0) * 6.0);
        if (y > 0.01) {
          vec2 p = d.xz / (y + 0.22) * 1.6 + vec2(time * 0.006, 0.0);
          float cl = smoothstep(0.50, 0.85, fbm(p));
          vec3 cc = mix(vec3(0.92,0.80,0.70), vec3(1.0,0.9,0.78), smoothstep(0.0, 0.5, y));
          cc *= 0.78 + 0.35 * pow(sd, 3.0);
          c = mix(c, cc, cl * 0.75 * smoothstep(0.0, 0.2, y));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// 지형: 블록 기둥. 칸마다 윗면 한 장과, 이웃보다 높은 쪽으로 옆면을 세운다. 색은 칸마다 정해 평평하게 칠한다.
const TOP = { grass: [0.27, 0.44, 0.15], dirt: [0.46, 0.33, 0.2], mud: [0.28, 0.2, 0.13], rock: [0.4, 0.4, 0.38] };
export function pixelTexture(n = 8, base = 0.86, amp = 0.14) {
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { const v = Math.round(255 * (base + (Math.random() - 0.5) * 2 * amp)); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
export function makeBlockTerrain(world) {
  const { bw, bh, gx0, gz0, bmap } = world, GR = GRID;
  const H = (i, j) => (i < 0 || j < 0 || i >= bw || j >= bh) ? -99 : bmap[j * bw + i];
  const pos = [], nrm = [], col = [], uv = [], idx = [];
  let vc = 0;
  const quad = (p0, p1, p2, p3, n, c) => {
    for (const p of [p0, p1, p2, p3]) { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]); }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    const dot = (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2];
    if (dot >= 0) idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3); else idx.push(vc, vc + 2, vc + 1, vc, vc + 3, vc + 2);
    vc += 4;
  };
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const h = H(i, j), x0 = gx0 + i * GR, z0 = gz0 + j * GR, x1 = x0 + GR, z1 = z0 + GR, cx = x0 + GR / 2, cz = z0 + GR / 2;
    const near = (H(i - 1, j) + H(i + 1, j) + H(i, j - 1) + H(i, j + 1)) / 4;
    const road = world.roadMask(cx, cz), patch = world.detail(cx * 0.05, cz * 0.05) * 0.5 + 0.5;
    let kind = 'grass';
    if (near - h > 0.2) kind = 'mud';
    else if (road > 0.45) kind = 'dirt';
    else if (patch > 0.68) kind = 'dirt';
    else if (patch < 0.12 && h > 2) kind = 'rock';
    const t = TOP[kind], j2 = 0.9 + rnd() * 0.2;
    quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], [0, 1, 0], [t[0] * j2, t[1] * j2, t[2] * j2]);
    const side = (nh, p0, p1, p2, p3, n) => {
      if (nh >= h - 1e-4) return;
      const lo = Math.max(nh, -3);
      const sh = 0.78 + rnd() * 0.08;
      const c = kind === 'grass' ? [0.45 * sh, 0.34 * sh, 0.22 * sh] : [t[0] * 0.7 * sh, t[1] * 0.7 * sh, t[2] * 0.7 * sh];
      quad(p0(lo), p1(lo), p2, p3, n, c);
    };
    side(H(i - 1, j), (lo) => [x0, lo, z1], (lo) => [x0, lo, z0], [x0, h, z0], [x0, h, z1], [-1, 0, 0]);
    side(H(i + 1, j), (lo) => [x1, lo, z0], (lo) => [x1, lo, z1], [x1, h, z1], [x1, h, z0], [1, 0, 0]);
    side(H(i, j - 1), (lo) => [x0, lo, z0], (lo) => [x1, lo, z0], [x1, h, z0], [x0, h, z0], [0, 0, -1]);
    side(H(i, j + 1), (lo) => [x1, lo, z1], (lo) => [x0, lo, z1], [x0, h, z1], [x1, h, z1], [0, 0, 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: pixelTexture(8), roughness: 1, metalness: 0, flatShading: false }));
  mesh.receiveShadow = true; mesh.name = 'terrain';
  return mesh;
}

// 지형: 높이 격자 → 메시. 꼭짓점마다 풀·흙·진흙·바위 가중치(wts)를 싣고, 셰이더에서 네 텍스처를 섞는다.
export function makeRealTerrain(world, tex) {
  const { gw, gh, gx0, gz0, hmap } = world;
  const GR = GRID;
  const pos = new Float32Array(gw * gh * 3), nrm = new Float32Array(gw * gh * 3), wts = new Float32Array(gw * gh * 4);
  const H = (i, j) => hmap[Math.min(gh - 1, Math.max(0, j)) * gw + Math.min(gw - 1, Math.max(0, i))];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i, x = gx0 + i * GR, z = gz0 + j * GR, h = H(i, j);
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2 * GR;
    const nl = Math.hypot(nx, ny, nz);
    nrm[k * 3] = nx / nl; nrm[k * 3 + 1] = ny / nl; nrm[k * 3 + 2] = nz / nl;
    const cav = Math.min(1, Math.max(0, ((H(i - 1, j) + H(i + 1, j) + H(i, j - 1) + H(i, j + 1)) * 0.25 - h) * 0.9));
    const slope = 1 - ny / nl;
    const patch = world.detail(x * 0.04, z * 0.04) * 0.5 + 0.5;
    const road = world.roadMask(x, z) * (cav > 0.25 ? 0.3 : 1);
    let g = 1.0 - road * 0.95 - Math.max(0, patch - 0.62) * 1.4;
    let d = road * 0.9 + Math.max(0, patch - 0.58) * 1.1;
    let m = cav * 1.6;
    let r = Math.max(0, (slope - 0.16) * 5.0);
    g = Math.max(0, g - m * 0.6 - r * 0.5);
    const s = g + d + m + r + 1e-6;
    wts[k * 4] = g / s; wts[k * 4 + 1] = d / s; wts[k * 4 + 2] = m / s; wts[k * 4 + 3] = r / s;
  }
  const idx = new Uint32Array((gw - 1) * (gh - 1) * 6);
  let q = 0;
  for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
    const a = j * gw + i, b = a + 1, c = a + gw, d2 = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('wts', new THREE.BufferAttribute(wts, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tG = { value: tex.grass }; sh.uniforms.tD = { value: tex.dirt }; sh.uniforms.tM = { value: tex.mud }; sh.uniforms.tR = { value: tex.rock };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 wts; varying vec4 vW; varying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = wts; vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vW; varying vec3 vWp; uniform sampler2D tG; uniform sampler2D tD; uniform sampler2D tM; uniform sampler2D tR;')
      .replace('#include <map_fragment>', `
        vec2 uv = vWp.xz;
        vec3 cg = mix(texture2D(tG, uv * 0.20).rgb, texture2D(tG, uv * 0.037 + 0.3).rgb, 0.4) * vec3(0.78, 0.76, 0.55);
        vec3 cd = mix(texture2D(tD, uv * 0.22).rgb, texture2D(tD, uv * 0.041).rgb, 0.4) * vec3(0.95, 0.86, 0.72);
        vec3 cm = mix(texture2D(tM, uv * 0.24).rgb, texture2D(tM, uv * 0.045).rgb, 0.4) * vec3(0.78, 0.7, 0.62);
        vec3 cr = mix(texture2D(tR, uv * 0.18).rgb, texture2D(tR, uv * 0.034).rgb, 0.4) * vec3(0.9, 0.88, 0.84);
        diffuseColor.rgb *= cg * vW.x + cd * vW.y + cm * vW.z + cr * vW.w;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.name = 'terrain';
  return mesh;
}


// ---- 부드러운 지형 시안들: 로우폴리 / 카툰 / 수채화 / PS1 ----
const PAL = {
  lowpoly: { g: [0.34, 0.52, 0.2], d: [0.68, 0.54, 0.34], m: [0.4, 0.3, 0.22], r: [0.54, 0.52, 0.5] },
  toon: { g: [0.32, 0.7, 0.22], d: [0.88, 0.66, 0.38], m: [0.52, 0.36, 0.24], r: [0.66, 0.64, 0.72] },
  paint: { g: [0.46, 0.62, 0.24], d: [0.84, 0.64, 0.38], m: [0.5, 0.36, 0.28], r: [0.66, 0.6, 0.56] },
  ps1: { g: [0.3, 0.5, 0.18], d: [0.56, 0.43, 0.29], m: [0.32, 0.24, 0.18], r: [0.46, 0.46, 0.44] },
};
export function makeSmoothTerrain(world, style) {
  const { gw, gh, gx0, gz0, hmap } = world, GR = GRID, pal = PAL[style];
  const st = style === 'lowpoly' || style === 'ps1' ? 2 : 1, flat = style === 'lowpoly';
  const nx = Math.floor((gw - 1) / st) + 1, nz = Math.floor((gh - 1) / st) + 1;
  const H = (i, j) => hmap[Math.min(gh - 1, Math.max(0, j)) * gw + Math.min(gw - 1, Math.max(0, i))];
  const P = new Float32Array(nx * nz * 3), N = new Float32Array(nx * nz * 3), C = new Float32Array(nx * nz * 3), UV = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const gi = i * st, gj = j * st, k = j * nx + i, x = gx0 + gi * GR, z = gz0 + gj * GR, h = H(gi, gj);
    P[k * 3] = x; P[k * 3 + 1] = h; P[k * 3 + 2] = z;
    const dx = H(gi - st, gj) - H(gi + st, gj), dz = H(gi, gj - st) - H(gi, gj + st), dy = 2 * GR * st, nl = Math.hypot(dx, dy, dz);
    N[k * 3] = dx / nl; N[k * 3 + 1] = dy / nl; N[k * 3 + 2] = dz / nl;
    const cav = Math.min(1, Math.max(0, ((H(gi - st, gj) + H(gi + st, gj) + H(gi, gj - st) + H(gi, gj + st)) * 0.25 - h) * 0.9));
    const slope = 1 - dy / nl, patch = world.detail(x * 0.04, z * 0.04) * 0.5 + 0.5;
    const road = world.roadMask(x, z) * (cav > 0.25 ? 0.3 : 1);
    let g = 1.0 - road * 0.95 - Math.max(0, patch - 0.62) * 1.4, d = road * 0.9 + Math.max(0, patch - 0.58) * 1.1, m = cav * 1.6, r = Math.max(0, (slope - 0.14) * 5.0);
    g = Math.max(0, g - m * 0.6 - r * 0.5);
    const sum = g + d + m + r + 1e-6, hl = 0.85 + Math.min(0.3, Math.max(-0.1, h * 0.05));
    for (let c = 0; c < 3; c++) C[k * 3 + c] = (pal.g[c] * g + pal.d[c] * d + pal.m[c] * m + pal.r[c] * r) / sum * hl;
    UV[k * 2] = x * 0.3; UV[k * 2 + 1] = z * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  if (flat) {
    // 삼각형마다 따로 칠하는 로우폴리: 정점을 풀어 면마다 평균색 + 약간의 변주
    const pos = [];
    let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const colF = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1, flip = (i + j) & 1;
      const t = flip ? [[a, c, d], [a, d, b]] : [[a, c, b], [b, c, d]];
      for (const [u, v, w] of t) {
        const jj = 0.93 + rnd() * 0.14;
        for (const q of [u, v, w]) { pos.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]); }
        for (let q = 0; q < 3; q++) { const r0 = (C[u * 3] + C[v * 3] + C[w * 3]) / 3 * jj, r1 = (C[u * 3 + 1] + C[v * 3 + 1] + C[w * 3 + 1]) / 3 * jj, r2 = (C[u * 3 + 2] + C[v * 3 + 2] + C[w * 3 + 2]) / 3 * jj; colF.push(r0, r1, r2); }
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colF, 3));
    geo.computeVertexNormals();
  } else {
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.computeBoundingSphere();
  let mat;
  if (style === 'lowpoly') mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  else if (style === 'toon') {
    const gm = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
    gm.magFilter = gm.minFilter = THREE.NearestFilter; gm.needsUpdate = true;
    mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gm });
  } else if (style === 'ps1') mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: pixelTexture(16, 0.8, 0.2), roughness: 1 });
  else {
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWp;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
        float fb(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=.5; } return s; }`)
        .replace('#include <map_fragment>', `
        float n1 = fb(vWp.xz * 0.045), dab = fb(vWp.xz * 0.8);
        float streak = fb(vec2(vWp.x * 0.7 + vWp.z * 0.25, vWp.z * 0.09 - vWp.x * 0.03));
        vec3 base = diffuseColor.rgb * (0.62 + 0.75 * n1 + 0.75 * (streak - 0.5) + 0.5 * (dab - 0.5));
        base = mix(vec3(dot(base, vec3(0.33))), base, 1.25);
        diffuseColor.rgb = mix(base, floor(base * 5.0 + 0.5) / 5.0, 0.45);`);
    };
  }
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.name = 'terrain';
  return mesh;
}
export function buildTerrain(world, tex, style) {
  if (style === 'real') return makeRealTerrain(world, tex);
  if (style === 'block') return makeBlockTerrain(world);
  return makeSmoothTerrain(world, style);
}

// 월드 좌표를 기준으로 UV 를 잡은 직육면체(텍스처가 면 크기에 따라 늘어나지 않게). 같은 재질끼리 하나로 합친다.
export function boxGeo(mn, mx, tile) {
  const sx = mx[0] - mn[0], sy = mx[1] - mn[1], sz = mx[2] - mn[2];
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
  const uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  return g;
}

// 모래주머니·천 같은 질감을 그림으로 만든다(이미지 파일이 필요 없다).
export function canvasTex(draw, size = 256, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
export function sandbagTexture() {
  return canvasTex((g, s) => {
    g.fillStyle = '#8a7a58'; g.fillRect(0, 0, s, s);
    const rows = 4, cols = 3;
    for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) {
      const w = s / cols, h = s / rows, ox = (r % 2) * w * 0.5;
      const x = c * w + ox, y = r * h;
      const sh = 100 + Math.floor(Math.random() * 40);
      g.fillStyle = `rgb(${sh + 30},${sh + 14},${sh - 18})`;
      g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, h - 6, 16); g.fill();
      g.strokeStyle = 'rgba(40,30,15,0.55)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(255,240,200,0.10)'; g.lineWidth = 1;
      for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(x + 8 + k * 9, y + 8); g.lineTo(x + 12 + k * 9, y + h - 8); g.stroke(); }
    }
    const d = g.getImageData(0, 0, s, s);
    for (let i = 0; i < d.data.length; i += 4) { const nz = (Math.random() - 0.5) * 22; d.data[i] += nz; d.data[i + 1] += nz; d.data[i + 2] += nz; }
    g.putImageData(d, 0, 0);
  });
}
export function clothTexture(base = '#4d5236') {
  return canvasTex((g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 3) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.07})`; g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,10' : '200,190,150'},0.05)`; g.fillRect(Math.random() * s, Math.random() * s, 5 + Math.random() * 20, 4 + Math.random() * 10); }
  }, 128);
}

// 소품 상자 → 메시. kind: 0 석조벽 1 모래주머니 3 목재 8 회반죽(집). 나머지는 모델이나 절차적 메시가 맡는다.
export function makeBoxProps(world, tex) {
  const groups = new THREE.Group();
  groups.name = 'props';
  const spec = { 0: [tex.brick, 1.4, 0xffffff], 1: [tex.sand, 1.0, 0xffffff], 3: [tex.plank, 1.6, 0xd8c0a0], 8: [tex.plaster, 2.2, 0xe8e0d0] };
  const by = {};
  for (const b of world.boxes) {
    const sp = spec[b.kind];
    if (!sp) continue;
    (by[b.kind] ||= []).push(boxGeo(b.mn, b.mx, sp[1]));
  }
  for (const k of Object.keys(by)) {
    const geo = mergeGeometries(by[k], false);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: spec[k][0], color: spec[k][2], roughness: 0.95 }));
    m.castShadow = m.receiveShadow = true;
    groups.add(m);
  }
  return groups;
}

// 집: 바닥 널과 박공지붕(기와). 벽은 상자에서 이미 만들었다.
export function makeHouses(world, tex) {
  const g = new THREE.Group();
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.plank, color: 0x9a8268, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ map: tex.roof, color: 0xd0b0a0, roughness: 0.85, side: THREE.DoubleSide });
  for (const h of world.houses) {
    const floor = new THREE.Mesh(boxGeo([h.cx - h.hw + 0.35, h.gy - 0.1, h.cz - h.hd + 0.35], [h.cx + h.hw - 0.35, h.gy + 0.08, h.cz + h.hd - 0.35], 1.6), floorMat);
    floor.receiveShadow = true; g.add(floor);
    const top = h.gy + h.h, ridge = top + 2.0, eave = 0.6;
    const run = Math.hypot(h.hd + eave, ridge - top);
    for (const side of [1, -1]) {
      const geo = new THREE.PlaneGeometry(h.hw * 2 + 1.2, run);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, roofMat);
      m.position.set(h.cx, (top + ridge) / 2 - 0.1, h.cz + side * (h.hd + eave) / 2);
      m.rotation.x = side * Math.atan2(ridge - top, h.hd + eave);
      m.castShadow = m.receiveShadow = true;
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
      g.add(m);
    }
    // 합각 삼각벽
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(-h.hd, 0); sh.lineTo(h.hd, 0); sh.lineTo(0, ridge - top); sh.closePath();
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ map: tex.plaster, color: 0xd8d0c0, side: THREE.DoubleSide, roughness: 1 }));
      gm.rotation.y = Math.PI / 2; gm.position.set(h.cx + sx * h.hw, top, h.cz); g.add(gm);
    }
  }
  return g;
}
