import type { World } from '../data/world';
import type { GameState } from '../engine/state';
import { armiesOf, controlledBy, fmtDate, getRel, neighborsOf, ownedBy, warsOf } from '../engine/state';
import { reachWithin } from '../engine/armies';

const SCHEMA = `{
  "interpretation": "플레이어 명령을 한국어 한 문장으로 해석",
  "feasibility": 0-100 정수 (이번 달 안에 명령의 의도가 달성될 현실적 확률),
  "reasoning": "그렇게 판단한 근거 한 문장",
  "if_success": DIFF,   // 성공했을 때의 결과
  "if_failure": DIFF,   // 실패했을 때의 결과 (성공과 달라야 하며, 보통 부정적/교착)
  "world_events": DIFF, // 플레이어와 무관하게 이번 달 다른 나라들이 하는 일 (0~3건)
  "memory": "다음 턴을 위해 기억할 사실 한 문장 (선택)"
}
DIFF = {
  "narrative": "한국어 2~4문장, 구체적인 서술",
  "headlines": ["한국어 신문 헤드라인", ...최대 3],
  "declare_war": [{"a":"국가ID","b":"국가ID"}],
  "make_peace": [{"a":"국가ID","b":"국가ID"}],
  "province_transfers": [{"province":"주ID","to":"국가ID","kind":"controller|owner"}],
  "relation_changes": [{"a":"국가ID","b":"국가ID","delta":-40~40}],
  "stat_changes": [{"country":"국가ID","stat":"stability|economy|military|influence","delta":-10~10}],
  "army_moves": [{"army":"군대ID","to":"주ID"}],   // 한 턴에 갈 수 있는 거리 안에서만
  "army_changes": [{"army":"군대ID","troops_delta":-60~10,"morale_delta":-40~40,"general":"wounded|captured|dead"}],  // 병력은 천 명 단위
  "army_new": [{"owner":"국가ID","name":"군대 이름","general":"장군 이름","troops":숫자,"at":"주ID"}]   // 신편, 최대 2개
}`;

const RULES = `당신은 실제 세계지도 위에서 진행되는 턴제 대체역사 시뮬레이션의 판정관(GM)이다.
진실(국경, 전쟁, 수치)은 게임 엔진이 소유한다. 당신은 변경안을 JSON으로 "제안"만 하며, 엔진이 검증해서 불가능한 것은 거부한다.
한 턴은 1개월이다. 플레이어는 한 나라를 맡아 자유 문장으로 명령한다. 출력은 JSON 객체 하나뿐이다(마크다운, 설명 금지).

규칙:
1. ID: 국가는 3글자 코드, 주(province)는 입력에 주어진 ID를 글자 그대로 쓴다. 목록에 없는 ID를 만들지 않는다.
2. 현실성: 병참, 거리, 경제력, 국내 정치, 동맹 구조, 핵 억지력을 반영한다. 플레이어에게 유리하게 편향하지 않는다.
   - feasibility: 일상적 외교/경제 55~90, 야심찬 군사작전(강한 상대 공격, 대규모 점령) 5~35, 비현실적/시대에 맞지 않는 명령(마법, 시간여행 등) 1~5.
3. 점령: kind="controller". 상대와 전쟁 상태여야 하고(아니면 같은 DIFF에 declare_war 포함), 대상 주는 FRONT_PROVINCES(작전 가능 범위)에 있어야 한다.
   합병/영구 편입: kind="owner". 이미 점령했거나, 평화 조약(관계 +20 이상)으로만 가능. 한 턴에 바뀌는 주는 보통 0~3곳. 거대한 나라를 한 턴에 통째로 점령하지 않는다.
4. 시대 제약: 현재 날짜 이후의 기술/지식은 쓰지 않는다. WARS에 적힌 전쟁만 전쟁이다(시나리오가 시작부터 진행 중인 전쟁을 정해 둔다). 이 시나리오의 시대와 입력된 국가 목록(COUNTRY_IDS)만 쓴다. 현대 국가/국경을 끌어오지 않는다.
5. world_events: 다른 나라는 각자의 이익, 성격, 관계에 따라 능동적으로 행동한다. 같은 사건을 매달 반복하지 않는다. 진행 중인 전쟁은 전선이 움직인다.
6. 변경 폭: stat delta는 ±10 이내(보통 ±1~5), 관계 delta는 ±40 이내(보통 ±5~15).
7. 지도 소유 상태는 엔진 입력을 그대로 진실로 받아들인다(국경 논쟁을 하지 않는다).
8. if_failure는 그럴듯한 부작용(안정 하락, 관계 악화, 교착)을 담고 if_success와 같은 내용이 아니어야 한다.
10. UNC(기타 세력)는 주인 없는/비조직 지역이다. 도달 가능한 나라는 선전포고 없이 개척·정복(kind=controller)할 수 있다. 병력과 거리, 시대를 고려해 feasibility를 정한다.
11. 군대와 장군: 영토는 "군대"가 점령한다. 이동은 army_moves, 전투 결과는 army_changes(병력·사기·장군의 운명)로 쓴다. 방어군이 있는 주는 먼저 격파(상대 군대 병력 감소·궤멸 또는 후퇴 이동)해야 점령(province_transfers kind=controller)할 수 있다. 군대 ID는 ARMIES 목록에 있는 것만 쓴다.
    전투 결과는 병력, 장군 skill(1~10)과 특성, 사기, 보급, 지형, 시대의 무기·전술을 반영한다. 능력 있는 장군은 열세 병력도 이길 수 있으나 우연도 있다. 보통 손실은 병력의 5~40%. 장군은 드물게(전투당 10% 이하) 부상·포로·전사한다. GM_NOTES에 특별한 장군 설정이 있으면 그 설정을 따른다. trait에 \"불패\"가 있는 장군은 전사·포로가 되지 않는다. 병력 단위는 천 명.
9. 아무 명령이 없는 턴(PASS)이면 if_success/if_failure는 빈 객체로 두고 world_events만 채운다.`;

