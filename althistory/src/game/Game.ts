import type { CountryId, ProvinceId, Scenario, StatKey, Stats, WorldData } from '../data/types';
import { STAT_KEYS, STAT_LABEL } from '../data/types';
import { World } from '../data/world';
import { resolveTurn } from '../engine/turn';
import type { GameState } from '../engine/state';
import type { Army } from '../engine/state';
import { armiesOf, cloneState, controlledBy, fmtDate, getRel, isAlive, isAtWar, newGame, ownedBy, totalTroops, warsOf } from '../engine/state';
import { buildArmies, reachWithin } from '../engine/armies';
import { DEFAULT_CLAUDE_MODEL, LlmError, adjudicate, providerLabel, testClaude, testGemini } from '../llm/providers';
import { Thumbs } from '../ui/thumbs';
import type { LlmConfig, ProviderId } from '../llm/providers';
import { MapView } from '../map/MapView';
import type { ArmyMarker } from '../map/MapView';
import { P } from '../util/josa';
import { sanitizeScenario, templateToJson } from '../data/template';
import { Studio } from '../studio/Studio';
import { DEFAULT_SHARE, ShareError, fetchIndex, fetchTemplateFile } from '../studio/share';
import type { ShareConfig } from '../studio/share';

const CFG_KEY = 'althist-config-v1';
const SAVE_KEY = 'althist-save-v1';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

