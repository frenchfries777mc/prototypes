// 군대·장군 / 역사 템플릿 / 시나리오 전환 회귀 테스트. npm run build:single 후 실행.
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/althist-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../althist.html');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 880 } })).newPage();
  await page.addInitScript(() => { try { if (!localStorage.getItem('althist-config-v1')) localStorage.setItem('althist-config-v1', JSON.stringify({ provider: 'gemini', geminiKey: '', geminiModel: 'gemini-flash-latest' })); } catch (e) { /* 무시 */ } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  let lastPaper = { open: false, html: '', text: '' };
  const idle = async () => { await page.waitForFunction(() => !document.getElementById('btn-go').disabled, null, { timeout: 60000 });
    lastPaper = await page.evaluate(() => { const p = document.getElementById('paper'); const open = !!p && !p.hidden; const sh = document.getElementById('paper-sheet'); const r = { open, html: open ? sh.innerHTML : '', text: open ? sh.textContent : '' }; if (open) document.getElementById('paper-close').click(); return r; }); };
  const turn = async (cmd) => { await page.fill('#g-cmd', cmd); await page.click('#btn-go'); await page.waitForTimeout(150); await idle(); };
  const S = () => page.evaluate(() => window.__game.state);
  await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });

  // ---- 역사 템플릿: 기원전 날짜, 턴 길이 ----
  await page.evaluate(() => window.__game.start('ROM', 'punic-264')); await page.waitForTimeout(800);
  ok((await page.textContent('#g-date')).startsWith('기원전 264년 3월'), '기원전 날짜 표시: ' + (await page.textContent('#g-date')).slice(0, 24));
  await page.click('#btn-pass'); await page.waitForTimeout(200); await idle();
  ok((await page.textContent('#g-date')).startsWith('기원전 264년 9월'), '한 턴(6개월) 뒤 기원전 264년 9월');
  const land = await page.evaluate(() => { const w = window.__game.world, bad = {};
    for (const sc of w.scenarios.filter((x) => x.polities && x.owners)) {
      const hit = new Set();
      sc.owners.forEach((o, k) => { const p = sc.polities[o];
        if (p.id.startsWith('R_') || /지역 세력/.test(p.nameKo || '') || (p.neutral && !/ATA/.test(w.provinces[k].owner) && !/무인지/.test(p.nameKo || ''))) hit.add(p.nameKo || p.id); });
      if (hit.size) bad[sc.id] = [...hit].slice(0, 5);
    }
    return bad; });
  ok(Object.keys(land).length === 0, '역사 템플릿 전부 "지역 세력"·주인 없는 땅 없이 실제 나라로 채움 ' + JSON.stringify(land).slice(0, 400));

  // ---- Gemini 모의: 군대 규칙 검증 ----
  await page.evaluate(() => window.__game.start('KOR', 'modern-2026')); await page.waitForTimeout(800);
  const setup = await page.evaluate(() => { const g = window.__game, s = g.state, w = g.world;
    const mine = s.armies.filter((a) => a.owner === 'KOR'); const foe = s.armies.filter((a) => a.owner === 'PRK');
    const i = w.index.get(mine[0].at); const near = w.reach[i].map((j) => w.provinces[j].id).filter((id) => s.controller[id] === 'PRK');
    const far = w.provinces.find((p) => s.controller[p.id] === 'BRA').id; const own2 = w.provinces.filter((p) => s.controller[p.id] === 'KOR').map((p) => p.id);
    return { mine: mine.map((a) => ({ id: a.id, at: a.at, t: a.troops })), foe: foe.map((a) => ({ id: a.id, at: a.at, t: a.troops })), near, far, own2, n: mine.length }; });
  console.log(`   한국 군대 ${setup.n}개, 북한 군대 ${setup.foe.length}개, 접경 북한 주 ${setup.near.length}개`);
  ok(setup.n >= 2 && setup.foe.length >= 1 && setup.near.length >= 1, '모든 나라에 이름 있는 군대와 장군이 자동 배치됨');
  let plan = null;
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }) });
  });
  await page.click('#btn-menu'); await page.click('#overlay label.ai-card[data-ai=gemini]'); await page.fill('#ov-key', 'K'); await page.click('#ov-apply');
  const m0 = setup.mine[0];
  // (a) 전쟁 중이 아닌 나라 땅으로 이동 + 너무 먼 이동 + 군대 없이 점령 → 모두 거부
  plan = { interpretation: 't', feasibility: 100, if_success: { narrative: 'x', army_moves: [{ army: m0.id, to: setup.near[0] }, { army: m0.id, to: setup.far }],
    province_transfers: [{ province: setup.near[0], to: 'KOR', kind: 'controller' }] }, if_failure: {}, world_events: {} };
  await turn('시험 1'); let r = (await S()).log.at(-1);
  ok(r.rejected.some((x) => /통과할 수 없음/.test(x)), '전쟁 중이 아닌 나라 땅으로는 이동 불가: ' + r.rejected[0]);
  ok(r.rejected.some((x) => /점령 거부/.test(x)) && (await S()).controller[setup.near[0]] === 'PRK', '전쟁 선포도, 군대도 없이는 점령 불가');
  // (b) 선전포고 + 방어군 없는 곳으로 이동 → 자동 점령. 이후 군대 신편 3개 중 2개만, 병력 파괴
  const emptyTarget = await page.evaluate((cands) => { const s = window.__game.state; return cands.find((id) => !s.armies.some((a) => a.at === id && a.troops > 0)); }, setup.near);
  const foeA = setup.foe[0];
  plan = { interpretation: 't', feasibility: 100, if_success: { narrative: 'x', declare_war: [{ a: 'KOR', b: 'PRK' }],
    army_moves: emptyTarget ? [{ army: m0.id, to: emptyTarget }] : [],
    army_new: [{ owner: 'KOR', name: '신편 1', troops: 5, at: setup.own2[0] }, { owner: 'KOR', name: '신편 2', troops: 5, at: setup.own2[0] }, { owner: 'KOR', name: '신편 3', troops: 5, at: setup.own2[0] }],
    army_changes: [{ army: foeA.id, troops_delta: -9999, morale_delta: -999, general: 'dead' }] }, if_failure: {}, world_events: {} };
  const before = await S();
  await turn('시험 2'); r = (await S()).log.at(-1); const s2 = await S();
  ok(s2.wars.includes('KOR|PRK'), '선전포고 반영');
  if (emptyTarget) ok(s2.controller[emptyTarget] === 'KOR' && r.notes.some((n) => /점령/.test(n)), '방어군 없는 적 주에 군대가 들어가면 자동 점령: ' + emptyTarget);
  ok(r.rejected.some((x) => /최대 2개/.test(x)) && s2.armies.filter((a) => /^신편/.test(a.name)).length === 2, '신편은 한 번에 최대 2개');
  ok(!s2.armies.some((a) => a.id === foeA.id) && r.notes.some((n) => /궤멸/.test(n)), '병력이 0이 된 군대는 궤멸하고 사라진다');
  ok(s2.armies.length === before.armies.length + 2 - 1, `군대 수 변화: ${before.armies.length} → ${s2.armies.length}`);
  // (c) 이순신: 불패
  await page.evaluate(() => window.__game.start('JOS', 'imjin-1592')); await page.waitForTimeout(900);
  const yi = await page.evaluate(() => { const a = window.__game.state.armies.find((x) => x.general.name === '이순신'); return a && { id: a.id, trait: a.general.trait, skill: a.general.skill, navy: a.navy }; });
  ok(yi && yi.skill === 10 && yi.navy && yi.trait.includes('불패'), '이순신: 능력 10, 함대, 불패 특성');
  plan = { interpretation: 't', feasibility: 100, if_success: { narrative: 'x', army_changes: [{ army: yi.id, troops_delta: -1, general: 'dead' }] }, if_failure: {}, world_events: {} };
  await page.click('#btn-menu'); await page.click('#overlay label.ai-card[data-ai=gemini]'); await page.fill('#ov-key', 'K'); await page.click('#ov-apply');
  await turn('시험 3'); r = (await S()).log.at(-1);
  const yi2 = await page.evaluate((id) => { const a = window.__game.state.armies.find((x) => x.id === id); return a && a.general.name; }, yi.id);
  ok(yi2 === '이순신' && r.notes.some((n) => /불패/.test(n)), '불패의 장군은 전사 제안이 와도 쓰러지지 않는다');
  // (d) 군대 탭 UI + 지도 마커
  ok((await page.locator('.g-tabs').count()) === 0 && (await page.locator('#g-army .ac').count()) >= 5 && (await page.textContent('#g-army')).includes('이순신'), '탭 없이 명령 영역에 군대 목록');
  ok((await page.locator('.army-mk.mine').count()) >= 5 && (await page.locator('.army-mk.enemy').count()) >= 1, '지도에 내 군대/적 군대 마커');
  await page.click('#g-army .ac:has-text("이순신") .ac-h'); await page.click('#g-army .ac.focus button[data-act=cmd]');
  ok((await page.inputValue('#g-cmd')).includes('이순신'), '"명령에 넣기"가 장군 이름을 넣는다');

  // ---- 시나리오 전환 후에도 현대 소유 상태가 오염되지 않는다 ----
  await page.click('#btn-menu'); await page.click('#ov-newgame'); await page.waitForTimeout(300);
  await page.click('.tpl[data-id="modern-2026"]'); await page.click('#btn-to-ai'); await page.click('#btn-next'); await page.waitForTimeout(1200);
  const own = await page.evaluate(() => { const w = window.__game.world; const o = w.initialOwners(); return { crimea: o['RUS-283'], taiwan: o['TWN-1166'], pak: o['PAK-1111'], n: Object.keys(o).length }; });
  ok(own.crimea === 'UKR' && own.taiwan === 'TWN' && own.pak === 'PAK', `역사 템플릿을 본 뒤에도 현대 소유 정책 유지 (크림 ${own.crimea}, 대만 ${own.taiwan}, 길기트 ${own.pak})`);

  console.log('콘솔 오류:', errs.filter((e) => !/Failed to load resource/.test(e)).join(' ; ') || '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n모든 검사 통과');
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL(예외)', e); process.exit(1); });
