# Althist (가칭) — AI 대체역사 시뮬레이터

Pax Historia 류의 AI 대체역사 게임 프로토타입. 서버 없이 정적 웹앱으로 동작하고,
LLM은 사용자 본인의 Gemini 무료 키(BYOK)와 브라우저 내 Qwen(WebLLM)만 쓴다는 설계다.

- 설계: [DESIGN.md](./DESIGN.md) (지도 정책, 데이터 모델, 턴 파이프라인, 마일스톤)
- 현재 단계: **M0 완료** — 세계 정치 지도(주 4,601개 / 국가 207개), 정책 오버라이드, 클릭 정보 패널

## 실행

```bash
cd althistory
npm install
npm run fetch:data   # Natural Earth 원본 다운로드 (data/raw, git 제외)
npm run build:map    # 오버라이드 적용 + 단순화 + 정책 검증 -> public/data
npm run dev
```

`npm run build:map` 은 지도 정책(대만/크림/카슈미르 등)이 어긋나면 실패한다. 정책은 `data/overrides/worldview.json`.

지도 데이터: Natural Earth (퍼블릭 도메인).
