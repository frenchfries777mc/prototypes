// 역사 템플릿에서 지도 클릭 → 나라 카드 + 시작 버튼 (회귀 방지: 현대 소유국 코드로 찾던 버그)
const { chromium } = require('playwright');
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const b = await chromium.launch();
  const cases = [
    ['imjin-1592', 127, 37.5, /조선/], ['imjin-1592', -50, -10, /^(?!.*지역 세력).+/], ['punic-264', 10, 36.5, /카르타고/],
    ['punic-264', 100, 60, /^(?!.*지역 세력).+/], ['ww2-1939', 10, 51, /독일/], ['hundred-years-1337', 2.3, 48.8, /프랑스/],
  ];
  for (const [tid, lon, lat, re] of cases) {
    const page = await b.newPage({ viewport: { width: 1300, height: 820 } });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(URL); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
    await page.click(`.tpl[data-id="${tid}"]`); await page.click('#btn-to-ai'); await page.click('#btn-next');
    const settle = () => page.evaluate(() => new Promise((r) => { const m = window.__map; m.once('idle', r); m.triggerRepaint(); setTimeout(r, 5000); }));
    await page.evaluate(([x, y]) => window.__map.jumpTo({ center: [x, y], zoom: 4.5 }), [lon, lat]); await settle();
    const px = await page.evaluate(([x, y]) => { const p = window.__map.project([x, y]); return [p.x, p.y]; }, [lon, lat]);
    await page.mouse.click(px[0], px[1]); await page.waitForTimeout(300);
    const txt = (await page.textContent('#info')).replace(/\s+/g, ' ');
    ok(re.test(txt) && await page.isVisible('#btn-startgame'), `${tid} (${lon},${lat}) 카드: ${txt.slice(0, 50)}`);
    if (tid === 'imjin-1592' && lon < 0) {
      await page.click('#btn-startgame'); await page.waitForTimeout(500);
      const pid = await page.evaluate(() => window.__game.state?.playerId);
      ok(!!pid && !pid.startsWith('R_'), '1592년 남아메리카 나라로 게임 시작: ' + pid);
    }
    ok(!errs.length, `${tid} 페이지 오류 없음 ${errs.join(' | ')}`);
    await page.close();
  }
  await b.close();
  console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