const EXAMPLE = `예시 입력 요약: 플레이어=KOR, 명령="일본과 경제 협력 협정을 추진한다"
예시 출력: {"interpretation":"한국이 일본과 경제 협력 협정을 추진한다","feasibility":72,"reasoning":"양국 관계가 나쁘지 않고 무역 이해가 크다.","if_success":{"narrative":"서울과 도쿄는 반도체 소재와 물류에 관한 협력 협정에 서명했다. 양국 기업의 투자가 늘고 관계가 한층 개선되었다.","headlines":["한일 경제협력 협정 체결"],"relation_changes":[{"a":"KOR","b":"JPN","delta":10}],"stat_changes":[{"country":"KOR","stat":"economy","delta":2},{"country":"JPN","stat":"economy","delta":2}]},"if_failure":{"narrative":"협상은 역사 문제와 관세 쟁점에서 교착되었고 양국 여론이 악화되었다.","headlines":["한일 협상 결렬"],"relation_changes":[{"a":"KOR","b":"JPN","delta":-4}],"stat_changes":[{"country":"KOR","stat":"stability","delta":-1}]},"world_events":{"narrative":"북한이 단거리 미사일을 시험발사해 동북아 긴장이 높아졌다.","headlines":["북한 미사일 발사"],"relation_changes":[{"a":"PRK","b":"KOR","delta":-5}]},"memory":"한일 경제협력 협상이 진행 중이다."}`;

export function systemPrompt(world: World, compact: boolean): string {
  const tm = world.active.turnMonths ?? 1;
  const rules = RULES.replace('한 턴은 1개월이다.', `한 턴은 ${tm}개월이다.`);
  if (compact) return `${rules}\n\n출력 JSON 형식:\n${SCHEMA}`;
  const ids = [...world.countries.values()].filter((c) => !c.neutral).map((c) => `${c.id}=${c.name}${c.nameKo && c.nameKo !== c.name ? `(${c.nameKo})` : ''}`).join('; ');
  return `${rules}\n\n출력 JSON 형식:\n${SCHEMA}\n\n${EXAMPLE}\n\nCOUNTRY_IDS: ${ids}`;
}

