export type CountryId = string;
export type ProvinceId = string;

export type StatKey = 'stability' | 'economy' | 'military' | 'influence';
export type Stats = Record<StatKey, number>;
export const STAT_KEYS: StatKey[] = ['stability', 'economy', 'military', 'influence'];
/** 화면에 보이는 능력치. 안정도(stability)는 숨은 변수라 UI·신문에 내지 않는다. */
export const SHOWN_STATS: StatKey[] = ['economy', 'military', 'influence'];
export const STAT_LABEL: Record<StatKey, string> = { stability: '안정', economy: '경제', military: '군사', influence: '영향력' };

export interface CountryMeta {
  id: CountryId; name: string; nameKo: string | null; color: string; provinces: number;
  neutral?: boolean; stats?: Stats; pop?: number; gdp?: number; continent?: string;
}
export interface ProvinceMeta { id: ProvinceId; name: string; nameKo: string | null; adm0: string; owner: CountryId }
export interface PolityDef {
  id: CountryId; name: string; nameKo: string | null; color: string; stats: Stats | null;
  aliases?: string[]; provinces?: number; neutral?: boolean; npc?: boolean; regional?: boolean;
}
export interface ArmyDef {
  c: CountryId; n: string; g: string; skill?: number; trait?: string; troops: number; at: ProvinceId; navy?: boolean;
}
export interface Bonus { country: CountryId; words: string[]; bonus: number; note?: string }
export interface Scenario {
  id: string; name: string; startDate: string; tagline?: string; description?: string;
  year?: string; era?: string; briefing?: string; gmNotes?: string; turnMonths?: number; focus?: [number, number, number, number] | null;
  alliances: { name: string; members: CountryId[] }[];
  relations: [CountryId, CountryId, number][];
  /** 역사/사용자 템플릿: 시나리오 전용 국가 목록과 주별 소유 국가(주 순서와 같은 인덱스 -> polities 인덱스) */
  polities?: PolityDef[]; owners?: number[];
  wars?: [CountryId, CountryId][]; milMod?: Record<CountryId, number>; bonuses?: Bonus[];
  armies?: ArmyDef[];
  /** 군대가 자동 생성되는 나라에 순서대로 배정할 장군 이름 풀 */
  generals?: Record<CountryId, { n: string; skill?: number; trait?: string }[]>;
  author?: string; custom?: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface WorldData { topo: any; countries: CountryMeta[]; reach: number[][]; scenarios: Scenario[] }
