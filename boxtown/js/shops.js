// 가게 운영: 마트·편의점·카페·버거·피자집을 사서 내 가게로 만든다. 가게는 시간이 흐르면 금전함에 돈이 쌓이고(게임을 꺼 둔 동안도, 최대치까지),
// 점원 앞에서 수령한다. 벌이는 가게 값의 약 1/120을 분당 벌어서, 가득 찬 금전함을 8번쯤 비우면 본전이다. 직원을 고용하면 벌이와 금전함 크기가 늘고, 내 가게에서는 물건이 20% 싸다.
const KEY = 'boxtown.shops';
const DEF = {
  store: { name: '편의점', price: 6000, rate: 50 }, cafe: { name: '카페', price: 7500, rate: 63 }, pizza: { name: '피자집', price: 9000, rate: 75 },
  burger: { name: '버거 가게', price: 10000, rate: 83 }, mart: { name: '마트', price: 14000, rate: 117 },
};
const MAX_STAFF = 3;
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };

export class Shops {
  constructor({ jobs, interiors }) {
    Object.assign(this, { jobs, interiors });
    this.data = load(); this.t = 0; this.said = false; this.lobby = null; this.note = '';
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 저장소를 못 쓰는 환경 */ } }
  has(id) { return !!DEF[id]; }
  owned(id) { return !!this.data[id]; }
  staff(id) { return (this.data[id] && this.data[id].staff) || 0; }
  rate(id) { return DEF[id].rate * (1 + 0.4 * this.staff(id)); } // 분당 벌이
  cap(id) { return this.rate(id) * (15 + 5 * this.staff(id)); } // 금전함에 쌓이는 한도(15분치 + 직원당 5분치)
  till(id) { const d = this.data[id]; if (!d) return 0; return Math.min(this.cap(id), ((Date.now() - d.last) / 60000) * this.rate(id)); }
  hireCost(id) { return Math.round((DEF[id].price * 0.35 * (this.staff(id) + 1)) / 50) * 50; }
  discount(id) { return this.owned(id) ? 0.8 : 1; } // 내 가게에서는 물건이 싸다
  // 점원 앞 창에 끼워 넣는 항목들
  entries(id) {
    if (!DEF[id]) return [];
    const D = DEF[id];
    if (!this.owned(id)) return [{ id: 'shop:buy', label: '🏪 이 가게 사기', sub: `${won(D.price)}원 · 분당 약 ${won(D.rate)}원`, state: 'buy' }];
    const t = Math.floor(this.till(id)), st = this.staff(id);
    return [
      { id: 'shop:collect', label: '💰 금전함 수령', sub: `${won(t)}원 / 최대 ${won(this.cap(id))}원`, state: t >= 10 ? 'buy' : 'lock' },
      { id: 'shop:hire', label: `👥 직원 고용 (${st}/${MAX_STAFF})`, sub: st >= MAX_STAFF ? '최대' : `${won(this.hireCost(id))}원 · 벌이 +40%`, state: st >= MAX_STAFF ? 'lock' : 'buy' },
      { id: 'shop:info', label: `📈 우리 가게 · 분당 ${won(this.rate(id))}원`, sub: '내 가게에서는 물건이 20% 싸요', state: 'lock' },
    ];
  }
  // 창에서 고른 것을 처리한다. 알림 문구를 돌려준다.
  pick(id, k) {
    const D = DEF[id], J = this.jobs;
    if (!D) return '';
    if (k === 'shop:buy') {
      if (this.owned(id)) return '';
      if (!J.spend(D.price)) return '돈이 모자라요';
      this.data[id] = { staff: 0, last: Date.now() }; this.save();
      J.notice(`🏪 ${D.name}을(를) 샀어요! 이제 내 가게예요`, 'good');
      return `${D.name} 사장님이 되었어요`;
    }
    if (!this.owned(id)) return '';
    if (k === 'shop:collect') {
      const t = Math.floor(this.till(id));
      if (t < 10) return '아직 금전함이 비어 있어요';
      J.money += t; this.data[id].last = Date.now(); this.save();
      try { localStorage.setItem('boxtown.money', String(J.money)); } catch (e) { /* 무시 */ }
      J.renderMoney(); J.notice(`💰 ${D.name} 금전함에서 ${won(t)}원을 찾았어요`, 'good');
      return `${won(t)}원을 가져왔어요`;
    }
    if (k === 'shop:hire') {
      if (this.staff(id) >= MAX_STAFF) return '직원이 가득 찼어요';
      const cost = this.hireCost(id);
      if (!J.spend(cost)) return '돈이 모자라요';
      // 지금까지 쌓인 돈은 먼저 금전함에 고정해 두고(직원이 늘어도 소급해서 늘지 않게) 새 비율로 이어간다.
      const kept = this.till(id); this.data[id].staff++; this.data[id].last = Date.now() - (kept / this.rate(id)) * 60000; this.save();
      J.notice(`👥 ${D.name}에 직원을 고용했어요 (${this.staff(id)}/${MAX_STAFF})`, 'good');
      return '직원을 고용했어요';
    }
    return '';
  }
  marks() {
    const out = [];
    for (const id of Object.keys(this.data)) { const d = this.interiors.doors.find((x) => x.id === id); if (d) out.push({ x: d.x, z: d.z, color: '#57c27a', name: '내 ' + DEF[id].name }); }
    return out;
  }
  update(dt) {
    this.t += dt;
    if (!this.said && this.t > 6 && !(this.lobby && this.lobby.open)) {
      this.said = true;
      const total = Object.keys(this.data).reduce((a, id) => a + Math.floor(this.till(id)), 0);
      if (total >= 100) this.jobs.notice(`🏪 내 가게 금전함에 ${won(total)}원이 쌓였어요`, 'good');
    }
  }
}
