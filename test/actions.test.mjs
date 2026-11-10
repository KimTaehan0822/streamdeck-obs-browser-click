import assert from 'node:assert/strict'
import test from 'node:test'
import { CustomClickAction, ServiceRemoteAction, SERVICE_ACTIONS, customTarget, presetItemsFor, pageItems, buttonItems, pointOf, shotItem } from '../dist/actions.js'
import { pageExpression } from '../dist/page-script.js'
import { presetById } from '../dist/presets.js'
import { fakeAction, fakeClicker, PAGES } from './fake-action.mjs'

// Every key shown in a test disappears afterwards, so the poll timer lets the process exit.
const shown = []
test.afterEach(() => {
	for (const { a, f } of shown.splice(0)) a.onWillDisappear(f.ev())
})
// A service remote key gets the service of its preset (위플랩 for an unknown one).
async function appear(Action, clicker, settings, id = 'k' + shown.length) {
	const a = Action === ServiceRemoteAction ? new Action(clicker, presetById(settings.preset ?? '')?.service ?? '위플랩') : new Action(clicker)
	const f = fakeAction(id, settings)
	await a.onWillAppear(f.ev())
	shown.push({ a, f })
	return { a, f }
}

test('press clicks preset', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'toonation-skip' })
	c.evaluated.length = 0
	await a.onKeyDown(f.ev())
	assert.deepEqual(c.evaluated, [{ wsUrl: 'ws://t', expr: pageExpression(presetById('toonation-skip').target, 'click') }])
	assert.equal(f.calls.alerts, 0)
})

test('press while offline alerts', async () => {
	const c = fakeClicker({ pages: PAGES, offline: true })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'toonation-skip' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
	assert.equal(f.calls.titles.at(-1), 'OFFLINE')
	assert.equal(c.evaluated.length, 0)
})

test('unknown preset alerts', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'gone' })
	await a.onKeyDown(f.ev())
	assert.equal(c.evaluated.length, 0)
	assert.equal(f.calls.alerts, 1)
	assert.equal(f.calls.titles.at(-1), '없음')
})

test('missing page alerts', async () => {
	const c = fakeClicker({ pages: [PAGES[1]] })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-cancel' })
	assert.equal(f.calls.titles.at(-1), '없음')
	await a.onKeyDown(f.ev())
	assert.equal(c.evaluated.length, 0)
	assert.equal(f.calls.alerts, 1)
})

test('missing button alerts', async () => {
	const c = fakeClicker({ pages: PAGES, answer: () => 'missing' })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-cancel' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
})

test('page error alerts', async () => {
	const c = fakeClicker({ pages: PAGES, answer: () => Promise.reject(new Error('CDP timeout')) })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-cancel' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
})

test('shows the preset label when the page is there', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-cancel' })
	assert.deepEqual(f.calls.titles, ['알림 취소(넘기기)'])
	assert.equal(c.evaluated.length, 0, 'a key without a toggle only checks the page exists')
})

test('toggle follows page', async () => {
	let state = 'on'
	const c = fakeClicker({ pages: PAGES, answer: (expr) => (expr.includes('"state"') ? state : 'ok') })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-pause' })
	assert.deepEqual(f.calls.states, [1])
	await a.poll()
	assert.deepEqual(f.calls.states, [1], 'same state is not resent')
	state = 'off'
	await a.onKeyDown(f.ev())
	assert.deepEqual(f.calls.states, [1, 0], 'pressing reads the state right away')
})

test('user title is kept', async () => {
	const c = fakeClicker({ pages: PAGES, offline: true })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-cancel' })
	const before = f.calls.titles.length
	a.onTitleParametersDidChange(f.ev({ title: '스킵!', state: 0, titleParameters: { showTitle: true } }))
	c.offline = false
	await a.poll()
	c.offline = true
	await a.poll()
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.titles.length, before, 'no setTitle over a title the user typed')
	assert.equal(f.calls.alerts, 1)
})

test('our own title echo is not a user title', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-cancel' })
	a.onTitleParametersDidChange(f.ev({ title: '알림 취소(넘기기)', state: 0, titleParameters: { showTitle: true } }))
	c.offline = true
	await a.poll()
	assert.equal(f.calls.titles.at(-1), 'OFFLINE')
})

test('custom selector wins', () => {
	assert.deepEqual(customTarget({ pageUrl: 'weflab.com/x', button: '1\t시작', selector: ' #x ' }), { url: 'weflab.com/x', selector: '#x' })
})

