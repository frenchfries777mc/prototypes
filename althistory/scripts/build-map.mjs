// Natural Earth admin-1(+admin-0) -> 게임용 데이터.
// 산출물(public/data): world.topo.json, countries.json(능력치 포함), reach.json(도달 범위), adjacency.json, scenario.json
// 사용: npm run build:map
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
const NEUTRAL = new Set(['ATA']); // 주인 없는 땅(남극)

const a0 = JSON.parse(fs.readFileSync(path.join(RAW, 'admin0.geojson'), 'utf8')).features;
const a1 = JSON.parse(fs.readFileSync(path.join(RAW, 'admin1.geojson'), 'utf8')).features;
const worldview = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/overrides/worldview.json'), 'utf8'));
const scenarioDir = path.join(ROOT, 'data/scenario');
const ORDER = ['modern-2026', 'bipolar-world', 'blank-world'];
const scenarios = fs.readdirSync(scenarioDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(scenarioDir, f), 'utf8')))
  .sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99);

// ---- 1. 국가(주권) 표 + 초기 능력치 --------------------------------------------
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const NUKES = new Set(['USA', 'RUS', 'CHN', 'GBR', 'FRA', 'IND', 'PAK', 'PRK', 'ISR']);
const HIGH_MIL = new Set(['KOR', 'TUR', 'IRN', 'EGY', 'SAU', 'UKR', 'JPN', 'DEU', 'TWN', 'ISR', 'BRA', 'ITA']);
const FRAGILE = new Set(['SYR', 'YEM', 'SDN', 'SDS', 'SOM', 'AFG', 'MMR', 'HTI', 'LBY', 'COD', 'CAF', 'MLI', 'BFA', 'NER', 'TCD', 'SAH', 'PSX']);
const P5 = new Set(['USA', 'RUS', 'CHN', 'GBR', 'FRA']);
function statsFor(c) {
  const gdp = Math.max(c.gdp || 0, 50);
  const pop = Math.max(c.pop || 0, 1e3);
  const economy = clamp(Math.round(((Math.log10(gdp) - 2) / 5.3) * 85 + 10), 5, 98);
  const popScore = clamp(((Math.log10(pop) - 3.5) / 5.7) * 85 + 8, 5, 98);
  const military = clamp(Math.round(0.55 * economy + 0.35 * popScore + (NUKES.has(c.id) ? 12 : 0) + (HIGH_MIL.has(c.id) ? 8 : 0)), 3, 99);
  const inc = c.income || '';
  let stability = inc.startsWith('1.') ? 76 : inc.startsWith('2.') ? 68 : inc.startsWith('3.') ? 56 : inc.startsWith('4.') ? 48 : inc.startsWith('5.') ? 40 : 52;
  if (FRAGILE.has(c.id)) stability = 26;
  stability = clamp(stability + ((hash(c.id) % 9) - 4), 5, 95);
  const influence = clamp(Math.round(0.55 * economy + 0.35 * military + (P5.has(c.id) ? 10 : 0)), 3, 99);
  return { stability, economy, military, influence };
}

const sovToOwner = new Map();
const countries = new Map();
for (const f of a0) {
  const p = f.properties;
  if (p.ADMIN === p.SOVEREIGNT) {
    sovToOwner.set(p.SOV_A3, p.ADM0_A3);
    countries.set(p.ADM0_A3, {
      id: p.ADM0_A3, name: p.NAME_EN || p.ADMIN, nameKo: p.NAME_KO || null,
      pop: p.POP_EST ?? 0, gdp: p.GDP_MD ?? p.GDP_MD_EST ?? 0, income: p.INCOME_GRP ?? '', continent: p.CONTINENT ?? '',
    });
  }
}
for (const [id, names] of Object.entries(worldview.countryNames ?? {})) {
  if (countries.has(id)) Object.assign(countries.get(id), names);
}
if (countries.has('ATA')) Object.assign(countries.get('ATA'), { name: 'Antarctica', nameKo: '남극' });
const ownerOf = (sov, adm0) => sovToOwner.get(sov) ?? sovToOwner.get(adm0) ?? sov ?? adm0;

