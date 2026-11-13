# 새 버전 알림 (깃허브 릴리즈 확인) 설계

날짜: 2026-11-14 · 크기: 작은 변경 (짧은 설계)

## 왜
깃허브에 올린 프로그램과 스트림덱 플러그인을 쓰는 사람이 새 버전이 나온 걸 모르고 지나가지 않게 한다.

## 대상
| 종류 | 저장소 (로컬 폴더) | 설정 화면 |
|---|---|---|
| 일반 프로그램 | monitor-bridge (`monitor-bridge`) | WinForms `UI/SettingsForm.cs` |
| 일반 프로그램 | music-now-playing-widget (`obs-now-playing`) | 브라우저로 여는 `wwwroot/settings.html` |
| 플러그인 | streamdeck-RME-Totalmix-OSC-Controller (`streamdeck-rme-totalmix`) | `ui/*.html` 6개, 공통 `ui/common.js` |
| 플러그인 | streamdeck-TOPPING-E2x2-OTG-Controller (`streamdeck-topping-e2x2`) | `ui/*.html` 7개, 공통 `ui/common.js` |
| 플러그인 | streamdeck-obs-browser-click (`streamdeck-obs-browser-click`) | `ui/click.html` |
| 플러그인 | streamdeck-Web-Socket-Audio-Controller, streamdeck-FreecShot-Plus-Audio-Controller (둘 다 `streamdeck-obs-audio`) | 각 `.sdPlugin/ui/obs.html` |

제외: freecshot-websocket-setup (비공개 저장소, 릴리즈 없음).

## 목표
- 일반 프로그램: 설정 창을 열면 새 버전 여부를 확인한다. 새 버전이 있으면 설정 창 안에 안내 문구와 링크를 보여주고, 팝업도 띄운다. 팝업에서 "예"를 누르면 릴리즈 페이지가 열린다.
- 플러그인: 버튼 설정 메뉴(속성 창)를 열면 맨 아래에 "새 버전 vX.Y.Z" 안내와 "릴리즈 페이지 열기" 버튼을 보여준다. 새 버전이 없으면 아무것도 보이지 않는다.
- 클릭하면 릴리즈 페이지를 브라우저로 여는 데서 끝난다.

## 하지 않는 것
- 자동 다운로드나 자동 설치
- 설정 화면을 열지 않았을 때의 알림 (트레이 풍선 알림, 윈도우 알림, 키 표시 등)
- 깃허브 로그인 토큰

## 실패로 보는 것
- 방송 화면에 갑자기 팝업이 뜨는 것. Monitor Bridge는 게임 PC에서 돌고, 게임 PC 화면은 방송에 나간다. 그래서 설정 창을 직접 열었을 때만 보여야 한다.
- 인터넷이 끊기거나 깃허브 요청 제한에 걸렸을 때 오류 창이 뜨는 것. 이럴 때는 아무것도 보여주지 않는다.

## 확인 방법 (공통)
- `GET https://api.github.com/repos/KimTaehan0822/<저장소>/releases/latest`를 호출해서 `tag_name`(예: `v1.0.2`)과 `html_url`을 쓴다.
- 비교: 앞의 `v`를 떼고 점으로 나눈 숫자를 순서대로 비교한다. 내 버전이 `1.0.1.0`처럼 네 자리여도 앞의 세 자리만 비교한다.
- 요청 제한: 로그인 없이 IP 주소마다 1시간에 60번이다. 사용자 수와는 상관없다.

## 정한 방법 (둘 다 A)
### 플러그인: 설정 화면이 직접 확인
- 각 `ui` 폴더에 `update-check.js`를 넣는다. 현재 버전은 `getConnectionInfo()`로 받은 플러그인 정보에서 가져오고, 안내 블록을 페이지 맨 아래에 붙인다.
- 결과는 `localStorage`에 하루 동안 저장해서, 하루에 한 번만 깃허브에 묻는다.
- 버튼을 누르면 `openUrl`로 릴리즈 페이지를 연다.
- 문구는 각 플러그인의 기존 번역 방식(영어/한국어/일본어)을 따른다.
- 고려한 다른 방법 B: 플러그인 본체가 시작할 때 확인해서 설정 화면에 넘겨주는 방식. 고칠 곳이 두 군데로 늘어나는데 사용자가 얻는 차이가 없어서 뺐다.

### 일반 프로그램: 설정 창을 열 때 확인
- Monitor Bridge: `UpdateCheck.cs`(HttpClient로 위 주소 호출) + `SettingsForm`이 열릴 때 비동기로 호출 → 창 안에 안내 링크 + `MessageBox`. 현재 버전은 어셈블리 버전(`<Version>`)을 쓴다.
- Music Now Playing Widget: 설정 화면이 브라우저 페이지라서 플러그인과 같은 방식으로 `settings.js`가 직접 확인한다. 현재 버전은 로컬 서버가 알려준다. 팝업은 페이지 안의 확인 대화상자로 띄운다.
- 팝업은 같은 버전에 한 번만 띄운다(본 버전을 저장). 그다음부터는 안내 문구만 보인다.
- 고려한 다른 방법 B: 프로그램이 시작할 때 미리 확인하는 방식. 항상 켜져 있는 Monitor Bridge에 백그라운드 코드가 늘어나서 뺐다.

## 제가 정한 부분 (확인 필요)
- 플러그인 결과를 하루 동안 저장해 두는 것
- 팝업을 같은 버전에 한 번만 띄우는 것
- Music Now Playing Widget은 C# 대신 설정 페이지 스크립트로 확인하는 것
- 각 저장소에 이 문서를 `docs/superpowers/specs/2026-11-14-update-check-design.md`로 커밋하는 것

## 만드는 사람에게 맡기는 부분
안내 블록의 정확한 스타일, 번역 문구, 파일 안에서의 함수 배치.
