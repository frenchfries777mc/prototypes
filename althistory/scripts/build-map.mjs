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
// HIST_DRY=1: 결과 파일을 쓰지 않고 검사만(여러 개를 동시에 돌려도 안전). HIST_ONLY=<템플릿 id>: 그 템플릿만 컴파일
// HIST_GAPS=1: 채우기 후에도 남은 빈 땅(지역 세력이 될 땅)을 현대 나라·주 이름과 좌표로 출력
const DRY = !!process.env.HIST_DRY, ONLY = process.env.HIST_ONLY || '', GAPS = !!process.env.HIST_GAPS;
const TMP = path.join(ROOT, DRY ? `data/.tmp-${process.pid}` : 'data/.tmp');
fs.mkdirSync(OUT, { recursive: true });
for (const d of fs.readdirSync(path.join(ROOT, 'data'))) if (/^\.tmp-\d+$/.test(d)) { try { const dp = path.join(ROOT, 'data', d); if (Date.now() - fs.statSync(dp).mtimeMs > 3600e3) fs.rmSync(dp, { recursive: true, force: true }); } catch { /* 무시 */ } } // 1시간 넘은 것만(동시에 도는 검사의 폴더는 건드리지 않는다)
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

// ---- 3a. 너무 큰 주를 비슷한 크기로 쪼개기 (자연스러운 모양: 면적 가중 k-평균 + 보로노이) ----
// 사람이 사는 유럽(DENSE)은 주 하나가 약 15,000km², 그 밖의 넓은 땅은 약 150,000km²를 넘지 않게 한다.
// 바이에른처럼 실제 지방 중심 도시를 알면 그 좌표를 씨앗으로 쓰고(SPLITS), 그 밖에는 주 안의 점들을 k-평균으로 묶어 씨앗을 정한다.
// 조각의 바깥 경계는 원본 꼭짓점을 그대로 지켜서 이웃 주와 틈·겹침이 생기지 않는다.
import polygonClipping from 'polygon-clipping';
const ringKm = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
const areaKm2 = (g) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let t = 0, lat = 0, n = 0;
  for (const pl of polys) { t += ringKm(pl[0]) - pl.slice(1).reduce((x, h) => x + ringKm(h), 0); for (const pt of pl[0]) { lat += pt[1]; n++; } }
  return t * Math.cos(((lat / Math.max(n, 1)) * Math.PI) / 180) * 111.32 * 111.32; };
const MAX_DENSE = 15000, MAX_WIDE = 150000, DENSE = [-12, 35, 40, 61];
const idAlias = new Map(); // 쪼개지거나 합쳐져 사라진 주 id -> 지금 그 땅을 가진 주 id들(템플릿의 ids 선택자가 계속 맞도록)
const aliasOf = (id) => idAlias.get(id) ?? [id];
const SPLITS = [
  { id: 'DEU-1591', parts: [
    { id: 'DEU-1591', name: 'Upper Bavaria', nameKo: '오버바이에른', at: [11.9, 47.9] },
    { id: 'DEU-1591-ndb', name: 'Lower Bavaria', nameKo: '니더바이에른', at: [12.9, 48.7] },
    { id: 'DEU-1591-opf', name: 'Upper Palatinate', nameKo: '오버팔츠', at: [12.0, 49.6] },
    { id: 'DEU-1591-fra', name: 'Franconia', nameKo: '프랑켄', at: [10.3, 49.7] },
    { id: 'DEU-1591-sch', name: 'Swabia', nameKo: '슈바벤', at: [10.3, 48.1] },
  ] },
];
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const boxCenter = (g) => { let best = null, ba = -1; for (const pl of polysOf(g)) { const q = bboxOf(pl[0]), a = (q[2] - q[0]) * (q[3] - q[1]); if (a > ba) { ba = a; best = q; } } return [(best[0] + best[2]) / 2, (best[1] + best[3]) / 2]; };
/** 쪼개진 조각의 좌표 상자 판정은 원래 주의 중심으로 한다(쪼개도 템플릿이 칠하는 결과는 그대로). */
const origCenter = new Map();
const pip = (x, y, r) => { let c = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [xi, yi] = r[a], [xj, yj] = r[b]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const thin = (r, max) => { if (r.length <= max) return r; const s = Math.ceil(r.length / max); return r.filter((_, i) => i % s === 0); };
/** 주 안의 점들을 균등하게 뽑는다(시드용이라 꼭짓점은 성기게 줄여서 판정). x는 cos(위도)로 눌러 면적을 맞춘다. */
function samplePoints(g, cx, want) {
  const polys = polysOf(g).map((pl) => pl.map((r) => thin(r, 600))), bb = [1e9, 1e9, -1e9, -1e9];
  for (const pl of polys) for (const [x, y] of pl[0]) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }
  const step = Math.sqrt(((bb[2] - bb[0]) * (bb[3] - bb[1])) / want) || 0.1, pts = [];
  for (let y = bb[1] + step / 2; y < bb[3]; y += step) for (let x = bb[0] + step / 2; x < bb[2]; x += step) {
    if (polys.some((pl) => pip(x, y, pl[0]) && !pl.slice(1).some((h) => pip(x, y, h)))) pts.push([x * cx, y]);
  }
  return pts;
}
function kmeans(pts, k) {
  let mx = 0, my = 0; for (const [x, y] of pts) { mx += x; my += y; } mx /= pts.length; my /= pts.length;
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const cs = [pts.reduce((b, p) => (d2(p, [mx, my]) < d2(b, [mx, my]) ? p : b))];
  while (cs.length < k) { let best = null, bd = -1; for (const p of pts) { const d = Math.min(...cs.map((c) => d2(p, c))); if (d > bd) { bd = d; best = p; } } cs.push(best); }
  for (let it = 0; it < 14; it++) {
    const sum = cs.map(() => [0, 0, 0]);
    for (const p of pts) { let bi = 0, bd = Infinity; cs.forEach((c, i) => { const d = d2(p, c); if (d < bd) { bd = d; bi = i; } }); sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2]++; }
    sum.forEach((s, i) => { if (s[2]) cs[i] = [s[0] / s[2], s[1] / s[2]]; });
  }
  return cs;
}
/** 자르는 선을 자연스럽게 굽힌다: 칸의 변을 잘게 나누고, 모든 점을 같은 매끄러운 변위장으로 옮긴다.
 *  같은 변은 양쪽 칸에서 똑같은 점들로 나뉘고(끝점 순서를 정해서) 같은 함수로 옮겨지므로 이웃 조각 사이에 틈·겹침이 생기지 않는다. */
