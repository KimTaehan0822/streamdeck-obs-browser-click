import assert from 'node:assert/strict'
import test from 'node:test'
import { RemoteButtonAction, CustomClickAction, customTarget, presetItems, pageItems, buttonItems } from '../dist/actions.js'
import { pageExpression } from '../dist/page-script.js'
import { presetById } from '../dist/presets.js'
import { fakeAction, fakeClicker, PAGES } from './fake-action.mjs'

// Every key shown in a test disappears afterwards, so the poll timer lets the process exit.
const shown = []
test.afterEach(() => {
	for (const { a, f } of shown.splice(0)) a.onWillDisappear(f.ev())
})
async function appear(Action, clicker, settings, id = 'k' + shown.length) {
	const a = new Action(clicker)
	const f = fakeAction(id, settings)
	await a.onWillAppear(f.ev())
	shown.push({ a, f })
	return { a, f }
}

test('press clicks preset', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'toonation-skip' })
	c.evaluated.length = 0
	await a.onKeyDown(f.ev())
	assert.deepEqual(c.evaluated, [{ wsUrl: 'ws://t', expr: pageExpression(presetById('toonation-skip').target, 'click') }])
	assert.equal(f.calls.alerts, 0)
})

test('press while offline alerts', async () => {
	const c = fakeClicker({ pages: PAGES, offline: true })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'toonation-skip' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
	assert.equal(f.calls.titles.at(-1), 'OFFLINE')
	assert.equal(c.evaluated.length, 0)
})

test('unknown preset alerts', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'gone' })
	await a.onKeyDown(f.ev())
	assert.equal(c.evaluated.length, 0)
	assert.equal(f.calls.alerts, 1)
	assert.equal(f.calls.titles.at(-1), '없음')
})

test('missing page alerts', async () => {
	const c = fakeClicker({ pages: [PAGES[1]] })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'weflab-cancel' })
	assert.equal(f.calls.titles.at(-1), '없음')
	await a.onKeyDown(f.ev())
	assert.equal(c.evaluated.length, 0)
	assert.equal(f.calls.alerts, 1)
})

test('missing button alerts', async () => {
	const c = fakeClicker({ pages: PAGES, answer: () => 'missing' })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'weflab-cancel' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
})

test('page error alerts', async () => {
	const c = fakeClicker({ pages: PAGES, answer: () => Promise.reject(new Error('CDP timeout')) })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'weflab-cancel' })
	await a.onKeyDown(f.ev())
	assert.equal(f.calls.alerts, 1)
})

test('shows the preset label when the page is there', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { f } = await appear(RemoteButtonAction, c, { preset: 'weflab-cancel' })
	assert.deepEqual(f.calls.titles, ['알림 취소(넘기기)'])
	assert.equal(c.evaluated.length, 0, 'a key without a toggle only checks the page exists')
})

test('toggle follows page', async () => {
	let state = 'on'
	const c = fakeClicker({ pages: PAGES, answer: (expr) => (expr.includes('"state"') ? state : 'ok') })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'weflab-pause' })
	assert.deepEqual(f.calls.states, [1])
	await a.poll()
	assert.deepEqual(f.calls.states, [1], 'same state is not resent')
	state = 'off'
	await a.onKeyDown(f.ev())
	assert.deepEqual(f.calls.states, [1, 0], 'pressing reads the state right away')
})

test('user title is kept', async () => {
	const c = fakeClicker({ pages: PAGES, offline: true })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'weflab-cancel' })
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
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'weflab-cancel' })
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

test('getPresets groups by service', () => {
	const groups = presetItems()
	assert.deepEqual(groups.map((g) => g.label), ['위플랩', '씨미', '치지직', '투네이션'])
	assert.deepEqual(groups[3].children, [
		{ value: 'toonation-pause', label: '알림 일시정지' },
		{ value: 'toonation-skip', label: '스킵' },
	])
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

test('timer stops', async () => {
	const c = fakeClicker({ pages: PAGES })
	const { a, f } = await appear(RemoteButtonAction, c, { preset: 'weflab-cancel' }, 'lonely')
	shown.pop()
	a.onWillDisappear(f.ev())
	assert.equal(a.polling, false)
})
