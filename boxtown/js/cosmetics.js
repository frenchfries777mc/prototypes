// 치장품: 옷가게에서 사고, 옷장(C)에서 갈아입는다. 산 것과 입은 것은 브라우저에 저장된다.
import { LOOKS } from './character.js';
import { stats } from './stats.js';

// [이름표, 값] — 값 0은 처음부터 가진 것
const ITEMS = {
  head: { hair: ['짧은 머리', 0], cap: ['야구 모자', 0], beanie: ['비니', 0], bald: ['민머리', 0], long: ['긴 머리', 300], pigtails: ['양갈래', 300], bun: ['똥머리', 300], spiky: ['삐죽 머리', 400], afro: ['아프로', 500], mohawk: ['모히칸', 600],
    straw: ['밀짚모자', 500], flower: ['꽃 머리핀', 500], bow: ['리본', 600], headphones: ['헤드폰', 800], hardhat: ['안전모', 800], chef: ['요리사 모자', 900], helmet: ['헬멧', 1000], party: ['고깔모자', 1000], propeller: ['프로펠러 모자', 1200],
    cowboy: ['카우보이 모자', 1500], cat: ['고양이 귀', 1500], bunny: ['토끼 귀', 1500], police: ['경찰 모자', 1800], santa: ['산타 모자', 2000], pirate: ['해적 모자', 2500], tophat: ['신사 모자', 3000], antenna: ['외계인 더듬이', 3000],
    horns: ['도깨비 뿔', 3500], viking: ['바이킹 투구', 4000], wizard: ['마법사 모자', 5000], halo: ['천사 고리', 8000], crown: ['왕관', 20000],
    egg: ['🤪 계란후라이', 700], plunger: ['🤪 뚫어뻥', 800], cone: ['🤪 고깔 콘', 900], pot: ['🤪 냄비', 1000], cheese: ['🤪 치즈', 1200], duck: ['🤪 오리', 1500], arrow: ['🤪 머리에 화살', 1500], fishhat: ['🤪 생선', 1500],
    cactus: ['🤪 선인장', 1800], banana: ['🤪 바나나', 2000], watermelon: ['🤪 수박 헬멧', 2000], chicken: ['🤪 닭 머리', 2500], toast: ['🤪 식빵', 2500], box: ['🤪 상자 머리', 3000], tv: ['🤪 텔레비전 머리', 4000], poop: ['🤪 똥 모자', 5000] },
  face: { none: ['없음', 0], glasses: ['안경', 400], sunglasses: ['선글라스', 800], mustache: ['콧수염', 500], beard: ['턱수염', 700], whitebeard: ['흰 수염', 1500], mask: ['마스크', 300], lollipop: ['막대사탕', 400], clown: ['빨간 코', 600],
    eyepatch: ['안대', 900], bandana: ['복면 두건', 1000], ninja: ['닌자 복면', 2000], visor: ['미래 고글', 2500], robot: ['로봇 얼굴', 4000],
    unibrow: ['🤪 일자 눈썹', 500], tongue: ['🤪 메롱', 600], snot: ['🤪 콧물', 600], teeth: ['🤪 뻐드렁니', 700], blush: ['🤪 볼 빨간', 800], bigeyes: ['🤪 왕눈이', 1200], groucho: ['🤪 코주부 안경', 1500], pinocchio: ['🤪 거짓말 코', 2000] },
  neck: { none: ['없음', 0], scarf: ['빨간 목도리', 400], scarfblue: ['파란 목도리', 400], tie: ['넥타이', 500], bowtie: ['나비넥타이', 600], belt: ['벨트', 300], suspenders: ['멜빵', 500], apron: ['앞치마', 500], badge: ['별 배지', 800],
    vest: ['구명조끼', 900], hawaii: ['꽃목걸이', 1000], necklace: ['금목걸이', 3000], medal: ['금메달', 4000], armor: ['갑옷', 6000],
    diaper: ['🤪 기저귀', 800], tutu: ['🤪 발레 치마', 1200], tube: ['🤪 오리 튜브', 1500], sandwich: ['🤪 샌드위치 광고판', 2000], barrel: ['🤪 나무통', 2500] },
  back: { none: ['없음', 0], backpack: ['배낭', 500], schoolbag: ['빨간 가방', 500], guitar: ['기타', 1200], tank: ['산소통', 1200], quiver: ['화살통', 1500], surfboard: ['서핑보드', 1800], balloon: ['풍선', 800], tail: ['여우 꼬리', 2000],
    shell: ['거북 등껍질', 2500], cape: ['빨간 망토', 3000], capeblack: ['검은 망토', 3000], sword: ['검', 3500], butterfly: ['나비 날개', 5000], batwings: ['박쥐 날개', 6000], wings: ['천사 날개', 8000], jetpack: ['제트팩', 12000],
    pan: ['🤪 프라이팬', 700], drumstick: ['🤪 닭다리', 900], ladder: ['🤪 사다리', 1000], fin: ['🤪 상어 지느러미', 1500], fishback: ['🤪 등에 생선', 1500], toilet: ['🤪 변기 뚜껑', 2500], rocket: ['🤪 장난감 로켓', 4000] },
};
const COLORS = {
  hat: ['#3a2a22', '#6b4226', '#d8a657', '#1f1f28', '#b5482e', '#8d8d99', '#f2644b', '#4f9bea', '#57c27a', '#f4c542', '#b072e0', '#f08fb0', '#3fc1c9', '#ffffff', '#ff5fa2', '#22d3a5'],
  shirt: ['#f2644b', '#4f9bea', '#57c27a', '#f4c542', '#b072e0', '#f08fb0', '#3fc1c9', '#f28b3c', '#e8e4dc', '#6b7a99', '#d9534f', '#22202b', '#ffffff', '#1f2a4a', '#7a5b45', '#ffd84a'],
  pants: ['#34456f', '#4a4f5e', '#7a5b45', '#2f6b5a', '#8a8fa3', '#3b3b4d', '#22202b', '#e8e4dc', '#b8322a', '#f4c542', '#4f9bea', '#b072e0'],
  shoes: ['#f5f1e8', '#2c2c36', '#b55b3c', '#e5553f', '#4f9bea', '#57c27a', '#ffd84a', '#f08fb0', '#b072e0', '#3fc1c9'],
  skin: ['#ffd3a8', '#ffe0c2', '#f6c193', '#e0a878', '#c68a5c', '#9c6843', '#6b4a32', '#9be08a', '#8fc7f2', '#c9a7f0', '#c9cede', '#ffe66b'],
};
const COLOR_PRICE = { hat: 200, shirt: 200, pants: 200, shoes: 200, skin: 0 };
const SPECIAL_SKIN = 1500; // 사람 살색이 아닌 색(초록, 파랑…)
const TABS = [['head', '머리'], ['face', '얼굴'], ['neck', '몸'], ['back', '등'], ['hat', '머리 색'], ['shirt', '윗옷'], ['pants', '바지'], ['shoes', '신발'], ['skin', '피부']];
const won = (n) => n.toLocaleString('ko-KR');
const DEFAULT = { ...LOOKS.courier, face: 'none', neck: 'none', back: 'none' };

