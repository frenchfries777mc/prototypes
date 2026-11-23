// Natural Earth admin-1(+admin-0) -> 게임용 TopoJSON/메타데이터.
// 사용: npm run build:map
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { feature, neighbors } from 'topojson-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data/raw');
const OUT = path.join(ROOT, 'public/data');
const TMP = path.join(ROOT, 'data/.tmp');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const SIMPLIFY = process.env.SIMPLIFY ?? '5%';
const QUANT = process.env.QUANT ?? '1000000'; // 좌표 정밀도. 너무 낮으면 바티칸 같은 초소국이 사라진다.
const EXCLUDE_ADM0 = new Set(['ATA']); // 남극: 국가가 아니고 메르카토르에서 왜곡이 심하다

const a0 = JSON.parse(fs.readFileSync(path.join(RAW, 'admin0.geojson'), 'utf8')).features;
const a1 = JSON.parse(fs.readFileSync(path.join(RAW, 'admin1.geojson'), 'utf8')).features;
const worldview = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/overrides/worldview.json'), 'utf8'));

// ---- 1. 국가(주권) 표 -------------------------------------------------------
// SOV_A3 는 'US1' 같은 값이 섞여 있어, 주권국 본체(ADMIN === SOVEREIGNT)의 ADM0_A3 를 국가 ID 로 쓴다.
const sovToOwner = new Map();
const countries = new Map();
for (const f of a0) {
  const p = f.properties;
  if (p.ADMIN === p.SOVEREIGNT && !EXCLUDE_ADM0.has(p.ADM0_A3)) {
    sovToOwner.set(p.SOV_A3, p.ADM0_A3);
    countries.set(p.ADM0_A3, { id: p.ADM0_A3, name: p.NAME_EN || p.ADMIN, nameKo: p.NAME_KO || null });
  }
}
// 정책상 표기 오버라이드 (예: 대만의 한글 이름을 NE 기본값 '중화민국' 대신 '대만'으로)
for (const [id, names] of Object.entries(worldview.countryNames ?? {})) {
  if (countries.has(id)) Object.assign(countries.get(id), names);
}
const ownerOf = (sov, adm0) => sovToOwner.get(sov) ?? sovToOwner.get(adm0) ?? sov ?? adm0;

// ---- 2. 주(province) 목록 ---------------------------------------------------
const seen = new Set();
const uniqueId = (id) => { let x = id, n = 1; while (seen.has(x)) x = `${id}~${++n}`; seen.add(x); return x; };
const provinces = [];
const coveredAdm0 = new Set();
for (const f of a1) {
  const p = f.properties;
  if (EXCLUDE_ADM0.has(p.adm0_a3) || !f.geometry) continue;
  coveredAdm0.add(p.adm0_a3);
  provinces.push({
    type: 'Feature', geometry: f.geometry,
    properties: {
      id: uniqueId(p.adm1_code), name: p.name_en || p.name, nameKo: p.name_ko || null,
      adm0: p.adm0_a3, owner: ownerOf(p.sov_a3, p.adm0_a3),
    },
  });
}
// admin-1 이 없는 국가/영토는 admin-0 폴리곤을 "주 1개"로 쓴다 (모든 국가를 플레이 가능하게).
let singleProvince = 0;
for (const f of a0) {
  const p = f.properties;
  if (EXCLUDE_ADM0.has(p.ADM0_A3) || coveredAdm0.has(p.ADM0_A3) || !f.geometry) continue;
  singleProvince++;
  provinces.push({
    type: 'Feature', geometry: f.geometry,
    properties: {
      id: uniqueId(`${p.ADM0_A3}-0`), name: p.NAME_EN || p.ADMIN, nameKo: p.NAME_KO || null,
      adm0: p.ADM0_A3, owner: ownerOf(p.SOV_A3, p.ADM0_A3),
    },
  });
}

