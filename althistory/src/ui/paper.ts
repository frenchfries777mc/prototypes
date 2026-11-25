import type { World } from '../data/world';
import { STAT_KEYS, STAT_LABEL } from '../data/types';
import type { GameState, TurnRecord } from '../engine/state';
import { fmtDate } from '../engine/state';
import { diffName } from '../engine/difficulty';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const paras = (t: string): string[] => t.split(/\n+/).map((x) => x.trim()).filter(Boolean);

/** 이번 호의 대표 제목. */
export function headlineOf(rec: TurnRecord): string {
  const mainHl = rec.main ? rec.main.headlines : rec.headlines, worldHl = rec.world ? rec.world.headlines : [];
  return mainHl[0] ?? worldHl[0] ?? (rec.outcome === 'pass' ? '이번 달은 조용히 지나갔다' : rec.interpretation || rec.command);
}

/** 신문에 실리는 기사거리: 이번 호의 모든 정보를 한 장에 모은다. */
export function renderPaper(rec: TurnRecord, ctx: { world: World; state: GameState; playerName: string; scenario: string; era: string }): string {
  const { world: w, state: s } = ctx;
  const L = (c: string) => esc(w.label(c));
  const r = rec.report;
  const mainNarr = rec.main?.narrative ?? rec.narrative;
  const worldNarr = rec.world ? rec.world.narrative : '';
  const mainHl = rec.main ? rec.main.headlines : rec.headlines;
  const worldHl = rec.world ? rec.world.headlines : [];
  const headline = headlineOf(rec);
  const sub = rec.outcome === 'pass' ? '명령 없이 시간이 흘렀다' : rec.interpretation || rec.command;
  const stamp = rec.outcome === 'pass' ? '' : `<div class="np-stamp ${rec.outcome}">${rec.outcome === 'success' ? '성 공' : '실 패'}</div>`;
  const adjusted = rec.base !== undefined && rec.base !== rec.feasibility;
  const era = ({ 고대: 'ancient', 중세: 'medieval', 근세: 'early', 근대: 'modern', 현대: 'now' } as Record<string, string>)[ctx.era] ?? 'early';

  const chance = rec.outcome === 'pass' ? '' : `<div class="np-odds">
      <div class="np-odds-bar" title="굴림 ${rec.roll} / 성공 확률 ${rec.feasibility}%"><i style="width:${rec.feasibility}%"></i><b style="left:${Math.min(99, rec.roll)}%"></b></div>
      <div class="np-odds-txt">성공 확률 <b>${rec.feasibility}%</b>${adjusted ? ` <span>(AI 판단 ${rec.base}% → 난이도 ${esc(diffName(rec.difficulty ?? 'normal'))} 보정)</span>` : ''} · 굴림 <b>${rec.roll}</b></div></div>`;

  const statRows = r ? STAT_KEYS.map((k) => {
    const [a, b] = r.stats[k] ?? [0, 0], d = b - a;
    return `<tr><th>${STAT_LABEL[k]}</th><td>${a}</td><td class="arr">→</td><td><b>${b}</b></td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}` : '–'}</td></tr>`;
  }).join('') : '';
  const terrBox = r ? (() => {
    const [a, b] = r.terr, d = b - a;
    const chips = (ids: string[], cls: string) => ids.slice(0, 8).map((id) => `<span class="np-chip ${cls}">${esc(w.provLabel(id))}</span>`).join('') + (ids.length > 8 ? `<span class="np-chip more">외 ${ids.length - 8}곳</span>` : '');
    return `<section class="np-box"><h4>영토</h4><div class="np-terr"><b>${a}</b>주 → <b>${b}</b>주 <span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? `(${sign(d)})` : '(변동 없음)'}</span></div>
      ${r.gained.length ? `<div class="np-chips"><em>얻음</em>${chips(r.gained, 'gain')}</div>` : ''}${r.lost.length ? `<div class="np-chips"><em>잃음</em>${chips(r.lost, 'loss')}</div>` : ''}</section>`;
  })() : '';

  const pairLabel = (k: string) => { const [a, b] = k.split('|'); return `${L(a)} ↔ ${L(b)}`; };
  const diplo: string[] = [];
  if (r) {
    for (const k of r.warsStart) diplo.push(`<li class="war">⚔ ${pairLabel(k)} <b>전쟁 시작</b></li>`);
    for (const k of r.warsEnd) diplo.push(`<li class="peace">🕊 ${pairLabel(k)} <b>휴전·평화</b></li>`);
    for (const x of r.rel) diplo.push(`<li><span>${L(x.c)}</span><span class="rel ${x.to > x.from ? 'up' : 'down'}">${sign(x.from)} → <b>${sign(x.to)}</b></span></li>`);
  }
  // 엔진이 남긴 소식을 이모지로 나눈다: 전선(군대·장군·점령) / 그 밖
  const front = rec.notes.filter((n) => /^(🚩|📍|🏳|🗺|📜|🩹|🛡|⚰|⛓|☠|🪖|💀)/u.test(n));
  const others = rec.notes.filter((n) => !front.includes(n));

  const worldBox = (worldNarr || worldHl.length) ? `<section class="np-col"><h3>🌍 세계 소식</h3>${worldHl.length ? `<ul class="np-flash">${worldHl.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}${paras(worldNarr).map((t) => `<p>${esc(t)}</p>`).join('')}</section>` : '';
  const frontBox = front.length ? `<section class="np-col"><h3>⚔ 전선 소식</h3><ul class="np-notes">${front.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : '';
  const diploBox = diplo.length ? `<section class="np-col"><h3>🤝 외교·관계</h3><ul class="np-rels">${diplo.join('')}</ul></section>` : '';
  const otherBox = others.length ? `<section class="np-col"><h3>📋 기타</h3><ul class="np-notes">${others.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : '';
  const bottom = [worldBox, frontBox, diploBox, otherBox].filter(Boolean).join('');
  const subHeads = mainHl.slice(1).map((h) => `<h3 class="np-subhl">${esc(h)}</h3>`).join('');
  const body = paras(mainNarr).map((t) => `<p>${esc(t)}</p>`).join('') || '<p class="np-none">전해진 소식이 없다.</p>';

  return `<article class="np np-${era}">
    <div class="np-top"><span>제 ${rec.turn}호</span><span>${esc(fmtDate(rec.date))}</span><span>${esc(ctx.scenario)}</span></div>
    <h1 class="np-name">${esc(ctx.playerName)} 일보</h1>
    <div class="np-motto"><span>국정 속보판</span><span>난이도 ${esc(diffName(rec.difficulty ?? s.difficulty ?? 'normal'))}</span><span>판정 ${esc(rec.mode)}</span></div>
    <div class="np-main">
      <div class="np-lead">
        <h2 class="np-hl">${esc(headline)}</h2>
        <div class="np-sub">${esc(sub)}</div>
        ${subHeads}
        <div class="np-body ${mainNarr.length >= 60 ? 'long' : ''}">${body}</div>
        ${rec.reasoning ? `<section class="np-analysis"><h4>편집부 분석</h4><p>${esc(rec.reasoning)}</p></section>` : ''}
      </div>
      <aside class="np-side">
        <section class="np-box np-order"><h4>${rec.outcome === 'pass' ? '이번 달' : `${esc(ctx.playerName)}의 명령`}</h4>${stamp}
          <div class="np-cmd">${rec.command ? `“${esc(rec.command)}”` : '특별한 명령 없음'}</div>${chance}</section>
        ${r ? `<section class="np-box"><h4>국정 지표</h4><table class="np-stats">${statRows}</table></section>` : ''}
        ${terrBox}
      </aside>
    </div>
    ${bottom ? `<div class="np-bottom">${bottom}</div>` : ''}
    ${rec.rejected.length ? `<div class="np-rej"><b>정정 보도</b> · ${rec.rejected.map((h) => esc(h)).join(' / ')}</div>` : ''}
  </article>`;
}
