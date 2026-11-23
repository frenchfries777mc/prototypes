# 대체역사 AI 시뮬레이션 — 설계 문서 v0.1

> 상태: 설계 단계 (코드 없음). 이 문서가 구현의 기준점이다.
> 가칭: **Althist** (이름은 나중에 정한다)

---

## 1. 목표와 범위

**한 줄 정의**: 플레이어가 한 국가를 골라 자연어로 명령을 내리면, LLM이 세계의 반응을 판정하고 지도 위의 영토·관계·사건이 갱신되는 턴제 대체역사 시뮬레이터.

**제약 (비용 0원 원칙)**
- 서버 없음. 정적 웹앱(GitHub Pages)으로 배포한다.
- 런타임 LLM은 (a) 사용자가 직접 입력한 Gemini 무료 API 키(BYOK), (b) 브라우저 내 Qwen(WebLLM) 두 가지만 쓴다.
- Claude(Max)는 **개발 단계 도구**로만 쓴다: 코드·프롬프트·데이터 매핑표 생성, 평가. 런타임에 호출하지 않는다.

**하지 않는 것 (v1 범위 밖)**
- 멀티플레이, 계정, 서버 저장
- 실시간 전투/전술 맵
- 이미지/음성 생성

---

## 2. 지도 정책 (확정)

| 지역 | 결정 | 표기 | 비고 |
|---|---|---|---|
| 대만 | **독립 국가 "Taiwan"**. 중국의 일부가 아니다. | `Taiwan` (※ "Chinese Taipei" 사용 안 함) | 본섬, 펑후, 진먼, 마쭈 포함 |
| 카슈미르 | **파키스탄령 부분만 파키스탄 소유**, 인도령은 인도 (해석은 아래) | — | 확정 |
| 크림반도 | **우크라이나 소유** | — | 크림 자치공화국 + 세바스토폴리 |

**카슈미르 해석 (확정)**
- **파키스탄 소유**: 아자드 카슈미르, 길기트-발티스탄 (파키스탄이 현재 실효지배하는 부분)
- **인도 소유**: 인도령 잠무·카슈미르, 라다크
- **중국 소유**: 악사이친 (현재 실효지배 유지)
- 즉 실효지배선(LoC) 기준의 현상 유지다. Natural Earth 기본 지도와 거의 같아서 오버라이드가 필요 없을 수 있다. 빌드 때 실제 폴리곤으로 확인한다.
- 의도와 다르면 오버라이드 표만 고치면 된다 (아래 구현 방식 참고).

**구현 방식: 데이터를 고치지 않고 "오버라이드 레이어"로 처리한다**
1. 원본 지도(Natural Earth admin-1)는 수정하지 않는다.
2. 빌드 스크립트가 `overrides/worldview.json`을 읽어 "주 ID → 시작 소유국"을 덮어쓴다.
3. 이 정책은 **시작 상태**일 뿐이다. 게임 안에서 플레이어와 AI가 소유권을 바꿀 수 있다.
4. Natural Earth는 일부 국가 관점(worldview)별 파일을 제공한다. 파키스탄·우크라이나 관점 파일이 있는지 확인해 참고 자료로 쓰되, 최종 기준은 우리 오버라이드 표다. (파일 존재 여부와 경계선 품질은 빌드 때 시각적으로 검증한다.)

```jsonc
// overrides/worldview.json (예시, ID는 빌드 시 실제 값으로 채운다)
{
  "name": "default-worldview",
  "rules": [
    { "match": { "country": "TWN" },                   "owner": "TWN", "displayName": "Taiwan" },
    { "match": { "adm1": ["<Crimea>", "<Sevastopol>"] }, "owner": "UKR" },
    { "match": { "adm1": ["<Azad-Kashmir>", "<Gilgit-Baltistan>"] }, "owner": "PAK" },
    { "match": { "adm1": ["<Jammu-Kashmir>", "<Ladakh>"] }, "owner": "IND" },
    { "match": { "adm1": ["<Aksai-Chin>"] },           "owner": "CHN" }
  ]
}
```

---

## 3. 핵심 설계 원칙

