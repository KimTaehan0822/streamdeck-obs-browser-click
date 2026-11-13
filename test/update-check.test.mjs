import assert from 'node:assert/strict'
import test from 'node:test'

const store = new Map()
let storageBroken = false
globalThis.localStorage = {
	getItem: (k) => {
		if (storageBroken) throw new Error('blocked')
		return store.has(k) ? store.get(k) : null
	},
	setItem: (k, v) => {
		if (storageBroken) throw new Error('blocked')
		store.set(k, String(v))
	},
}
let calls = 0
let respond = () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v1.0.2', html_url: 'https://github.com/o/r/releases/tag/v1.0.2' }) })
globalThis.fetch = async () => {
	calls++
	return respond()
}

await import('../com.haeunga0822.obs-browser-click.sdPlugin/ui/update-check.js')
const { isNewer, latest } = globalThis.UpdateCheck
const DAY = 86_400_000
const reset = () => {
	store.clear()
	calls = 0
	storageBroken = false
	respond = () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v1.0.2', html_url: 'https://github.com/o/r/releases/tag/v1.0.2' }) })
}

test('isNewer compares the first three numbers', () => {
	assert.equal(isNewer('v1.0.2', '1.0.1.0'), true)
	assert.equal(isNewer('v1.0.1', '1.0.1.0'), false)
	assert.equal(isNewer('v1.0.0', '1.0.1'), false)
	assert.equal(isNewer('v1.10.0', '1.9.9'), true)
	assert.equal(isNewer('v0.3.1', '0.3.1+20261114.1200'), false)
	assert.equal(isNewer('nightly', '1.0.0'), false)
})

test('latest returns the tag and page', async () => {
	reset()
	assert.deepEqual(await latest('r', 1000), { tag: 'v1.0.2', url: 'https://github.com/o/r/releases/tag/v1.0.2' })
})

test('latest asks GitHub at most once a day', async () => {
	reset()
	await latest('r', 1000)
	await latest('r', 1000 + DAY - 1)
	assert.equal(calls, 1)
	await latest('r', 1000 + DAY + 1)
	assert.equal(calls, 2)
})

test('latest is null on network error or 403, and the failure is cached', async () => {
	reset()
	respond = () => {
		throw new Error('offline')
	}
	assert.equal(await latest('r', 1000), null)
	respond = () => ({ ok: false, status: 403, json: async () => ({}) })
	assert.equal(await latest('r2', 1000), null)
	await latest('r2', 2000)
	assert.equal(calls, 2)
})

test('latest works when storage is blocked', async () => {
	reset()
	storageBroken = true
	assert.equal((await latest('r', 1000))?.tag, 'v1.0.2')
})
