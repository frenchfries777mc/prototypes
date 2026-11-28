import type { World } from '../data/world';
import { SHOWN_STATS, STAT_LABEL } from '../data/types';
import type { GameState, TurnRecord } from '../engine/state';
import { fmtDate } from '../engine/state';
import { P } from '../util/josa';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const paras = (t: string): string[] => t.split(/\n+/).map((x) => x.trim()).filter(Boolean);

/** 이번 호의 대표 제목. */
export function headlineOf(rec: TurnRecord): string {
  const mainHl = rec.main ? rec.main.headlines : rec.headlines, worldHl = rec.world ? rec.world.headlines : [];
  return mainHl[0] ?? worldHl[0] ?? (rec.outcome === 'pass' ? '이번 달은 조용히 지나갔다' : rec.interpretation || rec.command);
}

/**
 * 신문 한 호. 소식만 싣는다: 성패 도장·확률·굴림·난이도·판정 AI·엔진 거부 같은 게임 판정 정보는 싣지 않는다.
 * 수치 변화(능력치·영토·관계)는 숫자 표가 아니라 기사 문장으로 풀어 쓴다.
 */
export function renderPaper(rec: TurnRecord, ctx: { world: World; state: GameState; playerName: string; scenario: string; era: string }): string {
  const w = ctx.world;
  const L = (c: string) => w.label(c);
  const r = rec.report;
  const mainNarr = rec.main?.narrative ?? rec.narrative;
  const worldNarr = rec.world ? rec.world.narrative : '';
  const mainHl = rec.main ? rec.main.headlines : rec.headlines;
  const worldHl = rec.world ? rec.world.headlines : [];
  const sub = rec.outcome === 'pass' ? '명령 없이 시간이 흘렀다' : rec.interpretation || rec.command;
  const era = ({ 고대: 'ancient', 중세: 'medieval', 근세: 'early', 근대: 'modern', 현대: 'now' } as Record<string, string>)[ctx.era] ?? 'early';

  const li = (xs: string[]) => `<ul class="np-notes">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const section = (title: string, inner: string) => (inner ? `<section class="np-col"><h3>${title}</h3>${inner}</section>` : '');

  // ── 외교 소식: 전쟁·휴전과 관계 변화를 문장으로
  const diplo: string[] = [...(rec.diplo ?? [])]; // 세력 AI·주변국의 행동과 반응이 맨 앞
  if (r) {
    const pair = (k: string) => { const [a, b] = k.split('|'); return `${P(L(a), '와/과')} ${L(b)}`; };
    for (const k of r.warsStart) diplo.push(`${pair(k)} 사이에 전쟁이 시작되었다.`);
    for (const k of r.warsEnd) diplo.push(`${pair(k)} 사이에 휴전 또는 평화가 이루어졌다.`);
    for (const x of r.rel) {
      const d = x.to - x.from, mag = Math.abs(d) >= 20 ? '크게' : Math.abs(d) >= 8 ? '뚜렷이' : '다소';
      diplo.push(`${P(L(x.c), '와/과')}의 관계가 ${mag} ${d > 0 ? '가까워졌다' : '멀어졌다'}.`);
    }
  }
  // ── 전선 소식: 군대·장군·점령 소식(엔진이 남긴 소식)과 영토 변동
  const front = rec.notes.filter((n) => /^(🚩|📍|🏳|🗺|📜|🩹|🛡|⚰|⛓|☠|🪖|💀)/u.test(n));
  const terr: string[] = [];
  if (r) {
    const names = (ids: string[]) => ids.slice(0, 5).map((id) => w.provLabel(id)).join(', ') + (ids.length > 5 ? ` 등 ${ids.length}곳` : '');
    if (r.gained.length) terr.push(`${names(r.gained)} 지역을 새로 확보했다.`);
    if (r.lost.length) terr.push(`${names(r.lost)} 지역을 잃었다.`);
  }
  // ── 국정 동향: 능력치 변화를 문장으로
  const home: string[] = [];
  if (r) {
    const word: Record<string, string> = { stability: '정국 안정도', economy: '경제 지표', military: '군사력', influence: '국제적 영향력' };
    for (const k of SHOWN_STATS) {
      const [a, b] = r.stats[k] ?? [0, 0]; const d = b - a;
      if (d) home.push(`${P(word[k] ?? STAT_LABEL[k], '이/가')} ${a}에서 ${P(String(b), '으로/로')} ${d > 0 ? '올랐다' : '내려앉았다'}.`);
    }
  }
  const others = rec.notes.filter((n) => !front.includes(n));

  const worldBox = section('🌍 세계 소식', (worldHl.length ? `<ul class="np-flash">${worldHl.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '') + paras(worldNarr).map((t) => `<p>${esc(t)}</p>`).join(''));
  const frontBox = section('⚔ 전선 소식', front.length || terr.length ? li([...front, ...terr]) : '');
  const diploBox = section('🤝 외교 소식', diplo.length ? li(diplo) : '');
  const homeBox = section('🏛 국정 동향', home.length || others.length ? li([...home, ...others]) : '');
  const boxes = [worldBox, frontBox, diploBox, homeBox].filter(Boolean);
  const bottom = boxes.join('');

  const subHeads = mainHl.slice(1).map((h) => `<h3 class="np-subhl">${esc(h)}</h3>`).join('');
  const body = paras(mainNarr).map((t) => `<p>${esc(t)}</p>`).join('') || '<p class="np-none">전해진 소식이 없다.</p>';

  return `<article class="np np-${era}${rec.alert ? ' np-extra' : ''}">
    ${rec.alert ? '<div class="np-extra-bar"><b>호 외</b><span>큰 사건이 일어났습니다</span><b>호 외</b></div>' : ''}
    <div class="np-top"><span>제 ${rec.turn}호</span><span>${esc(fmtDate(rec.date))}</span><span>${esc(ctx.scenario)}</span></div>
    <h1 class="np-name">${esc(ctx.playerName)} 일보</h1>
    <div class="np-motto"><span>국정 속보판</span></div>
    <div class="np-lead">
      <h2 class="np-hl">${esc(headlineOf(rec))}</h2>
      <div class="np-sub">${esc(sub)}</div>
      ${subHeads}
      <div class="np-body ${mainNarr.length >= 60 ? 'long' : ''}">${body}</div>
    </div>
    ${bottom ? `<div class="np-bottom" style="--n:${boxes.length}">${bottom}</div>` : ''}
  </article>`;
}
