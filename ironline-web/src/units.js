// 병사 모델, 1인칭 무기, 거점 깃발·구역·빛기둥. 전부 코드로 만든 형상이라 이미지가 필요 없다.
import * as THREE from 'three';
import { NPOINTS, POINT_R } from './world.js';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';
import { clothTexture, toonGradient } from './gfx.js';

export const COL_A = new THREE.Color(0.33, 0.56, 1.0), COL_B = new THREE.Color(1.0, 0.78, 0.24), COL_N = new THREE.Color(0.75, 0.75, 0.75);
const std = (c, r = 0.9, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

const TEAM = [
  { coat: 0x3d68c4, pants: 0x2c4482, helmet: 0x5a6a8a, band: 0xffffff },
  { coat: 0xc79a3c, pants: 0x80602c, helmet: 0x8a7a50, band: 0xff6a3a },
];
const tn = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
const mats = TEAM.map((t) => ({ coat: tn(t.coat), pants: tn(t.pants), helmet: tn(t.helmet), band: new THREE.MeshBasicMaterial({ color: t.band }) }));
const skinT = tn(0xe0ac80), inkMat = new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide });
const skin = std(0xd9a77e, 1), gunMat = std(0x3a2e22, 0.6, 0.1), metal = std(0x6a7078, 0.45, 0.3);

