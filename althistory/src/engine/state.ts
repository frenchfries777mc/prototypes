import type { CountryId, ProvinceId, Scenario, Stats } from '../data/types';
import type { World } from '../data/world';

export interface TurnRecord {
  turn: number; date: string; command: string; interpretation: string;
  feasibility: number; roll: number; outcome: 'success' | 'failure' | 'pass';
  narrative: string; headlines: string[]; notes: string[]; rejected: string[]; mode: string;
}

export interface GameState {
  v: 1; scenarioId: string; seed: number; rng: number; turn: number; date: string; playerId: CountryId;
  owner: Record<ProvinceId, CountryId>;
  controller: Record<ProvinceId, CountryId>;
  stats: Record<CountryId, Stats>;
  relations: Record<string, number>;
  wars: string[];
  eliminated: CountryId[];
  log: TurnRecord[];
  memory: string;
}

export const pairKey = (a: CountryId, b: CountryId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function newGame(world: World, playerId: CountryId, seed: number, scenario: Scenario): GameState {
  const owner: Record<string, string> = {};
  const controller: Record<string, string> = {};
  for (const p of world.provinces) { owner[p.id] = p.owner; controller[p.id] = p.owner; }
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
  return {
    v: 1, scenarioId: scenario.id, seed, rng: seed >>> 0, turn: 1, date: scenario.startDate, playerId,
    owner, controller, stats, relations, wars: [], eliminated: [], log: [], memory: '',
  };
}

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

export function advanceMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

export function cloneState(s: GameState): GameState { return JSON.parse(JSON.stringify(s)) as GameState; }
