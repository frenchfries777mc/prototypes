import type { CountryId, ProvinceId, StatKey } from '../data/types';
import { STAT_KEYS } from '../data/types';
import type { World } from '../data/world';
import type { GameState } from './state';
import { clamp, getRel, isAlive, isAtWar, pairKey, setRel } from './state';
import { P } from '../util/josa';

/** AI(또는 규칙 모드)가 제안하는 세계 변경안. 엔진이 검증한 뒤에만 적용한다. */
export interface Diff {
  narrative?: string;
  headlines?: string[];
  declare_war?: { a: CountryId; b: CountryId }[];
  make_peace?: { a: CountryId; b: CountryId }[];
  province_transfers?: { province: ProvinceId; to: CountryId; kind: 'owner' | 'controller' }[];
  relation_changes?: { a: CountryId; b: CountryId; delta: number }[];
  stat_changes?: { country: CountryId; stat: StatKey; delta: number }[];
}

export interface Adjudication {
  interpretation: string;
  feasibility: number;
  reasoning: string;
  if_success: Diff;
  if_failure: Diff;
  world_events: Diff;
  memory?: string;
}

export interface ApplyResult { notes: string[]; rejected: string[]; mapChanged: boolean }

export const MAX_TRANSFERS = 6;
const MAX_REL_DELTA = 40;
const MAX_STAT_DELTA = 10;

const asArr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/** 느슨하게 정규화한다: 약한 모델의 사소한 형식 실수는 고쳐 주고, 알아볼 수 없으면 null. */
export function normalizeDiff(raw: unknown): Diff {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pair = (x: unknown) => { const o = (x ?? {}) as Record<string, unknown>; return { a: str(o.a), b: str(o.b) }; };
  return {
    narrative: str(r.narrative),
    headlines: asArr<unknown>(r.headlines).map(str).filter(Boolean).slice(0, 4),
    declare_war: asArr<unknown>(r.declare_war).map(pair).filter((p) => p.a && p.b).slice(0, 4),
    make_peace: asArr<unknown>(r.make_peace).map(pair).filter((p) => p.a && p.b).slice(0, 4),
    province_transfers: asArr<unknown>(r.province_transfers).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { province: str(o.province), to: str(o.to), kind: (o.kind === 'owner' ? 'owner' : 'controller') as 'owner' | 'controller' };
    }).filter((t) => t.province && t.to),
    relation_changes: asArr<unknown>(r.relation_changes).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { a: str(o.a), b: str(o.b), delta: Number(o.delta) };
    }).filter((t) => t.a && t.b && Number.isFinite(t.delta)).slice(0, 20),
    stat_changes: asArr<unknown>(r.stat_changes).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { country: str(o.country), stat: str(o.stat) as StatKey, delta: Number(o.delta) };
    }).filter((t) => t.country && Number.isFinite(t.delta)).slice(0, 24),
  };
}

export function normalizeAdjudication(raw: unknown): { ok: true; value: Adjudication } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON 객체가 아닙니다' };
  const r = raw as Record<string, unknown>;
  const f = Number(r.feasibility);
  if (!Number.isFinite(f)) return { ok: false, error: 'feasibility(0~100 숫자)가 없습니다' };
  if (!r.if_success && !r.if_failure && !r.world_events) return { ok: false, error: 'if_success / if_failure / world_events 가 모두 없습니다' };
  return {
    ok: true,
    value: {
      interpretation: str(r.interpretation), feasibility: clamp(Math.round(f), 0, 100), reasoning: str(r.reasoning),
      if_success: normalizeDiff(r.if_success), if_failure: normalizeDiff(r.if_failure), world_events: normalizeDiff(r.world_events),
      memory: str(r.memory) || undefined,
    },
  };
}