// ---- 병사: 둥근 카툰 체형. 부위별로 지오메트리를 하나로 합쳐 병사 한 명이 8번(윤곽선 포함)만 그려지게 한다. ----
const SK = 0xe3b08a, DARK = 0x2b2622, WOODC = 0x7a4f2c, STEEL = 0x6c727a, KHAKI = 0x6a6a46, BELT = 0x5a3e22;
const toonMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
const inkOutline = new THREE.ShaderMaterial({
  side: THREE.BackSide, fog: false,
  vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.022, 1.0); }',
  fragmentShader: 'void main(){ gl_FragColor = vec4(0.08, 0.06, 0.04, 1.0); }',
});
function part(items) {
  const geos = items.map(({ g, c, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }) => {
    g = g.clone(); g.scale(s[0], s[1], s[2]); g.rotateX(r[0]); g.rotateY(r[1]); g.rotateZ(r[2]); g.translate(p[0], p[1], p[2]);
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(geos, false);
}
const SPH = new THREE.SphereGeometry(1, 14, 10), CAP = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10), CYL = (r, h) => new THREE.CylinderGeometry(r, r, h, 12), BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const BRASS = 0xc9a24a, RED = 0xd8402e, WHITE = 0xf4f1e8, YELLOW = 0xf2c230;
const gunItems = (wp) => {
  const wood = WOODC;
  if (wp === 0) return [{ g: CYL(0.02, 0.62), c: STEEL, p: [0, -0.08, -0.78], r: [Math.PI / 2, 0, 0] }, { g: BOX(0.065, 0.1, 0.5), c: wood, p: [0, -0.1, -0.34] }, { g: BOX(0.05, 0.12, 0.1), c: wood, p: [0, -0.17, -0.12], r: [0.5, 0, 0] }];            // 긴 소총
  if (wp === 1) return [{ g: CYL(0.02, 0.36), c: STEEL, p: [0, -0.08, -0.62], r: [Math.PI / 2, 0, 0] }, { g: BOX(0.07, 0.1, 0.36), c: wood, p: [0, -0.1, -0.3] }, { g: BOX(0.05, 0.2, 0.06), c: DARK, p: [0, -0.22, -0.34] }];                      // 기관단총(탄창)
  if (wp === 2) return [{ g: CYL(0.025, 0.7), c: STEEL, p: [0, -0.08, -0.84], r: [Math.PI / 2, 0, 0] }, { g: BOX(0.08, 0.12, 0.5), c: DARK, p: [0, -0.1, -0.34] }, { g: BOX(0.02, 0.02, 0.34), c: STEEL, p: [0.06, -0.2, -0.9] }, { g: BOX(0.02, 0.02, 0.34), c: STEEL, p: [-0.06, -0.2, -0.9] }];   // 경기관총(양각대)
  if (wp === 3) return [{ g: CYL(0.02, 0.44), c: STEEL, p: [0, -0.08, -0.66], r: [Math.PI / 2, 0, 0] }, { g: BOX(0.06, 0.1, 0.42), c: wood, p: [0, -0.1, -0.3] }];                                                                          // 카빈
  return [{ g: CYL(0.03, 0.5), c: STEEL, p: [0, -0.07, -0.72], r: [Math.PI / 2, 0, 0] }, { g: CYL(0.03, 0.5), c: STEEL, p: [0, -0.13, -0.72], r: [Math.PI / 2, 0, 0] }, { g: BOX(0.09, 0.13, 0.44), c: wood, p: [0, -0.11, -0.28] }];             // 산탄총(쌍열)
};
const classExtras = (cl, t) => {
  if (cl === 2) return [{ g: BOX(0.09, 0.62, 0.05), c: BRASS, p: [0.0, 1.12, -0.17], r: [0, 0, 0.75] }];                                                         // 탄띠
  if (cl === 3) return [{ g: BOX(0.2, 0.06, 0.03), c: RED, p: [0, 1.18, -0.17] }, { g: BOX(0.06, 0.2, 0.03), c: RED, p: [0, 1.18, -0.17] }, { g: BOX(0.34, 0.07, 0.34), c: WHITE, p: [0, 1.84, 0] }, { g: BOX(0.2, 0.06, 0.03), c: RED, p: [0, 1.84, -0.19] }, { g: BOX(0.06, 0.2, 0.03), c: RED, p: [0.0, 1.45, 0.22] }]; // 적십자
  if (cl === 4) return [{ g: BOX(0.4, 0.09, 0.4), c: YELLOW, p: [0, 1.86, 0] }, { g: CYL(0.025, 0.6), c: STEEL, p: [0.1, 1.2, 0.29] }, { g: BOX(0.16, 0.2, 0.03), c: STEEL, p: [0.1, 0.86, 0.29] }];   // 안전모와 삽
  if (cl === 1) return [{ g: BOX(0.2, 0.14, 0.07), c: BELT, p: [0, 0.98, -0.2] }, { g: BOX(0.1, 0.07, 0.3), c: KHAKI, p: [0, 1.88, 0] }];                           // 소총수: 위장 천
  return [{ g: BOX(0.1, 0.03, 0.31), c: t.band, p: [0, 1.88, 0] }];                                                                                                 // 돌격병
};
const bodyItems = (t) => [
  { g: CAP(0.2, 0.3), c: t.coat, p: [0, 1.12, 0], s: [1.05, 1, 0.8] },
  { g: CYL(0.215, 0.07), c: BELT, p: [0, 0.86, 0], s: [1.05, 1, 0.8] },
  { g: new THREE.TorusGeometry(0.15, 0.05, 8, 16), c: t.band, p: [0, 1.38, 0], r: [Math.PI / 2, 0, 0] },
  { g: BOX(0.3, 0.36, 0.14), c: KHAKI, p: [0, 1.15, 0.2] },
  { g: BOX(0.09, 0.1, 0.06), c: BELT, p: [-0.13, 0.9, -0.17] }, { g: BOX(0.09, 0.1, 0.06), c: BELT, p: [0.13, 0.9, -0.17] },
  { g: SPH, c: SK, p: [0, 1.62, 0], s: [0.17, 0.18, 0.17] },
  { g: SPH, c: DARK, p: [-0.065, 1.63, -0.155], s: [0.022, 0.03, 0.02] }, { g: SPH, c: DARK, p: [0.065, 1.63, -0.155], s: [0.022, 0.03, 0.02] },
  { g: new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), c: t.helmet, p: [0, 1.64, 0], s: [0.2, 0.19, 0.205] },
  { g: CYL(0.235, 0.03), c: t.helmet, p: [0, 1.665, 0] },
];
const armsBase = (t) => [
  { g: CAP(0.066, 0.34), c: t.coat, p: [0.2, -0.1, -0.2], r: [-Math.PI / 2 + 0.08, 0, 0] },
  { g: CAP(0.066, 0.4), c: t.coat, p: [-0.2, -0.07, -0.26], r: [-Math.PI / 2 + 0.05, 0, 0] },
  { g: SPH, c: SK, p: [0.2, -0.1, -0.44], s: [0.075, 0.075, 0.075] }, { g: SPH, c: SK, p: [-0.2, -0.07, -0.5], s: [0.075, 0.075, 0.075] },
];
const soldierGeo = TEAM.map((t) => ({
  leg: part([{ g: CYL(0.1, 0.62), c: t.pants, p: [0, -0.31, 0] }, { g: SPH, c: DARK, p: [0, -0.72, -0.045], s: [0.125, 0.09, 0.19] }]),
  body: [0, 1, 2, 3, 4].map((cl) => part([...bodyItems(t), ...classExtras(cl, t)])),
  arms: [0, 1, 2, 3, 4].map((wp) => part([...armsBase(t), ...gunItems(wp)])),
}));