1. **LLM은 진실의 원천이 아니다.** 상태(지도, 소유권, 수치)는 코드가 소유하고, LLM은 "변경 제안(JSON)"만 낸다. 코드가 검증한 뒤 적용한다.
2. **소유(owner)와 실효지배(controller)를 분리한다.** 점령, 내전, 분쟁 지역을 표현하려면 처음부터 두 필드가 필요하다. 시작 상태에서는 둘이 같다.
3. **역할을 쪼갠다.** 해석 → 판정 → 서술 3단계. 작은 모델도 일부를 맡을 수 있다.
4. **재현 가능해야 한다.** 판정은 `seed`가 있는 RNG를 쓴다. 같은 저장 파일 + 같은 입력이면 같은 주사위가 나온다. (LLM 출력 자체는 비결정적이므로 응답을 로그에 저장한다.)
5. **제공자는 교체 가능하다.** `LLMProvider` 인터페이스 뒤에 Gemini, WebLLM, (선택) Claude API를 둔다.

---

## 4. 데이터 모델

```ts
type CountryId = string;   // "KOR", "TWN" ...
type ProvinceId = string;  // Natural Earth adm1_code 기반

interface Province {
  id: ProvinceId;
  name: string;
  iso: string;               // 현대 소속 ISO3 (참고용)
  owner: CountryId;          // 법적 소유
  controller: CountryId;     // 실효지배 (점령 시 owner와 다름)
  adj: ProvinceId[];         // 인접 그래프 (빌드 시 계산)
  centroid: [number, number];
  tags?: string[];           // "capital", "port", "strait" 등
}

interface Country {
  id: CountryId;
  name: string;
  color: string;
  leader: { name: string; title: string };
  government: string;        // "presidential republic" 등 (자유 텍스트 + 분류)
  stats: { stability: number; economy: number; military: number; influence: number }; // 0..100
  treasury: number;
  relations: Record<CountryId, number>;  // -100..100
  alliances: string[];       // alliance ids
  atWarWith: CountryId[];
  traits: string[];          // AI 성격: "isolationist", "expansionist" ...
}

interface WorldState {
  scenarioId: string;
  seed: number;
  date: string;              // ISO date
  turn: number;
  countries: Record<CountryId, Country>;
  provinces: Record<ProvinceId, Province>;
  treaties: Treaty[];
  log: TurnRecord[];         // 전체 기록 (저장용)
  memory: string;            // 롤링 요약 (프롬프트에 들어가는 압축 기억)
}

interface TurnRecord {
  turn: number;
  playerInput: string;
  actions: Action[];         // 해석기 출력
  diff: StateDiff;           // 검증을 통과해 적용된 변경
  headlines: string[];
  narrative: string;
}
```

**수치는 의도적으로 4개만 둔다** (안정, 경제, 군사, 영향력). 처음부터 늘리면 프롬프트와 균형이 무너진다. 필요하면 시나리오 단위로 확장한다.

---

## 5. 턴 파이프라인

```
플레이어 자연어 입력
   │
   ▼
[1] 해석기(Interpreter)      자연어 → Action[]   (규칙·ID 검증: 코드)
   │   소유하지 않은 것/존재하지 않는 ID → 코드가 거부하고 이유를 되돌려줌
   ▼
[2] 시뮬레이터(Simulator)    Action[] + 컨텍스트 → StateDiff 제안 + feasibility
   │   (플레이어 행동 결과 + AI 국가들의 반응 + 무작위 사건)
   ▼
[3] 엔진                    diff 스키마·규칙 검증 → RNG 판정 → 적용
   │   실패 시: 에러를 붙여 재시도 ≤2회, 그래도 실패하면 "변화 없음"
   ▼
[4] 연대기 작가(Chronicler)  확정된 diff → 헤드라인·서술
   ▼
[5] 메모리 압축             log 일부 → 500토큰 요약 (Qwen 담당 가능)
```

**모델 배정**

| 단계 | 기본 | 폴백 |
|---|---|---|
| 해석기 | Gemini Flash (구조화 출력) | Qwen (JSON 문법 제약) |
| 시뮬레이터 | Gemini Flash | 없음 (품질 하한 미달 시 경고 표시) |
| 연대기 작가 | Qwen | Gemini |
| 메모리 압축 | Qwen | Gemini |

