import type { Target } from './page-script.js'

export type Service = '위플랩' | '씨미' | '치지직' | '투네이션'

export interface Preset {
	id: string
	service: Service
	label: string
	target: Target
}

const WEFLAB = 'weflab.com/alertlist?mode=remote'
const CIME = '/rc'
const CHZZK = '/remotecontrol'
const TOONATION = 'toon.at/widget/controller/'
const ON = { onClass: 'state_on' }

const weflab = (id: string, label: string, t: Omit<Target, 'url'>): Preset => ({ id, service: '위플랩', label, target: { url: WEFLAB, ...t } })
const cime = (id: string, label: string, t: Omit<Target, 'url'>): Preset => ({ id, service: '씨미', label, target: { url: CIME, ...t } })
const chzzk = (id: string, label: string, t: Omit<Target, 'url'>): Preset => ({ id, service: '치지직', label, target: { url: CHZZK, ...t } })
const toonation = (id: string, label: string, t: Omit<Target, 'url'>): Preset => ({ id, service: '투네이션', label, target: { url: TOONATION, ...t } })

// Each target was checked against the live remotes on 2026-11-10 to match exactly one element.
export const PRESETS: readonly Preset[] = [
	weflab('weflab-pause', '알림 일시정지/재개', { selector: '#page_alert_pause', toggle: { onClass: 'play' } }),
	weflab('weflab-cancel', '알림 취소(넘기기)', { selector: '#page_alert_cancel' }),
	weflab('weflab-cancel-all', '알림 모두 취소', { selector: '#page_alert_cancelall' }),
	weflab('weflab-refresh', '목록 새로고침', { selector: '.btn_alertlist_refresh' }),
	weflab('weflab-test', '테스트 알림', { selector: '.btn_url_test' }),
	weflab('weflab-timer-start', '타이머 시작', { selector: '.btn_alertlist_save', text: '시작' }),
	weflab('weflab-timer-stop', '타이머 정지', { selector: '.btn_alertlist_save', text: '정지' }),
	// The notice section above the timer has its own 시간/업타임/삭제, so the timer's are the second ones.
	weflab('weflab-timer-time', '타이머 시간', { selector: '.btn_alertlist_save', text: '시간', index: 1 }),
	weflab('weflab-timer-uptime', '타이머 업타임', { selector: '.btn_alertlist_save', text: '업타임', index: 1 }),
	weflab('weflab-timer-delete', '타이머 삭제', { selector: '.btn_alertlist_save', text: '삭제', index: 1 }),
	weflab('weflab-avatar-start', '아바타 게임 시작', { within: '.avata_btn_box', selector: '.list' }),
	weflab('weflab-avatar-cancel', '아바타 게임 취소', { within: '.avata_btn_box', selector: '.cancel' }),
	weflab('weflab-display-cancel', '전광판 현재 취소', { within: '.display_btn_box', selector: '.cancel' }),
	weflab('weflab-display-cancel-all', '전광판 모두 취소', { within: '.display_btn_box', selector: '.delete' }),
	weflab('weflab-vote-start', '투표 시작', { selector: '.btn_vote.start' }),
	weflab('weflab-vote-stop', '투표 중지', { selector: '.btn_vote.stop' }),
	weflab('weflab-vote-result', '투표 결과', { selector: '.btn_vote.result' }),

	cime('cime-pause', '일시정지', { selector: 'button', text: '일시정지' }),
	cime('cime-skip', '건너뛰기', { selector: 'button', text: '건너뛰기' }),
	cime('cime-chat-toggle', '채팅 후원 켜기/끄기', { row: '채팅 후원', selector: 'button.ToggleView', toggle: ON }),
	cime('cime-cheer-toggle', '응원 후원 켜기/끄기', { row: '응원 후원', selector: 'button.ToggleView', toggle: ON }),
	cime('cime-video-toggle', '영상 후원 켜기/끄기', { row: '영상 후원', selector: 'button.ToggleView', toggle: ON }),
	cime('cime-mission-toggle', '미션 후원 켜기/끄기', { row: '미션 후원', selector: 'button.ToggleView', toggle: ON }),
	cime('cime-warp-following', '워프: 팔로잉만 받기', { row: '워프 (레이드)', selector: 'button.ToggleView', toggle: ON }),
	cime('cime-send-viewers', '시청자 보내기', { selector: 'button', text: '시청자 보내기' }),

	chzzk('chzzk-tts-skip', 'TTS 넘기기', { selector: 'button', text: 'TTS 넘기기' }),
	chzzk('chzzk-alert-stop', '알림 정지', { selector: 'button', text: '알림 정지' }),

	toonation('toonation-pause', '알림 일시정지', { selector: '.event-pause-button', toggle: { onClass: 'paused' } }),
	toonation('toonation-skip', '스킵', { selector: '.event-cancel-button' }),
]

export function presetById(id: string): Preset | undefined {
	return PRESETS.find((p) => p.id === id)
}