export function makeSoldier(team) {
  const G = soldierGeo[team];
  const g = new THREE.Group();
  const mk = (geo) => {
    const m = new THREE.Mesh(geo, toonMat); m.castShadow = true; m.frustumCulled = false;
    const o = new THREE.Mesh(geo, inkOutline); o.frustumCulled = false; m.add(o);
    return m;
  };
  const body = new THREE.Group(); g.add(body);
  const bodyMesh = mk(G.body[0]); body.add(bodyMesh);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.12, 0.82, 0); legR.position.set(0.12, 0.82, 0);
  legL.add(mk(G.leg)); legR.add(mk(G.leg));
  g.add(legL, legR);
  const arms = new THREE.Group(); arms.position.set(0, 1.38, 0); body.add(arms);
  const armsMesh = mk(G.arms[0]); arms.add(armsMesh);
  g.userData = { body, legL, legR, arms, bodyMesh, armsMesh, team, cls: 0, wpn: 0 };
  return g;
}

export class UnitViews {
  constructor(scene, sim) {
    this.sim = sim; this.group = new THREE.Group(); scene.add(this.group);
    this.views = sim.units.map((u) => { const v = makeSoldier(u.team); v.visible = false; this.group.add(v); return v; });
  }
  // alpha: 직전 틱과 현재 틱 사이의 진행도(0~1). 30Hz 시뮬레이션을 부드럽게 보여 준다.
  update(dt, localId, thirdPerson = false, alpha = 1) {
    for (const u of this.sim.units) {
      const v = this.views[u.id], ud = v.userData;
      const hide = (u.id === localId && u.alive && !thirdPerson) || (!u.alive && u.deathAge > 8);
      v.visible = !hide;
      if (hide) continue;
      if (ud.cls !== u.cls) { const gm = soldierGeo[ud.team].body[u.cls]; ud.bodyMesh.geometry = gm; ud.bodyMesh.children[0].geometry = gm; ud.cls = u.cls; }
      if (ud.wpn !== u.weapon) { const gm = soldierGeo[ud.team].arms[u.weapon]; ud.armsMesh.geometry = gm; ud.armsMesh.children[0].geometry = gm; ud.wpn = u.weapon; }
      const a = u.alive ? alpha : 1;
      let dy = u.yaw - u.pyaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.position.set(u.px + (u.x - u.px) * a, u.py + (u.y - u.py) * a, u.pz + (u.z - u.pz) * a);
      v.rotation.y = u.pyaw + dy * a;
      if (u.alive) {
        const sp = Math.min(u.speedNow / 4.8, 1.3), ph = u.walkDist * 2.1;
        ud.legL.rotation.x = Math.sin(ph) * 0.85 * sp; ud.legR.rotation.x = -Math.sin(ph) * 0.85 * sp;
        ud.body.position.y = Math.abs(Math.sin(ph)) * 0.04 * sp;
        ud.arms.rotation.x = u.pitch * 0.9;
        v.rotation.x = 0;
      } else {
        const f = Math.min(u.deathAge * 3.2, 1);
        v.position.set(u.x, u.y + 0.18 * f, u.z); v.rotation.y = u.yaw;
        v.rotation.x = -Math.PI / 2 * f;
        ud.legL.rotation.x = ud.legR.rotation.x = 0;
      }
    }
  }
}

