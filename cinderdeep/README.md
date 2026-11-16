# CINDERDEEP — 마지막 등불 (The Last Lantern)

> 불꽃은 생명이자, 시야이자, 무기다.

마지막 불씨를 든 등불지기가 되어 아홉 심도의 심연으로 내려가는 **탑다운 로그라이트 액션**입니다.
등불의 **불꽃 하나가 체력 · 시야 · 탄약을 겸합니다.** 쏠수록 어두워지고, 맞으면 더 어두워지며,
쓰러뜨린 그림자가 흘린 불씨를 주워야만 다시 밝아집니다.

외부 에셋이 하나도 없습니다. 그래픽은 전부 코드로 그리고, 효과음과 음악은 WebAudio로 실시간 합성합니다.

## 바로 실행

- **웹**: `index.html`을 브라우저로 열면 됩니다 (빌드 · 서버 불필요).
- **단일 파일**: `npm run build` → `dist/cinderdeep.html` 하나로 묶입니다.
- **데스크톱(Steam용 셸)**: `npm install && npm run desktop`

## 조작

| | 키보드 · 마우스 | 게임패드 | 터치 |
|---|---|---|---|
| 이동 | WASD | L 스틱 | 왼쪽 드래그 |
| 조준 · 발사 | 마우스 · 좌클릭 | R 스틱 (RT: 자동 조준) | 자동 조준 / 오른쪽 드래그 |
| 질주 (무적) | Space / Shift | A / LT | 질주 버튼 |
| 섬광 | 우클릭 / Q | X / RB | 섬광 버튼 |
| 상호작용 | E | Y | 버튼 |
| 지도 / 일시정지 | M · Tab / Esc | Back / Start | 버튼 |

메뉴는 마우스 · 키보드 · 게임패드 · 터치 모두로 조작할 수 있습니다.

## 게임 구성

- **불꽃 경제** — 불꽃이 곧 체력이며 빛의 반경이고, 발사 비용입니다. 저절로도 타들어 갑니다.
- **절차 생성 동굴** — 매 심도가 새로 만들어지며, 실시간 그림자 조명과 "탐험 기억" 미니맵이 있습니다.
  등불의 불꽃은 아직 꺼져 있는 화로 쪽으로 기웁니다.
- **화로와 문** — 화로 곁에 머물러 불을 붙이면 어둠이 습격해 옵니다. 모두 밝히면 아래로 가는 문이 열립니다.
- **그림자 10종 + 보스 3종** — 도약귀, 침 뱉는 눈, 방패지기, 벽을 통과하는 망령… 심도 3 · 6 · 9에 주인이 기다립니다.
- **은총 32종** — 관통 · 연쇄 · 도깨비불 · 혜성 질주 · 불사조의 깃 등 중첩 가능한 강화로 매번 다른 빌드.
- **등불 3종** — 잔불(연사), 볕조각(산탄), 뇌광(연쇄 번개).
- **성소** — 하강에서 가져온 재로 영구 강화 8종과 등불을 해금합니다.
- **어스름 0–5단계** — 완수할 때마다 열리는 상위 난이도.
- **기록** — 도감, 업적 16개, 전적.
- 한국어 / English, 음량 · 화면 흔들림 · 피해 숫자 옵션, 자동 저장.

## 폴더 구조

```
index.html          진입점
css/style.css       메뉴 UI
js/util.js          수학 · 난수
js/save.js          저장(localStorage)
js/i18n.js          한국어/영어 문자열
js/audio.js         효과음 · 적응형 음악 합성
js/input.js         키보드/마우스 · 게임패드 · 터치
js/data.js          등불 · 그림자 · 은총 · 성소 · 업적 데이터
js/level.js         동굴 생성, 충돌, 광선, 길찾기, 바닥 프리렌더
js/fx.js            파티클 · 화면 효과
js/enemies.js       그림자와 보스 AI
js/world.js         플레이어, 무기, 화로, 스폰 디렉터
js/render.js        월드 렌더링과 조명
js/hud.js           인게임 HUD
js/ui.js            메뉴 화면
js/debug.js         URL 플래그와 자동 플레이 봇
js/main.js          부팅 · 상태 머신 · 루프
desktop/            Electron 셸 (Steam 연동 지점 포함)
tools/              빌드 · 테스트 · 밸런스 스크립트
```

## 테스트

```
npm install          # playwright, electron
npm test             # 입력/메뉴/저장 흐름 + 전 심도 소크 테스트
npm run balance      # 봇 반복 플레이로 사망 지점 · 층별 소요 시간 통계
npm run desktop:smoke
```

- `tools/test-flow.js` — 실제 키보드 · 마우스 입력으로 메뉴 → 플레이 → 일시정지 → 은총 선택 → 사망 → 저장 → 성소 구매까지 검증.
- `tools/test-gamepad.js` — 가상 게임패드로 메뉴 이동 · 플레이 · 일시정지를 검증하고, 합성 오디오의 출력 레벨(클리핑 여부)을 측정.
- `tools/test-soak.js` — 봇이 심도 1–9와 보스 3종을 최고 속도로 플레이하며 예외 발생 여부 확인.
- 디버그 URL: `index.html?autostart=1&depth=6&boons=10&lantern=storm&god=1&bot=1&speed=4&seed=123`

## Steam 출시 메모

`desktop/`은 Electron 셸이며 게임과의 접점은 `js/main.js`의 `CD.Platform` 하나입니다.

1. `npm install` 후 `desktop/steam_appid.txt`에 App ID를 넣으면 `steamworks.js`가 초기화됩니다(없으면 독립 실행).
2. Steamworks에 업적 API 이름을 `js/data.js`의 `ACHS` id(`first_light`, `maw`, `widow`, `unlit` …)와 같게 등록합니다.
3. `npm run dist` (electron-builder) → `release/`에 Windows / Linux / macOS 빌드.

확인된 것: 셸 구동, 종료 메뉴, 전체 화면 브리지(`npm run desktop:smoke`).
확인되지 않은 것: 실제 Steam 클라이언트 연동(업적 · 오버레이)과 `electron-builder` 패키징은 App ID와 각 OS 환경이 필요해 이 저장소에서 검증하지 못했습니다.

---

## English

**CINDERDEEP** is a top-down roguelite in which a single resource — your lantern's flame — is your health,
your field of view and your ammunition. Descend nine procedurally generated depths, kindle braziers while the
dark ambushes you, defeat three lords and relight the deep.

No external assets: every sprite is drawn in code and all audio is synthesised at runtime.
Open `index.html` to play, `npm run build` for a single-file build, `npm run desktop` for the desktop shell.
Korean and English are built in; mouse + keyboard, gamepad and touch are all supported.
