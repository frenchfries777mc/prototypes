// 새 탈것: 자전거·전동 킥보드(차고에서 사서 V로 불러 탄다), 수상스키(바닷가에 놓여 있다), 열기구(판매장 옆에 있다).
// 모델 파일 없이 상자로 조립한다. 자전거·킥보드는 차와 같은 Vehicle(바퀴 네 개 서스펜션)을 쓰고, 수상스키는 Boat, 열기구는 Heli의 물리를 쓴다.
import { Heli } from './heli.js';
const B = window.BABYLON;

let mat = null;
const material = (scene) => mat || (mat = (() => {
  const m = new B.StandardMaterial('rideMat', scene);
  m.specularColor = new B.Color3(0.1, 0.1, 0.1); m.ambientColor = new B.Color3(1, 1, 1);
  return m;
})());

const paint = (mesh, color) => { // color: 색 하나 또는 (x,y,z) => 색
  const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind), cols = [];
  for (let i = 0; i < pos.length; i += 3) { const c = B.Color3.FromHexString(typeof color === 'function' ? color(pos[i], pos[i + 1], pos[i + 2]) : color); cols.push(c.r, c.g, c.b, 1); }
  mesh.setVerticesData(B.VertexBuffer.ColorKind, cols);
  return mesh;
};
const box = (scene, w, h, d, x, y, z, hex) => { const m = B.MeshBuilder.CreateBox('ridePart', { width: w, height: h, depth: d }, scene); m.position.set(x, y, z); return paint(m, hex); };
const merge = (scene, parts, name) => {
  const m = B.Mesh.MergeMeshes(parts, true, true);
  m.name = name; m.material = material(scene); m.useVertexColors = true; m.isPickable = false; m.receiveShadows = true; m.setEnabled(false);
  return m;
};
// 바퀴: 자기 중심이 원점, 축은 X.
const wheel = (scene, r, w, tire, hub) => {
  const t = B.MeshBuilder.CreateCylinder('rideTire', { diameter: r * 2, height: w, tessellation: 12 }, scene); t.rotation.z = Math.PI / 2; t.bakeCurrentTransformIntoVertices(); paint(t, tire);
  const h = B.MeshBuilder.CreateCylinder('rideHub', { diameter: r * 1.0, height: w * 1.25, tessellation: 8 }, scene); h.rotation.z = Math.PI / 2; h.bakeCurrentTransformIntoVertices(); paint(h, hub);
  return merge(scene, [t, h], 'rideWheel');
};

// 자전거·킥보드를 차 틀(assets.carTemplates)에 등록한다. 바퀴는 좌우 두 개씩 가까이 붙여 네 점으로 서게 한다.
export function registerRides(assets, scene) {
  const bike = [
    box(scene, 0.06, 0.06, 0.62, 0, 0.5, -0.3, '#e5553f'), box(scene, 0.07, 0.07, 0.8, 0, 0.74, 0.05, '#e5553f'),
    box(scene, 0.07, 0.5, 0.07, 0, 0.55, -0.34, '#e5553f'), box(scene, 0.07, 0.6, 0.07, 0, 0.62, 0.55, '#c9423a'),
    box(scene, 0.2, 0.07, 0.32, 0, 0.84, -0.4, '#2c2c36'), box(scene, 0.56, 0.05, 0.05, 0, 0.98, 0.52, '#2c2c36'),
    box(scene, 0.1, 0.06, 0.06, 0.28, 0.98, 0.52, '#e8e4dc'), box(scene, 0.1, 0.06, 0.06, -0.28, 0.98, 0.52, '#e8e4dc'),
    box(scene, 0.34, 0.05, 0.05, 0, 0.34, 0.58, '#c9ced8'), box(scene, 0.34, 0.05, 0.05, 0, 0.34, -0.58, '#c9ced8'), // 바퀴 축
    box(scene, 0.32, 0.05, 0.05, 0, 0.3, -0.05, '#9aa0ad'), box(scene, 0.09, 0.05, 0.16, 0.16, 0.3, -0.05, '#2c2c36'), box(scene, 0.09, 0.05, 0.16, -0.16, 0.3, -0.05, '#2c2c36'), // 페달
    box(scene, 0.3, 0.2, 0.22, 0, 0.88, 0.7, '#ffd84a'), // 앞 바구니
  ];
  const kick = [
    box(scene, 0.4, 0.1, 1.05, 0, 0.2, -0.05, '#35b7a8'), box(scene, 0.34, 0.05, 1.0, 0, 0.26, -0.05, '#2c2c36'), // 발판과 미끄럼 방지판
    box(scene, 0.3, 0.12, 0.3, 0, 0.3, -0.62, '#e5553f'), // 뒷 덮개
    box(scene, 0.08, 0.95, 0.08, 0, 0.7, 0.55, '#c9ced8'), box(scene, 0.6, 0.07, 0.07, 0, 1.16, 0.55, '#2c2c36'),
    box(scene, 0.12, 0.08, 0.08, 0.3, 1.16, 0.55, '#ffd84a'), box(scene, 0.12, 0.08, 0.08, -0.3, 1.16, 0.55, '#ffd84a'),
    box(scene, 0.2, 0.14, 0.1, 0, 1.04, 0.6, '#9fd3f2'), // 전조등
    box(scene, 0.34, 0.05, 0.05, 0, 0.18, 0.62, '#c9ced8'), box(scene, 0.34, 0.05, 0.05, 0, 0.18, -0.55, '#c9ced8'),
  ];
  const wheels = (r, w, gap, zf, zb, tire, hub) => [[-gap, zb], [gap, zb], [-gap, zf], [gap, zf]].map(([x, z]) => ({ mesh: wheel(scene, r, w, tire, hub), pos: new B.Vector3(x, r, z) }));
  assets.carTemplates.set('bike/bicycle', { body: merge(scene, bike, 'bicycleBody'), wheels: wheels(0.34, 0.08, 0.13, 0.58, -0.58, '#2c2c36', '#e8e4dc') });
  assets.carTemplates.set('bike/scooter', { body: merge(scene, kick, 'scooterBody'), wheels: wheels(0.18, 0.08, 0.13, 0.62, -0.55, '#2c2c36', '#ffd84a') });
}

