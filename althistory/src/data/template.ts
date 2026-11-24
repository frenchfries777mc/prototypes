import type { ArmyDef, Bonus, PolityDef, Scenario } from './types';
import type { World } from './world';

/** 사용자/공유 템플릿(외부에서 온 JSON)을 검사하고 안전한 값으로 다듬는다. 정규식 같은 실행 가능한 내용은 받지 않는다. */
export const MAX_TEMPLATE_BYTES = 700_000;
export const ERAS = ['고대', '중세', '근세', '근대', '현대', '사용자'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const PID = /^[A-Z0-9_]{2,10}$/;
const TID = /^[a-z0-9][a-z0-9_-]{2,48}$/;
const DATE = /^-?\d{4}-\d{2}-01$/;

const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '');
const num = (x: unknown, lo: number, hi: number, d: number): number => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

export type SanitizeResult = { ok: true; value: Scenario; warnings: string[] } | { ok: false; errors: string[] };

export function sanitizeScenario(raw: unknown, world: World, takenIds: Set<string>): SanitizeResult {
  const errors: string[] = [], warnings: string[] = [];
  const r = obj(raw);
  if (!Object.keys(r).length) return { ok: false, errors: ['템플릿 JSON이 객체가 아닙니다'] };

  let id = str(r.id, 49).toLowerCase();
  if (!TID.test(id)) id = `my-${Math.random().toString(36).slice(2, 8)}`;
  if (takenIds.has(id)) { warnings.push(`ID "${id}"가 이미 있어 새 ID로 바꿨습니다`); id = `${id.slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`; }
  const name = str(r.name, 40).trim();
  if (!name) errors.push('이름이 없습니다');

  const startDate = typeof r.startDate === 'string' && DATE.test(r.startDate) ? r.startDate : '';
  if (!startDate) errors.push('시작 날짜 형식이 올바르지 않습니다 (예: 2026-01-01, 기원전은 -0264-03-01)');

  // 국가
  const polRaw = arr(r.polities);
  if (polRaw.length < 2 || polRaw.length > 120) errors.push('국가는 2개 이상 120개 이하여야 합니다');
  const polities: PolityDef[] = [];
  const ids = new Set<string>();
  for (const p0 of polRaw.slice(0, 120)) {
    const p = obj(p0);
    const pid = str(p.id, 10);
    if (!PID.test(pid) || ids.has(pid)) { errors.push(`국가 ID가 올바르지 않거나 중복입니다: "${pid}" (대문자/숫자/_ 2~10자)`); continue; }
    ids.add(pid);
    const neutral = p.neutral === true;
    const color = HEX.test(String(p.color)) ? String(p.color) : '#8a93a3';
    const nm = str(p.name, 30) || pid;
    const s = obj(p.stats);
    polities.push({
      id: pid, name: nm, nameKo: str(p.nameKo, 30) || nm, color, neutral: neutral || undefined,
      stats: neutral ? null : { stability: num(s.stability, 0, 100, 50), economy: num(s.economy, 0, 100, 40), military: num(s.military, 0, 100, 40), influence: num(s.influence, 0, 100, 30) },
      aliases: arr(p.aliases).map((a) => str(a, 20)).filter(Boolean).slice(0, 8),
    });
  }
  if (polities.filter((p) => p.neutral).length > 1) errors.push('주인 없는 땅(기타 세력)은 하나만 둘 수 있습니다');

  // 영토
  const ownersRaw = arr(r.owners);
  if (ownersRaw.length !== world.provinces.length) errors.push(`영토 정보(owners)가 현재 지도와 맞지 않습니다 (${ownersRaw.length} ≠ ${world.provinces.length})`);
  const owners = ownersRaw.map((x) => Math.trunc(Number(x)));
  if (owners.some((o) => !Number.isInteger(o) || o < 0 || o >= polities.length)) errors.push('영토에 존재하지 않는 국가 번호가 있습니다');

  const known = (c: unknown): c is string => typeof c === 'string' && ids.has(c);
  const live = (c: unknown): c is string => known(c) && !polities.find((p) => p.id === c)?.neutral;
  const relations = arr(r.relations).map((x) => arr(x)).filter((x) => live(x[0]) && live(x[1]) && x[0] !== x[1]).slice(0, 400).map((x) => [x[0], x[1], num(x[2], -100, 100, 0)] as [string, string, number]);
  const wars = arr(r.wars).map((x) => arr(x)).filter((x) => live(x[0]) && live(x[1]) && x[0] !== x[1]).slice(0, 60).map((x) => [x[0], x[1]] as [string, string]);
  const alliances = arr(r.alliances).slice(0, 12).map((a) => { const o = obj(a); return { name: str(o.name, 30) || '동맹', members: arr(o.members).filter(live).slice(0, 60) as string[] }; }).filter((a) => a.members.length >= 2);
  const milMod: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(r.milMod))) if (live(k)) milMod[k] = num(v, -50, 50, 0);
  const bonuses: Bonus[] = arr(r.bonuses).slice(0, 12).map((b) => {
    const o = obj(b);
    return { country: String(o.country), words: arr(o.words).map((w) => str(w, 12)).filter(Boolean).slice(0, 12), bonus: num(o.bonus, -50, 50, 0), note: str(o.note, 40) };
  }).filter((b) => live(b.country) && b.words.length);

  // 군대
  const armies: ArmyDef[] = [];
  for (const a0 of arr(r.armies).slice(0, 150)) {
    const a = obj(a0);
    const at = str(a.at, 40);
    if (!live(a.c) || !world.province(at)) { warnings.push(`군대 "${str(a.n, 20)}"를 건너뜀(국가/위치 불명)`); continue; }
    armies.push({ c: a.c, n: str(a.n, 30) || '군대', g: str(a.g, 24) || '지휘관', skill: Math.round(num(a.skill, 1, 10, 5)), trait: str(a.trait, 30), troops: Math.round(num(a.troops, 0.5, 3000, 5) * 10) / 10, at, ...(a.navy ? { navy: true } : {}) });
  }
  const generals: Scenario['generals'] = {};
  for (const [k, v] of Object.entries(obj(r.generals))) if (live(k)) generals[k] = arr(v).slice(0, 8).map((g) => { const o = obj(g); return { n: str(o.n, 24), skill: o.skill === undefined ? undefined : Math.round(num(o.skill, 1, 10, 5)), trait: str(o.trait, 30) }; }).filter((g) => g.n);

  const fo = arr(r.focus).map(Number);
  const focus = fo.length === 4 && fo.every(Number.isFinite) ? (fo as [number, number, number, number]) : null;
  if (errors.length) return { ok: false, errors };
  return {
    ok: true, warnings,
    value: {
      id, name, startDate, year: str(r.year, 24), era: ERAS.includes(str(r.era, 6)) ? str(r.era, 6) : '사용자',
      tagline: str(r.tagline, 80), description: str(r.description, 400), briefing: str(r.briefing, 2000), gmNotes: str(r.gmNotes, 3000),
      turnMonths: Math.round(num(r.turnMonths, 1, 24, 1)), focus, author: str(r.author, 40),
      alliances, relations, wars, milMod, bonuses, armies, generals, polities, owners, custom: true,
    },
  };
}

/** 내보내기용 JSON(실행 중 계산되는 값은 빼고 한 줄로). */
export function templateToJson(sc: Scenario): string {
  const { custom: _c, ...rest } = sc;
  void _c;
  return JSON.stringify({ schema: 1, ...rest, polities: sc.polities?.map(({ provinces: _p, ...p }) => (void _p, p)) });
}
