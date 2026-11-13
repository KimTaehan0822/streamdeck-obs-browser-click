# 새 버전 알림 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 화면을 열면 깃허브 최신 릴리즈와 내 버전을 비교하고, 새 버전이 있으면 안내와 릴리즈 페이지 링크를 보여준다.

**Architecture:** 플러그인 5개와 Music Now Playing Widget은 설정 화면 스크립트 `update-check.js`(모두 같은 파일)가 깃허브 API를 직접 부르고, 결과를 `localStorage`에 하루 동안 저장한다. Monitor Bridge는 WinForms라서 C#으로 같은 비교 규칙을 구현하고, 설정 창이 열릴 때 확인한다.

**Tech Stack:** 브라우저 JS (sdpi-components, node --test), C# .NET WinForms (xUnit).

**Spec:** `docs/superpowers/specs/2026-11-14-update-check-design.md`

**작업 폴더:** `C:\Users\Kimtan_StreamPC\` 아래 `streamdeck-rme-totalmix`, `streamdeck-obs-browser-click`, `streamdeck-obs-audio`, `streamdeck-topping-e2x2`, `monitor-bridge`, `obs-now-playing`. 각 저장소에서 `main`으로부터 `feat/update-check` 브랜치를 만든다. 첫 커밋에 스펙과 이 계획을 `docs/superpowers/specs/`, `docs/superpowers/plans/`로 함께 넣는다.

## Global Constraints

- 저장소 주인: `KimTaehan0822`. API: `https://api.github.com/repos/KimTaehan0822/<repo>/releases/latest`. 응답에서 `tag_name`과 `html_url`만 쓴다.
- 클릭하면 릴리즈 페이지(`html_url`)를 연다. 다운로드나 설치는 하지 않는다.
- 실패(오프라인, 403/404, JSON 오류, `localStorage` 사용 불가)는 조용히 넘어간다. 오류 창이나 콘솔 예외를 내지 않는다.
- 설정 화면을 열었을 때만 보인다. 트레이 풍선, 윈도우 알림, 키 표시는 쓰지 않는다.
- 버전 비교: 앞의 `v`/`V`를 떼고 `+` 뒤를 버린다. 점으로 나눈 앞 세 자리를 숫자로 비교하고, 없는 자리는 0으로 본다. 숫자로 읽을 수 없으면 "새 버전 아님"으로 처리한다.
- 결과는 하루(86 400 000 ms) 동안 저장한다. 실패 결과도 저장해서 깃허브에 계속 묻지 않게 한다.
- 팝업(Monitor Bridge, Music Now Playing Widget)은 같은 버전에 한 번만 띄운다. 그 뒤에는 안내 문구만 보인다.
- `freecshot-websocket-setup`은 건드리지 않는다.

## Review Focus

1. 깃허브 요청 제한(403)이나 오프라인 → 안내 없이 평소처럼 설정 화면이 떠야 한다. (Task 1 `latest` 테스트)
2. `1.0.1.0`(manifest 네 자리)과 `v1.0.1` 비교 → 새 버전이 아니어야 한다. (Task 1, Task 4 테스트)
3. `1.10.0`과 `1.9.9` → 문자열이 아니라 숫자로 비교해야 한다. (Task 1, Task 4 테스트)
4. 설정 화면을 여러 번 열어도 하루에 한 번만 요청해야 한다. (Task 1 캐시 테스트)
5. Monitor Bridge 설정 창이 응답을 기다리는 동안 멈추지 않아야 하고, 응답 전에 창을 닫아도 오류가 나지 않아야 한다. (Task 4 수동 확인)

---

### Task 1: `update-check.js` 공통 파일 + RME TotalMix 설정 화면

**Files (`streamdeck-rme-totalmix`):**
- Create: `com.haeunga0822.rme-totalmix.sdPlugin/ui/update-check.js`
- Create: `test/update-check.test.mjs`
- Modify: `com.haeunga0822.rme-totalmix.sdPlugin/ui/common.js` (맨 끝에서 안내 붙이기 + `TEXT` 표에 문구 2개 추가)
- Modify: `ui/` 안의 html 6개 (`channel-toggle, fader, fx, gain, global-keys, vu-dial`) — `common.js`보다 먼저 `<script src="update-check.js"></script>`

