import type { CountryId, ProvinceId, Scenario } from '../data/types';
import type { World } from '../data/world';
import type { Army, GameState, General } from './state';
import { clamp, getRel, isAtWar } from './state';

/** 시대별 병력 규모 배율(자동 생성되는 군대의 총병력). */
export const ERA_SCALE: Record<string, number> = { '고대': 0.1, '중세': 0.14, '근세': 0.3, '근대': 0.6, '현대': 1 };
export const eraScale = (sc: Scenario): number => ERA_SCALE[sc.era ?? '현대'] ?? 1;

const TRAITS = ['방어의 명수', '공격적 야전형', '신중한 전략가', '병참 전문가', '기병 지휘관', '보병 지휘관', '돌파형', '노련한 베테랑'];
const hash = (s: string): number => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const r1 = (x: number): number => Math.round(x * 10) / 10;

export function newArmyId(s: GameState): string { return `A${s.armySeq++}`; }

/** BFS: from 에서 hops 번 안에 닿는 주 인덱스. */
export function reachWithin(world: World, from: number, hops: number): Set<number> {
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let h = 0; h < hops; h++) {
    const next: number[] = [];
    for (const i of frontier) for (const j of world.reach[i]) if (!seen.has(j)) { seen.add(j); next.push(j); }
    frontier = next;
  }
  return seen;
}
/** 한 턴에 움직일 수 있는 거리(주 단위): 턴이 길수록 멀리, 함대는 한 칸 더. */
export const moveHops = (s: GameState, a: Army): number => 1 + ((s.turnMonths ?? 1) >= 6 ? 1 : 0) + ((s.turnMonths ?? 1) >= 12 ? 1 : 0) + (a.navy ? 1 : 0);

export const effSkill = (g: General): number => (g.status === 'wounded' ? Math.max(1, g.skill - 2) : g.skill);
/** 전투력: 병력 × 장군 × 사기. */
export const armyPower = (a: Army): number => a.troops * (0.7 + 0.06 * effSkill(a.general)) * (0.6 + 0.4 * (a.morale / 100));
/** 수비 쪽 이점(지형·요새)을 포함한 확률: 공격 전투력 대 방어 전투력. */
export const winChance = (atk: number, def: number): number => { const a = Math.pow(Math.max(atk, 0.01), 1.5), d = Math.pow(Math.max(def, 0.01), 1.5); return a / (a + d); };
export const deputy = (a: Army): General => ({ name: `${a.name} 부장`, skill: Math.max(2, a.general.skill - 2), trait: '', status: 'active' });

/** 나라가 어느 주를 지배하고 있고 어디가 최전선인지 점수화해서 군대를 배치할 주를 고른다. */
function frontier(world: World, s: GameState, c: CountryId, n: number): ProvinceId[] {
  const scored: { id: ProvinceId; score: number; i: number }[] = [];
  for (let i = 0; i < world.provinces.length; i++) {
    const id = world.provinces[i].id;
    if (s.controller[id] !== c) continue;
    let score = 0;
    for (const j of world.reach[i]) {
      const o = s.controller[world.provinces[j].id];
      if (o === c || !(o in s.stats)) continue;
      score += isAtWar(s, c, o) ? 4 : getRel(s, c, o) < -30 ? 2 : 1;
    }
    scored.push({ id, score, i });
  }
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  if (!scored.length) return [];
  const out: ProvinceId[] = [];
  for (let k = 0; k < n; k++) out.push(scored[k % scored.length].id);
  return out;
}

/** 새 게임/옛 저장 파일의 군대를 만든다: 시나리오가 정한 장군·군대 + 나머지 나라는 국력에 맞춰 자동 생성. */
export function buildArmies(world: World, s: GameState, sc: Scenario): void {
  s.armies = []; s.armySeq = 1;
  const explicit = new Set<CountryId>();
  for (const d of sc.armies ?? []) {
    if (!(d.c in s.stats) || !world.province(d.at)) continue;
    s.armies.push({ id: newArmyId(s), name: d.n, owner: d.c, general: { name: d.g, skill: clamp(Math.round(d.skill ?? 6), 1, 10), trait: d.trait ?? '', status: 'active' }, troops: r1(Math.max(0.5, d.troops)), morale: 80, at: d.at, ...(d.navy ? { navy: true } : {}) });
    explicit.add(d.c);
  }
  const scale = eraScale(sc);
  const WEIGHTS = [0.34, 0.26, 0.2, 0.12, 0.08];
  for (const c of Object.keys(s.stats)) {
    if (explicit.has(c)) continue;
    const mil = s.stats[c].military;
    const n = clamp(Math.round(mil / 22), 1, 5);
    const total = Math.max(2.5, Math.pow(mil / 100, 1.7) * 1200 * scale);
    const where = frontier(world, s, c, n);
    if (!where.length) continue;
    const pool = sc.generals?.[c] ?? [];
    const label = world.label(c);
    const norm = WEIGHTS.slice(0, n).reduce((a, b) => a + b, 0);
    for (let k = 0; k < where.length; k++) {
      const gp = pool[k];
      const h = hash(`${c}${k}`);
      s.armies.push({
        id: newArmyId(s), name: `${label} 제${k + 1}군`, owner: c,
        general: gp ? { name: gp.n, skill: clamp(Math.round(gp.skill ?? 5 + (h % 3)), 1, 10), trait: gp.trait ?? TRAITS[h % TRAITS.length], status: 'active' }
          : { name: `${label} ${k + 1}군 사령관`, skill: 3 + (h % 5), trait: TRAITS[h % TRAITS.length], status: 'active' },
        troops: r1(Math.max(0.8, (total * WEIGHTS[k]) / norm)), morale: 70 + (h % 20), at: where[k],
      });
    }
  }
}

/** 부상 회복(3턴). */
export function healGenerals(s: GameState): void {
  for (const a of s.armies) if (a.general.status === 'wounded' && (a.general.hurtUntil ?? 0) <= s.turn) { a.general.status = 'active'; delete a.general.hurtUntil; }
}
