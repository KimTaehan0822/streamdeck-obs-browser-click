# OBS Browser Click 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OBS 사용자 지정 독·브라우저 소스 안의 버튼을 스트림덱 키로 누르는 플러그인(미리 만든 리모컨 동작 + 범용 클릭).

**Architecture:** OBS를 `--remote-debugging-port`로 켜면 열리는 CDP(`http://127.0.0.1:<port>/json/list` + 페이지별 WebSocket)로 페이지 안에서 짧은 스크립트를 실행해 버튼을 찾고 `element.click()` 합니다. 찾기·누르기·상태 읽기는 한 함수(`runInPage`)가 맡고, 이 함수를 문자열로 만들어 `Runtime.evaluate`로 보냅니다. 키 그림은 그리지 않고 Stream Deck 제목·상태(0/1)·`showAlert`만 씁니다.

**Tech Stack:** `@elgato/streamdeck` 3.0.4, TypeScript ~6.0, rollup, `ws`(CDP용 WebSocket), `node --test`, `sdpi-components`.

**Spec:** `docs/superpowers/specs/2026-11-10-obs-browser-click-design.md`

## Global Constraints

- 저장소: `C:\Users\Kimtan_StreamPC\streamdeck-obs-browser-click`. 틀(package.json 스크립트, tsconfig, rollup, .gitignore, 테스트 방식)은 `C:\Users\Kimtan_StreamPC\streamdeck-obs-audio`를 그대로 따릅니다. 그 저장소 파일은 **읽기만** 합니다.
- 플러그인 UUID `com.haeunga0822.obs-browser-click`, 이름 `OBS Browser Click`, Author `Kimtan2`, Windows 10+, Node 20, Software MinimumVersion `7.3`, SDKVersion 2.
- 액션 UUID: `com.haeunga0822.obs-browser-click.remote-button`(이름 "리모컨 버튼"), `com.haeunga0822.obs-browser-click.custom-click`(이름 "범용 클릭"). 둘 다 Keypad, 상태 2개(0 꺼짐, 1 켜짐).
- 전역 설정 `port`: 비어 있으면 `9222`.
- 화면 문구는 한국어만. 오프라인 문구 `OFFLINE`, 페이지·버튼 못 찾음 `없음`.
- 글자 비교: 앞뒤 공백 제거 + 연속 공백 하나로 바꾼 뒤 **완전히 같을 때만**. 못 찾으면 아무것도 누르지 않습니다.
- 같은 URL 패턴의 페이지가 여럿이면 `/json/list` 순서의 첫 번째 `type === 'page'`만.
- 토글 상태 읽기: 화면에 보이는 토글 키만, 1000ms마다.
- 페이지 주소(리모컨 키 값 포함)는 로그에 쓰지 않습니다.
- 외부 의존성은 `@elgato/streamdeck`, `ws`만 (개발용은 obs-audio와 같은 것).
- 코드 변경을 보여줄 때마다: `npm run bundle` → 이 플러그인의 node.exe(명령줄에 `com.haeunga0822.obs-browser-click.sdPlugin` 포함)만 `Stop-Process` → 새 프로세스 시작 시각이 `bin/plugin.js` 수정 시각보다 늦은지 확인. 스트림덱 앱 재시작은 manifest가 바뀔 때만 한 번 안내.
- 시험으로 누를 때: 되돌릴 수 있는 토글만 누르고 바로 되돌립니다. 스킵·취소·삭제·시작류는 사용자가 테스트 알림을 띄운 뒤 사용자 확인을 받고 누릅니다.

## Review Focus

1. **독이 탭 뒤에 숨어 있거나 접혀 있을 때** — 버튼이 `display`상 안 보여도(크기 0) 눌려야 합니다. `runInPage`는 보이는지로 거르지 않습니다(Task 2 테스트 `ignores visibility`).
2. **같은 글자 버튼이 여럿**(위플랩 "모두 취소" 2개, "시작" 4개) — `within`/`index` 없이는 첫 번째가 눌립니다. 프리셋은 반드시 범위를 좁혀야 합니다(Task 3 테스트 `every weflab preset resolves to exactly one element`는 실페이지 확인 단계로 검증).
3. **OBS가 디버깅 모드 없이 켜짐 / OBS 꺼짐** — `listPages`가 거부되면 키는 `OFFLINE`, 누르면 `showAlert`, 예외로 플러그인이 죽지 않아야 합니다(Task 1 `rejects when port closed`, Task 4 `press while offline alerts`).
4. **페이지가 응답하지 않음(새로고침 중, 멈춤)** — `evaluate`는 2000ms 안에 끝나지 않으면 거부하고 소켓을 닫습니다(Task 1 `times out`).
5. **설정이 비었거나 옛 프리셋 id** — 프리셋 id를 모르면 `없음` 표시, 누르면 `showAlert`, 아무것도 안 누름(Task 4 `unknown preset alerts`).