test('custom button parses', () => {
	assert.deepEqual(customTarget({ pageUrl: 'weflab.com/x', button: '2\t모두 취소' }), { url: 'weflab.com/x', text: '모두 취소', index: 2 })
	assert.equal(customTarget({ pageUrl: 'weflab.com/x' }), undefined)
	assert.equal(customTarget({ button: '0\t스킵' }), undefined)
})

test('custom click presses the chosen button', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(CustomClickAction, c, { pageUrl: 'https://toon.at/widget/controller/key', button: '0\t스킵' })
	assert.equal(f.calls.titles.at(-1), '스킵')
	await a.onKeyDown(f.ev())
	assert.deepEqual(c.evaluated.at(-1), { wsUrl: 'ws://t', expr: pageExpression({ url: 'https://toon.at/widget/controller/key', text: '스킵', index: 0 }, 'click') })
})

test('getPages lists titles and urls', async () => {
	assert.deepEqual(await pageItems(fakeClicker({ pages: PAGES })), [
		{ value: 'https://weflab.com/alertlist?mode=remote', label: '후원관리 | 리모컨 | 위플랩' },
		{ value: 'https://toon.at/widget/controller/key', label: 'Toonation' },
	])
	assert.deepEqual(await pageItems(fakeClicker({ offline: true })), [])
})

test('getButtons numbers repeats', async () => {
	const c = fakeClicker({ pages: PAGES, answer: () => [{ text: '시작', index: 0 }, { text: '시작', index: 1 }, { text: '스킵', index: 0 }] })
	assert.deepEqual(await buttonItems(c, 'https://weflab.com/alertlist?mode=remote'), [
		{ value: '0\t시작', label: '시작' },
		{ value: '1\t시작', label: '시작 (2)' },
		{ value: '0\t스킵', label: '스킵' },
	])
	assert.equal(c.evaluated[0].wsUrl, 'ws://w')
	assert.deepEqual(await buttonItems(c, 'nothing'), [])
	assert.deepEqual(await buttonItems(fakeClicker({ offline: true }), 'x'), [])
})

test('two-state keys never flip by themselves', async () => {
	// Without this flag Stream Deck toggles the state on key-up, racing the state read from the page.
	const { readFileSync } = await import('node:fs')
	const manifest = JSON.parse(readFileSync(new URL('../com.haeunga0822.obs-browser-click.sdPlugin/manifest.json', import.meta.url), 'utf8'))
	for (const a of manifest.Actions) assert.equal(a.DisableAutomaticStates, true, a.UUID)
})

test('press finds the page by host too', async () => {
	const other = { id: 'x', type: 'page', title: 'x', url: 'https://example.com/rcs/a', webSocketDebuggerUrl: 'ws://x' }
	const cime = { id: 'c', type: 'page', title: '씨미', url: 'https://studio.ci.me/1/rc', webSocketDebuggerUrl: 'ws://c' }
	const c = fakeClicker({ pages: [other, cime] })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'cime-skip' })
	await a.onKeyDown(f.ev())
	assert.equal(c.evaluated.at(-1).wsUrl, 'ws://c')
})

const WEFLAB = 'https://weflab.com/alertlist?mode=remote'