function loadJson<T>(key: string): T | null {
  try { const t = localStorage.getItem(key); return t ? (JSON.parse(t) as T) : null; } catch { return null; }
}
function saveJson(key: string, v: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}
const fmtPop = (n: number): string => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만` : `${n.toLocaleString()}`);

const ERA_ORDER = ['사용자', '고대', '중세', '근세', '근대', '현대'];

export interface GameOptions { workerUrl: string; data: WorldData; onStatus: (msg: string, isError?: boolean) => void }

type Phase = 'intro' | 'pick' | 'play' | 'studio';

export async function startApp(opts: GameOptions) {
  const world = new World(opts.data);
  const builtinIds = new Set(world.scenarios.map((x) => x.id));
  {
    // 내 템플릿(localStorage): 저장된 값도 외부 입력처럼 다시 검증한다
    const stored = loadJson<unknown[]>('althist-templates-v1') ?? [];
    const ok: Scenario[] = [];
    for (const raw of Array.isArray(stored) ? stored : []) {
      const r = sanitizeScenario(raw, world, new Set([...builtinIds, ...ok.map((x) => x.id)]));
      if (r.ok && !builtinIds.has(r.value.id)) ok.push(r.value);
    }
    world.scenarios = [...world.scenarios, ...ok];
  }
  const view = await MapView.create({ container: 'map', workerUrl: opts.workerUrl, data: opts.data });

  let cfg: LlmConfig = { provider: 'gemini', geminiKey: '', geminiModel: 'gemini-flash-latest', claudeKey: '', claudeModel: DEFAULT_CLAUDE_MODEL, webllmModel: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', ...(loadJson<Partial<LlmConfig>>(CFG_KEY) ?? {}) };
  if (cfg.provider === 'local') cfg.provider = 'gemini'; // 예전 "규칙 모드" 설정은 AI 선택으로 옮긴다
  const thumbs = new Thumbs(world, view.geometries());
  let eraFilter = '전체';
  let phase: Phase = 'intro';
  let state: GameState | null = null;
  let undoSnap: string | null = null;
  let lastDelta: Record<string, number> = {};
  let busy = false;
  let templateId = world.scenarios[0].id;
  let selCountry: CountryId | null = null;
  let selProv: ProvinceId | null = null;
  let fromStudio = false;
  let tab: 'log' | 'army' = 'log';
  let focusArmy: string | null = null;

  const applyPadding = () => {
    const wide = window.innerWidth > 900;
    view.padding = wide
      ? { top: 40, bottom: 40, left: phase === 'studio' ? 420 : 340, right: phase === 'play' ? 430 : 40 }
      : { top: 20, bottom: phase === 'play' ? Math.round(window.innerHeight * 0.6) : 20, left: 20, right: 20 };
  };

  // ---------- AI 선택 (시작 화면과 메뉴에서 같은 모양을 재사용) ----------
  const AIS: { id: ProviderId; name: string; maker: string; desc: string }[] = [
    { id: 'gemini', name: 'Gemini', maker: 'Google', desc: '무료 API 키로 시작' },
    { id: 'claude', name: 'Claude', maker: 'Anthropic', desc: 'API 키 · 유료(턴마다 과금)' },
    { id: 'webllm', name: 'Qwen', maker: '내 브라우저에서 실행', desc: '키 없음 · WebGPU 필요(실험적)' },
  ];
  function mountAi(container: HTMLElement, p: string) {
    container.innerHTML = `<div class="ai-cards">${AIS.map((a) => `<label class="ai-card" data-ai="${a.id}"><input type="radio" name="${p}-prov" value="${a.id}" />
        <span class="ai-logo ai-${a.id}">${a.name[0]}</span><span class="ai-txt"><b>${a.name}</b><span>${a.maker}</span><small>${a.desc}</small></span></label>`).join('')}</div>
      <div class="ai-key" id="${p}-gemini">
        <label for="${p}-key">Gemini API 키 · <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">무료 발급</a></label>
        <div class="row"><input id="${p}-key" type="password" placeholder="AIza…" autocomplete="off" /><input id="${p}-model" class="model" placeholder="gemini-flash-latest" title="모델" /><button type="button" id="${p}-test" class="ghost small">키 확인</button></div>
      </div>
      <div class="ai-key" id="${p}-claude">
        <label for="${p}-ckey">Claude API 키 · <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">발급</a> <span class="hint">(Claude 구독과 별도로 API 사용량만큼 과금)</span></label>
        <div class="row"><input id="${p}-ckey" type="password" placeholder="sk-ant-…" autocomplete="off" /><input id="${p}-cmodel" class="model" placeholder="${DEFAULT_CLAUDE_MODEL}" title="모델" /><button type="button" id="${p}-ctest" class="ghost small">키 확인</button></div>
      </div>
      <div class="ai-key" id="${p}-webllm">
        <label for="${p}-wmodel">Qwen 모델 (처음 한 번 수백 MB~수 GB 내려받음)</label>
        <input id="${p}-wmodel" placeholder="Qwen2.5-3B-Instruct-q4f16_1-MLC" />
      </div>
      <div class="ai-note" id="${p}-note"></div>`;
    const sync = () => {
      const v = (container.querySelector(`input[name=${p}-prov]:checked`) as HTMLInputElement | null)?.value;
      container.querySelectorAll<HTMLElement>('.ai-card').forEach((el) => el.classList.toggle('on', el.dataset.ai === v));
      $(`${p}-gemini`).hidden = v !== 'gemini'; $(`${p}-claude`).hidden = v !== 'claude'; $(`${p}-webllm`).hidden = v !== 'webllm';
      const keyless = (v === 'gemini' && !$<HTMLInputElement>(`${p}-key`).value.trim()) || (v === 'claude' && !$<HTMLInputElement>(`${p}-ckey`).value.trim());
      $(`${p}-note`).textContent = keyless ? '키를 넣기 전에는 AI 대신 간이 판정으로 진행됩니다. 키는 이 기기에만 저장되고 그 AI 서비스로만 보내집니다.' : '키는 이 기기에만 저장되고 그 AI 서비스로만 보내집니다.';
    };
    container.querySelectorAll(`input[name=${p}-prov]`).forEach((r) => r.addEventListener('change', sync));
    container.addEventListener('input', sync);
    const read = () => {
      const v = (container.querySelector(`input[name=${p}-prov]:checked`) as HTMLInputElement | null)?.value as ProviderId | undefined;
      cfg = {
        provider: v ?? 'gemini',
        geminiKey: $<HTMLInputElement>(`${p}-key`).value.trim(), geminiModel: $<HTMLInputElement>(`${p}-model`).value.trim() || 'gemini-flash-latest',
        claudeKey: $<HTMLInputElement>(`${p}-ckey`).value.trim(), claudeModel: $<HTMLInputElement>(`${p}-cmodel`).value.trim() || DEFAULT_CLAUDE_MODEL,
        webllmModel: $<HTMLInputElement>(`${p}-wmodel`).value.trim() || 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
      };
      saveJson(CFG_KEY, cfg);
    };
    const write = () => {
      (container.querySelector(`input[name=${p}-prov][value=${cfg.provider === 'local' ? 'gemini' : cfg.provider}]`) as HTMLInputElement).checked = true;
      $<HTMLInputElement>(`${p}-key`).value = cfg.geminiKey; $<HTMLInputElement>(`${p}-model`).value = cfg.geminiModel;
      $<HTMLInputElement>(`${p}-ckey`).value = cfg.claudeKey; $<HTMLInputElement>(`${p}-cmodel`).value = cfg.claudeModel;
      $<HTMLInputElement>(`${p}-wmodel`).value = cfg.webllmModel;
      sync();
    };
    const test = (btn: string, fn: (c: LlmConfig) => Promise<string>) => $(btn).addEventListener('click', async () => {
      read(); const out = $(`${p}-note`); out.textContent = '키 확인 중…';
      try { await fn(cfg); out.textContent = '✔ 키가 동작합니다.'; } catch (e) { out.textContent = `✖ ${(e as Error).message}`; }
    });
    test(`${p}-test`, testGemini); test(`${p}-ctest`, testClaude);
    write();
    return { read, write };
  }
  const aiIntro = mountAi($('intro-ai'), 'in');
  const aiMenu = mountAi($('ov-ai'), 'ov');

  // ---------- 화면 단계 ----------
  function setPhase(p: Phase) {
    phase = p;
    document.body.classList.remove('phase-intro', 'phase-pick', 'phase-play', 'phase-studio');
    document.body.classList.add(`phase-${p}`);
    $('intro').hidden = p !== 'intro';
    $('panel').hidden = p === 'intro' || p === 'studio';
    $('studio').hidden = p !== 'studio';
    $('game').hidden = p !== 'play';
    $('p-hint').hidden = p !== 'pick';
    $('btn-back').hidden = p !== 'pick';
    document.body.classList.toggle('playing', p === 'play');
    applyPadding();
    if (p !== 'intro') window.requestAnimationFrame(() => view.map.resize());
  }

  // ---------- 1단계: 템플릿 ----------
  const nationsOf = (sc: Scenario, n: number): { name: string; color: string }[] => {
    if (sc.polities && sc.owners) {
      // 주인공 순서: 시작 시 전쟁 당사국 → 이름 있는 군대를 가진 나라 → 영토 크기
      const cnt = new Map<number, number>(); sc.owners.forEach((o) => cnt.set(o, (cnt.get(o) ?? 0) + 1));
      const warring = new Set((sc.wars ?? []).flat());
      const armies = new Map<string, number>(); (sc.armies ?? []).forEach((a) => armies.set(a.c, (armies.get(a.c) ?? 0) + 1));
      const score = (i: number) => { const id = sc.polities![i].id; return (warring.has(id) ? 1e6 : 0) + (armies.get(id) ?? 0) * 1e4 + (cnt.get(i) ?? 0); };
      return [...cnt.keys()].filter((i) => !sc.polities![i]?.neutral).sort((x, y) => score(y) - score(x)).slice(0, n).map((i) => ({ name: sc.polities![i].nameKo || sc.polities![i].name, color: sc.polities![i].color }));
    }
    return ['USA', 'CHN', 'RUS', 'IND', 'KOR', 'JPN'].slice(0, n).map((id) => world.modernCountry(id)).filter(Boolean).map((c) => ({ name: c!.nameKo || c!.name, color: c!.color }));
  };
  const nameOf = (sc: Scenario, id: string) => { const p = sc.polities?.find((x) => x.id === id); return p ? (p.nameKo || p.name) : (world.modernCountry(id)?.nameKo ?? id); };
  const chips = (list: { name: string; color: string }[]) => list.map((x) => `<span class="nchip"><i style="background:${esc(x.color)}"></i>${esc(x.name)}</span>`).join('');
  const fillThumbs = (root: HTMLElement) => {
    root.querySelectorAll<HTMLImageElement>('img[data-thumb]').forEach((img) => {
      const sc = world.scenarios.find((x) => x.id === img.dataset.thumb); if (!sc) return;
      const W = Number(img.dataset.w), H = Number(img.dataset.h);
      thumbs.request(sc, W, H, (url) => { img.src = url; img.classList.add('ok'); });
    });
  };
  const thumbImg = (sc: Scenario, W: number, H: number, cls: string) => {
    const url = thumbs.cached(sc, W, H);
    return `<img class="${cls}${url ? ' ok' : ''}" data-thumb="${esc(sc.id)}" data-w="${W}" data-h="${H}" alt="${esc(sc.name)} 시작 지도" ${url ? `src="${url}"` : ''} />`;
  };
  const renderHero = () => {
    const sc = world.scenarios.find((x) => x.id === templateId); const box = $('tpl-hero');
    if (!sc) { box.innerHTML = ''; return; }
    const gens = (sc.armies ?? []).filter((a) => (a.skill ?? 0) >= 7).sort((x, y) => (y.skill ?? 0) - (x.skill ?? 0)).slice(0, 6);
    const wars = (sc.wars ?? []).slice(0, 4);
    box.innerHTML = `${thumbImg(sc, 560, 300, 'h-img')}
      <div class="h-info"><div class="h-era">${esc(sc.era ?? '')}${sc.year ? ` · ${esc(sc.year)}` : ''}${sc.custom ? ' · 내 템플릿' : ''}</div>
        <h3>${esc(sc.name)}</h3><div class="h-tag">${esc(sc.tagline ?? '')}</div><p>${esc(sc.description ?? '')}</p>
        <div class="h-sec"><b>주요 국가</b><div>${chips(nationsOf(sc, 6))}</div></div>
        ${wars.length ? `<div class="h-sec"><b>시작 시 전쟁</b><div>${wars.map(([a, b]) => `<span class="wchip">⚔ ${esc(nameOf(sc, a))} 대 ${esc(nameOf(sc, b))}</span>`).join('')}</div></div>` : ''}
        ${gens.length ? `<div class="h-sec"><b>이름난 장군</b><div>${gens.map((a) => `<span class="gchip">${esc(a.g)} <em>${a.skill}</em><small>${esc(nameOf(sc, a.c))}</small></span>`).join('')}</div></div>` : ''}
      </div>`;
    fillThumbs(box);
  };
  const renderTemplates = () => {
    const list = world.scenarios.filter((x) => x.id !== '__draft__');
    const eras = [...new Set([...ERA_ORDER, ...list.map((x) => x.era ?? '기타')])].filter((e) => list.some((x) => (x.era ?? '기타') === e));
    if (eraFilter !== '전체' && !eras.includes(eraFilter)) eraFilter = '전체';
    $('tpl-filter').innerHTML = ['전체', ...eras].map((e) => `<button type="button" class="fchip ${e === eraFilter ? 'on' : ''}" data-era="${esc(e)}">${esc(e === '사용자' ? '내 템플릿' : e)} <small>${e === '전체' ? list.length : list.filter((x) => (x.era ?? '기타') === e).length}</small></button>`).join('');
    const card = (sc: Scenario) => `<button type="button" class="tpl ${sc.id === templateId ? 'sel' : ''}" data-id="${esc(sc.id)}">
        <div class="t-img">${thumbImg(sc, 300, 150, 't-thumb')}<span class="t-yr">${esc(sc.year ?? '')}</span>${sc.custom ? '<span class="t-badge">내 템플릿</span>' : ''}${(sc.wars ?? []).length ? '<span class="t-war">⚔ 전쟁 중</span>' : ''}</div>
        <div class="t-body"><div class="t-name">${esc(sc.name)}</div><div class="t-tag">${esc(sc.tagline ?? '')}</div><div class="t-nat">${chips(nationsOf(sc, 3))}</div></div></button>`;
    const shown = eraFilter === '전체' ? list : list.filter((x) => (x.era ?? '기타') === eraFilter);
    $('tpl-grid').innerHTML = shown.map(card).join('');
    fillThumbs($('tpl-grid'));
    renderHero();
    renderTplActions();
  };
  $('tpl-filter').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b?.dataset.era) { eraFilter = b.dataset.era; renderTemplates(); } });
  $('tpl-grid').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button.tpl') as HTMLElement | null;
    if (!b) return;
    templateId = b.dataset.id!;
    $('tpl-grid').querySelectorAll('.tpl').forEach((el) => el.classList.toggle('sel', (el as HTMLElement).dataset.id === templateId));
    renderHero(); renderTplActions();
    $('tpl-hero').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  const refreshContinue = () => {
    const sv = loadJson<GameState>(SAVE_KEY);
    const b = $<HTMLButtonElement>('btn-continue');
    const svSc = sv ? world.scenarios.find((x) => x.id === sv.scenarioId) : undefined;
    if (!sv || sv.v !== 1 || !svSc) { b.hidden = true; return; }
    b.hidden = false;
    const pl = svSc.polities?.find((x) => x.id === sv.playerId);
    const who = pl ? (pl.nameKo || pl.name) : (world.modernCountry(sv.playerId)?.nameKo ?? sv.playerId);
    b.textContent = `이어하기 — ${svSc.name} · ${who} · ${fmtDate(sv.date)} (턴 ${sv.turn})`;
  };
  const introMsg = (t: string, err = false) => { const m = $('intro-msg'); m.textContent = t; m.classList.toggle('err', err); };
  $('btn-next').addEventListener('click', () => {
    aiIntro.read();
    introMsg('');
    state = null; selCountry = null; selProv = null;
    showScenario(world.scenarios.find((x) => x.id === templateId) ?? world.scenarios[0]);
    setPhase('pick'); renderCard();
  });
  $('btn-back').addEventListener('click', () => { view.setHighlightCountry(null); view.setSelectedProvince(null); refreshContinue(); setPhase('intro'); });
  $('btn-continue').addEventListener('click', () => {
    const s = loadJson<GameState>(SAVE_KEY);
    if (!s) return;
    aiIntro.read(); adoptState(s);
  });

  // ---------- 새 게임 / 불러오기 ----------
  /** 시나리오를 지도에 반영한다(국가 색, 시작 소유 상태, 초기 시점). */
  function showScenario(sc: Scenario, fit = true) {
    world.useScenario(sc);
    view.setColors(world.countryList);
    view.setMicro(!world.isHistorical);
    const owners = world.initialOwners();
    view.setControl(owners, owners);
    view.setPlayer(null); view.setHighlightCountry(null); view.setSelectedProvince(null);
    if (fit) view.fitBox(sc.focus ?? [-170, -50, 190, 75], false);
  }
  function adoptState(s: GameState) {
    const sc = world.scenarios.find((x) => x.id === s.scenarioId);
    if (!sc) { introMsg(`이 저장 파일의 템플릿(${s.scenarioId})을 찾을 수 없습니다. 템플릿 파일을 먼저 불러오세요.`, true); return; }
    if (!s.armies) { world.useScenario(sc); buildArmies(world, s, sc); }
    state = s; undoSnap = null; lastDelta = {}; tab = 'log'; focusArmy = null;
    templateId = sc.id;
    world.useScenario(sc); view.setColors(world.countryList); view.setMicro(!world.isHistorical);
    view.setControl(s.owner, s.controller);
    view.setPlayer(s.playerId); view.setHighlightCountry(null); view.setSelectedProvince(null);
    selCountry = s.playerId; selProv = null; setTab('log');
    setPhase('play');
    view.fitCountry(s.playerId);
    renderCard(); renderGame();
  }
  function startNew() {
    const scenario = world.scenarios.find((x) => x.id === templateId) ?? world.scenarios[0];
    world.useScenario(scenario);
    if (!selCountry || !world.country(selCountry) || world.country(selCountry)?.neutral) return;
    const fresh = newGame(world, selCountry, (Date.now() ^ (Math.random() * 4294967296)) >>> 0, scenario);
    buildArmies(world, fresh, scenario);
    adoptState(fresh);
    persist();
  }
  const persist = () => {
    if (!state) return;
    if (!saveJson(SAVE_KEY, state)) { const slim = { ...state, log: state.log.slice(-40) }; if (!saveJson(SAVE_KEY, slim)) opts.onStatus('자동저장에 실패했습니다(저장 공간 부족). 메뉴에서 파일로 내보내세요.', true); }
  };

  // ---------- 메뉴(게임 중) ----------
  const ovMsg = (t: string, kind: '' | 'err' | 'ok' = '') => { const m = $('ov-msg'); m.textContent = t; m.className = `g-msg ${kind}`; };
  $('btn-menu').addEventListener('click', () => { aiMenu.write(); ovMsg(''); $('ov-studio').hidden = !fromStudio; $('overlay').hidden = false; });
  $('ov-close').addEventListener('click', () => { $('overlay').hidden = true; });
  $('ov-apply').addEventListener('click', () => {
    aiMenu.read();
    $('overlay').hidden = true; renderGame();
  });
  $('ov-newgame').addEventListener('click', () => {
    $('overlay').hidden = true; state = null; fromStudio = false; aiIntro.write(); refreshContinue(); renderTemplates();
    view.setPlayer(null); view.setHighlightCountry(null); view.setSelectedProvince(null);
    setPhase('intro');
  });
  $('ov-export').addEventListener('click', () => {
    if (!state) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `althist-${state.playerId}-${state.date.slice(0, -3)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  $('ov-import').addEventListener('click', () => $('ov-file').click());
  $('ov-file').addEventListener('change', async () => {
    const f = $<HTMLInputElement>('ov-file').files?.[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text()) as GameState;
      if (s.v !== 1 || !s.playerId || !s.owner || !s.controller || !s.stats) throw new Error('올바른 저장 파일이 아닙니다');
      aiMenu.read(); adoptState(s); persist(); $('overlay').hidden = true;
    } catch (e) { ovMsg(`불러오기 실패: ${(e as Error).message}`, 'err'); }
    $<HTMLInputElement>('ov-file').value = '';
  });

  // ---------- 왼쪽 나라 카드 ----------
  const statsOf = (c: CountryId): Stats | undefined => (state && c in state.stats ? state.stats[c] : world.country(c)?.stats);
  function renderCard() {
    const info = $('info');
    if (!selCountry) { info.className = 'info empty'; info.innerHTML = phase === 'pick' ? '' : '지도를 클릭하면 나라 정보가 표시됩니다.'; return; }
    const cid = selCountry, c = world.country(cid);
    if (!c) return;
    info.className = 'info';
    const lines: string[] = [];
    if (c.neutral) {
      lines.push(`<div class="cname"><i class="swatch" style="background:${c.color}"></i>${esc(world.label(cid))}</div><div class="sub">주인 없는 땅입니다. 플레이할 수 없습니다.</div>`);
    } else {
      const st = statsOf(cid);
      const nProv = state ? controlledBy(state, cid).length : c.provinces;
      lines.push(`<div class="cname"><i class="swatch" style="background:${c.color}"></i>${esc(world.label(cid))}</div>
        <div class="sub">${state && !isAlive(state, cid) ? '☠ 멸망 · ' : ''}영토 ${nProv}주${c.pop ? ` · 인구 ${fmtPop(c.pop)}` : ''}</div>`);
      if (st) {
        lines.push(`<div class="mini">${STAT_KEYS.map((k: StatKey) => `<div class="stat"><div class="lab"><span>${STAT_LABEL[k]}</span><b>${st[k]}</b></div><div class="bar"><i style="width:${st[k]}%"></i></div></div>`).join('')}</div>`);
      }
      if (state) {
        if (cid === state.playerId) lines.push('<div class="rel">★ 내가 맡은 나라</div>');
        else lines.push(`<div class="rel">나와의 관계 <b>${sign(getRel(state, state.playerId, cid))}</b>${isAtWar(state, state.playerId, cid) ? ' · <span class="war">⚔ 전쟁 중</span>' : ''}</div>`);
      }
    }
    if (selProv) {
      const own = state?.owner[selProv] ?? world.province(selProv)?.owner ?? '', ctl = state?.controller[selProv] ?? own;
      const here = (state?.armies ?? []).filter((a) => a.at === selProv && a.troops > 0);
      const hereHtml = here.length ? `<div class="here">${here.map((a) => `<div>${a.navy ? '⚓' : '⚔'} <b>${esc(a.name)}</b> · ${esc(a.general.name)} (${a.general.skill}/10) · ${a.troops}천 <span class="hint">${esc(world.label(a.owner))}</span></div>`).join('')}</div>` : '';
      lines.push(`<div class="prov">📍 <b>${esc(world.provLabel(selProv))}</b>${own !== ctl ? ` <span class="hint">(소유 ${esc(world.label(own))} · 점령 ${esc(world.label(ctl))})</span>` : ''}
        ${hereHtml}${state ? '<div class="row" style="margin-top:6px"><button type="button" class="ghost small" id="btn-insert">명령에 넣기</button></div>' : ''}</div>`);
    }
    if (phase === 'pick' && !c.neutral) lines.push(`<button type="button" class="primary startbtn" id="btn-startgame">${esc(P(world.label(cid), '으로/로'))} 시작</button>`);
    info.innerHTML = lines.join('');
  }
  $('info').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.id === 'btn-startgame') startNew();
    if (b.id === 'btn-insert' && selProv) {
      const ta = $<HTMLTextAreaElement>('g-cmd'); ta.value = `${ta.value}${ta.value && !/\s$/.test(ta.value) ? ' ' : ''}${world.provLabel(selProv)}`; ta.focus();
    }
  });

  // ---------- 지도 클릭 ----------
  view.onProvinceClick = (id) => {
    if (phase === 'intro') return;
    if (phase === 'studio') { studio.onProvinceClick(id); return; }
    const p = world.province(id);
    if (!p) return;
    selProv = id;
    selCountry = state ? state.controller[id] : p.owner;
    view.setSelectedProvince(id);
    view.setHighlightCountry(phase === 'pick' || selCountry !== state?.playerId ? selCountry : null);
    renderCard();
  };

  // ---------- 군대·장군 ----------
  const armyCard = (a: Army, mine: boolean) => {
    const sk = a.general.skill;
    return `<div class="ac ${focusArmy === a.id ? 'focus' : ''}" data-id="${esc(a.id)}">
      <div class="ac-h"><span>${a.navy ? '⚓' : '⚔'} <b>${esc(a.name)}</b></span><span class="ac-t">${a.troops}천 명</span></div>
      <div class="ac-g">${esc(a.general.name)} <span class="sk sk${sk >= 8 ? 'h' : sk >= 5 ? 'm' : 'l'}">능력 ${sk}/10</span>${a.general.status === 'wounded' ? ' <span class="hurt">🩹 부상</span>' : ''}${a.general.trait ? ` <span class="hint">· ${esc(a.general.trait)}</span>` : ''}</div>
      <div class="ac-m"><div class="bar"><i style="width:${a.morale}%"></i></div><span class="hint">사기 ${a.morale} · 📍 ${esc(world.provLabel(a.at))}${mine ? '' : ` · ${esc(world.label(a.owner))}`}</span></div>
      <div class="ac-b"><button type="button" class="ghost small" data-act="cmd">${mine ? '명령에 넣기' : '대상으로'}</button><button type="button" class="ghost small" data-act="view">지도에서 보기</button></div></div>`;
  };
  function renderArmies() {
    const box = $('g-army');
    if (!state) { box.innerHTML = ''; return; }
    const s = state, pid = s.playerId;
    const mine = armiesOf(s, pid).sort((a, b) => b.troops - a.troops);
    const atWar = new Set(warsOf(s, pid));
    const foes = s.armies.filter((a) => a.troops > 0 && atWar.has(a.owner)).sort((a, b) => b.troops - a.troops).slice(0, 12);
    box.innerHTML = `<div class="ac-sum"><b>내 군대 ${mine.length}개</b> · 총 병력 ${Math.round(totalTroops(s, pid) * 10) / 10}천 명 <span class="hint">· 점령은 군대가 합니다. 군대를 전선 가까이 보낸 뒤 공격하세요.</span></div>`
      + (mine.length ? mine.map((a) => armyCard(a, true)).join('') : '<div class="hint">군대가 없습니다. "군대를 신편한다"로 병력을 모으세요.</div>')
      + (foes.length ? `<div class="ac-sum foe"><b>교전국 군대</b></div>${foes.map((a) => armyCard(a, false)).join('')}` : '');
  }
  function refreshArmyMarkers() {
    if (!state) { view.setArmies([]); return; }
    const s = state, pid = s.playerId;
    const atWar = new Set(warsOf(s, pid));
    const near = new Set<number>();
    for (const a of armiesOf(s, pid)) { const i = world.index.get(a.at); if (i !== undefined) reachWithin(world, i, 2).forEach((j) => near.add(j)); }
    const list: ArmyMarker[] = s.armies.filter((a) => a.troops > 0 && (a.owner === pid || atWar.has(a.owner) || near.has(world.index.get(a.at) ?? -1))).slice(0, 140).map((a) => ({
      id: a.id, at: a.at, navy: !!a.navy, troops: a.troops, color: world.country(a.owner)?.color ?? '#888',
      kind: a.owner === pid ? 'mine' : atWar.has(a.owner) ? 'enemy' : 'other',
      title: `${a.name} · ${a.general.name} (능력 ${a.general.skill}/10) · ${a.troops}천 명 · 사기 ${a.morale} · ${world.label(a.owner)}`,
    }));
    view.setArmies(list);
  }
  const setTab = (t: 'log' | 'army') => {
    tab = t;
    document.querySelectorAll('.g-tabs button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === t));
    $('g-log').hidden = t !== 'log'; $('g-army').hidden = t !== 'army';
  };
  document.querySelector('.g-tabs')!.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) setTab(b.dataset.tab as 'log' | 'army'); });
  $('g-army').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button'); const card = (e.target as HTMLElement).closest('.ac') as HTMLElement | null;
    if (!btn || !card || !state) return;
    const a = state.armies.find((x) => x.id === card.dataset.id);
    if (!a) return;
    if (btn.dataset.act === 'view') { view.fitProvince(a.at); selProv = a.at; selCountry = state.controller[a.at]; view.setSelectedProvince(a.at); renderCard(); }
    if (btn.dataset.act === 'cmd') {
      const ta = $<HTMLTextAreaElement>('g-cmd'); const name = a.owner === state.playerId ? a.general.name : world.label(a.owner);
      ta.value = `${ta.value}${ta.value && !/\s$/.test(ta.value) ? ' ' : ''}${name}`; ta.focus();
    }
  });
  view.onArmyClick = (id) => {
    if (!state) return;
    const a = state.armies.find((x) => x.id === id);
    if (!a) return;
    focusArmy = id; selProv = a.at; selCountry = state.controller[a.at];
    view.setSelectedProvince(a.at); renderCard(); setTab('army'); renderArmies();
    $('g-army').querySelector(`.ac[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  // ---------- 플레이 화면 ----------
  function renderGame() {
    if (!state) return;
    const s = state, pid = s.playerId;
    $('g-name').textContent = world.label(pid);
    $('g-swatch').style.background = world.country(pid)?.color ?? '#555';
    const mine = controlledBy(s, pid).length, owned = ownedBy(s, pid).length;
    const dead = !isAlive(s, pid);
    const tpl = world.scenarios.find((x) => x.id === s.scenarioId)?.name ?? '';
    $('g-date').textContent = `${fmtDate(s.date)} · 턴 ${s.turn} · 영토 ${mine}주${owned !== mine ? ` (소유 ${owned})` : ''} · ${tpl} · ${providerLabel(cfg)}`;
    $('g-stats').innerHTML = STAT_KEYS.map((k) => {
      const v = s.stats[pid]?.[k] ?? 0, d = lastDelta[k] ?? 0;
      return `<div class="stat"><div class="lab"><span>${STAT_LABEL[k]}</span><span><b>${v}</b>${d ? `<span class="${d > 0 ? 'd-up' : 'd-down'}">${sign(d)}</span>` : ''}</span></div><div class="bar"><i style="width:${v}%"></i></div></div>`;
    }).join('');
    const wars = warsOf(s, pid);
    const rels = Object.entries(s.relations).filter(([k]) => k.split('|').includes(pid)).map(([k, v]) => [k.split('|').find((x) => x !== pid)!, v] as [string, number]).filter(([c]) => isAlive(s, c));
    const good = rels.filter(([, v]) => v >= 25).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v]) => `${esc(world.label(c))} ${sign(v)}`);
    const bad = rels.filter(([, v]) => v <= -25).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([c, v]) => `${esc(world.label(c))} ${sign(v)}`);
    $('g-diplo').innerHTML = [
      dead ? '<div class="war"><b>☠ 당신의 나라는 멸망했습니다.</b> 되돌리기 또는 새 게임을 시작하세요.</div>' : '',
      wars.length ? `<div class="war">⚔ 전쟁: ${wars.map((c) => esc(world.label(c))).join(', ')}</div>` : '<div>⚔ 전쟁 없음</div>',
      good.length ? `<div class="good">우호: ${good.join(' · ')}</div>` : '', bad.length ? `<div class="bad">적대: ${bad.join(' · ')}</div>` : '',
    ].join('');
    $('g-log').innerHTML = s.log.length ? [...s.log].reverse().map((r) => {
      const badge = r.outcome === 'pass' ? '<span class="badge pass">넘김</span>' : `<span class="badge ${r.outcome === 'success' ? 'ok' : 'bad'}">${r.outcome === 'success' ? '성공' : '실패'} · 확률 ${r.feasibility}% · 굴림 ${r.roll}</span>`;
      return `<div class="turn"><div class="th"><span><b>${esc(fmtDate(r.date))}</b> · 턴 ${r.turn}</span>${badge}</div>
        ${r.command ? `<div class="cmd">▶ ${esc(r.command)}</div>` : ''}${r.interpretation ? `<div class="interp">해석: ${esc(r.interpretation)}</div>` : ''}
        ${r.narrative ? `<p>${esc(r.narrative)}</p>` : ''}
        ${r.headlines.length ? `<ul class="hl">${r.headlines.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        ${r.notes.length ? `<ul class="notes">${r.notes.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        ${r.rejected.length ? `<ul class="rej">${r.rejected.map((h) => `<li>엔진이 거부: ${esc(h)}</li>`).join('')}</ul>` : ''}
        <div class="mode">판정: ${esc(r.mode)}</div></div>`;
    }).join('') : '<div class="hint">아직 기록이 없습니다. 아래에 명령을 적고 "턴 진행"을 누르세요. 지도에서 주를 클릭하면 왼쪽 카드의 "명령에 넣기"로 이름을 넣을 수 있습니다.</div>';
    $<HTMLButtonElement>('btn-undo').disabled = !undoSnap || busy;
    $<HTMLButtonElement>('btn-go').disabled = busy || dead;
    $<HTMLButtonElement>('btn-pass').disabled = busy || dead;
    $<HTMLTextAreaElement>('g-cmd').disabled = busy || dead;
    renderArmies(); refreshArmyMarkers();
  }
  const gmsg = (t: string, kind: '' | 'err' | 'ok' = '') => { const m = $('g-msg'); m.textContent = t; m.className = `g-msg ${kind}`; };

  // ---------- 턴 진행 ----------
  async function submit(pass: boolean) {
    if (!state || busy) return;
    const command = pass ? '' : $<HTMLTextAreaElement>('g-cmd').value.trim();
    if (!pass && !command) { gmsg('명령을 입력하거나 "명령 없이 넘기기"를 누르세요.', 'err'); return; }
    busy = true; gmsg('판정 중…'); renderGame();
    const snap = JSON.stringify(state);
    try {
      const { adj, mode } = await adjudicate(cfg, state, world, command, pass, { onProgress: (m) => gmsg(m) });
      const before = { ...state.stats[state.playerId] };
      const work = cloneState(state);
      const { record, mapChanged } = resolveTurn(work, world, adj, command, mode, pass);
      state = work; undoSnap = snap;
      lastDelta = Object.fromEntries(STAT_KEYS.map((k) => [k, (work.stats[work.playerId]?.[k] ?? 0) - before[k]]).filter(([, d]) => d !== 0));
      if (mapChanged) view.setControl(state.owner, state.controller);
      persist();
      $<HTMLTextAreaElement>('g-cmd').value = '';
      gmsg(record.rejected.length ? `일부 항목을 엔진이 거부했습니다 (${record.rejected.length}건) — 연대기 참고` : '', record.rejected.length ? '' : 'ok');
      if (selProv) selCountry = state.controller[selProv];
      renderCard();
    } catch (e) {
      gmsg(e instanceof LlmError ? e.message : `오류: ${(e as Error).message}`, 'err');
    } finally { busy = false; renderGame(); }
  }
  $('g-form').addEventListener('submit', (e) => { e.preventDefault(); void submit(false); });
  $('btn-pass').addEventListener('click', () => void submit(true));
  $('g-cmd').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' && ((e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey)) { e.preventDefault(); void submit(false); } });
  $('btn-undo').addEventListener('click', () => {
    if (!undoSnap || busy) return;
    state = JSON.parse(undoSnap) as GameState; undoSnap = null; lastDelta = {};
    view.setControl(state.owner, state.controller); persist(); gmsg('직전 턴을 취소했습니다.', 'ok'); renderCard(); renderGame();
  });

  // ---------- 사용자 템플릿 / 스튜디오 / 공유 ----------
  const TPL_KEY = 'althist-templates-v1', SHARE_KEY = 'althist-share-v1';
  const persistCustom = () => { if (!saveJson(TPL_KEY, world.scenarios.filter((x) => x.custom && x.id !== '__draft__'))) opts.onStatus('템플릿 저장 공간이 부족합니다. 파일로 내보내 두세요.', true); };
  const addCustom = (sc: Scenario) => { thumbs.forget(sc.id); world.scenarios = [...world.scenarios.filter((x) => x.id !== sc.id), sc]; persistCustom(); renderTemplates(); };
  const shareCfg = (): ShareConfig => ({ ...DEFAULT_SHARE, ...(loadJson<Partial<ShareConfig>>(SHARE_KEY) ?? {}) });
  const importRaw = (raw: unknown): Scenario | null => {
    const r = sanitizeScenario(raw, world, new Set(world.scenarios.map((x) => x.id)));
    if (!r.ok) { introMsg(`템플릿을 불러올 수 없습니다: ${r.errors.join(' / ')}`, true); return null; }
    addCustom(r.value); templateId = r.value.id; renderTemplates();
    introMsg(`"${r.value.name}" 템플릿을 불러왔습니다.${r.warnings.length ? ` (${r.warnings.join(', ')})` : ''} 다른 사람이 만든 템플릿은 AI에게 전달되는 지침 글이 들어 있을 수 있습니다.`);
    return r.value;
  };
  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const studio = new Studio({
    world, view, esc,
    sanitize: (raw) => sanitizeScenario(raw, world, new Set(builtinIds)),
    onSave: (sc) => { const r = sanitizeScenario(sc, world, new Set(builtinIds)); if (r.ok) addCustom(r.value); },
    onTestPlay: (sc, pid) => {
      const r = sanitizeScenario(sc, world, new Set(builtinIds));
      if (!r.ok) return;
      world.scenarios = [...world.scenarios.filter((x) => x.id !== '__draft__'), { ...r.value, id: '__draft__' }];
      templateId = '__draft__'; selCountry = pid; fromStudio = true; phase = 'pick'; startNew();
    },
    onExit: () => { view.setArmies([]); fromStudio = false; refreshContinue(); renderTemplates(); setPhase('intro'); },
    shareConfig: shareCfg, setShareConfig: (c) => saveJson(SHARE_KEY, c),
  }, $('studio'));
  const openStudio = (base: string, openShare = false) => {
    view.setMicro(false); view.setHighlightCountry(null); view.setSelectedProvince(null); view.setPlayer(null);
    setPhase('studio'); studio.begin(base, openShare);
  };
  $('btn-studio').addEventListener('click', () => openStudio('blank'));
  $('ov-studio').addEventListener('click', () => {
    $('overlay').hidden = true; state = null; view.setPlayer(null); view.setHighlightCountry(null); view.setSelectedProvince(null); view.setMicro(false);
    setPhase('studio'); studio.resume();
  });
  $('btn-tpl-import').addEventListener('click', () => $('tpl-file').click());
  $('tpl-file').addEventListener('change', async () => {
    const f = $<HTMLInputElement>('tpl-file').files?.[0]; if (!f) return;
    try { if (f.size > 700_000) throw new Error('파일이 너무 큽니다'); importRaw(JSON.parse(await f.text())); } catch (e) { introMsg(`템플릿 파일을 읽을 수 없습니다: ${(e as Error).message}`, true); }
    $<HTMLInputElement>('tpl-file').value = '';
  });
  function renderTplActions() {
    const box = $('tpl-actions'); const sc = world.scenarios.find((x) => x.id === templateId);
    if (!sc || sc.id === '__draft__') { box.hidden = true; return; }
    box.hidden = false;
    if (!sc.custom) { box.innerHTML = `<span class="lhint">선택한 템플릿: <b>${esc(sc.name)}</b>${sc.year ? ` (${esc(sc.year)})` : ''}</span>`; return; }
    box.innerHTML = `<span class="lhint">선택한 템플릿: <b>${esc(sc.name)}</b> · 내 템플릿${sc.author ? ` · 제작 ${esc(sc.author)}` : ''}</span><button type="button" class="lbtn" data-act="edit">✎ 편집</button><button type="button" class="lbtn" data-act="export">⬇ 내보내기</button><button type="button" class="lbtn" data-act="share">🌐 공유</button><button type="button" class="lbtn" data-act="del">🗑 삭제</button>`;
  }
  $('tpl-actions').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); const sc = world.scenarios.find((x) => x.id === templateId);
    if (!b || !sc) return;
    if (b.dataset.act === 'edit') openStudio(`edit:${sc.id}`);
    if (b.dataset.act === 'share') openStudio(`edit:${sc.id}`, true);
    if (b.dataset.act === 'export') download(`${sc.id}.althist-template.json`, templateToJson(sc));
    if (b.dataset.act === 'del' && window.confirm(`"${sc.name}" 템플릿을 삭제할까요? (이 기기에서만 삭제됩니다)`)) {
      world.scenarios = world.scenarios.filter((x) => x.id !== sc.id); persistCustom(); templateId = world.scenarios[0].id; renderTemplates();
    }
  });
  // 공유 갤러리
  $('btn-gallery').addEventListener('click', async () => {
    const box = $('gallery');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    const c = shareCfg();
    box.innerHTML = `<div class="hint" style="color:#6b7686;font-size:12px">공유 저장소의 폴더에 올라온 템플릿 목록입니다. 다른 사람이 만든 템플릿이니 내용을 확인하고 쓰세요.</div>
      <div class="g-cfg"><input id="gc-o" value="${esc(c.owner)}" title="소유자" /><input id="gc-r" value="${esc(c.repo)}" title="저장소" /><input id="gc-b" value="${esc(c.branch)}" title="브랜치" /><input id="gc-d" value="${esc(c.dir)}" title="폴더" /></div>
      <div class="row"><button type="button" class="lbtn" id="gc-go">목록 불러오기</button></div><div id="g-list" class="lhint" style="margin-top:8px"></div>`;
    const load = async () => {
      const cfg: ShareConfig = { owner: $<HTMLInputElement>('gc-o').value.trim(), repo: $<HTMLInputElement>('gc-r').value.trim(), branch: $<HTMLInputElement>('gc-b').value.trim(), dir: $<HTMLInputElement>('gc-d').value.trim() };
      saveJson(SHARE_KEY, cfg);
      const list = $('g-list'); list.textContent = '불러오는 중…';
      try {
        const items = await fetchIndex(cfg);
        list.innerHTML = items.length ? items.map((it) => `<div class="g-item"><div><b>${esc(it.name ?? it.id)}</b> <span class="lhint">${esc([it.era, it.year, it.author && `제작 ${it.author}`].filter(Boolean).join(' · '))}</span><div class="lhint">${esc(it.description ?? '')}</div></div><button type="button" class="lbtn" data-file="${esc(it.file)}">불러오기</button></div>`).join('') : '아직 공유된 템플릿이 없습니다. 스튜디오에서 만든 템플릿을 첫 번째로 올려 보세요.';
        list.onclick = async (ev) => {
          const btn = (ev.target as HTMLElement).closest('button'); if (!btn?.dataset.file) return;
          try { importRaw(await fetchTemplateFile(cfg, btn.dataset.file)); } catch (er) { introMsg(er instanceof ShareError ? er.message : `불러오기 실패: ${(er as Error).message}`, true); }
        };
      } catch (er) { list.textContent = er instanceof ShareError ? er.message : `불러오기 실패: ${(er as Error).message}`; }
    };
    $('gc-go').addEventListener('click', () => void load());
    void load();
  });

  // ---------- 시작 ----------
  renderTemplates(); refreshContinue();
  $<HTMLButtonElement>('btn-next').disabled = false;
  introMsg('');
  setPhase('intro');
  opts.onStatus(`주 ${world.provinces.length.toLocaleString()}개 · 국가 ${[...world.countries.values()].filter((c) => !c.neutral).length}개 · Natural Earth`);

  // 테스트/디버그용 훅
  (window as unknown as Record<string, unknown>).__game = {
    world, view, get state() { return state; }, get phase() { return phase; }, get tab() { return tab; }, get cfg() { return cfg; }, setCfg(c: Partial<LlmConfig>) { cfg = { ...cfg, ...c }; },
    start(cid: string, tpl?: string) { if (tpl) templateId = tpl; selCountry = cid; phase = 'pick'; startNew(); },
    studio, openStudio, importRaw,
    submit: (cmd: string) => { $<HTMLTextAreaElement>('g-cmd').value = cmd; return submit(false); },
  };
  (window as unknown as Record<string, unknown>).__map = view.map;
  (window as unknown as Record<string, unknown>).__ready = true;
}
