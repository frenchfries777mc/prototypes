import type { World } from '../data/world';
import type { CountryId } from '../data/types';
import type { GameState } from './state';
import { clamp, isAlive, warsOf } from './state';
import type { Rng } from './rng';

/** 안정도(숨은 변수)가 플레이어 명령 성공 확률에 주는 보정: 50 기준 ±10%p(내부 지지가 두터우면 일이 잘 풀린다). */
export const supportBonus = (s: GameState): number => Math.round(((s.stats[s.playerId]?.stability ?? 50) - 50) * 0.2);

/**
 * 모든 나라의 안정도를 한 턴 갱신하고, 낮으면 소요·반란을 일으킨다. 안정도는 화면에 나오지 않고 기사로만 드러난다.
 *  - 목표치(경제·영향력이 받쳐주면 높고, 전쟁 중이면 깎임)를 향해 서서히 수렴 + 약간의 무작위
 *  - 35 미만: 소요(경제 감소)  /  20 미만: 반란(먼 주 하나가 반란군 손에 넘어감, 주인 없는 땅 세력이 있는 시나리오만)
 *  - 60 이상: 내부 결집(가끔 군사·경제에 보탬)
 */
export function stabilityTurn(s: GameState, w: World, rng: Rng, onlyNews: boolean): string[] {
  const news: string[] = [], pid = s.playerId, L = (c: CountryId) => w.label(c);
  const rebel = [...w.countries.values()].find((c) => c.neutral)?.id;
  let shown = 0;
  for (const c of Object.keys(s.stats)) {
    if (!isAlive(s, c)) continue;
    const st = s.stats[c];
    const wars = warsOf(s, c).length;
    const target = 30 + st.economy * 0.4 + st.influence * 0.15 - wars * 7;
    st.stability = clamp(Math.round(st.stability + (target - st.stability) * 0.12 + (rng.next() - 0.5) * 4), 0, 100);
    const key = c === pid || shown < 2;
    if (st.stability >= 60 && rng.next() < 0.08) {
      st.military = clamp(st.military + 1, 0, 100);
      if (c === pid) news.push(`${L(c)} 국민들이 정부를 믿고 따르며, 병역과 납세가 순조롭다는 소식이다.`);
    } else if (st.stability < 20 && rng.next() < (20 - st.stability) / 40 + 0.1) {
      // 반란: 수도에서 먼 땅부터. 지금 지배하는 주 중 하나가 반란군에게 넘어간다.
      const mine = Object.keys(s.controller).filter((p) => s.controller[p] === c && s.owner[p] === c);
      if (mine.length >= 3 && rebel) {
        const p = mine[Math.floor(rng.next() * mine.length)];
        s.controller[p] = rebel; s.armies = s.armies.filter((a) => !(a.at === p && a.owner === c && a.troops <= 0));
        st.stability = clamp(st.stability + 12, 0, 100); st.economy = clamp(st.economy - 2, 0, 100);
        if (key) { news.push(`💥 ${L(c)}의 ${w.provLabel(p)}에서 반란이 일어나 지방을 장악당했다.`); shown++; }
        continue;
      }
      st.economy = clamp(st.economy - 2, 0, 100); st.military = clamp(st.military - 1, 0, 100);
      if (key) { news.push(`${L(c)}에서 대규모 폭동이 번지고 있다. 조정은 치안 유지에 애를 먹고 있다.`); shown++; }
    } else if (st.stability < 35 && rng.next() < 0.3) {
      st.economy = clamp(st.economy - 1, 0, 100);
      if (key && (c === pid || !onlyNews)) { news.push(`${L(c)}에서 정부에 항의하는 소요와 파업이 이어진다.`); shown++; }
    }
  }
  return news;
}
