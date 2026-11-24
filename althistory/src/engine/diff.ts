import type { CountryId, ProvinceId, StatKey } from '../data/types';
import { STAT_KEYS } from '../data/types';
import type { World } from '../data/world';
import type { GameState } from './state';
import { clamp, getRel, isAlive, isAtWar, pairKey, setRel, totalTroops } from './state';
import { deputy, moveHops, newArmyId, reachWithin } from './armies';
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
  /** 군대 이동: 한 턴에 갈 수 있는 거리 안에서만. 방어군이 없는 적/주인 없는 땅에 들어가면 그 주를 점령한다. */
  army_moves?: { army: string; to: ProvinceId }[];
  /** 전투 결과: 병력(천 명)·사기 변화와 장군의 운명. 병력이 0이 되면 군대는 궤멸한다. */
  army_changes?: { army: string; troops_delta?: number; morale_delta?: number; general?: 'active' | 'wounded' | 'captured' | 'dead' }[];
  /** 신편(징병): 자국이 지배하는 주에서만, 한 변경안에 최대 2개. */
  army_new?: { owner: CountryId; name?: string; general?: string; troops: number; at: ProvinceId }[];
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
    army_moves: asArr<unknown>(r.army_moves).map((x) => { const o = (x ?? {}) as Record<string, unknown>; return { army: str(o.army), to: str(o.to) }; }).filter((m) => m.army && m.to).slice(0, 24),
    army_changes: asArr<unknown>(r.army_changes).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const g = str(o.general);
      return {
        army: str(o.army), troops_delta: Number.isFinite(Number(o.troops_delta)) ? Number(o.troops_delta) : undefined,
        morale_delta: Number.isFinite(Number(o.morale_delta)) ? Number(o.morale_delta) : undefined,
        general: (['active', 'wounded', 'captured', 'dead'].includes(g) ? g : undefined) as 'active' | 'wounded' | 'captured' | 'dead' | undefined,
      };
    }).filter((c) => c.army).slice(0, 30),
    army_new: asArr<unknown>(r.army_new).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { owner: str(o.owner), name: str(o.name) || undefined, general: str(o.general) || undefined, troops: Number(o.troops), at: str(o.at) };
    }).filter((n) => n.owner && n.at && Number.isFinite(n.troops) && n.troops > 0).slice(0, 4),
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

  // ---- 군대 이동 ----
  const moved = new Set<string>();
  for (const m of d.army_moves ?? []) {
    const a = s.armies.find((x) => x.id === m.army);
    if (!a) { rejected.push(`이동 무시: 알 수 없는 군대 "${m.army}"`); continue; }
    const from = w.index.get(a.at), to = w.index.get(m.to);
    if (from === undefined || to === undefined) { rejected.push(`이동 거부: ${a.name} → 존재하지 않는 주 "${m.to}"`); continue; }
    if (m.to === a.at) continue;
    if (moved.has(a.id)) { rejected.push(`이동 거부: ${P(a.name, '은/는')} 이번 턴에 이미 이동함`); continue; }
    if (!isAlive(s, a.owner)) continue;
    if (!reachWithin(w, from, moveHops(s, a)).has(to)) { rejected.push(`이동 거부: ${P(a.name, '은/는')} ${w.provLabel(m.to)}까지 한 턴에 갈 수 없음(너무 멀다)`); continue; }
    const ctl = s.controller[m.to];
    const wildT = !!w.countries.get(ctl)?.neutral;
    if (ctl !== a.owner && !wildT && !isAtWar(s, a.owner, ctl) && getRel(s, a.owner, ctl) < 20) {
      rejected.push(`이동 거부: ${P(w.provLabel(m.to), '은/는')} ${L(ctl)} 영토라 통과할 수 없음(전쟁 중이거나 관계 +20 이상이어야 함)`); continue;
    }
    a.at = m.to; moved.add(a.id);
    notes.push(`🚩 ${a.name}(${a.general.name}) → ${w.provLabel(m.to)}`);
    // 방어군이 없는 적/주인 없는 땅에 들어가면 그 주를 점령한다
    if (ctl !== a.owner && (wildT || isAtWar(s, a.owner, ctl))) {
      const defended = s.armies.some((x) => x.at === m.to && x.troops > 0 && x.owner !== a.owner && (x.owner === ctl || isAtWar(s, x.owner, a.owner)));
      if (!defended) {
        const owner0 = s.owner[m.to];
        s.controller[m.to] = a.owner; if (wildT) s.owner[m.to] = a.owner;
        mapChanged = true;
        notes.push(wildT ? `🗺 ${P(L(a.owner), '이/가')} ${w.provLabel(m.to)} 지역을 장악` : `📍 ${P(L(a.owner), '이/가')} ${w.provLabel(m.to)} 점령 (소유: ${L(owner0)})`);
        if (!wildT) setRel(s, a.owner, owner0, getRel(s, a.owner, owner0) - 10);
      }
    }
  }
  // ---- 전투 결과 ----
  for (const c of d.army_changes ?? []) {
    const a = s.armies.find((x) => x.id === c.army);
    if (!a) { rejected.push(`군대 변경 무시: 알 수 없는 군대 "${c.army}"`); continue; }
    if (c.troops_delta) a.troops = Math.round(Math.max(0, a.troops + clamp(c.troops_delta, -a.troops, a.troops * 0.25)) * 10) / 10;
    if (c.morale_delta) a.morale = clamp(Math.round(a.morale + clamp(c.morale_delta, -40, 40)), 0, 100);
    if (c.general === 'wounded') { a.general.status = 'wounded'; a.general.hurtUntil = s.turn + 3; notes.push(`🩹 ${a.general.name} 부상 (${a.name})`); }
    else if ((c.general === 'captured' || c.general === 'dead') && a.general.trait.includes('불패')) {
      notes.push(`🛡 ${P(a.general.name, '은/는')} 불패의 장군 — 전사·포로를 피하고 후퇴했다`);
    } else if (c.general === 'captured' || c.general === 'dead') {
      notes.push(c.general === 'dead' ? `⚰ ${a.general.name} 전사 (${a.name}) — 부장이 지휘를 이어받음` : `⛓ ${a.general.name} 포로가 됨 (${a.name}) — 부장이 지휘를 이어받음`);
      a.general = deputy(a);
    }
  }
  for (const a of s.armies) if (a.troops <= 0) notes.push(`☠ ${a.name}(${a.general.name}) 궤멸`);
  s.armies = s.armies.filter((a) => a.troops > 0);

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
      const wild = !!w.countries.get(ctrl)?.neutral; // 주인 없는 땅(기타 세력)은 선전포고 없이 개척/정복 가능
      if (t.to !== owner) {
        if (!wild && !isAtWar(s, t.to, ctrl)) { rejected.push(`점령 거부: ${P(L(t.to), '은/는')} ${P(L(ctrl), '와/과')} 전쟁 중이 아니라 ${P(pName, '을/를')} 점령할 수 없음`); continue; }
      }
      // 점령은 군대가 한다: 그 주 또는 인접 주에 병력이 있어야 하고, 적 방어군이 남아 있으면 먼저 격파해야 한다
      const near = new Set<string>([t.province, ...w.reach[idx].map((j) => w.provinces[j].id)]);
      if (!s.armies.some((a) => a.owner === t.to && a.troops > 0 && near.has(a.at))) {
        rejected.push(`점령 거부: ${P(L(t.to), '은/는')} ${P(pName, '을/를')} 점령할 군대가 없음(해당 주 또는 인접 주에 군대가 있어야 함)`); continue;
      }
      if (!wild && s.armies.some((a) => a.at === t.province && a.troops > 0 && a.owner !== t.to && (a.owner === ctrl || isAtWar(s, a.owner, t.to)))) {
        rejected.push(`점령 거부: ${P(pName, '은/는')} 아직 적 군대가 지키고 있음(먼저 격파해야 함)`); continue;
      }
      s.controller[t.province] = t.to;
      if (wild) s.owner[t.province] = t.to;
      applied++; mapChanged = true;
      notes.push(wild ? `🗺 ${P(L(t.to), '이/가')} ${pName} 지역을 장악` : t.to === owner ? `🏳 ${pName} 수복 (${L(t.to)})` : `📍 ${P(L(t.to), '이/가')} ${pName} 점령 (소유: ${L(owner)})`);
      if (!wild && t.to !== owner) setRel(s, t.to, owner, getRel(s, t.to, owner) - 10);
    } else {
      if (owner === t.to) continue;
      const lawful = ctrl === t.to || getRel(s, owner, t.to) >= 20 || !!w.countries.get(owner)?.neutral;
      if (!lawful) { rejected.push(`합병 거부: ${P(pName, '은/는')} ${P(L(t.to), '이/가')} 점령하지 않았고 ${P(L(owner), '와/과')} 관계(+20 이상)도 아님`); continue; }
      s.owner[t.province] = t.to;
      if (ctrl === owner || ctrl === t.to) s.controller[t.province] = t.to;
      applied++; mapChanged = true;
      notes.push(`📜 ${pName}의 소유권이 ${L(owner)} → ${P(L(t.to), '으로/로')} 이전`);
    }
  }

  let made = 0;
  for (const n of d.army_new ?? []) {
    if (made >= 2) { rejected.push('신편 거부: 한 번에 최대 2개 군대'); break; }
    if (!valid(n.owner) || !isAlive(s, n.owner)) { rejected.push(`신편 거부: 알 수 없는 국가 "${n.owner}"`); continue; }
    if (s.controller[n.at] !== n.owner) { rejected.push(`신편 거부: ${P(w.provLabel(n.at), '은/는')} ${L(n.owner)}가 지배하는 주가 아님`); continue; }
    const cap = Math.max(3, Math.ceil(totalTroops(s, n.owner) * 0.35));
    const troops = Math.round(clamp(n.troops, 0.5, cap) * 10) / 10;
    s.armies.push({ id: newArmyId(s), name: n.name || `${L(n.owner)} 신편군`, owner: n.owner, general: { name: n.general || '신임 지휘관', skill: 3, trait: '', status: 'active' }, troops, morale: 60, at: n.at });
    if (n.owner in s.stats) s.stats[n.owner].economy = clamp(s.stats[n.owner].economy - 1, 0, 100);
    made++; notes.push(`🪖 ${L(n.owner)} 신편군 창설 (${troops}천 명, ${w.provLabel(n.at)})`);
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
    s.armies = s.armies.filter((a) => a.owner !== c);
    s.wars = s.wars.filter((x) => !x.split('|').includes(c));
    notes.push(`💀 ${w.label(c)} 멸망 (영토 전부 상실)`);
  }
}
