// 호외·외교 대응·명령 자동 완성·세력 AI(간이 판정으로 돌려서 네트워크 없이 결정적으로 검사)
const { chromium } = require('playwright');
let URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const srv = process.env.URL ? null : await require('./_serve.cjs')(); if (srv) URL = srv.url; // file:// 대신 로컬 HTTP(헤드리스 file:// 저장소 소실 회피)
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('althist-config-v1', JSON.stringify({ provider: 'gemini', geminiKey: '', difficulty: 'brutal' })); localStorage.setItem('althist-paper-auto', '1'); } catch (e) { /* 무시 */ } });
  await page.goto(URL); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  await page.evaluate(() => { window.__game.start('KOR', 'modern-2026'); const s = window.__game.state; s.difficulty = 'brutal'; }); await page.waitForTimeout(600);
  const S = () => page.evaluate(() => window.__game.state);
  const run = async (btn) => { await page.click(btn); await page.waitForSelector('#paper:not([hidden])', { timeout: 30000 }); const t = await page.textContent('#paper-sheet'), h = await page.innerHTML('#paper-sheet'); await page.click('#paper-close'); await page.waitForFunction(() => !document.getElementById('btn-go').disabled); return { t, h }; };

  // (4) 명령 자동 완성
  await page.click('#g-cmd'); await page.keyboard.type('일');
  const names = await page.$$eval('#g-suggest .sg', (b) => b.map((x) => x.textContent.trim()));
  ok(names.some((n) => n.startsWith('일본')), `"일"을 치면 나라 이름 후보가 뜸: ${names.join(' | ')}`);
  await page.keyboard.press('Tab'); ok(/^일본 /.test(await page.inputValue('#g-cmd')) && await page.isHidden('#g-suggest'), 'Tab으로 후보를 채우면 이름+공백이 들어가고 목록이 닫힘: ' + await page.inputValue('#g-cmd'));
  await page.fill('#g-cmd', ''); await page.keyboard.type('대한민국 제'); const arm = await page.$$eval('#g-suggest .sg', (b) => b.map((x) => x.textContent.trim()));
  ok(arm.some((n) => /내 군대/.test(n)), `내 군대 이름도 후보로 뜸: ${arm.join(' | ')}`);
  await page.fill('#g-cmd', '');

  // (1)(2) 내가 전쟁을 시작하면 호외, 주변국의 비난·지지
  await page.evaluate(() => { const s = window.__game.state; s.relations['CHN|PRK'] = 70; s.relations['CHN|KOR'] = 10; s.relations['KOR|USA'] = 55; s.relations['PRK|USA'] = -60; });
  await page.fill('#g-cmd', '북한에 선전포고하고 개성을 점령한다');
  const r1 = await run('#btn-go'); const s1 = await S();
  ok(s1.wars.includes('KOR|PRK') && s1.log.at(-1).alert === true && /호 외/.test(r1.t) && r1.h.includes('np-extra'), '내가 시작한 전쟁은 호외로 실림');
  ok(/중국은 북한 편에 서서 대한민국의 선전포고를 비난했다/.test(r1.t), '상대의 우방이 비난: ' + (r1.t.match(/[^.]*비난[^.]*\./) ?? [''])[0]);
  ok(/미국은 대한민국의 결정을 지지한다고 밝혔다/.test(r1.t), '나의 우방이 지지');
  ok(s1.relations['CHN|KOR'] === 2, `비난한 나라와의 관계가 내려감(10 → ${s1.relations['CHN|KOR']})`);

  // (8) 세력 AI: 국경을 맞대고 사이가 나쁜 강국이 스스로 선전포고한다
  await page.evaluate(() => { const s = window.__game.state; s.relations['CHN|IND'] = -100; s.stats.CHN.military = 99; s.stats.CHN.stability = 80; s.stats.IND.military = 50; s.wars = s.wars.filter((k) => k !== 'CHN|IND'); });
  let seen = null;
  for (let i = 0; i < 30 && !seen; i++) { const r = await run('#btn-pass'); if ((await S()).wars.includes('CHN|IND')) seen = r; }
  ok(!!seen && /중국이 인도에 선전포고했다/.test(seen.t), `세력 AI가 스스로 전쟁을 건다: ${seen ? '중국이 인도에 선전포고' : '30턴 동안 없음'}`);
  ok(seen && !/중국과 인도 사이에 전쟁이 시작되었다/.test(seen.t), '같은 전쟁이 "전쟁이 시작되었다"로 이중 보도되지 않음');
  console.log('페이지 오류:', errs.length ? errs.join(' ; ') : '없음'); if (errs.length) fail++;
  await browser.close(); console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
