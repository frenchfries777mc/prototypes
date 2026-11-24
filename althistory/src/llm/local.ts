import type { CountryId, ProvinceId } from '../data/types';
import type { World } from '../data/world';
import type { Adjudication, Diff } from '../engine/diff';
import { armyPower, eraScale, moveHops, reachWithin, winChance } from '../engine/armies';
import { makeRng } from '../engine/rng';
import type { Army, GameState } from '../engine/state';
import { armiesOf, clamp, controlledBy, getRel, isAlive, isAtWar, neighborsOf, totalTroops, warsOf } from '../engine/state';
import { P } from '../util/josa';

type DiffFull = Required<Diff>;
const emptyDiff = (): DiffFull => ({ narrative: '', headlines: [], declare_war: [], make_peace: [], province_transfers: [], relation_changes: [], stat_changes: [], army_moves: [], army_changes: [], army_new: [] });
const r1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * 규칙 모드: LLM 없이 키워드로 명령을 해석하는 판정기. 키/네트워크 없이 바로 플레이할 수 있게 한다.
 * 군대와 장군이 중심이다: 점령은 군대가 하고, 전투 확률은 병력·장군 능력·사기·보정에서 계산한다.
 * (LLM 모드와 똑같은 Adjudication 형식을 만들어서 엔진 경로가 하나로 통일된다.)
 */
