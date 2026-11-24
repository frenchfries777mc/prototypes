import type { CountryId, ProvinceId, StatKey, Stats, WorldData } from '../data/types';
import { STAT_KEYS, STAT_LABEL } from '../data/types';
import { World } from '../data/world';
import { resolveTurn } from '../engine/turn';
import type { GameState } from '../engine/state';
import { cloneState, controlledBy, getRel, isAlive, isAtWar, newGame, ownedBy, warsOf } from '../engine/state';
import { LlmError, adjudicate, testGemini } from '../llm/providers';
import type { LlmConfig, ProviderId } from '../llm/providers';
import { MapView } from '../map/MapView';
import { P } from '../util/josa';

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

/** 역사 시대 템플릿은 해당 시대 국경 데이터가 있어야 해서 아직 준비 중이다. */
const COMING_SOON = [
  { name: '제1차 세계대전 직전 (1914)', desc: '제국주의 열강의 세계. 시대별 국경 데이터가 필요합니다.' },
  { name: '제2차 세계대전 전야 (1936)', desc: '파시즘의 부상과 전쟁 직전의 유럽. 시대별 국경 데이터가 필요합니다.' },
  { name: '대항해시대 (1444)', desc: '제국과 왕국의 세계. 시대별 국경 데이터가 필요합니다.' },
];

export interface GameOptions { workerUrl: string; data: WorldData; onStatus: (msg: string, isError?: boolean) => void }

type Phase = 'intro' | 'pick' | 'play';