const q6 = (v) => Math.round(v * 1e6) / 1e6;
function makeWarp(R, seed) {
  const ph = (k) => ((seed * (k + 3) * 2654435761) % 6283) / 1000;
  const f1 = (2 * Math.PI) / (0.9 * R), f2 = (2 * Math.PI) / (0.35 * R), a1 = 0.07 * R, a2 = 0.02 * R;
  return ([x, y]) => [q6(x + a1 * Math.sin(f1 * (x + 0.6 * y) + ph(1)) + a2 * Math.sin(f2 * (y - 0.8 * x) + ph(2))),
    q6(y + a1 * Math.sin(f1 * (y - 0.5 * x) + ph(3)) + a2 * Math.sin(f2 * (x + 0.9 * y) + ph(4)))];
}
function warpPoly(poly, R, seed) {
  const warp = makeWarp(R, seed), step = 0.12 * R, out = [];
  const P = poly.map(([x, y]) => [q6(x), q6(y)]);
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const swap = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]); // 점 목록은 항상 작은 끝점에서 큰 끝점 쪽으로 만든다(양쪽 칸이 같은 점을 얻게)
    const s = swap ? b : a, e = swap ? a : b, n = Math.max(1, Math.min(400, Math.ceil(Math.hypot(e[0] - s[0], e[1] - s[1]) / step)));
    const pts = []; for (let k = 0; k <= n; k++) pts.push([q6(s[0] + ((e[0] - s[0]) * k) / n), q6(s[1] + ((e[1] - s[1]) * k) / n)]);
    const seq = swap ? pts.slice(1).reverse() : pts.slice(0, n); // a→b 순서, 끝점 b 는 다음 변이 시작점으로 낸다
    for (const p of swap ? [...pts.slice(1).reverse()] : seq) out.push(warp(p));
  }
  return out;
}
/** 씨앗들의 보로노이 칸(볼록 다각형)을 구해 주와 교차시킨다. 반환: 씨앗마다 MultiPolygon 좌표(비면 null). */
function voronoiPieces(g, seeds, cx, R, hs) {
  const big = [[-1e4, -1e4], [1e4, -1e4], [1e4, 1e4], [-1e4, 1e4]];
  const cut = (poly, a, b) => { // a 쪽(= a 가 b 보다 가까운 쪽)만 남긴다
    const nx = b[0] - a[0], ny = b[1] - a[1], c = (nx * (a[0] + b[0]) + ny * (a[1] + b[1])) / 2, f = (p) => c - (nx * p[0] + ny * p[1]);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  };
  const subject = polysOf(g);
  return seeds.map((s, i) => {
    let cell = big; for (let j = 0; j < seeds.length && cell.length > 2; j++) if (j !== i) cell = cut(cell, s, seeds[j]);
    if (cell.length < 3) return null;
    cell = warpPoly(cell, R, hs);
    const ring = cell.map(([x, y]) => [x / cx, y]); ring.push(ring[0]);
    const res = polygonClipping.intersection(subject, [ring]);
    return res.length ? res : null;
  });
}
const DIRS = [['동', 'East'], ['북동', 'Northeast'], ['북', 'North'], ['북서', 'Northwest'], ['서', 'West'], ['남서', 'Southwest'], ['남', 'South'], ['남동', 'Southeast']];
function splitProvince(base, k, seedsAt, cx) {
  const g = base.geometry;
  const seeds = seedsAt ? seedsAt.map(([x, y]) => [x * cx, y]) : kmeans(samplePoints(g, cx, Math.max(500, 150 * k)), k);
  const flat0 = polysOf(g).reduce((s, pl) => s + ringArea(pl[0]), 0), R = Math.sqrt((flat0 * cx) / seeds.length), hs = [...String(base.properties.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 997 + 1;
  const res = voronoiPieces(g, seeds, cx, R, hs);
  const pieces = res.map((coords, i) => ({ coords, i })).filter((x) => x.coords);
  // 면적 검사는 위도 보정 없이 평면 넓이로 비교한다(조각마다 평균 위도가 달라 areaKm2 는 합이 어긋난다)
  const flat = (polys) => polys.reduce((s, pl) => s + ringArea(pl[0]) - pl.slice(1).reduce((x, h) => x + ringArea(h), 0), 0);
  const a0 = flat(polysOf(g)), a1 = pieces.reduce((s, x) => s + flat(x.coords), 0);
  if (!pieces.length || Math.abs(a1 - a0) / a0 > 0.03) throw new Error(`[주 쪼개기] ${base.properties.id}: 면적이 맞지 않음 ${a0.toFixed(2)} → ${a1.toFixed(2)}`);
  return pieces.map((x) => ({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: x.coords }, seed: seeds[x.i] }));
}
const mean = (g) => { let x = 0, y = 0, n = 0; for (const pl of polysOf(g)) for (const [a, b] of pl[0]) { x += a; y += b; n++; } return [x / n, y / n]; };
const cosAt = (g) => Math.max(0.2, Math.cos((mean(g)[1] * Math.PI) / 180));
for (const sp of SPLITS) {
  const at = provinces.findIndex((f) => f.properties.id === sp.id);
  if (at < 0) { console.warn(`[주 쪼개기] ${sp.id} 를 찾지 못함`); continue; }
  const base = provinces[at], cx = cosAt(base.geometry);
  const made = splitProvince(base, sp.parts.length, sp.parts.map((x) => x.at), cx);
  provinces.splice(at, 1, ...made.map((m, k) => ({ type: 'Feature', geometry: m.geometry, properties: { ...base.properties, id: sp.parts[k].id, name: sp.parts[k].name, nameKo: sp.parts[k].nameKo } })));
}
const splitReport = [];
(function splitBig() {
  const out = [];
  for (const f of provinces) {
    const a = f.geometry ? areaKm2(f.geometry) : 0, [mx, my] = f.geometry ? mean(f.geometry) : [0, 0];
    const dense = mx >= DENSE[0] && mx <= DENSE[2] && my >= DENSE[1] && my <= DENSE[3], max = dense ? MAX_DENSE : MAX_WIDE;
    if (!f.geometry || a <= max * 1.25 || NEUTRAL.has(f.properties.owner) || NEUTRAL.has(f.properties.adm0)) { out.push(f); continue; }
    const k = Math.ceil(a / max), cx = cosAt(f.geometry), pr = f.properties;
    const pieces = splitProvince(f, k, null, cx);
    const [bx, by] = [mx * cx, my];
    const spread = Math.max(...pieces.map((p) => Math.hypot(p.seed[0] - bx, p.seed[1] - by))) || 1;
    const used = new Map();
    pieces.forEach((p, i) => {
      const dx = p.seed[0] - bx, dy = p.seed[1] - by, near = Math.hypot(dx, dy) < spread * 0.3;
      const d = near && pieces.length > 2 ? ['중', 'Central'] : DIRS[Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360 / 45) % 8];
      const n = (used.get(d[0]) ?? 0) + 1; used.set(d[0], n);
      const id = i === 0 ? pr.id : `${pr.id}-s${i + 1}`, tag = n > 1 ? ` ${n}` : '';
      out.push({ type: 'Feature', geometry: p.geometry, properties: { ...pr, id, name: `${pr.name} ${d[1]}${tag}`, nameKo: pr.nameKo ? `${pr.nameKo} ${d[0]}부${tag}` : null } });
    });
    const c0 = boxCenter(f.geometry); for (const q of out.slice(-pieces.length)) origCenter.set(q.properties.id, c0);
    idAlias.set(pr.id, out.slice(-pieces.length).map((x) => x.properties.id));
    splitReport.push(`${pr.id} ×${pieces.length}`);
  }
  provinces.length = 0; provinces.push(...out);
})();

