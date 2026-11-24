import type { ArmyDef, PolityDef, Scenario } from '../data/types';
import type { SanitizeResult } from '../data/template';
import { ERAS, templateToJson } from '../data/template';
import type { World } from '../data/world';
import type { ArmyMarker, MapView } from '../map/MapView';
import type { IndexEntry, ShareConfig } from './share';
import { ShareError, uploadTemplate } from './share';

interface DPol { id: string; name: string; color: string; s: [number, number, number, number]; aliases: string }
interface DArmy { c: string; n: string; g: string; skill: number; trait: string; troops: number; at: string; navy: boolean }
interface Draft {
  id: string; name: string; year: string; era: string; tagline: string; description: string; briefing: string; gmNotes: string; author: string;
  startYear: number; startMonth: number; turnMonths: number;
  pols: DPol[]; owners: number[]; relations: [string, string, number][]; wars: [string, string][]; armies: DArmy[];
}
export interface StudioHost {
  world: World; view: MapView; esc: (s: string) => string;
  sanitize: (raw: unknown) => SanitizeResult;
  onSave: (sc: Scenario) => void; onTestPlay: (sc: Scenario, playerId: string) => void; onExit: () => void;
  shareConfig: () => ShareConfig; setShareConfig: (c: ShareConfig) => void;
}

const PALETTE = ['#c0443a', '#4a78c2', '#e0b84f', '#5fb3a1', '#8a63d2', '#d6697c', '#7da13a', '#d9825b', '#6fa8c7', '#b88f6a', '#c872b4', '#3aa6a0'];
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const MODERN20 = ['USA', 'CHN', 'RUS', 'IND', 'JPN', 'DEU', 'GBR', 'FRA', 'ITA', 'BRA', 'CAN', 'AUS', 'KOR', 'PRK', 'TWN', 'TUR', 'IRN', 'SAU', 'EGY', 'ISR', 'UKR', 'POL', 'ESP', 'MEX', 'IDN', 'PAK'];

export class Studio {
  private d!: Draft;
  private brush = 0;
  private tool: 'province' | 'country' = 'province';
  private pickArmy: number | null = null;
  private open = new Set<string>(['base', 'pols']);
  private borderTimer = 0;
  private msg = '';

  constructor(private h: StudioHost, private root: HTMLElement) {
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('click', (e) => void this.onClick(e));
    root.addEventListener('toggle', (e) => { const d = e.target as HTMLDetailsElement; const k = d.dataset?.sec; if (k) { if (d.open) this.open.add(k); else this.open.delete(k); } }, true);
  }

  // ---------- 시작/복귀 ----------
  begin(base: 'blank' | 'modern20' | string = 'blank', openShare = false): void { this.loadBase(base); if (openShare) { this.open.add('save'); this.open.add('share'); } this.afterLoad(); }
  resume(): void { this.afterLoad(); }
  private afterLoad(): void { this.recolor(); this.repaint(true); this.markers(); this.render(); }

