import type { CountryId, ProvinceId, Scenario, StatKey, Stats, WorldData } from '../data/types';
import { STAT_KEYS, STAT_LABEL } from '../data/types';
import { World } from '../data/world';
import { resolveTurn } from '../engine/turn';
import type { GameState } from '../engine/state';
import type { Army } from '../engine/state';
import { armiesOf, cloneState, controlledBy, fmtDate, getRel, isAlive, isAtWar, newGame, ownedBy, totalTroops, warsOf } from '../engine/state';
import { buildArmies, reachWithin } from '../engine/armies';
import { promptAt, PROMPT_LEVELS } from '../llm/prompt';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL, FREE_PRESETS, LlmError, adjudicate, freePreset, listFreeModels, listOpenAiModels, providerLabel, retryPolicy, testClaude, testGemini } from '../llm/providers';
import { Thumbs } from '../ui/thumbs';
import { headlineOf, renderPaper } from '../ui/paper';
import { DIFFICULTIES, diffOf } from '../engine/difficulty';
import type { Difficulty } from '../engine/difficulty';
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

const CLAUDE_MODELS: { label: string; items: { id: string; name: string; note?: string }[] }[] = [
  { label: 'Claude', items: [
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: '기본값' },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: '더 저렴' },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: '가장 저렴·빠름' },
    { id: 'claude-fable-5-2', name: 'Claude Fable 5.2' },
  ] },
];
const OPENAI_MODELS: { label: string; items: { id: string; name: string; note?: string }[] }[] = [
  { label: '기본 목록 (키 확인을 누르면 내 키로 쓸 수 있는 목록으로 바뀜)', items: [
    { id: 'gpt-5-mini', name: 'gpt-5-mini', note: '기본값' },
    { id: 'gpt-5', name: 'gpt-5' },
    { id: 'gpt-5-nano', name: 'gpt-5-nano', note: '가장 저렴' },
    { id: 'gpt-4.1-mini', name: 'gpt-4.1-mini' },
  ] },
];
/** 모델 선택 창 + "직접 입력" 칸 */
const picker = (selId: string, inputId: string, groups: { label: string; items: { id: string; name: string; note?: string; gb?: string }[] }[]) =>
  `<select id="${selId}" title="모델">${groups.map((g) => `<optgroup label="${g.label}">${g.items.map((m) => `<option value="${m.id}">${m.name}${m.gb ? ` (약 ${m.gb} GB)` : ''}${m.note ? ` · ${m.note}` : ''}</option>`).join('')}</optgroup>`).join('')}<option value="__custom">직접 입력…</option></select><input id="${inputId}" class="model" placeholder="모델 ID" title="모델 ID" hidden />`;
