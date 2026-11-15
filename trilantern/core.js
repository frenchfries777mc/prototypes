/* 삼원의 등불 (Trilantern) — 게임 규칙 전체. DOM 을 건드리지 않는다.
 * 상태 S 는 순수 JSON 이라 그대로 저장/복제할 수 있고, Node 에서 그대로 시뮬레이션할 수 있다. */
(function (root) {
'use strict';

var EL = {
  f: { name: '불', icon: '🔥' },
  i: { name: '서리', icon: '❄️' },
  s: { name: '번개', icon: '⚡' },
  n: { name: '무속성', icon: '◇' }
};
var ST = {
  burn: { icon: '🔥', name: '화상', tip: '턴 시작 시 수치만큼 피해(방어도 무시), 이후 1 감소' },
  chill: { icon: '❄️', name: '한기', tip: '주는 피해 25% 감소. 턴마다 1 감소' },
  shock: { icon: '⚡', name: '감전', tip: '받는 피해 50% 증가. 턴마다 1 감소' },
  str: { icon: '💪', name: '힘', tip: '공격 피해 +수치' }
};

/* ---------- 난수 (상태는 S.rs 하나) ---------- */
function rnd(S) {
  S.rs = (S.rs + 0x6D2B79F5) | 0;
  var t = S.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ri(S, a, b) { return a + Math.floor(rnd(S) * (b - a + 1)); }
function pick(S, arr) { return arr[Math.floor(rnd(S) * arr.length)]; }
function shuffle(S, arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rnd(S) * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function weighted(S, pairs) {
  var sum = 0, i;
  for (i = 0; i < pairs.length; i++) sum += pairs[i][1];
  var x = rnd(S) * sum;
  for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x < 0) return pairs[i][0]; }
  return pairs[pairs.length - 1][0];
}

/* ---------- 전투 기본 동작 ---------- */
function fx(S, o) { S.fx.push(o); }
function has(S, id) { return S.relics.indexOf(id) >= 0; }
function alive(S) { return S.combat.en.filter(function (e) { return e.hp > 0; }); }
function eid(S, e) { return 'e' + S.combat.en.indexOf(e); }

function calc(base, aSt, dSt, chillMul) {
  var d = base + (aSt.str || 0);
  if (aSt.chill > 0) d *= chillMul || 0.75;
  if (dSt && dSt.shock > 0) d *= 1.5;
  return Math.max(0, Math.floor(d));
}
function damageEnemy(S, e, d) {
  var blocked = Math.min(e.block, d);
  e.block -= blocked; e.hp -= d - blocked;
  S.stats.dmg += d - blocked;
  fx(S, { t: 'hit', who: eid(S, e), n: d - blocked, blocked: blocked });
  if (e.hp <= 0) { e.hp = 0; e.block = 0; fx(S, { t: 'die', who: eid(S, e) }); }
}
function hit(S, e, base) {
  if (!e || e.hp <= 0) return;
  damageEnemy(S, e, calc(base, S.combat.st, e.st));
}
function hitAll(S, base) { alive(S).forEach(function (e) { hit(S, e, base); }); }
function hitRand(S, base) { var a = alive(S); if (a.length) hit(S, pick(S, a), base); }
function block(S, n) {
  if (n <= 0) return;
  S.combat.block += n; fx(S, { t: 'block', who: 'p', n: n });
}
function apply(S, e, st, n) {
  if (!e || e.hp <= 0 || n <= 0) return;
  if (st === 'burn' && has(S, 'ashheart')) n += 1;
  e.st[st] = (e.st[st] || 0) + n;
  fx(S, { t: 'st', who: eid(S, e), st: st, n: n });
}
function applyAll(S, st, n) { alive(S).forEach(function (e) { apply(S, e, st, n); }); }
function applyP(S, st, n) {
  var C = S.combat; C.st[st] = (C.st[st] || 0) + n;
  fx(S, { t: 'st', who: 'p', st: st, n: n });
}
function draw(S, n) {
  var C = S.combat;
  for (var k = 0; k < n; k++) {
    if (!C.draw.length) {
      if (!C.disc.length) return;
      C.draw = shuffle(S, C.disc); C.disc = [];
      fx(S, { t: 'sfx', s: 'shuffle' });
    }
    var c = C.draw.pop();
    if (C.hand.length >= 10) C.disc.push(c); else C.hand.push(c);
  }
}
function heal(S, n) {
  var b = S.hp; S.hp = Math.min(S.maxHp, S.hp + n);
  if (S.hp > b) fx(S, { t: 'heal', who: 'p', n: S.hp - b });
}
function loseHp(S, n) {
  S.hp -= n; S.stats.taken += n;
  fx(S, { t: 'hit', who: 'p', n: n, blocked: 0 });
}
function dec(st, k) { if (st[k] > 0) st[k]--; }

/* ---------- 카드 ----------
 * el 원소, t 종류(atk/skl/pow), c 비용, r 희귀도(-1 기본, 0 일반, 1 고급, 2 희귀, -2 상태),
 * tg 대상 지정 필요, ex 소멸, v 기본 수치, u 강화 시 덮어쓰는 수치(c 는 비용).
 * v.d 는 피해, v.rd 는 공명 1 당 피해 증가, v.b 는 방어도, v.rb 는 공명 1 당 방어도 증가.
 * fx(S, v, 대상, x) 에서 x.d / x.b 는 공명을 반영한 값, x.r 공명 수, x.shift 전환 여부. */
var CARDS = {
  /* 불 */
  ember: { n: '불씨', a: '🕯️', el: 'f', t: 'atk', c: 1, r: -1, tg: 1, v: { d: 6 }, u: { d: 9 }, tx: '피해 {d}.',
    fx: function (S, v, t, x) { hit(S, t, x.d); } },
  fireball: { n: '화염구', a: '☄️', el: 'f', t: 'atk', c: 2, r: 0, tg: 1, v: { d: 12, n: 3 }, u: { d: 16, n: 4 }, tx: '피해 {d}. 화상 {n}.',
    fx: function (S, v, t, x) { hit(S, t, x.d); apply(S, t, 'burn', v.n); } },
  blaze: { n: '불길', a: '🔥', el: 'f', t: 'atk', c: 1, r: 0, tg: 1, v: { d: 5, rd: 4 }, u: { d: 7, rd: 5 }, tx: '피해 {d}. 공명마다 피해 +{rd}.',
    fx: function (S, v, t, x) { hit(S, t, x.d); } },
  wildfire: { n: '들불', a: '🌾', el: 'f', t: 'skl', c: 1, r: 0, v: { n: 3 }, u: { n: 5 }, tx: '모든 적에게 화상 {n}.',
    fx: function (S, v) { applyAll(S, 'burn', v.n); } },
  combust: { n: '연소', a: '💥', el: 'f', t: 'atk', c: 1, r: 1, tg: 1, v: { d: 4 }, u: { d: 8 }, tx: '피해 {d}. 대상의 화상만큼 추가 피해.',
    fx: function (S, v, t, x) { hit(S, t, x.d + (t.st.burn || 0)); } },
  firestorm: { n: '화염 폭풍', a: '🌪️', el: 'f', t: 'atk', c: 2, r: 1, v: { d: 8, rd: 3 }, u: { d: 11, rd: 4 }, tx: '모든 적에게 피해 {d}. 공명마다 피해 +{rd}.',
    fx: function (S, v, t, x) { hitAll(S, x.d); } },
  kindling: { n: '불쏘시개', a: '🪵', el: 'f', t: 'skl', c: 0, r: 0, tg: 1, v: { n: 2, k: 1 }, u: { n: 4, k: 1 }, tx: '화상 {n}. 카드 {k}장 뽑기.',
    fx: function (S, v, t) { apply(S, t, 'burn', v.n); draw(S, v.k); } },
  furnace: { n: '용광로', a: '🏭', el: 'f', t: 'pow', c: 2, r: 2, v: { n: 2 }, u: { n: 3 }, tx: '매 턴 시작 시 모든 적에게 화상 {n}.',
    fx: function (S, v) { addPow(S, 'furnace', v.n); } },
  flurry: { n: '불꽃 검무', a: '🗡️', el: 'f', t: 'atk', c: 1, r: 0, tg: 1, v: { d: 3, k: 3 }, u: { d: 4, k: 3 }, tx: '피해 {d}를 {k}번.',
    fx: function (S, v, t, x) { for (var k = 0; k < v.k; k++) hit(S, t, x.d); } },
  detonate: { n: '폭발', a: '🧨', el: 'f', t: 'skl', c: 1, r: 2, tg: 1, ex: 1, v: {}, u: { c: 0 }, tx: '대상의 화상을 2배로. 소멸.',
    fx: function (S, v, t) { var b = t.st.burn || 0; if (b) { t.st.burn = b * 2; fx(S, { t: 'st', who: eid(S, t), st: 'burn', n: b }); } } },
  feather: { n: '불사조의 깃', a: '🪶', el: 'f', t: 'skl', c: 1, r: 1, ex: 1, v: { n: 5 }, u: { n: 8 }, tx: 'HP {n} 회복. 소멸.',
    fx: function (S, v) { heal(S, v.n); } },
  fury: { n: '분노의 불꽃', a: '😤', el: 'f', t: 'pow', c: 1, r: 1, v: { n: 2 }, u: { n: 3 }, tx: '힘 {n}을 얻는다.',
    fx: function (S, v) { applyP(S, 'str', v.n); } },
  cinder: { n: '불똥', a: '✨', el: 'f', t: 'atk', c: 0, r: 0, tg: 1, v: { d: 3, n: 3 }, u: { d: 5, n: 4 }, tx: '피해 {d}. 전환: 화상 {n}.',
    fx: function (S, v, t, x) { hit(S, t, x.d); if (x.shift) apply(S, t, 'burn', v.n); } },
  /* 서리 */
  guard: { n: '서리 방패', a: '🛡️', el: 'i', t: 'skl', c: 1, r: -1, v: { b: 5 }, u: { b: 8 }, tx: '방어도 {b}.',
    fx: function (S, v, t, x) { block(S, x.b); } },
  lance: { n: '얼음 창', a: '🔱', el: 'i', t: 'atk', c: 1, r: 0, tg: 1, v: { d: 7, n: 1 }, u: { d: 10, n: 2 }, tx: '피해 {d}. 한기 {n}.',
    fx: function (S, v, t, x) { hit(S, t, x.d); apply(S, t, 'chill', v.n); } },
  wall: { n: '빙벽', a: '🧱', el: 'i', t: 'skl', c: 2, r: 0, v: { b: 12, rb: 4 }, u: { b: 16, rb: 5 }, tx: '방어도 {b}. 공명마다 방어도 +{rb}.',
    fx: function (S, v, t, x) { block(S, x.b); } },
  blizzard: { n: '눈보라', a: '🌨️', el: 'i', t: 'atk', c: 2, r: 1, v: { d: 6, n: 2 }, u: { d: 9, n: 2 }, tx: '모든 적에게 피해 {d}. 한기 {n}.',
    fx: function (S, v, t, x) { hitAll(S, x.d); applyAll(S, 'chill', v.n); } },
  rime: { n: '서릿발', a: '🌬️', el: 'i', t: 'skl', c: 1, r: 0, v: { b: 6, rb: 3 }, u: { b: 8, rb: 4 }, tx: '방어도 {b}. 공명마다 방어도 +{rb}.',
    fx: function (S, v, t, x) { block(S, x.b); } },
  freeze: { n: '동결', a: '🥶', el: 'i', t: 'skl', c: 1, r: 0, tg: 1, v: { n: 3, b: 3 }, u: { n: 4, b: 5 }, tx: '한기 {n}. 방어도 {b}.',
    fx: function (S, v, t, x) { apply(S, t, 'chill', v.n); block(S, x.b); } },
  armor: { n: '얼음 갑옷', a: '🥋', el: 'i', t: 'pow', c: 1, r: 1, v: { n: 3 }, u: { n: 5 }, tx: '매 턴 종료 시 방어도 {n}.',
    fx: function (S, v) { addPow(S, 'armor', v.n); } },
  shatter: { n: '쇄빙', a: '🔨', el: 'i', t: 'atk', c: 1, r: 1, tg: 1, v: { m: 0 }, u: { m: 5 }, tx: '내 방어도 +{m}만큼 피해.',
    fx: function (S, v, t) { hit(S, t, S.combat.block + v.m); } },
  composure: { n: '냉정', a: '🧘', el: 'i', t: 'skl', c: 1, r: 0, v: { b: 5, k: 1 }, u: { b: 6, k: 2 }, tx: '방어도 {b}. 카드 {k}장 뽑기.',
    fx: function (S, v, t, x) { block(S, x.b); draw(S, v.k); } },
  permafrost: { n: '영구 동토', a: '🏔️', el: 'i', t: 'pow', c: 2, r: 2, v: {}, u: { c: 1 }, tx: '턴이 시작될 때 방어도가 절반만 사라진다.',
    fx: function (S) { addPow(S, 'perma', 1); } },
  avalanche: { n: '눈사태', a: '⛰️', el: 'i', t: 'atk', c: 3, r: 2, tg: 1, v: { d: 24, n: 2 }, u: { d: 32, n: 3 }, tx: '피해 {d}. 한기 {n}.',
    fx: function (S, v, t, x) { hit(S, t, x.d); apply(S, t, 'chill', v.n); } },
  bloom: { n: '서리꽃', a: '🌸', el: 'i', t: 'skl', c: 0, r: 0, v: { b: 3, n: 4 }, u: { b: 4, n: 6 }, tx: '방어도 {b}. 전환: 방어도 +{n}.',
    fx: function (S, v, t, x) { block(S, x.b + (x.shift ? v.n : 0)); } },
  /* 번개 */
  spark: { n: '스파크', a: '💫', el: 's', t: 'atk', c: 1, r: -1, tg: 1, v: { d: 4, k: 1 }, u: { d: 7, k: 1 }, tx: '피해 {d}. 카드 {k}장 뽑기.',
    fx: function (S, v, t, x) { hit(S, t, x.d); draw(S, v.k); } },
  chain: { n: '연쇄 번개', a: '⛓️', el: 's', t: 'atk', c: 1, r: 1, v: { d: 4, k: 2 }, u: { d: 5, k: 3 }, tx: '무작위 적에게 피해 {d}를 {k}번. 공명마다 1번 더.',
    fx: function (S, v, t, x) { for (var k = 0; k < v.k + x.r; k++) hitRand(S, x.d); } },
  jolt: { n: '전격', a: '⚡', el: 's', t: 'atk', c: 1, r: 0, tg: 1, v: { d: 8, n: 1 }, u: { d: 10, n: 2 }, tx: '피해 {d}. 감전 {n}.',
    fx: function (S, v, t, x) { hit(S, t, x.d); apply(S, t, 'shock', v.n); } },
  static: { n: '정전기', a: '🧲', el: 's', t: 'skl', c: 0, r: 0, v: { k: 1 }, u: { k: 2 }, tx: '카드 {k}장 뽑기. 공명마다 1장 더.',
    fx: function (S, v, t, x) { draw(S, v.k + x.r); } },
  capacitor: { n: '축전', a: '🔋', el: 's', t: 'skl', c: 1, r: 1, v: { n: 2 }, u: { n: 3 }, tx: '다음 턴에 에너지 {n}.',
    fx: function (S, v) { S.combat.nextE += v.n; } },
  overload: { n: '과부하', a: '🔌', el: 's', t: 'skl', c: 1, r: 1, ex: 1, v: { n: 2 }, u: { n: 3 }, tx: '에너지 {n}. 소멸.',
    fx: function (S, v) { S.combat.energy += v.n; } },
  storm: { n: '뇌우', a: '⛈️', el: 's', t: 'atk', c: 2, r: 1, v: { d: 7, n: 1 }, u: { d: 10, n: 2 }, tx: '모든 적에게 피해 {d}. 감전 {n}.',
    fx: function (S, v, t, x) { hitAll(S, x.d); applyAll(S, 'shock', v.n); } },
  rod: { n: '피뢰침', a: '📡', el: 's', t: 'pow', c: 1, r: 2, v: { n: 4 }, u: { n: 6 }, tx: '전환할 때마다 무작위 적에게 피해 {n}.',
    fx: function (S, v) { addPow(S, 'rod', v.n); } },
  discharge: { n: '방전', a: '🎇', el: 's', t: 'atk', c: 1, r: 1, tg: 1, v: { m: 3 }, u: { m: 4 }, tx: '이번 턴에 사용한 카드 1장당 피해 {m}. (이 카드 포함)',
    fx: function (S, v, t) { hit(S, t, v.m * S.combat.played); } },
  flash: { n: '섬광', a: '🌟', el: 's', t: 'atk', c: 0, r: 0, tg: 1, v: { d: 4, k: 1 }, u: { d: 6, k: 1 }, tx: '피해 {d}. 전환: 카드 {k}장 뽑기.',
    fx: function (S, v, t, x) { hit(S, t, x.d); if (x.shift) draw(S, v.k); } },
  conduct: { n: '전도', a: '🌩️', el: 's', t: 'skl', c: 1, r: 0, v: { n: 2 }, u: { n: 3 }, tx: '모든 적에게 감전 {n}.',
    fx: function (S, v) { applyAll(S, 'shock', v.n); } },
  surge: { n: '번개 질주', a: '🏃', el: 's', t: 'pow', c: 1, r: 2, v: {}, u: { c: 0 }, tx: '매 턴 카드를 1장 더 뽑는다.',
    fx: function (S) { addPow(S, 'surge', 1); } },
  /* 무속성: 공명을 끊지도 잇지도 않는다 */
  prism: { n: '프리즘', a: '🔮', el: 'n', t: 'skl', c: 1, r: 0, v: { b: 6, k: 1 }, u: { b: 9, k: 1 }, tx: '방어도 {b}. 카드 {k}장 뽑기.',
    fx: function (S, v, t, x) { block(S, x.b); draw(S, v.k); } },
  amplify: { n: '증폭', a: '📣', el: 'n', t: 'skl', c: 0, r: 1, ex: 1, v: { n: 2 }, u: { n: 3 }, tx: '현재 공명 +{n}. 소멸.',
    fx: function (S, v) { var ch = S.combat.chain; if (ch.el) ch.n += v.n; } },
  fusion: { n: '원소 융합', a: '🌈', el: 'n', t: 'atk', c: 2, r: 2, tg: 1, v: { d: 10, n: 2 }, u: { d: 14, n: 3 }, tx: '피해 {d}. 화상 {n}, 한기 1, 감전 1.',
    fx: function (S, v, t, x) { hit(S, t, x.d); apply(S, t, 'burn', v.n); apply(S, t, 'chill', 1); apply(S, t, 'shock', 1); } },
  soot: { n: '그을음', a: '🌫️', el: 'n', t: 'skl', c: 1, r: -2, ex: 1, v: {}, tx: '아무 효과 없음. 소멸.',
    fx: function () {} }
};
var TYPE_NAME = { atk: '공격', skl: '기술', pow: '지속' };
function addPow(S, k, n) { var p = S.combat.pow; p[k] = (p[k] || 0) + n; }
function vals(card) {
  var d = CARDS[card.id];
  if (card.up && d.u) { var o = {}, k; for (k in d.v) o[k] = d.v[k]; for (k in d.u) o[k] = d.u[k]; return o; }
  return d.v;
}
function costOf(card) { var v = vals(card); return v.c !== undefined ? v.c : CARDS[card.id].c; }
function cardName(card) { return CARDS[card.id].n + (card.up ? '+' : ''); }
/* 지금 이 카드를 내면 받게 될 공명 수와 전환 여부 */
function prospect(S, card) {
  var C = S && S.combat, el = CARDS[card.id].el;
  if (!C || el === 'n') return { r: 0, shift: false };
  if (C.chain.el === el) return { r: C.chain.n, shift: false };
  return { r: 0, shift: !!C.chain.el };
}
function cardText(card, S) {
  var d = CARDS[card.id], v = vals(card), C = S && S.combat, r = prospect(S, card).r;
  function num(val, base) {
    return '<span class="' + (val > base ? 'up' : val < base ? 'down' : '') + '">' + val + '</span>';
  }
  return d.tx.replace(/\{(\w+)\}/g, function (m, k) {
    if (k === 'd') { var b = v.d + r * (v.rd || 0); return num(C ? calc(b, C.st, null) : b, v.d); }
    if (k === 'b') return num(v.b + r * (v.rb || 0), v.b);
    return v[k];
  }).replace(/(공명|전환|소멸|화상|한기|감전|힘)/g, '<b>$1</b>');
}

/* ---------- 유물 ---------- */
var RELICS = {
  lamp: { n: '낡은 등불', i: '🏮', x: '전투에서 이기면 HP 5 회복.', k: 's' },
  flint: { n: '부싯돌', i: '🪨', x: '전투 시작 시 모든 적에게 화상 3.', k: 'c' },
  ice: { n: '얼음 조각', i: '🧊', x: '전투 시작 시 방어도 8.', k: 'c' },
  coil: { n: '구리 코일', i: '🌀', x: '전투 첫 턴에 카드를 2장 더 뽑는다.', k: 'c' },
  fork: { n: '소리굽쇠', i: '🎼', x: '한 턴에 같은 원소를 3장 이으면 에너지 1. (턴마다 1번)', k: 'c' },
  lens: { n: '프리즘 렌즈', i: '🔍', x: '턴마다 첫 전환 시 카드 1장 뽑기.', k: 'c' },
  whet: { n: '숫돌', i: '🔪', x: '힘 1을 가지고 전투를 시작한다.', k: 'c' },
  boots: { n: '튼튼한 장화', i: '🥾', x: '최대 HP +12.', k: 'c' },
  purse: { n: '금화 주머니', i: '💰', x: '전투에서 이길 때마다 골드 +12.', k: 'c' },
  ashheart: { n: '재의 심장', i: '🖤', x: '적에게 화상을 줄 때마다 1 더 준다.', k: 'c' },
  crystal: { n: '서리 수정', i: '💠', x: '한기에 걸린 적의 피해 감소가 25%에서 40%로.', k: 'c' },
  battery: { n: '축전지', i: '🔋', x: '턴 종료 시 남은 에너지 1당 방어도 4.', k: 'c' },
  gears: { n: '쌍둥이 톱니', i: '⚙️', x: '매 턴 4번째로 낸 카드 뒤에 모든 적에게 피해 6.', k: 'c' },
  thorn: { n: '가시 갑옷', i: '🌵', x: '공격을 맞을 때마다 공격한 적에게 피해 3.', k: 'c' },
  herb: { n: '약초 주머니', i: '🌿', x: '모닥불에서 쉴 때 HP 15 추가 회복.', k: 'c' },
  ember: { n: '마지막 불씨', i: '❤️‍🔥', x: '쓰러질 때 한 번, 최대 HP의 30%로 되살아난다.', k: 'b' },
  core: { n: '폭풍의 핵', i: '🌩️', x: '매 턴 에너지 +1. 전투 시작 시 덱에 그을음 2장.', k: 'b' },
  crown: { n: '얼음 왕관', i: '👑', x: '매 턴 에너지 +1. 모닥불에서 회복할 수 없다.', k: 'b' },
  tome: { n: '고대 서책', i: '📖', x: '매 턴 카드를 1장 더 뽑는다.', k: 'b' }
};
function gainRelic(S, id) {
  S.relics.push(id);
  if (id === 'boots') { S.maxHp += 12; S.hp += 12; }
}
function relicPool(S, kind) {
  return Object.keys(RELICS).filter(function (id) { return RELICS[id].k === kind && !has(S, id); });
}
function rollRelic(S) {
  var p = relicPool(S, 'c');
  return p.length ? pick(S, p) : null;
}

/* ---------- 적 ----------
 * 의도: a 피해, x 횟수, b 방어도, str 힘, st 플레이어에게 거는 상태, soot 그을음, heal 회복 */
var ENEMIES = {
  rat: { n: '재 쥐', i: '🐀', hp: [13, 17], rnd: 1, pat: [{ a: 5 }, { a: 5 }, { a: 3, str: 1 }] },
  golem: { n: '석탄 골렘', i: '🪨', hp: [36, 42], pat: [{ a: 6, b: 6 }, { a: 11 }, { str: 2, b: 4 }] },
  bat: { n: '동굴 박쥐', i: '🦇', hp: [19, 23], rnd: 1, pat: [{ a: 3, x: 2 }, { st: { shock: 2 } }, { a: 4, x: 2 }] },
  spore: { n: '포자 버섯', i: '🍄', hp: [25, 29], pat: [{ a: 4, st: { chill: 2 } }, { a: 8 }, { soot: 1, b: 5 }] },
  thief: { n: '도굴꾼', i: '🥷', hp: [29, 33], pat: [{ a: 9 }, { a: 6, b: 6 }, { a: 12 }] },
  turtle: { n: '용암 거북', i: '🐢', hp: [68, 72], pat: [{ b: 12, str: 1 }, { a: 14 }, { a: 7, x: 2 }] },
  wraith: { n: '쌍둥이 망령', i: '👻', hp: [32, 36], rnd: 1, pat: [{ a: 7, st: { chill: 1 } }, { st: { shock: 2 } }, { a: 10 }] },
  queen: { n: '등불 삼키미', i: '🕷️', hp: [115, 115], pat: [{ soot: 1, b: 8 }, { a: 7, x: 2 }, { a: 15 }, { str: 1, b: 8 }] },

  sprite: { n: '얼음 정령', i: '🧊', hp: [44, 50], pat: [{ a: 10, st: { chill: 1 } }, { a: 7, b: 10 }, { a: 14 }] },
  wolf: { n: '서리 늑대', i: '🐺', hp: [38, 42], rnd: 1, pat: [{ a: 5, x: 2 }, { str: 1, b: 5 }, { a: 6, x: 2 }] },
  owl: { n: '눈 올빼미', i: '🦉', hp: [34, 38], pat: [{ st: { shock: 2 } }, { a: 12 }, { a: 5, x: 3 }] },
  troll: { n: '동굴 트롤', i: '🧌', hp: [70, 78], pat: [{ a: 16 }, { b: 12, str: 2 }, { a: 20 }] },
  spider: { n: '얼음 거미', i: '🕸️', hp: [38, 42], pat: [{ soot: 2 }, { a: 11 }, { a: 8, st: { chill: 2 } }] },
  sentinel: { n: '수정 파수꾼', i: '💎', hp: [118, 124], pat: [{ b: 15 }, { a: 22 }, { a: 10, x: 2, st: { shock: 2 } }, { str: 3 }] },
  shaman: { n: '설인 주술사', i: '🧙', hp: [96, 102], pat: [{ st: { chill: 3 }, soot: 1 }, { a: 15 }, { heal: 10, b: 10 }, { a: 9, x: 2 }] },
  lord: { n: '서리 군주', i: '🥶', hp: [175, 175], pat: [{ b: 12, st: { chill: 2 } }, { a: 10, x: 2 }, { a: 22 }, { str: 2, soot: 2 }] },

  serpent: { n: '번개 뱀', i: '🐍', hp: [58, 64], pat: [{ a: 6, x: 2, st: { shock: 2 } }, { a: 15 }, { str: 2, b: 8 }] },
  hawk: { n: '폭풍 매', i: '🦅', hp: [50, 54], rnd: 1, pat: [{ a: 4, x: 3 }, { a: 7, st: { shock: 2 } }, { a: 13 }] },
  magma: { n: '용암 정령', i: '🌋', hp: [68, 74], pat: [{ a: 8, st: { burn: 4 } }, { a: 20 }, { a: 10, b: 14 }] },
  automaton: { n: '강철 자동인형', i: '🤖', hp: [92, 98], pat: [{ b: 16 }, { a: 24 }, { a: 12, x: 2 }, { str: 3 }] },
  drake: { n: '뇌룡의 새끼', i: '🐲', hp: [165, 175], pat: [{ a: 14, x: 2 }, { str: 3, b: 14 }, { a: 30 }, { st: { shock: 2 }, soot: 2 }] },
  eye: { n: '심연의 눈', i: '👁️', hp: [148, 156], pat: [{ st: { chill: 2, shock: 2 } }, { a: 9, x: 3 }, { a: 26 }, { heal: 15, str: 2 }] },
  storm: { n: '꺼지지 않는 폭풍', i: '🌪️', hp: [270, 270], enrage: { at: 0.5, str: 3 },
    pat: [{ b: 16, str: 1 }, { a: 9, x: 3 }, { a: 28 }, { soot: 2, st: { shock: 2 } }, { a: 13, x: 2, st: { chill: 2 } }] }
};
var ACTS = [
  { name: '잿빛 갱도', easy: [['rat', 'rat'], ['bat', 'rat'], ['thief']],
    fights: [['rat', 'rat', 'rat'], ['golem'], ['spore', 'rat'], ['bat', 'bat'], ['thief', 'rat'], ['spore', 'bat']],
    elites: [['turtle'], ['wraith', 'wraith']], boss: ['queen'] },
  { name: '서리 동굴', easy: [['wolf', 'wolf'], ['sprite', 'owl']],
    fights: [['sprite', 'wolf'], ['troll'], ['owl', 'spider'], ['sprite', 'spider'], ['owl', 'wolf'], ['wolf', 'wolf', 'spider']],
    elites: [['sentinel'], ['shaman']], boss: ['lord'] },
  { name: '뇌운 심연', easy: [['serpent', 'hawk'], ['automaton']],
    fights: [['magma', 'hawk'], ['serpent', 'magma'], ['hawk', 'hawk', 'serpent'], ['automaton', 'hawk'], ['magma', 'magma']],
    elites: [['drake'], ['eye']], boss: ['storm'] }
];
var STEPS = 8; // 막마다 0..7, 7 이 보스

function mkEnemy(S, key) {
  var d = ENEMIES[key];
  var hp = ri(S, d.hp[0], d.hp[1]);
  var e = { key: key, hp: hp, maxHp: hp, block: 0, st: {}, pi: d.rnd ? ri(S, 0, d.pat.length - 1) : 0 };
  e.intent = d.pat[e.pi % d.pat.length];
  return e;
}
/* 화면에 보여줄 의도 요약 */
function intentView(S, e) {
  var it = e.intent, C = S.combat, parts = [];
  if (it.a) {
    var d = calc(it.a, e.st, C.st, has(S, 'crystal') ? 0.6 : 0.75);
    parts.push({ i: '⚔️', t: d + (it.x > 1 ? '×' + it.x : ''), k: 'atk', dmg: d * (it.x || 1) });
  }
  if (it.b) parts.push({ i: '🛡️', t: '' + it.b, k: 'def' });
  if (it.str) parts.push({ i: '💪', t: '+' + it.str, k: 'buff' });
  if (it.heal) parts.push({ i: '💚', t: '+' + it.heal, k: 'buff' });
  if (it.st) Object.keys(it.st).forEach(function (k) { parts.push({ i: ST[k].icon, t: '' + it.st[k], k: 'debuff' }); });
  if (it.soot) parts.push({ i: '🌫️', t: '' + it.soot, k: 'debuff' });
  return parts;
}
function incoming(S) {
  var C = S.combat, sum = 0;
  alive(S).forEach(function (e) {
    if (e.intent.a) sum += calc(e.intent.a, e.st, C.st, has(S, 'crystal') ? 0.6 : 0.75) * (e.intent.x || 1);
  });
  return sum;
}

/* ---------- 전투 흐름 ---------- */
function startCombat(S, kind) {
  var act = ACTS[S.act], keys;
  if (kind === 'boss') keys = act.boss;
  else if (kind === 'elite') keys = pick(S, act.elites);
  else {
    var pool = S.fights < 2 ? act.easy : act.fights, tries = 0;
    do { keys = pick(S, pool); } while (keys.join() === S.lastFight && ++tries < 8);
    S.lastFight = keys.join(); S.fights++;
  }
  var C = S.combat = {
    kind: kind, en: keys.map(function (k) { return mkEnemy(S, k); }),
    draw: S.deck.map(function (c) { return { id: c.id, up: c.up, uid: c.uid }; }),
    hand: [], disc: [], exh: [], energy: 0, block: 0, st: {}, pow: {},
    chain: { el: null, n: 0 }, played: 0, turn: 0, nextE: 0, phase: 'player', ei: 0, flags: {}
  };
  if (has(S, 'core')) for (var k = 0; k < 2; k++) C.draw.push({ id: 'soot', up: 0, uid: 's' + (S.uid++) });
  shuffle(S, C.draw);
  if (has(S, 'whet')) C.st.str = 1;
  if (has(S, 'flint')) applyAll(S, 'burn', 3);
  S.phase = 'combat';
  startTurn(S);
  if (has(S, 'ice')) block(S, 8);
}
function startTurn(S) {
  var C = S.combat;
  if (C.turn > 0) C.block = C.pow.perma ? Math.floor(C.block / 2) : 0;
  C.turn++; C.phase = 'player';
  C.energy = 3 + (has(S, 'core') ? 1 : 0) + (has(S, 'crown') ? 1 : 0) + C.nextE;
  C.nextE = 0; C.chain = { el: null, n: 0 }; C.played = 0; C.flags = {};
  if (C.st.burn > 0) { loseHp(S, C.st.burn); C.st.burn--; if (checkEnd(S)) return; }
  if (C.pow.furnace) applyAll(S, 'burn', C.pow.furnace);
  draw(S, 5 + (C.pow.surge || 0) + (has(S, 'tome') ? 1 : 0) + (C.turn === 1 && has(S, 'coil') ? 2 : 0));
  fx(S, { t: 'sfx', s: 'turn' });
}
function canPlay(S, hi) {
  var C = S.combat;
  if (!C || S.phase !== 'combat' || C.phase !== 'player') return false;
  var card = C.hand[hi];
  return !!card && C.energy >= costOf(card);
}
function playCard(S, hi, ti) {
  if (!canPlay(S, hi)) return false;
  var C = S.combat, card = C.hand[hi], d = CARDS[card.id], v = vals(card), t = null;
  if (d.tg) {
    t = C.en[ti];
    if (!t || t.hp <= 0) t = alive(S)[0];
    if (!t) return false;
  }
  C.energy -= costOf(card);
  C.hand.splice(hi, 1);
  var p = prospect(S, card);
  if (d.el !== 'n') {
    if (C.chain.el === d.el) C.chain.n++; else C.chain = { el: d.el, n: 1 };
  }
  C.played++; S.stats.cards++;
  fx(S, { t: 'play', el: d.el, type: d.t });
  d.fx(S, v, t, { r: p.r, shift: p.shift, d: (v.d || 0) + p.r * (v.rd || 0), b: (v.b || 0) + p.r * (v.rb || 0) });
  if (p.shift) {
    fx(S, { t: 'shift' });
    if (C.pow.rod) hitRand(S, C.pow.rod);
    if (has(S, 'lens') && !C.flags.lens) { C.flags.lens = 1; draw(S, 1); }
  }
  if (p.r > 0) fx(S, { t: 'res', n: C.chain.n });
  if (has(S, 'fork') && C.chain.n >= 3 && !C.flags.fork) { C.flags.fork = 1; C.energy++; fx(S, { t: 'relic', id: 'fork' }); }
  if (has(S, 'gears') && C.played === 4) { fx(S, { t: 'relic', id: 'gears' }); alive(S).forEach(function (e) { damageEnemy(S, e, 6); }); }
  if (d.t === 'pow') { /* 지속 카드는 전투에서 빠진다 */ }
  else if (d.ex) C.exh.push(card);
  else C.disc.push(card);
  checkEnd(S);
  return true;
}
function endTurn(S) {
  var C = S.combat;
  if (!C || S.phase !== 'combat' || C.phase !== 'player') return false;
  if (C.pow.armor) block(S, C.pow.armor);
  if (has(S, 'battery') && C.energy > 0) block(S, 4 * C.energy);
  C.disc = C.disc.concat(C.hand); C.hand = [];
  dec(C.st, 'chill'); dec(C.st, 'shock');
  C.phase = 'enemy'; C.ei = 0;
  return true;
}
function hitPlayer(S, e, base) {
  var C = S.combat;
  var d = calc(base, e.st, C.st, has(S, 'crystal') ? 0.6 : 0.75);
  var blocked = Math.min(C.block, d);
  C.block -= blocked; S.hp -= d - blocked; S.stats.taken += d - blocked;
  fx(S, { t: 'atk', who: eid(S, e) });
  fx(S, { t: 'hit', who: 'p', n: d - blocked, blocked: blocked });
  if (has(S, 'thorn')) damageEnemy(S, e, 3);
}
/* 적 하나가 행동한다. 적 차례가 끝나면 플레이어 턴을 시작한다. 계속할 게 있으면 true */
function enemyStep(S) {
  var C = S.combat;
  if (!C || S.phase !== 'combat' || C.phase !== 'enemy') return false;
  while (C.ei < C.en.length && C.en[C.ei].hp <= 0) C.ei++;
  if (C.ei >= C.en.length) { startTurn(S); return false; }
  var e = C.en[C.ei++], def = ENEMIES[e.key], it = e.intent;
  e.block = 0;
  if (e.st.burn > 0) {
    var b = e.st.burn; e.st.burn--;
    e.hp -= b; S.stats.dmg += b;
    fx(S, { t: 'hit', who: eid(S, e), n: b, blocked: 0, burn: 1 });
    if (e.hp <= 0) { e.hp = 0; fx(S, { t: 'die', who: eid(S, e) }); return !checkEnd(S); }
  }
  if (def.enrage && !e.enr && e.hp <= e.maxHp * def.enrage.at) {
    e.enr = 1; e.st.str = (e.st.str || 0) + def.enrage.str;
    fx(S, { t: 'say', who: eid(S, e), s: '격노!' });
  }
  if (it.a) {
    for (var k = 0; k < (it.x || 1); k++) {
      hitPlayer(S, e, it.a);
      if (checkEnd(S)) return false;
      if (e.hp <= 0) break;
    }
  }
  if (e.hp > 0) {
    if (it.b) { e.block += it.b; fx(S, { t: 'block', who: eid(S, e), n: it.b }); }
    if (it.str) { e.st.str = (e.st.str || 0) + it.str; fx(S, { t: 'st', who: eid(S, e), st: 'str', n: it.str }); }
    if (it.heal) { e.hp = Math.min(e.maxHp, e.hp + it.heal); fx(S, { t: 'heal', who: eid(S, e), n: it.heal }); }
    if (it.st) Object.keys(it.st).forEach(function (k2) { applyP(S, k2, it.st[k2]); });
    if (it.soot) {
      for (var q = 0; q < it.soot; q++) C.disc.push({ id: 'soot', up: 0, uid: 's' + (S.uid++) });
      fx(S, { t: 'say', who: 'p', s: '그을음 +' + it.soot });
    }
    dec(e.st, 'chill'); dec(e.st, 'shock');
    e.pi++; e.intent = def.pat[e.pi % def.pat.length];
  }
  if (checkEnd(S)) return false;
  return true;
}
/* 화면 없이 적 차례 전체를 한 번에 돌린다 (시뮬레이션용) */
function finishTurn(S) {
  if (!endTurn(S)) return;
  while (S.phase === 'combat' && S.combat.phase === 'enemy') enemyStep(S);
}
function checkEnd(S) {
  if (S.phase !== 'combat') return true;
  if (S.hp <= 0) {
    if (has(S, 'ember') && !S.emberUsed) {
      S.emberUsed = 1; S.hp = Math.ceil(S.maxHp * 0.3);
      fx(S, { t: 'say', who: 'p', s: '마지막 불씨!' });
    } else {
      S.hp = 0; S.phase = 'over'; S.combat.phase = 'done';
      fx(S, { t: 'sfx', s: 'lose' });
      return true;
    }
  }
  if (!alive(S).length) { winCombat(S); return true; }
  return false;
}
function winCombat(S) {
  var kind = S.combat.kind;
  S.combat = null; S.stats.wins++;
  fx(S, { t: 'sfx', s: 'win' });
  if (kind === 'boss' && S.act === ACTS.length - 1) { S.phase = 'win'; return; }
  if (has(S, 'lamp')) heal(S, 5);
  var gold = kind === 'boss' ? 60 : kind === 'elite' ? ri(S, 30, 40) : ri(S, 12, 20);
  if (has(S, 'purse')) gold += 12;
  S.gold += gold;
  var R = S.reward = { kind: kind, gold: gold, relic: null, bossRelics: null, cards: null };
  if (kind === 'elite') { R.relic = rollRelic(S); if (R.relic) gainRelic(S, R.relic); }
  if (kind === 'boss') {
    var pool = shuffle(S, relicPool(S, 'b')).slice(0, 3);
    var extra = shuffle(S, relicPool(S, 'c'));
    while (pool.length < 3 && extra.length) pool.push(extra.pop());
    R.bossRelics = pool;
  }
  R.cards = rollCards(S, 3, kind === 'boss' ? [0, 30, 70] : kind === 'elite' ? [40, 42, 18] : [62, 31, 7]);
  S.phase = 'reward';
}

/* ---------- 보상 / 진행 ---------- */
var CARD_IDS = Object.keys(CARDS);
function rollCards(S, n, w) {
  var out = [], guard = 0;
  while (out.length < n && guard++ < 300) {
    var r = weighted(S, [[0, w[0]], [1, w[1]], [2, w[2]]]);
    var pool = CARD_IDS.filter(function (id) {
      return CARDS[id].r === r && !out.some(function (o) { return o.id === id; });
    });
    if (!pool.length) continue;
    out.push({ id: pick(S, pool), up: rnd(S) < [0, 0.15, 0.3][S.act] ? 1 : 0 });
  }
  return out;
}
function addCard(S, id, up) { S.deck.push({ id: id, up: up ? 1 : 0, uid: 'c' + (S.uid++) }); }
function takeBossRelic(S, i) {
  var R = S.reward;
  if (S.phase !== 'reward' || !R || !R.bossRelics || !R.bossRelics[i]) return false;
  gainRelic(S, R.bossRelics[i]); R.relic = R.bossRelics[i]; R.bossRelics = null;
  return true;
}
function takeCard(S, i) { // i < 0 이면 건너뛴다
  var R = S.reward;
  if (S.phase !== 'reward' || !R || R.bossRelics || !R.cards) return false;
  if (i >= 0) { var c = R.cards[i]; if (!c) return false; addCard(S, c.id, c.up); }
  R.cards = null;
  var boss = R.kind === 'boss';
  S.reward = null;
  if (boss) {
    S.act++; S.step = 0; S.fights = 0; S.floor++;
    heal(S, Math.floor(S.maxHp * 0.5));
    makeDoors(S); S.phase = 'map';
  } else advance(S);
  return true;
}
function advance(S) {
  S.step++; S.floor++;
  makeDoors(S); S.phase = 'map';
}
var DOORS = {
  combat: { i: '⚔️', n: '전투', x: '적을 쓰러뜨리고 카드와 골드를 얻는다.' },
  elite: { i: '💀', n: '정예', x: '강한 적. 이기면 유물을 얻는다.' },
  rest: { i: '🏕️', n: '모닥불', x: '쉬어서 회복하거나 카드를 강화한다.' },
  shop: { i: '🛒', n: '상인', x: '카드와 유물을 사고, 카드를 덱에서 뺄 수 있다.' },
  event: { i: '❓', n: '미지', x: '무슨 일이 생길지 모른다.' },
  treasure: { i: '🎁', n: '보물', x: '유물 하나를 얻는다.' },
  boss: { i: '👑', n: '보스', x: '이 막의 주인.' }
};
function makeDoors(S) {
  var st = S.step;
  if (st === 0) S.doors = ['combat'];
  else if (st === STEPS - 1) S.doors = ['boss'];
  else if (st === STEPS - 2) S.doors = ['rest', 'shop'];
  else {
    var w = [['event', 32], ['shop', 13], ['rest', 13], ['treasure', 7]];
    if (st >= 2) w.push(['elite', 26]);
    var out = ['combat'];
    while (out.length < 3) {
      var k = weighted(S, w);
      if (out.indexOf(k) < 0) out.push(k);
    }
    S.doors = out;
  }
}
function enterDoor(S, i) {
  if (S.phase !== 'map') return false;
  var k = S.doors[i];
  if (!k) return false;
  if (k === 'combat' || k === 'elite' || k === 'boss') startCombat(S, k);
  else if (k === 'rest') S.phase = 'rest';
  else if (k === 'shop') { makeShop(S); S.phase = 'shop'; }
  else if (k === 'treasure') {
    var id = rollRelic(S);
    if (id) gainRelic(S, id); else S.gold += 60;
    S.event = { id: 'treasure', res: id ? '상자 안에서 ' + RELICS[id].i + ' ' + RELICS[id].n + '을(를) 얻었다. ' + RELICS[id].x : '상자에는 금화 60닢이 들어 있었다.' };
    S.phase = 'event';
  } else {
    var ids = Object.keys(EVENTS).filter(function (e) { return e !== 'treasure' && S.seen.indexOf(e) < 0; });
    if (!ids.length) { S.seen = []; ids = Object.keys(EVENTS).filter(function (e) { return e !== 'treasure'; }); }
    var ev = pick(S, ids); S.seen.push(ev);
    S.event = { id: ev, res: null };
    S.phase = 'event';
  }
  return true;
}

/* ---------- 모닥불 ---------- */
function restHealAmount(S) { return has(S, 'crown') ? 0 : Math.floor(S.maxHp * 0.3) + (has(S, 'herb') ? 15 : 0); }
function restHeal(S) {
  if (S.phase !== 'rest' || has(S, 'crown')) return false;
  heal(S, restHealAmount(S)); advance(S); return true;
}
function upgradable(S) { return S.deck.filter(function (c) { return !c.up && CARDS[c.id].u; }); }
function restUpgrade(S) {
  if (S.phase !== 'rest' || !upgradable(S).length) return false;
  S.pick = { kind: 'upgrade', back: 'rest' }; S.phase = 'pick'; return true;
}
function restSkip(S) { if (S.phase !== 'rest') return false; advance(S); return true; }

/* ---------- 카드 고르기 (강화 / 제거) ---------- */
function pickCard(S, uid) {
  if (S.phase !== 'pick') return false;
  var P = S.pick, idx = -1;
  S.deck.forEach(function (c, i) { if (c.uid === uid) idx = i; });
  if (idx < 0) return false;
  var c = S.deck[idx];
  if (P.kind === 'upgrade') {
    if (c.up || !CARDS[c.id].u) return false;
    c.up = 1;
  } else {
    if (S.deck.length <= 5) return false;
    S.deck.splice(idx, 1);
    if (P.back === 'shop') { S.gold -= S.shop.removeCost; S.shop.removed = 1; S.removes++; }
  }
  S.pick = null;
  if (P.back === 'shop') S.phase = 'shop';
  else if (P.back === 'event') { S.event.res = (P.kind === 'upgrade' ? '카드가 한층 날카로워졌다: ' : '덱에서 사라졌다: ') + cardName(c); S.phase = 'event'; }
  else advance(S);
  return true;
}
function pickCancel(S) {
  if (S.phase !== 'pick') return false;
  var back = S.pick.back; S.pick = null; S.phase = back; return true;
}

/* ---------- 상인 ---------- */
function makeShop(S) {
  var cards = rollCards(S, 5, [50, 37, 13]).map(function (c) {
    var base = [48, 72, 120][CARDS[c.id].r] + (c.up ? 25 : 0);
    return { id: c.id, up: c.up, price: Math.round(base * (0.9 + rnd(S) * 0.2)), sold: 0 };
  });
  var rel = shuffle(S, relicPool(S, 'c')).slice(0, 2).map(function (id) {
    return { id: id, price: ri(S, 135, 165), sold: 0 };
  });
  S.shop = { cards: cards, relics: rel, removeCost: 70 + 25 * S.removes, removed: 0 };
}
function buyCard(S, i) {
  var it = S.phase === 'shop' && S.shop.cards[i];
  if (!it || it.sold || S.gold < it.price) return false;
  S.gold -= it.price; it.sold = 1; addCard(S, it.id, it.up); return true;
}
function buyRelic(S, i) {
  var it = S.phase === 'shop' && S.shop.relics[i];
  if (!it || it.sold || S.gold < it.price) return false;
  S.gold -= it.price; it.sold = 1; gainRelic(S, it.id); return true;
}
function shopRemove(S) {
  if (S.phase !== 'shop' || S.shop.removed || S.gold < S.shop.removeCost || S.deck.length <= 5) return false;
  S.pick = { kind: 'remove', back: 'shop' }; S.phase = 'pick'; return true;
}
function leaveShop(S) { if (S.phase !== 'shop') return false; S.shop = null; advance(S); return true; }

/* ---------- 사건 ---------- */
function upgradeRandom(S, n) {
  var names = [];
  for (var k = 0; k < n; k++) {
    var u = upgradable(S);
    if (!u.length) break;
    var c = pick(S, u); c.up = 1; names.push(cardName(c));
  }
  return names;
}
var EVENTS = {
  treasure: { t: '보물 상자', i: '🎁', x: '', o: function () { return []; } },
  smith: { t: '떠돌이 대장장이', i: '⚒️',
    x: '모루를 짊어진 노인이 불 앞에서 손을 녹이고 있다. "금화 몇 닢이면 자네 카드를 벼려 주지."',
    o: function (S) { return [
      { l: '40 골드를 낸다', s: '무작위 카드 2장 강화', ok: S.gold >= 40 && upgradable(S).length > 0,
        go: function (S) { S.gold -= 40; return '망치 소리가 갱도에 울렸다. 강화됨: ' + upgradeRandom(S, 2).join(', '); } },
      { l: '지나친다', s: '', ok: true, go: function () { return '노인은 어깨를 으쓱하고 다시 불을 쬐었다.'; } }
    ]; } },
  spring: { t: '김이 오르는 샘', i: '⛲',
    x: '바위틈에서 따뜻한 물이 솟는다. 물빛이 묘하게 반짝인다.',
    o: function () { return [
      { l: '물을 마신다', s: 'HP 15 회복', ok: true, go: function (S) { heal(S, 15); return '몸이 한결 가벼워졌다.'; } },
      { l: '몸을 담근다', s: '최대 HP +6', ok: true, go: function (S) { S.maxHp += 6; S.hp += 6; return '오래된 피로가 씻겨 내려갔다.'; } }
    ]; } },
  altar: { t: '재의 제단', i: '🗿',
    x: '검게 그을린 제단 위에 무언가가 놓여 있다. 손을 뻗으면 재가 살을 파고든다.',
    o: function (S) { return [
      { l: '손을 뻗는다', s: 'HP 10을 잃고 유물 획득', ok: S.hp > 10 && relicPool(S, 'c').length > 0,
        go: function (S) { S.hp -= 10; var id = rollRelic(S); gainRelic(S, id); return RELICS[id].i + ' ' + RELICS[id].n + '을(를) 얻었다. ' + RELICS[id].x; } },
      { l: '물러난다', s: '', ok: true, go: function () { return '제단은 조용히 식어 갔다.'; } }
    ]; } },
  pack: { t: '버려진 배낭', i: '🎒',
    x: '누군가 급히 두고 간 배낭이다. 한쪽 주머니만 뒤질 시간이 있다.',
    o: function () { return [
      { l: '돈주머니를 챙긴다', s: '골드 +45', ok: true, go: function (S) { S.gold += 45; return '묵직한 금화 45닢.'; } },
      { l: '두루마리를 챙긴다', s: '무작위 희귀 카드 획득', ok: true,
        go: function (S) { var c = rollCards(S, 1, [0, 0, 1])[0]; addCard(S, c.id, c.up); return '덱에 추가됨: ' + cardName(c); } }
    ]; } },
  rift: { t: '원소의 균열', i: '🌀',
    x: '허공이 갈라져 세 가지 빛이 뒤섞여 흐른다. 카드 한 장을 던져 넣으면 영영 돌아오지 않을 것 같다.',
    o: function (S) { return [
      { l: '카드를 던져 넣는다', s: '덱에서 카드 1장 제거', ok: S.deck.length > 5,
        go: function (S) { S.pick = { kind: 'remove', back: 'event' }; S.phase = 'pick'; return null; } },
      { l: '빛을 들이마신다', s: '무작위 카드 1장 강화', ok: upgradable(S).length > 0,
        go: function (S) { return '강화됨: ' + upgradeRandom(S, 1).join(', '); } },
      { l: '지나친다', s: '', ok: true, go: function () { return '균열은 등 뒤에서 조용히 닫혔다.'; } }
    ]; } },
  gambler: { t: '동굴 도박사', i: '🎲',
    x: '"동전 던지기 한 판 어때? 앞면이면 세 배로 돌려주지."',
    o: function (S) { return [
      { l: '30 골드를 건다', s: '절반 확률로 90 골드', ok: S.gold >= 30,
        go: function (S) { S.gold -= 30; if (rnd(S) < 0.5) { S.gold += 90; return '앞면! 90 골드를 받았다.'; } return '뒷면. 도박사가 금화를 챙겨 사라졌다.'; } },
      { l: '거절한다', s: '', ok: true, go: function () { return '"겁쟁이로군." 도박사가 낄낄거렸다.'; } }
    ]; } }
};
function eventChoose(S, i) {
  if (S.phase !== 'event' || S.event.res !== null) return false;
  var o = EVENTS[S.event.id].o(S)[i];
  if (!o || !o.ok) return false;
  var res = o.go(S);
  if (res !== null) S.event.res = res;
  return true;
}
function eventDone(S) {
  if (S.phase !== 'event' || S.event.res === null) return false;
  S.event = null; advance(S); return true;
}

/* ---------- 새 게임 ---------- */
var ATTUNE = [
  { el: 'f', n: '불의 인장', relic: 'flint', card: 'blaze', x: '화상으로 적을 서서히 태운다. 턴이 길어질수록 강하다.' },
  { el: 'i', n: '서리의 인장', relic: 'ice', card: 'rime', x: '두꺼운 방어도로 버티고, 한기로 적의 공격을 무디게 한다.' },
  { el: 's', n: '번개의 인장', relic: 'coil', card: 'static', x: '카드를 많이 뽑고 많이 낸다. 감전된 적은 더 아프게 맞는다.' }
];
function newRun(seed) {
  var S = {
    v: 1, rs: seed | 0, seed: seed | 0, uid: 1, phase: 'start',
    hp: 72, maxHp: 72, gold: 60, deck: [], relics: ['lamp'],
    act: 0, step: 0, floor: 1, fights: 0, lastFight: '', removes: 0, seen: [],
    doors: [], combat: null, reward: null, shop: null, event: null, pick: null,
    stats: { wins: 0, dmg: 0, taken: 0, cards: 0 }, fx: []
  };
  var k;
  for (k = 0; k < 4; k++) addCard(S, 'ember');
  for (k = 0; k < 4; k++) addCard(S, 'guard');
  for (k = 0; k < 2; k++) addCard(S, 'spark');
  return S;
}
function attune(S, i) {
  if (S.phase !== 'start' || !ATTUNE[i]) return false;
  gainRelic(S, ATTUNE[i].relic); addCard(S, ATTUNE[i].card);
  S.attune = ATTUNE[i].el;
  makeDoors(S); S.phase = 'map';
  return true;
}

var API = {
  EL: EL, ST: ST, CARDS: CARDS, RELICS: RELICS, ENEMIES: ENEMIES, ACTS: ACTS, DOORS: DOORS, EVENTS: EVENTS,
  ATTUNE: ATTUNE, TYPE_NAME: TYPE_NAME, STEPS: STEPS,
  newRun: newRun, attune: attune, enterDoor: enterDoor,
  canPlay: canPlay, playCard: playCard, endTurn: endTurn, enemyStep: enemyStep, finishTurn: finishTurn,
  takeCard: takeCard, takeBossRelic: takeBossRelic,
  restHeal: restHeal, restUpgrade: restUpgrade, restSkip: restSkip, restHealAmount: restHealAmount,
  pickCard: pickCard, pickCancel: pickCancel, upgradable: upgradable,
  buyCard: buyCard, buyRelic: buyRelic, shopRemove: shopRemove, leaveShop: leaveShop,
  eventChoose: eventChoose, eventDone: eventDone,
  vals: vals, costOf: costOf, cardName: cardName, cardText: cardText, prospect: prospect,
  intentView: intentView, incoming: incoming, alive: alive, has: has, calc: calc
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.TL = API;
})(typeof window !== 'undefined' ? window : this);
