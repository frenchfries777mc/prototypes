'use strict';
/* 로드스타 — 화면 조작: 입력, HUD, 상점, 메뉴, 메인 루프 */

(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  var STEP = 1 / 60, KEYS = ['Q', 'W', 'E', 'R'], CODES = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
  var cv = $('cv'), state = 'menu', sel = 'kael', diff = 1, P = null;
  var mouse = { px: 0, py: 0, x: 0, y: 0, inside: false, down: false }, aim = null, camLock = true, amove = false, pan = {};
  var muted = false, last = 0, acc = 0, lastCmd = 0, demoT = 0, demoH = null, annT = 0, sellArm = -1, bossAnn = -99;
  var cache = {};
  function set(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
  function setW(id, f) { var v = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%'; if (cache['w' + id] !== v) { cache['w' + id] = v; $(id).style.width = v; } }
  function cls(e, c, on) { if (e.classList.contains(c) !== !!on) e.classList.toggle(c, !!on); }

  /* ── 소리 ── */
  var AC = null;
  function audioOn() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); }
  function tone(f0, f1, dur, type, vol, delay) {
    if (muted || !AC) return;
    var t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  var SFX = {
    cast: function () { tone(420, 880, 0.14, 'triangle', 0.06); },
    atk: function () { tone(220, 140, 0.05, 'square', 0.025); },
    kill: function () { tone(520, 780, 0.12, 'triangle', 0.08); tone(780, 1170, 0.2, 'triangle', 0.08, 0.1); },
    death: function () { tone(330, 70, 0.6, 'sawtooth', 0.07); },
    tower: function () { tone(140, 40, 0.7, 'sawtooth', 0.09); },
    level: function () { tone(523, 523, 0.09, 'triangle', 0.06); tone(659, 659, 0.09, 'triangle', 0.06, 0.08); tone(784, 784, 0.16, 'triangle', 0.06, 0.16); },
    buy: function () { tone(1200, 1600, 0.08, 'sine', 0.06); },
    err: function () { tone(160, 120, 0.12, 'square', 0.04); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, f, 0.25, 'triangle', 0.08, i * 0.14); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, f, 0.3, 'triangle', 0.08, i * 0.18); }); }
  };
  function sfx(n) { if (SFX[n]) SFX[n](); }

  /* ── 설명 문구 ── */
  function fmt(v) { return Array.isArray(v) ? v.join(' / ') : String(v); }
  function skillLines(sk) {
    var a = [];
    if (sk.dmg) a.push('피해 ' + fmt(sk.dmg) + (sk.sAd ? ' + 공격력의 ' + Math.round(sk.sAd * 100) + '%' : '') + (sk.sAp ? ' + 주문력의 ' + Math.round(sk.sAp * 100) + '%' : '') + (sk.dur ? ' (0.5초마다)' : ''));
    if (sk.heal) a.push('치유 ' + fmt(sk.heal) + (sk.hSAp ? ' + 주문력의 ' + Math.round(sk.hSAp * 100) + '%' : '') + (sk.dur ? ' (0.5초마다)' : ''));
    if (sk.buff && sk.buff.shield) a.push('보호막 ' + fmt(sk.buff.shield));
    if (sk.stun) a.push('기절 ' + fmt(sk.stun) + '초');
    if (sk.root) a.push('속박 ' + sk.root + '초');
    if (sk.slow) a.push('둔화 ' + Math.round(sk.slow[0] * 100) + '% · ' + sk.slow[1] + '초');
    a.push('재사용 ' + fmt(sk.cd) + '초 · 마나 ' + fmt(sk.cost) + (sk.range ? ' · 사거리 ' + sk.range : ''));
    return a;
  }

  /* ── 메뉴 ── */
  var KEYHELP = [
    ['우클릭 / 터치', '이동. 적을 누르면 공격합니다.'],
    ['<kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd>', '누르고 있으면 조준, 떼면 커서 쪽으로 시전. <kbd>Ctrl</kbd>과 함께 누르면 스킬 레벨 업.'],
    ['<kbd>A</kbd> 뒤 클릭', '공격 이동. 가는 길의 적을 알아서 공격합니다.'],
    ['<kbd>B</kbd>', '귀환. 6초 뒤 우물로 돌아가 회복합니다.'],
    ['<kbd>P</kbd> · <kbd>Tab</kbd>', '상점 · 전적. 상점은 우물에 있거나 쓰러졌을 때만 살 수 있습니다.'],
    ['<kbd>Y</kbd> · 휠 · <kbd>Space</kbd>', '카메라 고정 전환 · 확대/축소 · 내 영웅으로.'],
    ['<kbd>S</kbd> · <kbd>M</kbd>', '정지 · 소리 켜고 끄기.']
  ];
  function fillKeys(dl) { dl.innerHTML = KEYHELP.map(function (k) { return '<dt>' + k[0] + '</dt><dd>' + k[1] + '</dd>'; }).join(''); }
  function buildMenu() {
    var g = $('heroGrid');
    HERO_IDS.forEach(function (id) {
      var d = HEROES[id], b = el('button', 'hc', '<i style="background:' + d.color + '">' + d.name.charAt(0) + '</i><b>' + d.name + '</b><small>' + d.role + '</small>');
      b.type = 'button'; b.id = 'hero-' + id; b.setAttribute('role', 'option');
      b.onclick = function () { sel = id; showHero(); };
      g.appendChild(b);
    });
    var df = $('diff');
    DIFFS.forEach(function (d, i) {
      var b = el('button', '', d.name); b.type = 'button'; b.id = 'diff-' + i; b.setAttribute('role', 'radio');
      b.onclick = function () { diff = i; showDiff(); };
      df.appendChild(b);
    });
    fillKeys($('menuKeys')); fillKeys(document.querySelector('#help .keys'));
    showHero(); showDiff();
    $('startBtn').onclick = startGame;
    $('againBtn').onclick = function () { $('end').hidden = true; $('hud').hidden = true; $('menu').hidden = false; state = 'menu'; newGame({ noPlayer: true }); demoH = null; };
  }
  function showDiff() { DIFFS.forEach(function (d, i) { $('diff-' + i).setAttribute('aria-checked', i === diff ? 'true' : 'false'); }); }
  function showHero() {
    HERO_IDS.forEach(function (id) { $('hero-' + id).setAttribute('aria-selected', id === sel ? 'true' : 'false'); });
    var d = HEROES[sel];
    $('heroInfo').style.borderColor = d.color;
    $('heroInfo').innerHTML = '<h2>' + d.name + '<small>' + d.title + ' · ' + d.role + (d.melee ? ' · 근접' : ' · 원거리') + '</small></h2><p>' + d.tip + '</p><ul>' +
      d.skills.map(function (s, i) { return '<li><kbd>' + KEYS[i] + '</kbd><b>' + s.name + '</b> — ' + s.d + '</li>'; }).join('') + '</ul>';
  }

  /* ── HUD 구성 ── */
  var skEls = [];
  function buildHud() {
    var box = $('skills'); box.innerHTML = ''; skEls = [];
    P.def.skills.forEach(function (sk, i) {
      var w = el('div', 'skw'), plus = el('button', 'plus', '+'), b = el('button', 'sk');
      plus.type = 'button'; plus.id = 'plus-' + i; plus.title = '스킬 레벨 업 (Ctrl+' + KEYS[i] + ')';
      plus.onclick = function () { if (levelSkill(P, i)) sfx('buy'); };
      b.type = 'button'; b.id = 'sk-' + i;
      b.innerHTML = '<span class="key">' + KEYS[i] + '</span><span class="cost"></span><span class="nm">' + sk.name + '</span><i class="cdm"></i><span class="cdv"></span><span class="pips">' +
        new Array(i === 3 ? 4 : 5).join('<i></i>') + '</span>';
      b.onclick = function () { smartCast(i); };
      b.onpointerenter = function () { showTip(i); };
      b.onpointerleave = function () { $('tip').hidden = true; };
      w.appendChild(plus); w.appendChild(b); box.appendChild(w);
      skEls.push({ b: b, plus: plus, cdm: b.querySelector('.cdm'), cdv: b.querySelector('.cdv'), cost: b.querySelector('.cost'), pips: b.querySelectorAll('.pips i'), k: '' });
    });
    var w2 = el('div', 'skw'), rc = el('button', 'sk rc', '<span class="key">B</span><span class="nm">귀환</span><i class="cdm"></i>');
    rc.type = 'button'; rc.id = 'sk-recall'; rc.onclick = function () { if (P && !P.dead) startRecall(P); };
    w2.appendChild(rc); box.appendChild(w2);
    $('portrait').style.background = P.color; $('pglyph').textContent = P.name.charAt(0);
    var it = $('items'); it.innerHTML = '';
    for (var k = 0; k < 6; k++) { var s = el('div', 'slot'); s.id = 'slot-' + k; it.appendChild(s); }
    cache = {};
  }
  function showTip(i) {
    var sk = P.def.skills[i], rk = P.ranks[i], t = $('tip');
    var cur = rk ? '현재 ' + rk + '레벨' + (sk.dmg ? ' · 피해 ' + Math.round(skillDmg(P, sk, rk)) : '') + (sk.heal ? ' · 치유 ' + Math.round(skillHeal(P, sk, rk)) : '') : '아직 배우지 않았습니다';
    t.innerHTML = '<h4>' + KEYS[i] + ' · ' + sk.name + '</h4><p>' + sk.d + '</p>' + skillLines(sk).map(function (l) { return '<small>' + l + '</small>'; }).join('') + '<small style="color:var(--gold)">' + cur + '</small>';
    t.hidden = false;
  }

  function startGame() {
    audioOn();
    newGame({ heroId: sel, diff: diff });
    P = G.player;
    R.cam.x = P.x + 500; R.cam.y = P.y; camLock = true; aim = null; amove = false;
    $('menu').hidden = true; $('end').hidden = true; $('hud').hidden = false;
    $('shop').hidden = true; $('score').hidden = true; $('help').hidden = true; $('dead').hidden = true; $('feed').innerHTML = '';
    buildHud(); R.resize(); state = 'play';
    announce('공격로를 밀어 적 로드스톤을 부수세요', 'g', 4);
    cls($('lockBtn'), 'on', true);
  }

  /* ── 알림 ── */
  function announce(txt, c, dur) { var a = $('announce'); a.textContent = txt; a.className = 'show ' + (c || ''); annT = dur || 3; }
  function feed(html, c) {
    var f = $('feed'), d = el('div', c, html); f.appendChild(d);
    while (f.children.length > 5) f.removeChild(f.firstChild);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 6000);
  }
  function hname(h) { return '<b class="' + (h.team === 0 ? 'a' : 'e') + '">' + h.name + '</b>'; }
  function heroById(id) { for (var i = 0; i < G.heroes.length; i++) if (G.heroes[i].id === id) return G.heroes[i]; return null; }
  function handleEvents() {
    var evs = G.events; if (!evs.length) return;
    if (state !== 'play') { evs.length = 0; return; }
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.k) {
        case 'kill': {
          var v = heroById(e.victim), k = heroById(e.killer);
          feed((k ? hname(k) : (e.by === 'tower' ? '포탑' : '병사')) + ' → ' + hname(v), v.team === 0 ? 'e' : 'a');
          if (k === P) { announce(v.name + ' 처치', 'a', 2.2); sfx('kill'); }
          else if (v === P) { sfx('death'); }
          break;
        }
        case 'tower': announce(e.team === 0 ? '아군 포탑이 무너졌습니다' : '적 포탑 파괴', e.team === 0 ? 'e' : 'a', 3); sfx('tower'); break;
        case 'boss': announce((e.team === 0 ? '아군이 ' : '적군이 ') + (e.boss === 'titan' ? '태고의 거신을 쓰러뜨렸습니다' : '황금 골렘을 쓰러뜨렸습니다'), e.team === 0 ? 'a' : 'e', 4); sfx('tower'); break;
        case 'bossSpawn': if (G.t - bossAnn > 5) { bossAnn = G.t; announce('강에 태고의 거신과 황금 골렘이 나타났습니다', 'g', 4); } break;
        case 'level': sfx('level'); break;
        case 'cast': if (e.id === P.id) sfx('cast'); break;
        case 'atk': if (e.id === P.id) sfx('atk'); break;
        case 'over': endGame(e.winner); break;
      }
    }
    evs.length = 0;
  }
  function scoreRows(showItems) {
    var hs = G.heroes.slice().sort(function (a, b) { return a.team - b.team || b.kills - a.kills; });
    return '<tr><th>영웅</th><th>레벨</th><th>처치</th><th>사망</th><th>도움</th><th>병사</th><th>골드</th>' + (showItems ? '<th>장비</th>' : '<th>영웅 피해</th>') + '</tr>' +
      hs.map(function (h) {
        return '<tr class="' + (h.team === 0 ? 'a' : 'e') + (h === P ? ' me' : '') + (h.dead ? ' dead' : '') + '"><td><span class="dot" style="background:' + h.color + '"></span>' + h.name +
          (h.dead && !G.over ? ' (' + Math.ceil(h.respawnT) + ')' : '') + '</td><td>' + h.level + '</td><td>' + h.kills + '</td><td>' + h.deaths + '</td><td>' + h.assists + '</td><td>' + h.cs +
          '</td><td>' + Math.round(h.earned) + '</td><td>' + (showItems ? h.items.map(function (id) { return ITEMS[id].g; }).join(' ') : Math.round(h.dmgDealt)) + '</td></tr>';
      }).join('');
  }
  function endGame(w) {
    state = 'end'; aim = null;
    var win = w === 0;
    $('endTitle').textContent = win ? '승리' : '패배'; $('endTitle').className = win ? 'win' : 'lose';
    $('endSub').textContent = (win ? '적 로드스톤을 부쉈습니다.' : '아군 로드스톤이 부서졌습니다.') + ' 경기 시간 ' + clock(G.t) + ' · 처치 ' + G.kills[0] + ' 대 ' + G.kills[1];
    $('endT').innerHTML = scoreRows(false);
    setTimeout(function () { $('end').hidden = false; $('shop').hidden = true; $('score').hidden = true; }, 1600);
    sfx(win ? 'win' : 'lose');
  }
  function clock(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

  /* ── 상점 ── */
  function openShop(on) { $('shop').hidden = !on; sellArm = -1; if (on) { $('score').hidden = true; $('help').hidden = true; drawShop(true); } }
  function drawShop(force) {
    var can = P.dead || inFountain(P), sig = can + '|' + Math.floor(P.gold / 10) + '|' + P.items.join(',') + '|' + sellArm;
    if (!force && cache.shop === sig) return; cache.shop = sig;
    $('shopGold').textContent = Math.floor(P.gold) + ' 골드';
    var n = $('shopNote'); n.textContent = can ? '장비는 여섯 개까지 가질 수 있습니다.' : '우물로 돌아가야 살 수 있습니다. B 키로 귀환하세요.'; cls(n, 'warn', !can);
    var g = $('shopGrid'); g.innerHTML = '';
    ITEM_IDS.forEach(function (id) {
      var I = ITEMS[id], b = el('button', 'it', '<span class="g">' + I.g + '</span><b>' + I.name + '<em>' + I.cost + '</em></b><small>' + I.d + '</small>');
      b.type = 'button'; b.id = 'buy-' + id;
      b.disabled = !can || P.gold < I.cost || P.items.length >= 6 || (I.unique && P.items.indexOf(id) >= 0);
      b.onclick = function () { if (buyItem(P, id)) { sfx('buy'); drawShop(true); } else sfx('err'); };
      g.appendChild(b);
    });
    var inv = $('shopInv'); inv.innerHTML = '';
    for (var k = 0; k < 6; k++) (function (k) {
      if (k >= P.items.length) { inv.appendChild(el('i')); return; }
      var I = ITEMS[P.items[k]], b = el('button', sellArm === k ? 'sell' : '', sellArm === k ? '판매<br>+' + Math.round(I.cost * SELL_RATE) : I.g);
      b.type = 'button'; b.id = 'sell-' + k; b.title = I.name + ' — ' + I.d; b.disabled = !can;
      b.onclick = function () { if (sellArm === k) { sellItem(P, k); sellArm = -1; sfx('buy'); } else sellArm = k; drawShop(true); };
      inv.appendChild(b);
    })(k);
  }

  /* ── HUD 갱신 ── */
  function updHud(dt) {
    if (annT > 0) { annT -= dt; if (annT <= 0) $('announce').className = ''; }
    set('clock', clock(G.t)); set('ka', G.kills[0]); set('kb', G.kills[1]);
    var ta = 0, tb = 0; for (var i = 0; i < G.towers.length; i++) { if (G.towers[i].team === 0) ta++; else tb++; }
    set('towA', '포탑 ' + ta); set('towB', '포탑 ' + tb);
    setW('hpf', P.hp / P.maxHp); set('hpt', Math.ceil(P.hp) + ' / ' + Math.round(P.maxHp));
    setW('mpf', P.mp / P.maxMp); set('mpt', Math.floor(P.mp) + ' / ' + Math.round(P.maxMp));
    setW('xpf', P.level >= MAX_LEVEL ? 1 : P.xp / xpNeed(P.level));
    set('plevel', P.level); set('gold', Math.floor(P.gold));
    var st = '<span>공격력</span><b>' + Math.round(P.ad) + '</b><span>주문력</span><b>' + Math.round(P.ap) + '</b><span>방어력</span><b>' + Math.round(P.armor) +
      '</b><span>이동</span><b>' + Math.round(P.ms) + '</b><span>처치</span><b>' + P.kills + '/' + P.deaths + '/' + P.assists + '</b>';
    if (cache.stats !== st) { cache.stats = st; $('stats').innerHTML = st; }
    for (i = 0; i < 4; i++) {
      var s = skEls[i], sk = P.def.skills[i], rk = P.ranks[i], cd = P.cds[i], cost = rk ? val(sk.cost, rk) : val(sk.cost, 1);
      var total = rk ? skillCd(P, i) : 1, key = rk + '|' + (cd > 0 ? Math.ceil(cd * (cd < 1 ? 10 : 1)) : 0) + '|' + (P.mp >= cost) + '|' + P.points + '|' + P.level + '|' + (aim && aim.slot === i) + '|' + P.dead;
      s.cdm.style.height = cd > 0 && rk ? (Math.min(1, cd / total) * 100).toFixed(0) + '%' : '0';
      if (s.k === key) continue; s.k = key;
      s.cdv.textContent = cd > 0 && rk ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
      s.cost.textContent = cost;
      cls(s.b, 'off', !rk || P.dead); cls(s.b, 'nomp', rk && P.mp < cost); cls(s.b, 'ready', rk && cd <= 0 && P.mp >= cost && !P.dead); cls(s.b, 'aim', aim && aim.slot === i);
      cls(s.plus, 'on', P.points > 0 && rk < rankCap(P, i));
      for (var p = 0; p < s.pips.length; p++) cls(s.pips[p], 'on', p < rk);
    }
    var rcEl = $('sk-recall').querySelector('.cdm'); rcEl.style.height = P.recallT > 0 ? ((P.recallT / 6) * 100).toFixed(0) + '%' : '0';
    var isig = P.items.join(',');
    if (cache.items !== isig) {
      cache.items = isig;
      for (i = 0; i < 6; i++) { var sl = $('slot-' + i), I = ITEMS[P.items[i]]; sl.textContent = I ? I.g : ''; sl.title = I ? I.name + ' — ' + I.d : ''; cls(sl, 'fill', !!I); }
    }
    var canBuy = (P.dead || inFountain(P)) && P.items.length < 6 && ITEM_IDS.some(function (id) { return ITEMS[id].cost <= P.gold && ITEMS[id].cost >= 400; });
    cls($('shopBtn'), 'can', canBuy);
    $('dead').hidden = !P.dead || state !== 'play';
    if (P.dead) set('deadT', '부활까지 ' + Math.ceil(P.respawnT) + '초');
    if (!$('shop').hidden) drawShop(false);
    if (!$('score').hidden) { var sg = Math.floor(G.t * 2); if (cache.sc !== sg) { cache.sc = sg; $('scoreT').innerHTML = scoreRows(true); } }
  }

  /* ── 입력 ── */
  function setMouse(e) {
    var r = cv.getBoundingClientRect();
    mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top; mouse.inside = true;
    var w = R.s2w(mouse.px, mouse.py); mouse.x = w.x; mouse.y = w.y;
  }
  function pick(x, y, pad) {
    var best = null, bd = 1e9;
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.dead || u.team === 0 || u.invuln || (!u.vis[0])) continue;
      var d = Math.hypot(u.x - x, u.y - y) - u.r;
      if (d < pad && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  function command(touch) {
    if (state !== 'play' || !P || P.dead) return;
    var t = pick(mouse.x, mouse.y, touch ? 55 : 22);
    lastCmd = performance.now();
    if (amove) { amove = false; cv.style.cursor = 'crosshair'; cmdAMove(P, mouse.x, mouse.y); mark(mouse.x, mouse.y, '#ff9c8c'); return; }
    if (t) { cmdAttack(P, t); mark(t.x, t.y, '#ff6b5e'); }
    else { cmdMove(P, mouse.x, mouse.y); mark(mouse.x, mouse.y, '#8ef08a'); }
  }
  function mark(x, y, c) { G.fx.push({ type: 'mark', x: x, y: y, r: 46, dur: 0.35, color: c, t: 0 }); }
  function smartCast(i) {
    if (state !== 'play' || !P || P.dead) return;
    if (P.ranks[i] === 0) { if (!levelSkill(P, i)) sfx('err'); return; }
    var sk = P.def.skills[i], reach = skillReach(sk) + (sk.kind === 'area' ? sk.radius * 0.5 : 0) + 120, best = null, bs = 1e9, u, d, k;
    if (sk.ai === 'heal' || sk.ai === 'sanct') {
      best = P; bs = P.hp / P.maxHp;
      for (k = 0; k < G.heroes.length; k++) { u = G.heroes[k]; if (u.team === 0 && !u.dead && dist(P, u) < reach && u.hp / u.maxHp < bs) { bs = u.hp / u.maxHp; best = u; } }
    } else if (sk.ai !== 'gap') {
      for (k = 0; k < G.units.length; k++) {
        u = G.units[k];
        if (u.dead || u.team === 0 || !u.vis[0] || u.type === 'tower' || u.type === 'core') continue;
        d = dist(P, u); if (d > reach) continue;
        d -= u.type === 'hero' ? 2000 : 0; if (u.team === 2 && !u.camp.target) d += 3000;
        if (d < bs) { bs = d; best = u; }
      }
    }
    var x = best ? best.x : P.x + Math.cos(P.face) * 600, y = best ? best.y : P.y + Math.sin(P.face) * 600;
    if (!castSkill(P, i, x, y)) sfx('err');
  }

  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    audioOn(); setMouse(e);
    if (state !== 'play') return;
    mouse.down = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    if (aim && e.button === 0 && e.pointerType === 'mouse') { castSkill(P, aim.slot, mouse.x, mouse.y); aim = null; return; }
    command(e.pointerType !== 'mouse');
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    setMouse(e);
    if (mouse.down && state === 'play' && P && !P.dead && performance.now() - lastCmd > 160 && (!P.order || P.order.type === 'move')) { lastCmd = performance.now(); cmdMove(P, mouse.x, mouse.y); }
  });
  window.addEventListener('pointerup', function () { mouse.down = false; });
  cv.addEventListener('pointerleave', function () { mouse.inside = false; });
  cv.addEventListener('wheel', function (e) { e.preventDefault(); R.setZoom(R.getZoom() * (e.deltaY > 0 ? 0.92 : 1.08)); }, { passive: false });

  var mini = $('mini');
  function miniCmd(e) {
    if (state !== 'play' || !P) return;
    var r = mini.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MAP.W, y = (e.clientY - r.top) / r.height * MAP.H;
    if (e.button === 2 || e.pointerType !== 'mouse') { if (!P.dead) { cmdMove(P, x, y); } }
    else { camLock = false; cls($('lockBtn'), 'on', false); R.cam.x = x; R.cam.y = y; }
  }
  mini.addEventListener('pointerdown', function (e) { mini.setPointerCapture(e.pointerId); miniCmd(e); e.preventDefault(); });
  mini.addEventListener('pointermove', function (e) { if (e.buttons === 1 && e.pointerType === 'mouse') miniCmd(e); });
  mini.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function toggle(id) { var e = $(id), on = e.hidden; ['shop', 'score', 'help'].forEach(function (k) { $(k).hidden = true; }); if (id === 'shop') openShop(on); else e.hidden = !on; if (on && id === 'score') { cache.sc = -1; } }
  function setLock(on) { camLock = on; cls($('lockBtn'), 'on', on); }
  $('shopBtn').onclick = function () { toggle('shop'); };
  $('shopX').onclick = function () { openShop(false); };
  $('scoreBtn').onclick = function () { toggle('score'); };
  $('scoreX').onclick = function () { $('score').hidden = true; };
  $('helpBtn').onclick = function () { toggle('help'); };
  $('helpX').onclick = function () { $('help').hidden = true; };
  $('lockBtn').onclick = function () { setLock(!camLock); };
  $('muteBtn').onclick = function () { muted = !muted; cls($('muteBtn'), 'on', !muted); audioOn(); };
  cls($('muteBtn'), 'on', true);

  window.addEventListener('keydown', function (e) {
    if (state !== 'play' || !P) { if (state === 'menu' && e.code === 'Enter') startGame(); return; }
    audioOn();
    var c = e.code;
    if (c === 'Tab') { e.preventDefault(); if (!e.repeat) { $('score').hidden = false; $('shop').hidden = true; cache.sc = -1; } return; }
    if (c in CODES) {
      e.preventDefault();
      var i = CODES[c];
      if (e.ctrlKey || e.altKey || e.metaKey) { if (levelSkill(P, i)) sfx('buy'); return; }
      if (e.repeat) return;
      if (P.ranks[i] === 0) { if (P.points > 0 && levelSkill(P, i)) sfx('buy'); else sfx('err'); return; }
      aim = { slot: i, x: mouse.x, y: mouse.y };
      return;
    }
    if (e.repeat && c.indexOf('Arrow') !== 0) return;
    switch (c) {
      case 'KeyS': cmdStop(P); aim = null; break;
      case 'KeyB': if (!P.dead) startRecall(P); break;
      case 'KeyP': toggle('shop'); break;
      case 'KeyA': amove = true; cv.style.cursor = 'cell'; break;
      case 'KeyY': setLock(!camLock); break;
      case 'KeyM': $('muteBtn').onclick(); break;
      case 'Space': e.preventDefault(); pan.center = true; break;
      case 'Escape': aim = null; amove = false; cv.style.cursor = 'crosshair'; ['shop', 'score', 'help'].forEach(function (k) { $(k).hidden = true; }); break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': e.preventDefault(); pan[c] = true; setLock(false); break;
    }
  });
  window.addEventListener('keyup', function (e) {
    var c = e.code;
    if (c === 'Tab') { $('score').hidden = true; return; }
    if (c in CODES && aim && aim.slot === CODES[c] && state === 'play') {
      if (!P.dead) { if (mouse.inside) { if (!castSkill(P, aim.slot, mouse.x, mouse.y)) sfx('err'); } else smartCast(aim.slot); }
      aim = null; return;
    }
    if (c === 'Space') pan.center = false;
    if (c.indexOf('Arrow') === 0) pan[c] = false;
  });
  window.addEventListener('blur', function () { pan = {}; aim = null; mouse.down = false; });
  window.addEventListener('resize', function () { R.resize(); });

  /* ── 카메라 ── */
  function camera(dt) {
    var cam = R.cam;
    if (state === 'menu') {
      demoT -= dt;
      if (!demoH || demoH.dead || demoT <= 0) { var hs = G.heroes.filter(function (h) { return !h.dead && h.team === 0; }); demoH = hs[(Math.random() * hs.length) | 0] || G.heroes[0]; demoT = 14; }
      var ox = cv.clientWidth > 900 ? -520 : 0;
      cam.x += (demoH.x + ox - cam.x) * Math.min(1, dt * 1.6); cam.y += (demoH.y - cam.y) * Math.min(1, dt * 1.6);
      return;
    }
    if (!P) return;
    if (camLock || pan.center) {
      var k = Math.min(1, dt * 9);
      cam.x += (P.x - cam.x) * k; cam.y += (P.y + 60 - cam.y) * k;
    } else {
      var sp = 2400 * dt / R.getZoom(), m = 14, w = cv.clientWidth, h = cv.clientHeight;
      if (pan.ArrowLeft || (mouse.inside && mouse.px < m)) cam.x -= sp;
      if (pan.ArrowRight || (mouse.inside && mouse.px > w - m)) cam.x += sp;
      if (pan.ArrowUp || (mouse.inside && mouse.py < m)) cam.y -= sp;
      if (pan.ArrowDown || (mouse.inside && mouse.py > h - m)) cam.y += sp;
    }
  }

  /* ── 메인 루프 ── */
  function frame(ts) {
    var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    acc += dt; var n = 0;
    while (acc >= STEP && n < 5) { tick(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    if (state === 'menu' && (G.over || G.t > 1500)) { newGame({ noPlayer: true }); demoH = null; }
    handleEvents();
    camera(dt);
    if (mouse.inside) { var w = R.s2w(mouse.px, mouse.py); mouse.x = w.x; mouse.y = w.y; }
    if (aim) { aim.x = mouse.x; aim.y = mouse.y; }
    var hover = state === 'play' && mouse.inside && !mouse.down ? pick(mouse.x, mouse.y, 22) : null;
    R.draw({ me: 0, player: state === 'menu' ? null : P, aim: state === 'play' ? aim : null, hover: hover, fog: true }, ts / 1000);
    if (state !== 'menu') { R.drawMini(0, P); updHud(dt); }
    requestAnimationFrame(frame);
  }

  function boot() {
    R.init(cv, mini);
    buildMenu();
    newGame({ noPlayer: true });
    /* 메뉴 뒤에서 흐르는 전투가 처음부터 한창이도록 미리 돌려 둔다 */
    for (var i = 0; i < 30 * 45; i++) { tick(1 / 30); G.events.length = 0; }
    R.cam.x = 4200; R.cam.y = 3200;
    requestAnimationFrame(frame);
  }
  window.LODESTAR = { start: startGame, get state() { return state; }, get player() { return P; } };
  var hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot); else boot();
})();