/** WebLLM 0.2.89 기본 목록에 있는 Qwen 모델 (q4f16_1). gb = 그 목록의 vram_required_MB ÷ 1024. */
const DEFAULT_QWEN = 'Qwen2.5-3B-Instruct-q4f16_1-MLC';
const QWEN_GROUPS: { label: string; items: { id: string; name: string; gb: string; note?: string }[] }[] = [
  { label: 'Qwen2.5 (가볍고 안정적)', items: [
    { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', gb: '0.9', note: '아주 가벼움, 판정 품질 낮음' },
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', gb: '1.6', note: '노트북 내장 GPU' },
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 3B', gb: '2.4', note: '기본값' },
    { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 7B', gb: '5.0', note: '외장 GPU 권장' },
  ] },
  { label: 'Qwen3', items: [
    { id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen3 1.7B', gb: '2.0' },
    { id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen3 4B', gb: '3.4' },
    { id: 'Qwen3-8B-q4f16_1-MLC', name: 'Qwen3 8B', gb: '5.6', note: '외장 GPU 권장' },
  ] },
  { label: 'Qwen3.5 (최신)', items: [
    { id: 'Qwen3.5-2B-q4f16_1-MLC', name: 'Qwen3.5 2B', gb: '2.2' },
    { id: 'Qwen3.5-4B-q4f16_1-MLC', name: 'Qwen3.5 4B', gb: '3.8' },
    { id: 'Qwen3.5-9B-q4f16_1-MLC', name: 'Qwen3.5 9B', gb: '6.3', note: '외장 GPU 권장' },
  ] },
];

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

  let cfg: LlmConfig = { provider: 'free', difficulty: 'normal', freePreset: 'pollinations', freeKeys: {}, freeModels: {}, freeBase: '', geminiKey: '', geminiModel: 'gemini-flash-latest', claudeKey: '', claudeModel: DEFAULT_CLAUDE_MODEL, openaiKey: '', openaiModel: DEFAULT_OPENAI_MODEL, webllmModel: DEFAULT_QWEN, ...(loadJson<Partial<LlmConfig>>(CFG_KEY) ?? {}) };
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
    let focusArmy: string | null = null;

  const applyPadding = () => {
    const wide = window.innerWidth > 900;
    view.padding = wide
      ? { top: 40, bottom: 40, left: phase === 'studio' ? 420 : 340, right: phase === 'play' ? 430 : 40 }
      : { top: 20, bottom: phase === 'play' ? Math.round(window.innerHeight * 0.6) : 20, left: 20, right: 20 };
  };

  // ---------- AI 선택 (시작 화면과 메뉴에서 같은 모양을 재사용) ----------
  const AIS: { id: ProviderId; name: string; maker: string; desc: string }[] = [
    { id: 'free', name: '무료 AI', maker: 'Pollinations · Groq · OpenRouter 등', desc: '키 없이 바로 · GPU 필요 없음' },
    { id: 'gemini', name: 'Gemini', maker: 'Google', desc: '무료 API 키로 시작' },
    { id: 'claude', name: 'Claude', maker: 'Anthropic', desc: '내 API 키 · 사용량만큼 과금' },
    { id: 'openai', name: 'ChatGPT', maker: 'OpenAI', desc: '내 API 키 · 사용량만큼 과금' },
    { id: 'webllm', name: 'Qwen', maker: '내 브라우저에서 실행', desc: '키 없음 · WebGPU 필요(실험적)' },
  ];
  function mountAi(container: HTMLElement, p: string) {
    container.innerHTML = `<div class="ai-cards">${AIS.map((a) => `<label class="ai-card" data-ai="${a.id}"><input type="radio" name="${p}-prov" value="${a.id}" />
        <span class="ai-logo ai-${a.id}">${a.id === 'openai' ? 'GPT' : a.name[0]}</span><span class="ai-txt"><b>${a.name}</b><span>${a.maker}</span><small>${a.desc}</small></span></label>`).join('')}</div>
      <div class="ai-key" id="${p}-free">
        <label for="${p}-fp">무료 AI 서비스 고르기</label>
        <div class="row"><select id="${p}-fp">${FREE_PRESETS.map((x) => `<option value="${x.id}">${x.name}</option>`).join('')}</select></div>
        <div class="row" id="${p}-fbaserow"><input id="${p}-fbase" placeholder="https://…/v1 (OpenAI 호환 주소)" autocomplete="off" /></div>
        <div class="row" id="${p}-fkeyrow"><input id="${p}-fkey" type="password" placeholder="API 키" autocomplete="off" /></div>
        <div class="row">${picker(`${p}-fsel`, `${p}-fmodel`, [])}<button type="button" id="${p}-ftest" class="ghost small">모델 불러오기</button></div>
        <div class="hint" id="${p}-fnote"></div>
      </div>
      <div class="ai-key" id="${p}-gemini">
        <label for="${p}-key">Gemini API 키 · <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">무료 발급</a></label>
        <div class="row"><input id="${p}-key" type="password" placeholder="AIza…" autocomplete="off" /><input id="${p}-model" class="model" placeholder="gemini-flash-latest" title="모델" /><button type="button" id="${p}-test" class="ghost small">키 확인</button></div>
      </div>
      <div class="ai-key" id="${p}-claude">
        <label for="${p}-ckey">Claude API 키 · <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">발급</a></label>
        <div class="row"><input id="${p}-ckey" type="password" placeholder="sk-ant-…" autocomplete="off" /><button type="button" id="${p}-ctest" class="ghost small">키 확인</button></div>
        <div class="row">${picker(`${p}-csel`, `${p}-cmodel`, CLAUDE_MODELS)}</div>
      </div>
      <div class="ai-key" id="${p}-openai">
        <label for="${p}-okey">OpenAI API 키 · <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">발급</a></label>
        <div class="row"><input id="${p}-okey" type="password" placeholder="sk-…" autocomplete="off" /><button type="button" id="${p}-otest" class="ghost small">키 확인</button></div>
        <div class="row">${picker(`${p}-osel`, `${p}-omodel`, OPENAI_MODELS)}</div>
      </div>
      <div class="ai-key" id="${p}-webllm">
        <label for="${p}-wsel">Qwen 모델 고르기 <span class="hint">(처음 한 번 내려받음 · 괄호는 WebLLM이 밝힌 필요 GPU 메모리, 내려받는 크기도 대략 비슷)</span></label>
        <div class="row">${picker(`${p}-wsel`, `${p}-wmodel`, QWEN_GROUPS)}</div>
      </div>
      <div class="ai-diff"><label>난이도 <span class="hint">(게임 중에도 메뉴에서 바꿀 수 있어요)</span></label>
        <div class="diff-cards">${DIFFICULTIES.map((d) => `<label class="diff-card" data-d="${d.id}"><input type="radio" name="${p}-diff" value="${d.id}" /><b>${d.name}</b><small>${d.desc}</small></label>`).join('')}</div></div>
      <div class="ai-note" id="${p}-note"></div>`;
    const sync = () => {
      const v = (container.querySelector(`input[name=${p}-prov]:checked`) as HTMLInputElement | null)?.value;
      container.querySelectorAll<HTMLElement>('.ai-card').forEach((el) => el.classList.toggle('on', el.dataset.ai === v));
      const dv = (container.querySelector(`input[name=${p}-diff]:checked`) as HTMLInputElement | null)?.value;
      container.querySelectorAll<HTMLElement>('.diff-card').forEach((el) => el.classList.toggle('on', el.dataset.d === dv));
      for (const k of ['w', 'c', 'o', 'f']) $(`${p}-${k}model`).hidden = $<HTMLSelectElement>(`${p}-${k}sel`).value !== '__custom';
      for (const id of ['free', 'gemini', 'claude', 'openai', 'webllm']) $(`${p}-${id}`).hidden = v !== id;
      const keyless = (v === 'gemini' && !$<HTMLInputElement>(`${p}-key`).value.trim()) || (v === 'claude' && !$<HTMLInputElement>(`${p}-ckey`).value.trim()) || (v === 'openai' && !$<HTMLInputElement>(`${p}-okey`).value.trim())
        || (v === 'free' && freePreset(fp()).needKey && !$<HTMLInputElement>(`${p}-fkey`).value.trim());
      if (v === 'free' && !keyless) { $(`${p}-note`).textContent = fp() === 'pollinations' ? '키 없이 바로 쓰는 무료 서버입니다. 명령 내용은 Pollinations로 전송됩니다.' : '키는 이 기기에만 저장되고 그 서비스로만 보내집니다.'; return; }
      $(`${p}-note`).textContent = keyless ? '키를 넣기 전에는 AI 대신 간이 판정으로 진행됩니다. 키는 이 기기에만 저장되고 그 AI 서비스로만 보내집니다.' : '키는 이 기기에만 저장되고 그 AI 서비스로만 보내집니다.';
    };
    container.querySelectorAll(`input[name=${p}-prov], input[name=${p}-diff]`).forEach((r) => r.addEventListener('change', sync));
    container.addEventListener('input', sync);
    container.addEventListener('change', sync);
    // 무료 AI: 서비스마다 키·모델을 따로 기억한다
    const fKeys: Record<string, string> = { ...cfg.freeKeys }, fModels: Record<string, string> = { ...cfg.freeModels };
    let curFree = cfg.freePreset;
    const fp = () => $<HTMLSelectElement>(`${p}-fp`).value;
    const freeOptions = (ids: string[]) => { $<HTMLSelectElement>(`${p}-fsel`).innerHTML = `${ids.length ? `<optgroup label="모델">${ids.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}</optgroup>` : ''}<option value="__custom">직접 입력…</option>`; };
    const fillFree = (id: string) => {
      const pr = freePreset(id);
      $(`${p}-fnote`).innerHTML = `${esc(pr.note)}${pr.keyUrl ? ` <a href="${pr.keyUrl}" target="_blank" rel="noopener">키 발급</a>` : ''}`;
      $(`${p}-fbaserow`).hidden = id !== 'custom'; $(`${p}-fkeyrow`).hidden = false; $<HTMLInputElement>(`${p}-fkey`).placeholder = id === 'pollinations' ? 'Pollinations API 키 (선택 사항)' : 'API 키';
      $<HTMLInputElement>(`${p}-fkey`).value = fKeys[id] ?? '';
      const cur = fModels[id] || pr.defaultModel;
      freeOptions([...new Set([pr.defaultModel, fModels[id]].filter(Boolean))]);
      put('f', cur);
    };
    const pick = (k: string) => ($<HTMLSelectElement>(`${p}-${k}sel`).value === '__custom' ? $<HTMLInputElement>(`${p}-${k}model`).value.trim() : $<HTMLSelectElement>(`${p}-${k}sel`).value);
    const put = (k: string, v: string) => {
      const sel = $<HTMLSelectElement>(`${p}-${k}sel`); const known = [...sel.options].some((o) => o.value === v && v !== '__custom');
      sel.value = known ? v : '__custom'; $<HTMLInputElement>(`${p}-${k}model`).value = known ? '' : v;
    };
    const read = () => {
      const v = (container.querySelector(`input[name=${p}-prov]:checked`) as HTMLInputElement | null)?.value as ProviderId | undefined;
      cfg = {
        provider: v ?? 'gemini',
        difficulty: ((container.querySelector(`input[name=${p}-diff]:checked`) as HTMLInputElement | null)?.value ?? 'normal') as Difficulty,
        geminiKey: $<HTMLInputElement>(`${p}-key`).value.trim(), geminiModel: $<HTMLInputElement>(`${p}-model`).value.trim() || 'gemini-flash-latest',
        claudeKey: $<HTMLInputElement>(`${p}-ckey`).value.trim(), claudeModel: pick('c') || DEFAULT_CLAUDE_MODEL,
        openaiKey: $<HTMLInputElement>(`${p}-okey`).value.trim(), openaiModel: pick('o') || DEFAULT_OPENAI_MODEL,
        webllmModel: pick('w') || DEFAULT_QWEN,
        freePreset: fp(), freeBase: $<HTMLInputElement>(`${p}-fbase`).value.trim(),
        freeKeys: (fKeys[fp()] = $<HTMLInputElement>(`${p}-fkey`).value.trim(), { ...fKeys }), freeModels: (fModels[fp()] = pick('f'), { ...fModels }),
      };
      saveJson(CFG_KEY, cfg);
    };
    const write = () => {
      (container.querySelector(`input[name=${p}-prov][value=${cfg.provider === 'local' ? 'gemini' : cfg.provider}]`) as HTMLInputElement).checked = true;
      (container.querySelector(`input[name=${p}-diff][value=${cfg.difficulty ?? 'normal'}]`) as HTMLInputElement).checked = true;
      $<HTMLInputElement>(`${p}-key`).value = cfg.geminiKey; $<HTMLInputElement>(`${p}-model`).value = cfg.geminiModel;
      $<HTMLInputElement>(`${p}-ckey`).value = cfg.claudeKey; put('c', cfg.claudeModel);
      $<HTMLInputElement>(`${p}-okey`).value = cfg.openaiKey ?? ''; put('o', cfg.openaiModel ?? DEFAULT_OPENAI_MODEL);
      put('w', cfg.webllmModel);
      $<HTMLSelectElement>(`${p}-fp`).value = cfg.freePreset; curFree = cfg.freePreset; $<HTMLInputElement>(`${p}-fbase`).value = cfg.freeBase ?? '';
      Object.assign(fKeys, cfg.freeKeys); Object.assign(fModels, cfg.freeModels); fillFree(cfg.freePreset);
      sync();
    };
    const test = (btn: string, fn: (c: LlmConfig) => Promise<string>) => $(btn).addEventListener('click', async () => {
      read(); const out = $(`${p}-note`); out.textContent = '키 확인 중…';
      try { await fn(cfg); out.textContent = '✔ 키가 동작합니다.'; } catch (e) { out.textContent = `✖ ${(e as Error).message}`; }
    });
    test(`${p}-test`, testGemini); test(`${p}-ctest`, testClaude);
    // 무료 AI: 서비스를 바꾸면 그 서비스의 키·모델을 불러오고, "모델 불러오기"로 지금 쓸 수 있는 모델 목록을 받는다
    $(`${p}-fp`).addEventListener('change', () => {
      fKeys[curFree] = $<HTMLInputElement>(`${p}-fkey`).value.trim(); fModels[curFree] = pick('f');
      curFree = fp(); fillFree(curFree); sync();
    });
    $(`${p}-ftest`).addEventListener('click', async () => {
      read(); const out = $(`${p}-note`); out.textContent = '모델 목록을 불러오는 중…';
      try {
        const ids = await listFreeModels(cfg);
        if (!ids.length) throw new LlmError('지금 쓸 수 있는 모델이 없습니다. 잠시 뒤 다시 시도하거나 다른 서비스를 고르세요.');
        const pr = freePreset(cfg.freePreset), want = fModels[pr.id] || pr.defaultModel;
        freeOptions(ids); put('f', ids.includes(want) ? want : ids[0]); read(); sync();
        out.textContent = `✔ 모델 ${ids.length}개를 불러왔습니다. 마음에 드는 것을 고르세요.`;
      } catch (e) { out.textContent = `✖ ${(e as Error).message}`; }
    });
    // ChatGPT: 키 확인 = 이 키로 쓸 수 있는 모델 목록을 받아 선택 창을 채운다
    $(`${p}-otest`).addEventListener('click', async () => {
      read(); const out = $(`${p}-note`); out.textContent = '키 확인 중…';
      try {
        const ids = await listOpenAiModels(cfg);
        const sel = $<HTMLSelectElement>(`${p}-osel`), cur = cfg.openaiModel;
        sel.innerHTML = `<optgroup label="이 키로 쓸 수 있는 모델">${ids.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}</optgroup><option value="__custom">직접 입력…</option>`;
        put('o', ids.includes(cur) ? cur : (ids.find((x) => x === DEFAULT_OPENAI_MODEL) ?? ids[0] ?? cur)); read(); sync();
        out.textContent = `✔ 키가 동작합니다. 모델 ${ids.length}개를 불러왔습니다.`;
      } catch (e) { out.textContent = `✖ ${(e as Error).message}`; }
    });
    write();
    return { read, write };
  }
  const aiIntro = mountAi($('intro-ai'), 'in');
  const aiMenu = mountAi($('ov-ai'), 'ov');

  // ---------- 화면 단계 ----------
  function setPhase(p: Phase) {
    if (p === 'intro' && phase !== 'intro') { $('intro-s1').hidden = false; $('intro-s2').hidden = true; }
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
      return [...cnt.keys()].filter((i) => !sc.polities![i]?.neutral && !sc.polities![i]?.regional).sort((x, y) => score(y) - score(x)).slice(0, n).map((i) => ({ name: sc.polities![i].nameKo || sc.polities![i].name, color: sc.polities![i].color }));
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
  /** 시작 화면 2단계: 1 템플릿 → 2 AI. */
  const introStep = (n: 1 | 2) => {
    $('intro-s1').hidden = n !== 1; $('intro-s2').hidden = n !== 2;
    if (n === 2) {
      const sc = world.scenarios.find((x) => x.id === templateId);
      $('s2-sum').innerHTML = sc ? `${thumbImg(sc, 300, 150, 's2-img')}<div><div class="h-era">${esc(sc.era ?? '')}${sc.year ? ` · ${esc(sc.year)}` : ''}</div><b>${esc(sc.name)}</b><div class="lhint">${esc(sc.tagline ?? '')}</div></div>` : '';
      fillThumbs($('s2-sum'));
    }
    $('intro').scrollTop = 0;
  };
  $('btn-to-ai').addEventListener('click', () => { introMsg(''); introStep(2); });
  $('btn-to-tpl').addEventListener('click', () => introStep(1));
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
  function countStatus() { opts.onStatus(`주 ${world.provinces.length.toLocaleString()}개 · 국가 ${[...world.countries.values()].filter((c) => !c.neutral).length}개 · Natural Earth`); }
  function showScenario(sc: Scenario, fit = true) {
    world.useScenario(sc); countStatus();
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
    state = s; undoSnap = null; lastDelta = {}; focusArmy = null; cfg.difficulty = diffOf(s); saveJson(CFG_KEY, cfg);
    templateId = sc.id;
    world.useScenario(sc); countStatus(); view.setColors(world.countryList); view.setMicro(!world.isHistorical);
    view.setControl(s.owner, s.controller);
    view.setPlayer(s.playerId); view.setHighlightCountry(null); view.setSelectedProvince(null);
    selCountry = s.playerId; selProv = null;
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
    fresh.difficulty = cfg.difficulty ?? 'normal';
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
    if (state) { state.difficulty = cfg.difficulty; persist(); }
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
      lines.push(`<div class="cname"><i class="swatch" style="background:${c.color}"></i>${esc(world.label(cid))}</div><div class="sub">사람이 살지 않거나 주인이 없는 땅입니다. 고를 수는 없고, 군대로 개척·점령할 수 있습니다.</div>`);
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
      const own = state?.owner[selProv] ?? world.startOwner(selProv) ?? '', ctl = state?.controller[selProv] ?? own;
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
    selCountry = state ? state.controller[id] : (world.startOwner(id) ?? p.owner);
    view.setSelectedProvince(id);
    view.setHighlightCountry(phase === 'pick' || selCountry !== state?.playerId ? selCountry : null);
    renderCard();
  };

  // ---------- 명령 · 군대·장군 (일반 명령과 군대 명령을 한 곳에서) ----------
  const armyCard = (a: Army, mine: boolean) => {
    const sk = a.general.skill, open = focusArmy === a.id;
    const head = `<div class="ac-h" data-act="focus"><span>${a.navy ? '⚓' : '⚔'} <b>${esc(a.name)}</b> <span class="hint">${esc(a.general.name)}${mine ? '' : ` · ${esc(world.label(a.owner))}`}</span></span><span class="ac-t">${a.troops}천</span></div>`;
    if (!open) return `<div class="ac" data-id="${esc(a.id)}">${head}</div>`;
    return `<div class="ac focus" data-id="${esc(a.id)}">${head}
      <div class="ac-g">${esc(a.general.name)} <span class="sk sk${sk >= 8 ? 'h' : sk >= 5 ? 'm' : 'l'}">능력 ${sk}/10</span>${a.general.status === 'wounded' ? ' <span class="hurt">🩹 부상</span>' : ''}${a.general.trait ? ` <span class="hint">· ${esc(a.general.trait)}</span>` : ''}</div>
      <div class="ac-m"><div class="bar"><i style="width:${a.morale}%"></i></div><span class="hint">사기 ${a.morale} · 📍 ${esc(world.provLabel(a.at))} · ${a.troops}천 명</span></div>
      <div class="ac-b">${mine ? `<button type="button" class="ghost small" data-act="mv">이동</button><button type="button" class="ghost small" data-act="atk">공격·점령</button><button type="button" class="ghost small" data-act="hold">방어</button>` : ''}<button type="button" class="ghost small" data-act="cmd">${mine ? '이름만 넣기' : '대상으로'}</button><button type="button" class="ghost small" data-act="view">지도에서 보기</button></div></div>`;
  };
  function renderArmies() {
    const box = $('g-army');
    if (!state) { box.innerHTML = ''; return; }
    const s = state, pid = s.playerId;
    const mine = armiesOf(s, pid).sort((a, b) => b.troops - a.troops);
    const atWar = new Set(warsOf(s, pid));
    const foes = s.armies.filter((a) => a.troops > 0 && atWar.has(a.owner)).sort((a, b) => b.troops - a.troops).slice(0, 12);
    box.innerHTML = `<div class="ac-sum"><b>내 군대 ${mine.length}개</b> · 병력 ${Math.round(totalTroops(s, pid) * 10) / 10}천 명<button type="button" class="ghost small" data-act="levy">＋ 신편</button></div>`
      + `<div class="ac-list">${mine.length ? mine.map((a) => armyCard(a, true)).join('') : '<div class="hint">군대가 없습니다. "신편"으로 병력을 모으세요.</div>'}</div>`
      + (foes.length ? `<details class="ac-foes"><summary>교전국 군대 ${foes.length}개</summary>${foes.map((a) => armyCard(a, false)).join('')}</details>` : '');
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
  /** 명령창에 문장을 덧붙인다(여러 명령은 " / "로 이어 붙인다). */
  const addToCmd = (t: string) => {
    const ta = $<HTMLTextAreaElement>('g-cmd'); const cur = ta.value.trim();
    ta.value = cur ? `${cur} / ${t}` : t; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  $('g-army').addEventListener('click', (e) => {
    const t = e.target as HTMLElement; const btn = t.closest('button') as HTMLElement | null; const card = t.closest('.ac') as HTMLElement | null;
    if (!state) return;
    if (btn?.dataset.act === 'levy') { addToCmd('군대를 신편한다'); return; }
    if (!card) return;
    const a = state.armies.find((x) => x.id === card.dataset.id);
    if (!a) return;
    const act = (btn ?? (t.closest('.ac-h') as HTMLElement | null))?.dataset.act;
    if (act === 'focus') { focusArmy = focusArmy === a.id ? null : a.id; if (focusArmy) { selProv = a.at; selCountry = state.controller[a.at]; view.setSelectedProvince(a.at); renderCard(); } renderArmies(); return; }
    if (act === 'view') { view.fitProvince(a.at); selProv = a.at; selCountry = state.controller[a.at]; view.setSelectedProvince(a.at); renderCard(); return; }
    if (act === 'cmd') { addToCmd(a.owner === state.playerId ? `${a.name}(${a.general.name})` : world.label(a.owner)); return; }
    // 군대 명령 문장: 지도에서 고른 주를 목표로 쓴다(없으면 ○○)
    const target = selProv && selProv !== a.at ? world.provLabel(selProv) : '○○';
    if (act === 'mv') addToCmd(`${P(a.name, '을/를')} ${P(target, '으로/로')} 이동시킨다`);
    if (act === 'atk') addToCmd(`${P(a.name, '으로/로')} ${P(target, '을/를')} 공격해 점령한다`);
    if (act === 'hold') addToCmd(`${P(a.name, '은/는')} 현재 위치를 사수한다`);
    if ((act === 'mv' || act === 'atk') && target === '○○') gmsg('지도에서 목표 주를 누른 뒤 같은 버튼을 다시 누르면 ○○가 목표 이름으로 채워집니다.');
  });
  view.onArmyClick = (id) => {
    if (!state) return;
    const a = state.armies.find((x) => x.id === id);
    if (!a) return;
    focusArmy = id; selProv = a.at; selCountry = state.controller[a.at];
    view.setSelectedProvince(a.at); renderCard(); renderArmies();
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
    const last = s.log.at(-1);
    $('g-latest').textContent = last ? headlineOf(last) : '아직 발행된 신문이 없습니다';
    $<HTMLButtonElement>('btn-paper').disabled = !last; $<HTMLButtonElement>('btn-archive').disabled = !s.log.length;
    $<HTMLButtonElement>('btn-undo').disabled = !undoSnap || busy;
    $<HTMLButtonElement>('btn-go').disabled = busy || dead;
    $<HTMLButtonElement>('btn-pass').disabled = busy || dead;
    $<HTMLTextAreaElement>('g-cmd').disabled = busy || dead;
    renderArmies(); refreshArmyMarkers();
  }
  const gmsg = (t: string, kind: '' | 'err' | 'ok' = '') => { const m = $('g-msg'); m.textContent = t; m.className = `g-msg ${kind}`; };

  // ---------- 신문 ----------
  let paperIdx = -1;
  const paperAuto = (): boolean => { try { return localStorage.getItem('althist-paper-auto') !== '0'; } catch { return true; } };
  function openPaper(i: number) {
    if (!state || !state.log[i]) return;
    paperIdx = i;
    const sc = world.scenarios.find((x) => x.id === state!.scenarioId);
    $('paper-sheet').innerHTML = renderPaper(state.log[i], { world, state, playerName: world.label(state.playerId), scenario: sc?.name ?? '', era: sc?.era ?? '' });
    $('paper-pos').textContent = `${i + 1} / ${state.log.length}호`;
    $<HTMLButtonElement>('paper-prev').disabled = i <= 0; $<HTMLButtonElement>('paper-next').disabled = i >= state.log.length - 1;
    $<HTMLInputElement>('paper-auto').checked = paperAuto();
    $('paper').hidden = false; $('paper-scroll').scrollTop = 0;
  }
  const closePaper = () => { $('paper').hidden = true; paperIdx = -1; };
  $('btn-paper').addEventListener('click', () => { if (state?.log.length) openPaper(state.log.length - 1); });
  $('paper-close').addEventListener('click', closePaper);
  $('paper').addEventListener('click', (e) => { if (e.target === $('paper')) closePaper(); });
  $('paper-prev').addEventListener('click', () => openPaper(paperIdx - 1));
  $('paper-next').addEventListener('click', () => openPaper(paperIdx + 1));
  $('paper-auto').addEventListener('change', () => { try { localStorage.setItem('althist-paper-auto', $<HTMLInputElement>('paper-auto').checked ? '1' : '0'); } catch { /* 무시 */ } });
  $('btn-archive').addEventListener('click', () => {
    if (!state) return;
    $('archive-list').innerHTML = [...state.log].map((r, i) => ({ r, i })).reverse().map(({ r, i }) =>
      `<button type="button" class="arch-row" data-i="${i}"><span class="arch-n">제 ${r.turn}호</span><span class="arch-d">${esc(fmtDate(r.date))}</span><span class="arch-h">${esc(headlineOf(r))}</span>`
      + `<span class="badge ${r.outcome === 'pass' ? 'pass' : r.outcome === 'success' ? 'ok' : 'bad'}">${r.outcome === 'pass' ? '넘김' : r.outcome === 'success' ? '성공' : '실패'}</span></button>`).join('') || '<div class="hint">아직 발행된 신문이 없습니다.</div>';
    $('archive').hidden = false;
  });
  $('archive-list').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('.arch-row') as HTMLElement | null; if (b) { $('archive').hidden = true; openPaper(Number(b.dataset.i)); } });
  $('archive-close').addEventListener('click', () => { $('archive').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('paper').hidden) closePaper(); else if (!$('archive').hidden) $('archive').hidden = true; }
    else if (!$('paper').hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) openPaper(paperIdx + (e.key === 'ArrowRight' ? 1 : -1));
  });

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
      gmsg(record.rejected.length ? `일부 항목을 엔진이 거부했습니다 (${record.rejected.length}건) — 연대기 참고` : mode.includes('붐벼서') ? 'AI가 붐벼서 이번 턴은 간이 판정으로 처리했습니다. 되돌리기로 취소하고 다시 시도할 수도 있습니다.' : '', record.rejected.length ? '' : 'ok');
      if (selProv) selCountry = state.controller[selProv];
      renderCard();
      if (paperAuto()) openPaper(state.log.length - 1);
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
  countStatus();

  // 테스트/디버그용 훅
  (window as unknown as Record<string, unknown>).__game = {
    world, view, get state() { return state; }, get phase() { return phase; }, get cfg() { return cfg; }, setCfg(c: Partial<LlmConfig>) { cfg = { ...cfg, ...c }; },
    start(cid: string, tpl?: string) { if (tpl) templateId = tpl; selCountry = cid; phase = 'pick'; startNew(); },
    studio, openStudio, importRaw,
    setRetry: (ms: number[], paceMs?: number) => { retryPolicy.delaysMs = ms; if (paceMs !== undefined) retryPolicy.paceMs = paceMs; },
    paperOpen: () => !$('paper').hidden,
    promptSizes: () => (state ? Array.from({ length: PROMPT_LEVELS }, (_, l) => { const q = promptAt(world, state!, '시험 명령', false, l); return q.system.length + q.user.length; }) : []),
    submit: (cmd: string) => { $<HTMLTextAreaElement>('g-cmd').value = cmd; return submit(false); },
  };
  (window as unknown as Record<string, unknown>).__map = view.map;
  (window as unknown as Record<string, unknown>).__ready = true;
}
