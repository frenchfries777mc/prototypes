// 지형, 바다, 하늘. 지형은 높이 함수 하나로 정의되고, 물과 배치 규칙이 모두 그 결과(높이 격자)를 본다.
import { clamp, lerp, smoothstep, makeNoise, rng } from './util.js';
import { WORLD, ISLANDS, MOUNTAINS, LAKES, RIVERS, SITES } from './world.js';
const B = window.BABYLON;
export { WORLD };

export const SEA = -1.6; // 해수면 높이
export const TOWN = { x0: -10, x1: 142, z0: -6, z1: 108, y: 0.2 }; // 평평하게 다진 마을 터
const QUAY = { x0: 6, x1: 126 }; // 부두 벽이 서는 구간
// 도로와 보도가 깔리는 구역. 이 안쪽은 지형을 만들지 않는다(타일이 바닥 역할을 한다).
export const SLABS = [
  { x0: 6, x1: 126, z0: -6, z1: 90 }, { x0: 126, x1: 138, z0: 42, z1: 54 },
  { x0: -6, x1: 6, z0: 42, z1: 54 }, { x0: 6, x1: 18, z0: 90, z1: 102 },
];

const noise = makeNoise(20261121);

function sdRect(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}
function segDist(x, z, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = x - ax, wz = z - az;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(wx - vx * t, wz - vz * t);
}

// 섬마다 회전값을 미리 계산해 둔다.
ISLANDS.forEach((s, i) => { s.c = Math.cos(s.rot); s.s = Math.sin(s.rot); s.i = i; s.rmin = Math.min(s.rx, s.rz); });

// 해안에서 내륙으로 몇 m 들어왔는지(바다 쪽은 음수)와 어느 섬인지.
const land = { kd: 0, isl: ISLANDS[0] };
function landAt(x, z) {
  let best = -1e9, bi = ISLANDS[0];
  for (const s of ISLANDS) {
    const dx = x - s.cx, dz = z - s.cz;
    const lx = dx * s.c + dz * s.s, lz = -dx * s.s + dz * s.c;
    const r = Math.hypot(lx / s.rx, lz / s.rz);
    if (r > 1.75) { const k = (1 - r) * s.rmin; if (k > best) { best = k; bi = s; } continue; }
    let w = (noise.fbm(x * 0.0024 + s.i * 7.3, z * 0.0024 - s.i * 3.1, 3) - 0.5) * s.warp + (noise.fbm(x * 0.0075, z * 0.0075, 3) - 0.5) * 0.07;
    // 항구 마을 근처는 해안선이 흔들리면 부두가 어긋나므로 굴곡을 줄인다.
    if (s.i === 0) w *= smoothstep(190, 520, Math.hypot(x - 66, z - 30));
    const k = (1 - r + w) * s.rmin;
    if (k > best) { best = k; bi = s; }
  }
  land.kd = best; land.isl = bi;
  return land;
}

// 터의 높이는 처음 한 번, 다지기 전 지형에서 정한다.
const sites = Object.values(SITES);
let sitesReady = false;

function natural(x, z, withSites = true) {
  const { kd, isl } = landAt(x, z);
  let h = -9 + 11.2 * smoothstep(-28, 24, kd); // 바다 밑 -> 모래사장
  const inland = smoothstep(14, 95, kd);
  if (inland > 0) {
    const hills = noise.fbm(x * 0.0105 + 3.1, z * 0.0105 - 1.7, 4);
    // 항구 마을 둘레는 완만하게: 마을에서 멀어질수록 언덕이 제 높이를 찾는다.
    const calm = isl.i <= 1 ? 0.1 + 0.9 * smoothstep(50, 380, sdRect(x, z, TOWN)) : 1;
    h += inland * (isl.base + Math.pow(hills, 1.6) * isl.hills * calm);
    for (const m of MOUNTAINS) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d > m.r) continue;
      const a = 1 - smoothstep(m.r * 0.12, m.r, d);
      const ridge = 1 - Math.abs(2 * noise.fbm(x * 0.0058 + m.s, z * 0.0058 - m.s, 4) - 1);
      h += inland * a * (m.h * 0.42 + Math.pow(ridge, 1.4) * m.h * 0.7);
    }
  }
  // 등대가 서는 곶
  const lx = x - 156, lz = z + 14;
  h += 5.5 * Math.exp(-(lx * lx + lz * lz) / (2 * 15 * 15));
  // 강과 호수: 물길 바닥에서 양옆으로 비탈을 올려 골짜기를 만든다.
  const bed = SEA - 2.8;
  for (const r of RIVERS) {
    let d = 1e9;
    for (let i = 0; i < r.pts.length - 1; i++) d = Math.min(d, segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]));
    if (d < 320) h = Math.min(h, bed + Math.max(0, d - r.half) * 0.3 + Math.max(0, d - r.half - 40) * 0.35);
  }
  for (const l of LAKES) {
    const d = Math.hypot(x - l.x, z - l.z) - l.r;
    if (d < 320) h = Math.min(h, bed - 1 + Math.max(0, d) * 0.22 + Math.max(0, d - 70) * 0.32);
  }
  if (withSites && sitesReady) {
    for (const s of sites) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > s.r + 26) continue;
      h = lerp(h, s.y, 1 - smoothstep(s.r, s.r + 26, d));
    }
  }
  return h;
}

