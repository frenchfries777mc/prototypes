/* 삼원의 등불 — 화면. 규칙은 전부 core.js(TL)에 있고 여기서는 그리기와 입력만 한다. */
(function () {
'use strict';
var TL = window.TL;
var $ = function (id) { return document.getElementById(id); };
var elTop = $('top'), elMain = $('main'), elFx = $('fxlayer'), elModal = $('modal'), elToast = $('toast');
var SAVE = 'trilantern_save_v1', META = 'trilantern_meta_v1';

var S = null;        // 진행 중인 판
var sel = -1;        // 고른 손패 위치
var busy = false;    // 적 차례 등 입력을 막는 동안 true
var modal = null;    // 열려 있는 창
var seenUids = {};   // 손패에 이미 보인 카드 (새로 뽑은 카드만 애니메이션)
var touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
var meta = loadMeta();

/* ---------- 저장 ---------- */
function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function fetchStore(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function loadMeta() {
  var m = fetchStore(META) || {};
  return { runs: m.runs || 0, wins: m.wins || 0, best: m.best || 0, mute: !!m.mute, helped: !!m.helped };
}
function saveMeta() { store(META, meta); }
function save() {
  if (!S) return;
  if (S.phase === 'over' || S.phase === 'win') { store(SAVE, null); return; }
  if (S.phase === 'combat' && S.combat.phase !== 'player') return;
  var f = S.fx; S.fx = []; store(SAVE, S); S.fx = f;
}
function loadSave() {
  var s = fetchStore(SAVE);
  if (!s || s.v !== 1 || !s.deck || !s.phase) return null;
  s.fx = [];
  return s;
}

/* ---------- 소리 (전부 합성음) ---------- */
var ac = null;
function tone(f, dur, type, vol, slide, delay) {
  if (meta.mute) return;
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
var SFX = {
  click: function () { tone(520, 0.05, 'triangle', 0.05); },
  f: function () { tone(260, 0.16, 'sawtooth', 0.06, 120); },
  i: function () { tone(1100, 0.2, 'sine', 0.07, 700); },
  s: function () { tone(1500, 0.08, 'square', 0.04, 500); },
  n: function () { tone(660, 0.12, 'triangle', 0.06, 880); },
  hit: function () { tone(150, 0.14, 'square', 0.08, 50); },
  block: function () { tone(420, 0.09, 'triangle', 0.07, 300); },
  hurt: function () { tone(110, 0.22, 'sawtooth', 0.1, 45); },
  res: function (n) { tone(520 + 120 * Math.min(n, 6), 0.12, 'sine', 0.06, 0, 0.05); },
  turn: function () { tone(700, 0.07, 'sine', 0.04); },
  win: function () { [523, 659, 784, 1047].forEach(function (f, k) { tone(f, 0.18, 'triangle', 0.07, 0, k * 0.09); }); },
  lose: function () { [392, 330, 262, 196].forEach(function (f, k) { tone(f, 0.28, 'sawtooth', 0.06, 0, k * 0.16); }); },
  coin: function () { tone(1200, 0.06, 'square', 0.04); tone(1600, 0.1, 'square', 0.04, 0, 0.06); }
};

/* ---------- 그리기 도우미 ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function cardHTML(card, o) {
  o = o || {};
  var d = TL.CARDS[card.id], cls = 'card el-' + d.el + (card.up ? ' up' : '') + (o.cls ? ' ' + o.cls : '');
  var attrs = (o.a ? ' data-a="' + o.a + '"' : '') + (o.i !== undefined ? ' data-i="' + o.i + '"' : '') +
    (o.uid ? ' data-uid="' + o.uid + '"' : '') + (o.r ? ' data-r="' + o.r + '"' : '') + (o.style ? ' style="' + o.style + '"' : '');
  return '<div class="' + cls + '"' + attrs + '>' +
    '<div class="cost">' + TL.costOf(card) + '</div>' +
    '<div class="cname">' + esc(TL.cardName(card)) + '</div>' +
    '<div class="cart">' + d.a + '</div>' +
    '<div class="ctype">' + TL.EL[d.el].icon + ' ' + TL.TYPE_NAME[d.t] + '</div>' +
    '<div class="ctext">' + TL.cardText(card, o.combat ? S : null) + '</div>' +
    (o.tag ? '<div class="tag">' + o.tag + '</div>' : '') +
    (o.price !== undefined ? '<div class="price">💰 ' + o.price + '</div>' : '') +
    '</div>';
}
function stsHTML(st, blockN, pow) {
  var h = '';
  if (blockN > 0) h += '<span class="b" title="방어도: 피해를 대신 받는다">🛡️' + blockN + '</span>';
  Object.keys(TL.ST).forEach(function (k) {
    if (st[k] > 0) h += '<span title="' + TL.ST[k].name + ': ' + TL.ST[k].tip + '">' + TL.ST[k].icon + st[k] + '</span>';
  });
  if (pow) {
    var P = { furnace: ['🏭', '용광로: 매 턴 모든 적에게 화상'], armor: ['🥋', '얼음 갑옷: 턴 종료 시 방어도'], perma: ['🏔️', '영구 동토: 방어도 절반 유지'],
      rod: ['📡', '피뢰침: 전환 시 피해'], surge: ['🏃', '번개 질주: 매 턴 카드 추가'] };
    Object.keys(P).forEach(function (k) { if (pow[k]) h += '<span title="' + P[k][1] + '">' + P[k][0] + (k === 'perma' ? '' : pow[k]) + '</span>'; });
  }
  return h;
}
function toast(msg, ms) {
  elToast.innerHTML = msg; elToast.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(function () { elToast.classList.remove('on'); }, ms || 1800);
}

/* ---------- 상단 바 ---------- */
function renderTop() {
  if (!S || S.phase === 'start') { elTop.innerHTML = ''; return; }
  var act = TL.ACTS[Math.min(S.act, TL.ACTS.length - 1)];
  elTop.innerHTML =
    '<span class="stat">❤️ ' + S.hp + '/' + S.maxHp + '</span>' +
    '<span class="stat">💰 ' + S.gold + '</span>' +
    '<span class="where">' + (S.act + 1) + '막 <b>' + act.name + '</b> ' + Math.min(S.step + 1, TL.STEPS) + '/' + TL.STEPS + '</span>' +
    '<div class="relics">' + S.relics.map(function (id) {
      return '<button class="relic" data-a="relic" data-id="' + id + '" title="' + esc(TL.RELICS[id].n + ': ' + TL.RELICS[id].x) + '">' + TL.RELICS[id].i + '</button>';
    }).join('') + '</div>' +
    '<button class="tb" data-a="deck">🂠 ' + S.deck.length + '</button>' +
    '<button class="tb" data-a="menu">☰</button>';
}

/* ---------- 화면들 ---------- */
function screen(cls, html) { elMain.innerHTML = '<div class="screen ' + cls + '">' + html + '</div>'; }

function renderTitle() {
  elTop.innerHTML = '';
  var has = !!loadSave();
  screen('title',
    '<div class="orbs">🔥❄️⚡</div>' +
    '<h1><span>삼원</span><span>의 </span><span>등불</span></h1>' +
    '<p>불·서리·번개 세 원소의 카드를 엮어 심연의 끝까지 내려가는 덱 빌딩 로그라이크.<br>같은 원소를 이으면 <b style="color:#fff">공명</b>, 원소를 바꾸면 <b style="color:#fff">전환</b>.</p>' +
    '<div class="col">' +
    (has ? '<button class="btn pri" data-a="continue">이어하기</button>' : '') +
    '<button class="btn' + (has ? '' : ' pri') + '" data-a="new">새 모험</button>' +
    '<button class="btn" data-a="help">놀이법</button>' +
    '<button class="btn" data-a="mute">' + (meta.mute ? '🔇 소리 꺼짐' : '🔊 소리 켜짐') + '</button>' +
    '</div>' +
    '<div class="rec">' + (meta.runs ? '도전 ' + meta.runs + '회 · 완주 ' + meta.wins + '회 · 최고 ' + meta.best + '층' : '첫 도전을 기다리는 중') + '</div>');
}

function renderStart() {
  screen('',
    '<h2>등불에 새길 인장을 고르세요</h2>' +
    '<p>기본 덱(불씨 4, 서리 방패 4, 스파크 2)에 인장의 카드 1장과 유물 1개가 더해집니다.</p>' +
    '<div class="row">' + TL.ATTUNE.map(function (a, i) {
      var r = TL.RELICS[a.relic], c = TL.CARDS[a.card];
      return '<button class="pickbox" data-a="attune" data-i="' + i + '" style="--c:var(--' + a.el + ')">' +
        '<span class="big">' + TL.EL[a.el].icon + '</span><b>' + a.n + '</b><small>' + a.x + '</small>' +
        '<span class="get">' + r.i + ' <b>' + r.n + '</b> — ' + r.x + '</span>' +
        '<span class="get">' + c.a + ' <b>' + c.n + '</b> — ' + TL.cardText({ id: a.card, up: 0 }, null) + '</span>' +
        '</button>';
    }).join('') + '</div>');
}

function renderMap() {
  var act = TL.ACTS[S.act], dots = '';
  for (var k = 0; k < TL.STEPS; k++) {
    var label = k === TL.STEPS - 1 ? '👑' : k === TL.STEPS - 2 ? '🏕️' : (k + 1);
    dots += '<i class="' + (k < S.step ? 'done' : k === S.step ? 'cur' : '') + '">' + label + '</i>';
  }
  screen('map',
    '<h2>' + (S.act + 1) + '막 · ' + act.name + '</h2>' +
    '<div class="track">' + dots + '</div>' +
    '<p>' + (S.doors.length > 1 ? '갈림길이다. 어느 쪽으로 갈까?' : S.doors[0] === 'boss' ? '길 끝에서 무언가 기다리고 있다.' : '길은 하나뿐이다.') + '</p>' +
    '<div class="row">' + S.doors.map(function (d, i) {
      var D = TL.DOORS[d], name = D.n, desc = D.x, icon = D.i;
      if (d === 'boss') { var b = TL.ENEMIES[act.boss[0]]; name = b.n; icon = b.i; desc = '이 막의 주인. HP ' + b.hp[0] + '.'; }
      return '<button class="pickbox" data-a="door" data-i="' + i + '"><span class="big">' + icon + '</span><b>' + name + '</b><small>' + desc + '</small></button>';
    }).join('') + '</div>');
}

function renderCombat() {
  var C = S.combat, alive = TL.alive(S);
  var selCard = sel >= 0 ? C.hand[sel] : null;
  var needTarget = selCard && TL.CARDS[selCard.id].tg && TL.canPlay(S, sel);
  var playable = false;

  var en = C.en.map(function (e, i) {
    var d = TL.ENEMIES[e.key], dead = e.hp <= 0;
    var intent = dead ? '' : TL.intentView(S, e).map(function (p) { return '<span class="' + p.k + '">' + p.i + p.t + '</span>'; }).join('');
    return '<div class="enemy' + (dead ? ' dead' : '') + (needTarget && !dead ? ' targetable' : '') + '" id="e' + i + '" data-a="enemy" data-i="' + i + '">' +
      '<div class="intent" title="다음 행동">' + intent + '</div>' +
      '<div class="eicon">' + d.i + '</div><div class="ename">' + d.n + '</div>' +
      '<div class="hpbar' + (e.block > 0 ? ' blk' : '') + '"><i style="width:' + (100 * e.hp / e.maxHp) + '%"></i><span>' + e.hp + '/' + e.maxHp + '</span></div>' +
      '<div class="sts">' + stsHTML(e.st, e.block) + '</div></div>';
  }).join('');

  var inc = TL.incoming(S), net = Math.max(0, inc - C.block);
  var warn = C.phase !== 'player' ? '' : inc === 0 ? '<span class="warn safe">이번 턴 공격 없음</span>'
    : net === 0 ? '<span class="warn safe">공격 ' + inc + ' 전부 막음</span>'
    : '<span class="warn">받을 피해 ' + net + (C.block ? ' (공격 ' + inc + ')' : '') + '</span>';

  var ch = C.chain, pips = '';
  if (ch.el) for (var k = 0; k < Math.min(ch.n, 8); k++) pips += TL.EL[ch.el].icon;
  var chainBox = '<div class="chainbox' + (ch.el ? ' on' : '') + '"' + (ch.el ? ' style="--c:var(--' + ch.el + ')"' : '') + '>' +
    '<small>' + (ch.el ? '다음 ' + TL.EL[ch.el].name + ' 공명 +' + ch.n : '공명 없음') + '</small><div class="pips">' + (pips || '—') + '</div></div>';

  var n = C.hand.length;
  var hand = C.hand.map(function (c, i) {
    var ok = TL.canPlay(S, i), p = TL.prospect(S, c), cls = '';
    if (ok) playable = true; else cls += ' no';
    if (p.r > 0) cls += ' res'; else if (p.shift) cls += ' shift';
    if (i === sel) cls += ' sel';
    if (!seenUids[c.uid]) { cls += ' new'; seenUids[c.uid] = 1; }
    return cardHTML(c, { a: 'card', i: i, cls: cls, combat: true, r: p.r });
  }).join('');
  var keep = {}; C.hand.forEach(function (c) { keep[c.uid] = 1; }); seenUids = keep;

  var hintTxt = busy ? '적의 차례…'
    : needTarget && alive.length > 1 ? '공격할 적을 고르세요'
    : selCard && touch ? '한 번 더 누르면 사용합니다'
    : !playable && n ? '낼 수 있는 카드가 없습니다. 턴을 끝내세요.' : '';

  elMain.innerHTML = '<div class="combat">' +
    '<div class="enemies">' + en + '</div>' +
    '<div class="mid"><div class="player" id="p"><div class="pi">🏮</div><div class="pinfo">' +
      '<div class="hpbar' + (C.block > 0 ? ' blk' : '') + '"><i style="width:' + (100 * S.hp / S.maxHp) + '%"></i><span>' + S.hp + '/' + S.maxHp + '</span></div>' +
      '<div class="sts">' + stsHTML(C.st, C.block, C.pow) + '</div>' + warn +
    '</div></div>' + chainBox + '</div>' +
    '<div class="hint">' + hintTxt + '</div>' +
    '<div class="ctrl">' +
      '<div class="energy' + (C.energy ? '' : ' zero') + '" title="에너지">' + C.energy + '</div>' +
      '<button class="pile" data-a="pile" data-k="draw" title="뽑을 카드">📥 ' + C.draw.length + '</button>' +
      '<button class="pile" data-a="pile" data-k="disc" title="버린 카드">📤 ' + C.disc.length + '</button>' +
      '<button class="endturn' + (!playable && !busy ? ' go' : '') + '" data-a="end"' + (busy ? ' disabled' : '') + '>턴 종료</button>' +
    '</div>' +
    '<div class="hand' + (n >= 5 ? ' many' : '') + '" id="hand" style="--n:' + Math.max(n, 2) + '">' + hand + '</div></div>';
}
function renderReward() {
  var R = S.reward, h = '<h2>' + (R.kind === 'boss' ? '막의 주인을 쓰러뜨렸다!' : '승리') + '</h2>';
  h += '<div class="gain"><span>💰 골드 +' + R.gold + '</span>';
  if (R.relic) h += '<span>' + TL.RELICS[R.relic].i + ' <b>' + TL.RELICS[R.relic].n + '</b> — ' + TL.RELICS[R.relic].x + '</span>';
  h += '</div>';
  if (R.bossRelics) {
    h += '<p>유물 하나를 고르세요.</p><div class="row">' + R.bossRelics.map(function (id, i) {
      var r = TL.RELICS[id];
      return '<button class="pickbox" data-a="bossrelic" data-i="' + i + '"><span class="big">' + r.i + '</span><b>' + r.n + '</b><small>' + r.x + '</small></button>';
    }).join('') + '</div>';
  } else if (R.cards) {
    h += '<p>덱에 넣을 카드를 한 장 고르세요. 덱이 얇을수록 핵심 카드가 자주 손에 들어오니, 건너뛰어도 됩니다.</p>' +
      '<div class="cards">' + R.cards.map(function (c, i) { return cardHTML(c, { a: 'take', i: i }); }).join('') + '</div>' +
      '<button class="btn" data-a="take" data-i="-1">건너뛰기</button>';
  }
  screen('', h);
}

function renderRest() {
  var amt = TL.restHealAmount(S), up = TL.upgradable(S).length;
  screen('',
    '<div class="eventicon">🏕️</div><h2>모닥불</h2><p>불 곁에서 숨을 고른다. 하나만 할 수 있다.</p>' +
    '<div class="col">' +
    '<button class="btn" data-a="rest"' + (amt ? '' : ' disabled') + '>쉬기<small>' + (amt ? 'HP ' + Math.min(amt, S.maxHp - S.hp) + ' 회복' : '얼음 왕관 때문에 회복할 수 없다') + '</small></button>' +
    '<button class="btn" data-a="smith"' + (up ? '' : ' disabled') + '>벼리기<small>카드 1장을 영구히 강화</small></button>' +
    (!amt && !up ? '<button class="btn" data-a="restskip">떠난다</button>' : '') +
    '</div>');
}

function renderPick() {
  var P = S.pick, upg = P.kind === 'upgrade';
  var cards = S.deck.map(function (c) {
    var ok = upg ? (!c.up && TL.CARDS[c.id].u) : true;
    return cardHTML(upg && ok ? { id: c.id, up: 1 } : c, { a: ok ? 'pick' : '', uid: c.uid, cls: ok ? '' : 'dim', tag: upg && ok ? '강화 후' : '' });
  }).join('');
  screen('',
    '<h2>' + (upg ? '강화할 카드를 고르세요' : '덱에서 뺄 카드를 고르세요') + '</h2>' +
    '<p>' + (upg ? '강화된 뒤의 모습을 보여 줍니다.' : '약한 기본 카드를 빼면 좋은 카드가 더 자주 손에 들어옵니다.') + '</p>' +
    '<div class="cards">' + cards + '</div>' +
    '<button class="btn" data-a="pickcancel">돌아가기</button>');
}

function renderShop() {
  var sh = S.shop;
  var h = '<div class="eventicon">🛒</div><h2>상인</h2><p>"좋은 물건만 있다네. 💰 ' + S.gold + ' 가지고 있군."</p>';
  h += '<div class="cards">' + sh.cards.map(function (c, i) {
    return cardHTML(c, { a: 'buycard', i: i, price: c.price, cls: (c.sold ? 'sold' : '') + (S.gold < c.price ? ' poor' : '') });
  }).join('') + '</div><div class="col">';
  sh.relics.forEach(function (r, i) {
    var R = TL.RELICS[r.id];
    h += '<button class="btn shoprel" data-a="buyrelic" data-i="' + i + '"' + (r.sold || S.gold < r.price ? ' disabled' : '') + '>' +
      '<span class="big">' + R.i + '</span><span><b>' + R.n + '</b>' + R.x + '</span><em>' + (r.sold ? '팔림' : '💰 ' + r.price) + '</em></button>';
  });
  h += '<button class="btn shoprel" data-a="shopremove"' + (sh.removed || S.gold < sh.removeCost || S.deck.length <= 5 ? ' disabled' : '') + '>' +
    '<span class="big">🗑️</span><span><b>카드 제거</b>덱에서 카드 1장을 영구히 뺀다</span><em>' + (sh.removed ? '이용함' : '💰 ' + sh.removeCost) + '</em></button>';
  h += '<button class="btn pri" data-a="leaveshop">떠난다</button></div>';
  screen('', h);
}

function renderEvent() {
  var E = TL.EVENTS[S.event.id], h = '<div class="eventicon">' + E.i + '</div><h2>' + E.t + '</h2>';
  if (S.event.res !== null) {
    h += '<p style="color:var(--text)">' + esc(S.event.res) + '</p><div class="col"><button class="btn pri" data-a="eventdone">계속</button></div>';
  } else {
    h += '<p>' + E.x + '</p><div class="col">' + E.o(S).map(function (o, i) {
      return '<button class="btn" data-a="eventopt" data-i="' + i + '"' + (o.ok ? '' : ' disabled') + '>' + o.l + (o.s ? '<small>' + o.s + '</small>' : '') + '</button>';
    }).join('') + '</div>';
  }
  screen('', h);
}

function renderEnd() {
  var win = S.phase === 'win';
  if (!S.recorded) {
    S.recorded = 1; meta.runs++; if (win) meta.wins++;
    meta.best = Math.max(meta.best, S.floor); saveMeta(); store(SAVE, null);
  }
  screen('title',
    '<div class="eventicon">' + (win ? '🏆' : '🕯️') + '</div>' +
    '<h2>' + (win ? '폭풍이 잦아들었다' : '등불이 꺼졌다') + '</h2>' +
    '<p>' + (win ? '세 원소의 빛이 심연 끝까지 닿았습니다. 완주를 축하합니다!' : (S.act + 1) + '막 ' + TL.ACTS[S.act].name + '에서 쓰러졌습니다.') + '</p>' +
    '<div class="gain"><span>도달 ' + S.floor + '층 · 승리한 전투 ' + S.stats.wins + '</span>' +
    '<span>준 피해 ' + S.stats.dmg + ' · 받은 피해 ' + S.stats.taken + ' · 낸 카드 ' + S.stats.cards + '</span>' +
    '<span>덱 ' + S.deck.length + '장 · 유물 ' + S.relics.map(function (r) { return TL.RELICS[r].i; }).join('') + '</span></div>' +
    '<div class="col"><button class="btn pri" data-a="new">다시 도전</button><button class="btn" data-a="title">처음으로</button></div>');
}

function render() {
  if (!S) { renderTitle(); return; }
  renderTop();
  switch (S.phase) {
    case 'start': renderStart(); break;
    case 'map': renderMap(); break;
    case 'combat': renderCombat(); break;
    case 'reward': renderReward(); break;
    case 'rest': renderRest(); break;
    case 'pick': renderPick(); break;
    case 'shop': renderShop(); break;
    case 'event': renderEvent(); break;
    default: renderEnd();
  }
}

/* ---------- 효과 재생 ---------- */
function playFx() {
  if (!S) return;
  var list = S.fx.splice(0), count = {};
  list.forEach(function (f) {
    if (f.t === 'sfx') { if (SFX[f.s]) SFX[f.s](); return; }
    if (f.t === 'play') { SFX[f.el](); return; }
    if (f.t === 'res') { SFX.res(f.n); return; }
    if (f.t === 'relic') { toast(TL.RELICS[f.id].i + ' ' + TL.RELICS[f.id].n + ' 발동', 1000); return; }
    if (f.t === 'shift') return;
    var el = f.who ? $(f.who) : null;
    if (!el) return;
    if (f.t === 'atk') { bump(el, 'lunge'); return; }
    if (f.t === 'die') { el.classList.add('dying'); return; }
    var txt = '', cls = f.t;
    if (f.t === 'hit') {
      if (f.n > 0) { txt = '-' + f.n + (f.burn ? '🔥' : ''); bump(el, 'hurt'); (f.who === 'p' ? SFX.hurt : SFX.hit)(); }
      else if (f.blocked > 0) { txt = '막음'; cls = 'blocked'; SFX.block(); }
      else return;
    } else if (f.t === 'block') { txt = '+' + f.n + '🛡️'; SFX.block(); }
    else if (f.t === 'heal') txt = '+' + f.n + '💚';
    else if (f.t === 'st') txt = TL.ST[f.st].icon + '+' + f.n;
    else if (f.t === 'say') txt = f.s;
    var k = count[f.who] = (count[f.who] || 0) + 1;
    floater(el, txt, cls, k - 1);
  });
}
function bump(el, cls) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}
function floater(el, txt, cls, k) {
  var r = el.getBoundingClientRect(), d = document.createElement('div');
  d.className = 'float ' + cls; d.textContent = txt;
  d.style.left = (r.left + r.width / 2 + ((k % 3) - 1) * 34 * (k ? 1 : 0)) + 'px';
  d.style.top = (r.top + r.height * 0.35) + 'px';
  d.style.animationDelay = (k * 0.09) + 's';
  elFx.appendChild(d);
  setTimeout(function () { d.remove(); }, 1000 + k * 90);
}

/* 규칙 함수를 한 번 부르고 화면을 맞춘다. 전투가 끝나는 순간에는 마지막 타격을 잠깐 보여 준다. */
function act(fn) {
  var was = S.phase;
  var ok = fn();
  if (ok === false) return false;
  sel = -1;
  if (was === 'combat' && S.phase !== 'combat') {
    busy = true; playFx();
    setTimeout(function () { busy = false; seenUids = {}; render(); playFx(); save(); }, 750);
  } else { render(); playFx(); save(); }
  return true;
}
function tryPlay(i, ti) {
  if (!TL.canPlay(S, i)) { toast('에너지가 부족합니다'); return; }
  act(function () { return TL.playCard(S, i, ti); });
}
function clickCard(i) {
  var C = S.combat;
  if (busy || !C || C.phase !== 'player') return;
  var card = C.hand[i];
  if (!card) return;
  if (!TL.canPlay(S, i)) { sel = touch ? i : -1; render(); toast('에너지가 부족합니다 (비용 ' + TL.costOf(card) + ')'); return; }
  var alive = TL.alive(S), needTarget = TL.CARDS[card.id].tg && alive.length > 1;
  if (needTarget) {
    if (sel === i && !touch) sel = -1; else sel = i;
    SFX.click(); render(); return;
  }
  if (touch && sel !== i) { sel = i; SFX.click(); render(); return; }
  tryPlay(i, alive.length ? S.combat.en.indexOf(alive[0]) : 0);
}
function clickEnemy(ti) {
  var C = S.combat;
  if (busy || !C || C.phase !== 'player' || sel < 0) return;
  var card = C.hand[sel];
  if (!card || !TL.CARDS[card.id].tg || C.en[ti].hp <= 0) return;
  tryPlay(sel, ti);
}
function endTurn() {
  if (busy || !S || S.phase !== 'combat' || S.combat.phase !== 'player') return;
  sel = -1; busy = true;
  TL.endTurn(S); render(); playFx();
  enemyLoop();
}
function enemyLoop() {
  var C = S.combat, left = false;
  for (var k = C.ei; k < C.en.length; k++) if (C.en[k].hp > 0) left = true;
  setTimeout(function () {
    TL.enemyStep(S);
    if (S.phase !== 'combat') {
      playFx();
      setTimeout(function () { busy = false; seenUids = {}; render(); playFx(); save(); }, 800);
      return;
    }
    if (S.combat.phase === 'enemy') { render(); playFx(); enemyLoop(); }
    else { busy = false; render(); playFx(); save(); }
  }, left ? 560 : 220);
}

/* ---------- 창 ---------- */
function openModal(title, body) {
  modal = true;
  elModal.innerHTML = '<div class="sheet"><header><b>' + title + '</b><button class="tb" data-a="close">닫기</button></header><div class="body">' + body + '</div></div>';
  elModal.classList.add('on');
}
function closeModal() { modal = null; elModal.classList.remove('on'); elModal.innerHTML = ''; }
function sortCards(list) {
  var order = { f: 0, i: 1, s: 2, n: 3 };
  return list.slice().sort(function (a, b) {
    var A = TL.CARDS[a.id], B = TL.CARDS[b.id];
    return order[A.el] - order[B.el] || A.n.localeCompare(B.n, 'ko');
  });
}
function showCards(title, list, note) {
  openModal(title + ' (' + list.length + ')', (note ? '<p class="hint" style="margin:0 0 14px">' + note + '</p>' : '') +
    '<div class="cards">' + (sortCards(list).map(function (c) { return cardHTML(c); }).join('') || '<p class="hint">비어 있음</p>') + '</div>');
}
var HELP =
  '<div class="help">' +
  '<h3>목표</h3><p>3개의 막을 내려가 각 막의 주인을 쓰러뜨리세요. 한 판은 20~30분쯤 걸리고, 쓰러지면 처음부터 다시 시작합니다.</p>' +
  '<h3>전투</h3><p>매 턴 카드 5장을 뽑고 <b>에너지 3</b>을 받습니다. 카드 왼쪽 위 숫자가 비용입니다. 턴이 끝나면 손패는 모두 버려집니다.</p>' +
  '<p>적 머리 위에는 <b>다음 행동</b>이 보입니다. ⚔️ 는 공격, 🛡️ 는 방어, 💪 는 강화입니다. <b>방어도</b>는 피해를 대신 받고, 내 다음 턴이 시작되면 사라집니다.</p>' +
  '<h3>공명과 전환</h3><p>한 턴 안에서 <b>같은 원소</b> 카드를 이어 내면 <b>공명</b>이 쌓입니다. "공명마다 +N" 이라고 적힌 카드는 앞서 이어 낸 같은 원소 카드 수만큼 강해집니다.</p>' +
  '<p>직전 카드와 <b>다른 원소</b>를 내면 <b>전환</b>입니다. 공명은 1부터 다시 시작하지만, "전환:" 효과가 발동합니다. ◇ 무속성 카드는 공명을 끊지 않습니다.</p>' +
  '<h3>세 원소</h3>' +
  '<p><b class="f">🔥 불 · 화상</b> — 턴이 시작될 때 수치만큼 피해를 주고(방어도 무시) 1 줄어듭니다. 쌓일수록 무섭습니다.</p>' +
  '<p><b class="i">❄️ 서리 · 한기</b> — 한기에 걸린 쪽은 주는 피해가 25% 줄어듭니다. 서리 카드는 방어에 강합니다.</p>' +
  '<p><b class="s">⚡ 번개 · 감전</b> — 감전된 쪽은 받는 피해가 50% 늘어납니다. 번개 카드는 드로우와 에너지에 강합니다.</p>' +
  '<h3>조작</h3><p>카드를 눌러 사용합니다. 적이 여럿이면 카드를 고른 뒤 적을 누르세요. 터치 화면에서는 한 번 눌러 확대하고 한 번 더 눌러 사용합니다.</p>' +
  '<p>키보드: 숫자 1~0 카드, E 또는 스페이스 턴 종료, Esc 선택 취소.</p>' +
  '<h3>요령</h3><p>카드를 무조건 집지 마세요. 덱이 얇고 한두 원소에 집중할수록 공명이 잘 이어집니다. 모닥불에서는 HP가 넉넉하면 강화가 이득입니다.</p>' +
  '</div>';

/* 브라우저 confirm() 은 막혀 있는 환경이 있어서 확인 창을 직접 띄운다 */
var pending = null;
function ask(msg, yes) {
  pending = yes;
  openModal('확인', '<p style="margin:0 0 16px;text-align:center;line-height:1.6">' + msg + '</p><div class="col" style="margin:0 auto">' +
    '<button class="btn pri" data-a="yes">예</button><button class="btn" data-a="close">아니요</button></div>');
}
function startNew() {
  S = TL.newRun((Date.now() ^ (Math.random() * 0x7fffffff)) | 0); sel = -1; busy = false; seenUids = {};
  closeModal(); render(); save();
  if (!meta.helped) { meta.helped = true; saveMeta(); openModal('놀이법', HELP); }
}

/* ---------- 입력 ---------- */
var ACT = {
  'new': function () {
    if ((S && S.phase !== 'over' && S.phase !== 'win') || (!S && loadSave())) ask('진행 중인 모험을 버리고 새로 시작할까요?', startNew);
    else startNew();
  },
  yes: function () { var f = pending; pending = null; closeModal(); if (f) f(); },
  'continue': function () { S = loadSave(); sel = -1; busy = false; seenUids = {}; render(); },
  title: function () { S = null; closeModal(); render(); },
  help: function () { openModal('놀이법', HELP); },
  mute: function () { meta.mute = !meta.mute; saveMeta(); closeModal(); render(); if (!meta.mute) SFX.click(); },
  close: closeModal,
  attune: function (d) { act(function () { return TL.attune(S, +d.i); }); },
  door: function (d) { seenUids = {}; act(function () { return TL.enterDoor(S, +d.i); }); },
  card: function (d) { clickCard(+d.i); },
  enemy: function (d) { clickEnemy(+d.i); },
  end: endTurn,
  pile: function (d) {
    var C = S.combat;
    if (d.k === 'draw') showCards('뽑을 카드', C.draw, '순서는 섞여 있습니다.');
    else showCards('버린 카드', C.disc);
  },
  deck: function () { showCards('내 덱', S.deck); },
  relic: function (d) { var r = TL.RELICS[d.id]; toast(r.i + ' <b>' + r.n + '</b><br>' + r.x, 2600); },
  menu: function () {
    openModal('메뉴', '<div class="col" style="margin:0 auto">' +
      '<button class="btn" data-a="help">놀이법</button>' +
      '<button class="btn" data-a="mute">' + (meta.mute ? '🔇 소리 꺼짐' : '🔊 소리 켜짐') + '</button>' +
      '<button class="btn" data-a="title">저장하고 처음으로</button>' +
      '<button class="btn" data-a="abandon">이 모험 포기</button></div>');
  },
  abandon: function () {
    ask('정말 이 모험을 포기할까요?', function () { store(SAVE, null); S = null; render(); });
  },
  bossrelic: function (d) { act(function () { return TL.takeBossRelic(S, +d.i); }); SFX.coin(); },
  take: function (d) { act(function () { return TL.takeCard(S, +d.i); }); },
  rest: function () { act(function () { return TL.restHeal(S); }); },
  smith: function () { act(function () { return TL.restUpgrade(S); }); },
  restskip: function () { act(function () { return TL.restSkip(S); }); },
  pick: function (d) { act(function () { return TL.pickCard(S, d.uid); }); },
  pickcancel: function () { act(function () { return TL.pickCancel(S); }); },
  buycard: function (d) { if (act(function () { return TL.buyCard(S, +d.i); })) SFX.coin(); else toast('골드가 부족합니다'); },
  buyrelic: function (d) { if (act(function () { return TL.buyRelic(S, +d.i); })) SFX.coin(); },
  shopremove: function () { act(function () { return TL.shopRemove(S); }); },
  leaveshop: function () { act(function () { return TL.leaveShop(S); }); },
  eventopt: function (d) { act(function () { return TL.eventChoose(S, +d.i); }); },
  eventdone: function () { act(function () { return TL.eventDone(S); }); }
};
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-a]');
  if (!t) {
    if (ev.target === elModal) closeModal();
    else if (sel >= 0 && S && S.phase === 'combat' && !busy) { sel = -1; render(); }
    return;
  }
  if (t.disabled) return;
  var a = t.getAttribute('data-a');
  if (!a || !ACT[a]) return;
  if (a !== 'card' && a !== 'enemy' && a !== 'end') SFX.click();
  ACT[a](t.dataset);
});
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape') { if (modal) closeModal(); else if (sel >= 0) { sel = -1; render(); } return; }
  if (modal || !S || S.phase !== 'combat' || busy) return;
  if (ev.key === 'e' || ev.key === 'E' || ev.key === ' ') { ev.preventDefault(); endTurn(); return; }
  if (/^[0-9]$/.test(ev.key)) {
    var i = ev.key === '0' ? 9 : +ev.key - 1;
    if (i < S.combat.hand.length) {
      var was = touch; touch = false; clickCard(i); touch = was;
    }
  }
});

window.__tl = { get S() { return S; }, set S(v) { S = v; render(); } };
render();
})();