// ---- 1인칭 무기 ----
export function makeViewmodel(weapon) {
  const g = new THREE.Group();
  const wood = std(0x5a3d24, 0.7), hand = std(0xc89a7a, 0.8);
  if (weapon === 0) {            // 볼트액션 소총
    g.add(box(0.05, 0.08, 0.55, wood, 0, -0.01, 0.12), box(0.035, 0.05, 0.5, metal, 0, 0.02, -0.28), box(0.02, 0.02, 0.5, metal, 0, 0.025, -0.72));
    g.add(box(0.012, 0.035, 0.012, metal, 0, 0.065, -0.95), box(0.015, 0.03, 0.02, metal, 0, 0.06, -0.02), box(0.1, 0.012, 0.012, metal, 0.04, 0.0, -0.05));
  } else if (weapon === 1) {     // 기관단총
    g.add(box(0.05, 0.075, 0.4, wood, 0, -0.01, 0.1), box(0.045, 0.06, 0.34, metal, 0, 0.02, -0.2), box(0.02, 0.02, 0.32, metal, 0, 0.025, -0.5));
    g.add(box(0.04, 0.2, 0.06, gunMat, 0, -0.14, -0.12), box(0.014, 0.03, 0.014, metal, 0, 0.06, -0.62));
  } else if (weapon === 3) {     // 카빈
    g.add(box(0.05, 0.08, 0.42, wood, 0, -0.01, 0.1), box(0.035, 0.05, 0.38, metal, 0, 0.02, -0.2), box(0.02, 0.02, 0.4, metal, 0, 0.025, -0.58));
    g.add(box(0.012, 0.035, 0.012, metal, 0, 0.065, -0.78), box(0.015, 0.03, 0.02, metal, 0, 0.06, -0.02));
  } else if (weapon === 4) {     // 산탄총
    g.add(box(0.06, 0.09, 0.46, wood, 0, -0.02, 0.1), box(0.03, 0.03, 0.62, metal, 0.022, 0.03, -0.42), box(0.03, 0.03, 0.62, metal, -0.022, 0.03, -0.42), box(0.07, 0.05, 0.16, wood, 0, -0.02, -0.38));
    g.add(box(0.012, 0.03, 0.012, metal, 0, 0.065, -0.72));
  } else {                       // 경기관총
    g.add(box(0.06, 0.09, 0.5, wood, 0, -0.01, 0.14), box(0.06, 0.07, 0.5, metal, 0, 0.02, -0.25), box(0.03, 0.03, 0.55, metal, 0, 0.03, -0.75));
    g.add(box(0.14, 0.1, 0.12, gunMat, 0, -0.08, -0.15), box(0.012, 0.012, 0.3, metal, 0.05, -0.08, -0.7), box(0.012, 0.012, 0.3, metal, -0.05, -0.08, -0.7));
  }
  g.add(box(0.07, 0.07, 0.22, std(0x38507c), 0.0, -0.08, 0.35));   // 소매
  g.add(box(0.06, 0.06, 0.1, hand, 0.0, -0.045, -0.12), box(0.06, 0.06, 0.1, hand, 0.0, -0.045, 0.05));
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// ---- 거점: 깃발, 바닥 구역 표시, 멀리서도 보이는 빛기둥 ----
export class PointViews {
  constructor(scene, sim) {
    this.sim = sim; this.items = []; this.scene = scene;
    const poleMat = std(0x2a1f15, 0.8), clothTex = clothTexture('#ffffff');
    for (let i = 0; i < NPOINTS; i++) {
      const p = sim.pts[i], grp = new THREE.Group(); grp.position.set(p.x, p.y, p.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 7.2, 8), poleMat); pole.position.y = 3.6; pole.castShadow = true;
      const flagGeo = new THREE.PlaneGeometry(2.6, 1.5, 12, 4); flagGeo.translate(1.4, 0, 0);
      const flagMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, map: clothTex, side: THREE.DoubleSide, roughness: 0.9 });
      const flag = new THREE.Mesh(flagGeo, flagMat); flag.position.set(0.06, 6.4, 0); flag.castShadow = true;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(POINT_R - 0.35, POINT_R, 96), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.22;
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const fill = new THREE.Mesh(new THREE.CircleGeometry(POINT_R - 0.4, 64), fillMat); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.21;
      const beamMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { col: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 col; varying float vY; void main(){ float t = clamp(vY / 80.0, 0.0, 1.0); gl_FragColor = vec4(col, (1.0 - t) * (1.0 - t) * 0.22); }',
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 80, 12, 1, true), beamMat); beam.position.y = 40;
      const waveMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 64), waveMat); wave.rotation.x = -Math.PI / 2; wave.position.y = 0.3; wave.visible = false;
      grp.add(pole, flag, ring, fill, beam, wave);
      scene.add(grp);
      this.items.push({ grp, flag, flagMat, ringMat, fillMat, fill, beamMat, wave, waveMat, waveT: 9, fy: 6.4, base: flagGeo.attributes.position.array.slice() });
    }
  }
  // 점령 순간: 바닥에서 퍼지는 충격파
  pulse(i, color) { const it = this.items[i]; it.waveT = 0; it.waveMat.color.copy(color); it.wave.visible = true; }
  update(time, dt = 0.016) {
    for (let i = 0; i < NPOINTS; i++) {
      const p = this.sim.pts[i], it = this.items[i];
      // 깃발 높이: 점령 진행도에 따라 올라가고 내려간다(점령되면 꼭대기)
      const frac = p.owner >= 0 ? 1 : Math.abs(p.cap), ty = 1.7 + 4.7 * frac;
      it.fy += (ty - it.fy) * Math.min(1, dt * 4); it.flag.position.y = it.fy;
      if (it.waveT < 1.2) { it.waveT += dt; const t = it.waveT / 1.2; it.wave.scale.setScalar(POINT_R * (0.15 + t * 1.5)); it.waveMat.opacity = Math.max(0, 0.9 * (1 - t)); if (it.waveT >= 1.2) it.wave.visible = false; }
      const oc = p.owner === 0 ? COL_A : p.owner === 1 ? COL_B : COL_N;
      const lead = p.cap > 0 ? COL_A : COL_B;
      it.flagMat.color.copy(oc); it.ringMat.color.copy(oc); it.beamMat.uniforms.col.value.copy(oc);
      const filled = p.owner !== (p.cap > 0 ? 0 : 1) ? Math.abs(p.cap) : 0;
      it.fillMat.color.copy(lead); it.fill.scale.setScalar(Math.max(0.001, filled));
      it.ringMat.opacity = p.nA > 0 && p.nB > 0 ? 0.5 + 0.4 * Math.sin(time * 8) : 0.85;
      const pos = it.flag.geometry.attributes.position, b = it.base;
      for (let k = 0; k < pos.count; k++) {
        const x = b[k * 3];
        pos.setZ(k, Math.sin(time * 3 - x * 2.2) * 0.12 * (x / 2.6) + Math.sin(time * 5.3 - x * 3.1) * 0.04 * (x / 2.6));
      }
      pos.needsUpdate = true;
    }
  }
}
