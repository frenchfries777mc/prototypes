// 가게에서 파는 물건과 음식, 그리고 가방. 산 것은 가방에 담기고, B(또는 🎒 버튼)로 가방을 열어 쓴다.
import { Panel } from './panel.js';
const won = (n) => n.toLocaleString('ko-KR');
const BAG_MAX = 16;
// 이름, 값, 효과 종류, 효과 크기, 설명
export const ITEMS = {
  gum: ['풍선껌', 50, 'heal', 5, '체력 +5'], candy: ['사탕', 80, 'heal', 8, '체력 +8'], chips: ['감자칩', 150, 'heal', 15, '체력 +15'], ramen: ['컵라면', 250, 'heal', 25, '체력 +25'], kimbap: ['삼각김밥', 200, 'heal', 20, '체력 +20'],
  water: ['생수', 100, 'heal', 10, '체력 +10'], soda: ['탄산음료', 180, 'speed', 30, '30초 동안 빨라져요'], energy: ['에너지 음료', 400, 'speed', 90, '90초 동안 빨라져요'],
  coffee: ['커피', 300, 'speed', 60, '60초 동안 빨라져요'], latte: ['라테', 350, 'heal', 30, '체력 +30'], cake: ['조각 케이크', 450, 'heal', 40, '체력 +40'], cookie: ['쿠키', 150, 'heal', 12, '체력 +12'], icecream: ['아이스크림', 250, 'heal', 22, '체력 +22'],
  slice: ['피자 한 조각', 350, 'heal', 35, '체력 +35'], pizza: ['피자 한 판', 900, 'heal', 100, '체력 가득'], pasta: ['스파게티', 600, 'heal', 60, '체력 +60'], cola: ['콜라', 180, 'speed', 30, '30초 동안 빨라져요'],
  burger: ['햄버거', 500, 'heal', 50, '체력 +50'], cheeseburger: ['치즈버거', 650, 'heal', 65, '체력 +65'], fries: ['감자튀김', 250, 'heal', 22, '체력 +22'], nuggets: ['너겟', 300, 'heal', 28, '체력 +28'], shake: ['밀크셰이크', 350, 'jump', 60, '60초 동안 높이 뛰어요'], set: ['버거 세트', 1100, 'heal', 100, '체력 가득'],
  medkit: ['구급상자', 800, 'heal', 100, '체력 가득'], bandage: ['붕대', 300, 'heal', 35, '체력 +35'], repair: ['수리 키트', 1200, 'repair', 100, '타고 있거나 가까운 차를 고쳐요'], spring: ['스프링 신발', 900, 'jump', 120, '2분 동안 높이 뛰어요'],
  skates: ['롤러스케이트', 1000, 'speed', 180, '3분 동안 빨라져요'], firework: ['폭죽', 500, 'firework', 1, '하늘에 펑!'], donut: ['도넛 상자', 1500, 'bribe', 1, '경찰 별 하나가 줄어요'], apple: ['사과', 120, 'heal', 12, '체력 +12'], banana: ['바나나', 120, 'heal', 12, '체력 +12'],
  bread: ['식빵', 200, 'heal', 18, '체력 +18'], milk: ['우유', 180, 'heal', 15, '체력 +15'], watermelon: ['수박', 700, 'heal', 70, '체력 +70'], lunchbox: ['도시락', 550, 'heal', 55, '체력 +55'],
};
// 가게(방 이름)마다 파는 것
export const MENUS = {
  store: ['gum', 'candy', 'chips', 'kimbap', 'ramen', 'water', 'soda', 'energy', 'bandage'],
  cafe: ['coffee', 'latte', 'cake', 'cookie', 'icecream'],
  pizza: ['slice', 'pizza', 'pasta', 'cola'],
  burger: ['burger', 'cheeseburger', 'set', 'fries', 'nuggets', 'shake', 'cola'],
  mart: ['apple', 'banana', 'bread', 'milk', 'lunchbox', 'watermelon', 'chips', 'ramen', 'energy', 'medkit', 'bandage', 'repair', 'spring', 'skates', 'firework', 'donut'],
};
const SHOP_NAME = { store: '편의점', cafe: '카페', pizza: '피자집', burger: '버거 가게', mart: '마트' };

