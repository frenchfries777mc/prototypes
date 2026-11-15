/* 브라우저에서 실제 화면을 눌러 가며 한 판을 끝까지 돈다.  node tools/smoke.js [mobile] [스크린샷 폴더] */
'use strict';
var path = require('path');
var { chromium, devices } = require('playwright');
var mobile = process.argv[2] === 'mobile';
var shots = process.argv[3] || '';
(async function () {
  var browser = await chromium.launch();
  var ctx = await browser.newContext(Object.assign({ reducedMotion: 'reduce' }, mobile ? devices['iPhone 13'] : { viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 }));
  var page = await ctx.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', function (d) { d.accept(); });
  await page.addInitScript(function () {
    var st = window.setTimeout;
    window.setTimeout = function (f, ms) { return st(f, (ms || 0) / 25); };
  });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  var shot = async function (name) { if (shots) await page.screenshot({ path: path.join(shots, (mobile ? 'm-' : 'd-') + name + '.png') }); };
  await shot('title');
  await page.click('[data-a=new]');
  await page.click('[data-a=close]');
  await shot('start');
  var seen = {}, steps = 0, phase = '';
  while (steps++ < 6000) {
    phase = await page.evaluate(function () { return window.__tl.S ? window.__tl.S.phase : 'none'; });
    if (phase === 'over' || phase === 'win') break;
    if (!seen[phase]) { seen[phase] = 1; await page.waitForTimeout(60); await shot(phase); }
    if (phase !== 'combat' && phase !== 'reward') await page.waitForSelector('.screen');
    if (phase === 'start') await page.click('[data-a=attune] >> nth=' + (steps % 3));
    else if (phase === 'map') { var n = await page.locator('[data-a=door]').count(); await page.click('[data-a=door] >> nth=' + (steps % n)); }
    else if (phase === 'combat') {
      await page.waitForSelector('.combat');
      var info = await page.evaluate(function () {
        var S = window.__tl.S, C = S.combat;
        if (!C || C.phase !== 'player') return null;
        var idx = -1;
        for (var i = 0; i < C.hand.length; i++) if (window.TL.canPlay(S, i)) { idx = i; break; }
        var t = -1; C.en.forEach(function (e, k) { if (e.hp > 0 && t < 0) t = k; });
        return { idx: idx, t: t, tg: idx >= 0 && !!window.TL.CARDS[C.hand[idx].id].tg, n: window.TL.alive(S).length };
      });
      if (!info) { await page.waitForTimeout(20); continue; }
      if (info.idx < 0) { await page.click('[data-a=end]'); if (!seen.enemyturn) { seen.enemyturn = 1; await shot('enemyturn'); } continue; }
      var card = '#hand .card >> nth=' + info.idx;
      await page.click(card, { force: true });
      if (info.tg && info.n > 1) { if (!seen.target) { seen.target = 1; await shot('target'); } await page.click('#e' + info.t, { force: true }); }
      else if (mobile) await page.click('#hand .card.sel', { force: true });
    }
    else if (phase === 'reward') {
      await page.waitForSelector('[data-a=bossrelic],[data-a=take]');
      if (await page.locator('[data-a=bossrelic]').count()) await page.click('[data-a=bossrelic] >> nth=0');
      else await page.click('[data-a=take] >> nth=' + (steps % 4));
    }
    else if (phase === 'rest') {
      var b = page.locator(steps % 2 ? '[data-a=smith]:not([disabled])' : '[data-a=rest]:not([disabled])');
      if (await b.count()) await b.click(); else await page.click('.screen .btn:not([disabled]) >> nth=0');
    }
    else if (phase === 'pick') await page.click('[data-a=pick] >> nth=0');
    else if (phase === 'shop') {
      var buy = page.locator('.card[data-a=buycard]:not(.sold):not(.poor)');
      if (!seen.bought && await buy.count()) { seen.bought = 1; await buy.first().click(); }
      else if (!seen.removed && await page.locator('[data-a=shopremove]:not([disabled])').count()) { seen.removed = 1; await page.click('[data-a=shopremove]'); }
      else await page.click('[data-a=leaveshop]');
    }
    else if (phase === 'event') {
      if (await page.locator('[data-a=eventdone]').count()) await page.click('[data-a=eventdone]');
      else await page.click('[data-a=eventopt]:not([disabled]) >> nth=0');
    }
  }
  await page.waitForTimeout(100);
  await shot('end');
  var sum = await page.evaluate(function () { var S = window.__tl.S; return { phase: S.phase, floor: S.floor, act: S.act + 1, hp: S.hp, deck: S.deck.length, relics: S.relics.length }; });
  console.log(mobile ? 'mobile' : 'desktop', JSON.stringify(sum), 'screens:', Object.keys(seen).join(','), 'steps', steps);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
