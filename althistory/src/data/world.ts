import type { CountryId, CountryMeta, ProvinceId, ProvinceMeta, Scenario, WorldData } from './types';

/** 정적 세계 데이터(저장되지 않는 부분)와 조회 도우미. */
export class World {
  readonly provinces: ProvinceMeta[];
  readonly index = new Map<ProvinceId, number>();
  readonly countries = new Map<CountryId, CountryMeta>();
  readonly reach: number[][];
  readonly scenarios: Scenario[];
  /** 소문자 이름 -> 국가 ID. 긴 이름부터 매칭하도록 정렬되어 있다. */
  readonly countryNames: [string, CountryId][];
  readonly provinceNames: [string, ProvinceId][];

  constructor(data: WorldData) {
    this.reach = data.reach;
    this.scenarios = data.scenarios;
    for (const c of data.countries) this.countries.set(c.id, c);
    const geoms = data.topo.objects.provinces.geometries as { properties: ProvinceMeta }[];
    this.provinces = geoms.map((g) => g.properties);
    this.provinces.forEach((p, i) => this.index.set(p.id, i));

    const cn: [string, CountryId][] = [];
    for (const c of data.countries) {
      if (c.neutral) continue;
      for (const n of [c.name, c.nameKo]) if (n && n.length >= 2) cn.push([n.toLowerCase(), c.id]);
    }
    // 흔한 별칭
    const alias: Record<string, CountryId> = {
      '미국': 'USA', 'usa': 'USA', 'us': 'USA', '영국': 'GBR', 'uk': 'GBR', '중국': 'CHN', 'china': 'CHN', '러시아': 'RUS',
      '한국': 'KOR', '남한': 'KOR', '북한': 'PRK', '대만': 'TWN', 'taiwan': 'TWN', '일본': 'JPN', '독일': 'DEU', '프랑스': 'FRA',
      '인도': 'IND', '파키스탄': 'PAK', '이란': 'IRN', '이스라엘': 'ISR', '튀르키예': 'TUR', '터키': 'TUR', '우크라이나': 'UKR',
    };
    for (const [k, v] of Object.entries(alias)) if (this.countries.has(v)) cn.push([k, v]);
    this.countryNames = cn.sort((a, b) => b[0].length - a[0].length);

    const pn: [string, ProvinceId][] = [];
    for (const p of this.provinces) for (const n of [p.name, p.nameKo]) if (n && n.length >= 2) pn.push([n.toLowerCase(), p.id]);
    this.provinceNames = pn.sort((a, b) => b[0].length - a[0].length);
  }

  country(id: CountryId): CountryMeta | undefined { return this.countries.get(id); }
  /** 화면 표시용 이름: "대한민국" 또는 영문명. */
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
        if (name.length <= 3 && /[a-z]/.test(name)) { // 짧은 영문은 단어 경계만
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

  /** 텍스트에서 언급된 주(province)를 찾는다. 국가명과 겹치는 이름(싱가포르 등)은 제외하지 않는다. */
  findProvinces(text: string): ProvinceId[] {
    const t = text.toLowerCase();
    const out: ProvinceId[] = [];
    const taken: [number, number][] = [];
    for (const [name, id] of this.provinceNames) {
      if (name.length < 3) continue;
      const pos = t.indexOf(name);
      if (pos < 0 || taken.some(([s, e]) => pos < e && pos + name.length > s)) continue;
      taken.push([pos, pos + name.length]);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }
}