// 수상스키(물 위를 달리는 제트스키): Boat가 틀을 복제해 쓴다.
export function registerJetski(assets, scene) {
  const p = [
    box(scene, 1.15, 0.34, 2.5, 0, 0.3, 0, '#f4f1ea'), box(scene, 1.17, 0.12, 2.52, 0, 0.18, 0, '#2f6fd0'), // 선체와 아래 띠
    box(scene, 0.9, 0.26, 0.7, 0, 0.36, 1.45, '#f4f1ea'), box(scene, 0.6, 0.2, 0.5, 0, 0.34, 1.9, '#e5553f'), // 뾰족한 앞
    box(scene, 0.5, 0.26, 1.0, 0, 0.6, -0.5, '#2c2c36'), box(scene, 0.34, 0.5, 0.5, 0, 0.62, 0.5, '#e5553f'), // 안장, 계기판 덮개
    box(scene, 0.78, 0.05, 0.06, 0, 1.0, 0.45, '#2c2c36'), box(scene, 0.5, 0.34, 0.05, 0, 0.98, 0.78, '#9fd3f2'), // 핸들, 앞유리
    box(scene, 1.17, 0.05, 0.4, 0, 0.5, -1.05, '#2f6fd0'),
  ];
  assets.carTemplates.set('craft/jetski', { body: merge(scene, p, 'jetskiBody'), wheels: [] });
}

// 열기구: 줄무늬 풍선, 바구니, 불꽃. Heli의 조종을 그대로 쓰되 천천히 뜨고 가라앉는다.
function balloonBuild(scene) {
  const stripes = ['#e5553f', '#f4f1ea', '#2f6fd0', '#f4f1ea', '#ffd84a', '#f4f1ea', '#35b7a8', '#f4f1ea'];
  const env = B.MeshBuilder.CreateSphere('balloonEnv', { diameter: 8.4, segments: 8 }, scene); env.position.y = 8.2;
  env.convertToFlatShadedMesh(); // 면마다 한 색: 줄무늬가 번지지 않고 또렷하다
  { const pos = env.getVerticesData(B.VertexBuffer.PositionKind), cols = new Array((pos.length / 3) * 4);
    for (let i = 0; i < pos.length; i += 9) {
      const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3, cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
      const c = B.Color3.FromHexString(stripes[Math.floor(((Math.atan2(cx, cz) + Math.PI) / (Math.PI * 2)) * 8) % 8]);
      for (let k = 0; k < 3; k++) { const o = ((i / 3) + k) * 4; cols[o] = c.r; cols[o + 1] = c.g; cols[o + 2] = c.b; cols[o + 3] = 1; }
    }
    env.setVerticesData(B.VertexBuffer.ColorKind, cols); }
  const parts = [env,
    box(scene, 1.6, 1.0, 1.6, 0, 0.5, 0, '#9a6a3a'), box(scene, 1.8, 0.14, 1.8, 0, 1.02, 0, '#7a4f2a'), box(scene, 1.62, 0.12, 1.62, 0, 0.06, 0, '#5a3a1f'),
    box(scene, 0.6, 0.16, 0.6, 0, 4.0, 0, '#2c2c36'),
  ];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(box(scene, 0.07, 3.1, 0.07, sx * 0.72, 2.6, sz * 0.72, '#d9c9a0'));
  const body = merge(scene, parts, 'balloonBody'); body.setEnabled(true);
  const fm = new B.StandardMaterial('balloonFlame', scene); fm.emissiveColor = new B.Color3(1, 0.62, 0.15); fm.disableLighting = true; fm.alpha = 0.92;
  const flame = B.MeshBuilder.CreateBox('balloonFlame', { width: 0.34, height: 0.7, depth: 0.34 }, scene); flame.material = fm; flame.isPickable = false;
  const tail = B.MeshBuilder.CreateBox('balloonDummy', { size: 0.01 }, scene); tail.isVisible = false; tail.isPickable = false;
  return { body, rotor: flame, tail };
}
const BALLOON = {
  key: 'craft/balloon', build: balloonBuild, rotorPos: [0, 3.5, 0], tailPos: [0, 0, 0], minRpm: 1, back: 3.5, turn: 0.55,
  spec: { mass: 520, vmax: 8 }, climb: { up: 4.6, down: -4.2, idle: -0.9, hold: 0 },
  shape: { c: [0, 0.6, 0], s: [1.7, 1.25, 1.7] }, dims: { w: 1.9, l: 2.2, h: 2.2, zc: 0 },
  frame: (h, dt) => { // 불꽃이 일렁인다(올라갈 때 더 크게)
    h.kitT = (h.kitT || 0) + dt * 14;
    h.rotor.scaling.y = 0.7 + Math.sin(h.kitT) * 0.25 + Math.sin(h.kitT * 2.3) * 0.15;
    h.rotor.rotation.y += dt * 3;
  },
};
export const makeBalloon = (scene, x, y, z, yaw, addShadow) => new Heli(scene, x, y, z, yaw, addShadow, undefined, BALLOON);
