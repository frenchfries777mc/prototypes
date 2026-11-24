const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/althist-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 860 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; const external = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!/^(file|blob|data):/.test(u)) external.push(u); });
  const settle = async () => { await page.evaluate(() => new Promise((r) => { const m = window.__map; m.once('idle', r); m.triggerRepaint(); setTimeout(r, 7000); })); await page.waitForTimeout(250); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  ok(await page.isVisible('#overlay'), '시작 화면이 보인다');
  await page.screenshot({ path: `${OUT}/g1_start.png` });

  // 국가 선택(검색) -> 규칙 모드 -> 시작
  await page.fill('#ov-country', 'South Korea'); await page.dispatchEvent('#ov-country', 'change');
  await page.waitForTimeout(1200);
  ok((await page.textContent('#ov-picked')).includes('South Korea'), '국가 선택 표시: ' + (await page.textContent('#ov-picked')).slice(0, 60));
  await page.check('input[name=prov][value=local]');
  await page.click('#ov-start');
  await page.waitForTimeout(500);
  ok(!(await page.isVisible('#overlay')) && (await page.isVisible('#game')), '게임 화면 진입');
  await settle();
  await page.screenshot({ path: `${OUT}/g2_play.png` });
  const s0 = await page.evaluate(() => window.__game.state);
  ok(s0.playerId === 'KOR' && s0.turn === 1, `초기 상태: ${s0.playerId} 턴 ${s0.turn} · 능력치 ${JSON.stringify(s0.stats.KOR)}`);

  const turn = async (cmd) => { await page.fill('#g-cmd', cmd); await page.click('#btn-go'); await page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 60000 }); };

  // 1) 외교
  await turn('일본과 경제 협력 협정을 추진한다');
  let s1 = await page.evaluate(() => window.__game.state);
  ok(s1.turn === 2 && s1.log.length === 1, `외교 명령 처리: ${s1.log[0].outcome} / ${s1.log[0].interpretation}`);

  // 2) 전쟁+점령
  await turn('북한에 선전포고하고 개성을 점령한다');
  let s2 = await page.evaluate(() => window.__game.state);
  const rec = s2.log[1];
  console.log('   전쟁 턴:', rec.outcome, rec.feasibility + '%', '| notes:', rec.notes.join(' / '), '| rejected:', rec.rejected.join(' / '));
  ok(s2.wars.includes('KOR|PRK'), '대한민국-북한 전쟁 상태 등록');
  if (rec.outcome === 'success') {
    const occ = Object.keys(s2.controller).filter((k) => s2.controller[k] === 'KOR' && s2.owner[k] === 'PRK');
    ok(occ.length >= 1, `북한 영토 점령: ${occ.join(',')}`);
  } else console.log('   (실패 판정 — 점령 없음, 난수 결과)');

  // 3) 도달 불가 거부 확인
  await turn('브라질을 침공한다');
  let s3 = await page.evaluate(() => window.__game.state);
  ok(!s3.wars.includes('BRA|KOR'), '도달 불가능한 나라와는 전쟁이 시작되지 않는다: ' + s3.log[2].narrative.slice(0, 60));

  // 4) 턴 넘기기 x6 (세계 사건)
  for (let i = 0; i < 6; i++) { await page.click('#btn-pass'); await page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 60000 }); }
  let s4 = await page.evaluate(() => window.__game.state);
  ok(s4.turn === 10, `턴 진행: 현재 턴 ${s4.turn}, 날짜 ${s4.date}`);
  const evts = s4.log.slice(3).flatMap((r) => r.headlines);
  console.log('   세계 사건 헤드라인 샘플:', evts.slice(0, 4).join(' | ') || '(없음)');
  await settle();
  await page.screenshot({ path: `${OUT}/g3_after.png` });

  // 5) 되돌리기
  await page.click('#btn-undo');
  let s5 = await page.evaluate(() => window.__game.state);
  ok(s5.turn === 9, `되돌리기: 턴 ${s4.turn} → ${s5.turn}`);

  // 6) 자동저장 → 새로고침 → 이어하기
  const saved = await page.evaluate(() => !!localStorage.getItem('althist-save-v1'));
  ok(saved, '자동저장 존재');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  await page.click('#ov-continue'); await page.waitForTimeout(600);
  let s6 = await page.evaluate(() => window.__game.state);
  ok(s6 && s6.turn === 9 && s6.playerId === 'KOR', `이어하기: 턴 ${s6 && s6.turn}`);

  // 7) Gemini (요청을 가로채 가짜 응답)
  let gemReq = null;
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    gemReq = { url: route.request().url(), key: route.request().headers()['x-goog-api-key'], body: JSON.parse(route.request().postData()) };
    const adj = {
      interpretation: '대만과 군사 협력을 강화한다', feasibility: 100, reasoning: 'test',
      if_success: { narrative: '테스트 성공 서술입니다.', headlines: ['테스트 헤드라인'],
        province_transfers: [{ province: 'NOPE-999', to: 'KOR', kind: 'controller' }, { province: 'TWN-1166', to: 'KOR', kind: 'owner' }],
        relation_changes: [{ a: 'KOR', b: 'TWN', delta: 99 }], stat_changes: [{ country: 'KOR', stat: 'military', delta: 50 }, { country: 'KOR', stat: 'magic', delta: 3 }] },
      if_failure: {}, world_events: { narrative: '월드 이벤트', headlines: ['<img src=x onerror=alert(1)> 이벤트'] },
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(adj) + '\n```' }] } }] }) });
  });
  await page.click('#btn-menu'); await page.check('input[name=prov][value=gemini]');
  await page.fill('#ov-key', 'TEST-KEY'); await page.click('#ov-start'); await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ mil: window.__game.state.stats.KOR.military, rel: window.__game.state.relations['KOR|TWN'] ?? 0 }));
  await turn('대만과 군사 협력을 강화한다');
  let s7 = await page.evaluate(() => window.__game.state);
  const r7 = s7.log[s7.log.length - 1];
  ok(gemReq && gemReq.key === 'TEST-KEY' && gemReq.url.includes('generateContent'), 'Gemini 요청이 키와 함께 전송됨: ' + (gemReq && gemReq.url.slice(0, 90)));
  ok(gemReq && /COMMAND: 대만과 군사 협력/.test(gemReq.body.contents[0].parts[0].text), '프롬프트에 명령/상태가 포함됨');
  ok(r7.mode.startsWith('Gemini') && r7.outcome === 'success', 'Gemini 응답 파싱(코드펜스 포함) 성공: ' + r7.mode);
  ok(r7.rejected.length >= 2, `엔진이 잘못된 제안 거부: ${r7.rejected.join(' / ')}`);
  ok(s7.stats.KOR.military === Math.min(100, before.mil + 10), `능력치 변화폭 ±10 제한: ${before.mil} → ${s7.stats.KOR.military}`);
  ok((s7.relations['KOR|TWN'] ?? 0) === Math.min(100, before.rel + 40), `관계 변화폭 ±40 제한: ${before.rel} → ${s7.relations['KOR|TWN']}`);
  const html = await page.innerHTML('#g-log');
  ok(!html.includes('<img'), 'AI 출력의 HTML이 이스케이프됨(XSS 방지)');
  await settle();
  await page.screenshot({ path: `${OUT}/g4_gemini.png` });

  // 8) Gemini 오류 처리 (429)
  await page.unroute('https://generativelanguage.googleapis.com/**');
  await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { message: 'quota' } }) }));
  const turnBefore = await page.evaluate(() => window.__game.state.turn);
  await page.fill('#g-cmd', '군비를 증강한다'); await page.click('#btn-go');
  await page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 30000 });
  const msg = await page.textContent('#g-msg');
  const turnAfter = await page.evaluate(() => window.__game.state.turn);
  ok(/한도/.test(msg) && turnAfter === turnBefore, `429 시 턴이 소모되지 않고 안내 표시: "${msg.slice(0, 50)}"`);

  console.log('외부 요청(예상: Gemini 호출뿐):', [...new Set(external.map((u) => u.split('?')[0]))].join(', ') || '없음');
  console.log('콘솔 오류:', errs.filter((e) => !/429|Failed to load resource/.test(e)).join(' ; ') || '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n모든 검사 통과');
  await browser.close();
})().catch((e) => { console.error('FAIL(예외)', e); process.exit(1); });
