import type { World } from '../data/world';
import type { Adjudication, ApplyResult, Diff } from './diff';
import { applyDiff } from './diff';
import type { GameState, TurnRecord, TurnReport } from './state';
import { addMonths, clamp, fmtDate } from './state';
import { STAT_KEYS } from '../data/types';
import { adjustFeasibility, diffOf, scaleDiff } from './difficulty';
import { aiTurn } from './ai';
import { aiWarTurn } from './aiwar';
import { stabilityTurn, supportBonus } from './stability';
import { makeRng } from './rng';
import { goalsTurn, makeGoals } from './goals';
import { ledgerTurn } from './memory';
import { healGenerals } from './armies';

export interface TurnResult { record: TurnRecord; mapChanged: boolean }

const MEMORY_MAX = 1400;

/**
 * 한 턴을 확정한다.
 * 판정 순서: (1) 시드 난수로 성패 결정 → (2) 해당 변경안 적용 → (3) 세계 사건 적용 → (4) 날짜/기록 갱신.
 * LLM은 "성공했을 때"와 "실패했을 때"의 결과를 모두 제안하고, 어느 쪽이 일어날지는 엔진의 난수가 정한다.
 */
export function resolveTurn(s: GameState, w: World, adj: Adjudication, command: string, mode: string, pass: boolean): TurnResult {
  const rng = makeRng(s.rng);
  const roll = Math.round(rng.next() * 1000) / 10;
  const level = diffOf(s), pid = s.playerId;
  const feasibility = pass ? 100 : clamp(adjustFeasibility(adj.feasibility, level) + supportBonus(s), 1, 99);
  const success = pass ? true : roll < feasibility;
  // 난이도: 플레이어 국가의 능력치 변화에 배율을 곱한다(이득은 쉬울수록 크고, 손실은 어려울수록 크다)
  const main: Diff = pass ? {} : scaleDiff(success ? adj.if_success : adj.if_failure, pid, level);
  const worldEv: Diff = scaleDiff(adj.world_events, pid, level);

  // 신문에 실을 "턴 전후 비교"를 위해 먼저 찍어 둔다
  const before = { stats: { ...s.stats[pid] }, relations: { ...s.relations }, wars: new Set(s.wars) };
  s.goals ??= makeGoals(s); // 목표 기준은 첫 턴을 처리하기 전 상태(옛 저장 파일은 이어하기 시점)
  const ctrlBefore = { ...s.controller };
  const ctlCount = (m: Record<string, string>) => { let n = 0; for (const k in m) if (m[k] === pid) n++; return n; };
  const terrBefore = ctlCount(ctrlBefore);

  const r1 = applyDiff(s, w, main);
  const r2 = applyDiff(s, w, worldEv);
  const merged: ApplyResult = {
    notes: [...r1.notes, ...r2.notes], rejected: [...r1.rejected, ...r2.rejected], mapChanged: r1.mapChanged || r2.mapChanged,
  };

  // 세력 AI: 다른 나라들의 선전포고·휴전, 내가 시작한 전쟁에 대한 반응
  const playerWars = s.wars.filter((k) => !before.wars.has(k) && k.split('|').includes(pid));
  const ai = aiTurn(s, w, rng, level, playerWars);
  // 전쟁 중인 AI 군대의 진군·전투와, 모든 나라의 숨은 안정도(소요·반란)
  const war = aiWarTurn(s, w, rng, level); const home = stabilityTurn(s, w, rng, false);
  ai.news.push(...war.news, ...home); ai.headlines.push(...war.headlines); ai.againstPlayer = ai.againstPlayer || war.againstPlayer;
  const goal = goalsTurn(s, w); ai.news.push(...goal.news); ai.headlines.unshift(...goal.headlines);
  const worldHl = [...(worldEv.headlines ?? []), ...ai.headlines];
  const headlines = [...(main.headlines ?? []), ...worldHl].slice(0, 6);
  // 작은 AI는 서술을 빠뜨리기도 한다: 플레이어 명령 쪽 서술이 비면 해석과 이유로 한 줄을 채워 기사가 비지 않게 한다
  let mainNarr = (main.narrative ?? '').trim();
  if (!mainNarr && !pass) mainNarr = `${adj.interpretation || command} — ${success ? '성공했다' : '뜻대로 되지 않았다'}.${adj.reasoning ? ` ${adj.reasoning}` : ''}`.trim();
  const narrative = [mainNarr, worldEv.narrative].filter(Boolean).join('\n');
  const report: TurnReport = {
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, [before.stats[k], s.stats[pid]?.[k] ?? 0]])) as TurnReport['stats'],
    terr: [terrBefore, ctlCount(s.controller)],
    gained: Object.keys(s.controller).filter((k) => s.controller[k] === pid && ctrlBefore[k] !== pid).slice(0, 40),
    lost: Object.keys(s.controller).filter((k) => ctrlBefore[k] === pid && s.controller[k] !== pid).slice(0, 40),
    rel: Object.keys(s.relations).concat(Object.keys(before.relations)).filter((k, i, a) => a.indexOf(k) === i && k.split('|').includes(pid))
      .map((k) => ({ c: k.split('|').find((x) => x !== pid)!, from: before.relations[k] ?? 0, to: s.relations[k] ?? 0 }))
      .filter((r) => r.from !== r.to).sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, 8),
    warsStart: s.wars.filter((k) => !before.wars.has(k) && !ai.warKeys.includes(k)), warsEnd: [...before.wars].filter((k) => !s.wars.includes(k) && !ai.peaceKeys.includes(k)),
  };
  const record: TurnRecord = {
    turn: s.turn, date: s.date, command, interpretation: adj.interpretation, feasibility, roll,
    outcome: pass ? 'pass' : success ? 'success' : 'failure', narrative, headlines, notes: merged.notes, rejected: merged.rejected, mode,
    base: adj.feasibility, difficulty: level, report, reasoning: pass ? '' : (adj.reasoning ?? '').slice(0, 400),
    main: { narrative: mainNarr, headlines: main.headlines ?? [] }, world: { narrative: worldEv.narrative ?? '', headlines: worldHl },
    diplo: ai.news,
    alert: goal.ended || ai.againstPlayer || playerWars.length > 0 || merged.notes.some((n) => n.startsWith('💀')) || report.lost.length >= 2 || report.gained.length >= 3,
  };

  s.rng = rng.state();
  s.turn += 1;
  healGenerals(s);
  s.date = addMonths(s.date, s.turnMonths ?? 1);
  s.log.push(record);
  if (s.log.length > 240) s.log.splice(0, s.log.length - 240);
  ledgerTurn(s, w, record, ai, goal.news.map((n) => n.replace(/^[^\s]+\s/, '')));
  // AI가 적은 기억(약속·진행 중 계획·인물)은 날짜를 붙여 12줄까지 두고, 같은 줄은 한 번만 남긴다
  const mem = adj.memory ? `${fmtDate(record.date)} ${adj.memory.replace(/\s+/g, ' ').slice(0, 160)}` : (command ? `${fmtDate(record.date)} 명령 "${(adj.interpretation || command).slice(0, 60)}": ${success ? '성공' : '실패'}` : '');
  if (mem) s.memory = [...s.memory.split('\n'), mem].filter((l, i, a) => l.trim() && a.indexOf(l) === i).slice(-12).join('\n').slice(-MEMORY_MAX);
  return { record, mapChanged: merged.mapChanged };
}
