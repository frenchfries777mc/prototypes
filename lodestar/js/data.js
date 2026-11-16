'use strict';
/* 로드스타 — 데이터: 영웅, 아이템, 밸런스 상수 */

var LANES = ['top', 'mid', 'bot'];
var LANE_NAME = { top: '상단', mid: '중앙', bot: '하단' };

/* 스킬 사양
   kind: shot(직선 투사체) | area(지면 지정) | dash(돌진) | blink(순간이동) | nova(자기 주변) | self(강화)
   ai  : 봇이 언제 쓰는지 — dmg | engage | gap | buff | shield | heal | stealth | haste | sanct */
var HEROES = {
  kael: {
    name: '카엘', title: '칼날 방랑자', role: '전사', cls: 'fighter', color: '#e3a23c', melee: true,
    tip: '돌진으로 파고들어 근접전을 벌이는 균형 잡힌 전사.',
    base: { hp: 660, mp: 260, ad: 60, armor: 32, as: 0.72, ms: 345, range: 160, hpr: 7, mpr: 6 },
    grow: { hp: 96, mp: 32, ad: 4.2, armor: 3.6, as: 0.025, ap: 0 },
    order: [0, 2, 1],
    skills: [
      { name: '질풍 가르기', d: '지정한 방향으로 돌진하며 지나친 적을 벱니다.', kind: 'dash', ai: 'engage',
        cd: [9, 8, 7, 6], cost: 40, range: 430, speed: 1700, hitRadius: 115, dmg: [70, 110, 150, 190], sAd: 0.8 },
      { name: '강철 의지', d: '보호막을 두르고 잠시 빨라집니다.', kind: 'self', ai: 'shield',
        cd: 14, cost: 50, buff: { dur: 3, ms: 0.15, shield: [90, 140, 190, 240], shSAd: 0.6 } },
      { name: '회전 베기', d: '주변을 크게 베어 피해를 주고 느리게 합니다.', kind: 'nova', ai: 'dmg',
        cd: [8, 7.5, 7, 6.5], cost: 45, radius: 290, dmg: [60, 95, 130, 165], sAd: 0.7, slow: [0.3, 1.5] },
      { name: '심판의 낙인', d: '멀리 뛰어올라 착지 지점의 적에게 큰 피해를 주고 기절시킵니다.', kind: 'dash', ai: 'engage',
        cd: [90, 75, 60], cost: 100, range: 600, speed: 1900, landRadius: 260, dmg: [220, 340, 460], sAd: 1.2, stun: 1 }
    ]
  },
  lyra: {
    name: '리라', title: '별빛 궁수', role: '원거리 딜러', cls: 'carry', color: '#7fd4ff', melee: false,
    tip: '먼 거리에서 꾸준히 화살을 쏘는 후반형 딜러. 몸이 약합니다.',
    base: { hp: 540, mp: 300, ad: 56, armor: 22, as: 0.8, ms: 335, range: 560, hpr: 5, mpr: 7 },
    grow: { hp: 82, mp: 36, ad: 3.8, armor: 3, as: 0.035, ap: 0 },
    order: [0, 1, 2],
    skills: [
      { name: '관통 화살', d: '일직선의 모든 적을 꿰뚫는 화살을 쏩니다.', kind: 'shot', ai: 'dmg',
        cd: [8, 7, 6, 5], cost: 50, range: 1050, speed: 1900, width: 70, pierce: true, dmg: [60, 100, 140, 180], sAd: 0.9 },
      { name: '속사', d: '5초 동안 공격 속도가 크게 오릅니다.', kind: 'self', ai: 'buff',
        cd: 14, cost: 45, buff: { dur: 5, as: [0.35, 0.5, 0.65, 0.8] } },
      { name: '바람걸음', d: '짧게 미끄러지듯 이동하고 잠시 빨라집니다.', kind: 'dash', ai: 'gap',
        cd: [14, 12, 10, 8], cost: 40, range: 380, speed: 1600, buff: { dur: 2, ms: 0.25 } },
      { name: '유성 화살', d: '아주 멀리 날아가는 화살. 처음 맞은 영웅 주변에 폭발하며 기절시킵니다.', kind: 'shot', ai: 'dmg',
        cd: [100, 85, 70], cost: 100, range: 2600, speed: 2200, width: 110, heroOnly: true, aoe: 260,
        dmg: [250, 375, 500], sAd: 1.0, stun: 1.5 }
    ]
  },
  morgen: {
    name: '모르겐', title: '서리 마법사', role: '마법사', cls: 'mage', color: '#9fb8ff', melee: false,
    tip: '적을 얼려 붙잡는 광역 제어 마법사.',
    base: { hp: 520, mp: 420, ad: 50, armor: 20, as: 0.65, ms: 330, range: 540, hpr: 5, mpr: 9 },
    grow: { hp: 80, mp: 48, ad: 3, armor: 3, as: 0.015, ap: 4 },
    order: [0, 1, 2],
    skills: [
      { name: '서리 창', d: '처음 맞은 적에게 피해를 주고 느리게 하는 창을 던집니다.', kind: 'shot', ai: 'dmg',
        cd: [6, 5.5, 5, 4.5], cost: 55, range: 950, speed: 1500, width: 80, dmg: [80, 125, 170, 215], sAp: 0.75, slow: [0.35, 2] },
      { name: '빙결 지대', d: '잠시 뒤 지면이 얼어붙어 범위 안의 적을 속박합니다.', kind: 'area', ai: 'dmg',
        cd: [13, 12, 11, 10], cost: 70, range: 850, radius: 220, delay: 0.7, dmg: [70, 110, 150, 190], sAp: 0.6, root: 1.4 },
      { name: '서리 방벽', d: '얼음 보호막을 두릅니다.', kind: 'self', ai: 'shield',
        cd: 16, cost: 60, buff: { dur: 4, shield: [80, 130, 180, 230], shSAp: 0.5 } },
      { name: '눈보라', d: '넓은 지역에 4초 동안 눈보라를 일으켜 계속 피해를 주고 느리게 합니다.', kind: 'area', ai: 'dmg',
        cd: [110, 95, 80], cost: 100, range: 900, radius: 420, delay: 0.3, dur: 4, dmg: [45, 70, 95], sAp: 0.18, slow: [0.4, 0.8] }
    ]
  },
  brom: {
    name: '브롬', title: '바위 수호자', role: '탱커', cls: 'tank', color: '#b9a27a', melee: true,
    tip: '맨 앞에서 버티며 적 여럿을 기절시키는 수호자.',
    base: { hp: 720, mp: 290, ad: 58, armor: 38, as: 0.65, ms: 335, range: 160, hpr: 9, mpr: 6 },
    grow: { hp: 108, mp: 34, ad: 3.4, armor: 4.4, as: 0.018, ap: 0 },
    order: [0, 2, 1],
    skills: [
      { name: '대지 강타', d: '땅을 내리쳐 일직선으로 충격파를 보내 짧게 기절시킵니다.', kind: 'shot', ai: 'dmg',
        cd: [9, 8.5, 8, 7.5], cost: 50, range: 650, speed: 1400, width: 130, pierce: true, dmg: [65, 105, 145, 185], sAd: 0.6, stun: 0.6 },
      { name: '돌 피부', d: '보호막을 얻고 방어력이 오릅니다.', kind: 'self', ai: 'shield',
        cd: 15, cost: 50, buff: { dur: 4, shield: [120, 180, 240, 300], armor: [20, 30, 40, 50] } },
      { name: '돌격', d: '앞으로 돌진해 부딪힌 적을 기절시킵니다.', kind: 'dash', ai: 'engage',
        cd: [13, 12, 11, 10], cost: 55, range: 520, speed: 1500, hitRadius: 120, dmg: [60, 95, 130, 165], sAd: 0.5, stun: 0.75 },
      { name: '대지진', d: '주변 넓은 범위의 적 모두에게 피해를 주고 기절시킵니다.', kind: 'nova', ai: 'dmg',
        cd: [110, 95, 80], cost: 100, radius: 480, dmg: [180, 280, 380], sAd: 0.8, stun: [1.25, 1.5, 1.75] }
    ]
  },
  sera: {
    name: '세라', title: '새벽 사제', role: '지원가', cls: 'support', color: '#ffe08a', melee: false,
    tip: '아군을 치유하고 빠르게 만드는 지원가.',
    base: { hp: 530, mp: 400, ad: 48, armor: 22, as: 0.65, ms: 335, range: 540, hpr: 5, mpr: 9 },
    grow: { hp: 80, mp: 46, ad: 2.8, armor: 3, as: 0.015, ap: 4 },
    order: [1, 0, 2],
    skills: [
      { name: '빛의 창', d: '처음 맞은 적에게 피해를 주고 느리게 합니다.', kind: 'shot', ai: 'dmg',
        cd: [7, 6.5, 6, 5.5], cost: 50, range: 950, speed: 1600, width: 80, dmg: [70, 110, 150, 190], sAp: 0.65, slow: [0.25, 1.5] },
      { name: '치유의 빛', d: '지정한 곳 주변의 아군을 치유합니다.', kind: 'area', ai: 'heal',
        cd: [11, 10, 9, 8], cost: 70, range: 800, radius: 300, delay: 0, heal: [80, 125, 170, 215], hSAp: 0.5 },
      { name: '여명의 축복', d: '자신과 주변 아군의 이동·공격 속도를 올립니다.', kind: 'self', ai: 'haste',
        cd: 15, cost: 50, allyR: 500, buff: { dur: 3, ms: 0.3, as: [0.2, 0.25, 0.3, 0.35] } },
      { name: '성역', d: '5초 동안 범위 안의 아군을 계속 치유하고 적에게 피해를 줍니다.', kind: 'area', ai: 'sanct',
        cd: [120, 105, 90], cost: 100, range: 700, radius: 450, delay: 0.2, dur: 5, heal: [30, 45, 60], hSAp: 0.12,
        dmg: [20, 32, 45], sAp: 0.08 }
    ]
  },
  nyx: {
    name: '닉스', title: '그림자 암살자', role: '암살자', cls: 'assassin', color: '#c58bff', melee: true,
    tip: '은신해 접근한 뒤 약한 적을 순식간에 처치합니다.',
    base: { hp: 560, mp: 290, ad: 64, armor: 26, as: 0.78, ms: 350, range: 150, hpr: 6, mpr: 7 },
    grow: { hp: 86, mp: 34, ad: 4.4, armor: 3.2, as: 0.028, ap: 0 },
    order: [0, 2, 1],
    skills: [
      { name: '그림자 표창', d: '처음 맞은 적에게 피해를 주고 느리게 하는 표창을 던집니다.', kind: 'shot', ai: 'dmg',
        cd: [7, 6.5, 6, 5.5], cost: 40, range: 800, speed: 1800, width: 70, dmg: [75, 115, 155, 195], sAd: 0.9, slow: [0.25, 1] },
      { name: '장막', d: '3.5초 동안 은신하고 빨라집니다. 다음 기본 공격이 추가 피해를 줍니다.', kind: 'self', ai: 'stealth',
        cd: [18, 16, 14, 12], cost: 50, buff: { dur: 3.5, ms: 0.25, stealth: true }, empower: [40, 70, 100, 130], empSAd: 0.5 },
      { name: '그림자 걸음', d: '지정한 곳으로 순간이동합니다. 벽을 넘을 수 있습니다.', kind: 'blink', ai: 'gap',
        cd: [12, 11, 10, 9], cost: 40, range: 450 },
      { name: '처형', d: '돌진해 착지 지점의 적에게 큰 피해를 줍니다. 체력이 40% 아래인 적에게 30% 더 강합니다.', kind: 'dash', ai: 'engage',
        cd: [80, 70, 60], cost: 100, range: 550, speed: 2000, landRadius: 220, dmg: [240, 370, 500], sAd: 1.4, exec: 0.3 }
    ]
  },
  ignis: {
    name: '이그니스', title: '화염 포격수', role: '마법사', cls: 'mage', color: '#ff8a4c', melee: false,
    tip: '아주 먼 거리에서 폭발로 여럿을 태우는 포격형 마법사.',
    base: { hp: 500, mp: 440, ad: 50, armor: 19, as: 0.62, ms: 325, range: 600, hpr: 5, mpr: 9 },
    grow: { hp: 78, mp: 50, ad: 3, armor: 2.8, as: 0.015, ap: 4 },
    order: [0, 1, 2],
    skills: [
      { name: '화염구', d: '처음 맞은 적이나 끝 지점에서 폭발하는 화염구를 쏩니다.', kind: 'shot', ai: 'dmg',
        cd: [6.5, 6, 5.5, 5], cost: 60, range: 1000, speed: 1400, width: 80, aoe: 200, endBurst: true,
        dmg: [85, 130, 175, 220], sAp: 0.8 },
      { name: '화염 지뢰', d: '잠시 뒤 터지는 지뢰를 놓아 피해를 주고 느리게 합니다.', kind: 'area', ai: 'dmg',
        cd: [11, 10, 9, 8], cost: 70, range: 800, radius: 240, delay: 0.9, dmg: [90, 140, 190, 240], sAp: 0.7, slow: [0.4, 1.5] },
      { name: '분사 추진', d: '지정한 방향으로 빠르게 이동합니다.', kind: 'dash', ai: 'gap',
        cd: [18, 16, 14, 12], cost: 45, range: 400, speed: 1500 },
      { name: '집중 포격', d: '먼 곳에 포탄 세 발을 차례로 떨어뜨립니다.', kind: 'area', ai: 'dmg',
        cd: [100, 90, 80], cost: 100, range: 1600, radius: 300, delay: 0.8, count: 3, dmg: [140, 210, 280], sAp: 0.55 }
    ]
  },
  garr: {
    name: '가르', title: '야수 사냥꾼', role: '전사', cls: 'fighter', color: '#8fcf6a', melee: true,
    tip: '공격할수록 체력을 되찾는 끈질긴 사냥꾼. 정글에 강합니다.',
    base: { hp: 650, mp: 270, ad: 64, armor: 30, as: 0.72, ms: 345, range: 160, hpr: 8, mpr: 6 },
    grow: { hp: 98, mp: 32, ad: 4.2, armor: 3.6, as: 0.026, ap: 0 },
    order: [1, 0, 2],
    skills: [
      { name: '도끼 투척', d: '처음 맞은 적에게 피해를 주고 크게 느리게 합니다.', kind: 'shot', ai: 'dmg',
        cd: [8, 7.5, 7, 6.5], cost: 45, range: 750, speed: 1500, width: 90, dmg: [70, 110, 150, 190], sAd: 0.8, slow: [0.4, 1.5] },
      { name: '광란', d: '5초 동안 공격 속도가 오르고 기본 공격으로 체력을 흡수합니다.', kind: 'self', ai: 'buff',
        cd: 15, cost: 40, buff: { dur: 5, as: [0.3, 0.4, 0.5, 0.6], ls: [0.15, 0.2, 0.25, 0.3] } },
      { name: '도약', d: '뛰어올라 착지 지점의 적에게 피해를 주고 느리게 합니다.', kind: 'dash', ai: 'engage',
        cd: [12, 11, 10, 9], cost: 50, range: 480, speed: 1600, landRadius: 230, dmg: [65, 100, 135, 170], sAd: 0.7, slow: [0.3, 1] },
      { name: '야수의 포효', d: '주변의 적을 기절시키고 6초 동안 공격력이 오릅니다.', kind: 'nova', ai: 'dmg',
        cd: [100, 85, 70], cost: 100, radius: 420, dmg: [150, 230, 310], sAd: 0.6, stun: 1.2, buff: { dur: 6, ad: [30, 50, 70] } }
    ]
  }
};
var HERO_IDS = Object.keys(HEROES);

/* 역할별로 봇이 고르는 영웅 우선순위 */
var ROLE_PREF = {
  top: ['kael', 'brom', 'garr', 'nyx'],
  mid: ['morgen', 'ignis', 'nyx', 'lyra'],
  jungle: ['garr', 'nyx', 'kael', 'brom'],
  bot: ['lyra', 'ignis', 'morgen', 'kael'],
  sup: ['sera', 'brom', 'morgen', 'garr']
};

/* react: 날아오는 스킬을 보고 피하는 확률, lead: 움직이는 상대를 얼마나 앞질러 맞추는지 */
var DIFFS = [
  { name: '쉬움', think: 1.9, lead: 0, react: 0.2 },
  { name: '보통', think: 1.0, lead: 0.8, react: 0.55 },
  { name: '어려움', think: 0.8, lead: 1.0, react: 0.85 }
];

if (typeof module !== 'undefined') module.exports = {};
