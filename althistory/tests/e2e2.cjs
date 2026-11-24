const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/althist-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 860 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const settle = async () => { await page.evaluate(() => new Promise((r) => { const m = window.__map; m.once('idle', r); m.triggerRepaint(); setTimeout(r, 7000); })); await page.waitForTimeout(250); };
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });

  // 설정칸 숨김
  ok(!(await page.isVisible('#ov-gemini')) && !(await page.isVisible('#ov-webllm')), '규칙 모드일 때 Gemini/Qwen 설정칸이 숨겨진다');
  await page.screenshot({ path: `${OUT}/h1_start.png` });

  // 지도를 직접 클릭해서 국가 선택 (도쿄)
  await page.evaluate(() => window.__map.jumpTo({ center: [139.7, 36.0], zoom: 4.2 })); await settle();
  const px = await page.evaluate(() => { const p = window.__map.project([139.7, 35.7]); return [p.x, p.y]; });
  await page.mouse.click(px[0], px[1]); await page.waitForTimeout(800);
  const pk = await page.textContent('#ov-picked');
  ok(/일본|Japan/.test(pk), '시작 화면에서 지도를 클릭해 국가 선택: ' + pk.slice(0, 40));
  ok((await page.inputValue('#ov-country')).length > 0, '검색창에도 반영');

  // 대한민국으로 바꿔 시작
  await page.fill('#ov-country', '대한민국'); await page.dispatchEvent('#ov-country', 'change'); await page.waitForTimeout(600);
  await page.click('#ov-start'); await page.waitForTimeout(500);
  const turn = async (cmd) => { await page.fill('#g-cmd', cmd); await page.click('#btn-go'); await page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 60000 }); };

  // 점령 표시: Gemini 모의 응답으로 북한 영토 점령
  const target = await page.evaluate(() => {
    const g = window.__game, w = g.world, s = g.state;
    for (let i = 0; i < w.provinces.length; i++) {
      const id = w.provinces[i].id;
      if (s.controller[id] === 'PRK' && w.reach[i].some((j) => s.controller[w.provinces[j].id] === 'KOR')) return id;
    }
  });
  ok(!!target, '점령 가능한 북한 접경 주를 찾음: ' + target);
  await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    interpretation: '북한 접경 지역 점령', feasibility: 100, reasoning: 't',
    if_success: { narrative: '국군이 북한 접경 지역을 점령했다.', headlines: ['접경 지역 점령'], declare_war: [{ a: 'KOR', b: 'PRK' }], province_transfers: [{ province: target, to: 'KOR', kind: 'controller' }] },
    if_failure: {}, world_events: {} }) }] } }] }) }));
  await page.click('#btn-menu'); await page.check('input[name=prov][value=gemini]'); await page.fill('#ov-key', 'K'); await page.click('#ov-start');
  await turn('북한 접경 지역을 점령한다');
  const st = await page.evaluate((id) => ({ c: window.__game.state.controller[id], o: window.__game.state.owner[id], wars: window.__game.state.wars }), target);
  ok(st.c === 'KOR' && st.o === 'PRK' && st.wars.includes('KOR|PRK'), `점령 반영: 지배 ${st.c} / 소유 ${st.o}`);
  await page.evaluate((id) => window.__game.view.fitProvince(id, false), target); await settle();
  const occ = await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['occupied-line'] }).length);
  ok(occ > 0, `점령지 점선 표시 레이어에 렌더된 지형: ${occ}`);
  await page.screenshot({ path: `${OUT}/h2_occupied.png` });

  // 점령 상태에서 클릭 정보
  const c2 = await page.evaluate((id) => { const b = window.__map; const f = window.__game.world.province(id); return f.name; }, target);
  console.log('   점령한 주:', c2);

  // Qwen 오류 처리
  await page.click('#btn-menu'); await page.check('input[name=prov][value=webllm]'); await page.click('#ov-start');
  const t0 = await page.evaluate(() => window.__game.state.turn);
  await page.fill('#g-cmd', '군비를 늘린다'); await page.click('#btn-go');
  await page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 60000 });
  const qm = await page.textContent('#g-msg');
  const t1 = await page.evaluate(() => window.__game.state.turn);
  ok(/WebGPU|WebLLM/.test(qm) && t1 === t0, `Qwen을 쓸 수 없는 환경에서 친절한 오류 + 턴 유지: "${qm.slice(0, 70)}"`);

  // 이어하기 / 내보내기 불러오기
  await page.click('#btn-menu');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ov-export')]);
  const fs = require('fs'); const fp = OUT + '/export.json'; await dl.saveAs(fp);
  const exp = JSON.parse(fs.readFileSync(fp, 'utf8'));
  ok(exp.v === 1 && exp.playerId === 'KOR' && exp.turn === t1, `내보내기 파일: 턴 ${exp.turn}, 로그 ${exp.log.length}건`);
  await page.setInputFiles('#ov-file', fp); await page.waitForTimeout(800);
  ok((await page.evaluate(() => window.__game.state.turn)) === t1 && !(await page.isVisible('#overlay')), '파일 불러오기 성공');

  console.log('콘솔 오류:', errs.filter((e) => !/Failed to load resource/.test(e)).join(' ; ') || '없음');

  // 모바일
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await mp.goto(URL, { waitUntil: 'load' }); await mp.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  await mp.fill('#ov-country', 'Japan'); await mp.dispatchEvent('#ov-country', 'change'); await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}/h3_mobile_start.png` });
  await mp.click('#ov-start'); await mp.waitForTimeout(1500);
  await mp.screenshot({ path: `${OUT}/h4_mobile_play.png` });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, '모바일에서 가로 스크롤 없음');

  console.log(fails ? `\n실패 ${fails}건` : '\n모든 검사 통과');
  await browser.close();
})().catch((e) => { console.error('FAIL(예외)', e); process.exit(1); });