---

### Task 1: 저장소 틀 + CDP 클라이언트

**Files:**
- Create: `package.json`, `tsconfig.json`, `rollup.config.mjs`, `.gitignore` (obs-audio 것을 복사하고 이름·경로만 `obs-browser-click`으로)
- Create: `src/cdp.ts`
- Test: `test/cdp.test.mjs`, `test/fake-cdp.mjs`

**Interfaces:**
- Produces:
  - `interface CdpPage { id: string; type: string; title: string; url: string; webSocketDebuggerUrl: string }`
  - `listPages(port: number): Promise<CdpPage[]>` — `fetch('http://127.0.0.1:<port>/json/list')`, `type === 'page'`만 돌려줌.
  - `findPage(pages: CdpPage[], urlPart: string): CdpPage | undefined` — `url.includes(urlPart)`인 첫 번째. `urlPart`가 비면 undefined.
  - `evaluate(wsUrl: string, expression: string, timeoutMs = 2000): Promise<unknown>` — 연결 열고 `Runtime.evaluate { expression, returnByValue: true, userGesture: true }` 한 번, `result.result.value` 반환, 닫음. `exceptionDetails`가 있으면 거부.
  - `// shortcut: 호출마다 새 WebSocket. 키가 많아져 느리면 페이지별 연결 유지로 바꿈`

- [ ] **Step 1:** `git init`, 틀 파일 작성, `npm install` (`@elgato/streamdeck@3.0.4`, `ws`, `@types/ws` + obs-audio와 같은 devDependencies). 스펙 파일도 첫 커밋에 포함.
- [ ] **Step 2: 실패하는 테스트 작성** — `test/fake-cdp.mjs`는 `node:http` + `ws`의 `WebSocketServer`로 `/json/list`와 `Runtime.evaluate` 응답을 흉내 냅니다(응답 값·지연·예외를 테스트가 정함).
  - `lists only pages`: 목록에 page 2개 + iframe 1개 → 2개, 제목·url 일치.
  - `rejects when port closed`: 아무도 안 듣는 포트 → reject.
  - `findPage matches substring, first wins`: `alertlist?mode=remote`로 두 개 중 첫 번째.
  - `evaluate returns value`: 가짜가 `{ result: { result: { value: 'ok' } } }` → `'ok'`, 보낸 메시지에 `userGesture: true`, `returnByValue: true`.
  - `evaluate rejects on exception`: `exceptionDetails` 있음 → reject.
  - `times out`: 가짜가 답 안 함, `timeoutMs` 100 → 100~1000ms 사이 reject, 서버 쪽 연결이 닫힘.
- [ ] **Step 3:** `npm test` → 위 테스트 FAIL(모듈 없음) 확인.
- [ ] **Step 4:** `src/cdp.ts` 구현.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** 커밋 `feat: CDP client for OBS browser pages`.

### Task 2: 페이지 안 찾기·누르기·상태 읽기

**Files:**
- Create: `src/page-script.ts`
- Test: `test/page-script.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export interface Target {
    url: string              // 페이지 URL에 포함될 문자열
    selector?: string        // 후보 CSS. 없으면 CLICKABLE
    text?: string            // 후보의 innerText(정규화)가 이것과 같아야 함
    within?: string          // 이 CSS 조상 안의 후보만
    row?: string             // 정규화한 자기 글자가 이것과 같은 요소에서 위로 올라가며, 후보가 처음 나오는 조상 안의 후보만
    index?: number           // 거른 뒤 n번째(기본 0)
    toggle?: { onClass: string } | { checked: true }
  }
  export const CLICKABLE = 'button, a, [role=button], input[type=button], input[type=submit], input[type=checkbox]'
  export type Mode = 'click' | 'state' | 'list'
  export function runInPage(target: Target, mode: Mode): string | { text: string; index: number }[]
  export function pageExpression(target: Target, mode: Mode): string  // `(${runInPage})(${JSON.stringify(target)}, ${JSON.stringify(mode)})`
  ```
  - `click` → `'ok' | 'missing'`; `state` → `'on' | 'off' | 'missing'`(toggle 없으면 `'missing'`); `list` → CLICKABLE 중 글자 있는 것 전부, `index`는 같은 글자 중 몇 번째인지(= `click`에서 `{text, index}`로 그대로 다시 찾히는 값).
  - `runInPage`는 바깥 변수·import를 쓰면 안 됩니다(문자열로 옮겨져 페이지에서 돔). 정규화 함수도 안에 둡니다.

