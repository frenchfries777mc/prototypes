import { Map as MapLibreMap, Marker, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import type { MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { CountryId, CountryMeta, ProvinceId, WorldData } from '../data/types';

interface Props {
  id: string; name: string; nameKo: string | null; adm0: string;
  owner: string; controller: string; color: string; ownerColor: string;
}
type BBox = [number, number, number, number];
const OCEAN = '#0b1626';

export interface ArmyMarker { id: string; at: ProvinceId; title: string; color: string; kind: 'mine' | 'enemy' | 'other'; navy: boolean; troops: number }
export interface MapViewOptions { container: string; workerUrl: string; data: WorldData }

/** 지도 표시 전담. 게임 규칙은 모르고, "누가 어느 주를 소유/지배하는가"만 받아서 칠한다. */
export class MapView {
  readonly map: MapLibreMap;
  onProvinceClick: (id: ProvinceId) => void = () => {};
  onArmyClick: (id: string) => void = () => {};
  private markers = new Map<string, { m: Marker; el: HTMLButtonElement }>();
  padding = { top: 40, bottom: 40, left: 360, right: 40 };

  private fc: FeatureCollection<Geometry, Props>;
  private topo: WorldData['topo'];
  private colors = new Map<CountryId, string>();
  private ctrl: Record<string, string> = {};
  private bbox = new Map<ProvinceId, BBox>();
  private micro: { id: ProvinceId; pt: [number, number] }[] = [];
  private ready = false;
  private microOn = true;

  private constructor(map: MapLibreMap, data: WorldData, countries: CountryMeta[]) {
    this.map = map; this.topo = data.topo;
    for (const c of countries) this.colors.set(c.id, c.color);
    this.fc = feature(data.topo, data.topo.objects.provinces) as unknown as FeatureCollection<Geometry, Props>;
    // topojson 은 properties 객체를 원본과 공유한다. 칠할 때 owner/color 를 덮어쓰므로 반드시 복사해서 쓴다(World 의 "현대 기준 소유국"이 오염되지 않게).
    for (const f of this.fc.features) f.properties = { ...f.properties };
  }

  static async create(opts: MapViewOptions): Promise<MapView> {
    setWorkerUrl(opts.workerUrl);
    const map = new MapLibreMap({
      container: opts.container,
      style: { version: 8, sources: {}, layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': OCEAN } }] },
      center: [15, 25], zoom: 1.4, minZoom: 0.6, maxZoom: 9, dragRotate: false, pitchWithRotate: false, attributionControl: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');
    map.addControl(new AttributionControl({ compact: true, customAttribution: '지도 데이터: Natural Earth (퍼블릭 도메인)' }));
    await new Promise<void>((r) => map.on('load', () => r()));
    const v = new MapView(map, opts.data, opts.data.countries);
    v.init();
    return v;
  }

  private walk(c: unknown, b: BBox): void {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const x = c[0] as number, y = c[1] as number;
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    } else if (Array.isArray(c)) for (const x of c) this.walk(x, b);
  }

  private init(): void {
    const map = this.map;
    // 주별 경계 상자, 초소국 판별
    const ownerBox = new Map<string, BBox>();
    for (const f of this.fc.features) {
      const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
      if (f.geometry) this.walk((f.geometry as { coordinates: unknown }).coordinates, b);
      this.bbox.set(f.properties.id, b);
      const ob = ownerBox.get(f.properties.owner) ?? [Infinity, Infinity, -Infinity, -Infinity];
      ownerBox.set(f.properties.owner, [Math.min(ob[0], b[0]), Math.min(ob[1], b[1]), Math.max(ob[2], b[2]), Math.max(ob[3], b[3])]);
    }
    for (const f of this.fc.features) {
      const ob = ownerBox.get(f.properties.owner)!;
      if (ob[2] - ob[0] > 1.5 || ob[3] - ob[1] > 1.5 || f.properties.owner === 'ATA') continue;
      const b = this.bbox.get(f.properties.id)!;
      this.micro.push({ id: f.properties.id, pt: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] });
    }
    for (const f of this.fc.features) { this.ctrl[f.properties.id] = f.properties.owner; f.properties.controller = f.properties.owner; }
    this.paint();

    const empty = { type: 'FeatureCollection', features: [] } as FeatureCollection;
    map.addSource('provinces', { type: 'geojson', data: this.fc, promoteId: 'id' });
    map.addSource('country-borders', { type: 'geojson', data: empty });
    map.addSource('province-borders', { type: 'geojson', data: empty });
    map.addSource('coast', { type: 'geojson', data: empty });
    map.addSource('micro', { type: 'geojson', data: empty });

    map.addLayer({ id: 'prov-fill', type: 'fill', source: 'provinces', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.9 } });
    map.addLayer({ id: 'player-fill', type: 'fill', source: 'provinces', filter: ['==', ['get', 'controller'], ''], paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'owner-highlight', type: 'fill', source: 'provinces', filter: ['==', ['get', 'controller'], ''], paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.12 } });
    map.addLayer({ id: 'prov-lines', type: 'line', source: 'province-borders', paint: { 'line-color': '#0b1626', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.2, 6, 0.9] } });
    map.addLayer({ id: 'coast-lines', type: 'line', source: 'coast', paint: { 'line-color': '#0b1626', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 1] } });
    map.addLayer({ id: 'country-lines', type: 'line', source: 'country-borders', paint: { 'line-color': '#0b1626', 'line-opacity': 0.95, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 6, 2.2] } });
    // 점령지: 소유국 색의 점선 테두리
    map.addLayer({ id: 'occupied-line', type: 'line', source: 'provinces', filter: ['!=', ['get', 'owner'], ['get', 'controller']],
      paint: { 'line-color': ['get', 'ownerColor'], 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 6, 3], 'line-dasharray': [2, 1.2] } });
    // 호버·선택 테두리는 필터가 아니라 feature-state 로 켠다: setFilter 는 타일을 다시 계산해서 커서보다 늦게
    // 따라오며 중간 주들을 거쳐 오는 것처럼 보이지만, feature-state 는 즉시 반영된다.
    const stateLine = (key: string, color: string, width: number) => ({ id: `${key}-line`, type: 'line' as const, source: 'provinces',
      paint: { 'line-color': color, 'line-width': ['case', ['boolean', ['feature-state', key], false], width, 0] as never, 'line-opacity': ['case', ['boolean', ['feature-state', key], false], 1, 0] as never, 'line-opacity-transition': { duration: 0 }, 'line-width-transition': { duration: 0 } } });
    map.addLayer(stateLine('hover', '#ffffff', 1.8));
    map.addLayer(stateLine('select', '#ffd24d', 2.6));
    map.addLayer({ id: 'micro-dots', type: 'circle', source: 'micro', paint: {
      'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 6, 6],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } });
    this.ready = true;
    this.refreshGeometryLayers();

    // 커서가 있는 주에 테두리를 바로 켠다(이전 주는 바로 끈다)
    let hover = '';
    const setHover = (id: string) => {
      if (id === hover) return;
      if (hover) map.setFeatureState({ source: 'provinces', id: hover }, { hover: false });
      hover = id;
      if (id) map.setFeatureState({ source: 'provinces', id }, { hover: true });
    };
    map.on('mousemove', (e: MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['prov-fill'] })[0];
      setHover(f ? (f.properties as Props).id : '');
      map.getCanvas().style.cursor = f ? 'pointer' : '';
    });
    map.on('mouseout', () => { setHover(''); map.getCanvas().style.cursor = ''; });
    map.on('click', (e: MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['micro-dots'] })[0] ?? map.queryRenderedFeatures(e.point, { layers: ['prov-fill'] })[0];
      if (f) this.onProvinceClick((f.properties as Props).id);
    });
  }

  /** 주마다 색(지배국)과 점령 시 소유국 색을 입력. */
  private paint(): void {
    for (const f of this.fc.features) {
      const p = f.properties;
      p.controller = this.ctrl[p.id] ?? p.owner;
      p.color = this.colors.get(p.controller) ?? '#555';
      p.ownerColor = this.colors.get(p.owner) ?? '#555';
    }
  }

  private refreshGeometryLayers(): void {
    const ctrl = this.ctrl;
    const c = (g: unknown) => ctrl[(g as { properties: Props }).properties.id];
    const set = (id: string, data: unknown) => (this.map.getSource(id) as unknown as { setData(d: unknown): void }).setData(data);
    set('country-borders', mesh(this.topo, this.topo.objects.provinces, (a: unknown, b: unknown) => a !== b && c(a) !== c(b)));
    set('province-borders', mesh(this.topo, this.topo.objects.provinces, (a: unknown, b: unknown) => a !== b && c(a) === c(b)));
    set('coast', mesh(this.topo, this.topo.objects.provinces, (a: unknown, b: unknown) => a === b));
    set('micro', {
      type: 'FeatureCollection',
      features: (this.microOn ? this.micro : []).map((m) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: m.pt },
        properties: { id: m.id, color: this.colors.get(ctrl[m.id]) ?? '#555' },
      })) as Feature[],
    });
  }

  /** 소유/지배 상태를 통째로 반영한다 (영토가 바뀐 턴, 새 게임, 불러오기). */
  setControl(owner: Record<string, string>, controller: Record<string, string>, opts: { borders?: boolean } = {}): void {
    for (const f of this.fc.features) { f.properties.owner = owner[f.properties.id] ?? f.properties.owner; }
    this.ctrl = { ...controller };
    this.paint();
    if (!this.ready) return;
    (this.map.getSource('provinces') as unknown as { setData(d: unknown): void }).setData(this.fc);
    if (opts.borders !== false) this.refreshGeometryLayers();
  }

  /** 편집기처럼 칠하기만 빠르게 하고 국경선은 나중에 한 번에 다시 계산할 때 쓴다. */
  refreshBorders(): void { if (this.ready) this.refreshGeometryLayers(); }
  /** 시나리오가 바뀌면 국가 색을 그 시나리오 것으로 교체한다. */
  setColors(list: CountryMeta[]): void { this.colors = new Map(list.map((c) => [c.id, c.color])); }
  /** 초소국 점마커는 현대 시나리오에서만 쓴다. */
  setMicro(on: boolean): void { this.microOn = on; this.refreshBorders(); }
  /** 군대 마커를 그린다(HTML 마커라서 글자·클릭이 된다). 같은 주의 군대는 조금씩 어긋나게 쌓는다. */
  setArmies(list: ArmyMarker[]): void {
    const stack = new Map<string, number>();
    const alive = new Set<string>();
    for (const a of list) {
      const c = this.centerOf(a.at);
      if (!c) continue;
      const k = stack.get(a.at) ?? 0; stack.set(a.at, k + 1);
      const off: [number, number] = [((k % 3) - 1) * 17, Math.floor(k / 3) * 19 - 6];
      alive.add(a.id);
      let e = this.markers.get(a.id);
      if (!e) {
        const el = document.createElement('button'); el.type = 'button';
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.onArmyClick(a.id); });
        const m = new Marker({ element: el, offset: off }).setLngLat(c).addTo(this.map);
        e = { m, el }; this.markers.set(a.id, e);
      } else { e.m.setLngLat(c); e.m.setOffset(off); }
      e.el.className = `army-mk ${a.kind}${a.navy ? ' navy' : ''}`;
      e.el.style.setProperty('--c', a.color);
      e.el.textContent = String(Math.max(1, Math.round(a.troops)));
      e.el.title = a.title;
    }
    for (const [id, e] of this.markers) if (!alive.has(id)) { e.m.remove(); this.markers.delete(id); }
  }

  /** 주별 지오메트리(경위도) — 템플릿 썸네일용. 주 순서는 World.provinces 와 같다. */
  geometries(): ({ type: string; coordinates: unknown } | null)[] { return this.fc.features.map((f) => f.geometry as unknown as { type: string; coordinates: unknown } | null); }

  /** 주 ID -> 경계 상자(경도 최소, 위도 최소, 경도 최대, 위도 최대). */
  boxOf(id: ProvinceId): BBox | undefined { return this.bbox.get(id); }
  /** 주의 중심(마커 배치용). */
  centerOf(id: ProvinceId): [number, number] | undefined { const b = this.bbox.get(id); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : undefined; }

  setPlayer(cid: CountryId | null): void { this.map.setFilter('player-fill', ['==', ['get', 'controller'], cid ?? '']); }
  setHighlightCountry(cid: CountryId | null): void { this.map.setFilter('owner-highlight', ['==', ['get', 'controller'], cid ?? '']); }
  private selected = '';
  setSelectedProvince(id: ProvinceId | null): void {
    if (this.selected) this.map.setFeatureState({ source: 'provinces', id: this.selected }, { select: false });
    this.selected = id ?? '';
    if (this.selected) this.map.setFeatureState({ source: 'provinces', id: this.selected }, { select: true });
  }

  /** 국가 본토 쪽 영역으로 이동(해외 영토가 멀리 있어도 본토 위주). */
  fitCountry(cid: CountryId, animate = true): void {
    const items = this.fc.features.filter((f) => f.properties.controller === cid && f.properties.id in this.ctrl).map((f) => ({ id: f.properties.id, b: this.bbox.get(f.properties.id)! }));
    if (!items.length) return;
    const area = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);
    const anchor = items.reduce((m, x) => (area(x.b) > area(m.b) ? x : m));
    const ax = (anchor.b[0] + anchor.b[2]) / 2, ay = (anchor.b[1] + anchor.b[3]) / 2;
    const box: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const it of items) {
      const cx = (it.b[0] + it.b[2]) / 2, cy = (it.b[1] + it.b[3]) / 2;
      if (Math.abs(cx - ax) > 45 || Math.abs(cy - ay) > 30) continue;
      box[0] = Math.min(box[0], it.b[0]); box[1] = Math.min(box[1], it.b[1]); box[2] = Math.max(box[2], it.b[2]); box[3] = Math.max(box[3], it.b[3]);
    }
    this.fitBox(box, animate);
  }
  fitBox(b: BBox, animate = true): void {
    this.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: this.padding, duration: animate ? 900 : 0, maxZoom: 6 });
  }
  fitProvince(id: ProvinceId, animate = true): void { const b = this.bbox.get(id); if (b) this.fitBox([b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1], animate); }
}