  private blank(): Draft {
    return {
      id: `my-${Math.random().toString(36).slice(2, 8)}`, name: '새 템플릿', year: '', era: '사용자', tagline: '', description: '', briefing: '', gmNotes: '', author: '',
      startYear: 1900, startMonth: 1, turnMonths: 1,
      pols: [{ id: 'C1', name: '나라 1', color: PALETTE[0], s: [60, 50, 50, 40], aliases: '' }, { id: 'C2', name: '나라 2', color: PALETTE[1], s: [60, 50, 50, 40], aliases: '' }],
      owners: this.h.world.provinces.map(() => -1), relations: [], wars: [], armies: [],
    };
  }
  private loadBase(kind: string): void {
    const w = this.h.world;
    const d = this.blank();
    if (kind === 'modern20') {
      d.pols = []; d.owners = w.provinces.map(() => -1);
      for (const id of MODERN20) {
        const c = w.modernCountry(id); if (!c || c.neutral) continue;
        d.pols.push({ id, name: c.nameKo || c.name, color: c.color, s: [c.stats?.stability ?? 50, c.stats?.economy ?? 40, c.stats?.military ?? 40, c.stats?.influence ?? 30], aliases: '' });
      }
      w.provinces.forEach((p, i) => { const k = d.pols.findIndex((x) => x.id === p.owner); if (k >= 0) d.owners[i] = k; });
      d.name = '현대 주요국 기반'; d.era = '현대'; d.year = '2026년'; d.startYear = 2026; d.turnMonths = 1;
    } else if (kind.startsWith('clone:') || kind.startsWith('edit:')) {
      const editing = kind.startsWith('edit:');
      const sc = w.scenarios.find((x) => x.id === kind.slice(6));
      if (sc?.polities && sc.owners) {
        const live = sc.polities.filter((p) => !p.neutral);
        d.pols = live.map((p, i) => ({ id: p.id, name: p.nameKo || p.name, color: p.color, s: [p.stats?.stability ?? 50, p.stats?.economy ?? 40, p.stats?.military ?? 40, p.stats?.influence ?? 30], aliases: (p.aliases ?? []).join(', ') || String(i && '') }));
        d.pols.forEach((p) => { if (p.aliases === '0' || p.aliases === '') p.aliases = ''; });
        d.owners = sc.owners.map((o) => { const id = sc.polities![o]?.id; return live.findIndex((p) => p.id === id); });
        d.relations = (sc.relations ?? []).filter(([a, b]) => live.some((p) => p.id === a) && live.some((p) => p.id === b)).map((r) => [...r] as [string, string, number]);
        d.wars = (sc.wars ?? []).map((x) => [...x] as [string, string]);
        d.armies = (sc.armies ?? []).map((a) => ({ c: a.c, n: a.n, g: a.g, skill: a.skill ?? 5, trait: a.trait ?? '', troops: a.troops, at: a.at, navy: !!a.navy }));
        if (editing) d.id = sc.id;
        d.author = sc.author ?? '';
        d.name = editing ? sc.name : `${sc.name} (수정본)`; d.year = sc.year ?? ''; d.era = ERAS.includes(sc.era ?? '') ? sc.era! : '사용자'; d.tagline = sc.tagline ?? ''; d.description = sc.description ?? '';
        d.briefing = sc.briefing ?? ''; d.gmNotes = sc.gmNotes ?? ''; d.turnMonths = sc.turnMonths ?? 1;
        const m = /^(-?)(\d+)-(\d{2})/.exec(sc.startDate); if (m) { d.startYear = (m[1] ? -1 : 1) * Number(m[2]); d.startMonth = Number(m[3]); }
      }
    }
    this.d = d; this.brush = 0; this.pickArmy = null;
  }

  /** 편집 중인 초안을 실행 가능한 시나리오로 바꾼다(주인 없는 땅 = 기타 세력 자동 추가). */
  toScenario(): Scenario {
    const d = this.d;
    const pols: PolityDef[] = d.pols.map((p) => ({ id: p.id, name: p.name, nameKo: p.name, color: p.color, stats: { stability: p.s[0], economy: p.s[1], military: p.s[2], influence: p.s[3] }, aliases: p.aliases.split(',').map((x) => x.trim()).filter(Boolean) }));
    pols.push({ id: 'UNC', name: '기타 세력', nameKo: '기타 세력', color: '#5b6577', stats: null, neutral: true });
    const armies: ArmyDef[] = d.armies.filter((a) => a.at).map((a) => ({ c: a.c, n: a.n, g: a.g, skill: a.skill, trait: a.trait, troops: a.troops, at: a.at, ...(a.navy ? { navy: true } : {}) }));
    const y = d.startYear;
    return {
      id: d.id, name: d.name, year: d.year, era: d.era, tagline: d.tagline, description: d.description, briefing: d.briefing, gmNotes: d.gmNotes, author: d.author,
      startDate: `${y < 0 ? '-' : ''}${String(Math.abs(y)).padStart(4, '0')}-${String(clamp(d.startMonth, 1, 12)).padStart(2, '0')}-01`, turnMonths: clamp(d.turnMonths, 1, 24),
      alliances: [], relations: d.relations, wars: d.wars, polities: pols, owners: d.owners.map((o) => (o < 0 || o >= d.pols.length ? pols.length - 1 : o)), armies, custom: true,
    };
  }