- [ ] **Step 1: 실패하는 테스트 작성** — `globalThis.document`에 작은 가짜 DOM(`querySelectorAll`, `innerText`, `className`/`classList.contains`, `checked`, `closest`, `parentElement`, `click()` 카운터)을 넣고 `runInPage`를 바로 부릅니다.
  - `clicks by selector`: `#page_alert_cancel` → `'ok'`, 그 요소 click 1회.
  - `exact text only`: 버튼 `현재 취소`, `모두 취소`; text `취소` → `'missing'`, 아무 click 없음. text ` 모두   취소 ` → 정규화 후 `'ok'`.
  - `within narrows`: `.display_btn_box` 안팎에 `모두 취소` → 안쪽만 click.
  - `row narrows`: 줄 제목 `채팅 후원` 아래 토글 2개, `응원 후원` 아래 2개; `row: '응원 후원', index: 1` → 응원 줄 두 번째만 click.
  - `index picks nth`: 같은 글자 3개, index 2 → 세 번째.
  - `ignores visibility`: 크기 0 요소도 click.
  - `state by class`: className에 `paused` 있으면 `'on'`, 없으면 `'off'`; `checked` 토글도.
  - `list round-trips`: `list` 결과의 각 `{text, index}`로 `click`하면 그 요소가 눌림.
  - `expression is self-contained`: `new Function('return ' + pageExpression(t, 'click'))()`가 가짜 DOM에서 `'ok'`.
- [ ] **Step 2:** `npm test` → FAIL 확인.
- [ ] **Step 3:** `src/page-script.ts` 구현.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** 커밋 `feat: find, click and read buttons inside a page`.

### Task 3: 미리 만든 동작 목록

**Files:**
- Create: `src/presets.ts`
- Test: `test/presets.test.mjs`
- Create(시험용, 커밋 안 함): 스크래치 폴더의 실페이지 확인 스크립트

**Interfaces:**
- Consumes: `Target`(Task 2), `listPages`/`findPage`/`evaluate`(Task 1).
- Produces:
  - `interface Preset { id: string; service: '위플랩' | '씨미' | '치지직' | '투네이션'; label: string; target: Target }`
  - `PRESETS: readonly Preset[]`, `presetById(id: string): Preset | undefined`
  - URL 조각: 위플랩 `weflab.com/alertlist?mode=remote`, 씨미 `/rc`, 치지직 `/remotecontrol`, 투네이션 `toon.at/widget/controller/`.
    - 씨미는 채팅 팝업(`studio.ci.me/@.../chat-popup`)도 같은 호스트라 호스트로는 못 가릅니다. 리모컨 주소의 `/1/rc`에서 번호는 사람마다 달라서 `/rc`만 씁니다. Step 1에서 다른 페이지 URL에 `/rc`가 없는지 확인합니다. shortcut: 다른 페이지에 `/rc`가 생기면 `findPage`에 정규식을 허용.

- [ ] **Step 1: 실페이지 확인(읽기 전용)** — OBS가 9222로 켜져 있는지 `/json/list`로 확인. 스펙 표의 모든 동작에 대해 `pageExpression(target, 'list')`와 후보 개수를 세는 식으로 **정확히 1개**가 잡히는지 확인합니다. 씨미 토글은 각 줄 제목(채팅 후원, 응원 후원, 영상 후원, 미션 후원, 구독 알림 후원, 구독 선물 알림, 워프(레이드) 등 페이지에 실제 있는 것)과 그 줄의 토글 이름(알림/TTS/영상)을 읽어 `row` + `selector: 'button.ToggleView'` + `index`로 적습니다. `button.SpeakerButtonView`는 넣지 않습니다(스펙에 없음).
- [ ] **Step 2: 토글 여부 확인** — 씨미 `일시정지`, 치지직 `알림 정지`를 `click` → 1.5초 뒤 글자·class 읽기 → 다시 `click`으로 되돌리기. 바뀌는 class/글자가 있으면 `toggle: { onClass }`로, 없으면 토글 없이 둡니다. 결과를 스펙의 "확인 필요" 칸에 적습니다.
- [ ] **Step 3: 실패하는 테스트 작성**
  - `ids are unique and stable`: 모든 id 고유, `^[a-z0-9-]+$`.
  - `every preset has url and a way to find it`: `target.url` 비지 않음, `selector` 또는 `text` 중 하나 이상.
  - `ambiguous weflab texts are scoped`: 글자가 `시작`·`취소`·`모두 취소`·`중지`인 위플랩 프리셋은 모두 `within` 또는 고유 selector가 있음.
  - `toggles`: 위플랩 일시정지 `onClass: 'play'`, 투네이션 일시정지 `onClass: 'paused'`, 위플랩 알림 사용 `checked: true`, 씨미 토글 `onClass`는 Step 1에서 읽은 켜짐 class 조각.
  - `spec coverage`: 서비스별 개수가 Step 1에서 확정한 표와 같음(숫자를 테스트에 적음).
