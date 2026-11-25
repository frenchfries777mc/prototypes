import type { Diff } from './diff';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal';
export const DIFFICULTIES: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'easy', name: '쉬움', desc: '성공 확률이 후하고, 이득은 크고 손실은 작다. 적국이 소극적이다.' },
  { id: 'normal', name: '보통', desc: 'AI가 정한 확률 그대로. 균형 잡힌 세계.' },
  { id: 'hard', name: '어려움', desc: '성공 확률이 낮아지고, 적국이 적극적이다. 이득은 작고 손실은 크다.' },
  { id: 'brutal', name: '지옥', desc: '냉혹한 현실. 무리한 명령은 거의 실패하고 매 턴 위기가 닥친다.' },
];
export const diffOf = (s: { difficulty?: Difficulty } | undefined): Difficulty => s?.difficulty ?? 'normal';
export const diffName = (d: Difficulty): string => DIFFICULTIES.find((x) => x.id === d)?.name ?? '보통';

/** AI가 말한 성공 확률(0~100)을 난이도에 맞게 보정한다. 확실한 일(100)·불가능한 일(0)의 양끝은 비율로 줄이거나 늘린다. */
export function adjustFeasibility(f: number, d: Difficulty): number {
  const x = d === 'easy' ? f + (100 - f) * 0.35 : d === 'hard' ? f * 0.88 : d === 'brutal' ? f * 0.75 : f;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** 플레이어 국가의 능력치 변화에 난이도 배율을 적용한다(0이 되지 않게 최소 1은 남긴다). */
const SCALE: Record<Difficulty, [number, number]> = { easy: [1.5, 0.6], normal: [1, 1], hard: [0.8, 1.3], brutal: [0.65, 1.6] };
export function scaleDiff(diff: Diff, player: string, d: Difficulty): Diff {
  if (d === 'normal' || !diff.stat_changes?.length) return diff;
  const [pos, neg] = SCALE[d];
  return {
    ...diff,
    stat_changes: diff.stat_changes.map((c) => {
      if (c.country !== player || !Number.isFinite(c.delta) || c.delta === 0) return c;
      const v = Math.round(c.delta * (c.delta > 0 ? pos : neg));
      return { ...c, delta: v === 0 ? Math.sign(c.delta) : v };
    }),
  };
}

/** AI 판정관에게 주는 난이도 지침. */
export function difficultyBrief(d: Difficulty): string {
  if (d === 'easy') return 'DIFFICULTY: EASY — 플레이어에게 관대하게 판정하라. feasibility를 후하게 주고, 세계 사건은 무해하거나 플레이어에게 유리하게. 적국과 경쟁국은 소극적이다.';
  if (d === 'hard') return 'DIFFICULTY: HARD — 엄격하게 판정하라. feasibility를 낮게 주고, 성공해도 비용과 부작용을 함께 서술하라. 적국과 경쟁국은 능동적으로 행동하고 플레이어의 약점을 공략한다.';
  if (d === 'brutal') return 'DIFFICULTY: BRUTAL — 냉혹한 현실 시뮬레이션. 국력 차이와 역사적 개연성을 엄격히 반영하고 무리한 명령의 feasibility는 0~10으로 주라. 성공해도 큰 대가를 치르게 하고, world_events에는 매 턴 플레이어를 압박하는 외교·군사·내정 위기를 넣어라. 적국은 기회를 놓치지 않는다.';
  return '';
}
