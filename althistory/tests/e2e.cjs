// Playwright E2E: node tests/e2e.cjs  (npm i -D playwright 필요, 먼저 npm run build:single)
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/althist-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const ENGLISH = /South Korea|North Korea|Kyonggi|Gyeonggi|Japan|United States|Taiwan|Russia|Ukraine|India|Pakistan|China/;

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 860 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const settle = async () => { await page.evaluate(() => new Promise((r) => { const m = window.__map; m.once('idle', r); m.triggerRepaint(); setTimeout(r, 7000); })); await page.waitForTimeout(250); };
  const idle = () => page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 60000 });
  const clickLL = async (lon, lat) => {
    await page.evaluate(([x, y]) => window.__map.jumpTo({ center: [x, y], zoom: 4.3 }), [lon, lat]); await settle();
    const px = await page.evaluate(([x, y]) => { const p = window.__map.project([x, y]); return [p.x, p.y]; }, [lon, lat]);
    await page.mouse.click(px[0], px[1]); await page.waitForTimeout(300);
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });

  // ---- 1단계: 흰 배경 + 템플릿 ----
  const bg = await page.evaluate(() => getComputedStyle(document.getElementById('intro')).backgroundColor);
  ok(await page.isVisible('#intro') && /^rgb\((24[0-9]|25[0-5]), (24[0-9]|25[0-5]), (24[0-9]|25[0-5])\)$/.test(bg), `첫 화면이 밝은 배경: ${bg}`);
  ok(!(await page.isVisible('#panel')) && !(await page.isVisible('#game')), '첫 화면에는 지도 패널/게임 패널이 없다');
  const tplCount = await page.locator('.tpl').count(), offCount = 0;
  ok(tplCount === 22, `템플릿 카드 ${tplCount}개 (현대 3 + 역사 19)`);
  ok(!(await page.textContent('#intro')).match(ENGLISH), '시작 화면에 영어 국가명이 없다');
  await page.screenshot({ path: `${OUT}/s1_intro.png` });
  await page.click('.tpl[data-id="bipolar-world"]');
  ok((await page.getAttribute('.tpl[data-id="bipolar-world"]', 'class')).includes('sel'), '템플릿 선택(양극 냉전 세계)');
  ok(!(await page.isVisible('#intro-ai')), 'AI 선택은 템플릿을 고르기 전에는 보이지 않는다');
  ok((await page.locator('#intro-ai .ai-card').count()) === 3 && (await page.locator('#intro-ai input[value=local]').count()) === 0, 'AI 선택은 카드 3개(Gemini/Claude/Qwen), "모드" 선택지 없음');
  ok((await page.locator('.tpl img.t-thumb').count()) === 22, '템플릿 카드마다 시작 지도 썸네일');
  await page.click('#btn-to-ai'); await page.click('#btn-next');

  // ---- 2단계: 지도에서 클릭해 나라 선택 ----
  ok(!(await page.isVisible('#intro')) && (await page.isVisible('#panel')) && (await page.isVisible('#p-hint')), '지도 화면으로 전환, 안내 문구 표시');
  await settle(); await page.screenshot({ path: `${OUT}/s2_pick_empty.png` });
  await clickLL(127.0, 37.5);
  let card = await page.textContent('#info');
  ok(/대한민국/.test(card) && !ENGLISH.test(card), `서울 클릭 → 왼쪽 카드: "${card.replace(/\s+/g, ' ').slice(0, 70)}"`);
  ok(await page.isVisible('#btn-startgame'), '"으로 시작" 버튼 표시: ' + (await page.textContent('#btn-startgame')));
  await page.screenshot({ path: `${OUT}/s3_pick_korea.png` });
  await clickLL(0, -80);  // 남극
  card = await page.textContent('#info');
  ok(/주인 없는 땅/.test(card) && !(await page.isVisible('#btn-startgame')), '남극은 플레이 불가로 표시되고 시작 버튼이 없다');
  await clickLL(127.0, 37.5);
  await page.click('#btn-startgame'); await page.waitForTimeout(500);
  ok((await page.isVisible('#game')) && (await page.evaluate(() => window.__game.phase)) === 'play', '시작 → 플레이 화면');
  const s0 = await page.evaluate(() => window.__game.state);
  ok(s0.playerId === 'KOR' && s0.scenarioId === 'bipolar-world', `상태: ${s0.playerId} / 템플릿 ${s0.scenarioId}`);
  ok((s0.relations['RUS|USA'] ?? 0) === -75 && (s0.relations['JPN|KOR'] ?? 0) === 40, `템플릿 관계 반영(미-러 ${s0.relations['RUS|USA']}, 한-일 ${s0.relations['JPN|KOR']})`);
  await settle(); await page.screenshot({ path: `${OUT}/s4_play.png` });
  const headText = await page.textContent('#game');
  ok(!ENGLISH.test(headText), '플레이 패널에 영어 국가명이 없다');

  // ---- 플레이 ----
  const turn = async (cmd) => { await page.fill('#g-cmd', cmd); await page.click('#btn-go'); await idle(); };
  await turn('일본과 경제 협력 협정을 추진한다');
  let s1 = await page.evaluate(() => window.__game.state);
  ok(s1.turn === 2 && s1.log.length === 1, `외교 명령: ${s1.log[0].outcome} / ${s1.log[0].interpretation}`);
  await turn('북한에 선전포고하고 개성을 점령한다');
  let s2 = await page.evaluate(() => window.__game.state);
  ok(s2.wars.includes('KOR|PRK'), '한국-북한 전쟁 등록: ' + s2.log[1].outcome);
  await turn('브라질을 침공한다');
  let s3 = await page.evaluate(() => window.__game.state);
  ok(!s3.wars.includes('BRA|KOR'), '도달 불가능한 나라는 공격할 수 없다');
  for (let i = 0; i < 6; i++) { await page.click('#btn-pass'); await idle(); }
  const s4 = await page.evaluate(() => window.__game.state);
  ok(s4.turn === 10, `턴 진행: ${s4.turn}`);
  const logText = await page.textContent('#g-log');
  ok(!ENGLISH.test(logText), '연대기에 영어 국가명이 섞이지 않는다');
  await page.click('#btn-undo');
  ok((await page.evaluate(() => window.__game.state.turn)) === 9, '되돌리기');

  // 카드: 플레이 중 다른 나라 클릭 → 관계 표시
  await clickLL(127.0, 40.0);
  card = await page.textContent('#info');
  ok(/나와의 관계/.test(card) || /내가 맡은/.test(card), '플레이 중 나라 카드에 관계 표시: ' + card.replace(/\s+/g, ' ').slice(0, 60));
  await page.click('#btn-insert'); ok((await page.inputValue('#g-cmd')).length > 0, '"명령에 넣기" 동작: ' + (await page.inputValue('#g-cmd')));
  await page.fill('#g-cmd', '');

  // ---- 저장/이어하기 (시작 화면의 이어하기 버튼) ----
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  const contTxt = await page.textContent('#btn-continue');
  ok(/이어하기/.test(contTxt) && /대한민국/.test(contTxt), '이어하기 버튼: ' + contTxt);
  await page.click('#btn-continue'); await page.waitForTimeout(500);
  ok((await page.evaluate(() => window.__game.state.turn)) === 9, '이어하기로 복원');

  // ---- Gemini 모의 ----
  let gemReq = null;
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    gemReq = { url: route.request().url(), key: route.request().headers()['x-goog-api-key'], body: JSON.parse(route.request().postData()) };
    const adj = { interpretation: '대만과 군사 협력', feasibility: 100, reasoning: 't',
      if_success: { narrative: '성공.', headlines: ['테스트'], province_transfers: [{ province: 'NOPE-999', to: 'KOR', kind: 'controller' }, { province: 'TWN-1166', to: 'KOR', kind: 'owner' }],
        relation_changes: [{ a: 'KOR', b: 'TWN', delta: 99 }], stat_changes: [{ country: 'KOR', stat: 'military', delta: 50 }, { country: 'KOR', stat: 'magic', delta: 3 }] },
      if_failure: {}, world_events: { narrative: 'x', headlines: ['<img src=x onerror=alert(1)> 이벤트'] } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(adj) + '\n```' }] } }] }) });
  });
  await page.click('#btn-menu'); await page.click('#overlay label.ai-card[data-ai=gemini]');
  ok(await page.isVisible('#ov-gemini'), '메뉴에서 Gemini 선택 시 키 입력칸 표시');
  await page.fill('#ov-key', 'TEST-KEY'); await page.click('#ov-apply');
  const before = await page.evaluate(() => ({ mil: window.__game.state.stats.KOR.military, rel: window.__game.state.relations['KOR|TWN'] ?? 0 }));
  await turn('대만과 군사 협력을 강화한다');
  const s7 = await page.evaluate(() => window.__game.state); const r7 = s7.log[s7.log.length - 1];
  ok(gemReq && gemReq.key === 'TEST-KEY' && /COMMAND: 대만과 군사 협력/.test(gemReq.body.contents[0].parts[0].text), 'Gemini 요청에 키와 명령/상태 포함');
  ok(r7.mode.startsWith('Gemini') && r7.outcome === 'success', '코드펜스 JSON 응답 파싱');
  ok(r7.rejected.length >= 2, `엔진이 잘못된 제안 거부 ${r7.rejected.length}건`);
  ok(s7.stats.KOR.military === Math.min(100, before.mil + 10) && (s7.relations['KOR|TWN'] ?? 0) === Math.min(100, before.rel + 40), '능력치 ±10, 관계 ±40 제한');
  ok(!(await page.innerHTML('#g-log')).includes('<img'), 'AI 출력 HTML 이스케이프');
  await page.unroute('https://generativelanguage.googleapis.com/**');
  await page.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":{"message":"quota"}}' }));
  const tb = await page.evaluate(() => window.__game.state.turn);
  await page.fill('#g-cmd', '군비를 증강한다'); await page.click('#btn-go'); await idle();
  ok(/한도/.test(await page.textContent('#g-msg')) && (await page.evaluate(() => window.__game.state.turn)) === tb, '429: 턴 소모 없이 안내');

  // ---- Claude (모의 서버) ----
  let claudeReq = null;
  await page.unroute('https://generativelanguage.googleapis.com/**');
  await page.route('https://api.anthropic.com/**', async (route) => {
    const r = route.request(); claudeReq = { h: r.headers(), body: JSON.parse(r.postData()) };
    const adj = { interpretation: 'Claude 판정', feasibility: 100, reasoning: 't', if_success: { narrative: 'Claude 서술', headlines: ['Claude 헤드라인'] }, if_failure: {}, world_events: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(adj) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }) });
  });
  await page.click('#btn-menu'); await page.click('#overlay label.ai-card[data-ai=claude]');
  ok(await page.isVisible('#ov-claude'), '메뉴에서 Claude 선택 시 키 입력칸 표시');
  await page.fill('#ov-ckey', 'sk-ant-TEST'); await page.click('#ov-apply');
  await turn('외교 협상을 한다');
  const r8 = (await page.evaluate(() => window.__game.state)).log.at(-1);
  ok(claudeReq && claudeReq.h['authorization'] === 'Bearer sk-ant-TEST' && claudeReq.h['anthropic-dangerous-direct-browser-access'] === 'true', 'Claude 요청: 사용자 키(Authorization) + 브라우저 직접 호출 헤더');
  ok(claudeReq && claudeReq.body.model === 'claude-opus-5-5' && claudeReq.body.fallbacks === 'default' && /server-side-fallback/.test(claudeReq.h['anthropic-beta'] || ''), 'Claude 요청: 기본 모델 claude-opus-5-5, 거절 시 서버 대체(fallbacks) 사용');
  ok(r8.mode.startsWith('Claude') && r8.narrative.includes('Claude 서술'), 'Claude 응답으로 턴 판정: ' + r8.mode);
  await page.route('https://api.anthropic.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) }));
  const t9 = await page.evaluate(() => window.__game.state.turn);
  await page.fill('#g-cmd', '군비를 증강한다'); await page.click('#btn-go'); await idle();
  ok(/키가 올바르지 않습니다/.test(await page.textContent('#g-msg')) && (await page.evaluate(() => window.__game.state.turn)) === t9, 'Claude 401: 턴 소모 없이 키 안내');

  // ---- Qwen 오류 ----
  await page.click('#btn-menu'); await page.click('#overlay label.ai-card[data-ai=webllm]'); await page.click('#ov-apply');
  await page.fill('#g-cmd', '군비를 늘린다'); await page.click('#btn-go'); await idle();
  ok(/WebGPU|WebLLM/.test(await page.textContent('#g-msg')), 'Qwen 사용 불가 환경의 오류 안내');

  // ---- 내보내기/불러오기, 새 게임 ----
  await page.click('#btn-menu');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ov-export')]);
  const fp = OUT + '/export.json'; await dl.saveAs(fp);
  ok(JSON.parse(require('fs').readFileSync(fp, 'utf8')).playerId === 'KOR', '내보내기');
  await page.setInputFiles('#ov-file', fp); await page.waitForTimeout(600);
  ok(!(await page.isVisible('#overlay')), '불러오기');
  await page.click('#btn-menu'); await page.click('#ov-newgame'); await page.waitForTimeout(300);
  ok((await page.isVisible('#intro')) && !(await page.isVisible('#game')), '새 게임 → 시작 화면으로');
  console.log('콘솔 오류:', errs.filter((e) => !/Failed to load resource/.test(e)).join(' ; ') || '없음');

  // ---- 모바일 ----
  const mp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await mp.goto(URL, { waitUntil: 'load' }); await mp.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  await mp.screenshot({ path: `${OUT}/s5_mobile_intro.png` });
  ok(!(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), '모바일 시작 화면 가로 스크롤 없음');
  await mp.evaluate(() => window.__game.start('JPN'));
  await mp.waitForTimeout(1500); await mp.screenshot({ path: `${OUT}/s6_mobile_play.png` });
  ok(!(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), '모바일 플레이 화면 가로 스크롤 없음');

  console.log(fails ? `\n실패 ${fails}건` : '\n모든 검사 통과');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL(예외)', e); process.exit(1); });