- [ ] **Step 4:** `npm test` → FAIL.
- [ ] **Step 5:** `src/presets.ts` 작성(스펙 표 순서, 라벨은 표의 한국어 그대로).
- [ ] **Step 6:** `npm test` → PASS.
- [ ] **Step 7:** 커밋 `feat: remote presets for weflab, ci.me, chzzk and toonation` (스펙 갱신 포함).

### Task 4: 액션, 플러그인 진입점, 매니페스트, 속성 창

**Files:**
- Create: `src/actions.ts`, `src/plugin.ts`
- Create: `com.haeunga0822.obs-browser-click.sdPlugin/manifest.json`, `ui/click.html`, `ui/sdpi-components.js`(obs-audio에서 복사), `imgs/`(plugin·category png는 obs-audio 것 복사, 키 아이콘 `key-off.svg`·`key-on.svg` 단색 원 두 개), `.sdignore`
- Test: `test/actions.test.mjs`, `test/fake-action.mjs`(obs-audio `test/fake-obs.mjs`의 `fakeAction` 방식)

**Interfaces:**
- Consumes: Task 1~3 전부.
- Produces:
  - `interface Clicker { port(): number; listPages(): Promise<CdpPage[]>; evaluate(wsUrl: string, expr: string): Promise<unknown> }` — 테스트에서 가짜로 바꿀 수 있게 액션 생성자에 넘깁니다.
  - `abstract class ClickAction<S> extends SingletonAction<S>` + `protected abstract targetOf(s: S): Target | undefined` + `protected abstract labelOf(s: S): string`
  - `class RemoteButtonAction` — 설정 `{ preset?: string }`
  - `class CustomClickAction` — 설정 `{ pageUrl?: string; button?: string /* "<index>\t<text>" */; selector?: string }`. `selector`가 비지 않으면 `{ url: pageUrl, selector }`, 아니면 `{ url: pageUrl, text, index }`. 토글 없음.
  - 속성 창 데이터소스(`streamDeck.ui.onSendToPlugin`): `getPresets` → `[{ label: 서비스, children: [{ value: id, label }] }]`, `getPages` → `[{ value: url, label: title }]`, `getButtons`(현재 키 설정의 `pageUrl` 사용) → `[{ value: "<index>\t<text>", label: text + (index ? ` (${index + 1})` : '') }]`.

