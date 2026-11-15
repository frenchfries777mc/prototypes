import * as THREE from 'three';
import { Biome, CHUNK, EntityKind, HEIGHT_UNIT, NodeType, hash2, tileKey, type World } from '@lw/shared';
import { disposeModel, makeMob, makePlayer, type Model } from './models';
import type { ClientState, RemoteEnt } from './state';

/** 월드 1단위(타일 한 칸)가 저해상도 버퍼에서 차지하는 픽셀 수. */
const PPU = 16;
const TARGET_HEIGHT = 270;
const VIEW_RADIUS = 3;
const MAX_INSTANCES = 8192;
const PITCH = Math.PI / 6; // sin 30° = 0.5 → 바닥 타일이 2:1 마름모로 보이는 고전 쿼터뷰 비율
const CAM_DIR = new THREE.Vector3(Math.cos(PITCH) * Math.SQRT1_2, Math.sin(PITCH), Math.cos(PITCH) * Math.SQRT1_2);
const LIGHT_DIR = new THREE.Vector3(-0.45, 1, 0.6).normalize();
const SHADOW_SIZE = 1024, SHADOW_EXTENT = 32;

const TOP = [0x3f86d8, 0xe4d294, 0x74b64e, 0x4f9641, 0x92959f, 0xf0f4f8];
const SIDE = [0x2f6fc0, 0xc4aa6c, 0x8c643c, 0x7d5934, 0x6c6f7a, 0x8d909b];

export const topY = (world: World, x: number, y: number) =>
  world.tileBiome(x, y) === Biome.Water ? 0.3 : world.tileH(x, y) * HEIGHT_UNIT;

