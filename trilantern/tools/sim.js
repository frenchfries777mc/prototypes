/* 자동 플레이 봇으로 여러 판을 돌려 밸런스를 본다.  node tools/sim.js [판수] */
'use strict';
var TL = require('../core.js');
var N = +process.argv[2] || 300;

function clone(S) { var f = S.fx; S.fx = []; var c = JSON.parse(JSON.stringify(S)); S.fx = f; return c; }

function evaluate(S) {
  if (S.phase === 'over') return -1e6;
  if (S.phase !== 'combat') return 1e6 + S.hp * 10;
  var C = S.combat, inc = TL.incoming(S), sc = 0;
  sc += S.hp * 3;
  sc += Math.min(C.block, inc) * 2.6 + Math.max(0, C.block - inc) * (C.pow.perma ? 0.6 : 0.05);
  C.en.forEach(function (e) {
    if (e.hp <= 0) { sc += 40; return; }
    sc -= (e.hp + e.block * 0.7) * 1.0;
    var b = e.st.burn || 0;
    sc += Math.min(e.hp, b * (b + 1) / 2) * 0.75;
    sc += (e.st.shock || 0) * 1.5 + (e.st.chill || 0) * 2.5;
  });
  sc += C.hand.length * 0.6 + C.energy * 0.2 + C.nextE * 3;
  var p = C.pow;
  sc += (p.furnace || 0) * 14 + (p.armor || 0) * 6 + (p.surge || 0) * 14 + (p.perma || 0) * 8 + (p.rod || 0) * 2.5;
  sc += (C.st.str || 0) * 7;
  return sc;
}

function playCombat(S) {
  var guard = 0;
  while (S.phase === 'combat' && guard++ < 3000) {
    var C = S.combat, best = null, bestSc = evaluate(S) + 0.01;
    for (var h = 0; h < C.hand.length; h++) {
      if (!TL.canPlay(S, h)) continue;
      var tg = TL.CARDS[C.hand[h].id].tg;
      var targets = tg ? C.en.map(function (e, i) { return e.hp > 0 ? i : -1; }).filter(function (i) { return i >= 0; }) : [0];
      for (var k = 0; k < targets.length; k++) {
        var T = clone(S);
        TL.playCard(T, h, targets[k]);
        var sc = evaluate(T);
        if (sc > bestSc) { bestSc = sc; best = [h, targets[k]]; }
      }
    }
    if (best) TL.playCard(S, best[0], best[1]); else TL.finishTurn(S);
    S.fx.length = 0;
  }
}

function cardScore(S, c) {
  var d = TL.CARDS[c.id];
  var counts = { f: 0, i: 0, s: 0, n: 0 };
  S.deck.forEach(function (x) { counts[TL.CARDS[x.id].el]++; });
  return d.r * 3 + (c.up ? 1.5 : 0) + counts[d.el] * 0.25 + (d.el === S.attune ? 1.5 : 0) + Math.random();
}

