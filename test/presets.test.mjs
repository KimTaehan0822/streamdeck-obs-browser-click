import assert from 'node:assert/strict'
import test from 'node:test'
import { PRESETS, presetById } from '../dist/presets.js'

const byService = (s) => PRESETS.filter((p) => p.service === s)

test('ids are unique and stable', () => {
	const ids = PRESETS.map((p) => p.id)
	assert.equal(new Set(ids).size, ids.length)
	for (const id of ids) assert.match(id, /^[a-z0-9-]+$/)
	assert.equal(presetById('toonation-skip')?.label, '스킵')
	assert.equal(presetById('nope'), undefined)
})

test('every preset has url and a way to find it', () => {
	for (const p of PRESETS) {
		assert.ok(p.target.url, p.id)
		assert.ok(p.target.selector || p.target.text, p.id)
		assert.ok(p.label, p.id)
	}
})

test('service urls', () => {
	for (const p of byService('위플랩')) assert.equal(p.target.url, 'weflab.com/alertlist?mode=remote')
	for (const p of byService('씨미')) assert.deepEqual([p.target.host, p.target.url], ['studio.ci.me', '/rc'])
	for (const p of byService('치지직')) assert.deepEqual([p.target.host, p.target.url], ['studio.chzzk.naver.com', '/remotecontrol'])
	for (const p of byService('투네이션')) assert.equal(p.target.url, 'toon.at/widget/controller/')
})

test('weflab presets never rely on a bare tag', () => {
	// Weflab repeats 시작/취소/시간 across sections; a class or id keeps each key on its own button.
	for (const p of byService('위플랩')) assert.match(p.target.selector ?? '', /[.#]/, p.id)
})

test('toggles', () => {
	assert.deepEqual(presetById('weflab-pause')?.target.toggle, { onClass: 'play' })
	assert.deepEqual(presetById('toonation-pause')?.target.toggle, { onClass: 'paused' })
	for (const id of ['cime-chat-toggle', 'cime-cheer-toggle', 'cime-video-toggle', 'cime-mission-toggle', 'cime-warp-following']) {
		assert.deepEqual(presetById(id)?.target.toggle, { onClass: 'state_on' }, id)
	}
	// Checked by pressing twice on 2026-11-10: text and class never change, so these are one-shot buttons.
	assert.equal(presetById('cime-pause')?.target.toggle, undefined)
	assert.equal(presetById('chzzk-alert-stop')?.target.toggle, undefined)
	assert.equal(PRESETS.filter((p) => p.target.toggle).length, 7)
})

test('spec coverage', () => {
	assert.deepEqual(
		['위플랩', '씨미', '치지직', '투네이션'].map((s) => byService(s).length),
		[17, 8, 2, 2],
	)
	assert.deepEqual([...new Set(PRESETS.map((p) => p.service))], ['위플랩', '씨미', '치지직', '투네이션'])
})
