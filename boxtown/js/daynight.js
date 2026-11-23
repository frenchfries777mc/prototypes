// 낮과 밤. 하루는 16분. 해의 방향·밝기·색, 하늘과 안개 색을 시간에 따라 바꾸고, 밤에는 건물에 불빛이 돌고 탈것과 손전등이 켜진다.
const B = window.BABYLON;
const DAY = 16 * 60;
const C = (h) => B.Color3.FromHexString(h);
const mix = (a, b, t) => new B.Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const K = { zenD: C('#3f8fe8'), horD: C('#cfeaf7'), fogD: C('#c3e2f2'), zenN: C('#070d24'), horN: C('#1b2a52'), fogN: C('#131d3a'), zenS: C('#3b5fae'), horS: C('#ffb37a'), fogS: C('#e8b9a0'),
  sunD: C('#fff1d6'), sunS: C('#ffb27a'), moon: C('#9fb6ff'), hemiD: C('#eaf3ff'), hemiN: C('#56689c'), gndD: C('#8c9bb3'), gndN: C('#1c2440') };

export class DayNight {
  constructor({ scene, env, sun, hemi, player }) {
    Object.assign(this, { scene, env, sun, hemi, player });
    this.t = 0.36; this.night = 0; // 0 자정, 0.25 해돋이, 0.5 한낮, 0.75 해넘이
    this.sky = scene.getMaterialByName('skyMat');
    this.water = scene.materials.find((m) => m.getClassName() === 'ShaderMaterial' && m !== this.sky) || null;
    // 밤에 켜지는 불: 탈것 전조등 하나, 손전등 하나
    this.head = new B.SpotLight('headlight', new B.Vector3(0, -100, 0), new B.Vector3(0, -0.2, 1), 1.1, 6, scene);
    this.head.diffuse = C('#fff2c8'); this.head.specular = B.Color3.Black(); this.head.range = 60; this.head.intensity = 0;
    this.torch = new B.PointLight('torch', new B.Vector3(0, -100, 0), scene);
    this.torch.diffuse = C('#ffe6b0'); this.torch.specular = B.Color3.Black(); this.torch.range = 16; this.torch.intensity = 0;
    this.glow = []; this.glowT = 0;
    this.el = document.getElementById('clock');
  }
  // 건물 색 지도를 스스로도 빛나게 해 두면, 밤에 세기만 올려 창과 간판에 불이 들어온 것처럼 보인다.
  collectGlow() { this.glow = this.scene.materials.filter((m) => m.diffuseTexture && m.getClassName() === 'StandardMaterial' && !m.emissiveTexture && /colormap|kit|tex/i.test(m.name + (m.diffuseTexture.name || ''))); for (const m of this.glow) { m.emissiveTexture = m.diffuseTexture; m.emissiveColor = B.Color3.Black(); } }
  get clock() { const m = Math.floor(this.t * 24 * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor((m % 60) / 10) * 10).padStart(2, '0')}`; }
  update(dt) {
    this.t = (this.t + dt / DAY) % 1;
    const ang = (this.t - 0.25) * Math.PI * 2, elev = Math.sin(ang); // 해의 높이(-1~1)
    const night = 1 - ss(-0.12, 0.16, elev), dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (1 - night * 0.6);
    this.night = night;
    // 해가 진 뒤에는 달이 반대편에서 비춘다(그림자가 사라지지 않게).
    const up = elev >= -0.02;
    const sx = Math.cos(ang) * 0.75, sy = Math.max(0.16, Math.abs(elev)) , sz = -0.5;
    const dir = new B.Vector3(up ? sx : -sx, sy, sz).normalize();
    this.env.sunDir.copyFrom(dir);
    this.sun.direction.copyFrom(dir.scale(-1));
    this.sun.intensity = 0.92 * (1 - night) + 0.2 * night;
    this.sun.diffuse = mix(mix(K.sunD, K.sunS, dusk), K.moon, night);
    this.hemi.intensity = 0.62 * (1 - night) + 0.3 * night;
    this.hemi.diffuse = mix(K.hemiD, K.hemiN, night); this.hemi.groundColor = mix(K.gndD, K.gndN, night);
    const zen = mix(mix(K.zenD, K.zenS, dusk), K.zenN, night), hor = mix(mix(K.horD, K.horS, dusk), K.horN, night), fog = mix(mix(K.fogD, K.fogS, dusk * 0.7), K.fogN, night);
    this.env.zenith.copyFrom(zen); this.env.horizon.copyFrom(hor); this.env.fog.copyFrom(fog);
    this.scene.fogColor = fog; this.scene.clearColor.set(fog.r, fog.g, fog.b, 1);
    if (this.sky) { this.sky.setColor3('zenith', zen); this.sky.setColor3('horizon', hor); this.sky.setVector3('sunDir', dir); }
    if (this.water) { this.water.setVector3('sunDir', dir); this.water.setColor3('horizon', hor); this.water.setColor3('fogColor', fog); }
    // 불빛
    this.glowT -= dt;
    if (this.glowT <= 0) { this.glowT = 0.5; if (!this.glow.length) this.collectGlow(); const g = night * 0.34; for (const m of this.glow) m.emissiveColor.set(g, g * 0.92, g * 0.72); }
    const P = this.player, car = P.vehicle;
    if (car && !P.inside) {
      this.head.intensity = night * 2.4; this.torch.intensity = 0;
      this.head.position.set(car.pos.x + car.fwd.x * 1.2, car.pos.y + 1.3, car.pos.z + car.fwd.z * 1.2);
      this.head.direction.set(car.fwd.x, -0.16, car.fwd.z);
    } else { this.head.intensity = 0; this.torch.intensity = P.inside ? 0 : night * 0.9; this.torch.position.set(P.feet.x, P.feet.y + 2.2, P.feet.z); }
    if (this.el) { const txt = (night > 0.5 ? '🌙 ' : '☀️ ') + this.clock; if (txt !== this.shown) { this.shown = txt; this.el.textContent = txt; } }
  }
}