export class Bag {
  constructor({ player, jobs, health, interiors, garage, weapons, police }) {
    Object.assign(this, { player, jobs, health, interiors, garage, weapons, police });
    this.items = {}; this.speedT = 0; this.jumpT = 0;
    try { this.items = JSON.parse(localStorage.getItem('boxtown.bag') || '{}') || {}; } catch (e) { /* 무시 */ }
    for (const k of Object.keys(this.items)) if (!ITEMS[k] || !(this.items[k] > 0)) delete this.items[k];
    addEventListener('keydown', (e) => { if (e.code === 'KeyB' && !e.repeat) this.toggle(); });
    document.getElementById('btnBag').addEventListener('click', () => this.toggle());
    this.buff = document.getElementById('buff');
  }
  count() { return Object.values(this.items).reduce((a, b) => a + b, 0); }
  save() { try { localStorage.setItem('boxtown.bag', JSON.stringify(this.items)); } catch (e) { /* 무시 */ } }
  // ----- 가게 -----
  shop() {
    const d = this.interiors.inside, r = d && this.interiors.rooms[d.room];
    if (!r || !MENUS[r.key] || !r.clerk) return null;
    const p = this.player.feet;
    return Math.hypot(r.cx + r.clerk[0] - p.x, r.cz + r.clerk[1] - p.z) < 4.2 ? r.key : null;
  }
  prompt() { const s = this.shop(); return s && !Panel.open && !this.interiors.atExit() ? (s === 'store' || s === 'mart' ? '물건 사기' : '주문하기') : ''; }
  use() {
    const s = this.shop();
    if (!s || this.interiors.atExit()) return false;
    if (Panel.open) { Panel.close(); return true; }
    this.note = '';
    Panel.show({
      title: SHOP_NAME[s], note: () => this.note || `산 것은 가방에 담겨요 (${this.count()}/${BAG_MAX}). B로 꺼내 써요`,
      items: () => MENUS[s].map((k) => ({ id: k, label: ITEMS[k][0], sub: `${ITEMS[k][4]} · ${won(ITEMS[k][1])}원`, state: 'buy' })),
      pick: (k) => {
        if (!MENUS[s].includes(k)) return;
        if (this.count() >= BAG_MAX) { this.note = '가방이 가득 찼어요'; return; }
        if (!this.jobs.spend(ITEMS[k][1])) { this.note = '돈이 모자라요'; return; }
        this.items[k] = (this.items[k] || 0) + 1; this.save(); this.note = `${ITEMS[k][0]}을(를) 담았어요`;
        if (this.weapons.sfx.ctx) this.weapons.sfx.play('pop');
      },
    });
    return true;
  }
  // ----- 가방 -----
  toggle() {
    if (Panel.open) { if (this.mine) Panel.close(); return; }
    this.mine = true; this.note = '';
    Panel.show({
      title: '가방', note: () => this.note || (this.count() ? '눌러서 써요' : '비어 있어요. 편의점·마트·음식점에서 사 보세요'),
      items: () => Object.keys(this.items).map((k) => ({ id: k, label: `${ITEMS[k][0]} ×${this.items[k]}`, sub: ITEMS[k][4], state: '' })),
      pick: (k) => this.consume(k),
      close: () => { this.mine = false; },
    });
  }
  consume(k) {
    const it = ITEMS[k], P = this.player, H = this.health;
    if (!it || !(this.items[k] > 0)) return;
    const [name, , kind, n] = it;
    if (kind === 'heal') { if (H.hp >= 100) { this.note = '체력이 이미 가득해요'; return; } H.hp = Math.min(100, H.hp + n); this.note = `${name}: 체력 ${Math.round(H.hp)}`; }
    else if (kind === 'speed') { this.speedT = Math.max(this.speedT, n); this.note = `${name}: 발이 빨라졌어요`; }
    else if (kind === 'jump') { this.jumpT = Math.max(this.jumpT, n); this.note = `${name}: 높이 뛸 수 있어요`; }
    else if (kind === 'repair') {
      const car = P.vehicle || this.garage.nearest(P.feet, 4);
      if (!car || car.dead) { this.note = '고칠 차가 가까이에 없어요'; return; }
      if (car.hp >= 100) { this.note = '이 차는 멀쩡해요'; return; }
      car.hp = 100; this.note = '차를 말끔히 고쳤어요';
    } else if (kind === 'firework') {
      if (P.inside) { this.note = '밖에서 쏘세요'; return; }
      const f = P.feet, W = this.weapons;
      for (let i = 0; i < 4; i++) setTimeout(() => { const x = f.x + (Math.random() - 0.5) * 14, y = f.y + 16 + Math.random() * 10, z = f.z + (Math.random() - 0.5) * 14; W.emit('boom', x, y, z, 70); W.emit('spark', x, y, z, 80); W.emit('star', x, y, z, 30); if (W.sfx.ctx) W.sfx.play('pop'); }, i * 380);
      this.note = '펑! 펑!';
    } else if (kind === 'bribe') {
      if (this.police.level === 0) { this.note = '지금은 쫓기고 있지 않아요'; return; }
      this.police.heat = Math.max(0, this.police.heat - 85); this.police.level = this.police.heat >= 170 ? 3 : this.police.heat >= 90 ? 2 : this.police.heat >= 28 ? 1 : 0;
      if (this.police.heat <= 0) this.police.heat = 0.01; // 다음 프레임에 '따돌림'으로 풀린다
      this.note = '경찰이 도넛에 한눈을 팔아요';
    }
    if (--this.items[k] <= 0) delete this.items[k];
    this.save();
    if (this.weapons.sfx.ctx) this.weapons.sfx.play('pop');
  }
  update(dt) {
    const P = this.player;
    if (this.speedT > 0) this.speedT -= dt;
    if (this.jumpT > 0) this.jumpT -= dt;
    P.speedBoost = this.speedT > 0 ? 1.35 : 1; P.jumpBoost = this.jumpT > 0 ? 1.45 : 1;
    const t = (this.speedT > 0 ? `💨 ${Math.ceil(this.speedT)}초  ` : '') + (this.jumpT > 0 ? `🦘 ${Math.ceil(this.jumpT)}초` : '');
    if (t !== this.shown) { this.shown = t; this.buff.textContent = t; this.buff.hidden = !t; }
  }
}