export class Wardrobe {
  constructor({ character, player, jobs }) {
    Object.assign(this, { character, player, jobs });
    this.look = { ...DEFAULT }; this.owned = new Set(); this.tab = 'head'; this.shop = false; this.open = false;
    try {
      Object.assign(this.look, JSON.parse(localStorage.getItem('boxtown.look') || '{}'));
      this.owned = new Set(JSON.parse(localStorage.getItem('boxtown.cosmetics') || '[]'));
    } catch (e) { /* 저장소를 못 쓰는 환경 */ }
    // 저장된 값이 지금 목록에 없으면 기본으로 되돌린다.
    for (const slot in ITEMS) if (!ITEMS[slot][this.look[slot]]) this.look[slot] = DEFAULT[slot];
    character.setLook(this.look);
    this.el = document.getElementById('wardrobe');
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab],[data-item],[data-close]');
      if (!t) return;
      if (t.dataset.close !== undefined) this.close();
      else if (t.dataset.tab) { this.tab = t.dataset.tab; this.render(); }
      else this.pick(this.tab, t.dataset.item);
    });
    addEventListener('keydown', (e) => { if (e.code === 'KeyC') this.toggle(false); else if (e.code === 'Escape' && this.open) this.close(); });
    document.getElementById('btnCloset').addEventListener('click', () => this.toggle(false));
  }
  price(slot, id) {
    if (ITEMS[slot]) return ITEMS[slot][id][1];
    if (slot === 'skin') return COLORS.skin.indexOf(id) >= 7 ? SPECIAL_SKIN : 0;
    return id === DEFAULT[slot] ? 0 : COLOR_PRICE[slot];
  }
  has(slot, id) { return this.price(slot, id) === 0 || this.owned.has(slot + ':' + id); }
  save() {
    try { localStorage.setItem('boxtown.look', JSON.stringify(this.look)); localStorage.setItem('boxtown.cosmetics', JSON.stringify([...this.owned])); } catch (e) { /* 무시 */ }
  }
  // 가진 것은 입고, 없는 것은 옷가게에서만 산다.
  pick(slot, id) {
    if (!this.has(slot, id)) {
      if (!this.shop) return;
      if (!this.jobs.spend(this.price(slot, id))) { this.note = '돈이 모자라요'; this.render(); return; }
      this.owned.add(slot + ':' + id); stats.bump('bought');
    }
    this.note = '';
    this.look[slot] = id;
    this.character.setLook(this.look);
    this.save(); this.render();
  }
  toggle(shop) { if (this.open) this.close(); else this.show(shop); }
  show(shop) {
    if (this.player.vehicle) return;
    this.open = true; this.shop = shop; this.note = '';
    if (document.pointerLockElement) document.exitPointerLock();
    this.character.heading = this.player.yaw + Math.PI; // 화면 쪽을 보게 돌려 세운다
    this.el.hidden = false; this.render();
  }
  close() { this.open = false; this.el.hidden = true; }
  render() {
    const slot = this.tab, cur = this.look[slot];
    const ids = ITEMS[slot] ? Object.keys(ITEMS[slot]) : COLORS[slot];
    const cells = ids.map((id) => {
      const has = this.has(slot, id), price = this.price(slot, id), on = cur === id;
      const label = ITEMS[slot] ? ITEMS[slot][id][0] : '';
      const tag = on ? '착용 중' : has ? (ITEMS[slot] ? '보유' : '') : this.shop ? won(price) + '원' : '🔒 ' + won(price) + '원';
      const sw = ITEMS[slot] ? '' : `<i style="background:${id}"></i>`;
      return `<button data-item="${id}" class="${on ? 'on' : ''} ${has ? '' : this.shop ? 'buy' : 'lock'} ${ITEMS[slot] ? '' : 'color'}">${sw}${label ? `<b>${label}</b>` : ''}<small>${tag}</small></button>`;
    }).join('');
    this.el.innerHTML = `<header><b>${this.shop ? '옷가게' : '옷장'}</b><span>${this.note || (this.shop ? '눌러서 사고 바로 입어요' : '가진 것만 갈아입을 수 있어요. 새 옷은 옷가게에서!')}</span><button data-close>✕</button></header>`
      + `<nav>${TABS.map(([k, name]) => `<button data-tab="${k}" class="${k === slot ? 'on' : ''}">${name}</button>`).join('')}</nav><div class="grid">${cells}</div>`;
  }
}
