// 신문 화면, 난이도, 명령(군대+일반) 통합 UI 검사
const { chromium } = require('playwright');
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { try { if (!localStorage.getItem('althist-config-v1')) localStorage.setItem('althist-config-v1', JSON.stringify({ provider: 'gemini', geminiKey: 'K', geminiModel: 'gemini-flash-latest' })); } catch (e) { /* 무시 */ } });
  let adj = null, reqs = [];
  await page.route('https://generativelanguage.googleapis.com/**', (r) => { reqs.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(adj) }] } }] }) }); });
  const mk = (o) => ({ interpretation: '한국이 일본과 협정을 추진한다', feasibility: 100, reasoning: '양국 관계가 나쁘지 않다',
    if_success: { narrative: '서울과 도쿄는 반도체 소재와 물류, 해상 안보에 관한 포괄 협력 협정에 서명했다. 양국 기업의 투자가 늘고 무역이 활기를 띠었다.', headlines: ['한일 포괄 협력 협정 체결', '소재 수출 규제 해제'],
      relation_changes: [{ a: 'KOR', b: 'JPN', delta: 12 }], stat_changes: [{ country: 'KOR', stat: 'economy', delta: 4 }, { country: 'KOR', stat: 'influence', delta: 3 }, { country: 'KOR', stat: 'stability', delta: -2 }] },
    if_failure: { narrative: '협상은 결렬되었다.', headlines: ['협상 결렬'] },
    world_events: { narrative: '북한이 동해상으로 단거리 미사일을 시험발사했다.', headlines: ['북한 미사일 발사'], relation_changes: [{ a: 'PRK', b: 'KOR', delta: -8 }] }, ...o });
  adj = mk({});
  const S = () => page.evaluate(() => window.__game.state);
  const waitIdle = () => page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 60000 });
  const settle = () => page.evaluate(() => new Promise((r) => { const m = window.__map; m.once('idle', r); m.triggerRepaint(); setTimeout(r, 6000); }));

  await page.goto(URL); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });

  // ---- 난이도 선택(시작 화면의 AI 단계) ----
  await page.click('.tpl[data-id="modern-2026"]'); await page.click('#btn-to-ai');
  ok((await page.locator('#intro-ai .diff-card').count()) === 4 && (await page.inputValue('#intro-ai input[name=in-diff]:checked')) === 'normal', 'AI 선택 단계에 난이도 4종, 기본은 보통');
  ok((await page.textContent('#intro-ai .ai-diff')).includes('지옥') && /AI와 난이도 선택/.test(await page.textContent('#intro h2:has-text("AI")')), '난이도 이름과 단계 제목');
  await page.click('#intro-ai label.diff-card[data-d=brutal]');
  ok((await page.getAttribute('#intro-ai label.diff-card[data-d=brutal]', 'class')).includes('on'), '난이도 카드 선택 표시');
  await page.click('#btn-next'); await page.waitForTimeout(600);
  await page.evaluate(() => window.__game.start('KOR', 'modern-2026')); await page.waitForTimeout(700);
  ok((await S()).difficulty === 'brutal', '고른 난이도(지옥)가 게임에 저장됨');

  // ---- 명령 영역: 탭 없이 군대와 일반 명령이 한 곳에 ----
  ok((await page.locator('.g-tabs, #g-log').count()) === 0 && (await page.locator('#g-army .ac').count()) >= 2 && (await page.locator('#g-cmd').count()) === 1, '탭 없음: 군대 목록과 명령창이 한 영역');
  await page.click('#g-army .ac .ac-h'); await page.waitForTimeout(100);
  ok((await page.locator('#g-army .ac.focus button[data-act=mv]').count()) === 1 && (await page.locator('#g-army .ac.focus button[data-act=atk]').count()) === 1, '군대를 고르면 이동·공격·방어 버튼이 나타남');
  await page.click('#g-army .ac.focus button[data-act=mv]');
  ok(/○○/.test(await page.inputValue('#g-cmd')) && /이동시킨다/.test(await page.inputValue('#g-cmd')), '목표 없이 누르면 ○○로 문장을 만들고 안내: ' + (await page.inputValue('#g-cmd')));
  await page.fill('#g-cmd', '');
  await page.evaluate(() => window.__map.jumpTo({ center: [127.0, 37.5], zoom: 5 })); await settle();
  const px = await page.evaluate(() => { const p = window.__map.project([128.6, 35.2]); return [p.x, p.y]; }); await page.mouse.click(px[0], px[1]); await page.waitForTimeout(300);
  const prov = await page.evaluate(() => document.querySelector('#info .prov b')?.textContent ?? '');
  await page.click('#g-army .ac.focus button[data-act=atk]');
  const sent = await page.inputValue('#g-cmd');
  ok(prov && sent.includes(prov) && /공격해 점령한다/.test(sent) && !sent.includes('○○'), `지도에서 고른 주(${prov})가 군대 명령 문장에 들어감: ${sent}`);
  await page.click('#g-army button[data-act=levy]');
  ok((await page.inputValue('#g-cmd')).includes(' / 군대를 신편한다'), '여러 명령은 " / "로 이어 붙음');
  await page.fill('#g-cmd', '');

  // ---- 난이도가 판정에 들어감 ----
  adj = mk({ feasibility: 70 });
  await page.fill('#g-cmd', '일본과 협정을 추진한다'); await page.click('#btn-go'); await page.waitForSelector('#paper:not([hidden])'); await waitIdle();
  let rec = (await S()).log.at(-1);
  ok(rec.base === 70 && rec.feasibility === 53 && rec.difficulty === 'brutal', `지옥: AI 확률 70% → 53%로 보정 (${rec.base} → ${rec.feasibility})`);
  ok(reqs.at(-1).contents[0].parts[0].text.includes('DIFFICULTY: BRUTAL'), 'AI 요청에 난이도 지침이 들어감');
  const hardTxt = await page.textContent('.np-odds-txt');
  ok(/AI 판단 70%/.test(hardTxt) && /지옥/.test(hardTxt), '신문에 보정 내역 표시: ' + hardTxt.replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');

  // 메뉴에서 난이도를 바꾸면 이어서 적용
  await page.click('#btn-menu'); await page.click('#overlay label.diff-card[data-d=easy]'); await page.click('#ov-apply');
  ok((await S()).difficulty === 'easy', '메뉴에서 난이도 변경(쉬움)');
  adj = mk({ feasibility: 70 }); reqs = [];
  await page.fill('#g-cmd', '다시 추진한다'); await page.click('#btn-go'); await page.waitForSelector('#paper:not([hidden])'); await waitIdle();
  rec = (await S()).log.at(-1);
  ok(rec.base === 70 && rec.feasibility === 81 && !reqs.at(-1).contents[0].parts[0].text.includes('DIFFICULTY: BRUTAL') && reqs.at(-1).contents[0].parts[0].text.includes('DIFFICULTY: EASY'), `쉬움: 70% → 81% (${rec.feasibility}) 그리고 지침도 바뀜`);
  await page.keyboard.press('Escape');

  // 쉬움 + 확실한 성공: 이득은 크게(×1.5), 손실은 작게(×0.6)
  adj = mk({ feasibility: 100 }); const b0 = (await S()).stats.KOR;
  await page.fill('#g-cmd', '확실한 일'); await page.click('#btn-go'); await page.waitForSelector('#paper:not([hidden])'); await waitIdle();
  const s1 = await S(), r1 = s1.log.at(-1);
  ok(r1.outcome === 'success' && r1.report.stats.economy[1] - r1.report.stats.economy[0] === 6 && r1.report.stats.influence[1] - r1.report.stats.influence[0] === 5 && r1.report.stats.stability[1] - r1.report.stats.stability[0] === -1, '쉬움: 능력치 +4→+6, +3→+5(반올림), -2→-1');
  ok(s1.stats.KOR.economy === Math.min(100, b0.economy + 6), '배율이 실제 능력치에 반영');

  // ---- 신문 내용 ----
  const sheet = await page.textContent('#paper-sheet'), html = await page.innerHTML('#paper-sheet');
  ok(/대한민국 일보/.test(await page.textContent('.np-name')) && (await page.textContent('.np-hl')) === '한일 포괄 협력 협정 체결', '큰 제호와 대표 제목');
  ok((await page.locator('.np-stats tr').count()) === 4 && /국정 지표/.test(sheet) && /영토/.test(sheet) && /세계 소식/.test(sheet) && /북한 미사일 발사/.test(sheet), '국정 지표 4줄, 영토, 세계 소식 기사');
  ok(/성 공/.test(await page.textContent('.np-stamp')) && (await page.locator('.np-odds-bar').count()) === 1 && /외교·관계/.test(sheet) && /편집부 분석/.test(sheet), '성패 도장, 확률 막대, 외교·관계, 편집부 분석');
  ok(html.includes('np-body long'), '긴 기사는 2단 조판');
  ok((await page.textContent('#g-latest')) !== '아직 발행된 신문이 없습니다', '패널의 신문 띠에 최신 제목');
  await page.keyboard.press('Escape'); ok(await page.isHidden('#paper'), 'Esc로 신문 닫기');
  ok((await page.textContent('#g-latest')) === '한일 포괄 협력 협정 체결', '신문 띠 제목: ' + await page.textContent('#g-latest'));

  // ---- 명령 없이 넘기기 / 이전·다음 호 / 보관함 ----
  await page.click('#btn-pass'); await page.waitForSelector('#paper:not([hidden])'); await waitIdle();
  ok(/명령 없음|이번 달/.test(await page.textContent('.np-order')) && (await page.locator('.np-stamp').count()) === 0, '명령 없는 호: 도장 없이 "특별한 명령 없음"');
  const n = (await S()).log.length;
  ok((await page.textContent('#paper-pos')) === `${n} / ${n}호` && await page.isDisabled('#paper-next'), `호수 표시와 마지막 호에서 다음 호 비활성: ${await page.textContent('#paper-pos')}`);
  await page.click('#paper-prev'); ok((await page.textContent('#paper-pos')) === `${n - 1} / ${n}호` && /제 3호|제 \d+호/.test(await page.textContent('.np-top')), '이전 호로 넘어감');
  await page.keyboard.press('ArrowRight'); ok((await page.textContent('#paper-pos')) === `${n} / ${n}호`, '방향키로 다음 호');
  await page.click('#paper-close');
  await page.click('#btn-archive');
  ok((await page.locator('#archive-list .arch-row').count()) === n && /제 \d+호/.test(await page.textContent('#archive-list .arch-row')), `지난 신문 보관함: ${n}개 호`);
  await page.click('#archive-list .arch-row:last-child'); await page.waitForSelector('#paper:not([hidden])');
  ok((await page.textContent('#paper-pos')).startsWith('1 /'), '보관함에서 첫 호를 열면 1호');
  await page.click('#paper-close');

  // ---- 자동 펼치기 끄기 ----
  await page.click('#btn-paper'); await page.uncheck('#paper-auto'); await page.click('#paper-close');
  await page.fill('#g-cmd', '조용히 지낸다'); await page.click('#btn-go'); await waitIdle(); await page.waitForTimeout(300);
  ok(await page.isHidden('#paper') && (await page.textContent('#g-latest')).length > 0, '자동 펼치기를 끄면 턴이 끝나도 신문이 뜨지 않고 띠만 갱신');
  await page.click('#btn-paper'); await page.check('#paper-auto'); await page.click('#paper-close');

  // ---- HTML 이스케이프, 서술이 비어도 신문이 비지 않음 ----
  adj = mk({ if_success: { narrative: '', headlines: ['<img src=x onerror=alert(1)>'] }, world_events: { narrative: '<script>alert(1)</script>', headlines: [] } });
  await page.fill('#g-cmd', '시험'); await page.click('#btn-go'); await page.waitForSelector('#paper:not([hidden])'); await waitIdle();
  const h2 = await page.innerHTML('#paper-sheet');
  ok(!h2.includes('<img') && !h2.includes('<script') && h2.includes('&lt;img'), 'AI가 보낸 HTML은 신문에서도 이스케이프');
  ok(/뜻대로|성공했다/.test(await page.textContent('.np-body')), '서술이 비면 해석·이유로 채워 기사가 비지 않음');
  await page.click('#paper-close');

  // ---- 저장 후 불러와도 난이도 유지 ----
  await page.reload(); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  await page.click('#btn-continue'); await page.waitForTimeout(500);
  ok((await S()).difficulty === 'easy', '저장·이어하기 후에도 난이도 유지');
  await page.click('#btn-menu'); ok((await page.inputValue('#ov-ai input[name=ov-diff]:checked')) === 'easy', '메뉴를 열면 현재 난이도가 선택되어 있음');

  console.log('페이지 오류:', errs.length ? errs.join(' ; ') : '없음'); if (errs.length) fail++;
  await browser.close(); console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
