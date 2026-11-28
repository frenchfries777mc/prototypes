import type { World } from '../data/world';
import type { Goal, GameState } from './state';
import { isAlive } from './state';

export const ctlCount = (s: GameState, c: string): number => { let n = 0; for (const k in s.controller) if (s.controller[k] === c) n++; return n; };

/** 플레이어 나라의 현재 상태에 맞춘 목표 4개: 영토·경제·영향력·생존. 3개를 이루면 승리. */
export function makeGoals(s: GameState): Goal[] {
  const st = s.stats[s.playerId]; if (!st) return [];
  const n = ctlCount(s, s.playerId), gain = Math.min(40, Math.max(3, Math.ceil(n * 0.25))), span = Math.max(8, Math.ceil(60 / (s.turnMonths ?? 1)));
  const up = (v: number) => Math.min(100, v + 15);
  return [
    { id: 'expand', label: `영토 ${n + gain}주 이상 확보`, base: n, target: n + gain },
    { id: 'wealth', label: `경제 ${up(st.economy)} 달성`, base: st.economy, target: up(st.economy) },
    { id: 'power', label: `영향력 ${up(st.influence)} 달성`, base: st.influence, target: up(st.influence) },
    { id: 'survive', label: `${span}턴 동안 나라를 지킨다`, base: s.turn, target: s.turn + span },
  ];
}
export const goalNow = (s: GameState, g: Goal): number =>
  g.id === 'expand' ? ctlCount(s, s.playerId) : g.id === 'wealth' ? s.stats[s.playerId]?.economy ?? 0 : g.id === 'power' ? s.stats[s.playerId]?.influence ?? 0 : s.turn;
/** 화면용 진행도 "현재/목표" */
export const goalText = (s: GameState, g: Goal): string => g.id === 'survive' ? `${Math.min(g.target - g.base, goalNow(s, g) - g.base)}/${g.target - g.base}` : `${Math.min(g.target, goalNow(s, g))}/${g.target}`;

/** 이번 턴 목표 달성 여부와 결말(승리·멸망·정권 붕괴)을 판정한다. 결말은 한 번만 난다(승리 뒤에도 계속 플레이할 수 있다). */
export function goalsTurn(s: GameState, w: World): { news: string[]; headlines: string[]; ended: boolean } {
  const out = { news: [] as string[], headlines: [] as string[], ended: false };
  const pid = s.playerId, name = w.label(pid);
  s.goals ??= makeGoals(s);
  for (const g of s.goals) if (g.done === undefined && goalNow(s, g) >= g.target) {
    g.done = s.turn; out.news.push(`🎯 목표 달성: ${g.label}`); out.headlines.push(`${name}, 목표 달성 — ${g.label}`);
  }
  if (s.ending) return out;
  const done = s.goals.filter((g) => g.done !== undefined).length, st = s.stats[pid];
  // 반란으로 잠깐 오르내려도 끊기지 않게: 15 이하면 쌓이고, 40 이상으로 회복해야 0으로 돌아간다
  if (st) s.lowStab = st.stability <= 15 ? (s.lowStab ?? 0) + 1 : st.stability >= 40 ? 0 : s.lowStab ?? 0;
  const t = s.tally, facts = t ? ` 치른 전쟁 ${t.wars}번, 얻은 땅 ${t.gained}주, 잃은 땅 ${t.lost}주.` : '';
  const turns = s.turn - (s.goals.find((g) => g.id === 'survive')?.base ?? 1) + 1;
  if (!isAlive(s, pid) || ctlCount(s, pid) === 0) s.ending = { kind: 'defeat', turn: s.turn, title: '멸망', text: `${name}은(는) ${turns}턴 만에 지도에서 사라졌다.${facts}` };
  else if ((s.lowStab ?? 0) >= 4) s.ending = { kind: 'defeat', turn: s.turn, title: '정권 붕괴', text: `민심이 완전히 돌아서 ${name}의 정부가 무너졌다. 오랜 소요와 반란을 수습하지 못했다.${facts}` };
  else if (done >= 3) s.ending = { kind: 'victory', turn: s.turn, title: done >= 4 ? '완전한 승리' : '승리', text: `${name}은(는) ${turns}턴 동안 목표 ${done}/4를 이루었다 — ${s.goals.filter((g) => g.done !== undefined).map((g) => g.label).join(', ')}.${facts} 계속 플레이할 수 있다.` };
  if (s.ending) { out.ended = true; out.headlines.unshift(`${s.ending.title}: ${name}`); out.news.push(`🏁 ${s.ending.title} — ${s.ending.text}`); }
  return out;
}
