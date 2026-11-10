# OBS 전용 바로가기 + 안전장치 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 창 버튼 하나로 OBS를 늘 디버깅 옵션으로 켜는 바로가기를 만들고, OBS가 아닌 포트·옵션 없이 켠 OBS를 키에 알려 줍니다.

**Architecture:** 바로가기는 Node `child_process.execFile('powershell.exe', ...)`로 `WScript.Shell` COM을 써서 만듭니다(추가 의존성 없음). OBS 확인은 `/json/version` User-Agent, 실행 여부는 `tasklist /FI "IMAGENAME eq obs64.exe" /NH`.

**Tech Stack:** 기존 그대로.

**Spec:** `docs/superpowers/specs/2026-11-11-obs-shortcut-design.md`

## Global Constraints

- 바로가기 이름 `OBS Studio (Browser Click).lnk`, 인수 `--remote-debugging-port=<port>`, 시작 위치 `<obs>\bin\64bit`, 아이콘 `obs64.exe,0`.
- 바탕화면·시작 메뉴는 `[Environment]::GetFolderPath('Desktop')`, `[Environment]::GetFolderPath('Programs')`(사용자 것). 공용 위치는 건드리지 않습니다.
- 작업 표시줄: `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\*.lnk` 중 대상이 `obs64.exe`인 것만, 인수의 `--remote-debugging-port=\S*`를 바꾸거나 없으면 뒤에 붙임.
- 키 문구: OBS 아님 → `OFFLINE`, 옵션 없이 켜진 OBS → `디버그\n꺼짐`. 프로세스 확인은 `listPages` 실패 때만, 5000ms에 한 번.
- PowerShell 스크립트에 들어가는 값(경로·포트)은 명령줄 문자열로 이어 붙이지 않고 **환경 변수**로 넘깁니다(따옴표 깨짐·주입 방지).
- 마무리 순서: bundle → 이 플러그인 node만 재시작 → 시작 시각 확인. 매니페스트 변경 없음.

## Review Focus

1. OBS가 없는 PC → 아무것도 만들지 않고 "OBS를 찾지 못했어요". (Task 2 `setup refuses without obs64`)
2. 경로에 공백·한글·작은따옴표가 있는 사용자 폴더 → 바로가기가 정상 생성. (Task 2: 환경 변수 전달 테스트 + 실제 PC 확인)
3. 9222를 크롬이 쓰는 경우 → 크롬 페이지를 누르지 않음. (Task 1 `not OBS is offline`)
4. 작업 표시줄에 OBS 고정이 없음 → 오류 없이 바탕화면·시작 메뉴만. (Task 2 결과 문구)

---

### Task 1: OBS 확인 + "디버그 꺼짐"

**Files:** Modify `src/cdp.ts`, `src/actions.ts`, `test/fake-cdp.mjs`, `test/fake-action.mjs`; Test `test/cdp.test.mjs`, `test/actions.test.mjs`

**Interfaces:**
- `listPages(port)`가 먼저 `/json/version`을 읽어 User-Agent에 `OBS/`가 없으면 `new Error('port is not OBS')`로 reject.
- `Clicker.obsRunning(): Promise<boolean>`; `createClicker`는 `tasklist` 결과에 `obs64.exe`가 있는지로 판단(5000ms 캐시).
- `Status`에 `'debugOff'` 추가 → 제목 `디버그\n꺼짐`, 로그 `state <id> 디버그꺼짐`.

- [ ] **Step 1: 실패하는 테스트** — `not OBS is offline`(가짜 `/json/version` UA가 Chrome → `listPages` reject), `OBS version passes`(UA에 `OBS/32.0.4` → 페이지 목록), `debug off shows on keys`(listPages reject + `obsRunning` true → 제목 `디버그\n꺼짐`, 누르면 경고), `OBS closed stays OFFLINE`(obsRunning false → `OFFLINE`).
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat: only talk to OBS and show when OBS runs without the debug flag`.

### Task 2: [OBS 바로가기 설정]

**Files:** Create `src/shortcut.ts`; Modify `src/plugin.ts`, `ui/click.html`, `README.md`; Test `test/shortcut.test.mjs`

**Interfaces:**
- `findObs(readRegistry = defaultReadRegistry, exists = existsSync): string | undefined` — 설치 폴더의 `bin\64bit\obs64.exe` 경로.
- `setupShortcuts(port: number, run = runPowerShell): Promise<{ ok: true; desktop: string; startMenu: string; taskbar: number } | { ok: false; reason: 'noObs' | 'failed' }>` — `run(script, env)`에 `OBS_EXE`, `OBS_DIR`, `OBS_PORT`, `SC_NAME`를 env로 넘김. 스크립트는 만든 경로와 고친 작업 표시줄 개수를 JSON 한 줄로 출력.
- PI 이벤트: `sendToPlugin { event: 'setupShortcut' }` → `{ event: 'setupShortcut', ok, ... }`.

- [ ] **Step 1: 실패하는 테스트** — `findObs reads the registry`(가짜 레지스트리 `D:\OBS` + exists → `D:\OBS\bin\64bit\obs64.exe`), `findObs falls back`, `setup refuses without obs64`(run 안 부름, `noObs`), `values go through env`(run에 받은 env의 `OBS_PORT`가 `'9333'`, 스크립트 문자열에 경로가 들어 있지 않음), `setup reports what it made`(가짜 run 출력 JSON → 결과).
- [ ] **Step 2:** FAIL. **Step 3:** 구현(`execFile('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command', script], { env: {...process.env, ...env}, timeout: 15000 })`).
- [ ] **Step 4:** 설정 창: 디버깅 포트 아래 [OBS 바로가기 설정] 버튼 + 결과 줄(`role="status"`). 결과 문구는 스펙 그대로, 작업 표시줄이 0개면 그 문장 빼기, 실패면 "OBS를 찾지 못했어요" / "바로가기를 만들지 못했어요".
- [ ] **Step 5:** README 1번을 "설정 창의 [OBS 바로가기 설정]을 누르고 새 바로가기로 켜기"로 바꾸고, 수동 방법은 그 아래에 남기기. "디버깅 모드 주의" 절에 스펙의 문제 5가지.
- [ ] **Step 6:** `npm test` PASS, bundle, validate, 플러그인 재시작, **이 PC에서 실제로 실행**해 바로가기 2개 생성·작업 표시줄 인수 확인(읽어서 출력).
- [ ] **Step 7:** 커밋 `feat: set up an OBS shortcut that always opens the debug port`.
