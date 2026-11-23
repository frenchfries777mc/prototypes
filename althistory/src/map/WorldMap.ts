import { Map as MapLibreMap, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl';
// Vite 번들에서는 MapLibre 가 기본 워커 경로를 못 찾는다. 워커 파일을 에셋으로 내보내고 URL 을 직접 지정한다.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

interface ProvProps {
  id: string; name: string; nameKo: string | null; adm0: string; owner: string; color?: string;
}
interface Country { id: string; name: string; nameKo: string | null; color: string; provinces: number }
// topojson 지오메트리: properties 를 유지한다 (mapshaper 출력).
type TopoGeom = { properties: ProvProps };

export interface WorldMapOptions {
  container: string;
  base: string;
  onStatus: (msg: string, isError?: boolean) => void;
}

const OCEAN = '#0b1626';

// "정책 확인" 책갈피: [경도 최소, 위도 최소, 경도 최대, 위도 최대]
const BOOKMARKS: { label: string; bbox: [number, number, number, number] }[] = [
  { label: '대만', bbox: [118.0, 21.5, 123.0, 26.2] },
  { label: '크림', bbox: [31.5, 43.5, 37.0, 47.0] },
  { label: '카슈미르', bbox: [70.5, 31.0, 82.0, 38.0] },
  { label: '한반도', bbox: [123.5, 32.5, 132.0, 43.5] },
  { label: '유럽', bbox: [-12, 34, 42, 71] },
  { label: '세계', bbox: [-170, -57, 190, 78] },
];

export async function createWorldMap(opts: WorldMapOptions) {
  const { base, onStatus } = opts;

  const [topo, countries] = await Promise.all([
    fetch(`${base}data/world.topo.json`).then((r) => { if (!r.ok) throw new Error(`world.topo.json ${r.status}`); return r.json(); }),
    fetch(`${base}data/countries.json`).then((r) => { if (!r.ok) throw new Error(`countries.json ${r.status}`); return r.json() as Promise<Country[]>; }),
  ]);
  const obj = topo.objects.provinces;
  const countryById = new Map(countries.map((c) => [c.id, c]));

  // 소유국 색을 각 주에 입력. (소유권이 바뀌면 이 단계만 다시 실행하면 된다.)
  const fc = feature(topo, obj) as unknown as FeatureCollection<Geometry, ProvProps>;
  for (const f of fc.features) f.properties.color = countryById.get(f.properties.owner)?.color ?? '#555';

  // 국경선은 "소유국이 다른 이웃 주 사이"를 런타임에 계산한다. 영토가 바뀌어도 그대로 재사용 가능.
  const geomOwner = (g: unknown) => (g as TopoGeom).properties.owner;
  const countryBorders = mesh(topo, obj, (a: unknown, b: unknown) => a !== b && geomOwner(a) !== geomOwner(b));
  const provinceBorders = mesh(topo, obj, (a: unknown, b: unknown) => a !== b && geomOwner(a) === geomOwner(b));
  const coast = mesh(topo, obj, (a: unknown, b: unknown) => a === b);

  setWorkerUrl(workerUrl);
  const map = new MapLibreMap({
    container: opts.container,
    style: { version: 8, sources: {}, layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': OCEAN } }] },
    center: [15, 25], zoom: 1.4, minZoom: 0.6, maxZoom: 9,
    dragRotate: false, pitchWithRotate: false, attributionControl: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new AttributionControl({ compact: true, customAttribution: '지도 데이터: Natural Earth (퍼블릭 도메인)' }));

  await new Promise<void>((resolve) => map.on('load', () => resolve()));

  map.addSource('provinces', { type: 'geojson', data: fc, promoteId: 'id' });
  map.addSource('country-borders', { type: 'geojson', data: countryBorders as unknown as Feature });
  map.addSource('province-borders', { type: 'geojson', data: provinceBorders as unknown as Feature });
  map.addSource('coast', { type: 'geojson', data: coast as unknown as Feature });

  map.addLayer({ id: 'prov-fill', type: 'fill', source: 'provinces',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.9 } });
  // 선택한 나라 전체를 살짝 밝게
  map.addLayer({ id: 'owner-highlight', type: 'fill', source: 'provinces', filter: ['==', ['get', 'owner'], ''],
    paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.16 } });
  map.addLayer({ id: 'prov-lines', type: 'line', source: 'province-borders',
    paint: { 'line-color': '#0b1626', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.2, 6, 0.9] } });
  map.addLayer({ id: 'coast-lines', type: 'line', source: 'coast',
    paint: { 'line-color': '#0b1626', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 1] } });
  map.addLayer({ id: 'country-lines', type: 'line', source: 'country-borders',
    paint: { 'line-color': '#0b1626', 'line-opacity': 0.95, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 6, 2.2] } });
  map.addLayer({ id: 'hover-line', type: 'line', source: 'provinces', filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#ffffff', 'line-width': 1.8 } });
  map.addLayer({ id: 'select-line', type: 'line', source: 'provinces', filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#ffd24d', 'line-width': 2.6 } });

  // ---- 상호작용 ----
  const info = document.getElementById('info')!;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const cname = (c?: Country) => (c ? `${esc(c.name)}${c.nameKo ? ` (${esc(c.nameKo)})` : ''}` : '?');

  function showProvince(p: ProvProps) {
    const owner = countryById.get(p.owner);
    info.classList.remove('empty');
    info.innerHTML = `
      <div class="name">${esc(p.name)}</div>
      <div class="sub">${p.nameKo ? esc(p.nameKo) + ' · ' : ''}${esc(p.id)}</div>
      <div class="kv">
        <span>소유국</span><span><i class="swatch" style="background:${owner?.color ?? '#555'}"></i>${cname(owner)}</span>
        <span>실효지배</span><span>${cname(owner)}</span>
        <span>국가 주 수</span><span>${owner?.provinces ?? '-'}</span>
      </div>`;
  }

  let hoverId = '';
  map.on('mousemove', 'prov-fill', (e: MapMouseEvent & { features?: { properties: unknown }[] }) => {
    const f = e.features?.[0];
    const id = (f?.properties as ProvProps | undefined)?.id ?? '';
    if (id !== hoverId) { hoverId = id; map.setFilter('hover-line', ['==', ['get', 'id'], id]); }
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'prov-fill', () => {
    hoverId = ''; map.setFilter('hover-line', ['==', ['get', 'id'], '']); map.getCanvas().style.cursor = '';
  });
  map.on('click', (e: MapMouseEvent) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['micro-dots'] })[0] ?? map.queryRenderedFeatures(e.point, { layers: ['prov-fill'] })[0];
    if (!f) return;
    const p = f.properties as ProvProps;
    map.setFilter('select-line', ['==', ['get', 'id'], p.id]);
    map.setFilter('owner-highlight', ['==', ['get', 'owner'], p.owner]);
    showProvince(p);
  });

  // ---- 국가 검색 + 책갈피 ----
  const ownerBBox = new Map<string, [number, number, number, number]>();
  const walk = (c: unknown, b: [number, number, number, number]) => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const x = c[0] as number, y = c[1] as number;
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    } else if (Array.isArray(c)) for (const x of c) walk(x, b);
  };
  for (const f of fc.features) {
    if (!f.geometry) continue; // 방어: 빌드 검증이 막지만, 데이터가 바뀌어도 앱이 죽지 않게 한다
    const b = ownerBBox.get(f.properties.owner) ?? [Infinity, Infinity, -Infinity, -Infinity];
    walk((f.geometry as { coordinates: unknown }).coordinates, b);
    ownerBBox.set(f.properties.owner, b);
  }

  // 초소국(바티칸, 모나코, 싱가포르 …)은 폴리곤이 화면에서 1픽셀도 안 되므로 클릭 가능한 점 마커를 둔다.
  // 기준: 나라 전체 영역이 1.5도 이하인 나라의 주.
  const microFeatures: Feature[] = [];
  for (const f of fc.features) {
    const bb = ownerBBox.get(f.properties.owner);
    if (!bb || !f.geometry) continue;
    if (bb[2] - bb[0] > 1.5 || bb[3] - bb[1] > 1.5) continue;
    const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    walk((f.geometry as { coordinates: unknown }).coordinates, b);
    microFeatures.push({ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] } });
  }
  map.addSource('micro', { type: 'geojson', data: { type: 'FeatureCollection', features: microFeatures } });
  map.addLayer({ id: 'micro-dots', type: 'circle', source: 'micro',
    paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 6, 6],
             'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } });

  const list = document.getElementById('country-list')!;
  const labelToId = new Map<string, string>();
  for (const c of countries) {
    for (const label of [c.name, c.nameKo].filter(Boolean) as string[]) {
      labelToId.set(label.toLowerCase(), c.id);
      const o = document.createElement('option'); o.value = label; list.appendChild(o);
    }
  }
  const fit = (bb: [number, number, number, number], animate = true) =>
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: { top: 40, bottom: 40, left: 360, right: 40 }, duration: animate ? 900 : 0, maxZoom: 7 });

  const search = document.getElementById('search') as HTMLInputElement;
  search.addEventListener('change', () => {
    const id = labelToId.get(search.value.trim().toLowerCase());
    const bb = id ? ownerBBox.get(id) : undefined;
    if (id && bb) {
      // 해외 영토가 섞인 나라(프랑스, 미국 등)는 본토 중심으로 보이도록 가장 큰 주의 bbox 를 쓰지 않고, 전체 bbox 를 쓰되 너무 넓으면 세계 보기로 둔다.
      fit(bb);
      map.setFilter('owner-highlight', ['==', ['get', 'owner'], id]);
    }
  });

  const chips = document.getElementById('chips')!;
  for (const bm of BOOKMARKS) {
    const btn = document.createElement('button');
    btn.textContent = bm.label;
    btn.addEventListener('click', () => fit(bm.bbox));
    chips.appendChild(btn);
  }

  onStatus(`주 ${fc.features.length.toLocaleString()}개 · 국가 ${countries.length}개 · Natural Earth`);
  (window as unknown as Record<string, unknown>).__map = map;
  (window as unknown as Record<string, unknown>).__fit = (bb: [number, number, number, number]) => fit(bb, false);
  (window as unknown as Record<string, unknown>).__ready = true;
  return map;
}
