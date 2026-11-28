import type { CountryId, ProvinceId, Scenario, StatKey, Stats } from '../data/types';
import type { Difficulty } from './difficulty';
import type { World } from '../data/world';

/** 한 턴 전후를 견준 보고(신문에 싣는다). 국가는 id. */
export interface TurnReport {
  stats: Record<StatKey, [number, number]>;
  terr: [number, number];
  gained: ProvinceId[]; lost: ProvinceId[];
  rel: { c: CountryId; from: number; to: number }[];
  warsStart: string[]; warsEnd: string[];
}
export interface TurnRecord {
  turn: number; date: string; command: string; interpretation: string;
  /** 실제로 굴림에 쓴 확률(난이도 보정 후). 보정 전 AI의 확률은 base. */
  feasibility: number; roll: number; outcome: 'success' | 'failure' | 'pass';
  narrative: string; headlines: string[]; notes: string[]; rejected: string[]; mode: string;
  base?: number; difficulty?: Difficulty; reasoning?: string;
  /** 플레이어 명령의 결과와 세계 사건을 나눠 담는다(신문의 기사 구분). 옛 저장 파일에는 없다. */
  main?: { narrative: string; headlines: string[] }; world?: { narrative: string; headlines: string[] };
  report?: TurnReport;
  /** 세력 AI·주변국의 행동과 반응 소식(신문의 외교 소식 맨 앞). alert: 호외를 낼 만한 큰 사건 */
  diplo?: string[]; alert?: boolean;
}

export interface General { name: string; skill: number; trait: string; status: 'active' | 'wounded'; hurtUntil?: number }
/** 병력 단위는 천 명. navy 는 함대(해상 이동 범위가 넓다). */
export interface Army { id: string; name: string; owner: CountryId; general: General; troops: number; morale: number; at: ProvinceId; navy?: boolean }

export interface GameState {
  v: 1; scenarioId: string; turnMonths: number; seed: number; rng: number; turn: number; date: string; playerId: CountryId;
  owner: Record<ProvinceId, CountryId>;
  controller: Record<ProvinceId, CountryId>;
  stats: Record<CountryId, Stats>;
  relations: Record<string, number>;
  wars: string[];
  eliminated: CountryId[];
  log: TurnRecord[];
  memory: string;
  armies: Army[];
  armySeq: number;
  difficulty?: Difficulty;
}

export const pairKey = (a: CountryId, b: CountryId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function newGame(world: World, playerId: CountryId, seed: number, scenario: Scenario): GameState {
  world.useScenario(scenario);
  const owner = world.initialOwners();
  const controller = { ...owner };
  const stats: Record<string, Stats> = {};
  for (const c of world.countries.values()) {
    if (c.neutral) continue;
    stats[c.id] = { ...(c.stats ?? { stability: 50, economy: 40, military: 30, influence: 20 }) };
  }
  const relations: Record<string, number> = {};
  for (const al of scenario.alliances) {
    for (let i = 0; i < al.members.length; i++) for (let j = i + 1; j < al.members.length; j++) relations[pairKey(al.members[i], al.members[j])] = 40;
  }
  for (const [a, b, v] of scenario.relations) relations[pairKey(a, b)] = v;
  const wars = (scenario.wars ?? []).filter(([a, b]) => a in stats && b in stats).map(([a, b]) => pairKey(a, b));
  return {
    v: 1, scenarioId: scenario.id, turnMonths: scenario.turnMonths ?? 1, seed, rng: seed >>> 0, turn: 1, date: scenario.startDate, playerId,
    owner, controller, stats, relations, wars, eliminated: [], log: [], memory: '', armies: [], armySeq: 1,
  };
}

export const armiesOf = (s: GameState, c: CountryId): Army[] => s.armies.filter((a) => a.owner === c && a.troops > 0);
export const totalTroops = (s: GameState, c: CountryId): number => armiesOf(s, c).reduce((t, a) => t + a.troops, 0);

export const getRel = (s: GameState, a: CountryId, b: CountryId): number => s.relations[pairKey(a, b)] ?? 0;
export const setRel = (s: GameState, a: CountryId, b: CountryId, v: number): void => { s.relations[pairKey(a, b)] = clamp(Math.round(v), -100, 100); };
export const isAtWar = (s: GameState, a: CountryId, b: CountryId): boolean => s.wars.includes(pairKey(a, b));
export const isAlive = (s: GameState, c: CountryId): boolean => !s.eliminated.includes(c) && c in s.stats;
export const warsOf = (s: GameState, c: CountryId): CountryId[] =>
  s.wars.filter((w) => w.split('|').includes(c)).map((w) => w.split('|').find((x) => x !== c)!);

/** 국가가 실효지배 중인 주 ID. */
export function controlledBy(s: GameState, c: CountryId): ProvinceId[] {
  const out: ProvinceId[] = [];
  for (const id in s.controller) if (s.controller[id] === c) out.push(id);
  return out;
}
export function ownedBy(s: GameState, c: CountryId): ProvinceId[] {
  const out: ProvinceId[] = [];
  for (const id in s.owner) if (s.owner[id] === c) out.push(id);
  return out;
}

/** 이 국가가 지배하는 주와 도달 범위가 겹치는 다른 국가들(이웃)과 그 접점 수. */
export function neighborsOf(s: GameState, w: World, c: CountryId): Map<CountryId, number> {
  const out = new Map<CountryId, number>();
  for (let i = 0; i < w.provinces.length; i++) {
    if (s.controller[w.provinces[i].id] !== c) continue;
    for (const j of w.reach[i]) {
      const o = s.controller[w.provinces[j].id];
      if (o !== c && o in s.stats) out.set(o, (out.get(o) ?? 0) + 1);
    }
  }
  return out;
}

/** "2026-01-01" 또는 기원전 "-0264-03-01" 형식의 날짜. */
export function parseDate(d: string): { y: number; m: number } {
  const m = /^(-?)(\d+)-(\d{2})/.exec(d);
  if (!m) return { y: 2000, m: 1 };
  return { y: (m[1] ? -1 : 1) * Number(m[2]), m: Number(m[3]) };
}
export function fmtDate(d: string): string {
  const { y, m } = parseDate(d);
  return y < 0 ? `기원전 ${-y}년 ${m}월` : `${y}년 ${m}월`;
}
export function addMonths(d: string, n: number): string {
  const { y, m } = parseDate(d);
  const total = y * 12 + (m - 1) + n;
  const y2 = Math.floor(total / 12), m2 = total - y2 * 12 + 1;
  return `${y2 < 0 ? '-' : ''}${String(Math.abs(y2)).padStart(4, '0')}-${String(m2).padStart(2, '0')}-01`;
}

export function cloneState(s: GameState): GameState { return JSON.parse(JSON.stringify(s)) as GameState; }