- 동작 규칙:
  - 누름: 대상 없음/페이지 없음/`'missing'` → `showAlert()`, 연결 실패 → `showAlert()` + 제목 `OFFLINE`. `'ok'`이고 토글이면 곧바로 `state` 한 번 읽어 `setState`.
  - 1000ms 타이머 하나가 보이는 키 전부를 돌며: `listPages` 실패 → 제목 `OFFLINE`; 페이지·버튼 없음 → `없음`; 정상 → 라벨(아래); 토글 키는 `setState(on ? 1 : 0)`. 보이는 키가 없으면 타이머 정지.
  - 제목: 사용자가 스트림덱 앱에서 제목을 직접 입력했으면 절대 덮어쓰지 않습니다(obs-audio `base-action.ts`의 `titles`/`onTitleParametersDidChange` 방식). 아니면 라벨(프리셋 `label`, 범용은 버튼 글자 또는 `selector`). `OFFLINE`/`없음`은 사용자 제목이 있어도 보이게 할지: **보이지 않게** 하고 `showAlert`만 _(내 판단: 사용자 제목 존중)_.
  - 같은 값이면 `setTitle`/`setState`를 다시 보내지 않습니다.
  - 상태가 바뀔 때만 로그 한 줄: `state <action id> <0|1|OFFLINE|없음>` (URL 없이). Task 5 실기 확인에 씁니다.
  - 전역 설정 `port` 변경은 다음 타이머 주기부터 적용.

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 `Clicker` + 가짜 액션)
  - `press clicks preset`: 프리셋 `toonation-skip` 누름 → `evaluate`에 `pageExpression(target,'click')`과 같은 식, 투네이션 페이지의 wsUrl.
  - `press while offline alerts`: `listPages` reject → `showAlert` 1회, 제목 `OFFLINE`, 예외 없음.
  - `unknown preset alerts`: `{ preset: 'gone' }` → `evaluate` 호출 없음, `showAlert`.
  - `missing button alerts`: `evaluate`가 `'missing'` → `showAlert`.
  - `toggle follows page`: 위플랩 일시정지 키, `state` 결과 `'on'` → `setState(1)`; 같은 결과 두 번째엔 다시 안 보냄.
  - `user title is kept`: 사용자 제목 있음 → 라벨·`OFFLINE`으로 `setTitle` 안 함.
  - `custom selector wins`: `{ pageUrl, button: '1\t시작', selector: '#x' }` → target에 `selector: '#x'`, text 없음.
  - `custom button parses`: `button: '2\t모두 취소'` → `{ text: '모두 취소', index: 2 }`.
  - `getPresets groups by service`: 서비스 4개, 순서 위플랩·씨미·치지직·투네이션.
  - `timer stops`: 모든 키가 사라지면 타이머 없음(테스트 프로세스가 끝남).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `src/actions.ts`, `src/plugin.ts` 구현(로그 연결은 obs-audio `plugin.ts` 첫 두 줄 방식, 페이지 주소는 로그에 쓰지 않음).
- [ ] **Step 4:** manifest, `ui/click.html` 작성 — 한 PI가 액션 UUID로 필드를 고릅니다. 리모컨: `sdpi-select setting="preset" datasource="getPresets"`. 범용: `pageUrl`(datasource `getPages`, hot-reload), `button`(datasource `getButtons`, `pageUrl`이 바뀌면 다시 요청), `selector`(textfield, 안내 "비우면 위에서 고른 버튼"). 전역: `port`(placeholder 9222). 맨 아래 안내 한 줄: "OBS를 --remote-debugging-port=9222 옵션으로 켜야 동작합니다."
- [ ] **Step 5:** `npm test` → PASS, `npm run bundle` 성공.
- [ ] **Step 6:** 커밋 `feat: remote button and custom click actions`.

### Task 5: 실기 확인, 설명서

**Files:**
- Create: `README.md`(한국어)
- Modify: 스펙의 "확인 필요" 칸(아직 남아 있으면)

- [ ] **Step 1:** `npx streamdeck link com.haeunga0822.obs-browser-click.sdPlugin` (처음 한 번). manifest가 새로 생겼으므로 스트림덱 앱 재시작이 필요하면 사용자에게 한 번만 안내.
- [ ] **Step 2:** 플러그인 프로세스 시작 시각 > `bin/plugin.js` 수정 시각 확인.
- [ ] **Step 3:** 상태 따라가기 실기 확인: 사용자가 투네이션·위플랩 일시정지 키를 스트림덱에 하나씩 올려 둔 상태에서, 스크래치 스크립트로 페이지 쪽 일시정지를 눌렀다 되돌리고 플러그인 로그 `logs/`에 `state <id> 1` → `state <id> 0`이 찍히는지 확인. (키 누름 자체는 Step 6에서 사용자가 확인)
- [ ] **Step 4:** OBS를 디버깅 옵션 없이 켠 상태를 흉내 내려면 전역 포트를 9 같은 닫힌 포트로 바꿔 `OFFLINE`이 뜨는지 확인 후 9222로 되돌림.
- [ ] **Step 5:** README: 설치, OBS 바로가기 고치는 법(바로가기 속성 → 대상 끝에 ` --remote-debugging-port=9222`, 시작 위치 `C:\Program Files\obs-studio\bin\64bit`), 두 액션 쓰는 법, 동작 목록 표, 주의(포트가 열려 있는 동안 이 PC 프로그램은 OBS 페이지에 접근 가능).
- [ ] **Step 6:** 사용자에게 테스트 요청 — 파일 위치(전체 경로, 각각 코드 블록) 먼저, 탐색기로 폴더 열기, 스킵·취소류는 테스트 알림으로 직접 눌러 달라고 요청.
- [ ] **Step 7:** 커밋 `docs: README and verified preset notes`.