// ---- 3. 정책 오버라이드 적용 -------------------------------------------------
const byId = new Map(provinces.map((f) => [f.properties.id, f]));
const problems = [];
for (const rule of worldview.rules) {
  for (const id of rule.ids) {
    const f = byId.get(id);
    if (!f) { problems.push(`오버라이드 대상 없음: ${id}`); continue; }
    f.properties.owner = rule.owner;
  }
}
for (const f of provinces) {
  if (!countries.has(f.properties.owner)) {
    problems.push(`국가 표에 없는 소유국: ${f.properties.owner} (주 ${f.properties.id} ${f.properties.name})`);
  }
}
for (const e of worldview.expect) {
  const f = byId.get(e.id);
  if (!f) problems.push(`expect 대상 없음: ${e.id}`);
  else if (f.properties.owner !== e.owner) problems.push(`정책 불일치 ${e.id}: ${f.properties.owner} (기대 ${e.owner}) - ${e.why}`);
}
for (const e of worldview.expectCountryName ?? []) {
  const c = countries.get(e.owner);
  if (c?.name !== e.nameEn || (e.nameKo && c?.nameKo !== e.nameKo)) problems.push(`국가 표기 불일치 ${e.owner}: ${c?.name}/${c?.nameKo} (기대 ${e.nameEn}/${e.nameKo ?? '-'})`);
}
if (problems.length) {
  console.error('\n[실패] 정책 검증에서 문제 발견:\n - ' + problems.join('\n - '));
  process.exit(1);
}

// ---- 4. 단순화 + TopoJSON (mapshaper) ---------------------------------------
const tmpIn = path.join(TMP, 'provinces.geojson');
fs.writeFileSync(tmpIn, JSON.stringify({ type: 'FeatureCollection', features: provinces }));
const outTopo = path.join(OUT, 'world.topo.json');
execFileSync(
  path.join(ROOT, 'node_modules/.bin/mapshaper'),
  [tmpIn, '-simplify', SIMPLIFY, 'keep-shapes', '-rename-layers', 'provinces',
   '-o', outTopo, 'format=topojson', `quantization=${QUANT}`, 'id-field=id', 'force'],
  { stdio: 'inherit' },
);
const topo = JSON.parse(fs.readFileSync(outTopo, 'utf8'));
const geoms = topo.objects.provinces.geometries;

// 불변식: 단순화/양자화로 지오메트리를 잃은 주가 있으면 안 된다 (모든 국가가 플레이 가능해야 하므로).
const lost = geoms.filter((g) => !g.type).map((g) => `${g.properties.id} ${g.properties.name} (${g.properties.owner})`);
if (lost.length) {
  console.error('\n[실패] 지오메트리가 사라진 주: \n - ' + lost.join('\n - ') + '\n  QUANT 값을 올리거나 SIMPLIFY 값을 줄이세요.');
  process.exit(1);
}

// ---- 5. 인접 그래프 + 국가 색 ----------------------------------------------
const nb = neighbors(geoms);
const adjacency = {};
geoms.forEach((g, i) => { adjacency[g.properties.id] = nb[i].map((j) => geoms[j].properties.id).sort(); });

const ownerOfId = Object.fromEntries(geoms.map((g) => [g.properties.id, g.properties.owner]));
const cAdj = new Map();
for (const [id, list] of Object.entries(adjacency)) {
  for (const n of list) {
    const a = ownerOfId[id], b = ownerOfId[n];
    if (a === b) continue;
    if (!cAdj.has(a)) cAdj.set(a, new Set());
    if (!cAdj.has(b)) cAdj.set(b, new Set());
    cAdj.get(a).add(b); cAdj.get(b).add(a);
  }
}
// 해협 건너 근접국(대만-중국, 영국-프랑스 등)도 "이웃"으로 쳐서 같은 색이 되지 않게 한다.
// 1.5도 격자에 소유국을 기록하고, 3x3 주변 칸에 함께 있는 국가끼리를 근접으로 본다.
const CELL = 1.5;
const cellOwners = new Map();
const topoFc = feature(topo, topo.objects.provinces);
const addVertex = (x, y, owner) => {
  const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  if (!cellOwners.has(k)) cellOwners.set(k, new Set());
  cellOwners.get(k).add(owner);
};
const walkCoords = (c, owner) => {
  if (typeof c[0] === 'number') addVertex(c[0], c[1], owner);
  else for (const x of c) walkCoords(x, owner);
};
for (const f of topoFc.features) if (f.geometry) walkCoords(f.geometry.coordinates, f.properties.owner);
const near = new Map(); // 근접(해협 포함) 관계, 색 배정 전용
const link = (a, b) => { if (a === b) return; if (!near.has(a)) near.set(a, new Set()); if (!near.has(b)) near.set(b, new Set()); near.get(a).add(b); near.get(b).add(a); };
for (const [k, owners] of cellOwners) {
  const [cx, cy] = k.split(',').map(Number);
  const around = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const o of cellOwners.get(`${cx + dx},${cy + dy}`) ?? []) around.add(o);
  for (const a of owners) for (const b of around) link(a, b);
}
const colorNeighbors = (c) => new Set([...(cAdj.get(c) ?? []), ...(near.get(c) ?? [])]);

