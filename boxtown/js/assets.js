// 에셋 팩(GLB) 불러오기와 배치.
// 모델 하나당 "틀" 메시 하나를 만들고, 같은 모델은 전부 인스턴싱으로 한 번에 그린다.
import { WORLD } from './world.js';
const B = window.BABYLON;
const REGION = WORLD.cell * WORLD.chunk; // 192m

// 팩마다 단위가 달라서 미터 기준으로 맞추는 배율.
// tex: 팩 공용 팔레트 텍스처(colormap.png)를 쓰는지, 아니면 재질 색을 정점 색으로 굽는지.
export const KITS = {
  roads: { scale: 12, tex: true },
  commercial: { scale: 12, tex: true },
  suburban: { scale: 12, tex: true },
  industrial: { scale: 12, tex: true },
  cars: { scale: 1.55, tex: true },
  pirate: { scale: 1.0, tex: true },
  watercraft: { scale: 1.7, tex: true },
  nature: { scale: 6, tex: false },
};

// 바닥에 붙은 타일과 작은 풀은 그림자를 드리우지 않는다(그려야 할 양이 크게 준다).
const NO_SHADOW = /roads\/(road-|tile-)|nature\/(grass|flower|plant|crop|ground|path)/;

// 팩의 원래 색을 섬 분위기에 맞게 살짝 옮긴다: 청록에 가까운 잎은 풀색 쪽으로, 푸르스름한 돌은 따뜻한 회색으로.
function tune(kit, name, c) {
  if (kit !== 'nature') return c;
  let { r, g, b } = c;
  if (name.startsWith('stone') || name.startsWith('rock')) return new B.Color3(r * 0.74, g * 0.7, b * 0.68);
  if (g > r * 1.15 && g > b * 1.05) return new B.Color3(Math.min(1, r * 1.9 + 0.06), g * 0.93, b * 0.5);
  if (g > r * 1.3 && b > r * 1.3) return new B.Color3(r * 1.5 + 0.05, g * 0.8, b * 0.42); // 짙은 청록(침엽수) -> 짙은 초록
  return c;
}

export class Assets {
  constructor(scene, base = 'assets/') {
    this.scene = scene;
    this.base = base;
    this.templates = new Map(); // "kit/name" -> 틀 메시
    this.mats = {};
    this.shadowCasters = [];
    this.pending = new Map(); // 틀 -> 행렬 배열 (thin instance)
    this.carTemplates = new Map();
    this.groups = []; // 구역별 묶음
  }

  mat(kit) {
    if (this.mats[kit]) return this.mats[kit];
    const m = new B.StandardMaterial('kit_' + kit, this.scene);
    m.specularColor = new B.Color3(0.03, 0.03, 0.03);
    if (KITS[kit].tex) {
      const t = new B.Texture(`${this.base}${kit}/Textures/colormap.png`, this.scene, false, false);
      t.anisotropicFilteringLevel = 4;
      m.diffuseTexture = t;
    }
    // 그늘진 면이 너무 죽지 않게 살짝 띄운다.
    m.ambientColor = new B.Color3(1, 1, 1);
    return (this.mats[kit] = m);
  }