function step(S) {
  switch (S.phase) {
    case 'start': TL.attune(S, S._att); break;
    case 'map': {
      var d = S.doors, hpR = S.hp / S.maxHp, pref;
      if (hpR < 0.45) pref = ['rest', 'treasure', 'event', 'shop', 'combat', 'elite', 'boss'];
      else if (hpR > 0.7) pref = ['treasure', 'elite', 'event', 'combat', 'shop', 'rest', 'boss'];
      else pref = ['treasure', 'event', 'shop', 'combat', 'rest', 'elite', 'boss'];
      if (S.gold >= 150 && d.indexOf('shop') >= 0 && hpR >= 0.45) pref.unshift('shop');
      var bi = 0, bp = 99;
      d.forEach(function (k, i) { var p = pref.indexOf(k); if (p < bp) { bp = p; bi = i; } });
      TL.enterDoor(S, bi); break;
    }
    case 'combat': playCombat(S); break;
    case 'reward': {
      var R = S.reward;
      if (R.bossRelics) { TL.takeBossRelic(S, 0); break; }
      var bi2 = -1, bs = S.deck.length > 22 ? 5 : 1.2;
      R.cards.forEach(function (c, i) { var s = cardScore(S, c); if (s > bs) { bs = s; bi2 = i; } });
      TL.takeCard(S, bi2); break;
    }
    case 'rest':
      if (S.hp / S.maxHp < 0.6 && TL.restHealAmount(S) > 0) TL.restHeal(S);
      else if (!TL.restUpgrade(S)) TL.restSkip(S);
      break;
    case 'pick': {
      var P = S.pick, c;
      if (P.kind === 'upgrade') {
        var u = TL.upgradable(S);
        u.sort(function (a, b) { return TL.CARDS[b.id].r - TL.CARDS[a.id].r; });
        c = u[0];
      } else {
        c = S.deck.filter(function (x) { return x.id === 'ember' || x.id === 'guard'; })[0] || S.deck[0];
      }
      if (!TL.pickCard(S, c.uid)) TL.pickCancel(S);
      break;
    }
    case 'shop': {
      var sh = S.shop, bought = false;
      sh.relics.forEach(function (r, i) { if (!bought && TL.buyRelic(S, i)) bought = true; });
      if (!bought) {
        var best = -1, bsc = 2.5;
        sh.cards.forEach(function (c, i) { if (c.sold || c.price > S.gold) return; var s = cardScore(S, c); if (s > bsc) { bsc = s; best = i; } });
        if (best >= 0) bought = TL.buyCard(S, best);
      }
      if (!bought && S.gold >= sh.removeCost && !sh.removed && TL.shopRemove(S)) break;
      if (!bought) TL.leaveShop(S);
      break;
    }
    case 'event': {
      if (S.event.res !== null) { TL.eventDone(S); break; }
      var os = TL.EVENTS[S.event.id].o(S), done = false;
      for (var i = 0; i < os.length && !done; i++) if (os[i].ok) done = TL.eventChoose(S, i);
      break;
    }
  }
  S.fx.length = 0;
}

var res = { win: 0, byAtt: [0, 0, 0], runsAtt: [0, 0, 0], death: {}, hpEnd: [], floors: 0, turns: 0 };
var relicWin = {}, relicSeen = {};
for (var n = 0; n < N; n++) {
  var S = TL.newRun(1000 + n * 7919);
  S._att = n % 3;
  var guard = 0;
  while (S.phase !== 'over' && S.phase !== 'win' && guard++ < 5000) step(S);
  if (guard >= 5000) { console.log('STUCK', S.phase, S.seed); process.exit(1); }
  res.runsAtt[S._att]++;
  res.floors += S.floor;
  var won = S.phase === 'win';
  if (won) { res.win++; res.byAtt[S._att]++; res.hpEnd.push(S.hp); }
  else { var key = 'A' + (S.act + 1) + '-' + S.step; res.death[key] = (res.death[key] || 0) + 1; }
  S.relics.forEach(function (r) { relicSeen[r] = (relicSeen[r] || 0) + 1; if (won) relicWin[r] = (relicWin[r] || 0) + 1; });
}
console.log('runs', N, 'win', (100 * res.win / N).toFixed(1) + '%', 'avg floor', (res.floors / N).toFixed(1));
console.log('by attunement (불/서리/번개):', res.byAtt.map(function (w, i) { return (100 * w / res.runsAtt[i]).toFixed(0) + '%'; }).join(' / '));
console.log('deaths:', Object.keys(res.death).sort().map(function (k) { return k + ':' + res.death[k]; }).join('  '));
console.log('relic win%:', Object.keys(relicSeen).map(function (r) { return r + ' ' + (100 * (relicWin[r] || 0) / relicSeen[r]).toFixed(0) + '%(' + relicSeen[r] + ')'; }).join('  '));
