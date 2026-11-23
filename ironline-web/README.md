# Ironline (web)

three.js 로 처음부터 다시 만든 1인칭 거점 점령전. 설치 없이 브라우저에서 실행하고, 아군·적군 봇과 함께 싸웁니다.
(이전 Godot 판은 `../ironline/` 에 남겨 두었습니다.)

- 실행: `python3 -m http.server` 후 `index.html` (ES 모듈이라 파일로 직접 열면 안 됩니다)
- 조작: WASD 이동, Shift 달리기, Space 점프, 마우스 조준·발사, 우클릭 정조준, R 장전, 1·2·3 무기, Tab 점수판, V 3인칭, ` 디버그
- 구조: `src/world.js`(지형·충돌) `src/sim.js`(규칙·봇, 렌더 없이 Node 에서 시험 가능) `src/gfx.js` `decor.js` `units.js` `fx.js` `audio.js` `hud.js` `main.js`
- 시험: `node tools/sim_test.mjs`
- 에셋: CC0 (Kenney Nature Kit, Poly Haven) — `assets/models/LICENSES.md`. three.js 는 MIT (`vendor/LICENSE-three.txt`).
- 한계: 온라인 멀티플레이는 아직 옮기지 않았습니다.
- 지형 스타일: 기본은 카툰(`toon`). `?terrain=block|lowpoly|toon|paint|real|ps1` 로 바꿀 수 있고 메뉴에서도 고를 수 있습니다.
