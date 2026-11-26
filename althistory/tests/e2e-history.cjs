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
  // ---- 나라 이름: 시대에 맞게, 뒤에 ( … )를 붙이지 않는다 ----
  {
    const page = await b.newPage(); await page.addInitScript(() => { try { localStorage.setItem('althist-config-v1', JSON.stringify({ provider: 'gemini', geminiKey: '' })); } catch (e) { /* 무시 */ } });
    await page.goto(URL); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
    const nm = await page.evaluate(() => { const o = {}; for (const sc of window.__game.world.scenarios) { if (!sc.polities) continue; o[sc.id] = Object.fromEntries(sc.polities.map((p) => [p.id, p.nameKo || p.name])); } return o; });
    const bad = Object.entries(nm).flatMap(([id, ps]) => Object.entries(ps).filter(([, n]) => /[()（）]/.test(n)).map(([k, n]) => `${id}/${k}=${n}`));
    ok(bad.length === 0, `나라 이름에 괄호가 없음 ${bad.slice(0, 4).join(', ')}`);
    const want = { 'crimean-1853': { GBR: '대영제국', FRA: '프랑스 제2제국' }, 'german-1866': { GBR: '대영제국', FRA: '프랑스 제2제국' }, 'belle-epoque-1900': { GBR: '대영제국', FRA: '프랑스 제3공화국', GER: '독일 제국' },
      'ww1-1914': { GBR: '대영제국', FRA: '프랑스 제3공화국', GER: '독일 제국' }, 'ww2-1939': { FRA: '프랑스 제3공화국', GER: '나치 독일' }, 'cold-war-1947': { FRA: '프랑스 제4공화국' }, 'korean-war-1950': { FRA: '프랑스 제4공화국' },
      'hundred-years-1337': { FRA: '프랑스 왕국' }, 'seven-years-1756': { FRA: '프랑스 왕국', GBR: '그레이트브리튼 왕국' } };
    const wrong = Object.entries(want).flatMap(([id, m]) => Object.entries(m).filter(([k, v]) => nm[id]?.[k] !== v).map(([k, v]) => `${id}/${k}: ${nm[id]?.[k]} (기대 ${v})`));
    ok(wrong.length === 0, `시대별 나라 이름(대영제국·프랑스 제n 공화국/제국·독일 제국·나치 독일) ${wrong.join(' ; ')}`);
    const modern = await page.evaluate(() => window.__game.world.modernCountry('FRA')?.nameKo);
    ok(modern === '프랑스', `오늘날(현대 템플릿)의 프랑스는 그냥 "프랑스": ${modern}`);
    await page.close();
  }
  for (const [tid, lon, lat, re] of cases) {
    const page = await b.newPage({ viewport: { width: 1300, height: 820 } });
  await page.addInitScript(() => { try { if (!localStorage.getItem('althist-config-v1')) localStorage.setItem('althist-config-v1', JSON.stringify({ provider: 'gemini', geminiKey: '', geminiModel: 'gemini-flash-latest' })); } catch (e) { /* 무시 */ } });
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