// ---- 2. 주(province) 목록 ---------------------------------------------------
const seen = new Set();
const uniqueId = (id) => { let x = id, n = 1; while (seen.has(x)) x = `${id}~${++n}`; seen.add(x); return x; };
const provinces = [];
const coveredAdm0 = new Set();
for (const f of a1) {
  const p = f.properties;
  if (NEUTRAL.has(p.adm0_a3) || !f.geometry) continue;
  coveredAdm0.add(p.adm0_a3);
  provinces.push({
    type: 'Feature', geometry: f.geometry,
    properties: {
      id: uniqueId(p.adm1_code), name: p.name_en || p.name, nameKo: p.name_ko || null,
      adm0: p.adm0_a3, owner: ownerOf(p.sov_a3, p.adm0_a3),
    },
  });
}
// admin-1 이 없는 국가/영토(남극 포함)는 admin-0 폴리곤을 "주 1개"로 쓴다.
let singleProvince = 0;
for (const f of a0) {
  const p = f.properties;
  if (coveredAdm0.has(p.ADM0_A3) || !f.geometry) continue;
  singleProvince++;
  provinces.push({
    type: 'Feature', geometry: f.geometry,
    properties: {
      id: uniqueId(`${p.ADM0_A3}-0`), name: p.NAME_EN || p.ADMIN, nameKo: p.NAME_KO || null,
      adm0: p.ADM0_A3, owner: ownerOf(p.SOV_A3, p.ADM0_A3),
    },
  });
}