const PALETTE = ['#d9825b', '#e0b84f', '#8fbf6a', '#5fb3a1', '#5b9bd5', '#8a7fd1',
                 '#c872b4', '#d6697c', '#a3a55a', '#6fa8c7', '#b88f6a', '#7f9f9a'];
const used = {};
const colorOf = {};
const provCount = {};
for (const g of geoms) provCount[g.properties.owner] = (provCount[g.properties.owner] ?? 0) + 1;
const order = [...Object.keys(provCount)].sort((x, y) => colorNeighbors(y).size - colorNeighbors(x).size || x.localeCompare(y));
for (const c of order) {
  const taken = new Set([...colorNeighbors(c)].map((n) => colorOf[n]).filter(Boolean));
  let pick = PALETTE.find((col) => !taken.has(col));
  if (!pick) pick = [...PALETTE].sort((a, b) => (used[a] ?? 0) - (used[b] ?? 0))[0];
  colorOf[c] = pick; used[pick] = (used[pick] ?? 0) + 1;
}
// 검증: 육지로 맞닿은 국가끼리는 색이 같으면 안 되고, 정책상 구분이 필수인 쌍도 마찬가지다.
const colorProblems = [];
for (const [a, set] of cAdj) for (const b of set) if (a < b && colorOf[a] === colorOf[b]) colorProblems.push(`육지 인접국 색 동일: ${a}-${b}`);
for (const [a, b] of worldview.mustDiffer ?? []) if (colorOf[a] === colorOf[b]) colorProblems.push(`색 구분 필수 쌍이 같은 색: ${a}-${b}`);
if (colorProblems.length) { console.error('\n[실패] 색 배정 검증:\n - ' + colorProblems.join('\n - ')); process.exit(1); }
let nearConflicts = 0;
for (const [a, set] of near) for (const b of set) if (a < b && colorOf[a] === colorOf[b]) nearConflicts++;

const countryList = Object.keys(provCount).map((id) => ({
  ...(countries.get(id) ?? { id, name: id, nameKo: null }), color: colorOf[id], provinces: provCount[id],
})).sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(path.join(OUT, 'countries.json'), JSON.stringify(countryList));
fs.writeFileSync(path.join(OUT, 'adjacency.json'), JSON.stringify(adjacency));
fs.rmSync(TMP, { recursive: true, force: true });

// ---- 6. 리포트 -------------------------------------------------------------
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log('\n=== build-map 결과 ===');
console.log(`주(province): ${geoms.length}  (admin-0 단일 주: ${singleProvince})`);
console.log(`국가: ${countryList.length}`);
console.log(`정책 검증: ${worldview.expect.length}건 통과 · 색 구분 필수 ${worldview.mustDiffer?.length ?? 0}쌍 통과 · 근접국 색 충돌 ${nearConflicts}쌍`);
console.log(`world.topo.json ${kb(outTopo)} · adjacency.json ${kb(path.join(OUT, 'adjacency.json'))} · countries.json ${kb(path.join(OUT, 'countries.json'))}`);
const isolated = Object.entries(adjacency).filter(([, v]) => v.length === 0).length;
console.log(`인접 주가 없는 주(섬): ${isolated}`);
console.log('알려진 한계:', worldview.knownLimitations.join(' / '));
