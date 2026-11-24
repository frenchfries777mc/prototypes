import type { CountryId } from '../data/types';
import type { World } from '../data/world';
import type { Adjudication, Diff } from '../engine/diff';
import { makeRng } from '../engine/rng';
import type { GameState } from '../engine/state';
import { clamp, controlledBy, getRel, isAlive, isAtWar, neighborsOf, warsOf } from '../engine/state';
import { P } from '../util/josa';

/**
 * 규칙 모드: LLM 없이 키워드로 명령을 해석하는 단순 판정기. 키/네트워크 없이 바로 플레이할 수 있게 한다.
 * (LLM 모드와 똑같은 Adjudication 형식을 만들어서 엔진 경로가 하나로 통일된다.)
 */
export function localAdjudicate(s: GameState, w: World, command: string, pass: boolean): Adjudication {
  const rng = makeRng((s.seed ^ Math.imul(s.turn + 7, 2654435761)) >>> 0);
  const R = () => rng.next();
  const pid = s.playerId;
  const L = (c: CountryId) => w.label(c);
  const text = command.toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const empty: Diff = {};

  const world_events = worldEvents(s, w, R, pid);
  if (pass || !command.trim()) {
    return { interpretation: '이번 달은 특별한 명령 없이 현상 유지', feasibility: 100, reasoning: '', if_success: empty, if_failure: empty, world_events };
  }

  const mentioned = w.findCountries(text).filter((c) => c !== pid && isAlive(s, c));
  const provMentions = w.findProvinces(text).filter((p) => s.owner[p] !== pid);
  const provTarget = provMentions.length ? s.controller[provMentions[0]] : undefined;
  let target: CountryId | undefined = mentioned[0] ?? (provTarget !== pid ? provTarget : undefined);
  const st = (c: CountryId) => s.stats[c];
  const me = st(pid);
  const done = (x: Omit<Adjudication, 'world_events' | 'reasoning'> & { reasoning?: string }): Adjudication => ({ reasoning: '', ...x, world_events });

  const WAR = /선전\s*포고|침공|공격|전쟁|쳐들어|점령|정복|invade|attack|declare war|conquer|occupy|annex|합병|병합|할양/;
  const PEACE = /평화|휴전|종전|화친|peace|ceasefire|armistice/;
  const ALLY = /동맹|연합|조약|우호|협력|협상|외교|ally|alliance|treaty|cooperat|diplomac|negotiat|수교/;
  const SANCTION = /제재|봉쇄|금수|관세|sanction|embargo|tariff|blockade/;
  const INVEST = /투자|경제|무역|산업|개발|성장|invest|trade|econom|industr|develop|growth|infrastructure|인프라/;
  const MIL = /군사|군비|무장|국방|징병|병력|훈련|군대|무기|military|army|defen[cs]e|conscript|rearm|weapon|navy|air force/;
  const REFORM = /개혁|복지|민생|안정|선거|reform|welfare|stabil|election|social/;

  // ---- 전쟁/점령 ----
  if (has(WAR)) {
    if (!target) {
      const hostile = [...neighborsOf(s, w, pid).keys()].sort((a, b) => getRel(s, pid, a) - getRel(s, pid, b))[0];
      target = hostile;
    }
    if (!target) return done({ interpretation: '공격 대상이 불분명하다', feasibility: 0, if_success: empty, if_failure: { narrative: '공격할 상대를 특정하지 못해 아무 일도 일어나지 않았다. 국가명을 명령에 넣어 보세요.' } });
    const t = target;
    const mine = new Set(controlledBy(s, pid));
    const cands: string[] = [];
    for (let i = 0; i < w.provinces.length; i++) {
      const id = w.provinces[i].id;
      if (s.controller[id] !== t || !(mine.size)) continue;
      if (w.reach[i].some((j) => mine.has(w.provinces[j].id))) cands.push(id);
    }
    if (!cands.length) {
      return done({ interpretation: `${L(t)}에 대한 군사 행동`, feasibility: 0, reasoning: '작전 가능 범위(인접/해협) 밖',
        if_success: empty, if_failure: { narrative: `${P(L(t), '은/는')} 아군의 작전 가능 범위 밖에 있어 공격할 수 없다. 인접하거나 해협 건너 닿는 상대만 공격할 수 있다.` } });
    }
    const ratio = me.military / (me.military + st(t).military + 1);
    const feas = clamp(Math.round(12 + 70 * ratio), 5, 85);
    const preferred = provMentions.filter((p) => cands.includes(p));
    const pool = preferred.length ? preferred : cands;
    const count = ratio > 0.7 && cands.length <= 8 ? 2 : 1;
    const picks: string[] = [];
    while (picks.length < Math.min(count, pool.length)) { const p = pool[Math.floor(R() * pool.length)]; if (!picks.includes(p)) picks.push(p); }
    const war = isAtWar(s, pid, t) ? [] : [{ a: pid, b: t }];
    const names = picks.map((p) => w.provLabel(p)).join(', ');
    return done({
      interpretation: `${P(L(t), '을/를')} 군사적으로 공격해 ${names}${P(count > 1 ? ' 등' : '', '을/를')} 노린다`, feasibility: feas,
      reasoning: `군사력 ${me.military} 대 ${st(t).military}`,
      if_success: {
        narrative: `${L(pid)}군이 ${L(t)} 영내로 진격해 ${P(names, '을/를')} 장악했다. 전선은 아군에 유리하게 움직였지만 병력 손실도 적지 않았다.`,
        headlines: [`${L(pid)}군, ${names} 점령`], declare_war: war,
        province_transfers: picks.map((p) => ({ province: p, to: pid, kind: 'controller' as const })),
        stat_changes: [{ country: t, stat: 'stability', delta: -4 }, { country: t, stat: 'military', delta: -3 }, { country: pid, stat: 'military', delta: -2 }],
      },
      if_failure: {
        narrative: `${L(pid)}군의 공세는 ${L(t)}의 방어선에 막혀 큰 피해만 입고 교착되었다. 국내 여론도 악화되었다.`,
        headlines: [`${L(pid)}의 ${L(t)} 공세 좌초`], declare_war: war,
        stat_changes: [{ country: pid, stat: 'military', delta: -4 }, { country: pid, stat: 'stability', delta: -3 }, { country: t, stat: 'military', delta: -1 }],
        relation_changes: [{ a: pid, b: t, delta: -10 }],
      },
    });
  }

  // ---- 평화 ----
  if (has(PEACE)) {
    const wars = warsOf(s, pid);
    const t = target && wars.includes(target) ? target : wars[0];
    if (!t) return done({ interpretation: '평화 협상 시도', feasibility: 0, if_success: empty, if_failure: { narrative: '현재 전쟁 중인 상대가 없어 평화 협상이 필요하지 않다.' } });
    const feas = clamp(Math.round(45 + getRel(s, pid, t) / 3), 10, 80);
    return done({
      interpretation: `${P(L(t), '와/과')} 휴전·평화 협상`, feasibility: feas,
      if_success: { narrative: `${P(L(pid), '와/과')} ${P(L(t), '은/는')} 중재 끝에 휴전에 합의했다. 포성은 멎었지만 점령지 문제는 남았다.`, headlines: [`${L(pid)}-${L(t)} 휴전 합의`], make_peace: [{ a: pid, b: t }], stat_changes: [{ country: pid, stat: 'stability', delta: 2 }] },
      if_failure: { narrative: `${P(L(t), '은/는')} 협상 제안을 거부했다. 전쟁은 계속된다.`, headlines: [`${L(t)}, 휴전 제안 거부`], relation_changes: [{ a: pid, b: t, delta: -5 }], stat_changes: [{ country: pid, stat: 'stability', delta: -1 }] },
    });
  }

  // ---- 제재 ----
  if (has(SANCTION) && target) {
    const t = target;
    const feas = clamp(Math.round(40 + (me.influence - st(t).influence) / 2), 15, 85);
    return done({
      interpretation: `${L(t)}에 대한 경제 제재`, feasibility: feas,
      if_success: { narrative: `${P(L(pid), '은/는')} ${L(t)}에 대한 무역·금융 제재를 발효했다. ${L(t)}의 경제가 타격을 입었다.`, headlines: [`${L(pid)}, ${L(t)} 제재 발효`], relation_changes: [{ a: pid, b: t, delta: -15 }], stat_changes: [{ country: t, stat: 'economy', delta: -3 }, { country: pid, stat: 'economy', delta: -1 }] },
      if_failure: { narrative: `제재는 우회로와 제3국의 이탈로 실효를 거두지 못했고, ${L(pid)}만 무역 손실을 입었다.`, headlines: [`${L(pid)} 대(對)${L(t)} 제재 실효성 논란`], relation_changes: [{ a: pid, b: t, delta: -8 }], stat_changes: [{ country: pid, stat: 'economy', delta: -2 }, { country: pid, stat: 'influence', delta: -1 }] },
    });
  }

  // ---- 외교/동맹 ----
  if (has(ALLY) && target) {
    const t = target;
    const feas = clamp(Math.round(50 + getRel(s, pid, t) / 3 + (me.influence - st(t).influence) / 6), 10, 90);
    return done({
      interpretation: `${P(L(t), '와/과')} 외교·협력 강화`, feasibility: feas,
      if_success: { narrative: `${P(L(pid), '와/과')} ${P(L(t), '은/는')} 정상회담에서 협력 강화에 합의했다. 양국 관계가 눈에 띄게 개선되었다.`, headlines: [`${L(pid)}-${L(t)} 협력 강화 합의`], relation_changes: [{ a: pid, b: t, delta: 15 }], stat_changes: [{ country: pid, stat: 'influence', delta: 1 }] },
      if_failure: { narrative: `${P(L(t), '은/는')} 구체적 약속을 피했고 회담은 별 성과 없이 끝났다.`, headlines: [`${L(pid)}-${L(t)} 회담 성과 없이 종료`], relation_changes: [{ a: pid, b: t, delta: -4 }] },
    });
  }

  // ---- 경제 투자 ----
  if (has(INVEST)) {
    return done({
      interpretation: '경제 투자와 산업 육성', feasibility: clamp(Math.round(55 + (me.stability - 50) / 2), 25, 90),
      if_success: { narrative: `${L(pid)} 정부의 투자 계획이 순조롭게 집행되어 산업 생산과 고용이 개선되었다.`, headlines: [`${L(pid)}, 경제 성장세 강화`], stat_changes: [{ country: pid, stat: 'economy', delta: 4 }, { country: pid, stat: 'stability', delta: 1 }] },
      if_failure: { narrative: `예산 집행이 지연되고 일부 사업에서 비리가 드러나 효과가 미미했다.`, headlines: [`${L(pid)} 투자 사업 차질`], stat_changes: [{ country: pid, stat: 'economy', delta: -1 }, { country: pid, stat: 'stability', delta: -2 }] },
    });
  }

  // ---- 군비 ----
  if (has(MIL)) {
    return done({
      interpretation: '군비 증강과 병력 확충', feasibility: 75,
      if_success: { narrative: `${P(L(pid), '은/는')} 국방 예산을 늘리고 병력과 장비를 확충했다. 군사력은 강해졌지만 재정 부담이 커졌다.`, headlines: [`${L(pid)}, 군비 증강 가속`], stat_changes: [{ country: pid, stat: 'military', delta: 5 }, { country: pid, stat: 'economy', delta: -2 }] },
      if_failure: { narrative: `조달 비리와 지연으로 군 현대화는 계획보다 더뎠고 국민 불만이 커졌다.`, headlines: [`${L(pid)} 군 현대화 차질`], stat_changes: [{ country: pid, stat: 'military', delta: 2 }, { country: pid, stat: 'stability', delta: -2 }] },
    });
  }

  // ---- 내정 개혁 ----
  if (has(REFORM)) {
    return done({
      interpretation: '내정 개혁과 사회 안정', feasibility: clamp(Math.round(50 + (me.stability - 40) / 2), 25, 85),
      if_success: { narrative: `${P(L(pid), '은/는')} 개혁안을 통과시켜 사회적 갈등을 누그러뜨렸다.`, headlines: [`${L(pid)}, 개혁안 통과`], stat_changes: [{ country: pid, stat: 'stability', delta: 5 }, { country: pid, stat: 'economy', delta: -1 }] },
      if_failure: { narrative: `개혁안은 의회와 이익집단의 반발에 부딪혀 좌초되었고 정국이 혼란해졌다.`, headlines: [`${L(pid)} 개혁안 좌초`], stat_changes: [{ country: pid, stat: 'stability', delta: -3 }] },
    });
  }

  // ---- 해석 불가 ----
  return done({
    interpretation: '명령 해석 불분명 (규칙 모드)', feasibility: 60,
    reasoning: '규칙 모드는 일부 키워드(공격, 평화, 동맹, 제재, 투자, 군비, 개혁)만 이해한다. Gemini 모드에서는 자유 문장을 쓸 수 있다.',
    if_success: { narrative: `${L(pid)} 정부는 지시를 검토했지만 구체적 행동으로 이어지지는 않았다. (규칙 모드는 "공격/평화/동맹/제재/투자/군비/개혁" 같은 키워드와 국가명을 이해합니다.)`, stat_changes: [{ country: pid, stat: 'stability', delta: 1 }] },
    if_failure: { narrative: `${L(pid)} 정부의 지시는 관료 조직에서 흐지부지되었다.` },
  });
}

