// 직업 건물. 에셋 팩에 없는 가게들이라 상자를 쌓아 직접 짓는다.
// 건물마다 색, 차양, 간판 글씨, 지붕 위 상징물이 달라서 멀리서도 무슨 가게인지 알 수 있다.
import { CELL, JOB_SITES } from './mapdata.js';
import { flatMat } from './util.js';
const B = window.BABYLON;

const FACE = { S: 0, W: Math.PI / 2, N: Math.PI, E: (3 * Math.PI) / 2 };

// h: { scene, box, addBox, casters, groundY, updaters }
export function buildJobSites(h) {
  const { scene } = h;
  const mats = new Map();
  const mat = (hex, opts) => {
    const k = hex + JSON.stringify(opts || {});
    if (!mats.has(k)) mats.set(k, flatMat('job_' + k, hex, scene, opts));
    return mats.get(k);
  };
  const glass = mat('#7fc4f0', { emissive: '#2a5f86' });
  const out = {};

  for (const site of JOB_SITES) {
    const ox = site.cx * CELL, oz = site.cz * CELL, yaw = FACE[site.f];
    const gy = h.groundY(ox, oz);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // 건물 기준 좌표(정면이 -Z) -> 월드 좌표
    const W = (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c];
    const put = (name, w, hh, d, lx, ly, lz, m, opts = {}) => {
      const [x, z] = W(lx, lz);
      return h.box(site.id + '_' + name, w, hh, d, x, gy + ly, z, m, { ...opts, yaw: yaw + (opts.yaw || 0) });
    };
    const sign = (text, w, hh, lx, ly, lz, bg, fg) => {
      const tex = new B.DynamicTexture('sign_' + site.id + text, { width: 1024, height: Math.round((1024 * hh) / w) }, scene, true);
      const ctx = tex.getContext(), H = tex.getSize().height;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, H);
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = H * 0.66;
      ctx.font = `900 ${size}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
      const tw = ctx.measureText(text).width;
      if (tw > 940) { size *= 940 / tw; ctx.font = `900 ${size}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`; }
      ctx.fillText(text, 512, H / 2 + size * 0.04);
      tex.update();
      const m = new B.StandardMaterial('signMat_' + site.id + text, scene);
      m.diffuseTexture = tex; m.emissiveTexture = tex; m.emissiveColor = new B.Color3(0.45, 0.45, 0.45); m.specularColor = B.Color3.Black();
      const p = B.MeshBuilder.CreatePlane('signPlane', { width: w, height: hh }, scene);
      const [x, z] = W(lx, lz);
      p.position.set(x, gy + ly, z); p.rotation.y = yaw; p.material = m; p.isPickable = false; p.freezeWorldMatrix();
      return p;
    };
    // 공통 뼈대: 몸통, 지붕 테두리, 문, 창, 줄무늬 차양, 간판
    const shop = (w, d, hh, wall, trim, awnA, awnB, title, signBg, signFg) => {
      put('body', w, hh, d, 0, hh / 2, 0, mat(wall), { collide: true });
      put('roof', w + 0.6, 0.5, d + 0.6, 0, hh + 0.25, 0, mat(trim));
      put('base', w + 0.2, 0.5, d + 0.2, 0, 0.25, 0, mat(trim));
      const fz = -d / 2;
      put('door', 1.5, 2.5, 0.2, w * 0.3, 1.25, fz - 0.06, mat('#5a4636'));
      put('doorGlass', 1.0, 1.2, 0.22, w * 0.3, 1.7, fz - 0.07, glass, { noShadow: true });
      put('window', w * 0.46, 2.0, 0.2, -w * 0.14, 1.9, fz - 0.06, glass, { noShadow: true });
      put('sill', w * 0.5, 0.2, 0.5, -w * 0.14, 0.85, fz - 0.2, mat(trim));
      const n = Math.max(4, Math.round(w / 1.6)), sw = (w * 0.94) / n;
      for (let i = 0; i < n; i++) put('awn' + i, sw, 0.22, 1.9, -w * 0.47 + sw * (i + 0.5), 3.25, fz - 0.9, mat(i % 2 ? awnA : awnB), { noShadow: i % 2 === 1 });
      put('awnBar', w * 0.96, 0.16, 0.16, 0, 3.05, fz - 1.8, mat(trim));
      put('signBack', w * 0.82, 1.5, 0.3, 0, hh - 1.05, fz - 0.16, mat(trim));
      sign(title, w * 0.78, 1.25, 0, hh - 1.05, fz - 0.33, signBg, signFg);
      return fz;
    };

    let front = 0;
    if (site.id === 'pizza') {
      front = shop(15, 9.5, 6.2, '#fbe9c6', '#c8442f', '#e5553f', '#fff7e6', '모서리 피자', '#c8442f', '#fff7e6');
      // 지붕 위의 커다란 피자 한 판
      const [x, z] = W(-3, 0.5);
      const crust = B.MeshBuilder.CreateCylinder('pizzaCrust', { diameter: 5.6, height: 0.5, tessellation: 8 }, scene);
      crust.material = mat('#e0a55a');
      const cheese = B.MeshBuilder.CreateCylinder('pizzaCheese', { diameter: 4.8, height: 0.56, tessellation: 8 }, scene);
      cheese.material = mat('#ffd35a');
      const pivot = new B.TransformNode('pizzaPivot', scene);
      pivot.position.set(x, gy + 6.2 + 3.6, z);
      pivot.rotation.set(Math.PI / 2 - 0.35, yaw, 0);
      crust.parent = cheese.parent = pivot;
      for (let i = 0; i < 6; i++) {
        const p = B.MeshBuilder.CreateBox('pepperoni', { width: 0.8, height: 0.66, depth: 0.8 }, scene);
        p.material = mat('#c8442f'); p.parent = pivot;
        p.position.set(Math.cos(i * 1.05 + 0.4) * 1.5, 0, Math.sin(i * 1.05 + 0.4) * 1.5);
        h.casters.push(p);
      }
      h.casters.push(crust, cheese);
      put('pizzaPole', 0.4, 1.4, 0.4, -3, 6.9, 0.5, mat('#c8442f'));
      h.updaters.push((dt) => { pivot.rotation.y += dt * 0.5; });
      put('chimney', 1.2, 2.2, 1.2, 5, 7.3, 2.5, mat('#b9654a'));
      put('counter', 3.2, 1.0, 0.9, -4.6, 0.5, -6.3, mat('#c8442f'), { collide: true });
      put('counterTop', 3.5, 0.14, 1.2, -4.6, 1.07, -6.3, mat('#fff7e6'));
    } else if (site.id === 'fire') {
      const w = 20, d = 10, hh = 7;
      put('body', w, hh, d, 0, hh / 2, 0, mat('#d9473c'), { collide: true });
      put('roof', w + 0.6, 0.5, d + 0.6, 0, hh + 0.25, 0, mat('#f4f1ea'));
      put('base', w + 0.2, 0.6, d + 0.2, 0, 0.3, 0, mat('#8f95a8'));
      front = -d / 2;
      for (const lx of [-5.6, 0.4]) {
        put('gate', 5, 4.4, 0.24, lx, 2.2, front - 0.06, mat('#f4f1ea'));
        for (let i = 0; i < 4; i++) put('gateLine', 5, 0.12, 0.28, lx, 0.9 + i * 1.0, front - 0.08, mat('#b9bfd0'), { noShadow: true });
        put('gateWin', 3.6, 0.7, 0.3, lx, 3.6, front - 0.09, glass, { noShadow: true });
      }
      put('door', 1.5, 2.5, 0.2, 7.2, 1.25, front - 0.06, mat('#f4f1ea'));
      put('signBack', 13, 1.5, 0.3, -2.6, 5.75, front - 0.16, mat('#f4f1ea'));
      sign('박스타운 소방서', 12.4, 1.25, -2.6, 5.75, front - 0.33, '#f4f1ea', '#d9473c');
      // 망루와 경광등
      put('tower', 3.2, 6, 3.2, 7.6, hh + 3, 2.6, mat('#d9473c'));
      put('towerTop', 3.8, 0.5, 3.8, 7.6, hh + 6.25, 2.6, mat('#f4f1ea'));
      put('towerWin', 2.2, 1.4, 0.2, 7.6, hh + 4.4, 0.95, glass, { noShadow: true });
      const lamp = put('siren', 1.1, 0.8, 1.1, 7.6, hh + 6.9, 2.6, mat('#ff5a4a', { emissive: '#ff2a1a' }), { noShadow: true, dynamic: true });
      let t = 0;
      h.updaters.push((dt) => { t += dt; lamp.scaling.setAll(1 + Math.sin(t * 6) * 0.12); });
    } else if (site.id === 'taxi') {
      front = shop(9.6, 9, 5.6, '#ffd84a', '#2c2c36', '#2c2c36', '#ffd84a', '네모 택시', '#2c2c36', '#ffd84a');
      for (let i = 0; i < 6; i++) put('check' + i, 1.6, 0.7, 0.2, -4.0 + i * 1.6, 4.05, front - 0.05, mat(i % 2 ? '#2c2c36' : '#fff7e6'), { noShadow: true });
      put('roofSign', 4.2, 1.6, 1.4, 0, 6.9, 0, mat('#ffd84a', { emissive: '#7a6410' }));
      put('roofSignBase', 4.8, 0.3, 1.8, 0, 6.0, 0, mat('#2c2c36'));
      sign('TAXI', 3.8, 1.3, 0, 6.9, -0.72, '#ffd84a', '#2c2c36');
    } else if (site.id === 'clean') {
      front = shop(9.6, 9, 5.6, '#bfe6c4', '#2f7d4f', '#3fa868', '#eaf7ec', '깨끗한 마을 청소소', '#2f7d4f', '#eaf7ec');
      for (const [lx, col] of [[-2.8, '#3fa868'], [0, '#4f9bea'], [2.8, '#f4c542']]) {
        put('bin', 1.9, 2.3, 1.9, lx, 5.6 + 0.5 + 1.15, 1, mat(col));
        put('binLid', 2.1, 0.3, 2.1, lx, 5.6 + 0.5 + 2.45, 1, mat('#2c2c36'));
      }
    } else if (site.id === 'fish') {
      const w = 6, d = 4.6, hh = 3.4;
      put('body', w, hh, d, 0, hh / 2, 0, mat('#6fb6d9'), { collide: true });
      for (let i = 0; i < 5; i++) put('plank' + i, w + 0.04, 0.08, d + 0.04, 0, 0.6 + i * 0.6, 0, mat('#5aa0c4'), { noShadow: true });
      put('roofA', w + 1, 0.4, d + 1.2, 0, hh + 0.2, 0, mat('#f4f1ea'));
      put('roofB', w - 0.6, 0.5, d - 0.4, 0, hh + 0.65, 0, mat('#e5553f'));
      front = -d / 2;
      put('hatch', 3.2, 1.3, 0.2, -0.8, 1.9, front - 0.05, mat('#2f4a5e'));
      put('shelf', 3.6, 0.16, 0.9, -0.8, 1.2, front - 0.4, mat('#b9814f'));
      put('door', 1.1, 2.2, 0.2, 2.1, 1.1, front - 0.05, mat('#b9814f'));
      sign('낚시 가게', 4.6, 0.9, 0, hh - 0.55, front - 0.12, '#f4f1ea', '#2f6f95');
      // 지붕 위 물고기
      put('fishBody', 3.2, 1.3, 0.7, -0.3, hh + 2.0, 0, mat('#ff9d4a'));
      put('fishTailA', 0.7, 1.0, 0.6, 1.6, hh + 2.0, 0, mat('#ff9d4a'));
      put('fishTailB', 0.6, 1.7, 0.5, 2.15, hh + 2.0, 0, mat('#f2644b'));
      put('fishEye', 0.3, 0.3, 0.8, -1.3, hh + 2.25, 0, mat('#22202b'));
      put('fishPole', 0.25, 1.0, 0.25, 0, hh + 1.2, 0, mat('#8b5d3a'));
    }
    // 가게 앞 시작 지점(기본은 정면에서 1.9m 앞)
    const [mx, mz] = W(site.mx || 0, front - (site.pad || 1.9));
    out[site.id] = { x: mx, z: mz, y: h.groundY(mx, mz), yaw, site, W };
  }
  return out;
}