### 컨텍스트 구성 (프롬프트에 넣는 것)
1. **정적 접두부** (항상 동일, 캐시 효과): 역할, 규칙, 시대 제약, 스키마, few-shot
2. **세계 요약**: 날짜, 활성 전쟁, 주요 동맹
3. **관련 국가 상세**: 플레이어국 + 인접국 + 교전국 + 동맹국만. 나머지는 한 줄 요약
4. **롤링 메모리** (≤500토큰)
5. **이번 턴 입력**

### 시뮬레이터 출력 스키마
```json
{
  "feasibility": 0,
  "reasoning": "한 문장",
  "events": [{ "type": "war_declared", "actor": "CountryId", "target": "CountryId" }],
  "province_transfers": [{ "province": "ProvinceId", "from": "CountryId", "to": "CountryId", "kind": "owner|controller" }],
  "relation_changes": [{ "a": "CountryId", "b": "CountryId", "delta": 0 }],
  "stat_changes": [{ "country": "CountryId", "stat": "stability|economy|military|influence", "delta": 0 }],
  "headlines": []
}
```
- `CountryId`, `ProvinceId`, `type`, `stat`는 **enum**으로 제한한다. 없는 ID를 지어낼 수 없다.
- 한 턴의 `province_transfers`는 상한(예: 5개)을 둔다. 급격한 변화를 규칙으로 막는다.

### 판정 규칙 (엔진, LLM이 아님)
- `feasibility`(0~100)와 시드 RNG 1회로 성패를 가른다: `roll < feasibility` → 성공 / 부분 / 실패 3단계.
- 영토 이전은 인접성(`adj`)과 전쟁 상태를 코드가 검사한다. 인접하지도 않고 교전 중도 아닌 주를 점령할 수 없다.
- 수치 변화량은 한 턴당 ±10으로 클램프한다.

### 시스템 프롬프트 원칙 (v0)
- 서사가 아니라 JSON만 출력한다.
- 현실성: 병참, 거리, 경제력, 국내 정치, 동맹 구조를 반영한다. **플레이어에게 유리하게 편향하지 않는다.**
- 시대 제약: 현재 날짜 이후의 기술·지식·사건은 쓰지 않는다.
- AI 국가는 각자의 이익, 성격(`traits`), 관계에 따라 **능동적으로** 행동한다.
- 한 턴에 일어날 법한 변화만 낸다.
- 불가능한 명령은 `feasibility`를 낮게 주고 이유를 `reasoning`에 쓴다 (거부하지 말고 결과로 처리).

---

## 6. UI 설계

```
┌──────────────────────────────────────────────────────────────┐
│ 2026-11 · 턴 14 · [Taiwan]            ⚙ 설정   💾 저장/불러오기 │
├───────────────────────────────────────┬──────────────────────┤
│                                       │  국가 패널            │
│                                       │  안정 ███░░  62       │
│            세계 지도                   │  경제 ████░  71       │
│     (소유국 색 · 호버 시 주 이름)       │  군사 ██░░░  38       │
│                                       │  영향력 ██░░░ 29      │
│        [레이어: 정치 | 관계 | 전쟁]     │  ──────────────      │
│                                       │  관계 · 동맹 · 전쟁   │
├───────────────────────────────────────┴──────────────────────┤
│ 연대기: 헤드라인 · 서술 (턴별 접기)                              │
├──────────────────────────────────────────────────────────────┤
│ > 명령을 입력하세요…                              [턴 진행 ▶] │
└──────────────────────────────────────────────────────────────┘
```

- 지도는 **정치 레이어**(소유국 색), **관계 레이어**(선택 국가 기준 호감도 그라데이션), **전쟁 레이어**(교전·점령) 3종.
- 주 클릭 → 소유국·실효지배국·태그 표시. 명령 입력창에 주 이름이 자동 삽입된다.
- 설정: 제공자 선택, Gemini 키 입력(localStorage 저장, 기기 밖으로 나가지 않음), Qwen 모델 다운로드 상태, 난이도(현실성 엄격도).
- 키 미입력 상태에서도 지도 탐색은 가능하다. LLM 필요 기능에만 안내를 띄운다.

---

## 7. 기술 스택