/** 세계 사건: 진행 중인 전쟁의 전선 이동, 국경 긴장, 내정 변동. 모두 시드 난수로 결정된다. */
function worldEvents(s: GameState, w: World, R: () => number, pid: CountryId): Diff {
  const d: Required<Diff> = { narrative: '', headlines: [], declare_war: [], make_peace: [], province_transfers: [], relation_changes: [], stat_changes: [] };
  const L = (c: CountryId) => w.label(c);
  const lines: string[] = [];
  const taken = new Set<string>();

  // 1) 진행 중인 전쟁
  for (const wk of s.wars.slice(0, 12)) {
    const [a, b] = wk.split('|');
    if (!isAlive(s, a) || !isAlive(s, b)) continue;
    const sa = s.stats[a].military + R() * 25, sb = s.stats[b].military + R() * 25;
    const [win, lose] = sa >= sb ? [a, b] : [b, a];
    const roll = R();
    if (roll < 0.26) {
      const cands: string[] = [];
      for (let i = 0; i < w.provinces.length; i++) {
        const id = w.provinces[i].id;
        if (s.controller[id] !== lose || taken.has(id)) continue;
        if (w.reach[i].some((j) => s.controller[w.provinces[j].id] === win)) cands.push(id);
      }
      if (cands.length) {
        const p = cands[Math.floor(R() * cands.length)];
        taken.add(p);
        d.province_transfers.push({ province: p, to: win, kind: 'controller' });
        const retake = s.owner[p] === win;
        d.headlines.push(retake ? `${L(win)}군, ${P(w.provLabel(p), '을/를')} 탈환` : `${L(win)}군, ${L(lose)}의 ${w.provLabel(p)} 점령`);
        lines.push(retake ? `${L(win)}-${L(lose)} 전선에서 ${L(win)}군이 빼앗겼던 ${P(w.provLabel(p), '을/를')} 되찾았다.` : `${L(win)}-${L(lose)} 전선에서 ${L(win)}군이 ${P(w.provLabel(p), '을/를')} 장악했다.`);
        d.stat_changes.push({ country: lose, stat: 'stability', delta: -3 }, { country: win, stat: 'military', delta: -1 });
      }
    } else if (roll < 0.32) {
      d.make_peace.push({ a, b });
      d.headlines.push(`${L(a)}-${L(b)} 휴전 합의`);
      lines.push(`${P(L(a), '와/과')} ${P(L(b), '이/가')} 휴전에 합의했다.`);
    }
  }

  // 2) 국경 긴장 / 신규 전쟁
  let newWar = false;
  const ids = Object.keys(s.stats).filter((c) => isAlive(s, c));
  for (let k = 0; k < 14 && d.headlines.length < 4; k++) {
    const x = ids[Math.floor(R() * ids.length)];
    const nbs = [...neighborsOf(s, w, x).keys()];
    if (!nbs.length) continue;
    const y = nbs[Math.floor(R() * nbs.length)];
    const rel = getRel(s, x, y);
    if (isAtWar(s, x, y) || rel > -35) continue;
    if (!newWar && rel < -70 && s.stats[x].military > s.stats[y].military * 1.8 && R() < 0.1 && x !== pid) {
      newWar = true;
      d.declare_war.push({ a: x, b: y });
      d.headlines.push(`${L(x)}, ${L(y)}에 전쟁 선포`);
      lines.push(`누적된 갈등 끝에 ${P(L(x), '이/가')} ${L(y)}에 전쟁을 선포했다.`);
    } else if (R() < 0.25) {
      d.relation_changes.push({ a: x, b: y, delta: -6 });
      d.headlines.push(`${L(x)}-${L(y)} 국경 긴장 고조`);
    }
  }

  // 3) 내정
  for (let k = 0; k < 3; k++) {
    const c = ids[Math.floor(R() * ids.length)];
    const sc = s.stats[c];
    if (sc.stability < 35 && R() < 0.5) {
      d.stat_changes.push({ country: c, stat: 'stability', delta: -3 });
      if (d.headlines.length < 5) d.headlines.push(`${L(c)}에서 대규모 시위·정치 불안`);
    } else if (sc.economy > 60 && R() < 0.12) {
      d.stat_changes.push({ country: c, stat: 'economy', delta: 2 });
    }
  }
  d.narrative = lines.join(' ');
  return d;
}