test('point needs numbers', async () => {
	assert.equal(pointOf({ mode: 'point', pageUrl: WEFLAB, pointX: '', pointY: '5' }), undefined)
	assert.equal(pointOf({ mode: 'point', pageUrl: WEFLAB, pointX: 'a', pointY: '5' }), undefined)
	assert.equal(pointOf({ mode: 'point', pageUrl: WEFLAB, pointX: '-1', pointY: '5' }), undefined)
	assert.equal(pointOf({ mode: 'point', pointX: '1', pointY: '5' }), undefined)
	assert.equal(pointOf({ pageUrl: WEFLAB, pointX: '1', pointY: '5' }), undefined, 'button mode has no point')
	assert.deepEqual(pointOf({ mode: 'point', pageUrl: WEFLAB, pointX: ' 60 ', pointY: '108' }), { x: 60, y: 108 })
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(CustomClickAction, c, { mode: 'point', pageUrl: WEFLAB, pointX: '', pointY: '5' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
	assert.equal(c.clicked.length + c.evaluated.length, 0)
	assert.equal(f.calls.titles.at(-1), '없음')
})

test('point press clicks at the point', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(CustomClickAction, c, { mode: 'point', pageUrl: WEFLAB, pointX: '60', pointY: '108' })
	assert.equal(f.calls.titles.at(-1), '위치 60,108')
	await a.onKeyDown(f.ev())
	assert.deepEqual(c.clicked, [{ wsUrl: 'ws://w', x: 60, y: 108 }])
	assert.equal(c.evaluated.length, 0)
	assert.equal(f.calls.alerts, 0)
})

test('point outside the page alerts', async () => {
	const c = fakeClicker({ pages: PAGES, point: () => 'outside' })
	const { a, f } = await appear(CustomClickAction, c, { mode: 'point', pageUrl: WEFLAB, pointX: '900', pointY: '108' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
})

test('point click error alerts', async () => {
	const c = fakeClicker({ pages: PAGES, point: () => Promise.reject(new Error('CDP timeout')) })
	const { a, f } = await appear(CustomClickAction, c, { mode: 'point', pageUrl: WEFLAB, pointX: '1', pointY: '1' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
})

test('button mode is the default', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(CustomClickAction, c, { pageUrl: WEFLAB, button: '0\t일시 중지', pointX: '60', pointY: '108' })
	await a.onKeyDown(f.ev())
	assert.equal(c.clicked.length, 0)
	assert.equal(c.evaluated.length, 1)
	assert.equal(f.calls.titles.at(-1), '일시 중지')
})

test('getShot without page', async () => {
	assert.deepEqual(await shotItem(fakeClicker({ pages: PAGES }), 'nothing'), { ok: false })
	assert.deepEqual(await shotItem(fakeClicker({ offline: true }), WEFLAB), { ok: false })
	const c = fakeClicker({ pages: PAGES })
	assert.deepEqual(await shotItem(c, WEFLAB), { ok: true, data: 'SlBFRw==', width: 617, height: 414 })
	assert.deepEqual(c.shots, ['ws://w'])
	assert.deepEqual(await shotItem(c, ''), { ok: false })
})

const UUID = (s) => `com.haeunga0822.obs-browser-click.${s}`

test('one remote action per service', () => {
	assert.deepEqual(
		SERVICE_ACTIONS.map((a) => [a.service, a.uuid]),
		[
			['위플랩', UUID('remote-weflab')],
			['씨미', UUID('remote-cime')],
			['치지직', UUID('remote-chzzk')],
			['투네이션', UUID('remote-toonation')],
		],
	)
	assert.equal(new ServiceRemoteAction(fakeClicker(), '씨미').manifestId, UUID('remote-cime'))
})

test('a service action presses its own presets only', async () => {
	const c = fakeClicker({ pages: PAGES })
	const own = await appear(ServiceRemoteAction, c, { preset: 'toonation-skip' })
	assert.equal(own.f.calls.titles.at(-1), '스킵')
	const a = new ServiceRemoteAction(c, '위플랩')
	const f = fakeAction('w-other', { preset: 'toonation-skip' })
	await a.onWillAppear(f.ev())
	shown.push({ a, f })
	assert.equal(f.calls.titles.at(-1), '없음')
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
})

test('getPresets lists only the action service', () => {
	assert.deepEqual(presetItemsFor(UUID('remote-chzzk')), [
		{ value: 'chzzk-tts-skip', label: 'TTS 넘기기' },
		{ value: 'chzzk-alert-stop', label: '알림 정지' },
	])
	assert.deepEqual(presetItemsFor(UUID('custom-click')), [])
})

test('manifest has the four service actions and no old remote button', async () => {
	const { readFileSync } = await import('node:fs')
	const manifest = JSON.parse(readFileSync(new URL('../com.haeunga0822.obs-browser-click.sdPlugin/manifest.json', import.meta.url), 'utf8'))
	const byUuid = Object.fromEntries(manifest.Actions.map((a) => [a.UUID, a]))
	for (const s of SERVICE_ACTIONS) assert.equal(byUuid[s.uuid]?.Name, s.name, s.uuid)
	assert.equal(byUuid[UUID('remote-button')], undefined)
	assert.deepEqual(Object.keys(byUuid).sort(), [...SERVICE_ACTIONS.map((s) => s.uuid), UUID('custom-click')].sort())
})

test('timer stops', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(ServiceRemoteAction, c, { preset: 'weflab-cancel' }, 'lonely')
	shown.pop()
	a.onWillDisappear(f.ev())
	assert.equal(a.polling, false)
})
