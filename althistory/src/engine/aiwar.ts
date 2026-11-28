import type { World } from '../data/world';
import type { CountryId } from '../data/types';
import type { Difficulty } from './difficulty';
import type { Army, GameState } from './state';
import { clamp, getRel, isAtWar, setRel } from './state';
import type { Rng } from './rng';
import { armyPower, deputy, moveHops, reachWithin, winChance } from './armies';
import { P } from '../util/josa';

const ARMIES_PER_WAR_SIDE: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3, brutal: 4 };

export interface WarResult { news: string[]; headlines: string[]; againstPlayer: boolean }

/**
 * 전쟁 중인 AI 나라들의 군대 행동(규칙 기반·시드 난수). 플레이어의 군대는 움직이지 않는다(방어는 한다).
 *  각 군대는 한 턴에 인접(이동 범위 안)한 적 영토 하나를 골라: 방어군이 없으면 진군·점령, 있으면 전투(전투력 비교 + 방어 이점).
 *  승자는 그 주를 차지하고 패자는 병력을 잃고 물러난다. 병력이 바닥나면 궤멸한다.
 */
export function aiWarTurn(s: GameState, w: World, rng: Rng, level: Difficulty): WarResult {
  const out: WarResult = { news: [], headlines: [], againstPlayer: false };
  const pid = s.playerId, L = (c: CountryId) => w.label(c);
  const enemiesOf = (c: CountryId): CountryId[] => s.wars.filter((k) => k.split('|').includes(c)).map((k) => k.split('|').find((x) => x !== c)!);
  const per = new Map<CountryId, number>();
  const at = (p: string) => s.armies.filter((a) => a.at === p && a.troops > 0);
  let lines = 0;
  const say = (t: string, involvesPlayer: boolean) => { if (involvesPlayer || lines < 4) { out.news.push(t); if (!involvesPlayer) lines++; } };

  const order = [...s.armies].filter((a) => a.owner !== pid && a.troops > 0 && !a.navy).sort(() => rng.next() - 0.5);
  for (const a of order) {
    if (a.troops <= 0) continue;
    const foes = enemiesOf(a.owner); if (!foes.length) continue;
    if ((per.get(a.owner) ?? 0) >= ARMIES_PER_WAR_SIDE[level] * Math.min(2, foes.length)) continue;
    if (a.morale < 25) { a.morale = clamp(a.morale + 8, 0, 100); continue; } // 전의 회복
    const from = w.index.get(a.at); if (from === undefined) continue;
    // 후보: 이동 범위 안의 적 지배 주. 방어군이 없고 가까울수록, 적의 소유지일수록 선호
    let best: { p: string; score: number } | null = null;
    for (const j of reachWithin(w, from, moveHops(s, a))) {
      const p = w.provinces[j].id, ctl = s.controller[p];
      if (!foes.includes(ctl)) continue;
      const defenders = at(p).filter((x) => x.owner === ctl || isAtWar(s, x.owner, a.owner));
      const def = defenders.reduce((t, x) => t + armyPower(x), 0) * 1.2;
      const chance = def > 0 ? winChance(armyPower(a), def) : 1;
      if (chance < 0.45) continue; // 질 싸움은 걸지 않는다
      const score = chance * 10 + (s.owner[p] === ctl ? 2 : 0) + (ctl === pid ? 1.5 : 0) + rng.next() * 3;
      if (!best || score > best.score) best = { p, score };
    }
    if (!best) continue;
    per.set(a.owner, (per.get(a.owner) ?? 0) + 1);
    const p = best.p, ctl = s.controller[p], label = w.provLabel(p) || p;
    const defenders = at(p).filter((x) => x.owner === ctl || isAtWar(s, x.owner, a.owner));
    const toPlayer = ctl === pid || a.owner === pid;
    if (!defenders.length) {
      a.at = p; s.controller[p] = a.owner;
      if (s.stats[ctl]) s.stats[ctl].stability = clamp(s.stats[ctl].stability - 3, 0, 100);
      if (s.owner[p] in s.stats && s.owner[p] !== a.owner) setRel(s, a.owner, s.owner[p], getRel(s, a.owner, s.owner[p]) - 4);
      say(`${P(L(a.owner), '이/가')} ${P(a.name || `${L(a.owner)}군`, '을/를')} 보내 ${L(ctl)}의 ${P(label, '을/를')} 점령했다.`, ctl === pid);
      if (ctl === pid) { out.againstPlayer = true; out.headlines.push(`${L(a.owner)}군, ${label} 점령`); }
      continue;
    }
    // 전투
    const atk = armyPower(a), def = defenders.reduce((t, x) => t + armyPower(x), 0) * 1.2;
    const win = rng.next() < winChance(atk, def);
    const dTroops = defenders.reduce((t, x) => t + x.troops, 0);
    if (win) {
      for (const x of defenders) { x.troops = Math.round(x.troops * 0.6 * 10) / 10; x.morale = clamp(x.morale - 20, 0, 100); }
      a.troops = Math.round(a.troops * (0.85 - 0.1 * Math.min(1, def / Math.max(atk, 1))) * 10) / 10; a.morale = clamp(a.morale + 8, 0, 100);
      // 패잔병은 가까운 아군 땅으로 물러나고, 갈 곳이 없으면 흩어진다
      for (const x of defenders) {
        const xi = w.index.get(p)!; const retreat = [...w.reach[xi]].map((j) => w.provinces[j].id).find((q) => s.controller[q] === x.owner && !at(q).some((y) => foes.includes(y.owner)));
        if (retreat && x.troops > 0.5) x.at = retreat; else x.troops = 0;
      }
      a.at = p; s.controller[p] = a.owner;
      if (s.stats[ctl]) s.stats[ctl].stability = clamp(s.stats[ctl].stability - 5, 0, 100);
      if (s.owner[p] in s.stats && s.owner[p] !== a.owner) setRel(s, a.owner, s.owner[p], getRel(s, a.owner, s.owner[p]) - 4);
      say(`${P(L(a.owner), '이/가')} ${label}에서 ${L(ctl)}군(${Math.round(dTroops)}천 명)을 격파하고 이 땅을 차지했다.`, toPlayer);
      if (ctl === pid) { out.againstPlayer = true; out.headlines.push(`${label} 함락, ${L(a.owner)}군 진주`); }
    } else {
      a.troops = Math.round(a.troops * 0.65 * 10) / 10; a.morale = clamp(a.morale - 15, 0, 100);
      for (const x of defenders) { x.troops = Math.round(x.troops * 0.88 * 10) / 10; x.morale = clamp(x.morale + 4, 0, 100); }
      if (rng.next() < 0.12) { a.general.status = 'wounded'; a.general.hurtUntil = s.turn + 3; }
      else if (rng.next() < 0.05) a.general = deputy(a);
      say(`${P(L(a.owner), '이/가')} ${P(label, '을/를')} 공격했으나 ${L(ctl)}군의 방어에 막혀 물러났다.`, toPlayer);
      if (ctl === pid) out.againstPlayer = true;
    }
  }
  // 궤멸한 군대 정리(플레이어 군대 포함 — 방어전에서 졌을 수 있다)
  const dead: Army[] = s.armies.filter((x) => x.troops <= 0.5);
  for (const x of dead) if (x.owner === pid) out.news.push(`${P(x.name || `${L(x.owner)}군`, '이/가')} 방어전 끝에 궤멸했다.`);
  s.armies = s.armies.filter((x) => x.troops > 0.5);
  return out;
}