// ---- 3b. 너무 잘게 쪼개진 나라의 작은 주를 이웃에 합치기 -----------------------------------
// 원본(admin-1)이 시·군 단위인 나라(슬로베니아 193개, 몰타 68개, 마케도니아 84개, 영국 232개 …)는 지도에서 주가 점처럼 작다.
// 주 면적의 "중앙값"이 MERGE_MEDIAN 미만인 나라에서만, MERGE_MIN(km²) 미만 주를 공유 경계가 가장 긴 이웃에 합친다.
// 서울·부산처럼 특별시가 작을 뿐인 정상적인 나라(중앙값이 큼)는 건드리지 않는다. 합쳐진 주는 가장 큰 구성원의 id·이름을 쓴다.
const MERGE_MEDIAN = 700, MERGE_MIN = 1500;
// 템플릿이 주를 가르는 기준(이름·좌표 상자·id 선택자)을 미리 모아서, 같은 선택자 집합에 속한 주끼리만 합친다.
// (이탈리아 소국·독일 제후국처럼 템플릿이 주 단위로 칠하는 곳이 합쳐져서 칠할 땅이 사라지는 일을 구조적으로 막는다)
const histDefs = [];
{
  const dir = path.join(ROOT, 'data/history');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mjs') && !x.startsWith('_')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    const fillPath = path.join(dir, 'fill', `${mod.default.id}.mjs`);
    histDefs.push(fs.existsSync(fillPath) ? { ...mod.default, _fill: (await import(pathToFileURL(fillPath).href)).default } : mod.default);
  }
}
const selMap = new Map();
(function walk(o) { if (!o || typeof o !== 'object') return; if (!Array.isArray(o) && (o.box || o.names || o.ids)) { selMap.set(JSON.stringify(o), o); return; } for (const v of Object.values(o)) walk(v); })(histDefs);
const selList = [...selMap.values()];
const sigOf = (f) => {
  const g = f.properties, [cx, cy] = boxCenter(f.geometry), nm = (g.name || '').toLowerCase(), hit = [];
  selList.forEach((s, k) => {
    if (s.ids && !s.box && !s.names) return; // id 만 쓰는 선택자는 합쳐진 주를 별칭(idAlias)으로 따라가므로 합치기를 막지 않는다
    if (s.adm0 !== undefined && ![].concat(s.adm0).includes(g.adm0)) return;
    if (s.box && (cx < s.box[0] || cx > s.box[2] || cy < s.box[1] || cy > s.box[3])) return;
    if (s.names && !s.names.some((n) => nm.includes(n.toLowerCase()))) return;
    if (s.ids && !s.ids.some((x) => aliasOf(x).includes(g.id))) return;
    hit.push(k);
  });
  return hit.join(',');
};
const mergeReport = [];
(function mergeOversplit() {
  const byA = new Map();
  provinces.forEach((f, i) => { if (!f.geometry) return; const k = `${f.properties.adm0}|${f.properties.owner}`; if (!byA.has(k)) byA.set(k, []); byA.get(k).push(i); });
  const vkey = (pt) => `${Math.round(pt[0] * 1e4)},${Math.round(pt[1] * 1e4)}`;
  const cen = (g) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let x = 0, y = 0, n = 0; for (const pl of polys) for (const pt of pl[0]) { x += pt[0]; y += pt[1]; n++; } return [x / n, y / n]; };
  for (const [adm0, idxs] of byA) {
    if (idxs.length < 3) continue;
    const area = new Map(idxs.map((i) => [i, areaKm2(provinces[i].geometry)]));
    const sorted = [...area.values()].sort((a, b) => a - b);
    // 나라 안 주들의 중앙값에 따라 합치는 기준을 정한다: 시·군 단위로 잘게 쪼개진 나라는 1,500km², 중앙값이 4,000km² 미만이면 4,000km²,
    // 그 밖에는 점처럼 작은 400km² 미만 조각만. (소유국이 다른 주끼리는 합치지 않는다 — 카슈미르·크림 같은 곳)
    const med = sorted[Math.floor(sorted.length / 2)];
    const limit = med < MERGE_MEDIAN ? MERGE_MIN : med < 4000 && idxs.length >= 6 ? 4000 : 400;
    // 이웃: 꼭짓점을 공유하는 정도(= 경계 길이의 대략치)
    const owner = new Map(); // vertex -> [idx]
    const nv = new Map(); // 주마다 서로 다른 꼭짓점 수
    for (const i of idxs) {
      const g = provinces[i].geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates, seenV = new Set();
      for (const pl of polys) for (const ring of pl) for (const pt of ring) { const k = vkey(pt); if (seenV.has(k)) continue; seenV.add(k); if (!owner.has(k)) owner.set(k, []); owner.get(k).push(i); }
      nv.set(i, seenV.size);
    }
    const adj = new Map(idxs.map((i) => [i, new Map()]));
    const sig = new Map(idxs.map((i) => [i, sigOf(provinces[i])]));
    for (const list of owner.values()) if (list.length > 1) for (const a of list) for (const b of list) if (a !== b && sig.get(a) === sig.get(b)) adj.get(a).set(b, (adj.get(a).get(b) ?? 0) + 1);
    // 비지(飛地): 경계의 90% 이상을 이웃 하나와 맞대고 있는 주(베를린·브레멘·모스크바처럼 다른 주 속에 박힌 주). 크기와 상관없이 둘러싼 주에 합친다.
    // (소유국이 다른 비지, 곧 바티칸·산마리노·레소토 같은 별개 나라는 이 그룹에 들지 않아 그대로 남는다)
    const forced = new Set(idxs.filter((i) => { const m = adj.get(i); if (m.size !== 1) return false; const [, w] = [...m][0]; return w >= 0.9 * nv.get(i); }));
    const cc = new Map(idxs.map((i) => [i, cen(provinces[i].geometry)]));
    const parent = new Map(idxs.map((i) => [i, i])); // 합쳐진 묶음의 대표
    const find = (i) => { while (parent.get(i) !== i) i = parent.get(i); return i; };
    const total = new Map(idxs.map((i) => [i, area.get(i)])); const members = new Map(idxs.map((i) => [i, [i]]));
    const nb = new Map(idxs.map((i) => [i, new Map(adj.get(i))])); // 묶음 간 이웃(대표 기준)
    let guard = idxs.length * 4; const skip = new Set();
    while (guard-- > 0) {
      const live = [...new Set(idxs.map(find))];
      if (live.length <= 1) break;
      const small = live.filter((r) => (total.get(r) < limit || forced.has(r)) && !skip.has(r)).sort((a, b) => total.get(a) - total.get(b))[0];
      if (small === undefined) break;
      // 합칠 대상: 공유 경계가 가장 긴 이웃. 육지 이웃이 없는 섬은 "같은 처지의 섬"(이웃 없는 묶음)끼리만, 가장 가까운 것과 합친다
      // (오크니·셰틀랜드가 본토 주에 딸려 들어가지 않게). 짝이 없으면 그대로 둔다.
      let best = -1, bw = 0;
      for (const [o, w] of nb.get(small)) { const ro = find(o); if (ro !== small && w > bw) { bw = w; best = ro; } }
      if (best < 0 && limit >= MERGE_MIN) {
        let bd = Infinity; const c0 = cc.get(small);
        for (const r of live) {
          if (r === small || sig.get(r) !== sig.get(small) || [...nb.get(r).keys()].some((o) => find(o) !== r)) continue; // 육지 이웃이 있는 묶음은 제외
          const c1 = cc.get(r); const d = (c0[0] - c1[0]) ** 2 + (c0[1] - c1[1]) ** 2; if (d < bd && d <= 64) { bd = d; best = r; } // 약 8도(≈900km) 안의 섬끼리만
        }
      }
      if (best < 0) { skip.add(small); continue; }
      forced.delete(small); parent.set(small, best); total.set(best, total.get(best) + total.get(small)); members.get(best).push(...members.get(small));
      for (const [o, w] of nb.get(small)) { const ro = find(o); if (ro === best) continue; nb.get(best).set(ro, (nb.get(best).get(ro) ?? 0) + w); }
    }
    const groups = new Map();
    for (const i of idxs) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
    if (groups.size === idxs.length) continue;
    for (const list of groups.values()) {
      const lead = list.reduce((a, b) => (area.get(b) > area.get(a) ? b : a), list[0]);
      const lp = provinces[lead].properties;
      const label = list.length > 1 && lp.nameKo ? `${lp.nameKo} 일대` : lp.nameKo;
      const names = [...new Set(list.map((i) => provinces[i].properties.name))].join(' / '); // 이름 선택자(names)가 합쳐진 주도 찾도록 이름을 모두 남긴다
      for (const i of list) { const pr = provinces[i].properties, old = pr.id; pr.gid = lp.id; if (i !== lead) { pr.id = lp.id; idAlias.set(old, [lp.id]); } pr.name = names; pr.nameKo = label; }
    }
    mergeReport.push(`${adm0.replace('|', '/')} ${idxs.length}→${groups.size}${forced.size ? ` (비지 ${forced.size})` : ''}`);
  }
})();
provinces.forEach((f) => { if (f.properties.gid === undefined) f.properties.gid = f.properties.id; });

