import type { CountryId, ProvinceId, WorldData } from '../data/types';
import { STAT_KEYS, STAT_LABEL } from '../data/types';
import { World } from '../data/world';
import { resolveTurn } from '../engine/turn';
import type { GameState } from '../engine/state';
import { cloneState, controlledBy, getRel, isAlive, newGame, ownedBy, warsOf } from '../engine/state';
import { LlmError, adjudicate, testGemini } from '../llm/providers';
import type { LlmConfig, ProviderId } from '../llm/providers';
import { MapView } from '../map/MapView';

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

export interface GameOptions { workerUrl: string; data: WorldData; onStatus: (msg: string, isError?: boolean) => void }

export async function startApp(opts: GameOptions) {
  const world = new World(opts.data);
  const view = await MapView.create({ container: 'map', workerUrl: opts.workerUrl, data: opts.data });

  let cfg: LlmConfig = { provider: 'local', geminiKey: '', geminiModel: 'gemini-flash-latest', webllmModel: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', ...(loadJson<Partial<LlmConfig>>(CFG_KEY) ?? {}) };
  if (!loadJson(CFG_KEY) && cfg.geminiKey) cfg.provider = 'gemini';
  let state: GameState | null = null;
  let undoSnap: string | null = null;
  let lastDelta: Record<string, number> = {};
  let busy = false;
  let picked: CountryId | null = null;
  let selectedProv: ProvinceId | null = null;

  /** 화면 크기와 상태에 맞춰 지도 이동 시 가려지는 영역(여백)을 계산한다. */
  const applyPadding = (mode: 'start' | 'play' | 'idle') => {
    const wide = window.innerWidth > 900;
    view.padding = wide
      ? { top: 40, bottom: 40, left: 340, right: mode === 'start' ? 600 : mode === 'play' ? 430 : 40 }
      : { top: 20, bottom: mode === 'idle' ? 20 : Math.round(window.innerHeight * 0.6), left: 20, right: 20 };
  };

  const playable = [...world.countries.values()].filter((c) => !c.neutral);
  const allListHtml = playable.flatMap((c) => [c.name, c.nameKo].filter(Boolean).map((n) => `<option value="${esc(n!)}"></option>`)).join('');
  $('country-list').innerHTML = allListHtml;
  $('ov-list').innerHTML = allListHtml;
  const idByLabel = new Map<string, CountryId>();
  for (const c of playable) for (const n of [c.name, c.nameKo]) if (n) idByLabel.set(n.toLowerCase(), c.id);

  // ---------- 설정 ----------
  const readCfg = () => {
    const prov = (document.querySelector('input[name=prov]:checked') as HTMLInputElement | null)?.value as ProviderId | undefined;
    cfg = { provider: prov ?? 'local', geminiKey: $<HTMLInputElement>('ov-key').value.trim(), geminiModel: $<HTMLInputElement>('ov-model').value.trim() || 'gemini-flash-latest', webllmModel: $<HTMLInputElement>('ov-wmodel').value.trim() || 'Qwen2.5-3B-Instruct-q4f16_1-MLC' };
    saveJson(CFG_KEY, cfg);
  };
  const writeCfg = () => {
    (document.querySelector(`input[name=prov][value=${cfg.provider}]`) as HTMLInputElement).checked = true;
    $<HTMLInputElement>('ov-key').value = cfg.geminiKey; $<HTMLInputElement>('ov-model').value = cfg.geminiModel; $<HTMLInputElement>('ov-wmodel').value = cfg.webllmModel;
    syncSubs();
  };
  const syncSubs = () => {
    const prov = (document.querySelector('input[name=prov]:checked') as HTMLInputElement).value;
    $('ov-gemini').hidden = prov !== 'gemini'; $('ov-webllm').hidden = prov !== 'webllm';
  };
  document.querySelectorAll('input[name=prov]').forEach((r) => r.addEventListener('change', syncSubs));
  writeCfg();

  const ovMsg = (t: string, kind: '' | 'err' | 'ok' = '') => { const m = $('ov-msg'); m.textContent = t; m.className = `g-msg ${kind}`; };

  $('ov-test').addEventListener('click', async () => {
    readCfg(); const out = $('ov-testmsg'); out.textContent = '확인 중…';
    try { await testGemini(cfg); out.textContent = '✔ 키가 동작합니다'; } catch (e) { out.textContent = `✖ ${(e as Error).message}`; }
  });

  // ---------- 오버레이(시작/메뉴) ----------
  type OvMode = 'start' | 'menu';
  const openOverlay = (mode: OvMode) => {
    $('overlay').hidden = false;
    $('ov-pick').hidden = mode === 'menu';
    $('ov-title').textContent = mode === 'start' ? 'Althist — 새 게임' : '메뉴';
    $('ov-lead').hidden = mode === 'menu';
    $('ov-start').textContent = mode === 'start' ? '게임 시작' : '설정 적용';
    $('ov-close').hidden = mode === 'start' && !state;
    $('ov-newgame').hidden = mode === 'start';
    $<HTMLButtonElement>('ov-continue').disabled = !loadJson<GameState>(SAVE_KEY);
    $<HTMLButtonElement>('ov-export').disabled = !state;
    ovMsg('');
    ($('overlay') as HTMLElement).dataset.mode = mode;
    applyPadding(mode === 'start' ? 'start' : state ? 'play' : 'idle');
    writeCfg(); refreshPicked();
  };
  const closeOverlay = () => { $('overlay').hidden = true; applyPadding(state ? 'play' : 'idle'); };
  const refreshPicked = () => {
    const el = $('ov-picked');
    if (!picked) { el.textContent = '아직 선택하지 않음'; return; }
    const c = world.country(picked)!;
    el.innerHTML = `<i class="swatch" style="background:${c.color}"></i><b>${esc(world.label(picked))}</b> <span class="hint">${esc(c.name)} · 주 ${c.provinces}개 · 군사 ${c.stats?.military} / 경제 ${c.stats?.economy}</span>`;
  };
  const pickCountry = (id: CountryId) => {
    if (!world.country(id) || world.country(id)!.neutral) return;
    picked = id; refreshPicked(); view.setHighlightCountry(id); view.fitCountry(id);
  };
  $('ov-country').addEventListener('change', () => {
    const id = idByLabel.get($<HTMLInputElement>('ov-country').value.trim().toLowerCase());
    if (id) pickCountry(id);
  });
  $('ov-close').addEventListener('click', closeOverlay);
  $('btn-menu').addEventListener('click', () => openOverlay('menu'));

  // ---------- 새 게임 / 불러오기 ----------
  const adoptState = (s: GameState) => {
    state = s; undoSnap = null; lastDelta = {};
    view.setControl(s.owner, s.controller);
    view.setPlayer(s.playerId); view.setHighlightCountry(null); view.setSelectedProvince(null);
    $('game').hidden = false; document.body.classList.add('playing');
    applyPadding('play');
    view.fitCountry(s.playerId);
    renderGame();
  };
  const startNew = () => {
    if (!picked) { ovMsg('플레이할 국가를 먼저 고르세요. (검색하거나 지도에서 클릭)', 'err'); return; }
    readCfg();
    if (cfg.provider === 'gemini' && !cfg.geminiKey) { ovMsg('Gemini 모드는 API 키가 필요합니다. 키를 입력하거나 규칙 모드를 선택하세요.', 'err'); return; }
    adoptState(newGame(world, picked, (Date.now() ^ (Math.random() * 4294967296)) >>> 0));
    persist(); closeOverlay();
  };
  $('ov-continue').addEventListener('click', () => {
    const s = loadJson<GameState>(SAVE_KEY);
    if (!s || s.v !== 1) { ovMsg('불러올 자동저장이 없습니다.', 'err'); return; }
    readCfg(); adoptState(s); closeOverlay();
  });
  $('ov-newgame').addEventListener('click', () => { state = null; $('game').hidden = true; document.body.classList.remove('playing'); picked = null; view.setControl(Object.fromEntries(world.provinces.map((p) => [p.id, p.owner])), Object.fromEntries(world.provinces.map((p) => [p.id, p.owner]))); view.setPlayer(null); openOverlay('start'); });
  $('ov-start').addEventListener('click', () => {
    if ($('overlay').dataset.mode === 'menu') {
      readCfg();
      if (cfg.provider === 'gemini' && !cfg.geminiKey) { ovMsg('Gemini 모드는 API 키가 필요합니다.', 'err'); return; }
      closeOverlay(); renderGame(); return;
    }
    startNew();
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
      readCfg(); adoptState(s); persist(); closeOverlay();
    } catch (e) { ovMsg(`불러오기 실패: ${(e as Error).message}`, 'err'); }
    $<HTMLInputElement>('ov-file').value = '';
  });
  const persist = () => {
    if (!state) return;
    if (!saveJson(SAVE_KEY, state)) { const slim = { ...state, log: state.log.slice(-40) }; if (!saveJson(SAVE_KEY, slim)) opts.onStatus('자동저장에 실패했습니다(저장 공간 부족). 메뉴에서 파일로 내보내세요.', true); }
  };

  // ---------- 지도 상호작용 ----------
  const showProvince = (id: ProvinceId) => {
    selectedProv = id; view.setSelectedProvince(id);
    const p = world.province(id)!;
    const own = state?.owner[id] ?? p.owner, ctl = state?.controller[id] ?? p.owner;
    const sw = (c: string) => `<i class="swatch" style="background:${world.country(c)?.color ?? '#555'}"></i>${esc(world.label(c))}`;
    const rel = state && ctl !== state.playerId ? `<span>관계</span><span>${sign(getRel(state, state.playerId, ctl))}${state.wars.some((w) => w.split('|').includes(ctl) && w.split('|').includes(state!.playerId)) ? ' · 전쟁 중' : ''}</span>` : '';
    const info = $('info'); info.classList.remove('empty');
    info.innerHTML = `<div class="name">${esc(p.name)}</div><div class="sub">${p.nameKo ? esc(p.nameKo) + ' · ' : ''}${esc(p.id)}</div>
      <div class="kv"><span>소유국</span><span>${sw(own)}</span><span>실효지배</span><span>${own === ctl ? '소유국과 동일' : sw(ctl) + ' (점령)'}</span>${rel}</div>
      ${state ? '<div class="row" style="margin-top:8px"><button type="button" class="ghost" id="btn-insert">명령에 넣기</button></div>' : ''}`;
    $('btn-insert')?.addEventListener('click', () => {
      const ta = $<HTMLTextAreaElement>('g-cmd'); ta.value = `${ta.value}${ta.value && !/\s$/.test(ta.value) ? ' ' : ''}${world.provLabel(id)}`; ta.focus();
    });
  };
  view.onProvinceClick = (id) => {
    if (!state && !$('overlay').hidden) { const own = world.province(id)!.owner; $<HTMLInputElement>('ov-country').value = world.label(own); pickCountry(own); }
    showProvince(id);
  };
  $<HTMLInputElement>('search').addEventListener('change', () => {
    const id = idByLabel.get($<HTMLInputElement>('search').value.trim().toLowerCase());
    if (!id) return;
    applyPadding(!$('overlay').hidden && !state ? 'start' : state ? 'play' : 'idle');
    view.setHighlightCountry(id); view.fitCountry(id);
  });

  // ---------- 화면 그리기 ----------
  function renderGame() {
    if (!state) return;
    const s = state, pid = s.playerId;
    $('g-name').textContent = world.label(pid);
    $('g-swatch').style.background = world.country(pid)?.color ?? '#555';
    const mine = controlledBy(s, pid).length, owned = ownedBy(s, pid).length;
    const dead = !isAlive(s, pid);
    $('g-date').textContent = `${s.date.slice(0, 7).replace('-', '년 ')}월 · 턴 ${s.turn} · 영토 ${mine}주${owned !== mine ? ` (소유 ${owned})` : ''} · ${cfg.provider === 'local' ? '규칙 모드' : cfg.provider === 'gemini' ? 'Gemini' : 'Qwen'}`;
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
    }).join('') : '<div class="hint">아직 기록이 없습니다. 아래에 명령을 적고 "턴 진행"을 누르세요.</div>';
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
      if (selectedProv) showProvince(selectedProv);
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
    view.setControl(state.owner, state.controller); persist(); gmsg('직전 턴을 취소했습니다.', 'ok'); renderGame();
  });

  opts.onStatus(`주 ${world.provinces.length.toLocaleString()}개 · 국가 ${playable.length}개 · Natural Earth`);
  openOverlay('start');

  // 테스트/디버그용 훅
  (window as unknown as Record<string, unknown>).__game = {
    world, view, get state() { return state; }, get cfg() { return cfg; }, setCfg(c: Partial<LlmConfig>) { cfg = { ...cfg, ...c }; },
    pick: (id: string) => { picked = id; refreshPicked(); }, start: () => startNew(), submit: (cmd: string) => { $<HTMLTextAreaElement>('g-cmd').value = cmd; return submit(false); },
  };
  (window as unknown as Record<string, unknown>).__map = view.map;
  (window as unknown as Record<string, unknown>).__ready = true;
}
