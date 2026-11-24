import type { CountryId, CountryMeta, ProvinceId, ProvinceMeta, Scenario, WorldData } from './types';

/** 정적 세계 데이터와 "현재 시나리오"에 따라 바뀌는 국가 목록/이름 색인. */
export class World {
  readonly provinces: ProvinceMeta[];
  readonly index = new Map<ProvinceId, number>();
  countries = new Map<CountryId, CountryMeta>();
  readonly reach: number[][];
  scenarios: Scenario[];
  active: Scenario;
  /** 소문자 이름 -> 국가 ID. 긴 이름부터 매칭하도록 정렬되어 있다. */
  countryNames: [string, CountryId][] = [];
  readonly provinceNames: [string, ProvinceId][];
  private modernCountries: CountryMeta[];

  constructor(data: WorldData) {
    this.reach = data.reach;
    this.scenarios = data.scenarios;
    this.modernCountries = data.countries;
    const geoms = data.topo.objects.provinces.geometries as { properties: ProvinceMeta }[];
    this.provinces = geoms.map((g) => g.properties);
    this.provinces.forEach((p, i) => this.index.set(p.id, i));
    const pn: [string, ProvinceId][] = [];
    for (const p of this.provinces) {
      for (const n of [p.name, p.nameKo]) if (n && n.length >= 2) pn.push([n.toLowerCase(), p.id]);
      // "부산광역시" -> "부산", "경기도" -> "경기": 행정 접미사를 뗀 별칭
      const short = p.nameKo?.replace(/(특별자치도|특별자치시|특별시|광역시|자치구|자치주|자치구|직할시|도|시|주|성|현|군|구)$/, '');
      if (short && short !== p.nameKo && short.length >= 2) pn.push([short, p.id]);
    }
    this.provinceNames = pn.sort((a, b) => b[0].length - a[0].length);
    this.active = data.scenarios[0];
    this.useScenario(this.active);
  }

  /** 현대 지도의 국가 정보(스튜디오의 "현대 주요국" 시작점용). */
  modernCountry(id: CountryId): CountryMeta | undefined { return this.modernCountries.find((c) => c.id === id); }

  get isHistorical(): boolean { return !!this.active.polities; }
  get countryList(): CountryMeta[] { return [...this.countries.values()]; }

  /** 시나리오를 바꾸면 국가 목록과 이름 색인이 그 시나리오 것으로 교체된다. */
  useScenario(sc: Scenario): void {
    this.active = sc;
    this.countries = new Map();
    const names: [string, CountryId][] = [];
    if (sc.polities) {
      const counts = new Map<number, number>();
      sc.owners?.forEach((o) => counts.set(o, (counts.get(o) ?? 0) + 1));
      sc.polities.forEach((pd, i) => {
        const meta: CountryMeta = {
          id: pd.id, name: pd.name, nameKo: pd.nameKo, color: pd.color, provinces: counts.get(i) ?? pd.provinces ?? 0,
          ...(pd.neutral ? { neutral: true } : { stats: pd.stats ?? { stability: 50, economy: 40, military: 30, influence: 20 } }),
        };
        this.countries.set(pd.id, meta);
        if (pd.neutral) return;
        for (const n of [pd.name, pd.nameKo, ...(pd.aliases ?? [])]) if (n && n.length >= 2) names.push([n.toLowerCase(), pd.id]);
      });
    } else {
      for (const c of this.modernCountries) {
        this.countries.set(c.id, c);
        if (c.neutral) continue;
        for (const n of [c.name, c.nameKo]) if (n && n.length >= 2) names.push([n.toLowerCase(), c.id]);
      }
      const alias: Record<string, CountryId> = {
        '미국': 'USA', 'usa': 'USA', 'us': 'USA', '영국': 'GBR', 'uk': 'GBR', '중국': 'CHN', 'china': 'CHN', '러시아': 'RUS',
        '한국': 'KOR', '남한': 'KOR', '북한': 'PRK', '대만': 'TWN', 'taiwan': 'TWN', '일본': 'JPN', '독일': 'DEU', '프랑스': 'FRA',
        '인도': 'IND', '파키스탄': 'PAK', '이란': 'IRN', '이스라엘': 'ISR', '튀르키예': 'TUR', '터키': 'TUR', '우크라이나': 'UKR',
      };
      for (const [k, v] of Object.entries(alias)) if (this.countries.has(v)) names.push([k, v]);
    }
    this.countryNames = names.sort((a, b) => b[0].length - a[0].length);
  }

  /** 현재 시나리오의 시작 소유 상태. */
  initialOwners(): Record<ProvinceId, CountryId> {
    const out: Record<string, string> = {};
    const sc = this.active;
    this.provinces.forEach((p, i) => {
      out[p.id] = sc.polities && sc.owners ? (sc.polities[sc.owners[i]]?.id ?? p.owner) : p.owner;
    });
    return out;
  }

  /** 현재 시나리오에서 이 주의 시작 소유국(역사 템플릿이면 그 시대 국가). */
  startOwner(id: ProvinceId): CountryId | undefined {
    const i = this.index.get(id); if (i === undefined) return undefined;
    const sc = this.active;
    return sc.polities && sc.owners ? (sc.polities[sc.owners[i]]?.id ?? this.provinces[i].owner) : this.provinces[i].owner;
  }
  country(id: CountryId): CountryMeta | undefined { return this.countries.get(id); }
  /** 화면 표시용 이름: 한국어 이름, 없으면 영문명. */
  label(id: CountryId): string { const c = this.countries.get(id); return c ? (c.nameKo || c.name) : id; }
  province(id: ProvinceId): ProvinceMeta | undefined { const i = this.index.get(id); return i === undefined ? undefined : this.provinces[i]; }
  provLabel(id: ProvinceId): string { const p = this.province(id); return p ? (p.nameKo || p.name) : id; }

  /** 텍스트에서 언급된 국가를 등장 순서대로(중복 제거) 찾는다. */
  findCountries(text: string): CountryId[] {
    const t = text.toLowerCase();
    const hits: { pos: number; id: CountryId }[] = [];
    const taken: [number, number][] = [];
    for (const [name, id] of this.countryNames) {
      let from = 0;
      while (true) {
        const pos = t.indexOf(name, from);
        if (pos < 0) break;
        from = pos + name.length;
        if (name.length <= 3 && /[a-z]/.test(name)) {
          const before = t[pos - 1], after = t[pos + name.length];
          if ((before && /[a-z]/.test(before)) || (after && /[a-z]/.test(after))) continue;
        }
        if (taken.some(([s, e]) => pos < e && pos + name.length > s)) continue;
        taken.push([pos, pos + name.length]);
        hits.push({ pos, id });
      }
    }
    hits.sort((a, b) => a.pos - b.pos);
    return [...new Set(hits.map((h) => h.id))];
  }

  /** 텍스트에서 언급된 주(province)를 찾는다. */
  findProvinces(text: string): ProvinceId[] {
    const t = text.toLowerCase();
    const out: ProvinceId[] = [];
    const taken: [number, number][] = [];
    for (const [name, id] of this.provinceNames) {
      if (name.length < 2 || (name.length < 3 && /^[a-z]/.test(name))) continue; // 한글 두 글자 지명(부산, 서울)은 허용
      const pos = t.indexOf(name);
      if (pos < 0 || taken.some(([s, e]) => pos < e && pos + name.length > s)) continue;
      taken.push([pos, pos + name.length]);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }
}