export async function startApp(opts: GameOptions) {
  const world = new World(opts.data);
  const view = await MapView.create({ container: 'map', workerUrl: opts.workerUrl, data: opts.data });

  let cfg: LlmConfig = { provider: 'local', geminiKey: '', geminiModel: 'gemini-flash-latest', webllmModel: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', ...(loadJson<Partial<LlmConfig>>(CFG_KEY) ?? {}) };
  if (!loadJson(CFG_KEY) && cfg.geminiKey) cfg.provider = 'gemini';
  let phase: Phase = 'intro';
  let state: GameState | null = null;
  let undoSnap: string | null = null;
  let lastDelta: Record<string, number> = {};
  let busy = false;
  let templateId = world.scenarios[0].id;
  let selCountry: CountryId | null = null;
  let selProv: ProvinceId | null = null;

  const applyPadding = () => {
    const wide = window.innerWidth > 900;
    view.padding = wide
      ? { top: 40, bottom: 40, left: 340, right: phase === 'play' ? 430 : 40 }
      : { top: 20, bottom: phase === 'play' ? Math.round(window.innerHeight * 0.6) : 20, left: 20, right: 20 };
  };

  // ---------- AI 설정 폼 (시작 화면과 메뉴에서 같은 모양을 재사용) ----------
  function mountAi(container: HTMLElement, p: string) {
    container.innerHTML = `<div class="ai">
      <label class="radio"><input type="radio" name="${p}-prov" value="local" /> <span><b>규칙 모드</b> — 키 없이 바로 플레이. 키워드(공격·평화·동맹·제재·투자·군비·개혁)만 이해하는 단순 판정</span></label>
      <label class="radio"><input type="radio" name="${p}-prov" value="gemini" /> <span><b>Gemini</b> — 자유로운 문장, 풍부한 서술 (무료 API 키 필요)</span></label>
      <div class="sub" id="${p}-gemini">
        <label for="${p}-key">Gemini API 키 · <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">발급 받기</a></label>
        <input id="${p}-key" type="password" placeholder="AIza…" autocomplete="off" />
        <label for="${p}-model">모델</label>
        <input id="${p}-model" placeholder="gemini-flash-latest" />
        <div class="row"><button type="button" id="${p}-test" class="ghost small">키 테스트</button><span id="${p}-testmsg" class="hint"></span></div>
        <div class="hint">키는 이 기기의 localStorage에만 저장되고 Google API 요청에만 쓰입니다.</div>
      </div>
      <label class="radio"><input type="radio" name="${p}-prov" value="webllm" /> <span><b>브라우저 Qwen</b> — 내 기기에서 실행, 실험적 (WebGPU 필요, 첫 실행 때 모델 다운로드)</span></label>
      <div class="sub" id="${p}-webllm">
        <label for="${p}-wmodel">WebLLM 모델 ID</label>
        <input id="${p}-wmodel" placeholder="Qwen2.5-3B-Instruct-q4f16_1-MLC" />
        <div class="hint">작은 모델은 형식을 자주 틀립니다. 안 되면 Gemini나 규칙 모드를 쓰세요.</div>
      </div></div>`;
    const sync = () => {
      const v = (container.querySelector(`input[name=${p}-prov]:checked`) as HTMLInputElement | null)?.value;
      $(`${p}-gemini`).hidden = v !== 'gemini'; $(`${p}-webllm`).hidden = v !== 'webllm';
    };
    container.querySelectorAll(`input[name=${p}-prov]`).forEach((r) => r.addEventListener('change', sync));
    const read = () => {
      const v = (container.querySelector(`input[name=${p}-prov]:checked`) as HTMLInputElement | null)?.value as ProviderId | undefined;
      cfg = { provider: v ?? 'local', geminiKey: $<HTMLInputElement>(`${p}-key`).value.trim(), geminiModel: $<HTMLInputElement>(`${p}-model`).value.trim() || 'gemini-flash-latest', webllmModel: $<HTMLInputElement>(`${p}-wmodel`).value.trim() || 'Qwen2.5-3B-Instruct-q4f16_1-MLC' };
      saveJson(CFG_KEY, cfg);
    };
    const write = () => {
      (container.querySelector(`input[name=${p}-prov][value=${cfg.provider}]`) as HTMLInputElement).checked = true;
      $<HTMLInputElement>(`${p}-key`).value = cfg.geminiKey; $<HTMLInputElement>(`${p}-model`).value = cfg.geminiModel; $<HTMLInputElement>(`${p}-wmodel`).value = cfg.webllmModel;
      sync();
    };
    $(`${p}-test`).addEventListener('click', async () => {
      read(); const out = $(`${p}-testmsg`); out.textContent = '확인 중…';
      try { await testGemini(cfg); out.textContent = '✔ 키가 동작합니다'; } catch (e) { out.textContent = `✖ ${(e as Error).message}`; }
    });
    write();
    return { read, write };
  }
  const aiIntro = mountAi($('intro-ai'), 'in');
  const aiMenu = mountAi($('ov-ai'), 'ov');

  // ---------- 화면 단계 ----------
  function setPhase(p: Phase) {
    phase = p;
    document.body.classList.remove('phase-intro', 'phase-pick', 'phase-play');
    document.body.classList.add(`phase-${p}`);
    $('intro').hidden = p !== 'intro';
    $('panel').hidden = p === 'intro';
    $('game').hidden = p !== 'play';
    $('p-hint').hidden = p !== 'pick';
    $('btn-back').hidden = p !== 'pick';
    document.body.classList.toggle('playing', p === 'play');
    applyPadding();
    if (p !== 'intro') window.requestAnimationFrame(() => view.map.resize());
  }

  // ---------- 1단계: 템플릿 ----------
  const renderTemplates = () => {
    $('tpl-grid').innerHTML = world.scenarios.map((sc) => `<button type="button" class="tpl ${sc.id === templateId ? 'sel' : ''}" data-id="${esc(sc.id)}">
        <div class="t-name">${esc(sc.name)}</div><div class="t-tag">${esc(sc.tagline ?? '')}</div><div class="t-desc">${esc(sc.description ?? '')}</div></button>`).join('')
      + COMING_SOON.map((c) => `<div class="tpl off" aria-disabled="true"><div class="t-name">${esc(c.name)}</div><div class="t-tag">준비 중</div><div class="t-desc">${esc(c.desc)}</div></div>`).join('');
  };
  $('tpl-grid').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button.tpl') as HTMLElement | null;
    if (!b) return;
    templateId = b.dataset.id!; renderTemplates();
  });
  const refreshContinue = () => {
    const sv = loadJson<GameState>(SAVE_KEY);
    const b = $<HTMLButtonElement>('btn-continue');
    if (!sv || sv.v !== 1 || !world.country(sv.playerId)) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = `이어하기 — ${world.label(sv.playerId)} · ${sv.date.slice(0, 7)} (턴 ${sv.turn})`;
  };
  const introMsg = (t: string, err = false) => { const m = $('intro-msg'); m.textContent = t; m.classList.toggle('err', err); };
  $('btn-next').addEventListener('click', () => {
    aiIntro.read();
    if (cfg.provider === 'gemini' && !cfg.geminiKey) { introMsg('Gemini 모드는 API 키가 필요합니다. 키를 입력하거나 규칙 모드를 선택하세요.', true); return; }
    introMsg('');
    state = null; selCountry = null; selProv = null;
    const same = Object.fromEntries(world.provinces.map((p) => [p.id, p.owner]));
    view.setControl(same, same); view.setPlayer(null); view.setHighlightCountry(null); view.setSelectedProvince(null);
    setPhase('pick'); renderCard(); view.fitBox([-170, -50, 190, 75], false);
  });
  $('btn-back').addEventListener('click', () => { view.setHighlightCountry(null); view.setSelectedProvince(null); refreshContinue(); setPhase('intro'); });
  $('btn-continue').addEventListener('click', () => {
    const s = loadJson<GameState>(SAVE_KEY);
    if (!s) return;
    aiIntro.read(); adoptState(s);
  });

  // ---------- 새 게임 / 불러오기 ----------
  function adoptState(s: GameState) {
    state = s; undoSnap = null; lastDelta = {};
    templateId = world.scenarios.some((x) => x.id === s.scenarioId) ? s.scenarioId : templateId;
    view.setControl(s.owner, s.controller);
    view.setPlayer(s.playerId); view.setHighlightCountry(null); view.setSelectedProvince(null);
    selCountry = s.playerId; selProv = null;
    setPhase('play');
    view.fitCountry(s.playerId);
    renderCard(); renderGame();
  }
  function startNew() {
    if (!selCountry || world.country(selCountry)?.neutral) return;
    const scenario = world.scenarios.find((x) => x.id === templateId) ?? world.scenarios[0];
    adoptState(newGame(world, selCountry, (Date.now() ^ (Math.random() * 4294967296)) >>> 0, scenario));
    persist();
  }
  const persist = () => {
    if (!state) return;
    if (!saveJson(SAVE_KEY, state)) { const slim = { ...state, log: state.log.slice(-40) }; if (!saveJson(SAVE_KEY, slim)) opts.onStatus('자동저장에 실패했습니다(저장 공간 부족). 메뉴에서 파일로 내보내세요.', true); }
  };

  // ---------- 메뉴(게임 중) ----------
  const ovMsg = (t: string, kind: '' | 'err' | 'ok' = '') => { const m = $('ov-msg'); m.textContent = t; m.className = `g-msg ${kind}`; };
  $('btn-menu').addEventListener('click', () => { aiMenu.write(); ovMsg(''); $('overlay').hidden = false; });
  $('ov-close').addEventListener('click', () => { $('overlay').hidden = true; });
  $('ov-apply').addEventListener('click', () => {
    aiMenu.read();
    if (cfg.provider === 'gemini' && !cfg.geminiKey) { ovMsg('Gemini 모드는 API 키가 필요합니다.', 'err'); return; }
    $('overlay').hidden = true; renderGame();
  });
  $('ov-newgame').addEventListener('click', () => {
    $('overlay').hidden = true; state = null; aiIntro.write(); refreshContinue(); renderTemplates();
    const same = Object.fromEntries(world.provinces.map((p) => [p.id, p.owner]));
    view.setControl(same, same); view.setPlayer(null); view.setHighlightCountry(null); view.setSelectedProvince(null);
    setPhase('intro');
  });
  $('ov-export').addEventListener('click', () => {
    if (!state) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `althist-${state.playerId}-${state.date.slice(0, 7)}.json`; a.click();
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
      lines.push(`<div class="prov">📍 <b>${esc(world.provLabel(selProv))}</b>${own !== ctl ? ` <span class="hint">(소유 ${esc(world.label(own))} · 점령 ${esc(world.label(ctl))})</span>` : ''}
        ${state ? '<div class="row" style="margin-top:6px"><button type="button" class="ghost small" id="btn-insert">명령에 넣기</button></div>' : ''}</div>`);
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
    const p = world.province(id);
    if (!p) return;
    selProv = id;
    selCountry = state ? state.controller[id] : p.owner;
    view.setSelectedProvince(id);
    view.setHighlightCountry(phase === 'pick' || selCountry !== state?.playerId ? selCountry : null);
    renderCard();
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
    $('g-date').textContent = `${s.date.slice(0, 4)}년 ${Number(s.date.slice(5, 7))}월 · 턴 ${s.turn} · 영토 ${mine}주${owned !== mine ? ` (소유 ${owned})` : ''} · ${tpl} · ${cfg.provider === 'local' ? '규칙 모드' : cfg.provider === 'gemini' ? 'Gemini' : 'Qwen'}`;
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
      return `<div class="turn"><div class="th"><span><b>${esc(r.date.slice(0, 7))}</b> · 턴 ${r.turn}</span>${badge}</div>
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

  // ---------- 시작 ----------
  renderTemplates(); refreshContinue();
  $<HTMLButtonElement>('btn-next').disabled = false;
  introMsg('');
  setPhase('intro');
  opts.onStatus(`주 ${world.provinces.length.toLocaleString()}개 · 국가 ${[...world.countries.values()].filter((c) => !c.neutral).length}개 · Natural Earth`);

  // 테스트/디버그용 훅
  (window as unknown as Record<string, unknown>).__game = {
    world, view, get state() { return state; }, get phase() { return phase; }, get cfg() { return cfg; }, setCfg(c: Partial<LlmConfig>) { cfg = { ...cfg, ...c }; },
    start(cid: string, tpl?: string) { if (tpl) templateId = tpl; selCountry = cid; phase = 'pick'; startNew(); },
    submit: (cmd: string) => { $<HTMLTextAreaElement>('g-cmd').value = cmd; return submit(false); },
  };
  (window as unknown as Record<string, unknown>).__map = view.map;
  (window as unknown as Record<string, unknown>).__ready = true;
}