/** 변경안을 검증하며 적용한다. 규칙에 어긋나는 항목은 거부하고 이유를 남긴다. */
export function applyDiff(s: GameState, w: World, d: Diff): ApplyResult {
  const notes: string[] = [];
  const rejected: string[] = [];
  let mapChanged = false;
  const L = (c: CountryId) => w.label(c);
  const valid = (c: CountryId) => !!c && w.countries.has(c) && !w.countries.get(c)!.neutral;

  for (const { a, b } of d.declare_war ?? []) {
    if (!valid(a) || !valid(b)) { rejected.push(`선전포고 무시: 알 수 없는 국가 (${a}, ${b})`); continue; }
    if (a === b) { rejected.push('선전포고 무시: 자기 자신'); continue; }
    if (!isAlive(s, a) || !isAlive(s, b)) { rejected.push(`선전포고 무시: 이미 멸망한 국가 (${L(a)}/${L(b)})`); continue; }
    if (isAtWar(s, a, b)) continue;
    s.wars.push(pairKey(a, b));
    setRel(s, a, b, Math.min(getRel(s, a, b), -60));
    notes.push(`⚔ ${L(a)} ↔ ${L(b)} 전쟁 시작`);
  }
  for (const { a, b } of d.make_peace ?? []) {
    if (!isAtWar(s, a, b)) { rejected.push(`평화 무시: ${P(L(a), '와/과')} ${P(L(b), '은/는')} 전쟁 중이 아님`); continue; }
    s.wars = s.wars.filter((x) => x !== pairKey(a, b));
    setRel(s, a, b, Math.max(getRel(s, a, b), -20));
    notes.push(`🕊 ${L(a)} ↔ ${L(b)} 휴전/평화`);
  }

  let applied = 0;
  for (const t of d.province_transfers ?? []) {
    const idx = w.index.get(t.province);
    if (idx === undefined) { rejected.push(`영토 이전 거부: 존재하지 않는 주 "${t.province}"`); continue; }
    const pName = w.provLabel(t.province);
    if (!valid(t.to) || !isAlive(s, t.to)) { rejected.push(`영토 이전 거부: ${pName} → 알 수 없거나 멸망한 국가 "${t.to}"`); continue; }
    if (applied >= MAX_TRANSFERS) { rejected.push(`영토 이전 거부: ${pName} (한 턴 최대 ${MAX_TRANSFERS}곳)`); continue; }
    const owner = s.owner[t.province], ctrl = s.controller[t.province];
    if (t.kind === 'controller') {
      if (ctrl === t.to) continue;
      if (t.to !== owner) {
        if (!isAtWar(s, t.to, ctrl)) { rejected.push(`점령 거부: ${P(L(t.to), '은/는')} ${P(L(ctrl), '와/과')} 전쟁 중이 아니라 ${P(pName, '을/를')} 점령할 수 없음`); continue; }
        const reachable = w.reach[idx].some((j) => s.controller[w.provinces[j].id] === t.to);
        if (!reachable) { rejected.push(`점령 거부: ${P(pName, '은/는')} ${L(t.to)}의 작전 가능 범위(인접·해협) 밖`); continue; }
      }
      s.controller[t.province] = t.to;
      applied++; mapChanged = true;
      notes.push(t.to === owner ? `🏳 ${pName} 수복 (${L(t.to)})` : `📍 ${P(L(t.to), '이/가')} ${pName} 점령 (소유: ${L(owner)})`);
      if (t.to !== owner) setRel(s, t.to, owner, getRel(s, t.to, owner) - 10);
    } else {
      if (owner === t.to) continue;
      const lawful = ctrl === t.to || getRel(s, owner, t.to) >= 20;
      if (!lawful) { rejected.push(`합병 거부: ${P(pName, '은/는')} ${P(L(t.to), '이/가')} 점령하지 않았고 ${P(L(owner), '와/과')} 관계(+20 이상)도 아님`); continue; }
      s.owner[t.province] = t.to;
      if (ctrl === owner || ctrl === t.to) s.controller[t.province] = t.to;
      applied++; mapChanged = true;
      notes.push(`📜 ${pName}의 소유권이 ${L(owner)} → ${P(L(t.to), '으로/로')} 이전`);
    }
  }

  for (const r of d.relation_changes ?? []) {
    if (!valid(r.a) || !valid(r.b) || r.a === r.b) { rejected.push(`관계 변경 무시: (${r.a}, ${r.b})`); continue; }
    setRel(s, r.a, r.b, getRel(s, r.a, r.b) + clamp(r.delta, -MAX_REL_DELTA, MAX_REL_DELTA));
  }
  for (const c of d.stat_changes ?? []) {
    if (!valid(c.country) || !(c.country in s.stats)) { rejected.push(`능력치 변경 무시: 알 수 없는 국가 "${c.country}"`); continue; }
    if (!STAT_KEYS.includes(c.stat)) { rejected.push(`능력치 변경 무시: 알 수 없는 능력치 "${c.stat}"`); continue; }
    const cur = s.stats[c.country][c.stat];
    s.stats[c.country][c.stat] = clamp(Math.round(cur + clamp(c.delta, -MAX_STAT_DELTA, MAX_STAT_DELTA)), 0, 100);
  }

  if (mapChanged) markEliminated(s, w, notes);
  return { notes, rejected, mapChanged };
}

/** 영토를 모두 잃은 국가는 멸망 처리하고 전쟁/관계를 정리한다. */
function markEliminated(s: GameState, w: World, notes: string[]): void {
  const holders = new Set<string>();
  for (const id in s.controller) { holders.add(s.controller[id]); holders.add(s.owner[id]); }
  for (const c of Object.keys(s.stats)) {
    if (holders.has(c) || s.eliminated.includes(c)) continue;
    s.eliminated.push(c);
    s.wars = s.wars.filter((x) => !x.split('|').includes(c));
    notes.push(`💀 ${w.label(c)} 멸망 (영토 전부 상실)`);
  }
}