**Interfaces — Produces** (`globalThis.UpdateCheck`, import/export 없는 일반 스크립트):
- `isNewer(latestTag: string, current: string) -> boolean`
- `latest(repo: string, now = Date.now()) -> Promise<{ tag: string, url: string } | null>` — `localStorage` 키 `update-check:<repo>`, 값 `{ at, tag, url }` (실패 시 `tag: null`)
- `mountPluginNotice(repo: string, text: { available: string, open: string }) -> Promise<void>` — `SDPIComponents.streamDeckClient.getConnectionInfo()`의 `info.plugin.version`을 현재 버전으로 쓴다(`info`가 문자열이면 `JSON.parse`). 새 버전이면 `<div class="update-notice">`를 `document.body` 맨 끝에 붙인다. 안에는 `<span>text.available</span> <b>태그</b>`와 `<span>text.open</span>`을 담은 버튼이 들어간다(문구를 `<span>`에 따로 두어 각 플러그인 번역기가 바꿀 수 있게 한다). 버튼을 누르면 `client.send('openUrl', { url })`.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/update-check.test.mjs`: `globalThis.localStorage`(Map 기반 가짜)와 `globalThis.fetch`(호출 횟수를 세는 가짜)를 준비한 뒤 `await import('../com.haeunga0822.rme-totalmix.sdPlugin/ui/update-check.js')`.

```js
test('isNewer', () => {
	assert.equal(isNewer('v1.0.2', '1.0.1.0'), true)
	assert.equal(isNewer('v1.0.1', '1.0.1.0'), false)
	assert.equal(isNewer('v1.0.0', '1.0.1'), false)
	assert.equal(isNewer('v1.10.0', '1.9.9'), true)
	assert.equal(isNewer('v0.3.1', '0.3.1+20261114.1200'), false)
	assert.equal(isNewer('nightly', '1.0.0'), false)
})
// latest: tag_name/html_url를 { tag, url }로 돌려준다
// latest: 24시간 안에 다시 부르면 fetch 횟수가 늘지 않는다 / now + 86_400_001이면 다시 부른다
// latest: fetch가 throw → null, 응답 status 403 → null (둘 다 throw하지 않음), 실패도 저장되어 바로 다시 부르면 fetch 안 함
// latest: localStorage 접근이 throw해도 { tag, url }을 돌려준다
```

- [ ] **Step 2: 실패 확인** — `npm test` → `update-check.test.mjs`가 모듈을 찾지 못해 FAIL
- [ ] **Step 3: `update-check.js` 구현** — 위 Interfaces 그대로. `fetch`에는 `Accept: application/vnd.github+json` 헤더를 붙인다. `localStorage` 읽기와 쓰기는 각각 try/catch로 감싼다. 안내 블록 스타일은 기존 `.hint`/`details.connection` 색(#969696, 9pt)을 따른다.
- [ ] **Step 4: 통과 확인** — `npm test` → 전부 PASS
- [ ] **Step 5: RME에 연결** — `common.js` 끝에 `UpdateCheck.mountPluginNotice('streamdeck-RME-Totalmix-OSC-Controller', { available: 'New version available:', open: 'Open release page' })`, `TEXT`에 두 문구의 한국어·일본어 추가.
- [ ] **Step 6: html 6개에 script 태그 추가 후 `npm test`** → PASS
- [ ] **Step 7: 커밋** — `git add` 위 파일들 + 스펙·계획 문서, `git commit -m "feat: show a new-release notice at the bottom of the settings screen"`

### Task 2: OBS Browser Click

**Files (`streamdeck-obs-browser-click`):**
- Create: `com.haeunga0822.obs-browser-click.sdPlugin/ui/update-check.js` (Task 1 파일을 그대로 복사)
- Create: `test/update-check.test.mjs` (Task 1 테스트 복사, import 경로만 바꿈)
- Modify: `ui/click.html` — `sdpi-components.js` 다음에 script 태그, `main()` 끝에서 `UpdateCheck.mountPluginNotice('streamdeck-obs-browser-click', { available: '새 버전이 나왔어요:', open: '릴리즈 페이지 열기' })` (이 화면은 한국어 고정)

- [ ] **Step 1: 복사 후 `npm test`** → PASS
- [ ] **Step 2: click.html 연결 후 `npm test`** → PASS
- [ ] **Step 3: 커밋** — `"feat: show a new-release notice at the bottom of the settings screen"`

### Task 3: OBS / FreecShot Audio (저장소 하나에 플러그인 2개)

**Files (`streamdeck-obs-audio`):**
- Create: `com.haeunga0822.obs-audio.sdPlugin/ui/update-check.js` (복사), `test/update-check.test.mjs` (복사)
- Modify: `ui/obs.html` (script 태그), `ui/common.js` (안내 붙이기), `ui/i18n.js` (en/ko/ja에 `updateAvailable`, `openRelease` 추가)
- FreecShot 폴더는 직접 고치지 않는다. `scripts/make-freecshot.mjs`가 `npm test`의 bundle 단계에서 `ui`를 복사해 만든다.

**Interfaces — Consumes:** Task 1의 `UpdateCheck.mountPluginNotice`. 저장소는 `PI_FLAVOUR === 'freecshot'`이면 `streamdeck-FreecShot-Plus-Audio-Controller`, 아니면 `streamdeck-Web-Socket-Audio-Controller`.

- [ ] **Step 1: 복사 후 i18n 키 추가.** `i18n.test.mjs`가 언어별 키가 같은지 검사하면 그 테스트로 확인한다. `npm test` → PASS
- [ ] **Step 2: `common.js`에서 `mountPluginNotice(repo, { available: tr('updateAvailable'), open: tr('openRelease') })` 호출.** 언어 설정을 읽은 뒤(`piLang`이 정해진 뒤) 부른다.
- [ ] **Step 3: `npm test`** → PASS. 그리고 `com.haeunga0822.freecshot-audio.sdPlugin/ui/update-check.js`가 생겼는지 확인한다.
- [ ] **Step 4: 커밋** (FreecShot 폴더가 git에 추적되면 생성된 파일도 포함)

### Task 3b: TOPPING E2x2 OTG

**Files (`streamdeck-topping-e2x2`):**
- Create: `com.haeunga0822.topping-e2x2.sdPlugin/ui/update-check.js` (복사), `test/update-check.test.mjs` (복사)
- Modify: `common.js`를 쓰는 html 7개 (script 태그), `ui/common.js` (안내 붙이기 + `TEXT`에 문구 2개)

**Interfaces — Consumes:** Task 1의 `mountPluginNotice`. 저장소는 `streamdeck-TOPPING-E2x2-OTG-Controller`. 이 화면의 번역기(`translate`)는 `summary, span, option, b, li`의 글자와 속성만 바꾸므로, 안내 문구와 버튼 글자는 `<span>` 안에 넣는다(RME도 같은 방식이면 같은 마크업을 쓴다).

- [ ] **Step 1: 복사 후 연결, `TEXT`에 Task 1과 같은 영어 원문 2개의 한국어·일본어 추가** → `npm test` PASS
- [ ] **Step 2: 커밋**

### Task 4: Monitor Bridge (WinForms)

**Files (`monitor-bridge`):**
- Create: `src/MonitorBridge.Core/Updates/ReleaseVersion.cs` — `public static class ReleaseVersion { public static bool IsNewer(string latestTag, string current) }` (Global Constraints의 비교 규칙)
- Create: `tests/MonitorBridge.Core.Tests/ReleaseVersionTests.cs`
- Create: `src/MonitorBridge/Shared/UpdateCheck.cs` — `internal static Task<(string Tag, string Url)?> LatestAsync(CancellationToken ct)`. 정적 `HttpClient` 하나, `User-Agent: MonitorBridge`, `Accept: application/vnd.github+json`, 시간 제한 5초. 모든 예외는 `null`로 돌려준다.
- Modify: `src/MonitorBridge/UI/SettingsForm.cs`

- [ ] **Step 1: 실패하는 테스트** — `[Theory]`로 Task 1의 `isNewer` 여섯 경우와 같은 값을 넣는다.
- [ ] **Step 2: `dotnet test tests/MonitorBridge.Core.Tests`** → 컴파일 FAIL
- [ ] **Step 3: `ReleaseVersion.IsNewer` 구현** → `dotnet test` PASS
- [ ] **Step 4: SettingsForm 연결** — `Shown` 이벤트에서 `LatestAsync`를 기다린다. 창이 닫히면 취소하고, 이미 닫힌 창(`IsDisposed`)이면 아무것도 하지 않는다. 새 버전이면 버튼 줄 위에 `LinkLabel`("새 버전 {태그}이 나왔어요 — 릴리즈 페이지 열기")을 보여주고, 누르면 `Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })`. 현재 버전은 `<Version>`(어셈블리 `GetName().Version`).
- [ ] **Step 5: 팝업 한 번만** — 본 태그를 `Path.Combine(Path.GetDirectoryName(AppConfig.DefaultPath)!, "update-seen.txt")`에 저장한다. 파일 내용이 태그와 다를 때만 `MessageBox.Show(this, "새 버전 {태그}이 나왔어요.\n릴리즈 페이지를 열까요?", "Monitor Bridge", YesNo)`를 띄우고, 띄운 뒤 파일에 태그를 쓴다. 파일 읽기·쓰기 실패는 무시한다. (`AppConfig`에 넣지 않는 이유: `SettingsForm`이 저장할 때 `AppConfig`를 새로 만들어서 값이 사라진다.)
- [ ] **Step 6: `dotnet build` + `dotnet test`** → PASS
- [ ] **Step 7: 커밋**

### Task 5: Music Now Playing Widget (브라우저 설정 페이지)

**Files (`obs-now-playing`):**
- Modify: `src/MusicNowPlayingWidget/Web/WebServer.cs` — `/api/info` 응답에 `version = typeof(WebServer).Assembly.GetName().Version!.ToString(3)` 추가
- Modify: `tests/MusicNowPlayingWidget.Tests/WebServerTests.cs` — `/api/info`에 `"version":"`이 들어 있는지 확인하는 테스트
- Create: `src/MusicNowPlayingWidget/wwwroot/update-check.js` (Task 1 파일 복사. `mountPluginNotice`는 쓰지 않는다.) 정적 파일로 나가는지 `WidgetFiles`/라우팅을 확인하고, 필요하면 경로를 추가한다.
- Modify: `wwwroot/settings.html` (script 태그 + 맨 위에 숨긴 안내 줄 `<p id="update" hidden>`), `wwwroot/settings.js`, `wwwroot/i18n/{en,ko,ja}.json` (`updateAvailable`, `openRelease`, `updateConfirm` 키)

