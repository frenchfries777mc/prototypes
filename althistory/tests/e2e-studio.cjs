const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/althist-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 880 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const settle = async () => { await page.evaluate(() => new Promise((r) => { const m = window.__map; m.once('idle', r); m.triggerRepaint(); setTimeout(r, 8000); })); await page.waitForTimeout(400); };
  await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });

  ok(await page.isVisible('#btn-studio'), '시작 화면에 스튜디오/불러오기/갤러리 버튼');
  await page.click('#btn-studio'); await page.waitForTimeout(600);
  ok((await page.isVisible('#studio')) && (await page.evaluate(() => window.__game.phase)) === 'studio', '스튜디오 화면으로 전환');

  // 기본 정보 입력
  await page.click('summary:has-text("2. 기본 정보")'); await page.waitForTimeout(100);
  await page.fill('[data-f=name]:not([data-p])', '한반도 삼국 가상');
  await page.fill('[data-f=tagline]', '세 나라가 한반도를 나눠 갖는다');
  await page.fill('[data-f=startYear]', '1900');
  // 국가 이름 바꾸기(첫 두 개) + 추가
  await page.fill('input.pn[data-p="0"]', '북국'); await page.dispatchEvent('input.pn[data-p="0"]', 'change');
  await page.fill('input.pn[data-p="1"]', '남국'); await page.dispatchEvent('input.pn[data-p="1"]', 'change');
  await page.click('button[data-act=add-pol]');
  ok((await page.locator('input.pn').count()) === 3, '국가 3개');

  // 지도에서 칠하기: 현대 국가 전체 도구로 북한→북국, 한국→남국
  await page.evaluate(() => window.__map.jumpTo({ center: [127.5, 37.5], zoom: 5.2, padding: { left: 420 } })); await settle();
  const clickLL = async (lon, lat) => { const px = await page.evaluate(([x, y]) => { const p = window.__map.project([x, y]); return [p.x, p.y]; }, [lon, lat]); await page.mouse.click(px[0], px[1]); await page.waitForTimeout(200); };
  await page.check('input[name=tool][value=country]');
  await page.check('input[name=brush][value="0"]'); await clickLL(127.0, 39.5);   // 북한
  await page.check('input[name=brush][value="1"]'); await clickLL(127.8, 36.8);   // 한국
  await page.waitForTimeout(700); await settle();
  const cnt = await page.evaluate(() => [...document.querySelectorAll('[data-count]')].map((e) => e.textContent));
  console.log('   영토 수:', cnt.join(', '));
  ok(parseInt(cnt[0]) >= 8 && parseInt(cnt[1]) >= 15, '현대 국가 전체 칠하기로 북국/남국 영토 생성');
  await page.screenshot({ path: `${OUT}/st1_paint.png` });
  // 주 하나만 세 번째 나라로
  await page.check('input[name=tool][value=province]'); await page.check('input[name=brush][value="2"]'); await clickLL(126.6, 33.4); // 제주
  await page.waitForTimeout(300);
  ok(parseInt(await page.locator('[data-count="2"]').textContent()) === 1, '주 하나씩 칠하기(제주 → 세 번째 나라)');

  // 군대 추가
  await page.click('summary:has-text("5. 군대와 장군")').catch(() => {});
  await page.click('button[data-act=add-army]');
  await page.fill('[data-a="0"][data-f=n]', '북국 정예군'); await page.fill('[data-a="0"][data-f=g]', '을지 장군');
  await page.fill('[data-a="0"][data-f=skill]', '9');
  await page.selectOption('[data-a="0"][data-f=c]', '0'.length ? await page.evaluate(() => document.querySelector('[data-a="0"][data-f=c] option').value) : '');
  await page.click('button[data-act=pick-army]'); await clickLL(126.0, 38.8);
  ok((await page.textContent('#studio')).includes('황해') || (await page.locator('.arow .hint').first().textContent()).length > 0, '군대 위치 지정');
  ok((await page.locator('.army-mk').count()) >= 1, '스튜디오 지도에 군대 마커 표시');

  // 검증 & 저장
  await page.click('summary:has-text("6. 검증")').catch(() => {});
  await page.click('button[data-act=check]'); await page.waitForTimeout(200);
  const msg = await page.textContent('#s-msg'); console.log('   검증 메시지:', msg.slice(0, 120));
  ok(/검증 통과/.test(msg), '검증 통과');
  await page.click('button[data-act=save]'); await page.waitForTimeout(300);
  ok(/저장했습니다/.test(await page.textContent('#s-msg')), '내 템플릿에 저장');

  // 테스트 플레이
  await page.click('button[data-act=test]'); await page.waitForTimeout(1500);
  const st = await page.evaluate(() => { const s = window.__game.state; return s && { pid: s.playerId, n: Object.keys(s.stats).length, armies: s.armies.length, sc: s.scenarioId, d: document.getElementById('g-date').textContent }; });
  console.log('   테스트 플레이:', JSON.stringify(st));
  ok(st && st.sc === '__draft__' && st.n === 3 && st.armies >= 3, '테스트 플레이 시작(국가 3개, 군대 자동+수동 생성)');
  await page.click('#btn-menu'); ok(await page.isVisible('#ov-studio'), '메뉴에 "스튜디오로 돌아가기"');
  await page.click('#ov-studio'); await page.waitForTimeout(600);
  ok((await page.evaluate(() => window.__game.phase)) === 'studio', '테스트 후 스튜디오로 복귀');

  // 공유 (GitHub API 모의)
  const calls = [];
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request(); const url = req.url(); calls.push(`${req.method()} ${url.replace('https://api.github.com/repos/', '')}`);
    if (req.method() === 'GET') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const body = JSON.parse(req.postData()); calls.push('auth=' + req.headers()['authorization']);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ content: { html_url: 'https://github.com/x/y/blob/main/f.json', sha: 'abc' }, _len: body.content.length }) });
  });
  await page.click('summary:has-text("공유 갤러리에 올리기")').catch(() => {});
  await page.fill('#s-tok', 'ghp_TESTTOKEN'); await page.click('button[data-act=share]'); await page.waitForTimeout(800);
  const sm = await page.textContent('#s-msg'); console.log('   공유 결과:', sm.slice(0, 100)); console.log('   API 호출:', calls.join(' | ').slice(0, 400));
  ok(/공유 완료/.test(sm), '공유 업로드 성공 메시지');
  ok(calls.some((c) => c.startsWith('PUT') && /shared-templates\/my-.*\.json/.test(c)) && calls.some((c) => /index\.json/.test(c)) && calls.some((c) => c === 'auth=Bearer ghp_TESTTOKEN'), '템플릿 파일 + index.json 을 토큰으로 업로드');
  ok((await page.inputValue('#s-tok')) === '', '업로드 후 토큰 입력칸이 비워짐');
  ok(!(await page.evaluate(() => JSON.stringify(localStorage)).then((t) => t.includes('ghp_TESTTOKEN'))), '토큰이 localStorage 에 저장되지 않음');
  await page.screenshot({ path: `${OUT}/st2_studio.png` });

  // 스튜디오 나가기 → 템플릿 목록에 내 템플릿
  await page.click('button[data-act=exit]'); await page.waitForTimeout(400);
  ok(await page.locator('.tpl:has-text("한반도 삼국 가상")').count() === 1, '시작 화면 템플릿 목록에 내 템플릿 표시');
  await page.click('.tpl:has-text("한반도 삼국 가상")');
  ok(await page.isVisible('#tpl-actions'), '내 템플릿 선택 시 편집/내보내기/공유/삭제 줄 표시');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#tpl-actions button[data-act=export]')]);
  const fp = OUT + '/my-template.json'; await dl.saveAs(fp);
  const exp = JSON.parse(require('fs').readFileSync(fp, 'utf8'));
  ok(exp.schema === 1 && exp.owners.length === (await page.evaluate(() => window.__game.world.provinces.length)) && exp.polities.length === 4 && exp.armies.length >= 1, `내보낸 템플릿 JSON (국가 ${exp.polities.length}, 영토 ${exp.owners.length}, 군대 ${exp.armies.length})`);
  await page.screenshot({ path: `${OUT}/st3_intro_custom.png` });

  // 새로고침 후에도 유지 + 삭제 + 파일로 다시 불러오기
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  ok(await page.locator('.tpl:has-text("한반도 삼국 가상")').count() === 1, '새로고침 후에도 내 템플릿 유지');
  await page.click('.tpl:has-text("한반도 삼국 가상")'); await page.click('#tpl-actions button[data-act=del]'); await page.waitForTimeout(300);
  ok(await page.locator('.tpl:has-text("한반도 삼국 가상")').count() === 0, '삭제');
  await page.setInputFiles('#tpl-file', fp); await page.waitForTimeout(600);
  ok(await page.locator('.tpl:has-text("한반도 삼국 가상")').count() === 1, '내보낸 파일을 다시 불러오기');

  // 잘못된/악성 템플릿 거부
  const bad = await page.evaluate(() => { const g = window.__game; const r = g.world; return [
    JSON.stringify(g.importRaw({ id: 'x', name: 'bad', startDate: 'abc', polities: [], owners: [] })),
    JSON.stringify(g.importRaw({ id: 'ok2', name: '<img src=x onerror=alert(1)>', startDate: '1900-01-01', polities: [{ id: 'AA', name: 'A', color: 'red;background:url(x)', stats: { stability: 999 } }, { id: 'BB', name: 'B', color: '#112233' }], owners: new Array(r.provinces.length).fill(0), bonuses: [{ country: 'AA', words: ['(a+)+$'], bonus: 99 }] })),
  ]; });
  ok(bad[0] === 'null', '형식이 틀린 템플릿은 거부됨');
  const safe = await page.evaluate(() => { const sc = window.__game.world.scenarios.find((s) => s.id === 'ok2'); return sc && { color: sc.polities[0].color, stab: sc.polities[0].stats.stability, bonus: sc.bonuses[0].bonus, name: sc.name }; });
  ok(safe && safe.color === '#8a93a3' && safe.stab === 100 && safe.bonus === 50, `외부 템플릿 값 정화: 색 ${safe && safe.color}, 능력치 ${safe && safe.stab}, 보정 ${safe && safe.bonus}`);
  await page.click('.tpl-filter button[data-era="사용자"]'); const html = await page.innerHTML('#tpl-grid'); ok(!html.includes('<img src=x') && html.includes('&lt;img src=x onerror=alert(1)&gt;'), '템플릿 이름의 HTML은 이스케이프됨'); await page.click('.tpl-filter button[data-era="전체"]');

  // 갤러리: 목록 + 불러오기 (GitHub raw 모의)
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const u = route.request().url();
    if (u.endsWith('index.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'shared1', name: '공유 샘플', author: '누군가', description: '샘플', era: '사용자', year: '1900년', file: 'shared1.json' }]) });
    if (u.endsWith('shared1.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: require('fs').readFileSync(fp, 'utf8').replace(/my-[a-z0-9]+/, 'shared1').replace('한반도 삼국 가상', '공유 샘플') });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.click('#btn-gallery'); await page.waitForTimeout(800);
  ok((await page.textContent('#g-list')).includes('공유 샘플'), '갤러리 목록 표시');
  await page.click('#g-list button[data-file]'); await page.waitForTimeout(600);
  ok(await page.locator('.tpl:has-text("공유 샘플")').count() === 1, '갤러리에서 템플릿 불러오기');

  // 불러온 커스텀 템플릿으로 실제 플레이
  await page.evaluate(() => window.__game.start('C1', 'ok2')).catch(() => {});
  console.log('콘솔 오류:', errs.filter((e) => !/Failed to load resource|404/.test(e)).join(' ; ') || '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n모든 검사 통과');
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL(예외)', e); process.exit(1); });
