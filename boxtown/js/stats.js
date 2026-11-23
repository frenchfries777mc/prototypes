// 내 기록과 오늘의 일거리. 숫자 몇 개를 브라우저에 저장해 두고, 하루마다 세 가지 일거리를 낸다.
const KEY = 'boxtown.stats', DAY = 'boxtown.daily';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } };

// 일거리 후보: [기록 이름, 목표, 문구, 보상]
const POOL = [
  ['earned', 1500, '1,500원 벌기', 400], ['earned', 3000, '3,000원 벌기', 700], ['jobs', 5, '일 5번 해내기', 400], ['jobs', 10, '일 10번 해내기', 700],
  ['escapes', 1, '경찰 따돌리기', 500], ['rides', 1, '기차 타 보기', 300], ['bought', 1, '치장품 하나 사기', 300], ['kos', 3, '불량배 3명 혼내 주기', 500],
];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export const stats = {
  data: load(KEY, {}),
  onReward: null, // (돈, 문구) => 보상 주기
  get(k) { return this.data[k] || 0; },
  bump(k, n = 1) { this.data[k] = this.get(k) + n; save(KEY, this.data); this.check(); },
  // 오늘의 일거리 세 개(날짜로 고른다). 날이 바뀌면 새로 낸다.
  daily() {
    let d = load(DAY, null);
    if (!d || d.date !== today()) {
      const t = today(); let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const picks = []; while (picks.length < 3) { h = (h * 1103515245 + 12345) >>> 0; const i = (h >>> 8) % POOL.length; if (!picks.some((p) => POOL[p][0] === POOL[i][0])) picks.push(i); }
      d = { date: t, picks, base: picks.map((i) => this.get(POOL[i][0])), done: [false, false, false] };
      save(DAY, d);
    }
    return d;
  },
  quests() {
    const d = this.daily();
    return d.picks.map((i, k) => { const [key, goal, text, reward] = POOL[i]; return { text, reward, goal, now: Math.min(goal, this.get(key) - d.base[k]), done: d.done[k] }; });
  },
  check() {
    const d = this.daily();
    d.picks.forEach((i, k) => {
      const [key, goal, text, reward] = POOL[i];
      if (!d.done[k] && this.get(key) - d.base[k] >= goal) { d.done[k] = true; save(DAY, d); if (this.onReward) this.onReward(reward, text); }
    });
  },
  reset() { this.data = {}; save(KEY, {}); try { localStorage.removeItem(DAY); } catch (e) { /* 무시 */ } },
};
