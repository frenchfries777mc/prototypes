# Althist (가칭) — AI 대체역사 시뮬레이터

실제 세계지도(주 4,604개 / 국가 207개) 위에서 한 나라를 골라 **자유 문장으로 명령**하면 AI가 결과를 판정하고 지도가 바뀌는 턴제(1턴 = 1개월) 게임.
서버 없이 **HTML 한 파일**로 동작한다.

## 바로 플레이

`althist.html` 을 브라우저(WebGL 지원 최신 Chrome/Edge/Safari/Firefox)에서 열면 된다. 인터넷도 필요 없다(Gemini/Qwen 모드만 필요).

1. 국가를 검색하거나 **지도를 클릭**해서 고른다.
2. AI 판정 방식을 고른다.
   - **규칙 모드**: 키 없이 바로. 키워드(공격·평화·동맹·제재·투자·군비·개혁)와 국가명을 이해한다.
   - **Gemini**: 자유 문장. [무료 API 키](https://aistudio.google.com/apikey)를 입력(이 기기 localStorage에만 저장).
   - **브라우저 Qwen**: 실험적. WebGPU 필요.
3. 명령을 쓰고 **턴 진행** (Ctrl+Enter). 되돌리기, 자동저장, 파일 저장/불러오기 지원.

예: `북한에 선전포고하고 개성을 점령한다` · `일본과 경제 협력 협정을 추진한다` · `군비를 증강한다`

## 개발

```bash
npm install
npm run fetch:data    # Natural Earth 원본 다운로드 (data/raw, git 제외)
npm run build:map     # 오버라이드 적용, 빈 땅 메움, 정책 검증 -> public/data
npm run dev           # 개발 서버
npm run build:single  # althist.html 생성
npm run test:e2e      # Playwright 필요 (npm i -D playwright)
```

- 설계와 구현 기록: [DESIGN.md](./DESIGN.md) (특히 13장: 현재 구현과 **검증하지 못한 부분**)
- 지도 정책(대만/크림/카슈미르 등): `data/overrides/worldview.json` — 어긋나면 빌드가 실패한다.
- 지도 데이터: Natural Earth (퍼블릭 도메인).