const POST_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// 깊이의 라플라시안으로 외곽선을 찾는다. 직교 카메라에서는 평면 위의 깊이가 선형이라
// 평평한 바닥에서는 0이 되고, 물체의 윤곽과 지형의 단차에서만 값이 튄다.
const POST_FRAG = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float range;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(tColor, vUv);
  float d = texture2D(tDepth, vUv).r;
  float n = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).r + texture2D(tDepth, vUv - vec2(texel.x, 0.0)).r
          + texture2D(tDepth, vUv + vec2(0.0, texel.y)).r + texture2D(tDepth, vUv - vec2(0.0, texel.y)).r;
  float edge = smoothstep(0.35, 0.9, (n - 4.0 * d) * range);
  gl_FragColor = vec4(c.rgb * mix(1.0, 0.5, edge), 1.0);
  #include <colorspace_fragment>
}`;

interface View { model: Model; groundY: number; dieAt: number; phase: number; }

function snapToGrid(pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, step: number): [number, number] {
  const a = pos.dot(right), b = pos.dot(up);
  const da = Math.round(a / step) * step - a, db = Math.round(b / step) * step - b;
  pos.addScaledVector(right, da).addScaledVector(up, db);
  return [da, db];
}

export class Renderer {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
  private sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  private rt!: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.Camera();
  private postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tColor: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() }, range: { value: 199 } },
  });
  private terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private chunks = new Map<number, THREE.Mesh>();
  private views = new Map<number, View>();
  private dyingViews: View[] = [];
  private meView?: View;
  private trunks: THREE.InstancedMesh; private leavesA: THREE.InstancedMesh; private leavesB: THREE.InstancedMesh;
  private rocksA: THREE.InstancedMesh; private rocksB: THREE.InstancedMesh;
  private nodesDirty = true; private nodeVersion = -1;
  private w = 1; private h = 1; private scale = 3;
  private offX = 0; private offY = 0;
  private camRight = new THREE.Vector3(); private camUp = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private focusY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.BasicShadowMap; // 픽셀아트에는 뭉개지 않은 각진 그림자가 어울린다
    this.scene.background = new THREE.Color(0x2f6fc0);
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a5648, 1.25));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_EXTENT; sc.right = SHADOW_EXTENT; sc.top = SHADOW_EXTENT; sc.bottom = -SHADOW_EXTENT;
    sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0015; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    const inst = (color: number) => {
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color }), MAX_INSTANCES);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      this.scene.add(m);
      return m;
    };
    this.trunks = inst(0x7a5230); this.leavesA = inst(0xffffff); this.leavesB = inst(0xffffff);
    this.rocksA = inst(0xffffff); this.rocksB = inst(0xffffff);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.scale = Math.max(2, Math.round(innerHeight / TARGET_HEIGHT));
    // 카메라를 픽셀 격자에 맞춘 뒤 남는 소수점 이동을 캔버스 위치로 보정하므로 사방에 1픽셀씩 여유를 둔다.
    this.w = Math.ceil(innerWidth / this.scale) + 2;
    this.h = Math.ceil(innerHeight / this.scale) + 2;
    this.gl.setPixelRatio(1);
    this.gl.setSize(this.w, this.h, false);
    this.canvas.style.width = `${this.w * this.scale}px`;
    this.canvas.style.height = `${this.h * this.scale}px`;
    this.rt?.dispose();
    // 스텐실은 가려진 내 캐릭터의 실루엣을 그릴 때 쓴다(render() 참고).
    this.rt = new THREE.WebGLRenderTarget(this.w, this.h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, stencilBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(this.w, this.h, THREE.UnsignedInt248Type);
    this.rt.depthTexture.format = THREE.DepthStencilFormat;
    this.postMat.uniforms.tColor!.value = this.rt.texture;
    this.postMat.uniforms.tDepth!.value = this.rt.depthTexture;
    this.postMat.uniforms.texel!.value.set(1 / this.w, 1 / this.h);
    const c = this.camera;
    c.left = -this.w / (2 * PPU); c.right = this.w / (2 * PPU);
    c.top = this.h / (2 * PPU); c.bottom = -this.h / (2 * PPU);
    c.updateProjectionMatrix();
  }

  // ───────── 지형 ─────────

  private buildChunk(world: World, cx: number, cy: number): THREE.Mesh {
    const pos: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
    const color = new THREE.Color();
    const quad = (v: number[], nx: number, ny: number, nz: number, hex: number, shade: number) => {
      const base = pos.length / 3;
      color.setHex(hex).multiplyScalar(shade);
      for (let i = 0; i < 4; i++) {
        pos.push(v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!);
        nor.push(nx, ny, nz);
        col.push(color.r, color.g, color.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let ly = 0; ly < CHUNK; ly++)
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = cx * CHUNK + lx, z = cy * CHUNK + ly;
        const b = world.tileBiome(x, z), y = topY(world, x, z);
        const shade = 0.93 + (hash2(world.seed, x, z) % 100) / 700 + (((x + z) & 1) ? 0.02 : 0);
        quad([x, y, z, x, y, z + 1, x + 1, y, z + 1, x + 1, y, z], 0, 1, 0, TOP[b]!, shade);
        // 카메라는 +x, +z 쪽에서 내려다보므로 그 두 방향의 옆면만 보인다.
        const yx = topY(world, x + 1, z);
        if (yx < y) quad([x + 1, yx, z, x + 1, y, z, x + 1, y, z + 1, x + 1, yx, z + 1], 1, 0, 0, SIDE[b]!, shade);
        const yz = topY(world, x, z + 1);
        if (yz < y) quad([x, yz, z + 1, x + 1, yz, z + 1, x + 1, y, z + 1, x, y, z + 1], 0, 0, 1, SIDE[b]!, shade);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, this.terrainMat);
    mesh.receiveShadow = true; mesh.castShadow = true;
    return mesh;
  }

  private updateChunks(world: World, px: number, py: number): void {
    const pcx = Math.floor(px / CHUNK), pcy = Math.floor(py / CHUNK);
    for (const [k, mesh] of this.chunks) {
      const d = Math.max(Math.abs(mesh.userData.cx - pcx), Math.abs(mesh.userData.cy - pcy));
      if (d > VIEW_RADIUS + 1) { this.scene.remove(mesh); mesh.geometry.dispose(); this.chunks.delete(k); this.nodesDirty = true; }
    }
    // 한 프레임에 만드는 청크 수를 제한해 끊김을 막는다. 가까운 것부터 만든다.
    const missing: [number, number, number][] = [];
    for (let cy = pcy - VIEW_RADIUS; cy <= pcy + VIEW_RADIUS; cy++)
      for (let cx = pcx - VIEW_RADIUS; cx <= pcx + VIEW_RADIUS; cx++)
        if (!this.chunks.has(tileKey(cx, cy))) missing.push([Math.hypot(cx - pcx, cy - pcy), cx, cy]);
    missing.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cy] of missing.slice(0, 3)) {
      const mesh = this.buildChunk(world, cx, cy);
      mesh.userData.cx = cx; mesh.userData.cy = cy;
      this.scene.add(mesh);
      this.chunks.set(tileKey(cx, cy), mesh);
      this.nodesDirty = true;
    }
  }

  private rebuildNodes(world: World): void {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
    let nt = 0, nl = 0, nr = 0;
    const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, hex?: number, shade = 1) => {
      p.set(x, y, z); s.set(sx, sy, sz); q.setFromAxisAngle(up, rot);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      if (hex !== undefined) mesh.setColorAt(i, color.setHex(hex).multiplyScalar(shade));
    };
    for (const mesh of this.chunks.values()) {
      const cx = mesh.userData.cx as number, cy = mesh.userData.cy as number;
      for (let ly = 0; ly < CHUNK; ly++)
        for (let lx = 0; lx < CHUNK; lx++) {
          const x = cx * CHUNK + lx, z = cy * CHUNK + ly, type = world.nodeType(x, z);
          if (!type) continue;
          const h = hash2(world.seed ^ 0x51, x, z), y = topY(world, x, z);
          const k = 0.85 + (h % 100) / 250, rot = ((h >>> 8) % 4) * (Math.PI / 2) + ((h >>> 12) % 10) / 20;
          const shade = 0.85 + ((h >>> 16) % 100) / 330;
          const gone = world.isDepleted(x, z);
          if (type === NodeType.Tree) {
            if (nt >= MAX_INSTANCES) continue;
            if (gone) { put(this.trunks, nt++, x + 0.5, y + 0.09, z + 0.5, 0.26, 0.18, 0.26, rot); continue; }
            put(this.trunks, nt++, x + 0.5, y + 0.3 * k, z + 0.5, 0.22, 0.6 * k, 0.22, rot);
            put(this.leavesA, nl, x + 0.5, y + 0.82 * k, z + 0.5, 0.95 * k, 0.5 * k, 0.95 * k, rot, 0x3f8f3a, shade);
            put(this.leavesB, nl++, x + 0.5, y + 1.25 * k, z + 0.5, 0.62 * k, 0.45 * k, 0.62 * k, rot + 0.4, 0x5cab4a, shade);
          } else if (!gone && nr < MAX_INSTANCES) {
            put(this.rocksA, nr, x + 0.5, y + 0.2 * k, z + 0.5, 0.72 * k, 0.42 * k, 0.6 * k, rot, 0x8e929c, shade);
            put(this.rocksB, nr++, x + 0.42, y + 0.45 * k, z + 0.56, 0.38 * k, 0.3 * k, 0.36 * k, rot + 0.6, 0xa6aab3, shade);
          }
        }
    }
    const done = (mesh: THREE.InstancedMesh, n: number) => {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    done(this.trunks, nt); done(this.leavesA, nl); done(this.leavesB, nl); done(this.rocksA, nr); done(this.rocksB, nr);
  }

  // ───────── 엔티티 ─────────

  private makeView(kind: number, name: string): View {
    const model = kind === EntityKind.Player ? makePlayer(name) : makeMob(kind);
    this.scene.add(model.root);
    return { model, groundY: NaN, dieAt: 0, phase: Math.random() * 10 };
  }

  /** 서버가 엔티티를 치웠을 때 호출한다. 체력 0으로 사라진 것이면 짧은 사망 연출을 남긴다. */
  removeEntity(e: RemoteEnt, now: number): void {
    const v = this.views.get(e.id);
    if (!v) return;
    this.views.delete(e.id);
    if (e.hp <= 0) { v.dieAt = now; this.dyingViews.push(v); } else this.dropView(v);
  }

  private dropView(v: View): void { this.scene.remove(v.model.root); disposeModel(v.model); }

  private pose(v: View, world: World, x: number, y: number, facing: number, moving: boolean, attackAt: number, hurtAt: number, kind: number, now: number, dt: number): void {
    const ground = topY(world, Math.floor(x), Math.floor(y));
    v.groundY = Number.isNaN(v.groundY) ? ground : v.groundY + (ground - v.groundY) * Math.min(1, dt * 14);
    const root = v.model.root, body = v.model.body, t = now / 1000 + v.phase;
    root.position.set(x, v.groundY, y);
    root.rotation.y = -facing;
    const sinceAttack = (now - attackAt) / 1000;
    if (kind === EntityKind.Slime) {
      const j = moving ? Math.abs(Math.sin(t * 7)) : 0.5 + 0.5 * Math.sin(t * 2.5);
      body.scale.set(1 + 0.1 * (1 - j), 0.85 + 0.25 * j, 1 + 0.1 * (1 - j));
      body.position.y = moving ? 0.12 * j : 0;
    } else {
      body.position.y = moving ? Math.abs(Math.sin(t * 11)) * 0.06 : 0;
      body.rotation.z = moving ? Math.sin(t * 11) * 0.05 : 0;
    }
    // 공격: 무기가 있으면 휘두르고, 없으면 몸을 앞으로 내지른다.
    const swing = sinceAttack >= 0 && sinceAttack < 0.22 ? sinceAttack / 0.22 : -1;
    if (v.model.weapon) {
      v.model.weapon.rotation.set(0, swing >= 0 ? 1.5 - swing * 3 : 0.5, swing >= 0 ? 0 : 0.9);
    } else body.position.x = swing >= 0 ? Math.sin(swing * Math.PI) * 0.3 : 0;
    const flash = now - hurtAt < 120 ? 0.75 : 0;
    for (const m of v.model.mats) m.emissive.setScalar(flash);
  }

  // ───────── 프레임 ─────────

  render(state: ClientState, alpha: number, now: number, dt: number): void {
    const world = state.world, me = state.me;
    const mx = me.px + (me.x - me.px) * alpha, my = me.py + (me.y - me.py) * alpha;

    this.updateChunks(world, mx, my);
    if (this.nodesDirty || this.nodeVersion !== state.nodeVersion) {
      this.nodesDirty = false; this.nodeVersion = state.nodeVersion;
      this.rebuildNodes(world);
    }

    if (!this.meView) {
      this.meView = this.makeView(EntityKind.Player, me.name);
      // 내 캐릭터가 나무나 절벽 뒤로 가려지면 그 부분만 밝은 실루엣으로 비쳐 보이게 한다.
      // 깊이 비교를 뒤집으면 "무언가에 가려진 픽셀"에만 그려지는데, 그것만으로는 캐릭터의 뒤쪽 부품이
      // 자기 앞쪽 부품에 가려진 곳에도 나타난다. 그래서 캐릭터가 실제로 보인 픽셀에 스텐실 1을 남기고,
      // 실루엣은 스텐실이 1이 아닌 곳에만 그리며 그린 곳도 1로 바꿔 겹쳐 칠해지지 않게 한다.
      const ghost = new THREE.MeshBasicMaterial({
        color: 0xfff3c4, transparent: true, opacity: 0.5, depthFunc: THREE.GreaterDepth, depthWrite: false,
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
      });
      const solid: THREE.Mesh[] = [];
      this.meView.model.root.traverse((o) => { if (o instanceof THREE.Mesh) solid.push(o); });
      for (const o of solid) {
        const mat = o.material as THREE.Material;
        mat.stencilWrite = true; mat.stencilRef = 1; mat.stencilZPass = THREE.ReplaceStencilOp;
        o.add(new THREE.Mesh(o.geometry, ghost));
      }
    }
    this.pose(this.meView, world, mx, my, me.facing, me.moving, me.attackAt, me.hurtAt, EntityKind.Player, now, dt);
    for (const e of state.ents.values()) {
      let v = this.views.get(e.id);
      if (!v) this.views.set(e.id, (v = this.makeView(e.kind, e.name)));
      this.pose(v, world, e.x, e.y, e.facing, e.moving, e.attackAt, e.hurtAt, e.kind, now, dt);
    }
    this.dyingViews = this.dyingViews.filter((v) => {
      const t = (now - v.dieAt) / 300;
      if (t >= 1) { this.dropView(v); return false; }
      v.model.root.scale.set(1 + t * 0.4, 1 - t, 1 + t * 0.4);
      for (const m of v.model.mats) m.emissive.setScalar(0.6 * (1 - t));
      return true;
    });

    // 카메라: 플레이어를 따라가되, 화면 축 기준으로 픽셀 격자에 맞춰 떨림(shimmer)을 없앤다.
    this.focusY = this.focusY + (this.meView.groundY - this.focusY) * Math.min(1, dt * 6);
    this.focus.set(mx, this.focusY + 0.5, my);
    const cam = this.camera;
    cam.position.copy(this.focus).addScaledVector(CAM_DIR, 90);
    cam.lookAt(this.focus);
    cam.updateMatrixWorld();
    this.camRight.setFromMatrixColumn(cam.matrixWorld, 0);
    this.camUp.setFromMatrixColumn(cam.matrixWorld, 1);
    const [da, db] = snapToGrid(cam.position, this.camRight, this.camUp, 1 / PPU);
    cam.updateMatrixWorld();
    // 격자에 맞추느라 버린 소수점 이동은 확대된 캔버스를 그만큼 밀어서 되살린다. 그래서 스크롤은 부드럽다.
    this.offX = (da * PPU - 1) * this.scale;
    this.offY = (-db * PPU - 1) * this.scale;
    this.canvas.style.transform = `translate(${this.offX}px, ${this.offY}px)`;

    // 그림자 카메라도 자기 텍셀 격자에 맞춰 움직여야 그림자 가장자리가 기어 다니지 않는다.
    const target = this.sun.target.position.copy(this.focus);
    const lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LIGHT_DIR).normalize();
    const lu = new THREE.Vector3().crossVectors(LIGHT_DIR, lr).normalize();
    snapToGrid(target, lr, lu, (SHADOW_EXTENT * 2) / SHADOW_SIZE);
    this.sun.position.copy(target).addScaledVector(LIGHT_DIR, 80);
    this.sun.target.updateMatrixWorld();

    this.gl.setRenderTarget(this.rt);
    this.gl.render(this.scene, cam);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCam);
  }

  /** 월드 좌표를 화면(CSS 픽셀) 좌표로. 이름표와 피해 숫자 배치에 쓴다. */
  toScreen(x: number, height: number, y: number, out: { x: number; y: number }): void {
    const v = new THREE.Vector3(x, height, y).project(this.camera);
    out.x = (v.x + 1) * 0.5 * this.w * this.scale + this.offX;
    out.y = (1 - v.y) * 0.5 * this.h * this.scale + this.offY;
  }

  groundAt(world: World, x: number, y: number): number { return topY(world, Math.floor(x), Math.floor(y)); }
  viewHeight(id: number): number { return this.views.get(id)?.model.height ?? 1; }

  /** 화면 좌표가 가리키는 지면 위의 월드 좌표(플레이어가 선 높이의 수평면과의 교점). */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const nx = ((clientX - this.offX) / (this.w * this.scale)) * 2 - 1;
    const ny = 1 - ((clientY - this.offY) / (this.h * this.scale)) * 2;
    const o = new THREE.Vector3(nx, ny, -1).unproject(this.camera);
    const t = (o.y - this.focusY) / CAM_DIR.y; // 시선 방향은 -CAM_DIR
    return { x: o.x - CAM_DIR.x * t, y: o.z - CAM_DIR.z * t };
  }
}
