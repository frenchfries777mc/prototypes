// 병사 모델, 1인칭 무기, 거점 깃발·구역·빛기둥. 전부 코드로 만든 형상이라 이미지가 필요 없다.
import * as THREE from 'three';
import { NPOINTS, POINT_R } from './world.js';
import { clothTexture, toonGradient } from './gfx.js';

export const COL_A = new THREE.Color(0.33, 0.56, 1.0), COL_B = new THREE.Color(1.0, 0.78, 0.24), COL_N = new THREE.Color(0.75, 0.75, 0.75);
const std = (c, r = 0.9, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

const TEAM = [
  { coat: 0x3a62b8, pants: 0x2a3f7a, helmet: 0x5a78c0, band: 0xbcd0ff },
  { coat: 0xb8923a, pants: 0x7a5a28, helmet: 0xc9a850, band: 0xfff0b0 },
];
const tn = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
const mats = TEAM.map((t) => ({ coat: tn(t.coat), pants: tn(t.pants), helmet: tn(t.helmet), band: new THREE.MeshBasicMaterial({ color: t.band }) }));
const skinT = tn(0xe0ac80), inkMat = new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide });
const skin = std(0xd9a77e, 1), gunMat = std(0x3a2e22, 0.6, 0.1), metal = std(0x6a7078, 0.45, 0.3);

export function makeSoldier(team) {
  const M = mats[team];
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const dark = tn(0x2a2622), eye = new THREE.MeshBasicMaterial({ color: 0x16120e });
  // 몸통·머리·철모: 전부 상자
  body.add(box(0.52, 0.66, 0.28, M.coat, 0, 1.12, 0), box(0.54, 0.1, 0.3, tn(0x5a4026), 0, 0.84, 0), box(0.3, 0.12, 0.03, M.band, 0, 1.32, -0.15));
  const head = box(0.32, 0.32, 0.32, skinT, 0, 1.62, 0); body.add(head);
  body.add(box(0.07, 0.07, 0.02, eye, -0.08, 1.64, -0.165), box(0.07, 0.07, 0.02, eye, 0.08, 1.64, -0.165));
  body.add(box(0.36, 0.14, 0.36, M.helmet, 0, 1.82, 0), box(0.4, 0.04, 0.4, M.helmet, 0, 1.75, 0), box(0.12, 0.04, 0.1, M.band, 0, 1.87, -0.19));
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.13, 0.82, 0); legR.position.set(0.13, 0.82, 0);
  for (const l of [legL, legR]) l.add(box(0.22, 0.58, 0.24, M.pants, 0, -0.29, 0), box(0.23, 0.24, 0.25, dark, 0, -0.7, -0.01));
  g.add(legL, legR);
  // 팔: 총을 앞으로 겨눈 모양
  const arms = new THREE.Group(); arms.position.set(0, 1.38, 0); body.add(arms);
  arms.add(box(0.16, 0.16, 0.5, M.coat, -0.22, -0.06, -0.22), box(0.16, 0.16, 0.46, M.coat, 0.2, -0.1, -0.32), box(0.15, 0.15, 0.12, skinT, -0.22, -0.06, -0.52), box(0.15, 0.15, 0.12, skinT, 0.2, -0.1, -0.58));
  const gun = new THREE.Group(); gun.position.set(0.0, -0.08, -0.36); arms.add(gun);
  gun.add(box(0.07, 0.09, 0.7, tn(0x4a3a2a), 0, 0, 0), box(0.04, 0.04, 0.5, tn(0x6a7078), 0, 0.01, -0.55));
  const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    o.castShadow = true;
    if (o.material === eye || o.material === M.band) continue;
    const ol = new THREE.Mesh(o.geometry, inkMat); ol.scale.setScalar(1.09); o.add(ol);   // 뒤집은 껍데기 윤곽선
  }
  g.userData = { body, legL, legR, arms };
  return g;
}

export class UnitViews {
  constructor(scene, sim) {
    this.sim = sim; this.group = new THREE.Group(); scene.add(this.group);
    this.views = sim.units.map((u) => { const v = makeSoldier(u.team); v.visible = false; this.group.add(v); return v; });
  }
  update(dt, localId, thirdPerson = false) {
    for (const u of this.sim.units) {
      const v = this.views[u.id], ud = v.userData;
      const hide = (u.id === localId && u.alive && !thirdPerson) || (!u.alive && u.deathAge > 8);
      v.visible = !hide;
      if (hide) continue;
      v.position.set(u.x, u.y, u.z);
      v.rotation.y = u.yaw;
      if (u.alive) {
        const sp = Math.min(u.speedNow / 4.8, 1.3), ph = u.walkDist * 2.1;
        ud.legL.rotation.x = Math.sin(ph) * 0.85 * sp; ud.legR.rotation.x = -Math.sin(ph) * 0.85 * sp;
        ud.body.position.y = Math.abs(Math.sin(ph)) * 0.04 * sp;
        ud.arms.rotation.x = u.pitch * 0.9;
        ud.body.rotation.x = 0; v.rotation.x = 0; v.position.y = u.y;
      } else {
        const f = Math.min(u.deathAge * 3.2, 1);
        v.rotation.x = -Math.PI / 2 * f; v.position.y = u.y + 0.18 * f;
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
    this.sim = sim; this.items = [];
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
      grp.add(pole, flag, ring, fill, beam);
      scene.add(grp);
      this.items.push({ grp, flag, flagMat, ringMat, fillMat, fill, beamMat, base: flagGeo.attributes.position.array.slice() });
    }
  }
  update(time) {
    for (let i = 0; i < NPOINTS; i++) {
      const p = this.sim.pts[i], it = this.items[i];
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
