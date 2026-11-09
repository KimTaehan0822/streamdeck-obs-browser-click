import assert from 'node:assert/strict'
import test from 'node:test'
import { runInPage, pageExpression, CLICKABLE } from '../dist/page-script.js'
import { el, withDocument } from './fake-dom.mjs'

const URL = 'weflab.com/alertlist?mode=remote'
const doc = (...children) => el('html', {}, children)
const run = (root, target, mode = 'click') => withDocument(root, () => runInPage({ url: URL, ...target }, mode))

test('clicks by selector', () => {
	const cancel = el('a', { id: 'page_alert_cancel', text: '알림 취소' })
	assert.equal(run(doc(el('a', { id: 'page_alert_pause' }), cancel), { selector: '#page_alert_cancel' }), 'ok')
	assert.equal(cancel.clicks, 1)
})

test('exact text only', () => {
	const now = el('a', { text: '현재 취소' })
	const all = el('a', { text: '모두 취소' })
	const root = doc(now, all)
	assert.equal(run(root, { text: '취소' }), 'missing')
	assert.equal(now.clicks + all.clicks, 0)
	assert.equal(run(root, { text: ' 모두   취소 ' }), 'ok')
	assert.equal(all.clicks, 1)
})

test('within narrows', () => {
	const outside = el('a', { text: '모두 취소' })
	const inside = el('a', { text: '모두 취소' })
	const root = doc(outside, el('div', { className: 'form_box display_btn_box' }, [inside]))
	assert.equal(run(root, { within: '.display_btn_box', text: '모두 취소' }), 'ok')
	assert.deepEqual([outside.clicks, inside.clicks], [0, 1])
})

test('row narrows', () => {
	const toggles = () => [el('button', { className: 'ToggleView' }), el('button', { className: 'ToggleView' })]
	const chat = toggles()
	const cheer = toggles()
	const root = doc(
		el('div', {}, [el('div', {}, [el('span', { text: '채팅 후원' })]), el('div', {}, chat)]),
		el('div', {}, [el('div', {}, [el('span', { text: '응원 후원' })]), el('div', {}, cheer)]),
	)
	assert.equal(run(root, { row: '응원 후원', selector: 'button.ToggleView', index: 1 }), 'ok')
	assert.deepEqual([...chat, ...cheer].map((b) => b.clicks), [0, 0, 0, 1])
	assert.equal(run(root, { row: '없는 줄', selector: 'button.ToggleView' }), 'missing')
})

test('row uses the tightest row when the title repeats', () => {
	// ci.me shows "채팅 후원" in the feed and the widget links too; walking up from those reaches every toggle.
	const chat = el('button', { className: 'ToggleView' })
	const cheer = el('button', { className: 'ToggleView' })
	const root = doc(
		el('div', {}, [el('div', {}, [el('span', { text: '채팅 후원' })])]),
		el('div', {}, [
			el('div', {}, [el('div', {}, [el('span', { text: '응원 후원' })]), cheer]),
			el('div', {}, [el('div', {}, [el('span', { text: '채팅 후원' })]), chat]),
		]),
	)
	assert.equal(run(root, { row: '채팅 후원', selector: 'button.ToggleView' }), 'ok')
	assert.deepEqual([chat.clicks, cheer.clicks], [1, 0])
	assert.equal(run(root, { row: '채팅 후원', selector: 'button.ToggleView', index: 1 }), 'missing')
})

test('index picks nth', () => {
	const starts = [1, 2, 3].map(() => el('a', { text: '시작' }))
	assert.equal(run(doc(...starts), { text: '시작', index: 2 }), 'ok')
	assert.deepEqual(starts.map((s) => s.clicks), [0, 0, 1])
	assert.equal(run(doc(...starts), { text: '시작', index: 3 }), 'missing')
})

test('ignores visibility', () => {
	const hidden = el('button', { text: '건너뛰기' }) // the fake's getBoundingClientRect is always 0 by 0
	assert.equal(run(doc(hidden), { text: '건너뛰기' }), 'ok')
	assert.equal(hidden.clicks, 1)
})

test('state by class', () => {
	const pause = el('button', { className: 'event-control-button event-pause-button paused' })
	const t = { selector: '.event-pause-button', toggle: { onClass: 'paused' } }
	assert.equal(run(doc(pause), t, 'state'), 'on')
	pause.className = 'event-control-button event-pause-button'
	assert.equal(run(doc(pause), t, 'state'), 'off')
	const cime = el('button', { className: 'ToggleView toggle__ca8fd9b8 state_on__ca8fd9b8' })
	assert.equal(run(doc(cime), { selector: 'button.ToggleView', toggle: { onClass: 'state_on' } }, 'state'), 'on')
	cime.className = 'ToggleView toggle__ca8fd9b8 state_off__ca8fd9b8'
	assert.equal(run(doc(cime), { selector: 'button.ToggleView', toggle: { onClass: 'state_on' } }, 'state'), 'off')
	assert.equal(pause.clicks + cime.clicks, 0, 'reading state clicks nothing')
})

test('state by checked', () => {
	const box = el('input', { className: 'toggle check_alertlist_use', checked: true, attrs: { type: 'checkbox' } })
	const t = { selector: '.check_alertlist_use', toggle: { checked: true } }
	assert.equal(run(doc(box), t, 'state'), 'on')
	box.checked = false
	assert.equal(run(doc(box), t, 'state'), 'off')
	assert.equal(run(doc(box), { selector: '.check_alertlist_use' }, 'state'), 'missing', 'no toggle → missing')
	assert.equal(run(doc(), t, 'state'), 'missing')
})

test('list round-trips', () => {
	const buttons = [el('button', { text: '시작' }), el('a', { text: '시작' }), el('button', { text: '스킵' }), el('button', { text: '' })]
	const root = doc(...buttons)
	const list = run(root, {}, 'list')
	assert.deepEqual(list, [
		{ text: '시작', index: 0 },
		{ text: '시작', index: 1 },
		{ text: '스킵', index: 0 },
	])
	for (const item of list) run(root, item)
	assert.deepEqual(buttons.map((b) => b.clicks), [1, 1, 1, 0])
})

test('expression is self-contained', () => {
	const skip = el('button', { className: 'event-cancel-button', text: '스킵' })
	const expr = pageExpression({ url: URL, selector: '.event-cancel-button' }, 'click')
	assert.equal(withDocument(doc(skip), () => new Function('return ' + expr)()), 'ok')
	assert.equal(skip.clicks, 1)
})

test('default candidates are the clickable elements', () => {
	assert.equal(CLICKABLE, 'button, a, [role=button], input[type=button], input[type=submit], input[type=checkbox]')
	assert.equal(run(doc(el('div', { text: '스킵' })), { text: '스킵' }), 'missing')
	assert.equal(run(doc(el('div', { text: '스킵', attrs: { role: 'button' } })), { text: '스킵' }), 'ok')
})
