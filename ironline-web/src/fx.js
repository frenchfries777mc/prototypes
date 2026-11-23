// 효과: 탄도 궤적, 총구 섬광, 피격·먼지·불꽃 입자, 연기 기둥과 불. 입자는 한 덩어리 Points 로 그린다.
import * as THREE from 'three';

const MAXP = 1400;

export class Fx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.p = []; this.free = [];
    for (let i = MAXP - 1; i >= 0; i--) this.free.push(i);
    this.pos = new Float32Array(MAXP * 3); this.col = new Float32Array(MAXP * 4); this.size = new Float32Array(MAXP);
    this.vel = new Float32Array(MAXP * 3); this.life = new Float32Array(MAXP); this.max = new Float32Array(MAXP);
    this.grav = new Float32Array(MAXP); this.drag = new Float32Array(MAXP); this.grow = new Float32Array(MAXP); this.base = new Float32Array(MAXP);
    this.alive = new Uint8Array(MAXP); this.add = new Uint8Array(MAXP);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 500 };
    const mk = (additive) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
      uniforms: { uScale: this.uScale },
      vertexShader: 'attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }',
    });
    // 일반 혼합과 가산 혼합을 따로 그린다(같은 버퍼를 나눠 쓰는 대신 두 개의 Points 로 나눈다)
    this.geoN = geo; this.geoA = geo.clone();
    this.ptsN = new THREE.Points(this.geoN, mk(false)); this.ptsA = new THREE.Points(this.geoA, mk(true));
    this.ptsN.frustumCulled = this.ptsA.frustumCulled = false;
    scene.add(this.ptsN, this.ptsA);
    // 탄도 궤적 풀
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(0.012, 0.012, 1, 5); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, t: 0 });
    }
    this.emitters = [];
    this.clock = 0;
  }
  setScale(h, fovDeg) { this.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)); }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, { grav = 0, drag = 0, grow = 0, additive = false } = {}) {
    const i = this.free.pop();
    if (i === undefined) return;
    this.alive[i] = 1; this.add[i] = additive ? 1 : 0;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b, a], i * 4); this.size[i] = size; this.base[i] = size; this.grow[i] = grow;
    this.life[i] = 0; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }
  burst(kind, x, y, z, nx = 0, ny = 1, nz = 0) {
    const R = Math.random;
    if (kind === 'blood') for (let k = 0; k < 9; k++) this.emit(x, y, z, (R() - 0.5) * 3 + nx, R() * 2 + 0.5, (R() - 0.5) * 3 + nz, 0.55, 0.07, 0.62, 0.04, 0.04, 0.9, { grav: 9, drag: 1.5 });
    else if (kind === 'dust') {
      for (let k = 0; k < 8; k++) this.emit(x, y, z, (R() - 0.5) * 2.2, R() * 2.2, (R() - 0.5) * 2.2, 0.9, 0.22, 0.62, 0.52, 0.4, 0.55, { grav: -0.4, drag: 2.2, grow: 0.5 });
    } else if (kind === 'wall') {
      for (let k = 0; k < 6; k++) this.emit(x, y, z, (R() - 0.5) * 3 + nx * 2, R() * 3, (R() - 0.5) * 3 + nz * 2, 0.5, 0.05, 1, 0.85, 0.5, 1, { grav: 12, additive: true });
      for (let k = 0; k < 4; k++) this.emit(x, y, z, (R() - 0.5) * 1.6, R() * 1.4, (R() - 0.5) * 1.6, 0.8, 0.2, 0.55, 0.5, 0.45, 0.45, { drag: 2.2, grow: 0.5 });
    }
  }
  muzzle(x, y, z, big = 1) {
    for (let k = 0; k < 3; k++) this.emit(x, y, z, 0, 0, 0, 0.05, (0.28 + k * 0.1) * big, 1, 0.8, 0.45, 0.9, { additive: true });
    for (let k = 0; k < 2; k++) this.emit(x, y, z, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.35, 0.18, 0.6, 0.6, 0.6, 0.35, { drag: 3, grow: 0.8 });
  }
  tracer(a, b) {
    const t = this.tracers.find((x) => x.t <= 0) || this.tracers[0];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    t.m.position.set(a.x, a.y, a.z); t.m.lookAt(b.x, b.y, b.z);
    t.m.scale.set(1, 1, len); t.m.material.opacity = 0.9; t.m.visible = true; t.t = 0.07;
  }
  // 불·연기 기둥(위치 고정). fire: 불꽃+연기, smoke: 연기만
  emitter(kind, x, y, z, size = 1) { this.emitters.push({ kind, x, y, z, size, acc: Math.random() }); }

  update(dt) {
    this.clock += dt;
    for (const e of this.emitters) {
      e.acc += dt * (e.kind === 'fire' ? 22 : 9);
      while (e.acc > 1) {
        e.acc -= 1;
        const R = Math.random, s = e.size;
        if (e.kind === 'fire' && R() < 0.8) this.emit(e.x + (R() - 0.5) * 0.5 * s, e.y, e.z + (R() - 0.5) * 0.5 * s, (R() - 0.5) * 0.4, 1.4 + R() * 1.2, (R() - 0.5) * 0.4, 0.7, 0.55 * s, 1, 0.55 + R() * 0.2, 0.15, 0.7, { additive: true, grow: -0.5 });
        else this.emit(e.x + (R() - 0.5) * 0.6, e.y + 1.0 * s, e.z + (R() - 0.5) * 0.6, 0.5 + R() * 0.3, 1.6 + R(), (R() - 0.5) * 0.3, 5.5, 0.9 * s, 0.2, 0.19, 0.18, 0.4, { grow: 2.4, drag: 0.1 });
      }
    }
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / 0.07) * 0.9; if (t.t <= 0) t.m.visible = false; }
    const cam = this.camera.position;
    for (let i = 0; i < MAXP; i++) {
      if (!this.alive[i]) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] += dt;
      const t = this.life[i] / this.max[i];
      if (t >= 1) { this.alive[i] = 0; this.col[i * 4 + 3] = 0; this.free.push(i); continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0.01, this.base[i] * (1 + this.grow[i] * t));
      const a0 = this.col[i * 4 + 3];
      void a0;
    }
    this.syncBuffers();
    void cam;
  }
  // 일반/가산 두 Points 에 각각 해당하는 입자만 보이게 알파를 나눠 쓴다.
  syncBuffers() {
    const cn = this.geoN.attributes.aCol.array, ca = this.geoA.attributes.aCol.array;
    for (let i = 0; i < MAXP; i++) {
      const t = this.alive[i] ? this.life[i] / this.max[i] : 1;
      const fade = this.alive[i] ? Math.min(1, (1 - t) * 3) * Math.min(1, t * 20 + 0.2) : 0;
      const a = this.col[i * 4 + 3] * fade;
      for (let c = 0; c < 3; c++) { cn[i * 4 + c] = ca[i * 4 + c] = this.col[i * 4 + c]; }
      cn[i * 4 + 3] = this.add[i] ? 0 : a; ca[i * 4 + 3] = this.add[i] ? a : 0;
    }
    for (const g of [this.geoN, this.geoA]) {
      g.attributes.position.array.set(this.pos); g.attributes.position.needsUpdate = true;
      g.attributes.aSize.array.set(this.size); g.attributes.aSize.needsUpdate = true;
      g.attributes.aCol.needsUpdate = true;
    }
  }
}