  async load(keys, onProgress) {
    const uniq = [...new Set(keys)].filter((k) => !this.templates.has(k));
    let done = 0;
    const queue = uniq.slice();
    const worker = async () => {
      while (queue.length) {
        const key = queue.shift();
        try {
          await this._loadOne(key);
        } catch (e) {
          console.error('에셋을 불러오지 못했습니다:', key, e.message || e);
        }
        done++;
        if (onProgress) onProgress(done / uniq.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  // GLB 하나를 읽어 부품별로 "월드 변환을 구운" 독립 메시 목록을 만든다.
  async _extract(key) {
    const [kit, name] = key.split('/');
    const cfg = KITS[kit];
    const c = await B.SceneLoader.LoadAssetContainerAsync(`${this.base}${kit}/`, `${name}.glb`, this.scene);
    const raw = c.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0);
    const S = B.Matrix.Scaling(cfg.scale, cfg.scale, cfg.scale);
    // 1단계: 변환을 먼저 전부 구해 둔다. 같은 부품을 여러 번 쓰는 모델(인스턴스)은
    // 부품마다 독립된 지오메트리로 풀어야 변환이 겹쳐 적용되지 않는다.
    const items = raw.map((m) => {
      m.computeWorldMatrix(true);
      const w = m.getWorldMatrix().multiply(S);
      const src = m.sourceMesh || m;
      const mesh = src.clone(m.name + '_part', null, true);
      mesh.makeGeometryUnique();
      mesh.material = src.material;
      // 바퀴처럼 따로 움직일 부품인지 알 수 있도록, 이름이 붙은 조상 노드를 찾아 둔다.
      let group = null;
      for (let n = m; n; n = n.parent) if (/^wheel-(front|back)-(left|right)/.test(n.name)) { group = n; break; }
      let pivot = null;
      if (group) { group.computeWorldMatrix(true); pivot = B.Vector3.TransformCoordinates(B.Vector3.Zero(), group.getWorldMatrix().multiply(S)); }
      return { mesh, w, group: group ? group.name : null, pivot };
    });
    for (const it of items) {
      const m = it.mesh;
      if (!cfg.tex) {
        // 재질 색 -> 정점 색. 팩 전체가 재질 하나를 공유하게 된다.
        const col = (m.material && (m.material.albedoColor || m.material.diffuseColor)) || B.Color3.White();
        const g = tune(kit, name, col);
        const n = m.getTotalVertices();
        const arr = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) arr.set([g.r, g.g, g.b, 1], i * 4);
        m.setVerticesData(B.VertexBuffer.ColorKind, arr);
      }
      for (const kind of [B.VertexBuffer.TangentKind, B.VertexBuffer.UV2Kind]) {
        if (m.isVerticesDataPresent(kind)) m.removeVerticesData(kind);
      }
      if (cfg.tex && m.isVerticesDataPresent(B.VertexBuffer.ColorKind)) m.removeVerticesData(B.VertexBuffer.ColorKind);
      m.parent = null;
      m.rotationQuaternion = null;
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.scaling.set(1, 1, 1);
      m.material = null;
    }
    const finish = (parts, label) => {
      const merged = B.Mesh.MergeMeshes(parts, false, true, undefined, false, false); // 새 지오메트리를 만들어 컨테이너와 분리한다
      merged.name = label;
      merged.material = this.mat(kit);
      merged.useVertexColors = !cfg.tex;
      merged.isPickable = false;
      merged.receiveShadows = true;
      merged.setEnabled(false);
      merged.refreshBoundingInfo();
      return merged;
    };
    const cleanup = () => { items.forEach((it) => it.mesh.dispose()); c.dispose(); };
    return { items, finish, cleanup };
  }

  async _loadOne(key) {
    const { items, finish, cleanup } = await this._extract(key);
    for (const it of items) it.mesh.bakeTransformIntoVertices(it.w);
    this.templates.set(key, finish(items.map((it) => it.mesh), key));
    cleanup();
  }

  // 자동차: 차체와 바퀴 네 개를 따로 움직일 수 있게 나눠서 불러온다.
  async loadCar(key) {
    if (this.carTemplates.has(key)) return;
    const { items, finish, cleanup } = await this._extract(key);
    const groups = new Map();
    for (const it of items) {
      // 바퀴는 자기 중심이 원점이 되도록 굽는다.
      const w = it.pivot ? it.w.multiply(B.Matrix.Translation(-it.pivot.x, -it.pivot.y, -it.pivot.z)) : it.w;
      it.mesh.bakeTransformIntoVertices(w);
      const g = it.group || 'body';
      if (!groups.has(g)) groups.set(g, { parts: [], pivot: it.pivot });
      groups.get(g).parts.push(it.mesh);
    }
    const out = { body: null, wheels: [] };
    for (const [g, v] of groups) {
      const mesh = finish(v.parts, key + ':' + g);
      if (g === 'body') out.body = mesh;
      else out.wheels.push({ mesh, pos: v.pivot.clone() });
    }
    this.carTemplates.set(key, out);
    cleanup();
  }

  spawnCar(key) {
    const t = this.carTemplates.get(key);
    if (!t) throw new Error('불러오지 않은 자동차: ' + key);
    const dup = (m) => { const c = m.clone(m.name + '_car'); c.setEnabled(true); this.shadowCasters.push(c); return c; };
    const bb = t.body.getBoundingInfo().boundingBox;
    return { body: dup(t.body), wheels: t.wheels.map((w) => ({ mesh: dup(w.mesh), pos: w.pos.clone() })), min: bb.minimum.clone(), max: bb.maximum.clone() };
  }

  tpl(key) {
    const t = this.templates.get(key);
    if (!t) throw new Error('불러오지 않은 에셋: ' + key);
    return t;
  }

  // 모델의 크기(배율 적용 후). 충돌 상자를 만들 때 쓴다.
  bounds(key) {
    const bb = this.tpl(key).getBoundingInfo().boundingBox;
    return { min: bb.minimum.clone(), max: bb.maximum.clone() };
  }

  // 고정 배치. 실제 그리기는 flush()에서 "모델 × 구역"별로 한꺼번에 등록된다.
  // 구역(192m)으로 나눠 두면 화면 밖이거나 먼 구역은 통째로 건너뛸 수 있다.
  place(key, x, y, z, rotY = 0, scale = 1) {
    this.tpl(key);
    const s = typeof scale === 'number' ? new B.Vector3(scale, scale, scale) : scale;
    const m = B.Matrix.Compose(s, B.Quaternion.RotationYawPitchRoll(rotY, 0, 0), new B.Vector3(x, y, z));
    const ix = Math.floor((x - WORLD.x0) / REGION), iz = Math.floor((z - WORLD.z0) / REGION);
    const id = `${key}#${ix},${iz}`;
    if (!this.pending.has(id)) this.pending.set(id, { key, ix, iz, mats: [] });
    this.pending.get(id).mats.push(m);
    return m;
  }

  flush() {
    for (const [id, g] of this.pending) {
      const buf = new Float32Array(g.mats.length * 16);
      g.mats.forEach((m, i) => m.copyToArray(buf, i * 16));
      const mesh = this.tpl(g.key).clone(id);
      // 배치 행렬 버퍼는 지오메트리에 붙기 때문에, 구역마다 지오메트리를 따로 가져야 서로 덮어쓰지 않는다.
      mesh.makeGeometryUnique();
      mesh.setEnabled(true);
      mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
      mesh.thinInstanceRefreshBoundingInfo(false);
      mesh.freezeWorldMatrix();
      mesh.isPickable = false;
      const small = NO_SHADOW.test(g.key);
      const range = /nature\/(grass|flower|plant|crop)/.test(g.key) ? 160 : g.key.startsWith('nature/') || g.key.startsWith('roads/light') ? 620 : 1300;
      this.groups.push({ mesh, x: WORLD.x0 + (g.ix + 0.5) * REGION, z: WORLD.z0 + (g.iz + 0.5) * REGION, range, shadow: !small, on: true, lit: false });
    }
    this.pending.clear();
  }

  // 직접 만든 메시(합친 상자 등)도 같은 방식으로 거리에 따라 켜고 끈다.
  addGroup(mesh, x, z, range, shadow) { this.groups.push({ mesh, x, z, range, shadow, on: true, lit: false }); }

  // 카메라에서 먼 구역은 끄고, 그림자는 가까운 구역만 드리운다. 가끔(0.3초마다) 부르면 된다.
  cull(cam, shadowList, fixed) {
    let changed = false;
    for (const g of this.groups) {
      const d = Math.hypot(g.x - cam.x, g.z - cam.z) - REGION * 0.71;
      const on = d < g.range;
      if (on !== g.on) { g.on = on; g.mesh.setEnabled(on); }
      const lit = g.shadow && d < (this.shadowRange || 185);
      if (lit !== g.lit) { g.lit = lit; changed = true; }
    }
    if (changed || !shadowList.length) {
      shadowList.length = 0;
      for (const m of fixed) shadowList.push(m);
      for (const g of this.groups) if (g.lit) shadowList.push(g.mesh);
    }
  }

  // 움직이는 물체용: 틀을 복제한 독립 메시를 돌려준다(지오메트리는 공유).
  spawn(key, name, shadow = true) {
    const t = this.tpl(key);
    const m = t.clone(name || key + '_obj');
    m.setEnabled(true);
    if (shadow) this.shadowCasters.push(m);
    return m;
  }
}