export function localAdjudicate(s: GameState, w: World, command: string, pass: boolean): Adjudication {
  const rng = makeRng((s.seed ^ Math.imul(s.turn + 7, 2654435761)) >>> 0);
  const R = () => rng.next();
  const pid = s.playerId;
  const sc = w.active;
  const L = (c: CountryId) => w.label(c);
  const mod = (c: CountryId) => sc.milMod?.[c] ?? 0;
  const old = ['고대', '중세', '근세'].includes(sc.era ?? '');
  const text = command.toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const empty = {};

  const world_events = worldEvents(s, w, R, pid);
  if (pass || !command.trim()) {
    return { interpretation: '이번 턴은 특별한 명령 없이 현상 유지', feasibility: 100, reasoning: '', if_success: empty, if_failure: empty, world_events };
  }

  const mentioned = w.findCountries(text).filter((c) => c !== pid && isAlive(s, c));
  const provAll = w.findProvinces(text);
  const provMentions = provAll.filter((p) => s.controller[p] !== pid);
  const provTarget = provMentions.length ? s.controller[provMentions[0]] : undefined;
  let target: CountryId | undefined = mentioned[0] ?? (provTarget !== pid ? provTarget : undefined);
  const st = (c: CountryId) => s.stats[c];
  const me = st(pid);
  const done = (x: Omit<Adjudication, 'world_events' | 'reasoning'> & { reasoning?: string }): Adjudication => ({ reasoning: '', ...x, world_events });

  const WAR = /선전\s*포고|침공|공격|전쟁|쳐들어|점령|정복|격파|돌격|invade|attack|declare war|conquer|occupy|annex|합병|병합|할양/;
  const NAVAL = /수군|해군|함대|해전|해상|거북선|판옥선|navy|fleet|naval/;
  const MOVE = /이동|배치|진군|행군|이끌고|출동|보낸다|보내|파견|전진|후퇴|move|send|deploy|march|advance/;
  const PEACE = /평화|휴전|종전|화친|peace|ceasefire|armistice/;
  const ALLY = /동맹|연합|조약|우호|협력|협상|외교|맹약|ally|alliance|treaty|cooperat|diplomac|negotiat|수교/;
  const SANCTION = /제재|봉쇄|금수|관세|sanction|embargo|tariff|blockade/;
  const INVEST = /투자|경제|무역|산업|개발|성장|invest|trade|econom|industr|develop|growth|infrastructure|인프라/;
  const RAISE = /징병|모병|신편|창설|병력을 늘|군대를 늘|증원|conscript|raise an army|levy|recruit/;
  const MIL = /군사|군비|무장|국방|병력|훈련|군대|무기|military|army|defen[cs]e|rearm|weapon/;
  const REFORM = /개혁|복지|민생|안정|선거|reform|welfare|stabil|election|social/;

  // ---- 군대 선택: 명령에 장군/군대 이름이 있으면 그 군대 ----
  const mine = armiesOf(s, pid);
  const named = mine.find((a) => text.includes(a.general.name.toLowerCase()) || text.includes(a.name.toLowerCase()));
  const naval = has(NAVAL) || (!!named && !!named.navy);
  const label = (a: Army) => `${a.name}(${a.general.name})`;

  // ---- 이동(자국/동맹/주인 없는 땅으로) ----
  if (named && has(MOVE) && provAll.length) {
    const dest = provAll[0];
    const ctl = s.controller[dest];
    const enemyHeld = ctl !== pid && isAtWar(s, pid, ctl);
    if (!enemyHeld) {
      const fromI = w.index.get(named.at)!, toI = w.index.get(dest)!;
      const ok = reachWithin(w, fromI, moveHops(s, named)).has(toI);
      const wildT = !!w.countries.get(ctl)?.neutral;
      const allowed = ctl === pid || wildT || getRel(s, pid, ctl) >= 20;
      if (!ok) return done({ interpretation: `${P(label(named), '을/를')} ${P(w.provLabel(dest), '으로/로')} 이동`, feasibility: 0, if_success: empty, if_failure: { narrative: `${P(label(named), '은/는')} 한 턴에 ${w.provLabel(dest)}까지 갈 수 없다. 더 가까운 주로 단계적으로 이동시키세요.` } });
      if (!allowed) return done({ interpretation: `${label(named)} 이동`, feasibility: 0, if_success: empty, if_failure: { narrative: `${P(w.provLabel(dest), '은/는')} ${L(ctl)} 영토라 허락 없이 들어갈 수 없다(전쟁 중이거나 관계 +20 이상이어야 함).` } });
      return done({
        interpretation: `${P(label(named), '을/를')} ${P(w.provLabel(dest), '으로/로')} 이동`, feasibility: 92,
        if_success: { narrative: `${P(label(named), '이/가')} ${P(w.provLabel(dest), '으로/로')} 이동했다.${wildT ? ' 주인 없는 땅을 장악했다.' : ''}`, headlines: [], army_moves: [{ army: named.id, to: dest }] },
        if_failure: { narrative: `${label(named)}의 행군은 보급 문제로 지체되었다.` },
      });
    }
  }

  // ---- 전투/점령 ----
  if (has(WAR) || naval) {
    const enemies = warsOf(s, pid);
    if (!target) target = enemies[0] ?? [...neighborsOf(s, w, pid).keys()].sort((a, b) => getRel(s, pid, a) - getRel(s, pid, b))[0];
    if (!target) return done({ interpretation: '공격 대상이 불분명하다', feasibility: 0, if_success: empty, if_failure: { narrative: '공격할 상대를 특정하지 못해 아무 일도 일어나지 않았다. 국가명을 명령에 넣어 보세요.' } });
    const t = target;
    if (!mine.length) return done({ interpretation: `${L(t)}에 대한 군사 행동`, feasibility: 0, if_success: empty, if_failure: { narrative: '출동할 수 있는 군대가 없다. "군대를 신편한다"로 먼저 병력을 모으세요.' } });

    const pool = named ? [named] : (naval ? mine.filter((a) => a.navy) : mine.filter((a) => !a.navy));
    const candidates = pool.length ? pool : mine;
    type Plan = { att: Army; targetProv: ProvinceId; defs: Army[]; sea: boolean };
    let best: Plan | undefined, bestScore = -1;
    for (const att of candidates) {
      const within = reachWithin(w, w.index.get(att.at)!, moveHops(s, att));
      // 함대 대 함대 해전
      if (naval) {
        const navies = s.armies.filter((a) => a.navy && a.troops > 0 && (a.owner === t || isAtWar(s, a.owner, pid)) && within.has(w.index.get(a.at)!));
        if (navies.length) { const sc2 = armyPower(att); if (sc2 > bestScore) { bestScore = sc2; best = { att, targetProv: navies[0].at, defs: [navies[0]], sea: true }; } continue; }
      }
      const provs = [...within].map((j) => w.provinces[j].id).filter((id) => s.controller[id] === t);
      if (!provs.length) continue;
      const pref = provMentions.filter((p) => provs.includes(p));
      const tp = (pref.length ? pref : provs)[Math.floor(R() * (pref.length ? pref.length : provs.length))];
      const sc2 = armyPower(att);
      if (sc2 > bestScore) { bestScore = sc2; best = { att, targetProv: tp, defs: s.armies.filter((a) => a.at === tp && a.troops > 0 && a.owner === t), sea: false }; }
    }
    if (!best) {
      return done({ interpretation: `${L(t)}에 대한 군사 행동`, feasibility: 0, reasoning: '작전 범위 밖',
        if_success: empty, if_failure: { narrative: `${P(L(t), '은/는')} 아군 군대의 작전 범위 밖에 있다. 군대를 인접 지역으로 먼저 이동시키세요. 예: "${P((named ?? mine[0]).general.name, '을/를')} ○○로 이동".` } });
    }
    const { att, targetProv, defs, sea } = best;
    const scale = eraScale(sc);
    const garrison = defs.length ? 0 : Math.max(0.6, (st(t).military / 15) * scale);
    const atkP = armyPower(att) * (1 + mod(pid) / 100);
    const defP = defs.reduce((x, d) => x + armyPower(d), 0) * (sea ? 1 : 1.15) * (1 + mod(t) / 100) + garrison * 0.95;
    const p = winChance(atkP, defP);
    const bonus = (sc.bonuses ?? []).filter((b) => b.country === pid && b.words.some((x) => text.includes(x.toLowerCase()))).reduce((a, b) => a + b.bonus, 0);
    const feas = clamp(Math.round(p * 100 + bonus), 3, 96);
    const war = isAtWar(s, pid, t) ? [] : [{ a: pid, b: t }];
    const place = sea ? `${w.provLabel(targetProv)} 앞바다` : w.provLabel(targetProv);
    const defName = defs.length ? defs.map((d) => `${d.name}(${d.general.name})`).join(', ') : `${L(t)} 수비대`;
    const lossS = r1(att.troops * clamp(0.06 + 0.26 * (defP / (atkP + defP)), 0.04, 0.4));
    const lossF = r1(att.troops * clamp(0.14 + 0.26 * (defP / (atkP + defP)), 0.1, 0.5));
    const fate = (win: boolean): 'wounded' | 'captured' | 'dead' | undefined => {
      const r = R();
      if (att.general.trait.includes('불패')) return undefined; // 불패의 장군은 쓰러지지 않는다
      if (win) return r < 0.015 ? 'dead' : r < 0.075 ? 'wounded' : undefined;
      return r < 0.035 ? 'dead' : r < 0.075 ? 'captured' : r < 0.235 ? 'wounded' : undefined;
    };
    const overwhelming = atkP > 1.8 * defP;
    const defChanges = defs.map((d) => ({ army: d.id, troops_delta: -r1(d.troops * (overwhelming ? 1 : 0.65)), morale_delta: -25 }));
    // 방어군 후퇴: 소유국이 지배하는 인접 주로 (없으면 궤멸)
    const retreats = sea ? [] : defs.flatMap((d) => {
      const di = w.index.get(d.at)!;
      const r = w.reach[di].map((j) => w.provinces[j].id).find((id) => id !== targetProv && s.controller[id] === d.owner);
      return r && !overwhelming ? [{ army: d.id, to: r }] : [];
    });
    const attName = label(att);
    return done({
      interpretation: sea ? `${P(attName, '이/가')} ${L(t)} 함대를 공격` : `${P(attName, '이/가')} ${L(t)}의 ${P(w.provLabel(targetProv), '을/를')} 공격`,
      feasibility: feas,
      reasoning: `전투력 ${atkP.toFixed(1)} 대 ${defP.toFixed(1)} (병력 ${att.troops}천·장군 ${att.general.skill}/10·사기 ${att.morale}${bonus ? ` · 보정 +${bonus}` : ''})`,
      if_success: {
        narrative: sea
          ? `${P(attName, '이/가')} ${place}에서 ${P(defName, '을/를')} 격파했다. 제해권이 아군에 넘어왔다.`
          : `${P(attName, '이/가')} ${place}에서 ${P(defName, '을/를')} 물리치고 진출했다.${old ? ' 전열이 무너진 적은 흩어졌다.' : ''}`,
        headlines: [sea ? `${attName}, ${L(t)} 함대 격파` : `${attName}, ${w.provLabel(targetProv)} 점령`], declare_war: war,
        army_moves: [...retreats, ...(sea ? [] : [{ army: att.id, to: targetProv }])],
        army_changes: [{ army: att.id, troops_delta: -lossS, morale_delta: 8, general: fate(true) }, ...defChanges],
        province_transfers: sea ? [] : [{ province: targetProv, to: pid, kind: 'controller' }],
        stat_changes: [{ country: t, stat: 'stability', delta: -3 }, { country: t, stat: 'military', delta: -2 }],
      },
      if_failure: {
        narrative: `${attName}의 공격은 ${place}에서 ${defName}에게 막혔다. 큰 피해를 입고 물러났다.`,
        headlines: [`${attName}, ${place}에서 패퇴`], declare_war: war,
        army_changes: [{ army: att.id, troops_delta: -lossF, morale_delta: -15, general: fate(false) }, ...defs.map((d) => ({ army: d.id, troops_delta: -r1(d.troops * 0.1), morale_delta: 4 }))],
        stat_changes: [{ country: pid, stat: 'stability', delta: -2 }],
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
      interpretation: `${L(t)}와 휴전·평화 협상`, feasibility: feas,
      if_success: { narrative: `${P(L(pid), '와/과')} ${P(L(t), '은/는')} 중재 끝에 휴전에 합의했다. 포성은 멎었지만 점령지 문제는 남았다.`, headlines: [`${L(pid)}-${L(t)} 휴전 합의`], make_peace: [{ a: pid, b: t }], stat_changes: [{ country: pid, stat: 'stability', delta: 2 }] },
      if_failure: { narrative: `${P(L(t), '은/는')} 협상 제안을 거부했다. 전쟁은 계속된다.`, headlines: [`${L(t)}, 휴전 제안 거부`], relation_changes: [{ a: pid, b: t, delta: -5 }], stat_changes: [{ country: pid, stat: 'stability', delta: -1 }] },
    });
  }

  // ---- 제재 ----
  if (has(SANCTION) && target) {
    const t = target;
    const feas = clamp(Math.round(40 + (me.influence - st(t).influence) / 2), 15, 85);
    return done({
      interpretation: `${L(t)}에 대한 ${old ? '교역 금지' : '경제 제재'}`, feasibility: feas,
      if_success: { narrative: `${P(L(pid), '은/는')} ${L(t)}에 대한 ${old ? '교역 금지령을 내렸다' : '무역·금융 제재를 발효했다'}. ${L(t)}의 경제가 타격을 입었다.`, headlines: [`${L(pid)}, ${L(t)} 제재`], relation_changes: [{ a: pid, b: t, delta: -15 }], stat_changes: [{ country: t, stat: 'economy', delta: -3 }, { country: pid, stat: 'economy', delta: -1 }] },
      if_failure: { narrative: `제재는 우회로와 제3국의 이탈로 실효를 거두지 못했고, ${L(pid)}만 무역 손실을 입었다.`, headlines: [`${L(pid)}의 ${L(t)} 제재 실효성 논란`], relation_changes: [{ a: pid, b: t, delta: -8 }], stat_changes: [{ country: pid, stat: 'economy', delta: -2 }, { country: pid, stat: 'influence', delta: -1 }] },
    });
  }

  // ---- 외교/동맹 ----
  if (has(ALLY) && target) {
    const t = target;
    const feas = clamp(Math.round(50 + getRel(s, pid, t) / 3 + (me.influence - st(t).influence) / 6), 10, 90);
    return done({
      interpretation: `${L(t)}와 외교·협력 강화`, feasibility: feas,
      if_success: { narrative: `${P(L(pid), '와/과')} ${P(L(t), '은/는')} ${old ? '사절이 오간 끝에 맹약을 맺었다.' : '정상회담에서 협력 강화에 합의했다.'} 양국 관계가 눈에 띄게 개선되었다.`, headlines: [`${L(pid)}-${L(t)} 협력 강화 합의`], relation_changes: [{ a: pid, b: t, delta: 15 }], stat_changes: [{ country: pid, stat: 'influence', delta: 1 }] },
      if_failure: { narrative: `${P(L(t), '은/는')} 구체적 약속을 피했고 ${old ? '사절단은 별 성과 없이 돌아왔다' : '회담은 별 성과 없이 끝났다'}.`, headlines: [`${L(pid)}-${L(t)} 협상 성과 없음`], relation_changes: [{ a: pid, b: t, delta: -4 }] },
    });
  }

  // ---- 신편(징병) ----
  if (has(RAISE)) {
    const home = mine[0]?.at ?? controlledBy(s, pid)[0];
    const troops = r1(Math.max(1, totalTroops(s, pid) * 0.15));
    return done({
      interpretation: '군대 신편(징병)', feasibility: clamp(Math.round(60 + (me.stability - 40) / 2), 25, 90),
      if_success: { narrative: `${P(L(pid), '은/는')} 새 군대를 편성했다(${troops}천 명). 재정 부담은 커졌다.`, headlines: [`${L(pid)}, 신편군 창설`], army_new: [{ owner: pid, name: `${L(pid)} 신편군`, general: '신임 지휘관', troops, at: home }], stat_changes: [{ country: pid, stat: 'economy', delta: -1 }] },
      if_failure: { narrative: '징집은 지방의 반발과 병참 문제로 지지부진했다.', headlines: [`${L(pid)} 징병 차질`], stat_changes: [{ country: pid, stat: 'stability', delta: -2 }] },
    });
  }

  // ---- 경제 투자 ----
  if (has(INVEST)) {
    return done({
      interpretation: '경제 투자와 산업 육성', feasibility: clamp(Math.round(55 + (me.stability - 50) / 2), 25, 90),
      if_success: { narrative: `${L(pid)}의 투자 계획이 순조롭게 집행되어 ${old ? '농업과 교역, 도시가 활기를 띠었다' : '산업 생산과 고용이 개선되었다'}.`, headlines: [`${L(pid)}, 경제 성장세 강화`], stat_changes: [{ country: pid, stat: 'economy', delta: 4 }, { country: pid, stat: 'stability', delta: 1 }] },
      if_failure: { narrative: '예산 집행이 지연되고 일부 사업에서 비리가 드러나 효과가 미미했다.', headlines: [`${L(pid)} 투자 사업 차질`], stat_changes: [{ country: pid, stat: 'economy', delta: -1 }, { country: pid, stat: 'stability', delta: -2 }] },
    });
  }

  // ---- 군비 ----
  if (has(MIL)) {
    return done({
      interpretation: '군비 증강과 훈련', feasibility: 75,
      if_success: { narrative: `${P(L(pid), '은/는')} 군수를 늘리고 훈련을 강화했다. 군사력과 사기는 올랐지만 재정 부담이 커졌다.`, headlines: [`${L(pid)}, 군비 증강`],
        army_changes: mine.slice(0, 6).map((a) => ({ army: a.id, morale_delta: 8 })), stat_changes: [{ country: pid, stat: 'military', delta: 5 }, { country: pid, stat: 'economy', delta: -2 }] },
      if_failure: { narrative: '조달 비리와 지연으로 군 현대화는 계획보다 더뎠고 불만이 커졌다.', headlines: [`${L(pid)} 군 현대화 차질`], stat_changes: [{ country: pid, stat: 'military', delta: 2 }, { country: pid, stat: 'stability', delta: -2 }] },
    });
  }

  // ---- 내정 개혁 ----
  if (has(REFORM)) {
    return done({
      interpretation: '내정 개혁과 사회 안정', feasibility: clamp(Math.round(50 + (me.stability - 40) / 2), 25, 85),
      if_success: { narrative: `${P(L(pid), '은/는')} ${old ? '개혁 칙령' : '개혁안'}을 시행해 사회적 갈등을 누그러뜨렸다.`, headlines: [`${L(pid)}, 개혁 단행`], stat_changes: [{ country: pid, stat: 'stability', delta: 5 }, { country: pid, stat: 'economy', delta: -1 }] },
      if_failure: { narrative: '개혁은 기득권의 반발에 부딪혀 좌초되었고 정국이 혼란해졌다.', headlines: [`${L(pid)} 개혁 좌초`], stat_changes: [{ country: pid, stat: 'stability', delta: -3 }] },
    });
  }

  // ---- 해석 불가 ----
  return done({
    interpretation: '명령 해석 불분명 (규칙 모드)', feasibility: 60,
    reasoning: '규칙 모드는 일부 키워드(공격, 이동, 평화, 동맹, 제재, 투자, 징병, 군비, 개혁)와 장군/군대/국가명만 이해한다. Gemini 모드에서는 자유 문장을 쓸 수 있다.',
    if_success: { narrative: `${L(pid)}의 지시는 구체적 행동으로 이어지지 않았다. (규칙 모드는 "○○ 장군이 △△를 공격", "○○군을 △△로 이동", 평화·동맹·제재·투자·징병·군비·개혁 같은 키워드를 이해합니다.)`, stat_changes: [{ country: pid, stat: 'stability', delta: 1 }] },
    if_failure: { narrative: `${L(pid)}의 지시는 관료 조직에서 흐지부지되었다.` },
  });
}

/** 세계 사건: 진행 중인 전쟁의 전선(군대 간 전투), 국경 긴장, 내정 변동. 모두 시드 난수로 결정된다. */
function worldEvents(s: GameState, w: World, R: () => number, pid: CountryId): Diff {
  const d = emptyDiff();
  const sc = w.active;
  const milMod = sc.milMod ?? {};
  const turnMonths = s.turnMonths ?? 1;
  const L = (c: CountryId) => w.label(c);
  const lines: string[] = [];
  const taken = new Set<string>();
  const pAct = Math.min(0.7, 0.26 * Math.sqrt(turnMonths));
  const scale = eraScale(sc);

  // 1) 진행 중인 전쟁: 가장 강한 군대가 적 지역으로 진격해 방어군과 싸운다
  for (const wk of s.wars.slice(0, 12)) {
    const [a, b] = wk.split('|');
    if (!isAlive(s, a) || !isAlive(s, b)) continue;
    const power = (c: CountryId) => armiesOf(s, c).reduce((t, x) => t + armyPower(x), 0) * (1 + (milMod[c] ?? 0) / 100) * (0.8 + R() * 0.4);
    const [win, lose] = power(a) >= power(b) ? [a, b] : [b, a];
    const roll = R();
    if (roll < pAct) {
      const attackers = armiesOf(s, win).filter((x) => !x.navy).sort((x, y) => armyPower(y) - armyPower(x)).slice(0, 3);
      for (const att of attackers) {
        const within = reachWithin(w, w.index.get(att.at)!, moveHops(s, att));
        const cands = [...within].map((j) => w.provinces[j].id).filter((id) => s.controller[id] === lose && !taken.has(id));
        if (!cands.length) continue;
        const tp = cands[Math.floor(R() * cands.length)];
        taken.add(tp);
        const defs = s.armies.filter((x) => x.at === tp && x.troops > 0 && x.owner === lose);
        const garrison = defs.length ? 0 : Math.max(0.6, (s.stats[lose].military / 15) * scale);
        const ap = armyPower(att) * (1 + (milMod[win] ?? 0) / 100);
        const dp = defs.reduce((t, x) => t + armyPower(x), 0) * 1.15 * (1 + (milMod[lose] ?? 0) / 100) + garrison * 0.95;
        const p = winChance(ap, dp);
        const an = `${att.name}(${att.general.name})`;
        if (defs.length) {
          if (R() < p) {
            for (const x of defs) d.army_changes.push({ army: x.id, troops_delta: -r1(x.troops * 0.6), morale_delta: -20 });
            d.army_changes.push({ army: att.id, troops_delta: -r1(att.troops * 0.12), morale_delta: 6 });
            d.headlines.push(`${an}, ${w.provLabel(tp)}에서 ${L(lose)}군 격파`);
            lines.push(`${L(win)}의 ${P(an, '이/가')} ${w.provLabel(tp)}에서 ${L(lose)}군을 꺾었다.`);
          } else {
            d.army_changes.push({ army: att.id, troops_delta: -r1(att.troops * 0.22), morale_delta: -12 });
            for (const x of defs) d.army_changes.push({ army: x.id, troops_delta: -r1(x.troops * 0.1) });
            d.headlines.push(`${L(lose)}군, ${w.provLabel(tp)}에서 ${an} 저지`);
            lines.push(`${L(lose)}의 방어군이 ${w.provLabel(tp)}에서 ${an}의 공세를 막아냈다.`);
          }
        } else if (R() < winChance(ap, garrison * 0.95)) {
          d.army_moves.push({ army: att.id, to: tp });
          d.army_changes.push({ army: att.id, troops_delta: -r1(att.troops * 0.04) });
          d.headlines.push(`${an}, ${L(lose)}의 ${w.provLabel(tp)} 점령`);
          lines.push(`${L(win)}-${L(lose)} 전선에서 ${P(an, '이/가')} ${P(w.provLabel(tp), '을/를')} 장악했다.`);
          d.stat_changes.push({ country: lose, stat: 'stability', delta: -3 });
        } else {
          d.army_changes.push({ army: att.id, troops_delta: -r1(att.troops * 0.1), morale_delta: -8 });
        }
        break;
      }
    } else if (roll < pAct + (a === pid || b === pid ? 0.015 : 0.035)) {
      d.make_peace.push({ a, b });
      d.headlines.push(`${L(a)}-${L(b)} 휴전 합의`);
      lines.push(`${P(L(a), '와/과')} ${P(L(b), '이/가')} 휴전에 합의했다.`);
    }
  }
  // 군대가 한 곳도 남지 않은 교전국은 방어군을 신편한다
  for (const wk of s.wars.slice(0, 12)) for (const c of wk.split('|')) {
    if (!isAlive(s, c) || c === pid || armiesOf(s, c).length) continue;
    const home = controlledBy(s, c)[0];
    if (home && !d.army_new.some((n) => n.owner === c)) d.army_new.push({ owner: c, name: `${L(c)} 방위군`, troops: Math.max(1, r1(2 * scale * 4)), at: home });
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
    const sc2 = s.stats[c];
    if (sc2.stability < 35 && R() < 0.5) {
      d.stat_changes.push({ country: c, stat: 'stability', delta: -3 });
      if (d.headlines.length < 5) d.headlines.push(`${L(c)}에서 대규모 시위·정치 불안`);
    } else if (sc2.economy > 60 && R() < 0.12) {
      d.stat_changes.push({ country: c, stat: 'economy', delta: 2 });
    }
  }
  d.narrative = lines.join(' ');
  return d;
}
