# 위치 찍기 스크롤 경고·되돌리기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위치 찍기 키가 찍을 때의 페이지 스크롤을 기억하고, 스크롤이 바뀌면 키에 알리고, 저장한 스크롤로 되돌릴 수 있게 한다.

**Architecture:** `cdp.ts`가 스크롤을 읽고 옮기는 두 함수를 더한다. `ClickAction`의 poll이 토글이 아닌 키마다 `check()`(기본 'ok')를 묻고, `CustomClickAction`이 그걸 스크롤 비교로 바꾼다. 키 누름은 `press()` 안에서 스크롤을 먼저 본다. 설정 화면은 캡처의 스크롤을 점과 함께 저장하고, 버튼으로 `restoreScroll` 메시지를 보낸다.

**Tech Stack:** TypeScript, @elgato/streamdeck 3.0.4, ws, sdpi-components 4, node --test.

**Spec:** `docs/superpowers/specs/2026-11-11-point-scroll-guard-design.md`

## Global Constraints

- 좌표 자동 보정 없음. 스크롤은 사용자가 원할 때(키 누름+스위치 켜짐, 또는 설정 화면 버튼)만 옮긴다.
- 키 경고 제목: `스크롤\n바뀜`. 로그 글자: `스크롤바뀜`.
- 같은 스크롤로 보는 차이: 각 축 1px 이하.
- 설정 키 이름: `scrollX`, `scrollY` (문자열), `scrollRestore` (불리언, 없으면 켜짐).
- 스크롤 정보가 없는 키(`scrollX`/`scrollY` 비었거나 숫자 아님)는 지금과 똑같이 동작한다.
- 커밋·릴리즈는 사용자가 말할 때만. 버전 번호도 사용자가 고른다.
- 플러그인 바꾼 뒤: 번들 → 이 플러그인의 node 프로세스만 재시작 → 시작 시각이 번들보다 늦은지 확인.
- OBS에서 실제 확인할 때 되돌릴 수 있는 것만 누르고(스크롤 이동), 취소·넘기기·삭제 버튼은 누르지 않는다. 페이지 주소는 호스트만 로그에 남긴다.

## Review Focus

- 되돌렸는데 페이지가 짧아져서 저장 위치까지 못 갈 때 → 클릭하지 않고 ⚠, 키 경고 유지. (Task 2 테스트 `restore that falls short alerts`)
- 스크롤을 읽다가 CDP 시간 초과 → poll이 키를 'ok'로 두고 멈추지 않는다; 누름은 ⚠. (Task 2 `scroll read error keeps label`)
- 경고 중 사용자가 직접 스크롤을 맞춘 경우 → 다음 poll에서 원래 제목으로 돌아간다. (Task 2 `warning clears when scroll matches again`)
- 사용자가 직접 제목을 적은 키 → 경고 제목도 덮어쓰지 않는다 (기존 `userTitle` 규칙 그대로; 추가 코드 없음).
- 점을 다시 찍으면 새 캡처의 스크롤로 저장된다 (설정 화면; Task 3 수동 확인).

---

### Task 1: cdp 스크롤 읽기·옮기기

**Files:**
- Modify: `src/cdp.ts` (SIZE 식, `screenshot`, 새 함수 두 개)
- Test: `test/cdp.test.mjs`

**Interfaces:**
- Produces:
  - `scrollOf(wsUrl: string): Promise<{ x: number; y: number }>` — `Math.round(scrollX)`, `Math.round(scrollY)`.
  - `scrollTo(wsUrl: string, x: number, y: number): Promise<{ x: number; y: number }>` — `window.scrollTo(x, y)` 후 실제 도달한 스크롤(반올림)을 돌려준다.
  - `screenshot()` 결과에 `scrollX: number; scrollY: number` 추가 (SIZE 식이 함께 읽는다).

- [ ] **Step 1: 실패하는 테스트**
  - `pageReply`의 evaluate 값을 `{ width: 300, height: 200, scrollX: 0, scrollY: 40 }`로 바꾼다.
  - `screenshot returns jpeg and size`: 기대값 `{ data: 'SlBFRw==', width: 300, height: 200, scrollX: 0, scrollY: 40 }`.
  - `scrollOf reads the page scroll`: reply가 `{ x: 0, y: 40 }`을 돌려주면 `deepEqual(await scrollOf(ws), { x: 0, y: 40 })`, 보낸 식에 `scrollY`가 들어 있다.
  - `scrollTo moves and reports where it got`: reply `{ x: 0, y: 120 }` → 결과 `{ x: 0, y: 120 }`, 보낸 식에 `scrollTo(0, 300)`이 들어 있다 (`scrollTo(ws, 0, 300)` 호출).