- **Vite + TypeScript**, 프레임워크는 최소화(필요 시 Preact/Solid)
- **지도**: MapLibre GL JS 우선 (줌·성능). 단순화 필요 시 D3-geo + Canvas로 대체 가능하도록 `MapView` 인터페이스로 격리
- **데이터 빌드**: Node 스크립트 `scripts/build-map.mjs` — Natural Earth admin-1 → mapshaper 단순화 → TopoJSON, 인접 그래프 계산, 오버라이드 적용
- **LLM**: `LLMProvider` 인터페이스 (`GeminiProvider`, `WebLLMProvider`)
- **저장**: localStorage + JSON 내보내기/가져오기
- **배포**: GitHub Pages

```
althistory/
  DESIGN.md
  src/
    engine/      # 상태, 검증, RNG, diff 적용 (순수 함수, LLM 비의존)
    llm/         # provider, 프롬프트, 스키마, 재시도 루프
    map/         # MapView, 레이어
    ui/
    scenarios/   # *.json (시작 상태, 매핑표)
  scripts/
    build-map.mjs
  data/
    raw/         # 원본 (수정 금지)
    overrides/   # worldview.json
  tests/
    golden/      # 프롬프트 회귀용 (명령, 기대 불변식)
```

**엔진을 LLM과 분리하는 이유**: 엔진은 순수 함수라서 LLM 없이 단위 테스트가 가능하다. 프롬프트가 바뀌어도 상태 무결성은 깨지지 않는다.

---

## 8. 시나리오 형식

```jsonc
{
  "id": "modern-2026",
  "name": "현대 (2026)",
  "startDate": "2026-01-01",
  "turnLength": "1 month",
  "worldview": "default-worldview",
  "countries": { /* 시작 국가 수치, 지도자, 성격 */ },
  "provinceOwners": { /* 오버라이드 외 예외 */ },
  "alliances": [],
  "playable": ["KOR", "TWN", "USA", "..."]
}
```
- 역사 시나리오(1914, 1936 등)는 `provinceOwners` 매핑표만 따로 만든다 (지도 기하는 공유). 초안은 Claude Code로 생성하고 사람이 검수한다.
- 현대 외 시나리오에서는 "카슈미르/대만/크림" 정책이 해당 시대 상황에 맞게 별도로 정의된다 (이 문서의 정책은 `modern-*` 시나리오 기본값).

---

## 9. 마일스톤

| 단계 | 산출물 | 완료 기준 |
|---|---|---|
| M0 지도 ✅ | 빌드 스크립트 + 정치 레이어 지도 | 세계 지도 렌더, 대만·크림·카슈미르가 정책대로 표시 — **완료 (아래 M0 결과)** |
| M1 엔진 | 상태/diff/검증/RNG + 단위 테스트 | LLM 없이 수동 diff로 영토 이전 동작 |
| M2 LLM 연결 | Gemini BYOK + 해석기·시뮬레이터 | 명령 1개 → 지도 변화 |
| M3 루프 | 턴 진행, AI 반응, 연대기, 저장 | 20턴 연속 플레이 가능 |
| M4 Qwen | WebLLM 서술·압축 + 라우팅 | 키 없이도 서술 기능 일부 동작 |
| M5 품질 | 골든 테스트 30개, 프롬프트 튜닝 | 불변식 위반 0건 |

---

## 10. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| Gemini 무료 한도·정책 변경 | BYOK + 제공자 추상화, 호출 수 최소화(3단계 중 2단계는 로컬) |
| 작은 모델의 JSON/맥락 실패 | 문법 제약 디코딩, 재시도 루프, 시뮬레이터는 Qwen에 맡기지 않음 |
| LLM의 "항상 성공" 편향 | feasibility + 시드 RNG, 프롬프트에 편향 금지 명시, 골든 테스트 |
| 환각 ID/영토 | enum 스키마, 엔진 검증, 인접성 규칙 |
| 컨텍스트 폭증 | 관련 국가만 포함, 롤링 메모리 |
| 모바일 WebGPU 미지원 | Qwen은 선택 기능, 미지원 시 Gemini 폴백 |
| 정치적으로 민감한 입력에 대한 모델 안전 필터 | 필터에 걸리면 사용자에게 알리고 재시도/순화 옵션 제공 |
| 역사 국경 데이터 라이선스 | 현대 지도는 퍼블릭 도메인(Natural Earth) 사용, 역사 데이터는 매핑표를 직접 작성해 외부 폴리곤 의존 최소화 |