  // ---------- 지도 ----------
  private recolor(): void {
    this.h.view.setColors([...this.d.pols.map((p) => ({ id: p.id, name: p.name, nameKo: p.name, color: p.color, provinces: 0 })), { id: 'UNC', name: '기타 세력', nameKo: '기타 세력', color: '#5b6577', provinces: 0 }]);
  }
  private repaint(borders: boolean): void {
    const rec: Record<string, string> = {};
    this.h.world.provinces.forEach((p, i) => { rec[p.id] = this.d.pols[this.d.owners[i]]?.id ?? 'UNC'; });
    this.h.view.setControl(rec, rec, { borders });
    if (!borders) { window.clearTimeout(this.borderTimer); this.borderTimer = window.setTimeout(() => this.h.view.refreshBorders(), 400); }
    this.counts();
  }
  private counts(): void {
    const n = new Map<number, number>();
    this.d.owners.forEach((o) => n.set(o, (n.get(o) ?? 0) + 1));
    this.root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => { el.textContent = `${n.get(Number(el.dataset.count)) ?? 0}주`; });
  }
  private markers(): void {
    const list: ArmyMarker[] = this.d.armies.filter((a) => a.at).map((a, i) => ({
      id: `S${i}`, at: a.at, navy: a.navy, troops: a.troops, color: this.d.pols.find((p) => p.id === a.c)?.color ?? '#888', kind: 'other' as const,
      title: `${a.n} · ${a.g} (능력 ${a.skill}/10) · ${a.troops}천 명`,
    }));
    this.h.view.setArmies(list);
  }
  /** 지도 클릭: 군대 위치 지정 중이면 위치를, 아니면 칠하기. */
  onProvinceClick(id: string): void {
    const w = this.h.world, i = w.index.get(id);
    if (i === undefined) return;
    if (this.pickArmy !== null) { const a = this.d.armies[this.pickArmy]; if (a) a.at = id; this.pickArmy = null; this.markers(); this.render(); this.say(`군대 위치를 ${w.provLabel(id)}(으)로 지정했습니다.`); return; }
    if (this.tool === 'country') { const m = w.provinces[i].owner; w.provinces.forEach((p, k) => { if (p.owner === m) this.d.owners[k] = this.brush; }); }
    else this.d.owners[i] = this.brush;
    this.repaint(false);
  }

  // ---------- 입력 처리 ----------
  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const f = t.dataset.f; if (!f) return;
    const d = this.d; const v = t.type === 'checkbox' ? (t as HTMLInputElement).checked : t.value;
    if (t.dataset.p !== undefined) {
      const p = d.pols[Number(t.dataset.p)]; if (!p) return;
      if (f === 'name') p.name = String(v).slice(0, 30);
      else if (f === 'color') { p.color = String(v); this.recolor(); this.repaint(true); }
      else if (f === 'aliases') p.aliases = String(v).slice(0, 120);
      else if (/^s[0-3]$/.test(f)) p.s[Number(f[1])] = clamp(Math.round(Number(v) || 0), 0, 100);
    } else if (t.dataset.a !== undefined) {
      const a = d.armies[Number(t.dataset.a)]; if (!a) return;
      if (f === 'n') a.n = String(v).slice(0, 30); else if (f === 'g') a.g = String(v).slice(0, 24); else if (f === 't') a.trait = String(v).slice(0, 30);
      else if (f === 'skill') a.skill = clamp(Math.round(Number(v) || 5), 1, 10); else if (f === 'troops') a.troops = clamp(Number(v) || 1, 0.5, 3000);
      else if (f === 'navy') a.navy = !!v; else if (f === 'c') a.c = String(v);
      this.markers();
    } else if (['startYear', 'startMonth', 'turnMonths'].includes(f)) (d as unknown as Record<string, number>)[f] = Math.round(Number(v) || 0);
    else if (['name', 'year', 'era', 'tagline', 'description', 'briefing', 'gmNotes', 'author'].includes(f)) (d as unknown as Record<string, string>)[f] = String(v);
  }
  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.name === 'brush') { this.brush = Number(t.value); this.render(); return; }
    if (t.name === 'tool') { this.tool = t.value as 'province' | 'country'; return; }
    if ((t.dataset.f === 'name' && t.dataset.p !== undefined) || (t.dataset.f === 'c' && t.dataset.a !== undefined)) this.render();
  }

  private say(m: string, err = false): void { this.msg = m; const el = this.root.querySelector<HTMLElement>('#s-msg'); if (el) { el.textContent = m; el.className = `g-msg ${err ? 'err' : 'ok'}`; } }

  private async onClick(e: Event): Promise<void> {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    const act = b.dataset.act; if (!act) return;
    const d = this.d, w = this.h.world;
    const idx = Number(b.dataset.i);
    if (act === 'exit') { this.h.onExit(); return; }
    if (act === 'load') { const v = (this.root.querySelector('#s-base') as HTMLSelectElement).value; this.loadBase(v); this.afterLoad(); this.say('불러왔습니다.'); return; }
    if (act === 'add-pol') {
      if (d.pols.length >= 100) { this.say('국가는 최대 100개까지 만들 수 있습니다.', true); return; }
      let n = d.pols.length + 1; while (d.pols.some((p) => p.id === `C${n}`)) n++;
      d.pols.push({ id: `C${n}`, name: `나라 ${n}`, color: PALETTE[(n - 1) % PALETTE.length], s: [60, 50, 50, 40], aliases: '' });
      this.brush = d.pols.length - 1; this.recolor(); this.render(); return;
    }
    if (act === 'del-pol') {
      const id = d.pols[idx]?.id; if (!id) return;
      d.owners = d.owners.map((o) => (o === idx ? -1 : o > idx ? o - 1 : o));
      d.pols.splice(idx, 1); d.relations = d.relations.filter((r) => r[0] !== id && r[1] !== id); d.wars = d.wars.filter((x) => x[0] !== id && x[1] !== id); d.armies = d.armies.filter((a) => a.c !== id);
      this.brush = Math.min(this.brush, d.pols.length - 1); this.recolor(); this.repaint(true); this.markers(); this.render(); return;
    }
    if (act === 'add-rel') {
      const a = (this.root.querySelector('#s-ra') as HTMLSelectElement).value, c = (this.root.querySelector('#s-rb') as HTMLSelectElement).value, v = clamp(Number((this.root.querySelector('#s-rv') as HTMLInputElement).value) || 0, -100, 100);
      if (a && c && a !== c) { d.relations = d.relations.filter((r) => !((r[0] === a && r[1] === c) || (r[0] === c && r[1] === a))); d.relations.push([a, c, v]); this.render(); }
      return;
    }
    if (act === 'del-rel') { d.relations.splice(idx, 1); this.render(); return; }
    if (act === 'add-war') {
      const a = (this.root.querySelector('#s-wa') as HTMLSelectElement).value, c = (this.root.querySelector('#s-wb') as HTMLSelectElement).value;
      if (a && c && a !== c && !d.wars.some((x) => (x[0] === a && x[1] === c) || (x[0] === c && x[1] === a))) { d.wars.push([a, c]); this.render(); }
      return;
    }
    if (act === 'del-war') { d.wars.splice(idx, 1); this.render(); return; }
    if (act === 'add-army') { if (d.armies.length >= 120) { this.say('군대는 최대 120개입니다.', true); return; } d.armies.push({ c: d.pols[Math.max(0, this.brush)]?.id ?? d.pols[0]?.id ?? '', n: '새 군대', g: '지휘관', skill: 6, trait: '', troops: 10, at: '', navy: false }); this.open.add('army'); this.render(); return; }
    if (act === 'del-army') { d.armies.splice(idx, 1); this.markers(); this.render(); return; }
    if (act === 'pick-army') { this.pickArmy = idx; this.say('지도에서 군대를 둘 주를 클릭하세요.'); return; }
    const sc = this.toScenario();
    const check = (): boolean => {
      const r = this.h.sanitize(sc);
      const empty = d.pols.filter((_, i) => !d.owners.includes(i)).map((p) => p.name);
      if (!r.ok) { this.say(`검증 실패: ${r.errors.join(' / ')}`, true); return false; }
      if (empty.length) { this.say(`영토가 없는 국가가 있습니다: ${empty.join(', ')}. 지도에서 칠하거나 삭제하세요.`, true); return false; }
      if (!d.name.trim()) { this.say('템플릿 이름을 입력하세요.', true); return false; }
      this.say(`검증 통과 ✔ (국가 ${d.pols.length}개, 군대 ${d.armies.filter((a) => a.at).length}개${r.warnings.length ? `, 경고: ${r.warnings.join(' / ')}` : ''})`);
      return true;
    };
    if (act === 'check') { check(); return; }
    if (act === 'test') { if (!check()) return; const pid = (this.root.querySelector('#s-player') as HTMLSelectElement).value; this.h.onTestPlay(sc, pid); return; }
    if (act === 'save') { if (!check()) return; this.h.onSave(sc); this.say('내 템플릿에 저장했습니다. 시작 화면의 템플릿 목록에서 고를 수 있습니다.'); return; }
    if (act === 'export') {
      if (!check()) return;
      const url = URL.createObjectURL(new Blob([templateToJson(sc)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `${d.id}.althist-template.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    if (act === 'share') {
      if (!check()) return;
      const cfg: ShareConfig = {
        owner: (this.root.querySelector('#s-so') as HTMLInputElement).value.trim(), repo: (this.root.querySelector('#s-sr') as HTMLInputElement).value.trim(),
        branch: (this.root.querySelector('#s-sb') as HTMLInputElement).value.trim(), dir: (this.root.querySelector('#s-sd') as HTMLInputElement).value.trim(),
      };
      const token = (this.root.querySelector('#s-tok') as HTMLInputElement).value;
      const meta: IndexEntry = { id: d.id, name: d.name, author: d.author || undefined, description: d.tagline || d.description.slice(0, 80), era: d.era, year: d.year, file: `${d.id}.json` };
      this.say('GitHub에 업로드하는 중…');
      try {
        this.h.setShareConfig(cfg);
        const url = await uploadTemplate(cfg, token, meta, templateToJson(sc));
        (this.root.querySelector('#s-tok') as HTMLInputElement).value = '';
        this.h.onSave(sc);
        this.say(`공유 완료 ✔ 갤러리에 등록했습니다. ${url}`);
      } catch (err) { this.say(err instanceof ShareError ? err.message : `업로드 실패: ${(err as Error).message}`, true); }
      return;
    }
    void w;
  }

  // ---------- 화면 ----------
  private render(): void {
    const keep = this.root.scrollTop;
    const d = this.d, E = this.h.esc, w = this.h.world;
    const polOpts = (sel: string) => d.pols.map((p) => `<option value="${E(p.id)}" ${p.id === sel ? 'selected' : ''}>${E(p.name)}</option>`).join('');
    const sec = (k: string, title: string, body: string) => `<details data-sec="${k}" ${this.open.has(k) ? 'open' : ''}><summary>${title}</summary><div class="s-sec">${body}</div></details>`;
    const cloneOpts = w.scenarios.filter((s) => s.polities && s.owners && s.polities.length <= 121).map((s) => `<option value="clone:${E(s.id)}">${E(s.name)} (${E(s.year ?? '')})</option>`).join('');
    const num = (f: string, v: number, extra = '') => `<input type="number" data-f="${f}" value="${v}" ${extra} />`;
    const sc = this.h.shareConfig();
    this.root.innerHTML = `
      <div class="s-head"><b>🛠 템플릿 스튜디오</b><button type="button" class="ghost small" data-act="exit">나가기</button></div>
      <div class="hint" style="margin-bottom:6px">지도를 클릭해 영토를 칠하고, 국가·군대를 만들어 템플릿으로 저장/공유하세요.</div>
      ${sec('base', '1. 시작점', `<div class="row"><select id="s-base"><option value="blank">빈 지도 (전부 기타 세력)</option><option value="modern20">현대 주요 26개국 기반</option><optgroup label="기존 템플릿 복제">${cloneOpts}</optgroup></select><button type="button" class="ghost small" data-act="load">불러오기</button></div><div class="hint">불러오면 지금 편집 중인 내용은 사라집니다.</div>`)}
      ${sec('info', '2. 기본 정보', `
        <label>이름</label><input data-f="name" value="${E(d.name)}" maxlength="40" />
        <div class="row2"><div><label>연도 표시</label><input data-f="year" value="${E(d.year)}" placeholder="1815년" maxlength="24" /></div><div><label>시대</label><select data-f="era">${ERAS.map((e) => `<option ${e === d.era ? 'selected' : ''}>${e}</option>`).join('')}</select></div></div>
        <label>한 줄 소개</label><input data-f="tagline" value="${E(d.tagline)}" maxlength="80" />
        <label>설명</label><textarea data-f="description" rows="2" maxlength="400">${E(d.description)}</textarea>
        <label>배경 브리핑 (AI가 참고하는 역사적 맥락)</label><textarea data-f="briefing" rows="3" maxlength="2000">${E(d.briefing)}</textarea>
        <label>GM 지침 (AI 판정 규칙: 특별한 장군·보정 등)</label><textarea data-f="gmNotes" rows="3" maxlength="3000" placeholder="">${E(d.gmNotes)}</textarea>
        <div class="row3"><div><label>시작 연도 (기원전은 음수)</label>${num('startYear', d.startYear)}</div><div><label>월</label>${num('startMonth', d.startMonth, 'min="1" max="12"')}</div><div><label>턴 길이(개월)</label>${num('turnMonths', d.turnMonths, 'min="1" max="24"')}</div></div>
        <label>제작자</label><input data-f="author" value="${E(d.author)}" maxlength="40" />`)}
      ${sec('pols', '3. 국가와 영토 칠하기', `
        <div class="row"><label class="inl"><input type="radio" name="tool" value="province" ${this.tool === 'province' ? 'checked' : ''}/> 주 하나씩</label><label class="inl"><input type="radio" name="tool" value="country" ${this.tool === 'country' ? 'checked' : ''}/> 현대 국가 전체</label></div>
        <div class="hint">아래에서 칠할 국가를 고른 뒤 지도를 클릭하세요.</div>
        <label class="prow"><input type="radio" name="brush" value="-1" ${this.brush === -1 ? 'checked' : ''}/> <i class="swatch" style="background:#5b6577"></i> 지우기 (기타 세력)</label>
        ${d.pols.map((p, i) => `<div class="prow ${this.brush === i ? 'cur' : ''}"><input type="radio" name="brush" value="${i}" ${this.brush === i ? 'checked' : ''}/>
          <input type="color" data-p="${i}" data-f="color" value="${E(p.color)}" /><input class="pn" data-p="${i}" data-f="name" value="${E(p.name)}" maxlength="30" />
          <span class="hint" data-count="${i}"></span><button type="button" class="ghost small" data-act="del-pol" data-i="${i}">✕</button>
          <div class="pst">${['안정', '경제', '군사', '영향'].map((l, k) => `<label>${l}${num(`s${k}`, p.s[k], `min="0" max="100" data-p="${i}"`)}</label>`).join('')}</div>
          <input class="pa" data-p="${i}" data-f="aliases" value="${E(p.aliases)}" placeholder="별칭 (쉼표로 구분, 규칙 모드 명령 인식용)" maxlength="120" /></div>`).join('')}
        <button type="button" class="ghost small" data-act="add-pol">+ 국가 추가</button>`)}
      ${sec('rel', '4. 관계·전쟁', `
        <div class="row"><select id="s-ra">${polOpts(d.pols[0]?.id ?? '')}</select><select id="s-rb">${polOpts(d.pols[1]?.id ?? '')}</select><input id="s-rv" type="number" value="0" min="-100" max="100" style="width:64px" /><button type="button" class="ghost small" data-act="add-rel">관계 추가</button></div>
        ${d.relations.map((r, i) => `<div class="li">${E(d.pols.find((p) => p.id === r[0])?.name ?? r[0])} ↔ ${E(d.pols.find((p) => p.id === r[1])?.name ?? r[1])} <b>${r[2] > 0 ? '+' : ''}${r[2]}</b><button type="button" class="ghost small" data-act="del-rel" data-i="${i}">✕</button></div>`).join('') || '<div class="hint">관계는 -100(적대)~+100(우호). 기본 0.</div>'}
        <div class="row" style="margin-top:8px"><select id="s-wa">${polOpts(d.pols[0]?.id ?? '')}</select><select id="s-wb">${polOpts(d.pols[1]?.id ?? '')}</select><button type="button" class="ghost small" data-act="add-war">⚔ 시작 시 전쟁 추가</button></div>
        ${d.wars.map((x, i) => `<div class="li">⚔ ${E(d.pols.find((p) => p.id === x[0])?.name ?? x[0])} ↔ ${E(d.pols.find((p) => p.id === x[1])?.name ?? x[1])}<button type="button" class="ghost small" data-act="del-war" data-i="${i}">✕</button></div>`).join('')}`)}
      ${sec('army', '5. 군대와 장군', `
        <div class="hint">군대가 없는 국가는 국력에 맞춰 자동 생성됩니다. 군대를 직접 만들면 그 국가는 만든 군대만 갖습니다. 병력 단위는 천 명.</div>
        ${d.armies.map((a, i) => `<div class="arow"><div class="row"><select data-a="${i}" data-f="c">${polOpts(a.c)}</select><input data-a="${i}" data-f="n" value="${E(a.n)}" placeholder="군대 이름" /></div>
          <div class="row"><input data-a="${i}" data-f="g" value="${E(a.g)}" placeholder="장군 이름" /><label>능력${num('skill', a.skill, `min="1" max="10" data-a="${i}"`)}</label><label>병력${num('troops', a.troops, `min="0.5" step="0.5" data-a="${i}"`)}</label></div>
          <div class="row"><input data-a="${i}" data-f="t" value="${E(a.trait)}" placeholder="특성" /><label class="inl"><input type="checkbox" data-a="${i}" data-f="navy" ${a.navy ? 'checked' : ''}/>함대</label></div>
          <div class="row"><button type="button" class="ghost small" data-act="pick-army" data-i="${i}">📍 위치 지정</button><span class="hint">${a.at ? E(w.provLabel(a.at)) : '위치 미지정(저장 시 제외됨)'}</span><button type="button" class="ghost small" data-act="del-army" data-i="${i}">✕</button></div></div>`).join('')}
        <button type="button" class="ghost small" data-act="add-army">+ 군대 추가</button>`)}
      ${sec('save', '6. 검증·테스트·저장·공유', `
        <div class="row"><button type="button" class="ghost small" data-act="check">검증</button><select id="s-player">${polOpts(d.pols[Math.max(0, this.brush)]?.id ?? '')}</select><button type="button" class="ghost small" data-act="test">▶ 테스트 플레이</button></div>
        <div class="row"><button type="button" class="primary small" data-act="save">내 템플릿에 저장</button><button type="button" class="ghost small" data-act="export">파일로 내보내기</button></div>
        <details class="share" data-sec="share" ${this.open.has('share') ? 'open' : ''}><summary>🌐 공유 갤러리에 올리기 (GitHub)</summary><div class="s-sec">
          <div class="hint">공유 저장소의 폴더에 템플릿 파일과 index.json 을 올립니다. 저장소에 쓸 수 있는 GitHub 토큰(Fine-grained, Contents: Read and write)이 필요하며, 토큰은 저장하지 않고 이 요청에만 씁니다.</div>
          <div class="row2"><div><label>소유자</label><input id="s-so" value="${E(sc.owner)}" /></div><div><label>저장소</label><input id="s-sr" value="${E(sc.repo)}" /></div></div>
          <div class="row2"><div><label>브랜치</label><input id="s-sb" value="${E(sc.branch)}" /></div><div><label>폴더</label><input id="s-sd" value="${E(sc.dir)}" /></div></div>
          <label>GitHub 토큰</label><input id="s-tok" type="password" autocomplete="off" placeholder="github_pat_…" />
          <button type="button" class="primary small" data-act="share">업로드</button></div></details>
        <div id="s-msg" class="g-msg ${this.msg ? '' : ''}">${E(this.msg)}</div>`)}`;
    this.root.scrollTop = keep;
    this.counts();
  }
}
