import type { World } from '../data/world';
import type { CountryId } from '../data/types';
import type { Difficulty } from './difficulty';
import type { GameState } from './state';
import { getRel, isAlive, isAtWar, pairKey, setRel } from './state';
import type { Rng } from './rng';
import { P } from '../util/josa';

/** 세력 AI가 한 턴에 한 일(신문에 싣는다). warKeys/peaceKeys 는 보고서에서 "일반 전쟁 시작" 줄과 겹치지 않게 빼는 데 쓴다. */
export interface AiResult { news: string[]; headlines: string[]; warKeys: string[]; peaceKeys: string[]; againstPlayer: boolean }

/** 난이도별 적극성(적국이 얼마나 자주 전쟁을 거는가). */
const AGGR: Record<Difficulty, number> = { easy: 0.35, normal: 1, hard: 1.7, brutal: 2.6 };
const MAX_WARS_PER_TURN: Record<Difficulty, number> = { easy: 1, normal: 1, hard: 2, brutal: 2 };

/**
 * 플레이어가 아닌 나라들의 행동(규칙 기반, 시드 난수라 결정적):
 *  ① 국경을 맞댄 나라끼리 관계가 나쁘고 힘이 앞서면 선전포고 ② 플레이어와 무관한 전쟁은 가끔 휴전
 *  ③ 내가 이번 턴에 전쟁을 시작했으면 상대의 우방은 비난, 나의 우방은 지지 성명(관계 변화 포함).
 * 군대 이동·점령은 하지 않는다(그건 플레이어 명령과 AI 판정관의 몫).
 */
export function aiTurn(s: GameState, w: World, rng: Rng, level: Difficulty, playerWarsStarted: string[]): AiResult {
  const pid = s.playerId, L = (c: CountryId) => w.label(c);
  const out: AiResult = { news: [], headlines: [], warKeys: [], peaceKeys: [], againstPlayer: false };

  // ③ 내가 시작한 전쟁에 대한 반응(우방·적대국)
  for (const key of playerWarsStarted) {
    const target = key.split('|').find((c) => c !== pid); if (!target) continue;
    const friends = Object.keys(s.stats).filter((c) => c !== pid && c !== target && isAlive(s, c) && getRel(s, c, target) >= 40 && getRel(s, c, pid) < 60).sort((a, b) => getRel(s, b, target) - getRel(s, a, target)).slice(0, 2);
    for (const c of friends) { setRel(s, c, pid, getRel(s, c, pid) - 8); out.news.push(`${P(L(c), '은/는')} ${L(target)} 편에 서서 ${L(pid)}의 선전포고를 비난했다.`); }
    const mine = Object.keys(s.stats).filter((c) => c !== pid && c !== target && isAlive(s, c) && getRel(s, c, pid) >= 40 && getRel(s, c, target) <= 0).slice(0, 1);
    for (const c of mine) { setRel(s, c, pid, getRel(s, c, pid) + 5); out.news.push(`${P(L(c), '은/는')} ${L(pid)}의 결정을 지지한다고 밝혔다.`); }
  }

  // 국경을 맞댄 나라 쌍(한 번에 센다)
  const border = new Map<string, number>();
  for (let i = 0; i < w.provinces.length; i++) {
    const a = s.controller[w.provinces[i].id]; if (!(a in s.stats)) continue;
    for (const j of w.reach[i]) { const b = s.controller[w.provinces[j].id]; if (b !== a && b in s.stats) border.set(pairKey(a, b), (border.get(pairKey(a, b)) ?? 0) + 1); }
  }
  const warCount = (c: CountryId) => s.wars.filter((k) => k.split('|').includes(c)).length;

  // ② 플레이어와 무관한 전쟁은 가끔 끝난다
  let peaces = 0;
  for (const k of [...s.wars]) {
    const [a, b] = k.split('|'); if (a === pid || b === pid || peaces >= 2) continue;
    if (!isAlive(s, a) || !isAlive(s, b) || rng.next() < 0.05) {
      s.wars = s.wars.filter((x) => x !== k); setRel(s, a, b, Math.max(getRel(s, a, b), -20)); peaces++; out.peaceKeys.push(k);
      if (isAlive(s, a) && isAlive(s, b)) out.news.push(`${P(L(a), '와/과')} ${L(b)}가 휴전에 합의했다.`);
    }
  }

  // ① 선전포고 후보: 관계 나쁨 + 힘의 우위 + 맞닿은 정도
  const cands: { a: CountryId; b: CountryId; score: number }[] = [];
  for (const [k, n] of border) {
    const [x, y] = k.split('|'); if (isAtWar(s, x, y)) continue;
    const rel = getRel(s, x, y); if (rel > -35) continue;
    const [a, b] = s.stats[x].military >= s.stats[y].military ? [x, y] : [y, x];
    if (a === pid || s.stats[a].stability < 25 || warCount(a) >= 2) continue; // 플레이어 대신 전쟁을 걸지는 않는다
    const score = -rel + (s.stats[a].military - s.stats[b].military) * 0.4 + 8 * Math.sqrt(n);
    if (rel <= -35) cands.push({ a, b, score }); // 사이가 나쁜 나라끼리만(힘만 센 이웃을 아무 이유 없이 치지는 않는다)
  }
  cands.sort((p, q) => q.score - p.score);
  let declared = 0;
  for (const c of cands.slice(0, 40)) {
    if (declared >= MAX_WARS_PER_TURN[level]) break;
    if (warCount(c.a) >= 2 || isAtWar(s, c.a, c.b)) continue;
    const p = Math.max(0, Math.min(0.25, (c.score - 30) / 200)) * AGGR[level];
    if (rng.next() >= p) continue;
    s.wars.push(pairKey(c.a, c.b)); setRel(s, c.a, c.b, Math.min(getRel(s, c.a, c.b), -60)); declared++; out.warKeys.push(pairKey(c.a, c.b));
    // 피해국의 우방은 공격국을 멀리한다
    for (const f of Object.keys(s.stats)) if (f !== c.a && f !== c.b && isAlive(s, f) && getRel(s, f, c.b) >= 40) setRel(s, f, c.a, getRel(s, f, c.a) - 10);
    if (c.b === pid) { out.againstPlayer = true; out.news.push(`${P(L(c.a), '이/가')} ${L(pid)}에 선전포고했다. 국경에서 병력이 움직이고 있다.`); out.headlines.push(`${L(c.a)}, ${L(pid)}에 선전포고`); }
    else { out.news.push(`${P(L(c.a), '이/가')} ${L(c.b)}에 선전포고했다.`); if (out.headlines.length < 2) out.headlines.push(`${L(c.a)}, ${L(c.b)}에 선전포고`); }
  }
  return out;
}