// ---- 2b. 빈 땅 메우기 --------------------------------------------------------
// admin-0 에는 있는데 어떤 주 폴리곤에도 덮이지 않은 조각(올란드 등)을, 같은 나라의 가장 가까운 주에 붙인다.
const partsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const bboxOf = (ring) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of ring) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c, d]; };
const inRing = (x, y, r) => { let i = false; for (let k = 0, j = r.length - 1; k < r.length; j = k++) { const [xi, yi] = r[k], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) i = !i; } return i; };
const inPoly = (x, y, p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));
const CS = 2, grid = new Map(), polyList = [];
for (const f of provinces) for (const p of partsOf(f.geometry)) {
  const bb = bboxOf(p[0]); const id = polyList.length; polyList.push({ p, bb });
  for (let cx = Math.floor(bb[0] / CS); cx <= Math.floor(bb[2] / CS); cx++) for (let cy = Math.floor(bb[1] / CS); cy <= Math.floor(bb[3] / CS); cy++) {
    const k = `${cx},${cy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
  }
}
const covered = (x, y) => { for (const id of grid.get(`${Math.floor(x / CS)},${Math.floor(y / CS)}`) ?? []) { const q = polyList[id]; if (x >= q.bb[0] && x <= q.bb[2] && y >= q.bb[1] && y <= q.bb[3] && inPoly(x, y, q.p)) return true; } return false; };
const provByAdm0 = new Map();
for (const f of provinces) { if (!provByAdm0.has(f.properties.adm0)) provByAdm0.set(f.properties.adm0, []); provByAdm0.get(f.properties.adm0).push(f); }
const centerOf = (g) => { const b = [1e9, 1e9, -1e9, -1e9]; for (const p of partsOf(g)) { const q = bboxOf(p[0]); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); } return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
const filled = [];
for (const f of a0) {
  const p0 = f.properties;
  const targets = provByAdm0.get(p0.ADM0_A3);
  if (!f.geometry || !targets || !coveredAdm0.has(p0.ADM0_A3)) continue;
  for (const part of partsOf(f.geometry)) {
    const bb = bboxOf(part[0]); let ins = 0, cov = 0; const N = 5;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = bb[0] + ((bb[2] - bb[0]) * (i + 0.5)) / N, y = bb[1] + ((bb[3] - bb[1]) * (j + 0.5)) / N;
      if (inPoly(x, y, part)) { ins++; if (covered(x, y)) cov++; }
    }
    if (ins === 0) { const x = part[0].reduce((s, c) => s + c[0], 0) / part[0].length, y = part[0].reduce((s, c) => s + c[1], 0) / part[0].length; if (inPoly(x, y, part)) { ins = 1; cov = covered(x, y) ? 1 : 0; } }
    if (ins === 0 || cov / ins >= 0.5) continue;
    const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
    let best = targets[0], bd = 1e18;
    for (const t of targets) { const c = centerOf(t.geometry); const d = (c[0] - cx) ** 2 + (c[1] - cy) ** 2; if (d < bd) { bd = d; best = t; } }
    best.geometry = { type: 'MultiPolygon', coordinates: [...partsOf(best.geometry), part] };
    filled.push(`${p0.NAME_EN}(${cx.toFixed(1)},${cy.toFixed(1)}) -> ${best.properties.name}`);
  }
}

// ---- 2c. 수작업 패치(데이터에 없는 섬) -------------------------------------------
const circle = (lon, lat, r) => { const ring = []; for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI * 2; ring.push([+(lon + r * Math.cos(t)).toFixed(5), +(lat + r * Math.sin(t)).toFixed(5)]); } return [ring]; };
for (const patch of worldview.patches ?? []) {
  provinces.push({
    type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: patch.circles.map((c) => circle(c.lon, c.lat, c.r)) },
    properties: { id: uniqueId(patch.id), name: patch.name, nameKo: patch.nameKo, adm0: patch.adm0, owner: patch.owner },
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
  if (!countries.has(f.properties.owner)) problems.push(`국가 표에 없는 소유국: ${f.properties.owner} (주 ${f.properties.id} ${f.properties.name})`);
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
const scenarioIds = new Set(scenarios.flatMap((sc) => [...sc.relations.flatMap((r) => [r[0], r[1]]), ...sc.alliances.flatMap((a) => a.members)]));
for (const id of scenarioIds) if (!countries.has(id)) problems.push(`시나리오의 알 수 없는 국가 ID: ${id}`);
if (problems.length) {
  console.error('\n[실패] 검증에서 문제 발견:\n - ' + problems.join('\n - '));
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
const lost = geoms.filter((g) => !g.type).map((g) => `${g.properties.id} ${g.properties.name} (${g.properties.owner})`);
if (lost.length) {
  console.error('\n[실패] 지오메트리가 사라진 주: \n - ' + lost.join('\n - ') + '\n  QUANT 값을 올리거나 SIMPLIFY 값을 줄이세요.');
  process.exit(1);
}

// ---- 5. 인접 그래프 + 도달 범위(reach) --------------------------------------
const nb = neighbors(geoms);
const adjacency = {};
geoms.forEach((g, i) => { adjacency[g.properties.id] = nb[i].map((j) => geoms[j].properties.id).sort(); });

// reach: 육지로 맞닿거나 해협(약 1~2도) 건너 닿는 주. 점령/상륙 작전의 도달 가능성 판정에 쓴다.
const topoFc = feature(topo, topo.objects.provinces);
const RC = 1.0;
const cellProvs = new Map();
const provCells = geoms.map(() => new Set());
const addV = (x, y, i) => { const k = `${Math.floor(x / RC)},${Math.floor(y / RC)}`; provCells[i].add(k); if (!cellProvs.has(k)) cellProvs.set(k, new Set()); cellProvs.get(k).add(i); };
const walkC = (c, i) => { if (typeof c[0] === 'number') addV(c[0], c[1], i); else for (const x of c) walkC(x, i); };
topoFc.features.forEach((f, i) => { if (f.geometry) walkC(f.geometry.coordinates, i); });
const reach = geoms.map((_, i) => {
  const set = new Set();
  for (const k of provCells[i]) {
    const [cx, cy] = k.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of cellProvs.get(`${cx + dx},${cy + dy}`) ?? []) if (j !== i) set.add(j);
  }
  for (const j of nb[i]) set.add(j);
  return [...set].sort((a, b) => a - b);
});
const reachTotal = reach.reduce((s, r) => s + r.length, 0);

// ---- 5b. 역사 시나리오 컴파일 -------------------------------------------------
// data/history/*.mjs: 시나리오별 국가(polities)와 "현대 주 -> 당시 소유국" 칠하기 규칙을 받아 owners 배열을 만든다.
const fmtStart = ([y, m]) => `${y < 0 ? '-' : ''}${String(Math.abs(y)).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
const centers = topoFc.features.map((f) => {
  let best = null, bestA = -1;
  const visit = (poly) => {
    const bb = bboxOf(poly[0]); const a = (bb[2] - bb[0]) * (bb[3] - bb[1]);
    if (a > bestA) { bestA = a; best = bb; }
  };
  if (f.geometry) { if (f.geometry.type === 'Polygon') visit(f.geometry.coordinates); else for (const p of f.geometry.coordinates) visit(p); }
  return best ? [(best[0] + best[2]) / 2, (best[1] + best[3]) / 2] : [0, 0];
});
const histWarnings = [];
const adm0Set = new Set(geoms.map((g) => g.properties.adm0));
const ownerSet = new Set(geoms.map((g) => g.properties.owner));
// 어느 시대에도 "국가"로 만들지 않을 단위(분쟁 암초, 완충지대, 당시 없던 초소국/신생국). 남으면 기타 세력.
const REST_NEVER = new Set(['BRI', 'CNM', 'SPI', 'BRT', 'BJN', 'SCR', 'PGA', 'CYN', 'VAT', 'KIR', 'MHL', 'TUV', 'NRU', 'PLW', 'FSM', 'WSM', 'SLB', 'VUT', 'COM', 'MDV', 'GRD', 'VCT', 'LCA', 'DMA', 'ATG', 'KNA', 'TLS', 'CPV', 'STP', 'SYC', 'MUS', 'BRN', 'BHR', 'QAT', 'KWT', 'ARE']);
// 문자열/배열 단축 표기는 "행정 소속 또는 주권국"이 그 코드인 주 전부(해외 영토 포함). 객체의 adm0 키는 행정 소속만 엄격히 본다.
const normSel = (sel) => (typeof sel === 'string' ? { any: [sel] } : Array.isArray(sel) ? { any: sel } : { ...sel, adm0: sel.adm0 === undefined ? undefined : [].concat(sel.adm0) });
const matchSel = (i, sel) => {
  const g = geoms[i].properties;
  if (sel.any && !(sel.any.includes(g.adm0) || sel.any.includes(g.owner))) return false;
  if (sel.adm0 && !sel.adm0.includes(g.adm0)) return false;
  if (sel.box) { const [x, y] = centers[i]; if (x < sel.box[0] || x > sel.box[2] || y < sel.box[1] || y > sel.box[3]) return false; }
  if (sel.names && !sel.names.some((n) => (g.name || '').toLowerCase().includes(n.toLowerCase()))) return false;
  if (sel.ids && !sel.ids.includes(g.id)) return false;
  return true;
};
const scaleStats = (st, k) => ({ stability: st.stability, economy: Math.round(st.economy * k), military: Math.round(st.military * k), influence: Math.round(st.influence * k) });
const toStats = (a) => ({ stability: a[0], economy: a[1], military: a[2], influence: a[3] });

// 지역 세력은 회색 쪽으로 섞은 차분한 색: 그 시대의 주역 국가가 눈에 띄게, 그래도 서로는 구분되게
const muted = (hex) => { const n = parseInt(hex.slice(1), 16), g = [0x7a, 0x80, 0x8c], k = 0.62;
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * (1 - k) + g[i] * k).toString(16).padStart(2, '0')).join(''); };
function compileHistory(def) {
  const tag = def.id;
  const pol = Object.entries(def.polities).map(([id, d]) => ({
    id, name: d.e ?? d.n, nameKo: d.n, color: d.c, stats: toStats(d.s), aliases: d.a ?? [], provinces: 0, ...(d.p === false ? { npc: true } : {}),
  }));
  const idxOf = new Map(pol.map((p, i) => [p.id, i]));
  for (const c of def.self ?? []) if (!ownerSet.has(c)) histWarnings.push(`[${tag}] self: 알 수 없는 국가 코드 ${c}`);
  const owner = new Array(geoms.length).fill(-1);
  for (const [pid, ...sels] of def.paint ?? []) {
    if (!idxOf.has(pid)) throw new Error(`[${tag}] paint: 알 수 없는 국가 ${pid}`);
    for (const raw of sels) {
      const sel = normSel(raw); let n = 0;
      for (const c of [...(sel.adm0 ?? []), ...(sel.any ?? [])]) if (!adm0Set.has(c) && !ownerSet.has(c)) histWarnings.push(`[${tag}] ${pid}: 알 수 없는 국가 코드 ${c}`);
      for (let i = 0; i < geoms.length; i++) if (matchSel(i, sel)) { owner[i] = idxOf.get(pid); n++; }
      if (n === 0) histWarnings.push(`[${tag}] ${pid}: 규칙이 아무 주도 잡지 못함 ${JSON.stringify(raw)}`);
    }
  }
  // 남은 땅: modern 이면 현대 국가를 그대로(축소 능력치) 쓰고, 아니면 "기타 세력"
  const exclude = new Set([...REST_NEVER, ...(def.restExclude ?? [])]);
  const selfSet = new Set(def.self ?? []);
  let uncIdx = -1;
  const unc = () => { if (uncIdx < 0) { pol.push({ id: 'UNC', name: 'Unclaimed lands', nameKo: '기타 세력', color: '#5b6577', stats: null, aliases: [], provinces: 0, neutral: true }); uncIdx = pol.length - 1; idxOf.set('UNC', uncIdx); } return uncIdx; };
  for (let i = 0; i < geoms.length; i++) {
    if (owner[i] >= 0) continue;
    const m = geoms[i].properties.owner;
    if (((def.rest ?? 'unc') === 'modern' || selfSet.has(m)) && !NEUTRAL.has(m) && !exclude.has(m) && countries.has(m)) {
      if (!idxOf.has(m)) {
        const c = countries.get(m); const base = statsFor({ id: m, pop: c.pop, gdp: c.gdp, income: c.income });
        pol.push({ id: m, name: c.name, nameKo: c.nameKo ?? c.name, color: colorOf[m] ?? '#8a93a3', stats: scaleStats(base, def.restScale ?? 0.7), aliases: [], provinces: 0 });
        idxOf.set(m, pol.length - 1);
      }
      owner[i] = idxOf.get(m);
    } else if (!NEUTRAL.has(m) && countries.has(m)) {
      // 템플릿이 칠하지 않은 땅도 플레이할 수 있게: 현대 나라 경계 단위의 "지역 세력"(약한 능력치)
      const rid = `R_${m}`;
      if (!idxOf.has(rid)) {
        const c = countries.get(m); const base = statsFor({ id: m, pop: c.pop, gdp: c.gdp, income: c.income });
        const cap = (v) => Math.min(Math.round(v * 0.3), 28);
        pol.push({ id: rid, name: `${c.name} region`, nameKo: `${c.nameKo ?? c.name} 지역 세력`, color: muted(colorOf[m] ?? '#8a93a3'),
          stats: { stability: 45, economy: Math.max(cap(base.economy), 6), military: Math.max(cap(base.military), 5), influence: Math.max(cap(base.influence), 3) },
          aliases: [`${c.nameKo ?? c.name} 지역`], provinces: 0, regional: true });
        idxOf.set(rid, pol.length - 1);
      }
      owner[i] = idxOf.get(rid);
    } else owner[i] = unc();
  }
  owner.forEach((o) => { pol[o].provinces++; });
  const check = (id, where) => { if (!idxOf.has(id)) throw new Error(`[${tag}] ${where}: 알 수 없는 국가 ${id}`); };
  for (const [a, b] of def.wars ?? []) { check(a, 'wars'); check(b, 'wars'); }
  for (const [a, b] of def.rel ?? []) { check(a, 'rel'); check(b, 'rel'); }
  for (const al of def.alliances ?? []) al.members.forEach((m) => check(m, 'alliances'));
  for (const id of Object.keys(def.milMod ?? {})) check(id, 'milMod');
  // 군대/장군: [국가, 이름, 장군, 능력(1~10), 특성, 병력(천 명), 위치 선택자, 함대 여부]
  const armies = [];
  for (const a of def.armies ?? []) {
    const [c, n, g, skill, trait, troops, sel, navy] = a;
    check(c, 'armies');
    let at = null;
    const ns = normSel(sel);
    for (let i = 0; i < geoms.length && !at; i++) if (matchSel(i, ns) && owner[i] >= 0 && pol[owner[i]].id === c) at = geoms[i].properties.id;
    // 위치가 그 나라 영토가 아니면(전선 너머 등) 나라와 무관하게 첫 일치를 쓴다
    for (let i = 0; i < geoms.length && !at; i++) if (matchSel(i, ns)) at = geoms[i].properties.id;
    // 상자 안에 주 중심이 없으면(큰 주) 상자 중심에서 가장 가까운 주: 그 나라 영토 우선
    if (!at && ns.box) {
      const cx = (ns.box[0] + ns.box[2]) / 2, cy = (ns.box[1] + ns.box[3]) / 2;
      for (const ownOnly of [true, false]) {
        let bd = 1e9;
        for (let i = 0; i < geoms.length; i++) {
          if (ownOnly && pol[owner[i]].id !== c) continue;
          const d = (centers[i][0] - cx) ** 2 + (centers[i][1] - cy) ** 2;
          if (d < bd) { bd = d; at = geoms[i].properties.id; }
        }
        if (at && bd < 40) break; // 약 6도 이내면 채택
        at = null;
      }
    }
    if (!at) { histWarnings.push(`[${tag}] 군대 "${n}" 위치를 찾지 못함 ${JSON.stringify(sel)}`); continue; }
    armies.push({ c, n, g, skill, trait, troops, at, ...(navy ? { navy: true } : {}) });
  }
  const generals = {};
  for (const [c, list] of Object.entries(def.generals ?? {})) {
    check(c, 'generals');
    generals[c] = list.map((x) => (typeof x === 'string' ? { n: x } : { n: x[0], skill: x[1], trait: x[2] }));
  }
  const empty = pol.filter((p) => !p.neutral && !p.npc && p.provinces === 0).map((p) => p.id);
  if (empty.length) throw new Error(`[${tag}] 영토가 0인 국가(규칙 확인): ${empty.join(', ')}`);
  const ownerStr = owner;
  return {
    id: def.id, name: def.name, year: def.year, era: def.era, tagline: def.tagline, description: def.description,
    briefing: def.briefing, gmNotes: def.gmNotes ?? '', startDate: fmtStart(def.start), turnMonths: def.turn ?? 1, focus: def.focus ?? null,
    alliances: def.alliances ?? [], relations: def.rel ?? [], wars: def.wars ?? [], milMod: def.milMod ?? {}, bonuses: (def.bonuses ?? []).map((b) => ({ country: b.country, words: b.words, bonus: b.bonus, note: b.note })),
    armies, generals, polities: pol, owners: ownerStr, _unc: owner.filter((o) => pol[o].neutral).length,
  };
}

// ---- 6. 국가 색 --------------------------------------------------------------
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
const CELL = 1.5;
const cellOwners = new Map();
const addVertex = (x, y, owner) => { const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`; if (!cellOwners.has(k)) cellOwners.set(k, new Set()); cellOwners.get(k).add(owner); };
const walkCoords = (c, owner) => { if (typeof c[0] === 'number') addVertex(c[0], c[1], owner); else for (const x of c) walkCoords(x, owner); };
for (const f of topoFc.features) if (f.geometry && !NEUTRAL.has(f.properties.owner)) walkCoords(f.geometry.coordinates, f.properties.owner);
const near = new Map();
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
const used = {}, colorOf = {}, provCount = {};
for (const g of geoms) provCount[g.properties.owner] = (provCount[g.properties.owner] ?? 0) + 1;
const order = Object.keys(provCount).filter((c) => !NEUTRAL.has(c)).sort((x, y) => colorNeighbors(y).size - colorNeighbors(x).size || x.localeCompare(y));
for (const c of order) {
  const taken = new Set([...colorNeighbors(c)].map((n) => colorOf[n]).filter(Boolean));
  let pick = PALETTE.find((col) => !taken.has(col));
  if (!pick) pick = [...PALETTE].sort((a, b) => (used[a] ?? 0) - (used[b] ?? 0))[0];
  colorOf[c] = pick; used[pick] = (used[pick] ?? 0) + 1;
}
for (const n of NEUTRAL) colorOf[n] = '#5b6577';

const colorProblems = [];
for (const [a, set] of cAdj) for (const b of set) if (a < b && !NEUTRAL.has(a) && !NEUTRAL.has(b) && colorOf[a] === colorOf[b]) colorProblems.push(`육지 인접국 색 동일: ${a}-${b}`);
for (const [a, b] of worldview.mustDiffer ?? []) if (colorOf[a] === colorOf[b]) colorProblems.push(`색 구분 필수 쌍이 같은 색: ${a}-${b}`);
if (colorProblems.length) { console.error('\n[실패] 색 배정 검증:\n - ' + colorProblems.join('\n - ')); process.exit(1); }
let nearConflicts = 0;
for (const [a, set] of near) for (const b of set) if (a < b && colorOf[a] === colorOf[b]) nearConflicts++;

const historical = [];
const histDir = path.join(ROOT, 'data/history');
if (fs.existsSync(histDir)) {
  for (const f of fs.readdirSync(histDir).filter((x) => x.endsWith('.mjs') && !x.startsWith('_')).sort()) {
    const mod = await import(pathToFileURL(path.join(histDir, f)).href);
    historical.push(compileHistory(mod.default));
  }
}
const allScenarios = [...scenarios, ...historical.map(({ _unc, ...h }) => h)];

const countryList = Object.keys(provCount).map((id) => {
  const base = countries.get(id) ?? { id, name: id, nameKo: null };
  const neutral = NEUTRAL.has(id);
  return {
    id, name: base.name, nameKo: base.nameKo, color: colorOf[id], provinces: provCount[id],
    pop: base.pop ?? 0, gdp: base.gdp ?? 0, continent: base.continent ?? '',
    ...(neutral ? { neutral: true } : { stats: statsFor({ id, pop: base.pop, gdp: base.gdp, income: base.income }) }),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(path.join(OUT, 'countries.json'), JSON.stringify(countryList));
fs.writeFileSync(path.join(OUT, 'adjacency.json'), JSON.stringify(adjacency));
fs.writeFileSync(path.join(OUT, 'reach.json'), JSON.stringify(reach));
fs.writeFileSync(path.join(OUT, 'scenarios.json'), JSON.stringify(allScenarios));
fs.rmSync(path.join(OUT, 'scenario.json'), { force: true });
fs.rmSync(TMP, { recursive: true, force: true });

// ---- 7. 리포트 -------------------------------------------------------------
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log('\n=== build-map 결과 ===');
console.log(`주(province): ${geoms.length}  (admin-0 단일 주: ${singleProvince}, 수작업 패치: ${worldview.patches?.length ?? 0})`);
console.log(`국가: ${countryList.length} (중립 ${countryList.filter((c) => c.neutral).length})`);
console.log(`빈 땅 메움: ${filled.length}건${filled.length ? ' -> ' + filled.join(' / ') : ''}`);
console.log(`정책 검증: ${worldview.expect.length}건 통과 · 색 구분 필수 ${worldview.mustDiffer?.length ?? 0}쌍 통과 · 근접국 색 충돌 ${nearConflicts}쌍`);
console.log(`시나리오 템플릿: 현대 ${scenarios.length}개 + 역사 ${historical.length}개`);
for (const h of historical) console.log(`  - ${h.id}: 국가 ${h.polities.length} (지역 세력 ${h.polities.filter((p) => p.regional).length}), 기타 세력 ${(h._unc / geoms.length * 100).toFixed(0)}%`);
if (histWarnings.length) console.log('\n[역사 규칙 경고]\n' + histWarnings.join('\n'));
console.log(`reach 평균 ${(reachTotal / geoms.length).toFixed(1)}개/주`);
console.log(`world.topo.json ${kb(outTopo)} · reach.json ${kb(path.join(OUT, 'reach.json'))} · countries.json ${kb(path.join(OUT, 'countries.json'))}`);
console.log('알려진 한계:', worldview.knownLimitations.join(' / '));
