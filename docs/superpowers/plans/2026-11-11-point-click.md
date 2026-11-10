# 범용 클릭 위치 찍기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 범용 클릭 키가 캡처 화면에서 찍은 좌표를 진짜 마우스 클릭으로 누르게 합니다.

**Architecture:** `src/cdp.ts`에 한 연결로 CDP 명령 여러 개를 차례로 보내는 `send`를 두고, 그 위에 `screenshot`과 `clickAt`을 만듭니다. `CustomClickAction`은 `mode === 'point'`이면 `clickAt`을 쓰고, 설정 창은 `getShot`으로 캡처를 받아 찍은 좌표를 저장합니다.

**Tech Stack:** 기존 그대로(`@elgato/streamdeck` 3.0.4, `ws`, `node --test`, sdpi-components).

**Spec:** `docs/superpowers/specs/2026-11-11-point-click-design.md`

## Global Constraints

- 범용 클릭 설정 키: `mode`(`'button'` 기본 | `'point'`), `pointX`, `pointY`(문자열 숫자, CSS 픽셀). 기존 `pageUrl`·`button`·`selector`는 그대로.
- 좌표가 페이지의 `innerWidth`·`innerHeight` 밖이면 누르지 않고 `showAlert`.
- 키 제목 `위치 X,Y`.
- 캡처는 JPEG 품질 70. 페이지 주소와 캡처 데이터는 로그에 쓰지 않습니다.
- 마무리: `npm run bundle` → 이 플러그인 node.exe만 종료 → 새 프로세스 시작 시각 > `bin/plugin.js` 시각 확인. manifest는 바뀌지 않으므로 앱 재시작 안내는 하지 않습니다.

## Review Focus

1. 좌표가 비었거나 숫자가 아님 → 대상 없음(`없음`, 경고, 아무것도 안 누름). (Task 2 `point needs numbers`)
2. 독이 작아져 좌표가 화면 밖 → 누르지 않음. (Task 2 `point outside the page alerts`)
3. 캡처 실패(페이지 없음, OBS 꺼짐) → 설정 창에 "불러오지 못함", 플러그인은 멀쩡. (Task 2 `getShot without page`)
4. 버튼 방식 키는 이전과 똑같이 동작(설정에 `mode` 없음). (Task 2 기존 테스트 그대로 통과)

---

### Task 1: CDP `send`, `screenshot`, `clickAt`

**Files:** Modify `src/cdp.ts`, `test/fake-cdp.mjs`(받은 메시지 메서드별 응답), Test `test/cdp.test.mjs`

**Interfaces:**
- Produces:
  - `send(wsUrl: string, calls: { method: string; params?: object }[], timeoutMs = 2000): Promise<unknown[]>` — 한 연결로 차례로 보내고 각 `result`를 순서대로 돌려줌. `error`가 오면 reject. 기존 `evaluate`는 `send`를 써서 다시 구현(동작 동일, 기존 테스트 통과).
  - `screenshot(wsUrl): Promise<{ data: string; width: number; height: number }>` — `Runtime.evaluate`로 `innerWidth/innerHeight`, `Page.captureScreenshot { format: 'jpeg', quality: 70 }`.
  - `clickAt(wsUrl, x, y): Promise<'ok' | 'outside'>` — 크기를 읽어 `0 <= x < width`, `0 <= y < height`가 아니면 `'outside'`. 안이면 `Input.dispatchMouseEvent` `mouseMoved` → `mousePressed`(`button: 'left', clickCount: 1`) → `mouseReleased` 같은 좌표.

- [ ] **Step 1: 실패하는 테스트** — `send returns results in order`, `send rejects on error`, `screenshot returns jpeg and size`(보낸 params에 `format: 'jpeg', quality: 70`), `clickAt sends move press release`(메서드·type·x·y·button 순서 확인), `clickAt refuses outside`(크기 300×200, (300,10) → `'outside'`, `Input.*` 안 보냄), 기존 `evaluate` 테스트 그대로.
- [ ] **Step 2:** `npm test` → 새 테스트 FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** 커밋 `feat: CDP screenshot and click at a point`.