- [ ] **Step 2:** `npm test` → 위 3개 FAIL.
- [ ] **Step 3:** 구현. 숫자는 `Number()`를 거친 뒤 식에 넣는다(문자열 주입 방지).
- [ ] **Step 4:** `npm test` → 모두 PASS.

### Task 2: 키의 스크롤 경고와 되돌리기

**Files:**
- Modify: `src/actions.ts`
- Modify: `test/fake-action.mjs` (`scroll` 옵션, `scrollOf`/`scrollTo` 기록)
- Test: `test/actions.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `scrollOf`, `scrollTo`.
- Produces:
  - `Clicker`에 `scrollOf(wsUrl)`, `scrollTo(wsUrl, x, y)` (Task 1과 같은 시그니처). `createClicker`가 cdp 함수를 그대로 넘긴다.
  - `CustomSettings`에 `scrollX?: string; scrollY?: string; scrollRestore?: boolean`.
  - `export function savedScrollOf(s: CustomSettings): { x: number; y: number } | undefined` — 위치 찍기 모드이고 `pointOf(s)`가 있고 두 값이 0 이상 숫자일 때만.
  - `export const sameScroll = (a, b) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1`
  - `export async function restoreScroll(clicker: Clicker, s: CustomSettings): Promise<'done' | 'short' | 'noSaved' | 'noPage'>` — 키 누름과 설정 화면 버튼이 같이 쓴다. CDP 오류는 'noPage'.
  - `Status`에 `'scrolled'`; `show()` 표에 `scrolled: '스크롤\n바뀜'`, 로그는 `스크롤바뀜`.
  - `ClickAction`에 `protected async check(_s: S, _page: CdpPage): Promise<Status>` (기본 `'ok'`). poll의 `if (!target.toggle) this.show(instance, 'ok')`를 `await this.check(...)`로 바꾼다.
- 동작:
  - `CustomClickAction.check`: 저장 스크롤이 있으면 `scrollOf`와 비교해 'scrolled'/'ok'. 읽기 오류는 'ok'.
  - `CustomClickAction.press` (위치 모드): 저장 스크롤이 있으면 먼저 `scrollOf`. 다르면
    - `scrollRestore !== false`: `restoreScroll` → 'done'이면 클릭 없이 `true`(onKeyDown이 제목을 원래대로 돌림), 아니면 `false`(⚠).
    - 꺼짐: 클릭 없이 `false`(⚠). 그리고 `show(instance,'scrolled')`가 되도록 poll에 맡긴다.
  - 같으면 지금처럼 `clickAt`.

- [ ] **Step 1: 실패하는 테스트** (`const P = { mode: 'point', pageUrl: WEFLAB, pointX: '60', pointY: '108', scrollX: '0', scrollY: '40' }`)
  - `scrolled page warns on the key`: 스크롤 `{0,200}` → poll 뒤 제목 끝이 `'스크롤\n바뀜'`.
  - `warning clears when scroll matches again`: 이어서 스크롤 `{0,41}` → poll 뒤 제목 `'위치 60,108'`.
  - `press restores scroll and does not click`: 스크롤 `{0,200}`, scrollTo가 `{0,40}` 반환 → `clicked.length === 0`, `scrolledTo` 하나 `{x:0,y:40}`, `alerts === 0`.
  - `second press clicks after restore`: 위 다음 스크롤 `{0,40}` → `clicked` 하나 `{x:60,y:108}`.
  - `restore off only alerts`: `{...P, scrollRestore: false}`, 스크롤 `{0,200}` → `clicked`·`scrolledTo` 모두 0, `alerts === 1`.
  - `restore that falls short alerts`: scrollTo가 `{0,150}` 반환 → `clicked` 0, `alerts === 1`.
  - `scroll read error keeps label`: `scrollOf`가 reject → poll 뒤 제목 `'위치 60,108'`; 누름은 `alerts === 1`, `clicked` 0.
  - `keys without saved scroll click as before`: `scrollX`/`scrollY` 없는 설정 → `scrollOf` 호출 0, `clicked` 하나.
  - `restoreScroll reports`: 저장 없음 → 'noSaved', 페이지 없음 → 'noPage', 도달 → 'done', 못 미침 → 'short'.
- [ ] **Step 2:** `npm test` → 새 테스트 FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** `npm test` → 모두 PASS (기존 73개 포함).

### Task 3: 설정 화면과 restoreScroll 메시지

**Files:**
- Modify: `src/plugin.ts` (`restoreScroll` 이벤트)
- Modify: `com.haeunga0822.obs-browser-click.sdPlugin/ui/click.html`

**Interfaces:**
- Consumes: Task 2의 `restoreScroll(clicker, settings)`; Task 1의 `screenshot` 결과 `scrollX`/`scrollY` (`shotItem`이 그대로 넘긴다).
- Produces: 메시지 `sendToPlugin { event: 'restoreScroll' }` → `sendToPropertyInspector { event: 'restoreScroll', result }`. plugin은 `ev.action.getSettings()`로 그 키의 설정을 읽는다.

- [ ] **Step 1:** `plugin.ts`에 분기 추가.
- [ ] **Step 2:** `click.html` 위치 찍기 영역:
  - `[화면 불러오기]` 같은 줄에 `<button class="tb-btn" id="restore">스크롤 되돌리기</button>`.
  - `<sdpi-item label="스크롤"><sdpi-checkbox setting="scrollRestore" default label="스크롤이 바뀌면 키로 되돌리기"></sdpi-checkbox></sdpi-item>`
  - 캡처 이미지를 찍을 때 `pointX`, `pointY`와 함께 `scrollX: String(shot.scrollX)`, `scrollY: String(shot.scrollY)` 저장.
  - 안내 문구(notice): "독이나 브라우저 소스의 크기를 바꾸면 같은 좌표가 다른 곳을 누를 수 있어요. 크기를 바꾼 뒤에는 꼭 [화면 불러오기]로 위치를 다시 찍어 주세요. 페이지를 스크롤하면 키에 '스크롤 바뀜'이 떠요. 키를 한 번 누르거나 [스크롤 되돌리기]를 누르면 찍을 때의 스크롤로 돌아가요. 페이지 안의 칸 하나만 따로 스크롤되는 경우는 알아채지 못해요."
  - 결과 문구 (`#shot-status`): done "찍을 때의 스크롤로 되돌렸어요." / short "페이지가 짧아져서 그 위치까지 못 갔어요. 위치를 다시 찍어 주세요." / noSaved "저장된 스크롤이 없어요. [화면 불러오기]로 위치를 다시 찍어 주세요." / noPage "페이지를 찾지 못했어요. OBS가 디버깅 옵션으로 켜져 있는지 확인하세요."
