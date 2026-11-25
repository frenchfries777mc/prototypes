// 평판: 일(직업)마다 따로 쌓인다. 해낼 때마다 오르고, 오를수록 벌이가 늘고 단골 손님이 팁을 주며, 차 판매장에서 그 일에 어울리는 차가 풀린다.
const KEY = 'boxtown.rep';
const LV = [0, 5, 14, 30, 55, 90]; // 이 점수에 닿으면 그 단계
const TITLES = ['신입', '일꾼', '단골 확보', '동네 명물', '달인', '전설'];
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };

export const rep = {
  data: load(),
  names: {}, // { 일 이름표: { name, color } } (jobs.js가 채운다)
  setNames(n) { this.names = n; },
  pts(k) { return this.data[k] || 0; },
  level(k) { const p = this.pts(k); let l = 0; for (let i = 1; i < LV.length; i++) if (p >= LV[i]) l = i; return l; },
  title(k) { return TITLES[this.level(k)]; },
  max() { return LV.length - 1; },
  // 막대용: { lv, now, next, ratio }
  progress(k) {
    const l = this.level(k), p = this.pts(k);
    if (l >= LV.length - 1) return { lv: l, now: p, next: null, ratio: 1 };
    return { lv: l, now: p - LV[l], next: LV[l + 1] - LV[l], ratio: (p - LV[l]) / (LV[l + 1] - LV[l]) };
  },
  // 점수를 더한다. 단계가 오르면 새 단계를 돌려준다(아니면 0).
  add(k, n = 1) {
    if (!k) return 0;
    const before = this.level(k);
    this.data[k] = this.pts(k) + n;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 저장소를 못 쓰는 환경 */ }
    const after = this.level(k);
    return after > before ? after : 0;
  },
  bonus(k) { return 1 + 0.05 * this.level(k); }, // 단계마다 벌이 5% 증가
  tipChance(k) { const l = this.level(k); return l >= 2 ? Math.min(0.5, 0.1 * l) : 0; }, // 단골 손님이 팁을 줄 확률
  levelUpReward(l) { return 120 * l; },
  reset() { this.data = {}; try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } },
};

// 차 판매장에서 평판으로 풀리는 차: [일, 필요한 단계]
export const CAR_REQ = {
  'cars/van': ['pizza', 1], 'cars/taxi': ['taxi', 2], 'cars/truck': ['cargo', 2], 'cars/truck-flat': ['cargo', 3],
  'cars/tractor': ['farmer', 1], 'cars/tractor-shovel': ['farmer', 3], 'cars/ambulance': ['nurse', 3], 'cars/firetruck': ['fire', 3],
  'cars/race': ['race', 2], 'cars/race-future': ['race', 4],
};