### Task 2: 범용 클릭 위치 방식 + 설정 창

**Files:** Modify `src/actions.ts`, `src/plugin.ts`, `com.haeunga0822.obs-browser-click.sdPlugin/ui/click.html`, `test/fake-action.mjs`, Test `test/actions.test.mjs`

**Interfaces:**
- Consumes: Task 1 `screenshot`, `clickAt`.
- Produces:
  - `Clicker`에 `clickAt(wsUrl, x, y): Promise<'ok' | 'outside'>`, `screenshot(wsUrl)` 추가.
  - `pointOf(s: CustomSettings): { x: number; y: number } | undefined` — `mode === 'point'`이고 `pageUrl`이 있고 `pointX`·`pointY`가 0 이상의 유한한 숫자일 때만.
  - `ClickAction`에 `protected press(instance, page): Promise<boolean>` 훅 — 기본은 지금의 `pageExpression(target,'click')`, `CustomClickAction`은 점 방식이면 `clickAt`(결과 `'ok'`만 true). 점 방식의 `targetOf`는 `{ url: pageUrl }`(페이지 찾기용)만 돌려줌.
  - `shotItem(clicker, pageUrl): Promise<{ ok: true; data: string; width: number; height: number } | { ok: false }>` — `plugin.ts`의 `getShot` 응답(`{ event: 'getShot', ...shotItem }`).

- 동작:
  - 제목: 점 방식은 `위치 ${x},${y}`.
  - 폴링: 점 방식도 페이지 존재만 확인(토글 없음).

- [ ] **Step 1: 실패하는 테스트**
  - `point needs numbers`: `{mode:'point', pageUrl, pointX:'', pointY:'5'}` → `pointOf` undefined, 누르면 경고, `clickAt` 안 부름.
  - `point press clicks at the point`: `pointX:'60', pointY:'108'` → `clickAt('ws://w', 60, 108)` 한 번, `evaluate` 안 부름, 제목 `위치 60,108`.
  - `point outside the page alerts`: `clickAt`이 `'outside'` → `showAlert` 1회.
  - `button mode is the default`: `mode` 없는 기존 설정 → 지금처럼 `evaluate`로 누름.
  - `getShot without page`: 페이지 없음/오프라인 → `{ ok: false }`; 있으면 `{ ok: true, data, width, height }`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** 구현(`actions.ts`, `plugin.ts`).
- [ ] **Step 4:** 설정 창: 범용 클릭에 `방식` select(`button` 버튼으로 찾기 / `point` 위치 찍기). `point`일 때 [화면 불러오기] 버튼, 그 바로 아래 늘 보이는 안내문(스펙의 문구 그대로, `.hint`보다 눈에 띄게 노란색 `#f0c040`), 캡처 그림(너비 100%, 클릭 시 `x = round(offsetX * width / clientWidth)`, `y`도 같은 식), 빨간 점 표시, `pointX`·`pointY` textfield. 찍으면 두 textfield 값을 바꾸고 설정 저장(`client.setSettings`로 현재 설정에 합쳐 저장 후 `client.getSettings()`). 방식에 따라 버튼/선택자 칸과 위치 칸을 숨김/표시(`valuechange`).
- [ ] **Step 5:** `npm test` → PASS, `npm run bundle`, `npx streamdeck validate` 성공.
- [ ] **Step 6:** 플러그인 재시작 확인(Global Constraints의 마무리 순서).
- [ ] **Step 7:** 커밋 `feat: custom click at a point picked on a page capture`.
- [ ] **Step 8:** 사용자 테스트 요청 — 파일 위치 먼저, 범용 클릭 키를 위치 방식으로 위플랩 리모컨 `일시 중지` 자리를 찍어 눌러 보기(되돌릴 수 있음), 그리고 위플랩 후원 알림 브라우저 소스는 테스트 알림 중에 찍어 둔 자리로 넘겨지는지.
