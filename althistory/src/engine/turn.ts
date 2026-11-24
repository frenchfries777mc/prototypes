import type { World } from '../data/world';
import type { Adjudication, ApplyResult, Diff } from './diff';
import { applyDiff } from './diff';
import type { GameState, TurnRecord } from './state';
import { advanceMonth } from './state';
import { makeRng } from './rng';

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
  const success = pass ? true : roll < adj.feasibility;
  const main: Diff = pass ? {} : success ? adj.if_success : adj.if_failure;

  const r1 = applyDiff(s, w, main);
  const r2 = applyDiff(s, w, adj.world_events);
  const merged: ApplyResult = {
    notes: [...r1.notes, ...r2.notes], rejected: [...r1.rejected, ...r2.rejected], mapChanged: r1.mapChanged || r2.mapChanged,
  };

  const headlines = [...(main.headlines ?? []), ...(adj.world_events.headlines ?? [])].slice(0, 6);
  const narrative = [main.narrative, adj.world_events.narrative].filter(Boolean).join('\n');
  const record: TurnRecord = {
    turn: s.turn, date: s.date, command, interpretation: adj.interpretation, feasibility: adj.feasibility, roll,
    outcome: pass ? 'pass' : success ? 'success' : 'failure', narrative, headlines, notes: merged.notes, rejected: merged.rejected, mode,
  };

  s.rng = rng.state();
  s.turn += 1;
  s.date = advanceMonth(s.date);
  s.log.push(record);
  if (s.log.length > 240) s.log.splice(0, s.log.length - 240);
  const mem = adj.memory || (command ? `${record.date.slice(0, 7)} ${adj.interpretation || command}: ${success ? '성공' : '실패'}` : '');
  if (mem) s.memory = `${s.memory}\n${mem}`.trim().split('\n').slice(-18).join('\n').slice(-MEMORY_MAX);
  return { record, mapChanged: merged.mapChanged };
}