// ---- 4. 단순화 + TopoJSON (mapshaper) ---------------------------------------
// 합치기(-dissolve)는 합쳐지는 묶음에만 적용한다. 전체에 적용하면 비르 타윌 같은 특이한 주가 사라진다.
const gcount = {}; for (const f of provinces) gcount[f.properties.gid] = (gcount[f.properties.gid] ?? 0) + 1;
const slim = (f) => ({ type: 'Feature', geometry: f.geometry, properties: { id: f.properties.id, name: f.properties.name, nameKo: f.properties.nameKo ?? null, adm0: f.properties.adm0, owner: f.properties.owner, gid: f.properties.gid } });
const fcOf = (features) => JSON.stringify({ type: 'FeatureCollection', features });
const tmpMerged = path.join(TMP, 'merged.geojson'), tmpOthers = path.join(TMP, 'others.geojson');
fs.writeFileSync(tmpMerged, fcOf(provinces.filter((f) => gcount[f.properties.gid] > 1).map(slim)));
fs.writeFileSync(tmpOthers, fcOf(provinces.filter((f) => gcount[f.properties.gid] === 1).map(slim)));
const outTopo = path.join(DRY ? TMP : OUT, 'world.topo.json');
const mergedOnly = provinces.some((f) => gcount[f.properties.gid] > 1);
execFileSync(
  path.join(ROOT, 'node_modules/.bin/mapshaper'),
  ['-i', ...(mergedOnly ? [tmpMerged] : []), tmpOthers, 'combine-files',
   ...(mergedOnly ? ['-dissolve', 'gid', 'copy-fields=id,name,nameKo,adm0,owner', 'target=1'] : []),
   '-merge-layers', 'target=*', 'name=provinces', '-filter-fields', 'id,name,nameKo,adm0,owner',
   '-simplify', SIMPLIFY, 'keep-shapes',
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
const provArea = topoFc.features.map((f) => (f.geometry ? areaKm2(f.geometry) : 0));
const histWarnings = [];
// ---- 5c. 자잘한 채움 나라를 이웃 큰 나라에 합치기 ----
// 채우기로 만든 나라 중 땅이 작은 것(아프리카 해안의 소왕국들, 북미 부족들 …)은 땅이 맞닿은 채움 나라 가운데 가장 긴 경계를 가진 나라에 합친다.
// 유럽은 합치지 않는다(독일·이탈리아의 작은 나라들은 일부러 나눈 것). 시베리아(러시아 동부)는 훨씬 큼직하게 묶는다.
const FRAG = { min: 200_000, cap: 700_000, sibMin: 1_800_000, sibCap: 3_800_000 };
const isSiberia = (i) => geoms[i].properties.adm0 === 'RUS' && centers[i][0] > 55 && centers[i][1] > 50;
const contOf = (i) => (geoms[i].properties.adm0 === 'RUS' && centers[i][0] > 60 ? 'Asia' : countries.get(geoms[i].properties.adm0)?.continent ?? ''); // 러시아는 통째로 유럽으로 분류돼 있어 우랄 동쪽은 아시아로 본다
function mergeFragments(owner, pol, tag) {
  const merged = [];
  for (let pass = 0; pass < 8; pass++) {
    const mem = new Map();
    owner.forEach((o, i) => { if (!mem.has(o)) mem.set(o, []); mem.get(o).push(i); });
    const info = (o) => { const list = mem.get(o) ?? []; const sib = list.length > 0 && list.every(isSiberia); return { list, sib, area: list.reduce((a, i) => a + provArea[i], 0) }; };
    const movable = (o) => { const p = pol[o], l = mem.get(o) ?? []; return p.filled && !p.neutral && !p.npc && l.length > 0 && l.every((i) => contOf(i) !== 'Europe'); };
    const cands = [...mem.keys()].filter(movable).map((o) => ({ o, ...info(o) })).filter((c) => c.area < (c.sib ? FRAG.sibMin : FRAG.min)).sort((a, b) => a.area - b.area);
    let changed = false;
    for (const t of cands) {
      if (!movable(t.o) || (mem.get(t.o) ?? []).length === 0) continue;
      const cur = info(t.o);
      const border = new Map();
      for (const i of cur.list) for (const j of nb[i]) { const q = owner[j]; if (q !== t.o) border.set(q, (border.get(q) ?? 0) + 1); }
      let best = -1, bs = 0;
      for (const [q, w] of border) {
        if (!movable(q)) continue;
        const iq = info(q); if (iq.sib !== cur.sib) continue;
        if (iq.area + cur.area > (cur.sib ? FRAG.sibCap : FRAG.cap)) continue;
        const score = w * 1e6 + iq.area / 1e3;
        if (score > bs) { bs = score; best = q; }
      }
      if (best < 0) continue;
      // 국가다운 이름(칸국·왕국·공국 …)이 부족·민족 이름에 먹히지 않게: 작은 쪽이 국가이고 큰 쪽이 부족이면 역할을 바꿔 국가 이름으로 합친다
      const stateLike = (o) => /(칸국|왕국|제국|술탄국|공국|에미르국|이맘국|칼리프국|왕조|공화국|선제후국|백국|오르다|연합|연맹|제후국)$/.test(pol[o].nameKo ?? '');
      let absorber = best, absorbed = t.o, list = cur.list;
      if (stateLike(t.o) && !stateLike(best) && info(best).area + cur.area <= (cur.sib ? FRAG.sibCap : FRAG.cap)) { absorber = t.o; absorbed = best; list = info(best).list; }
      for (const i of list) owner[i] = absorber;
      const into = pol[absorber], from = pol[absorbed];
      into.aliases = [...new Set([...(into.aliases ?? []), from.nameKo, ...(from.aliases ?? [])])].slice(0, 14);
      merged.push(`${from.nameKo}→${into.nameKo}`);
      mem.set(absorber, [...(mem.get(absorber) ?? []), ...list]); mem.set(absorbed, []);
      changed = true;
    }
    if (!changed) break;
  }
  // 땅이 없어진 채움 나라는 목록에서 뺀다(owner 번호를 다시 매긴다)
  const alive = new Set(owner);
  const remap = new Map(); const kept = [];
  pol.forEach((p, i) => { if (alive.has(i) || !p.filled) { remap.set(i, kept.length); kept.push(p); } });
  owner.forEach((o, i) => { owner[i] = remap.get(o); });
  pol.length = 0; pol.push(...kept);
  return merged;
}
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
  if (sel.box) { const [x, y] = origCenter.get(g.id) ?? centers[i]; if (x < sel.box[0] || x > sel.box[2] || y < sel.box[1] || y > sel.box[3]) return false; }
  if (sel.names && !sel.names.some((n) => (g.name || '').toLowerCase().includes(n.toLowerCase()))) return false;
  if (sel.ids && !sel.ids.some((x) => aliasOf(x).includes(g.id))) return false;
  return true;
};
const scaleStats = (st, k) => ({ stability: st.stability, economy: Math.round(st.economy * k), military: Math.round(st.military * k), influence: Math.round(st.influence * k) });
const toStats = (a) => ({ stability: a[0], economy: a[1], military: a[2], influence: a[3] });

// 지역 세력은 회색 쪽으로 섞은 차분한 색: 그 시대의 주역 국가가 눈에 띄게, 그래도 서로는 구분되게
const muted = (hex) => { const n = parseInt(hex.slice(1), 16), g = [0x7a, 0x80, 0x8c], k = 0.62;
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * (1 - k) + g[i] * k).toString(16).padStart(2, '0')).join(''); };
// 채우기 국가의 자동 색: 이름 해시로 고른 색상, 강한 나라일수록 선명하게
const autoColor = (id, st) => { const h = hash(id) % 360, power = st ? (st[1] + st[2] + st[3]) / 3 : 30;
  const sat = power >= 45 ? 0.5 : power >= 30 ? 0.36 : 0.24, l = 0.5;
  const f = (n) => { const k = (n + h / 30) % 12, a = sat * Math.min(l, 1 - l); return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`; };
function compileHistory(def) {
  const tag = def.id;
  const fill = def._fill ?? { polities: {}, paint: [] };
  for (const id of Object.keys(fill.polities)) if (def.polities[id]) throw new Error(`[${tag}] fill: 템플릿 국가와 ID 충돌 ${id}`);
  // 나라 이름 뒤에는 "( … )" 설명을 붙이지 않는다: 괄호는 떼고, 괄호 안 말은 명령어 인식용 별칭으로만 남긴다
  const stripParen = (d) => {
    const m = /^(.*?)\s*[(（]([^()（）]*)[)）]\s*(.*)$/.exec(d.n ?? '');
    if (!m) return d;
    const base = `${m[1]}${m[3] ? ` ${m[3]}` : ''}`.replace(/\s+/g, ' ').trim();
    const alias = [...(d.a ?? [])]; for (const x of m[2].split(/[·,、]/).map((v) => v.trim())) if (x.length >= 2 && !alias.includes(x)) alias.push(x);
    return { ...d, n: base || d.n, a: alias, _orig: d.n };
  };
  const polyDefs = Object.fromEntries(Object.entries({ ...def.polities, ...fill.polities }).map(([id, d]) => [id, stripParen(d)]));
  const seenNames = new Map();
  for (const [id, d] of Object.entries(polyDefs)) {
    if (seenNames.has(d.n)) { const o = polyDefs[seenNames.get(d.n)]; histWarnings.push(`[${tag}] 이름 겹침 "${d.n}": ${seenNames.get(d.n)}(${o._orig ?? o.n}) / ${id}(${d._orig ?? d.n})`); } else seenNames.set(d.n, id);
  }
  const pol = Object.entries(polyDefs).map(([id, d]) => ({
    id, name: d.e ?? d.n, nameKo: d.n, color: d.c ?? (d.neutral ? '#5b6577' : autoColor(id, d.s)), stats: d.neutral ? null : toStats(d.s), aliases: d.a ?? [], provinces: 0, ...(d.neutral ? { neutral: true } : {}),
    ...(d.p === false ? { npc: true } : {}), ...(fill.polities[id] ? { filled: true } : {}),
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
  // 채우기(fill): 템플릿이 칠하지 않은 땅에만, 그 시대의 실제 나라·부족 연맹 등을 칠한다(data/history/fill/<id>.mjs)
  for (const [pid, ...sels] of fill.paint ?? []) {
    if (!idxOf.has(pid)) throw new Error(`[${tag}] fill.paint: 알 수 없는 국가 ${pid}`);
    for (const raw of sels) {
      const sel = normSel(raw); let n = 0;
      for (const c of [...(sel.adm0 ?? []), ...(sel.any ?? [])]) if (!adm0Set.has(c) && !ownerSet.has(c)) histWarnings.push(`[${tag}] fill ${pid}: 알 수 없는 국가 코드 ${c}`);
      for (let i = 0; i < geoms.length; i++) if (owner[i] < 0 && matchSel(i, sel)) { owner[i] = idxOf.get(pid); n++; }
      if (n === 0 && !sel.soft) histWarnings.push(`[${tag}] fill ${pid}: 빈 땅을 하나도 잡지 못함 ${JSON.stringify(raw)}`);
    }
  }
  if (GAPS) {
    const by = new Map();
    for (let i = 0; i < geoms.length; i++) if (owner[i] < 0 && !NEUTRAL.has(geoms[i].properties.owner)) {
      const g = geoms[i].properties, k = g.adm0; if (!by.has(k)) by.set(k, []);
      by.get(k).push(`${g.name}(${centers[i].map((v) => v.toFixed(1)).join(',')})`);
    }
    console.log(`\n[GAPS ${tag}] 남은 빈 땅 ${[...by.values()].reduce((a, b) => a + b.length, 0)}주`);
    // 현대 나라 전체가 비었으면 한 줄로, 일부만 비었거나 HIST_GAPS=ISO,ISO 로 지정하면 주 이름과 중심 좌표까지
    const detail = new Set(process.env.HIST_GAPS.split(',').filter((x) => x.length === 3));
    for (const [k, list] of [...by.entries()].sort()) {
      const total = geoms.filter((g) => g.properties.adm0 === k).length, nm = countries.get(k)?.nameKo ?? countries.get(k)?.name ?? '';
      const idx = geoms.map((g, i) => (g.properties.adm0 === k && owner[i] < 0 ? i : -1)).filter((i) => i >= 0);
      const bb = idx.reduce((b, i) => [Math.min(b[0], centers[i][0]), Math.min(b[1], centers[i][1]), Math.max(b[2], centers[i][0]), Math.max(b[3], centers[i][1])], [999, 999, -999, -999]).map((v) => v.toFixed(0));
      const own = geoms[idx[0]].properties.owner;
      const auto = ((def.rest ?? 'unc') === 'modern' || (def.self ?? []).includes(own)) && !REST_NEVER.has(own) && !(def.restExclude ?? []).includes(own) && countries.has(own);
      if (auto) { console.log(`  ${k} ${nm}: [${list.length}주] → 그대로 두면 현대 나라 "${countries.get(own)?.nameKo ?? own}"(소속 ${own})로 채워짐. 그 시점에 실제 독립국이 아니었다면 채우기 필요`); continue; }
      console.log(list.length === total && !detail.has(k) ? `  ${k} ${nm}: 전체 ${total}주 비어 있음, 중심 범위 [${bb}]` : `  ${k} ${nm} [${list.length}/${total}주 비어 있음]: ${list.join('; ')}`);
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
  const mergedFrag = mergeFragments(owner, pol, tag);
  idxOf.clear(); pol.forEach((p, i) => idxOf.set(p.id, i));
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
    armies, generals, polities: pol, owners: ownerStr, _unc: owner.filter((o) => pol[o].neutral).length, _merged: mergedFrag.length,
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
  for (const def of histDefs) {
    if (ONLY && def.id !== ONLY) continue;
    historical.push(compileHistory(def));
  }
}
const allScenarios = [...scenarios, ...historical.map(({ _unc, _merged, ...h }) => h)];

const countryList = Object.keys(provCount).map((id) => {
  const base = countries.get(id) ?? { id, name: id, nameKo: null };
  const neutral = NEUTRAL.has(id);
  return {
    id, name: base.name, nameKo: base.nameKo, color: colorOf[id], provinces: provCount[id],
    pop: base.pop ?? 0, gdp: base.gdp ?? 0, continent: base.continent ?? '',
    ...(neutral ? { neutral: true } : { stats: statsFor({ id, pop: base.pop, gdp: base.gdp, income: base.income }) }),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

if (!DRY) fs.writeFileSync(path.join(OUT, 'countries.json'), JSON.stringify(countryList));
if (!DRY) fs.writeFileSync(path.join(OUT, 'adjacency.json'), JSON.stringify(adjacency));
if (!DRY) fs.writeFileSync(path.join(OUT, 'reach.json'), JSON.stringify(reach));
if (!DRY) fs.writeFileSync(path.join(OUT, 'scenarios.json'), JSON.stringify(allScenarios));
if (!DRY) fs.rmSync(path.join(OUT, 'scenario.json'), { force: true });

// ---- 7. 리포트 -------------------------------------------------------------
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log('\n=== build-map 결과 ===');
console.log(`주(province): ${geoms.length}  (admin-0 단일 주: ${singleProvince}, 수작업 패치: ${worldview.patches?.length ?? 0})`);
console.log(`국가: ${countryList.length} (중립 ${countryList.filter((c) => c.neutral).length})`);
console.log(`큰 주 쪼갬(${splitReport.length}개): ${splitReport.slice(0, 40).join(', ')}…`);
console.log(`작은 주 합침(${mergeReport.length}개국): ${mergeReport.join(', ')}`);
console.log(`빈 땅 메움: ${filled.length}건${filled.length ? ' -> ' + filled.join(' / ') : ''}`);
console.log(`정책 검증: ${worldview.expect.length}건 통과 · 색 구분 필수 ${worldview.mustDiffer?.length ?? 0}쌍 통과 · 근접국 색 충돌 ${nearConflicts}쌍`);
console.log(`시나리오 템플릿: 현대 ${scenarios.length}개 + 역사 ${historical.length}개`);
for (const h of historical) console.log(`  - ${h.id}: 국가 ${h.polities.length} (채움 ${h.polities.filter((p) => p.filled).length}, 남은 지역 세력 ${h.polities.filter((p) => p.regional).length}, 합친 작은 나라 ${h._merged}), 기타 세력 ${(h._unc / geoms.length * 100).toFixed(0)}%`);
if (histWarnings.length) console.log('\n[역사 규칙 경고]\n' + histWarnings.join('\n'));
console.log(`reach 평균 ${(reachTotal / geoms.length).toFixed(1)}개/주`);
console.log(`world.topo.json ${kb(outTopo)} · reach.json ${kb(path.join(OUT, 'reach.json'))} · countries.json ${kb(path.join(OUT, 'countries.json'))}`);
console.log('알려진 한계:', worldview.knownLimitations.join(' / '));
fs.rmSync(TMP, { recursive: true, force: true });
