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
    const regime = Object.entries(nm).flatMap(([id, ps]) => Object.entries(ps).filter(([, n]) => /막부|정권|점령|군정|프랑코|일제강점기/.test(n)).map(([k, n]) => `${id}/${k}=${n}`));
    ok(regime.length === 0, `가문·정권·점령 상태가 아니라 실제 나라 이름을 씀 ${regime.slice(0, 4).join(', ')}`);
    const jp = Object.fromEntries(['imjin-1592', 'crimean-1853', 'cold-war-1947', 'korean-war-1950'].map((id) => [id, nm[id].JPN]));
    ok(Object.values(jp).every((n) => n === '일본') && nm['ww2-1939'].SPA === '스페인' && nm['cold-war-1947'].SPA === '스페인', `일본·스페인은 그냥 일본·스페인: ${JSON.stringify(jp)}`);
    const want = { 'crimean-1853': { GBR: '대영제국', FRA: '프랑스 제2제국' }, 'german-1866': { GBR: '대영제국', FRA: '프랑스 제2제국' }, 'belle-epoque-1900': { GBR: '대영제국', FRA: '프랑스 제3공화국', GER: '독일 제국' },
      'ww1-1914': { GBR: '대영제국', FRA: '프랑스 제3공화국', GER: '독일 제국' }, 'ww2-1939': { FRA: '프랑스 제3공화국', GER: '나치 독일' }, 'cold-war-1947': { FRA: '프랑스 제4공화국' }, 'korean-war-1950': { FRA: '프랑스 제4공화국' },
      'hundred-years-1337': { FRA: '프랑스 왕국' }, 'seven-years-1756': { FRA: '프랑스 왕국', GBR: '그레이트브리튼 왕국' } };
    const wrong = Object.entries(want).flatMap(([id, m]) => Object.entries(m).filter(([k, v]) => nm[id]?.[k] !== v).map(([k, v]) => `${id}/${k}: ${nm[id]?.[k]} (기대 ${v})`));
    ok(wrong.length === 0, `시대별 나라 이름(대영제국·프랑스 제n 공화국/제국·독일 제국·나치 독일) ${wrong.join(' ; ')}`);
    // 독일 땅은 "독일 제후국들" 같은 하나의 묶음이 아니라 시대별 실제 나라들로 나뉜다
    const ger = await page.evaluate(() => { const w = window.__game.world, out = {};
      for (const sc of w.scenarios.filter((x) => x.polities && x.owners)) { const owners = new Set(); w.provinces.forEach((p, i) => { if (p.id.startsWith('DEU-')) owners.add(sc.polities[sc.owners[i]].nameKo); }); out[sc.id] = [...owners]; }
      return out; });
    const gerWant = { 'imjin-1592': 12, 'thirty-years-1618': 11, 'spanish-succession-1701': 12, 'seven-years-1756': 11, 'crimean-1853': 9, 'italian-1859': 9, 'german-1866': 9 };
    const gerBad = Object.entries(gerWant).filter(([id, n]) => (ger[id] ?? []).length < n).map(([id, n]) => `${id}: ${(ger[id] ?? []).length}개(기대 ${n}개 이상)`);
    ok(gerBad.length === 0, `독일 땅이 여러 실제 나라로 나뉨 ${gerBad.join(' ; ') || Object.entries(gerWant).map(([id]) => `${id.split('-')[0]} ${ger[id].length}개`).join(', ')}`);
    ok(!Object.values(nm).some((ps) => Object.values(ps).some((n) => /독일 제후국들|독일 연방 군소국|신성 로마 제국 제후국들/.test(n))), '"독일 제후국들"·"독일 연방 군소국" 같은 묶음 이름이 없음');
    ok(ger['seven-years-1756'].includes('하노버 선제후국') && ger['seven-years-1756'].includes('뷔르템베르크 공국') && ger['crimean-1853'].includes('바이에른 왕국') && ger['crimean-1853'].includes('작센 왕국'), '시대에 맞는 이름(1756 하노버 선제후국·뷔르템베르크 공국 / 1853 바이에른 왕국·작센 왕국)');
    // 바이에른은 주 하나가 아니다: 선제후국은 영토 3개, 1853년 이후 왕국은 5개. 프랑켄·슈바벤은 따로
    const bav = await page.evaluate(() => { const w = window.__game.world, out = {}; for (const sc of w.scenarios.filter((x) => x.polities && x.owners)) { const m = {}; w.provinces.forEach((p, i) => { if (p.id.startsWith('DEU-1591')) { const n = sc.polities[sc.owners[i]].nameKo; m[n] = (m[n] ?? 0) + 1; } }); out[sc.id] = m; } return out; });
    ok((bav['seven-years-1756']['바이에른 선제후국'] ?? 0) === 3 && bav['seven-years-1756']['뷔르츠부르크 주교령'] === 1 && bav['seven-years-1756']['아우크스부르크 주교령'] === 1 && (bav['crimean-1853']['바이에른 왕국'] ?? 0) === 5, `바이에른이 여러 주: 1756 ${JSON.stringify(bav['seven-years-1756'])} · 1853 ${JSON.stringify(bav['crimean-1853'])}`);
    // 자잘한 나라를 큼직하게: 서아프리카 해안은 나라 수가 적고, 시베리아는 몇 개의 큰 영토
    const frag = await page.evaluate(() => { const w = window.__game.world, out = {}; const west = ['GHA', 'CIV', 'SLE', 'LBR', 'GIN', 'GNB', 'SEN', 'GMB', 'TGO', 'BEN', 'BFA', 'MLI', 'NGA'];
      for (const id of ['seven-years-1756', 'imjin-1592']) { const sc = w.scenarios.find((x) => x.id === id); const wa = new Set(), sib = new Set(); w.provinces.forEach((p, i) => { const o = sc.polities[sc.owners[i]]; if (west.includes(p.id.slice(0, 3))) wa.add(o.id); if (p.id.startsWith('RUS-') && o.filled && /sakha|yakut|krasnoyarsk|irkutsk|chukot|kamchat|magadan|khabarovsk|primor|amur|sakhalin|tyumen|khanty|yamal|novosibirsk|omsk|tomsk|kemerovo|altai|tuva|buryat|zabay|chita|evenk|taymyr|jewish|koryak/i.test(p.name)) sib.add(o.id); }); out[id] = { west: wa.size, sib: sib.size, total: sc.polities.length }; }
      return out; });
    ok(frag['seven-years-1756'].west <= 14 && frag['imjin-1592'].sib <= 12 && frag['seven-years-1756'].total <= 230, `자잘한 나라를 합쳐 큼직하게: 1756 서아프리카 ${frag['seven-years-1756'].west}개 나라(전체 ${frag['seven-years-1756'].total}개), 1592 시베리아 ${frag['imjin-1592'].sib}개`);
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
