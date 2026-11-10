import assert from 'node:assert/strict'
import test from 'node:test'
import { findObs, setupShortcuts, SHORTCUT_NAME } from '../dist/shortcut.js'

const EXE = 'D:\\OBS\\bin\\64bit\\obs64.exe'

test('findObs reads the registry', () => {
	assert.equal(findObs(() => 'D:\\OBS', (p) => p === EXE), EXE)
})

test('findObs falls back', () => {
	const fallback = 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'
	assert.equal(findObs(() => undefined, (p) => p === fallback), fallback)
	assert.equal(findObs(() => undefined, () => false), undefined)
})

test('setup refuses without obs64', async () => {
	let ran = false
	const r = await setupShortcuts(9222, async () => ((ran = true), ''), () => undefined)
	assert.deepEqual(r, { ok: false, reason: 'noObs' })
	assert.equal(ran, false)
})

test('values go through env', async () => {
	let seen
	await setupShortcuts(9333, async (script, env) => ((seen = { script, env }), '{"desktop":"a","startMenu":"b","taskbar":0}'), () => EXE)
	assert.deepEqual(seen.env, { OBS_EXE: EXE, OBS_DIR: 'D:\\OBS\\bin\\64bit', OBS_PORT: '9333', SC_NAME: SHORTCUT_NAME })
	assert.ok(!seen.script.includes('D:\\OBS'), 'paths are not pasted into the script')
	assert.ok(!seen.script.includes('9333'))
})

test('setup reports what it made', async () => {
	const out = 'noise\r\n{"desktop":"C:\\\\U\\\\Desktop\\\\x.lnk","startMenu":"C:\\\\U\\\\Programs\\\\x.lnk","taskbar":1}\r\n'
	assert.deepEqual(await setupShortcuts(9222, async () => out, () => EXE), { ok: true, desktop: 'C:\\U\\Desktop\\x.lnk', startMenu: 'C:\\U\\Programs\\x.lnk', taskbar: 1 })
	assert.deepEqual(await setupShortcuts(9222, async () => { throw new Error('boom') }, () => EXE), { ok: false, reason: 'failed' })
})
