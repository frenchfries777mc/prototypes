// 섬 지형, 바다, 하늘. 지형은 높이 함수 하나로 정의되고, 물과 배치 규칙이 모두 그 함수를 본다.
import { clamp, lerp, smoothstep, makeNoise, rng } from './util.js';
const B = window.BABYLON;

export const SEA = -1.6; // 해수면 높이
export const TOWN = { x0: 6, x1: 126, z0: -6, z1: 106, y: 0.2 }; // 평평하게 다진 마을 터
const ISLAND = { cx: 66, cz: 150, rx: 255, rz: 178 };
// 지형 격자. 격자선이 도로 바닥판(SLABS) 가장자리와 정확히 겹치도록 원점을 잡았다.
export const WORLD = { x0: -262, x1: 390, z0: -102, z1: 390, cell: 4 };
// 도로와 보도가 깔리는 구역. 이 안쪽은 지형을 만들지 않는다(타일이 바닥 역할을 한다).
export const SLABS = [{ x0: 6, x1: 126, z0: -6, z1: 90 }, { x0: 126, x1: 138, z0: 42, z1: 54 }];

const noise = makeNoise(20261121);

function sdRect(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

function natural(x, z) {
  const dx = (x - ISLAND.cx) / ISLAND.rx, dz = (z - ISLAND.cz) / ISLAND.rz;
  const k = 1 - Math.hypot(dx, dz) + (noise.fbm(x * 0.007, z * 0.007, 3) - 0.5) * 0.16;
  let h = -8 + 10.2 * smoothstep(-0.12, 0.1, k); // 바다 밑 -> 모래사장
  const inland = smoothstep(0.07, 0.45, k);
  const hills = noise.fbm(x * 0.0105 + 3.1, z * 0.0105 - 1.7, 4);
  h += inland * (4 + Math.pow(hills, 1.6) * 52);
  h += inland * smoothstep(150, 300, z) * 14; // 북쪽이 더 높다
  // 등대가 서는 동쪽 곶
  const lx = x - 156, lz = z + 14;
  h += 5.5 * Math.exp(-(lx * lx + lz * lz) / (2 * 15 * 15));
  return h;
}

export function height(x, z) {
  let h = natural(x, z);
  const tm = 1 - smoothstep(0, 34, sdRect(x, z, TOWN));
  h = lerp(h, TOWN.y, tm);
  // 항구: 부두 벽(z = TOWN.z0) 남쪽은 바로 깊은 물
  if (z < TOWN.z0) {
    const bx = Math.min(x - TOWN.x0, TOWN.x1 - x);
    const bm = smoothstep(-16, 3, bx);
    h = lerp(h, Math.min(h, -6.5), bm);
  }
  return h;
}

export function slope(x, z) {
  const e = 2;
  return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
}

const C = {
  sand: [0.94, 0.86, 0.64],
  sandWet: [0.84, 0.76, 0.56],
  grassA: [0.47, 0.76, 0.38],
  grassB: [0.38, 0.68, 0.36],
  grassC: [0.58, 0.8, 0.4],
  rock: [0.6, 0.57, 0.55],
  rockDark: [0.48, 0.46, 0.47],
  seabed: [0.62, 0.72, 0.6],
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function groundColor(x, z, h, sl) {
  const n = noise.fbm(x * 0.03, z * 0.03, 3);
  // 모래는 '원래 해안이었던 곳'에만 깐다. 마을 터는 낮게 다졌어도 풀밭이다.
  const beachH = Math.min(natural(x, z), h + 3.2);
  let g = n < 0.5 ? mix3(C.grassB, C.grassA, n * 2) : mix3(C.grassA, C.grassC, (n - 0.5) * 2);
  const sandT = 1 - smoothstep(SEA + 1.9, SEA + 3.4, beachH + (n - 0.5) * 1.2);
  let c = mix3(g, C.sand, sandT);
  if (h < SEA + 0.5) c = mix3(C.seabed, C.sandWet, smoothstep(SEA - 3, SEA + 0.5, h));
  const rockT = smoothstep(0.55, 0.85, sl) * smoothstep(SEA + 0.5, SEA + 4, h);
  c = mix3(c, n > 0.5 ? C.rock : C.rockDark, rockT);
  return c;
}

// 면마다 색과 법선이 하나인(각진) 지형 메시.
export function buildTerrain(scene) {
  const { x0, x1, z0, z1, cell } = WORLD;
  const nx = Math.round((x1 - x0) / cell), nz = Math.round((z1 - z0) / cell);
  const hs = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = height(x0 + i * cell, z0 + j * cell);
  const H = (i, j) => hs[j * (nx + 1) + i];
  const pos = [], nor = [], col = [];
  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
    const l = Math.hypot(nxx, nyy, nzz) || 1;
    nxx /= l; nyy /= l; nzz /= l;
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
    const sl = Math.sqrt(Math.max(0, 1 - nyy * nyy)) / Math.max(0.05, Math.abs(nyy));
    const c = groundColor(mx, mz, my, sl);
    pos.push(ax, ay, az, cx, cy, cz, bx, by, bz); // 위에서 봤을 때 앞면이 되도록 감는다
    for (let k = 0; k < 3; k++) {
      nor.push(nxx, nyy, nzz);
      col.push(c[0], c[1], c[2], 1);
    }
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const xa = x0 + i * cell, xb = xa + cell, za = z0 + j * cell, zb = za + cell;
      const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
      if (Math.max(h00, h10, h01, h11) < SEA - 7.5) continue; // 깊은 바다 밑은 만들지 않는다
      if (SLABS.some((r) => xa >= r.x0 && xb <= r.x1 && za >= r.z0 && zb <= r.z1)) continue;
      // 대각선 방향을 번갈아 써서 줄무늬가 생기지 않게 한다. 감는 방향은 위쪽이 앞면.
      if ((i + j) & 1) {
        tri(xa, h00, za, xa, h01, zb, xb, h11, zb);
        tri(xa, h00, za, xb, h11, zb, xb, h10, za);
      } else {
        tri(xa, h00, za, xa, h01, zb, xb, h10, za);
        tri(xb, h10, za, xa, h01, zb, xb, h11, zb);
      }
    }
  }
  const mesh = new B.Mesh('terrain', scene);
  const vd = new B.VertexData();
  vd.positions = pos;
  vd.normals = nor;
  vd.colors = col;
  vd.indices = Array.from({ length: pos.length / 3 }, (_, i) => i);
  vd.applyToMesh(mesh);
  const mat = new B.StandardMaterial('terrainMat', scene);
  mat.specularColor = new B.Color3(0, 0, 0);
  mat.ambientColor = new B.Color3(1, 1, 1);
  mesh.material = mat;
  mesh.useVertexColors = true;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

// 물 셰이더가 수심을 알 수 있도록 지형 높이를 텍스처로 굽는다.
function heightTexture(scene) {
  const N = 256;
  const { x0, x1, z0, z1 } = WORLD;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const h = height(x0 + ((i + 0.5) / N) * (x1 - x0), z0 + ((j + 0.5) / N) * (z1 - z0));
      const v = clamp((h - (SEA - 8)) / 10, 0, 1); // SEA-8 .. SEA+2
      data[(j * N + i) * 4] = v * 255;
      data[(j * N + i) * 4 + 3] = 255;
    }
  }
  const t = B.RawTexture.CreateRGBATexture(data, N, N, scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
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
  float streak = smoothstep(1.18,1.3,n) * (1.0 - smoothstep(60.0, 260.0, distance(vW.xz, camPos.xz)));
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
  const mesh = B.MeshBuilder.CreateGround('water', { width: 3200, height: 3200, subdivisions: 64 }, scene);
  mesh.position.set(66, SEA, 150);
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
  for (let i = 0; i < 22; i++) {
    const parts = [];
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const b = B.MeshBuilder.CreateBox('c', { width: r.range(26, 60), height: r.range(9, 18), depth: r.range(22, 46) }, scene);
      b.position.set(r.range(-34, 34), r.range(-4, 7), r.range(-22, 22));
      parts.push(b);
    }
    const c = B.Mesh.MergeMeshes(parts, true, true);
    c.material = cmat;
    c.position.set(r.range(-900, 1000), r.range(150, 260), r.range(-700, 1100));
    c.scaling.setAll(r.range(0.8, 1.7));
    c.isPickable = false;
    c.speed = r.range(1.2, 3);
    clouds.push(c);
  }
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    for (const c of clouds) {
      c.position.x += c.speed * dt;
      if (c.position.x > 1100) c.position.x = -1000;
    }
  });
  return dome;
}