---

## 11. 열린 질문

1. ~~카슈미르 범위~~ → **확정** (위 2장).
2. ~~플레이 가능 국가 수~~ → **확정: 모든 국가 플레이 가능.** 그래서 국가 시작 수치와 지도자는 수작업이 아니라 공개 데이터(World Bank, CIA Factbook 류)와 Claude Code 생성 + 검수로 채운다. 소국·도시국가는 주가 1개뿐이므로 전쟁/영토 규칙에 예외 처리가 필요하다.
3. **턴 길이**: 현대 시나리오 1개월/턴이 적절한가.
4. **서사 언어**: 연대기를 한국어로 고정할 것인가, 선택 가능하게 할 것인가 (Qwen의 한국어 품질 확인 필요).
5. **지도 엔진**: MapLibre 확정 여부.

---

## 12. M0 결과 (지도) — 구현 기록

**실행**: `npm install` → `npm run fetch:data` → `npm run build:map` → `npm run dev` (또는 `npm run build && npm run preview`)

**산출물**: 주 4,601개 · 국가 207개 · `world.topo.json` 1.6MB (+ 인접 그래프 284KB, 국가 표 18KB)

**정책 검증 (빌드 시 자동 + 브라우저 클릭으로 확인)**
- 크림·세바스토폴 → Ukraine (Natural Earth 기본값은 Russia라서 오버라이드 적용)
- 아자드 카슈미르·길기트-발티스탄(데이터 이름은 `Northern Areas`) → Pakistan
- 인도령 잠무·카슈미르, 라다크, 시아첸(별도 단위라 오버라이드) → India
- 악사이친(신장 폴리곤에 포함) → China
- 대만 21개 주 → 독립국 `Taiwan`, 한글 표기 "대만"(Natural Earth 기본값 '중화민국'을 덮어씀)
- 대만/중국, 우크라이나/러시아, 파키스탄/인도, 남북한은 **반드시 다른 색** (빌드가 어기면 실패)

**구현 중 발견한 문제와 해결 (다음에 같은 실수를 하지 않기 위해 기록)**
1. 단순화 후 **바티칸 폴리곤이 사라짐** → 좌표 양자화 정밀도를 1e5 → 1e6으로 올리고, "어떤 주도 지오메트리를 잃으면 빌드 실패" 불변식을 추가.
2. **MapLibre 6은 Vite 번들에서 워커 경로를 못 찾아** GeoJSON이 아예 그려지지 않음(UI는 멀쩡해 보임) → 워커 파일을 `?url`로 내보내고 `setWorkerUrl()`로 지정. **헤드리스 브라우저 스크린샷으로만 발견 가능했던 문제**이므로, 지도 변경 시에는 항상 스크린샷 검증을 한다.
3. 대만이 중국과 **같은 색**으로 칠해짐(육지로 맞닿지 않아 색 배정이 허용) → 1.5도 안의 근접국도 이웃으로 취급하도록 색 배정을 수정.
4. 초소국(바티칸 등)은 폴리곤을 클릭할 수 없음 → 나라 전체가 1.5도 이하인 국가에 클릭 가능한 점 마커를 추가.

**알려진 한계 (M0 시점)**
- 마쭈(롄장)·프라타스(둥사) 제도: Natural Earth 10m 주 데이터에 폴리곤이 없음. 정책상 Taiwan 소유로 두어야 하므로, 필요하면 수작업 폴리곤을 `data/overrides/`에 추가.
- 시아첸 빙하는 데이터상 별도 단위라 오버라이드로 인도에 배정(실효지배 기준).
- 단순화 5%라 해안선이 거칠다. 줌 7 이상 정밀도가 필요해지면 `SIMPLIFY` 환경변수를 낮춰 재빌드.
- `owner`와 `controller`는 모델에는 있으나 M0 UI에서는 항상 같은 값을 표시한다.
- 영토 분쟁/비주권 단위(코소보, 소말릴란드, 북키프로스, 팔레스타인 등)는 Natural Earth 분류를 그대로 따라 별도 국가로 존재한다. 게임에서 어떻게 다룰지는 추후 결정 필요.
