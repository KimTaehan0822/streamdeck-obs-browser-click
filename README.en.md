# OBS Browser Click (Stream Deck plugin)

[한국어](README.md) | **English** | [日本語](README.ja.md)

Press buttons inside OBS **custom browser docks** and **browser sources** from an Elgato Stream Deck key. You don't need to open the Interact window, and it works even when the dock is behind another tab.

Examples: skip a Weflab donation alert, skip on ci.me, skip Chzzk TTS, skip on Toonation.

The plugin's settings screen is in Korean. Korean labels are shown below as they appear, with their meaning.

## Download

Get `OBS-Browser-Click-StreamDeck-v<version>.zip` from the [latest release](https://github.com/KimTaehan0822/streamdeck-obs-browser-click/releases/latest) and unzip it. It contains:

- `OBS-Browser-Click.streamDeckPlugin`: the installer
- Manual PDFs, one per language
  - `OBS Browser Click 스트림덱 플러그인 사용설명서.pdf`: Korean
  - `OBS Browser Click Stream Deck Plugin Manual (English).pdf`: English
  - `OBS Browser Click Stream Deck プラグイン 取扱説明書 (日本語).pdf`: Japanese
- `LICENSE.txt`: this plugin's license (MIT)
- `THIRD-PARTY-NOTICES.txt`: notices for the open source it includes

## Requirements

- Windows 10 or later
- Stream Deck software 7.3 or later
- OBS Studio (Windows, 64-bit)
- The remote you want to press (Weflab, ci.me, Chzzk, Toonation) must be open in OBS as a custom browser dock or a browser source.

## Quick start

### 1. Install the plugin

Double-click `OBS-Browser-Click.streamDeckPlugin` and approve the install in the Stream Deck software.

### 2. Start OBS with the debug option

The plugin presses buttons through OBS's **remote debugging port**, so OBS must run with `--remote-debugging-port=9222`.

1. Put any action on a key, click it, and click **[OBS 바로가기 설정]** (set up OBS shortcut) at the bottom of the settings screen.
2. An **OBS Studio (Browser Click)** shortcut appears on your desktop and in your Start menu. If OBS is pinned to the taskbar, that icon gets the option too. No administrator rights needed.
3. Close OBS completely and start it again from this shortcut.

The original "OBS Studio" icons (public desktop, Start menu) still start OBS without the option. The OBS installer recreates them on every update, so the plugin leaves them alone.

<details><summary>Doing it by hand</summary>

Right-click an OBS shortcut → **Properties** → add a space and `--remote-debugging-port=9222` at the end of **Target**, for example `"C:\Program Files\obs-studio\bin\64bit\obs64.exe" --remote-debugging-port=9222`. **Start in** must be `C:\Program Files\obs-studio\bin\64bit`.

</details>

### 3. Make your first key

1. Drag **OBS Browser Click → 위플랩 리모컨** (Weflab remote) onto a key.
2. Under **동작** (action), choose **알림 취소(넘기기)** (cancel alert / skip).
3. Press the key while an alert plays to skip it. Try it with **테스트 알림** (test alert) first.

## About the debug option

- **Other programs on this PC** can see and operate the pages inside OBS (your signed-in Chzzk and ci.me studios and so on). The internet and ordinary web pages can't get in: the port opens on `127.0.0.1` only, and OBS rejects connections from web pages. Don't install programs you don't trust.
- **Port conflicts:** if another program (such as Chrome in debug mode) uses the same port, OBS may not open it. When the port doesn't belong to OBS, the plugin presses nothing and the key shows `OFFLINE`. Change the port under "Settings" and click [OBS 바로가기 설정] again.
- **Started without the option:** starting OBS from the original icon or from another program leaves the option out, and keys show `디버그 꺼짐` (debug off).
- **OBS updates:** the public shortcuts are recreated, but your new shortcut and the taskbar icon stay.
- **Performance:** practically no effect.

## Actions

| Action | What you can choose |
| --- | --- |
| 위플랩 리모컨 (Weflab remote) | Pause/resume alerts ●, cancel alert (skip), cancel all alerts, refresh list, test alert, timer start / stop / time / uptime / delete, avatar game start / cancel, billboard cancel current / cancel all, vote start / stop / result |
| 씨미 리모컨 (ci.me remote) | Pause, skip, chat / cheer / video / mission donations on/off ●, warp: followers only ●, send viewers |
| 치지직 리모컨 (Chzzk remote) | Skip TTS, stop alert |
| 투네이션 리모컨 (Toonation remote) | Pause alerts ●, skip |
| 범용 클릭 (custom click) | Pick any button, or a point on the page, yourself |

Actions marked ● follow the on/off state (a sky-blue ring when on). You can set a different icon and title per state in the Stream Deck app.

**Custom click:** choose a **페이지** (page), then a **방식** (method). Browser sources are listed by their OBS name, like `[소스] My Alerts` (소스 means source); custom docks by their page title.
- **버튼으로 찾기** (find by button): the page's buttons are listed by text. For an icon button without text, enter a **CSS 선택자** (CSS selector).
- **위치 찍기** (pick a point): click where to press on the capture from **[화면 불러오기]** (load screen). The click goes to that page only and your real mouse doesn't move. If you resize the dock or browser source, pick the point again. If you scroll the page, the key shows `스크롤 바뀜` (scrolled); one press scrolls back to where you picked (the next press clicks). The **[스크롤 되돌리기]** (scroll back) button does the same; turn off **스크롤이 바뀌면 키로 되돌리기** (scroll back with the key) and the key only shows ⚠. Scrolling is checked on the box that holds the point (a donation list, a chat); if the layout changes and that box is gone, nothing is pressed and the key shows ⚠. Find by button is sturdier when it works.

## Settings

| Item | Default | Meaning |
| --- | --- | --- |
| 디버깅 포트 (debug port) | `9222` (when empty) | Must match the OBS option. Shared by all actions |
| [OBS 바로가기 설정] | | Makes a shortcut that starts OBS with this port. Click again after changing the port |

## What keys show

| Shown | Meaning | What to do |
| --- | --- | --- |
| The action name | Normal | If you type a title in the Stream Deck app, the plugin keeps it |
| **OFFLINE** | OBS isn't running, or another program uses the port | Start OBS from the new shortcut, check the port |
| **디버그 꺼짐** (debug off) | OBS runs without the debug option | Close OBS and start it from OBS Studio (Browser Click) |
| **없음** (none) | That remote isn't in OBS, or no action is chosen | Add the remote dock, choose an action |
| **스크롤 바뀜** (scrolled) | The page of a picked-point key is scrolled differently from when you picked it | One press only scrolls back (turned off in the settings: ⚠ only). The next press clicks |
| ⚠ (briefly) | The button wasn't found when pressed | Nothing was pressed. Check whether the remote's layout changed |

## Building

```bash
npm install
npm test          # tsc + node --test
npm run bundle    # com.haeunga0822.obs-browser-click.sdPlugin/bin/plugin.js
npx streamdeck link com.haeunga0822.obs-browser-click.sdPlugin
node docs/manual/make-pdf.mjs   # manual PDFs (needs Edge and Noto Sans KR/JP)
```

## Notices

This plugin is released under the MIT License (see `LICENSE`). Licenses of the open source it uses are in `THIRD-PARTY-NOTICES.txt`. OBS and OBS Studio are trademarks of the OBS Project; Weflab, ci.me, Chzzk and Toonation are services of their respective companies. This plugin is an unofficial project not affiliated with any of them.
