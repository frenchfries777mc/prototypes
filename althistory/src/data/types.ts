export type CountryId = string;
export type ProvinceId = string;

export type StatKey = 'stability' | 'economy' | 'military' | 'influence';
export type Stats = Record<StatKey, number>;
export const STAT_KEYS: StatKey[] = ['stability', 'economy', 'military', 'influence'];
export const STAT_LABEL: Record<StatKey, string> = { stability: '안정', economy: '경제', military: '군사', influence: '영향력' };

export interface CountryMeta {
  id: CountryId; name: string; nameKo: string | null; color: string; provinces: number;
  neutral?: boolean; stats?: Stats; pop?: number; gdp?: number; continent?: string;
}
export interface ProvinceMeta { id: ProvinceId; name: string; nameKo: string | null; adm0: string; owner: CountryId }
export interface Scenario {
  id: string; name: string; startDate: string; tagline?: string; description?: string;
  alliances: { name: string; members: CountryId[] }[];
  relations: [CountryId, CountryId, number][];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface WorldData { topo: any; countries: CountryMeta[]; reach: number[][]; scenarios: Scenario[] }
