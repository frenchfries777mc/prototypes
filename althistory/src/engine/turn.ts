import type { World } from '../data/world';
import type { Adjudication, ApplyResult, Diff } from './diff';
import { applyDiff } from './diff';
import type { GameState, TurnRecord, TurnReport } from './state';
import { addMonths, fmtDate } from './state';
import { STAT_KEYS } from '../data/types';
import { adjustFeasibility, diffOf, scaleDiff } from './difficulty';
import { makeRng } from './rng';
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
  const feasibility = pass ? 100 : adjustFeasibility(adj.feasibility, level);
  const success = pass ? true : roll < feasibility;
  // 난이도: 플레이어 국가의 능력치 변화에 배율을 곱한다(이득은 쉬울수록 크고, 손실은 어려울수록 크다)
  const main: Diff = pass ? {} : scaleDiff(success ? adj.if_success : adj.if_failure, pid, level);
  const worldEv: Diff = scaleDiff(adj.world_events, pid, level);

  // 신문에 실을 "턴 전후 비교"를 위해 먼저 찍어 둔다
  const before = { stats: { ...s.stats[pid] }, relations: { ...s.relations }, wars: new Set(s.wars) };
  const ctrlBefore = { ...s.controller };
  const ctlCount = (m: Record<string, string>) => { let n = 0; for (const k in m) if (m[k] === pid) n++; return n; };
  const terrBefore = ctlCount(ctrlBefore);

  const r1 = applyDiff(s, w, main);
  const r2 = applyDiff(s, w, worldEv);
  const merged: ApplyResult = {
    notes: [...r1.notes, ...r2.notes], rejected: [...r1.rejected, ...r2.rejected], mapChanged: r1.mapChanged || r2.mapChanged,
  };

  const headlines = [...(main.headlines ?? []), ...(worldEv.headlines ?? [])].slice(0, 6);
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
    warsStart: s.wars.filter((k) => !before.wars.has(k)), warsEnd: [...before.wars].filter((k) => !s.wars.includes(k)),
  };
  const record: TurnRecord = {
    turn: s.turn, date: s.date, command, interpretation: adj.interpretation, feasibility, roll,
    outcome: pass ? 'pass' : success ? 'success' : 'failure', narrative, headlines, notes: merged.notes, rejected: merged.rejected, mode,
    base: adj.feasibility, difficulty: level, report, reasoning: pass ? '' : (adj.reasoning ?? '').slice(0, 400),
    main: { narrative: mainNarr, headlines: main.headlines ?? [] }, world: { narrative: worldEv.narrative ?? '', headlines: worldEv.headlines ?? [] },
  };

  s.rng = rng.state();
  s.turn += 1;
  healGenerals(s);
  s.date = addMonths(s.date, s.turnMonths ?? 1);
  s.log.push(record);
  if (s.log.length > 240) s.log.splice(0, s.log.length - 240);
  const mem = adj.memory || (command ? `${fmtDate(record.date)} ${adj.interpretation || command}: ${success ? '성공' : '실패'}` : '');
  if (mem) s.memory = `${s.memory}\n${mem}`.trim().split('\n').slice(-18).join('\n').slice(-MEMORY_MAX);
  return { record, mapChanged: merged.mapChanged };
}