- [ ] **Step 1: WebServerTests에 version 테스트 추가 → `dotnet test`** → FAIL
- [ ] **Step 2: `/api/info`에 version 추가 → `dotnet test`** → PASS
- [ ] **Step 3: settings.js 연결** — 이미 있는 `/api/info` 호출 결과로 `UpdateCheck.latest('music-now-playing-widget')`를 부른다. `isNewer`이면 `#update`에 문구와 링크(`target="_blank"`)를 보여준다. `localStorage['update-seen']`이 태그와 다를 때만 `confirm(t('updateConfirm'))`를 띄우고, 확인을 누르면 `window.open(url)`. 띄운 뒤 태그를 저장한다.
- [ ] **Step 4: i18n 키 추가 → `StringsTests` 포함 `dotnet test`** → PASS
- [ ] **Step 5: 커밋**

### Task 6: 실제 화면에서 확인

지금 설치된 버전은 모두 최신 릴리즈와 같아서 안내가 보이지 않는다. 그래서 잠깐 버전을 낮춰서 확인하고, 확인이 끝나면 되돌린다(커밋하지 않음).

- [ ] **플러그인 4개 저장소:** `manifest.json`의 `Version`을 `0.0.1.0`으로 바꾸고 bundle한 뒤, 그 플러그인만 다시 시작한다(시작 시각 확인). 버튼 설정 메뉴 맨 아래에 안내가 보이는지, 버튼을 누르면 릴리즈 페이지가 열리는지 확인한다. 그다음 `Version`을 되돌리고 다시 bundle → 재시작 → 안내가 사라졌는지 확인한다.
- [ ] **Music Now Playing Widget:** `dotnet run -p:Version=0.0.1`로 실행하고 설정 페이지를 연다 → 안내와 확인 창이 뜨는지 확인한다. 새로고침 → 확인 창 없이 안내만 보여야 한다.
- [ ] **Monitor Bridge:** 커서를 숨기고 입력을 가로채는 프로그램이라, **실행 전에 사용자에게 먼저 묻는다.** 허락받으면 `-p:Version=0.0.1`로 실행 → 설정 창 → 안내와 팝업 확인 → 다시 열기 → 팝업 없이 안내만 보이는지 확인한다.
- [ ] **오프라인 동작:** 인터넷을 끄면 방송에 영향을 줄 수 있으므로 실제로 끊지 않는다. Task 1과 Task 4의 실패 테스트(throw, 403)로 대신한다.

릴리즈(버전 올리기, zip 만들기)는 이 계획에 넣지 않는다. 사용자가 저장소마다 버전을 정해서 따로 진행한다.
