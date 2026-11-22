// Kenney 가구 팩(OBJ+MTL) -> GLB. 재질 색은 baseColorFactor로, 크기는 미터로(0.2배), 원점은 바닥 한가운데로 옮긴다.
// Usage: node obj2glb.mjs <srcDir> <outDir> [name ...]
import fs from 'fs'; import path from 'path';
const [src, out, ...only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const SCALE = 0.2;
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.obj'))) {
  const name = f.slice(0, -4).replace(/ /g, '');
  if (only.length && !only.includes(name)) continue;
  const mtl = {}; let cur = null;
  const mp = path.join(src, f.slice(0, -4) + '.mtl');
  if (fs.existsSync(mp)) for (const l of fs.readFileSync(mp, 'utf8').split('\n')) { const t = l.trim().split(/\s+/); if (t[0] === 'newmtl') cur = t[1]; else if (t[0] === 'Kd' && cur) mtl[cur] = t.slice(1, 4).map(Number); }
  const V = [], N = [], groups = new Map(); let g = null;
  for (const l of fs.readFileSync(path.join(src, f), 'utf8').split('\n')) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'v') V.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'vn') N.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'usemtl') { if (!groups.has(t[1])) groups.set(t[1], { pos: [], nor: [] }); g = groups.get(t[1]); }
    else if (t[0] === 'f' && g) { const c = t.slice(1).map((s) => s.split('/').map(Number)); for (let i = 1; i < c.length - 1; i++) for (const k of [c[0], c[i], c[i + 1]]) { g.pos.push(V[k[0] - 1]); g.nor.push(N[k[2] - 1] || [0, 1, 0]); } }
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const v of V) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); }
  const off = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
  const bufs = [], accessors = [], views = [], prims = [], materials = []; let bytes = 0;
  const push = (arr, min, max) => { const b = Buffer.from(new Float32Array(arr).buffer); views.push({ buffer: 0, byteOffset: bytes, byteLength: b.length, target: 34962 }); accessors.push({ bufferView: views.length - 1, componentType: 5126, count: arr.length / 3, type: 'VEC3', ...(min ? { min, max } : {}) }); bufs.push(b); bytes += b.length; return accessors.length - 1; };
  for (const [m, d] of groups) {
    if (!d.pos.length) continue;
    const p = [], n = []; let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
    d.pos.forEach((v, i) => { const q = [(v[0] - off[0]) * SCALE, (v[1] - off[1]) * SCALE, (v[2] - off[2]) * SCALE]; p.push(...q); n.push(...d.nor[i]); for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], q[k]); b[k] = Math.max(b[k], q[k]); } });
    const kd = mtl[m] || [0.8, 0.8, 0.8];
    materials.push({ name: m, pbrMetallicRoughness: { baseColorFactor: [...kd, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true });
    const attrs = { POSITION: push(p, a, b), NORMAL: push(n) };
    // 색인(0, 1, 2, …): 색인이 없으면 엔진이 메시를 합칠 때 삼각형을 잃는다.
    const cnt = p.length / 3, ib = Buffer.from(new Uint32Array(Array.from({ length: cnt }, (_, i) => i)).buffer);
    views.push({ buffer: 0, byteOffset: bytes, byteLength: ib.length, target: 34963 }); accessors.push({ bufferView: views.length - 1, componentType: 5125, count: cnt, type: 'SCALAR' }); bufs.push(ib); bytes += ib.length;
    prims.push({ attributes: attrs, indices: accessors.length - 1, material: materials.length - 1 });
  }
  const json = { asset: { version: '2.0', generator: 'boxtown obj2glb' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }], meshes: [{ primitives: prims }], materials, accessors, bufferViews: views, buffers: [{ byteLength: bytes }] };
  let jb = Buffer.from(JSON.stringify(json)); if (jb.length % 4) jb = Buffer.concat([jb, Buffer.alloc(4 - (jb.length % 4), 0x20)]);
  const bin = Buffer.concat(bufs), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bin.length, 8);
  jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(path.join(out, name + '.glb'), Buffer.concat([head, jh, jb, bh, bin]));
}
