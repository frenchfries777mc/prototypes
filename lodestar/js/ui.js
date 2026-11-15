'use strict';
/* 로드스타 — 화면 조작: 입력, HUD, 상점, 메뉴, 메인 루프 */

(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  var STEP = 1 / 60, KEYS = ['Q', 'E', 'R', 'F'], CODES = { KeyQ: 0, KeyE: 1, KeyR: 2, KeyF: 3 }, MOVEKEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowLeft: 1, ArrowDown: 1, ArrowRight: 1 };
  var cv = $('cv'), state = 'menu', sel = 'kael', diff = 1, P = null;
  var mouse = { px: 0, py: 0, x: 0, y: 0, inside: false, down: false }, aim = null, keys = {}, stick = { x: 0, y: 0 }, stickId = null, touchAtk = false, touchMode = false;
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
    ['<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>', '이동. 화살표 키도 됩니다. 움직이는 동안에도 공격과 스킬을 쓸 수 있습니다.'],
    ['마우스', '커서 쪽을 바라봅니다. 왼쪽 버튼을 누르고 있으면 커서에 가장 가까운 적을 공격하고, 가만히 서 있으면 알아서 공격합니다.'],
    ['<kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> <kbd>F</kbd>', '스킬. 누르고 있으면 조준, 떼면 커서 쪽으로 시전합니다. 아직 안 배운 스킬은 키를 누르면 레벨 업.'],
    ['<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>', '각각 Q E R F 스킬 레벨 업. 궁극기(F)는 6·11·15레벨에 배웁니다.'],
    ['<kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd>', '유물 고르기. 짝수 레벨(2~12)마다 세 개 중 하나를 고릅니다. 위쪽에 선택 창이 뜹니다.'],
    ['<kbd>B</kbd>', '귀환. 6초 동안 가만히 있으면 우물로 돌아가 회복합니다. 움직이거나 맞으면 취소됩니다.'],
    ['<kbd>Tab</kbd> · <kbd>M</kbd>', '전적 · 소리 켜고 끄기.'],
    ['점령', '지점 반경 안에 서 있으면 점령됩니다. 내 지점은 초당 충전량이 오르고 안에서 천천히 회복하며, 주변을 밝혀 줍니다. 처치와 보스도 충전량을 올립니다.'],
    ['터치', '왼쪽 화면을 누른 채 끌면 이동, 오른쪽 아래 공격 버튼을 누르고 있으면 공격, 스킬은 아래 버튼을 누릅니다.']
  ];
  function fillKeys(dl) { dl.innerHTML = KEYHELP.map(function (k) { return '<dt>' + k[0] + '</dt><dd>' + k[1] + '</dd>'; }).join(''); }
  function buildMenu() {
    var g = $('heroGrid');
    HERO_IDS.forEach(function (id) {
      var d = HEROES[id], b = el('button', 'hc', '<canvas width="270" height="180"></canvas><b>' + d.name + '</b><small>' + d.role + '</small>');
      b.type = 'button'; b.id = 'hero-' + id; b.setAttribute('role', 'option');
      Spr.portrait(b.querySelector('canvas'), id);
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
    $('heroInfo').innerHTML = '<canvas id="heroPrev" width="300" height="400"></canvas><div class="txt"><h2>' + d.name + '<small>' + d.title + ' · ' + d.role + (d.melee ? ' · 근접' : ' · 원거리') + '</small></h2><p>' + d.tip + '</p><ul>' +
      d.skills.map(function (s, i) { return '<li><kbd>' + KEYS[i] + '</kbd><b>' + s.name + '</b> — ' + s.d + '</li>'; }).join('') + '</ul></div>';
  }

  /* ── HUD 구성 ── */
  var skEls = [], pipEls = [];
  function buildHud() {
    var box = $('skills'); box.innerHTML = ''; skEls = [];
    P.def.skills.forEach(function (sk, i) {
      var w = el('div', 'skw'), plus = el('button', 'plus', '+'), b = el('button', 'sk');
      plus.type = 'button'; plus.id = 'plus-' + i; plus.title = '스킬 레벨 업 (' + (i + 1) + ')';
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
    Spr.portrait($('pcv'), P.defId);
    var it = $('items'); it.innerHTML = '';
    for (var k = 0; k < 6; k++) { var s = el('div', 'slot'); s.id = 'slot-' + k; it.appendChild(s); }
    cache = {}; relicSig = '';
    var pp = $('pips'); pp.innerHTML = ''; pipEls = [];
    [0, 3, 1, 6, 4, 2, 5].forEach(function (ix) { var e = el('i', 'pip'); e.title = NODE_NAMES[ix]; pp.appendChild(e); pipEls[ix] = { e: e, k: null }; });
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
    R.cam.x = P.x + 300; R.cam.y = P.y; aim = null; keys = {}; stick.x = stick.y = 0; stickId = null; touchAtk = false;
    $('menu').hidden = true; $('end').hidden = true; $('hud').hidden = false;
    $('score').hidden = true; $('help').hidden = true; $('dead').hidden = true; $('feed').innerHTML = '';
    buildHud(); R.resize(); state = 'play';
    announce('점령 지점을 차지해 충전량 1000을 먼저 채우세요', 'g', 5);
    setTimeout(function () { if (state === 'play') announce(touchMode ? '왼쪽을 끌어 이동 · 공격 버튼으로 싸우세요' : 'WASD 이동 · 마우스로 조준 · 왼쪽 버튼 공격', 'g', 4); }, 5400);
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
          feed((k ? hname(k) : '정글') + ' → ' + hname(v), v.team === 0 ? 'e' : 'a');
          if (k === P) { announce(v.name + ' 처치', 'a', 2.2); sfx('kill'); }
          else if (v === P) { sfx('death'); }
          break;
        }
        case 'node': {
          var nm = NODE_NAMES[e.i];
          if (e.owner === 0) { announce(nm + ' 점령', 'a', 2.6); feed(nm + ' 아군 점령', 'a'); sfx('level'); }
          else if (e.owner === 1) { announce(e.prev === 0 ? nm + '을(를) 빼앗겼습니다' : '적이 ' + nm + ' 점령', 'e', 2.6); feed(nm + ' 적 점령', 'e'); sfx('tower'); }
          else feed(nm + ' 중립', '');
          break;
        }
        case 'relic': feed('유물을 고를 수 있습니다 (Z X C)', 'a'); break;
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
    return '<tr><th>영웅</th><th>레벨</th><th>처치</th><th>사망</th><th>도움</th><th>정글</th><th>점령</th>' + (showItems ? '<th>장비</th>' : '<th>영웅 피해</th>') + '</tr>' +
      hs.map(function (h) {
        return '<tr class="' + (h.team === 0 ? 'a' : 'e') + (h === P ? ' me' : '') + (h.dead ? ' dead' : '') + '"><td><span class="dot" style="background:' + h.color + '"></span>' + h.name +
          (h.dead && !G.over ? ' (' + Math.ceil(h.respawnT) + ')' : '') + '</td><td>' + h.level + '</td><td>' + h.kills + '</td><td>' + h.deaths + '</td><td>' + h.assists + '</td><td>' + h.cs +
          '</td><td>' + h.caps + '</td><td>' + (showItems ? h.items.map(function (id) { return ITEMS[id].g; }).join(' ') : Math.round(h.dmgDealt)) + '</td></tr>';
      }).join('');
  }
  function endGame(w) {
    state = 'end'; aim = null;
    var win = w === 0;
    $('endTitle').textContent = win ? '승리' : '패배'; $('endTitle').className = win ? 'win' : 'lose';
    $('endSub').textContent = (win ? '적보다 먼저 충전량 1000을 채웠습니다.' : '적이 먼저 충전량 1000을 채웠습니다.') + ' 충전 ' + Math.round(G.charge[0]) + ' 대 ' + Math.round(G.charge[1]) + ' · 경기 시간 ' + clock(G.t) + ' · 처치 ' + G.kills[0] + ' 대 ' + G.kills[1];
    $('endT').innerHTML = scoreRows(false);
    setTimeout(function () { $('end').hidden = false; $('score').hidden = true; $('relic').hidden = true; }, 1600);
    sfx(win ? 'win' : 'lose');
  }
  function clock(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

  /* ── 유물 선택 ── */
  var relicSig = '';
  function drawRelic() {
    var on = P && !P.dead && P.relicPicks > 0 && P.relicOffer && state === 'play';
    var sig = on ? P.relicOffer.join(',') + P.relicPicks : '';
    if (sig === relicSig) return; relicSig = sig;
    $('relic').hidden = !on; if (!on) return;
    var box = $('relicOpts'); box.innerHTML = '';
    P.relicOffer.forEach(function (id, i) {
      var I = ITEMS[id], b = el('button', 'it', '<span class="g">' + I.g + '</span><b>' + I.name + '<em><kbd>' + 'ZXC'.charAt(i) + '</kbd></em></b><small>' + I.d + '</small>');
      b.type = 'button'; b.id = 'relic-' + i; b.onclick = function () { choose(i); };
      box.appendChild(b);
    });
  }
  function choose(i) { if (P && pickRelic(P, i)) { sfx('buy'); relicSig = ''; cache.items = null; } else sfx('err'); }

  /* ── HUD 갱신 ── */
  function updHud(dt) {
    if (annT > 0) { annT -= dt; if (annT <= 0) $('announce').className = ''; }
    var i;
    set('clock', clock(G.t));
    set('ka', Math.floor(G.charge[0])); set('kb', Math.floor(G.charge[1]));
    set('kda', '처치 ' + G.kills[0]); set('kdb', '처치 ' + G.kills[1]);
    setW('chA', G.charge[0] / WIN_CHARGE); setW('chB', G.charge[1] / WIN_CHARGE);
    for (var ni = 0; ni < G.nodes.length; ni++) {
      var pe = pipEls[ni], nn = G.nodes[ni], pk = nn.owner < 0 ? '' : nn.owner === 0 ? 'a' : 'e', pk2 = pk + (nn.contested ? 'c' : '');
      if (pe.k !== pk2) { pe.k = pk2; pe.e.className = 'pip' + (nn.heart ? ' heart' : '') + (pk ? ' ' + pk : '') + (nn.contested ? ' c' : ''); }
    }
    setW('hpf', P.hp / P.maxHp); set('hpt', Math.ceil(P.hp) + ' / ' + Math.round(P.maxHp));
    setW('mpf', P.mp / P.maxMp); set('mpt', Math.floor(P.mp) + ' / ' + Math.round(P.maxMp));
    setW('xpf', P.level >= MAX_LEVEL ? 1 : P.xp / xpNeed(P.level));
    set('plevel', P.level);
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
    drawRelic();
    $('dead').hidden = !P.dead || state !== 'play';
    if (P.dead) set('deadT', '부활까지 ' + Math.ceil(P.respawnT) + '초');
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
      var dd = Math.hypot(u.x - x, u.y - y), d = (u.type === 'hero' || u.type === 'minion' || u.type === 'monster' ? Math.min(dd, Math.hypot(u.x - x, u.y - 48 - y)) : dd) - u.r;
      if (d < pad && d < bd) { bd = d; best = u; }
    }
    return best;
  }
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
        if (u.dead || u.team === 0 || !u.vis[0]) continue;
        d = dist(P, u); if (d > reach) continue;
        d -= u.type === 'hero' ? 2000 : 0; if (u.team === 2 && !u.camp.target) d += 3000;
        if (d < bs) { bs = d; best = u; }
      }
    }
    var x = best ? best.x : P.x + Math.cos(P.face) * 600, y = best ? best.y : P.y + Math.sin(P.face) * 600;
    if (!castSkill(P, i, x, y)) sfx('err');
  }
  function setTouch() { if (!touchMode) { touchMode = true; document.body.classList.add('touch'); } }
  try { if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) setTouch(); } catch (e) {}

  var stickEl = $('stick'), knob = stickEl.firstElementChild, stickO = null;
  function moveStick(e) {
    var dx = e.clientX - stickO.x, dy = e.clientY - stickO.y, l = Math.hypot(dx, dy), m = 56, k = l > m ? m / l : 1;
    knob.style.transform = 'translate(' + (dx * k).toFixed(0) + 'px,' + (dy * k).toFixed(0) + 'px)';
    var n = Math.min(1, l / m);
    if (n < 0.2) { stick.x = stick.y = 0; } else { stick.x = dx / (l || 1) * n; stick.y = dy / (l || 1) * n; }
  }
  function endStick() { stickId = null; stick.x = stick.y = 0; stickEl.hidden = true; knob.style.transform = ''; }

  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    audioOn();
    if (state !== 'play') return;
    if (e.pointerType === 'touch') {
      setTouch();
      var r = cv.getBoundingClientRect();
      if (stickId === null && e.clientX - r.left < r.width * 0.6) {
        stickId = e.pointerId; stickO = { x: e.clientX, y: e.clientY };
        stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.hidden = false; knob.style.transform = '';
        try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      }
      e.preventDefault(); return;
    }
    setMouse(e);
    if (e.button === 0) {
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      if (aim) { if (!castSkill(P, aim.slot, mouse.x, mouse.y)) sfx('err'); aim = null; }
      else mouse.down = true;
    }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') { if (e.pointerId === stickId) moveStick(e); return; }
    setMouse(e);
  });
  function pointerEnd(e) {
    if (e.pointerType === 'touch') { if (e.pointerId === stickId) endStick(); return; }
    mouse.down = false;
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  cv.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') mouse.inside = false; });
  cv.addEventListener('wheel', function (e) { e.preventDefault(); R.setZoom(R.getZoom() * (e.deltaY > 0 ? 0.92 : 1.08)); }, { passive: false });

  var atk = $('atkBtn');
  atk.addEventListener('pointerdown', function (e) { setTouch(); touchAtk = true; try { atk.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { atk.addEventListener(n, function () { touchAtk = false; }); });

  function toggle(id) { var e = $(id), on = e.hidden; ['score', 'help'].forEach(function (k) { $(k).hidden = true; }); e.hidden = !on; if (on && id === 'score') { cache.sc = -1; } }
  $('scoreBtn').onclick = function () { toggle('score'); };
  $('scoreX').onclick = function () { $('score').hidden = true; };
  $('helpBtn').onclick = function () { toggle('help'); };
  $('helpX').onclick = function () { $('help').hidden = true; };
  $('muteBtn').onclick = function () { muted = !muted; cls($('muteBtn'), 'on', !muted); audioOn(); };
  cls($('muteBtn'), 'on', true);

  window.addEventListener('keydown', function (e) {
    var c = e.code;
    if (state !== 'play' || !P) { if (state === 'menu' && c === 'Enter') startGame(); return; }
    audioOn();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (c === 'Tab') { e.preventDefault(); if (!e.repeat) { $('score').hidden = false; cache.sc = -1; } return; }
    if (c in MOVEKEYS) { keys[c] = true; e.preventDefault(); return; }
    if (c in CODES) {
      e.preventDefault();
      var i = CODES[c];
      if (e.repeat) return;
      if (P.ranks[i] === 0) { if (P.points > 0 && levelSkill(P, i)) sfx('buy'); else sfx('err'); return; }
      aim = { slot: i, x: mouse.x, y: mouse.y };
      return;
    }
    var dm = /^(?:Digit|Numpad)([1-4])$/.exec(c);
    if (dm) { if (!e.repeat) { if (levelSkill(P, +dm[1] - 1)) sfx('buy'); else sfx('err'); } return; }
    if (e.repeat) return;
    switch (c) {
      case 'KeyB': if (!P.dead) startRecall(P); break;
      case 'KeyZ': choose(0); break;
      case 'KeyX': choose(1); break;
      case 'KeyC': choose(2); break;
      case 'KeyM': $('muteBtn').onclick(); break;
      case 'Escape': aim = null; ['score', 'help'].forEach(function (k) { $(k).hidden = true; }); break;
    }
  });
  window.addEventListener('keyup', function (e) {
    var c = e.code;
    delete keys[c];
    if (c === 'Tab') { $('score').hidden = true; return; }
    if (c in CODES && aim && aim.slot === CODES[c] && state === 'play') {
      if (!P.dead) { if (mouse.inside && !touchMode) { if (!castSkill(P, aim.slot, mouse.x, mouse.y)) sfx('err'); } else smartCast(aim.slot); }
      aim = null;
    }
  });
  window.addEventListener('blur', function () { keys = {}; aim = null; mouse.down = false; touchAtk = false; });
  window.addEventListener('resize', function () { R.resize(); });

  /* 매 프레임, 키보드·마우스·터치 입력을 영웅에게 전한다 */
  function feedInput() {
    if (state !== 'play' || !P || P.dead) { if (P) { P.moveDir = null; P.atkHold = null; P.aimF = null; } return; }
    var mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
    var my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + stick.y;
    P.moveDir = mx || my ? { x: mx, y: my } : null;
    var useMouse = mouse.inside && !touchMode;
    P.aimF = useMouse ? Math.atan2(mouse.y - P.y, mouse.x - P.x) : null;
    if (P.aimF !== null && !P.dash && P.stunT <= 0 && P.recallT <= 0) P.face = P.aimF;
    P.atkHold = touchAtk ? { x: P.x, y: P.y } : (mouse.down && useMouse && !aim ? { x: mouse.x, y: mouse.y } : null);
  }

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
    var tx = P.x, ty = P.y + 60, k = Math.min(1, dt * 8);
    if (mouse.inside && !touchMode && !P.dead) {
      tx += Math.max(-320, Math.min(320, (mouse.x - P.x) * 0.22));
      ty += Math.max(-200, Math.min(200, (mouse.y - P.y) * 0.22));
    }
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }

  /* ── 메인 루프 ── */
  function frame(ts) {
    var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (mouse.inside) { var mw0 = R.s2w(mouse.px, mouse.py); mouse.x = mw0.x; mouse.y = mw0.y; }
    feedInput();
    acc += dt; var n = 0;
    while (acc >= STEP && n < 5) { tick(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    if (state === 'menu' && (G.over || G.t > 1500)) { newGame({ noPlayer: true }); demoH = null; }
    if (state === 'menu') drawPreview(ts / 1000);
    handleEvents();
    camera(dt);
    if (mouse.inside) { var w = R.s2w(mouse.px, mouse.py); mouse.x = w.x; mouse.y = w.y; }
    if (aim) { aim.x = mouse.x; aim.y = mouse.y; }
    var hover = state === 'play' && mouse.inside && !touchMode && !mouse.down ? pick(mouse.x, mouse.y, 22) : null;
    R.draw({ me: 0, player: state === 'menu' ? null : P, aim: state === 'play' ? aim : null, hover: hover, fog: true }, ts / 1000);
    if (state !== 'menu') { R.drawMini(0, P); updHud(dt); }
    requestAnimationFrame(frame);
  }

  function drawPreview(t) {
    var cv2 = $('heroPrev'); if (!cv2) return;
    var cyc = t % 5, k = { t: t };
    if (cyc > 1.3 && cyc < 1.64) k.atk = (cyc - 1.3) / 0.34;
    else if (cyc > 2.6 && cyc < 3.0) k.cast = (cyc - 2.6) / 0.4;
    else if (cyc > 3.4 && cyc < 4.6) { k.mv = 1; k.ph = t * 8; }
    Spr.portrait(cv2, sel, { full: true, k: k });
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