- [ ] **Step 3:** `npm test`, `npx streamdeck validate com.haeunga0822.obs-browser-click.sdPlugin` → 통과.

### Task 4: 도움말과 설명서

**Files:**
- Modify: `README.md`, `README.en.md`, `README.ja.md` (위치 찍기 설명 + 키 표시 표에 `스크롤 바뀜` 줄)
- Modify: `docs/manual/manual.ko.html`, `manual.en.html`, `manual.ja.html` (같은 두 곳)
- Regenerate: PDF 3개 (`node docs/manual/make-pdf.mjs`)

- 키 표시 표 새 줄 (ko): `| **스크롤 바뀜** | 위치 찍기 키의 페이지가 찍을 때와 다르게 스크롤됨 | 키를 한 번 누르면 스크롤만 되돌림(설정에서 끄면 ⚠만). 다시 누르면 클릭 |`
- en/ja는 같은 뜻으로, 한국어 표시는 그대로 두고 뜻을 덧붙이는 기존 방식.
- 날짜·버전 표기는 사용자가 버전을 고른 뒤 바꾼다 (이번엔 손대지 않음).
- [ ] **Step 1:** 6개 파일 수정.
- [ ] **Step 2:** PDF 생성 후 pypdf로 세 PDF에 `스크롤`(en: `scroll`, ja: `スクロール`) 글자가 있는지 확인.

### Task 5: 번들·재시작·실제 확인

- [ ] **Step 1:** `npm test`, `npm run bundle`.
- [ ] **Step 2:** 이 플러그인 node 프로세스만 재시작, 시작 시각 > 번들 시각 확인.
- [ ] **Step 3:** OBS에서 스크롤되는 페이지로 CDP 직접 확인: `scrollOf` → `scrollTo(저장값)` → 원래 스크롤로 복구. 클릭은 하지 않는다.
- [ ] **Step 4:** 사용자에게 수동 확인 요청 (전체 경로, 탐색기 열기): 점 찍기 → 스크롤 → 키 경고 → 키 누름/버튼으로 되돌리기 → 다시 누르면 클릭.