// 길을 뺀 지형 높이. 길의 높낮이를 정할 때 쓴다.
export function baseHeight(x, z) {
  if (!sitesReady) {
    for (const s of sites) s.y = Math.max(natural(s.x, s.z, false), SEA + 2.6);
    sitesReady = true;
  }
  let h = natural(x, z);
  const tm = 1 - smoothstep(0, 34, sdRect(x, z, TOWN));
  if (tm > 0) {
    h = lerp(h, TOWN.y, tm);
    // 항구: 부두 벽(z = TOWN.z0) 남쪽은 바로 깊은 물
    if (z < TOWN.z0) {
      const bx = Math.min(x - QUAY.x0, QUAY.x1 - x);
      h = lerp(h, Math.min(h, -6.5), smoothstep(-16, 3, bx));
    }
  }
  return h;
}

// 길이 지형을 다지는 함수는 roads.js가 나중에 끼운다(서로 불러오는 순서 문제를 피하려고).
let roadMod = null;
export function setRoadMod(fn) { roadMod = fn; }
function analytic(x, z) { const h = baseHeight(x, z); return roadMod ? roadMod(x, z, h) : h; }

// 높이 격자. 한 번 계산해 두면 지형 메시, 물, 배치가 모두 같은 값을 본다.
const NX = Math.round((WORLD.x1 - WORLD.x0) / WORLD.cell), NZ = Math.round((WORLD.z1 - WORLD.z0) / WORLD.cell);
let hgrid = null, kgrid = null;
export function initGrid() {
  hgrid = new Float32Array((NX + 1) * (NZ + 1));
  kgrid = new Float32Array((NX + 1) * (NZ + 1));
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = WORLD.x0 + i * WORLD.cell, z = WORLD.z0 + j * WORLD.cell;
      hgrid[j * (NX + 1) + i] = analytic(x, z);
      kgrid[j * (NX + 1) + i] = landAt(x, z).kd;
    }
  }
}
function sample(grid, x, z) {
  const fx = clamp((x - WORLD.x0) / WORLD.cell, 0, NX - 0.001), fz = clamp((z - WORLD.z0) / WORLD.cell, 0, NZ - 0.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, w = NX + 1;
  const a = grid[j * w + i], b = grid[j * w + i + 1], c = grid[(j + 1) * w + i], d = grid[(j + 1) * w + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function height(x, z) { return hgrid ? sample(hgrid, x, z) : analytic(x, z); }
export function coast(x, z) { return kgrid ? sample(kgrid, x, z) : landAt(x, z).kd; }
export function islandAt(x, z) { return landAt(x, z).isl; }
export function slope(x, z) {
  const e = 3;
  return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
}

const C = {
  sand: [0.94, 0.86, 0.64], sandWet: [0.84, 0.76, 0.56], seabed: [0.62, 0.72, 0.6],
  grassA: [0.47, 0.76, 0.38], grassB: [0.38, 0.68, 0.36], grassC: [0.58, 0.8, 0.4],
  dry: [0.72, 0.78, 0.42], alpine: [0.42, 0.6, 0.42], dark: [0.3, 0.56, 0.34],
  rock: [0.6, 0.57, 0.55], rockDark: [0.48, 0.46, 0.47], snow: [0.95, 0.97, 1.0],
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// 땅 색: 해안은 모래, 내륙은 풀(지역마다 색조가 다르다), 가파르면 바위, 높으면 눈.
export function groundColor(x, z, h, sl, kd) {
  const n = noise.fbm(x * 0.03, z * 0.03, 3);
  let g = n < 0.5 ? mix3(C.grassB, C.grassA, n * 2) : mix3(C.grassA, C.grassC, (n - 0.5) * 2);
  const biome = noise.fbm(x * 0.0036 + 11, z * 0.0036 - 5, 2);
  g = mix3(g, C.dry, smoothstep(0.56, 0.74, biome) * 0.75);
  g = mix3(g, C.dark, smoothstep(0.46, 0.28, biome) * 0.6);
  g = mix3(g, C.alpine, smoothstep(40, 80, h));
  const inTown = sdRect(x, z, TOWN) < 24;
  const sandT = inTown ? 0 : 1 - smoothstep(20, 34, kd + (n - 0.5) * 14);
  let c = mix3(g, C.sand, sandT);
  if (h < SEA + 0.9) c = mix3(C.seabed, C.sandWet, smoothstep(SEA - 3, SEA + 0.9, h));
  const rockT = smoothstep(0.55 - smoothstep(50, 100, h) * 0.2, 0.85, sl) * smoothstep(SEA + 0.5, SEA + 4, h);
  c = mix3(c, n > 0.5 ? C.rock : C.rockDark, rockT);
  c = mix3(c, C.snow, smoothstep(96, 112, h + (n - 0.5) * 16) * (1 - smoothstep(0.9, 1.4, sl)));
  return c;
}

// 면마다 색과 법선이 하나인(각진) 지형. 192m 구역 단위 메시로 나눠서 화면 밖 구역은 그리지 않는다.
export function buildTerrain(scene) {
  if (!hgrid) initGrid();
  const { x0, z0, cell, chunk } = WORLD;
  const W = NX + 1;
  const mat = new B.StandardMaterial('terrainMat', scene);
  mat.specularColor = new B.Color3(0, 0, 0);
  mat.ambientColor = new B.Color3(1, 1, 1);
  const meshes = [];
  for (let cj = 0; cj < NZ / chunk; cj++) {
    for (let ci = 0; ci < NX / chunk; ci++) {
      const pos = [], nor = [], col = [];
      const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, kd) => {
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        let nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
        const l = Math.hypot(nxx, nyy, nzz) || 1;
        nxx /= l; nyy /= l; nzz /= l;
        const sl = Math.sqrt(Math.max(0, 1 - nyy * nyy)) / Math.max(0.05, Math.abs(nyy));
        const c = groundColor((ax + bx + cx) / 3, (az + bz + cz) / 3, (ay + by + cy) / 3, sl, kd);
        pos.push(ax, ay, az, cx, cy, cz, bx, by, bz); // 위에서 봤을 때 앞면이 되도록 감는다
        for (let k = 0; k < 3; k++) { nor.push(nxx, nyy, nzz); col.push(c[0], c[1], c[2], 1); }
      };
      for (let j = cj * chunk; j < (cj + 1) * chunk; j++) {
        for (let i = ci * chunk; i < (ci + 1) * chunk; i++) {
          const h00 = hgrid[j * W + i], h10 = hgrid[j * W + i + 1], h01 = hgrid[(j + 1) * W + i], h11 = hgrid[(j + 1) * W + i + 1];
          if (Math.max(h00, h10, h01, h11) < SEA - 7.5) continue; // 깊은 바다 밑은 만들지 않는다
          const xa = x0 + i * cell, xb = xa + cell, za = z0 + j * cell, zb = za + cell;
          if (SLABS.some((r) => xa >= r.x0 && xb <= r.x1 && za >= r.z0 && zb <= r.z1)) continue;
          const kd = (kgrid[j * W + i] + kgrid[(j + 1) * W + i + 1]) / 2;
          // 대각선 방향을 번갈아 써서 줄무늬가 생기지 않게 한다.
          if ((i + j) & 1) {
            tri(xa, h00, za, xa, h01, zb, xb, h11, zb, kd);
            tri(xa, h00, za, xb, h11, zb, xb, h10, za, kd);
          } else {
            tri(xa, h00, za, xa, h01, zb, xb, h10, za, kd);
            tri(xb, h10, za, xa, h01, zb, xb, h11, zb, kd);
          }
        }
      }
      if (!pos.length) continue;
      const mesh = new B.Mesh(`terrain_${ci}_${cj}`, scene);
      const vd = new B.VertexData();
      vd.positions = pos; vd.normals = nor; vd.colors = col;
      vd.indices = Array.from({ length: pos.length / 3 }, (_, k) => k);
      vd.applyToMesh(mesh);
      mesh.material = mat;
      mesh.useVertexColors = true;
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      meshes.push(mesh);
    }
  }
  return meshes;
}

// 물 셰이더가 수심을 알 수 있도록 지형 높이를 텍스처로 굽는다(격자 한 칸 = 한 픽셀).
function heightTexture(scene) {
  const data = new Uint8Array(NX * NZ * 4);
  const W = NX + 1;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const h = (hgrid[j * W + i] + hgrid[j * W + i + 1] + hgrid[(j + 1) * W + i] + hgrid[(j + 1) * W + i + 1]) / 4;
      data[(j * NX + i) * 4] = clamp((h - (SEA - 8)) / 10, 0, 1) * 255; // SEA-8 .. SEA+2
      data[(j * NX + i) * 4 + 3] = 255;
    }
  }
  const t = B.RawTexture.CreateRGBATexture(data, NX, NZ, scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
  t.wrapU = t.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  return t;
}

B.Effect.ShadersStore.bxWaterVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 world; uniform mat4 viewProjection; uniform float time;
varying vec3 vW;
void main(){
  vec4 w = world * vec4(position,1.0);
  w.y += sin(w.x*0.11 + time*1.1)*0.07 + sin(w.z*0.13 - time*0.9)*0.07;
  vW = w.xyz;
  gl_Position = viewProjection * w;
}`;
B.Effect.ShadersStore.bxWaterFragmentShader = `
precision highp float;
varying vec3 vW;
uniform sampler2D heightTex;
uniform vec4 worldRect; // x0, z0, 1/w, 1/h
uniform vec3 camPos; uniform vec3 sunDir; uniform vec3 horizon; uniform vec3 fogColor;
uniform float time; uniform float fogDensity;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 uv = (vW.xz - worldRect.xy) * worldRect.zw;
  float inside = step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
  float hv = mix(0.0, texture2D(heightTex, uv).r, inside);
  float depth = (0.8 - hv) * 10.0;            // 수심(m), 0.8 = 해수면
  if (depth < -0.6) discard;                  // 땅속에 묻힌 부분은 그리지 않는다
  float d01 = clamp(depth/7.0, 0.0, 1.0);
  vec3 shallow = vec3(0.36,0.86,0.80), mid = vec3(0.14,0.62,0.78), deep = vec3(0.07,0.36,0.63);
  vec3 col = mix(shallow, mid, smoothstep(0.0,0.45,d01));
  col = mix(col, deep, smoothstep(0.35,1.0,d01));
  // 잔물결: 두 겹의 노이즈가 엇갈려 흐르며 밝은 줄무늬를 만든다
  float n = vnoise(vW.xz*0.16 + vec2(time*0.25, time*0.11)) + vnoise(vW.xz*0.37 - vec2(time*0.18, -time*0.21));
  float streak = smoothstep(1.18,1.3,n) * (1.0 - smoothstep(60.0, 320.0, distance(vW.xz, camPos.xz)));
  col += streak*0.10;
  // 물가 거품: 수심이 얕은 곳에 일렁이는 흰 띠
  float wob = vnoise(vW.xz*0.55 + time*0.35)*0.5 + sin(time*1.3 + vW.x*0.2 + vW.z*0.17)*0.12;
  float foam = 1.0 - smoothstep(0.0, 0.42 + wob*0.55, depth);
  float foam2 = smoothstep(0.02,0.0,abs(depth - (1.05 + wob*0.9 + sin(time*0.9)*0.25)) - 0.07);
  foam = clamp(foam + foam2*0.55, 0.0, 1.0) * inside;
  // 시선 각도에 따라 하늘빛이 비친다
  vec3 V = normalize(camPos - vW);
  vec3 N = normalize(vec3((vnoise(vW.xz*0.3+time*0.4)-0.5)*0.22, 1.0, (vnoise(vW.zx*0.3-time*0.35)-0.5)*0.22));
  float fres = pow(1.0 - max(dot(V,N),0.0), 4.0);
  col = mix(col, horizon, fres*0.65);
  float spec = pow(max(dot(reflect(-sunDir, N), -V), 0.0), 220.0);
  col += vec3(1.0,0.96,0.85) * spec * 0.9;
  col = mix(col, vec3(0.97,1.0,1.0), foam*0.85);
  float alpha = mix(0.62, 0.97, smoothstep(0.0,0.5,d01));
  alpha = max(alpha, foam);
  float dist = distance(camPos, vW);
  float fog = clamp(exp(-pow(dist*fogDensity, 2.0)), 0.0, 1.0);
  col = mix(fogColor, col, fog);
  gl_FragColor = vec4(col, mix(1.0, alpha, fog));
}`;

export function buildWater(scene, env) {
  const mesh = B.MeshBuilder.CreateGround('water', { width: 9000, height: 9000, subdivisions: 90 }, scene);
  mesh.position.set(90, SEA, 282);
  const mat = new B.ShaderMaterial('waterMat', scene, { vertex: 'bxWater', fragment: 'bxWater' }, {
    attributes: ['position'],
    uniforms: ['world', 'viewProjection', 'time', 'worldRect', 'camPos', 'sunDir', 'horizon', 'fogColor', 'fogDensity'],
    samplers: ['heightTex'],
    needAlphaBlending: true,
  });
  mat.setTexture('heightTex', heightTexture(scene));
  const W = WORLD;
  mat.setVector4('worldRect', new B.Vector4(W.x0, W.z0, 1 / (W.x1 - W.x0), 1 / (W.z1 - W.z0)));
  mat.setVector3('sunDir', env.sunDir);
  mat.setColor3('horizon', env.horizon);
  mat.setColor3('fogColor', env.fog);
  mat.setFloat('fogDensity', env.fogDensity);
  mat.backFaceCulling = true;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.alphaIndex = 10;
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    t += scene.getEngine().getDeltaTime() / 1000;
    mat.setFloat('time', t);
    mat.setVector3('camPos', scene.activeCamera.globalPosition);
  });
  return mesh;
}

B.Effect.ShadersStore.bxSkyVertexShader = `
precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vP;
void main(){ vP = position; gl_Position = worldViewProjection * vec4(position,1.0); gl_Position.z = gl_Position.w; }`;
B.Effect.ShadersStore.bxSkyFragmentShader = `
precision highp float; varying vec3 vP;
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir;
void main(){
  vec3 d = normalize(vP);
  float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
  vec3 col = mix(horizon, zenith, t);
  col = mix(col, horizon*0.96, smoothstep(0.0,-0.25,d.y));
  float s = max(dot(d, sunDir), 0.0);
  col += vec3(1.0,0.93,0.75) * (pow(s, 900.0)*2.0 + pow(s, 24.0)*0.22 + pow(s, 4.0)*0.10);
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildSky(scene, env) {
  const dome = B.MeshBuilder.CreateSphere('sky', { diameter: 10, segments: 16, sideOrientation: B.Mesh.BACKSIDE }, scene);
  const mat = new B.ShaderMaterial('skyMat', scene, { vertex: 'bxSky', fragment: 'bxSky' }, {
    attributes: ['position'], uniforms: ['worldViewProjection', 'zenith', 'horizon', 'sunDir'],
  });
  mat.setColor3('zenith', env.zenith);
  mat.setColor3('horizon', env.horizon);
  mat.setVector3('sunDir', env.sunDir);
  mat.disableDepthWrite = true;
  dome.material = mat;
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.renderingGroupId = 0;
  dome.alwaysSelectAsActiveMesh = true;
  dome.applyFog = false;

  // 네모난 구름: 상자 몇 개를 뭉쳐 만든 덩어리가 천천히 흘러간다.
  const r = rng(77);
  const cmat = new B.StandardMaterial('cloudMat', scene);
  cmat.diffuseColor = new B.Color3(1, 1, 1);
  cmat.emissiveColor = new B.Color3(0.78, 0.82, 0.88);
  cmat.specularColor = new B.Color3(0, 0, 0);
  cmat.fogEnabled = false;
  const clouds = [];
  for (let i = 0; i < 46; i++) {
    const parts = [];
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const b = B.MeshBuilder.CreateBox('c', { width: r.range(26, 60), height: r.range(9, 18), depth: r.range(22, 46) }, scene);
      b.position.set(r.range(-34, 34), r.range(-4, 7), r.range(-22, 22));
      parts.push(b);
    }
    const c = B.Mesh.MergeMeshes(parts, true, true);
    c.material = cmat;
    c.position.set(r.range(-2400, 2500), r.range(190, 330), r.range(-2000, 2500));
    c.scaling.setAll(r.range(0.8, 1.7));
    c.isPickable = false;
    c.speed = r.range(1.2, 3);
    clouds.push(c);
  }
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    for (const c of clouds) {
      c.position.x += c.speed * dt;
      if (c.position.x > 2500) c.position.x = -2400;
    }
  });
  return dome;
}