/** 군대 목록: 플레이어 군대 전부 + 교전국/근처 군대. 장군의 능력과 특성을 함께 보여 준다. */
function armiesBlock(s: GameState, w: World, compact: boolean): string {
  const pid = s.playerId;
  const mine = armiesOf(s, pid);
  const atWar = new Set(warsOf(s, pid));
  const near = new Set<number>();
  for (const a of mine) { const i = w.index.get(a.at); if (i !== undefined) reachWithin(w, i, 2).forEach((j) => near.add(j)); }
  const others = s.armies.filter((a) => a.owner !== pid && a.troops > 0 && (atWar.has(a.owner) || near.has(w.index.get(a.at) ?? -1)))
    .sort((a, b) => (atWar.has(b.owner) ? 1 : 0) - (atWar.has(a.owner) ? 1 : 0) || b.troops - a.troops).slice(0, compact ? 8 : 28);
  const line = (a: typeof mine[number]) => `${a.id} | ${a.owner} | ${a.name}${a.navy ? ' [함대]' : ''} | ${a.general.name} (${a.general.skill}/10${a.general.trait ? `, ${a.general.trait}` : ''}${a.general.status === 'wounded' ? ', 부상' : ''}) | ${a.troops}천 | 사기 ${a.morale} | ${a.at}(${w.province(a.at)?.name ?? ''})`;
  return `ARMIES (id | owner | name | general (skill/10, trait) | troops | morale | at)\n${[...mine.slice(0, compact ? 8 : 20), ...others].map(line).join('\n') || '-'}`;
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function buildUserPrompt(s: GameState, w: World, command: string, pass: boolean, compact: boolean): string {
  const pid = s.playerId;
  const st = (c: string) => { const x = s.stats[c]; return x ? `stab ${x.stability} econ ${x.economy} mil ${x.military} infl ${x.influence}` : '-'; };
  const nb = [...neighborsOf(s, w, pid).entries()].sort((a, b) => b[1] - a[1]);
  const atWar = new Set(warsOf(s, pid));

  const nbLines = nb.slice(0, compact ? 6 : 14).map(([c]) => `${c} ${w.country(c)?.name} | ${st(c)} | rel ${sign(getRel(s, pid, c))}${atWar.has(c) ? ' | AT WAR' : ''}`);
  for (const c of atWar) if (!nb.some(([x]) => x === c)) nbLines.push(`${c} ${w.country(c)?.name} | ${st(c)} | rel ${sign(getRel(s, pid, c))} | AT WAR (not adjacent)`);

  // 작전 가능 범위의 외국 주: 전쟁 상대/관계 나쁜 순으로 우선
  const mine = new Set(controlledBy(s, pid));
  const front = new Map<string, number>();
  for (let i = 0; i < w.provinces.length; i++) {
    const id = w.provinces[i].id;
    if (!mine.has(id)) continue;
    for (const j of w.reach[i]) {
      const q = w.provinces[j].id;
      const c = s.controller[q];
      if (c === pid || !(c in s.stats)) continue;
      front.set(q, (atWar.has(c) ? 1000 : 0) - getRel(s, pid, c));
    }
  }
  const frontLines = [...front.entries()].sort((a, b) => b[1] - a[1]).slice(0, compact ? 18 : 60).map(([q]) => {
    const p = w.province(q)!;
    return `${q} | ${p.name} | owner ${s.owner[q]}${s.controller[q] !== s.owner[q] ? ` ctrl ${s.controller[q]}` : ''}`;
  });
  const lost = ownedBy(s, pid).filter((q) => s.controller[q] !== pid).slice(0, compact ? 8 : 25).map((q) => `${q} | ${w.province(q)?.name} | held by ${s.controller[q]}`);
  const notable = Object.entries(s.relations).filter(([k, v]) => k.split('|').includes(pid) && Math.abs(v) >= 35)
    .map(([k, v]) => `${k.split('|').find((x) => x !== pid)} ${sign(v)}`).slice(0, compact ? 8 : 20);
  const wars = s.wars.slice(0, compact ? 8 : 25).join(', ') || 'none';
  const recent = s.log.slice(-5).flatMap((r) => r.headlines).slice(-8).join(' / ');

  return [
    `SCENARIO: ${w.active.name}${w.active.year ? ` (${w.active.year})` : ''}${w.active.era ? ` · ${w.active.era}` : ''}`,
    w.active.briefing ? `BRIEFING: ${compact ? w.active.briefing.slice(0, 280) : w.active.briefing}` : '',
    !compact && w.active.gmNotes ? `GM_NOTES: ${w.active.gmNotes}` : '',
    `DATE: ${fmtDate(s.date)} (turn ${s.turn}, 1 turn = ${s.turnMonths ?? 1} months)`,
    `PLAYER: ${pid} ${w.country(pid)?.name} | ${st(pid)} | provinces ${mine.size}`,
    `PLAYER_RELATIONS(|rel|>=35): ${notable.join(', ') || '-'}`,
    `WARS: ${wars}`,
    `NEIGHBORS (reachable):\n${nbLines.join('\n') || '-'}`,
    armiesBlock(s, w, compact),
    `FRONT_PROVINCES (foreign land the player can operate against):\n${frontLines.join('\n') || '-'}`,
    lost.length ? `PLAYER_LOST_PROVINCES:\n${lost.join('\n')}` : '',
    `RECENT_HEADLINES: ${recent || '-'}`,
    `MEMORY:\n${s.memory || '-'}`,
    pass ? 'COMMAND: (PASS — 플레이어는 이번 달 특별한 명령이 없다. world_events만 채워라.)' : `COMMAND: ${command}`,
  ].filter(Boolean).join('\n\n');
}
