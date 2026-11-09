import assert from 'node:assert/strict'
import test from 'node:test'
import { listPages, findPage, evaluate } from '../dist/cdp.js'
import { fakeCdp } from './fake-cdp.mjs'

const TARGETS = [
	{ id: 'a', type: 'page', title: '후원관리 | 리모컨', url: 'https://weflab.com/alertlist?mode=remote' },
	{ id: 'b', type: 'iframe', title: 'ad', url: 'https://ads.example/x' },
	{ id: 'c', type: 'page', title: 'Toonation', url: 'https://toon.at/widget/controller/k' },
]

test('lists only pages', async () => {
	const cdp = await fakeCdp({ targets: TARGETS })
	try {
		const pages = await listPages(cdp.port)
		assert.deepEqual(pages.map((p) => [p.title, p.url]), [
			['후원관리 | 리모컨', 'https://weflab.com/alertlist?mode=remote'],
			['Toonation', 'https://toon.at/widget/controller/k'],
		])
		assert.equal(pages[0].webSocketDebuggerUrl, cdp.wsUrl('a'))
	} finally {
		await cdp.close()
	}
})

test('rejects when port closed', async () => {
	const cdp = await fakeCdp()
	const port = cdp.port
	await cdp.close()
	await assert.rejects(listPages(port))
})

test('findPage matches substring, first wins', () => {
	const pages = [
		{ id: '1', type: 'page', title: 'x', url: 'https://weflab.com/alertlist?mode=remote', webSocketDebuggerUrl: 'ws://1' },
		{ id: '2', type: 'page', title: 'y', url: 'https://weflab.com/alertlist?mode=remote#2', webSocketDebuggerUrl: 'ws://2' },
	]
	assert.equal(findPage(pages, 'alertlist?mode=remote')?.id, '1')
	assert.equal(findPage(pages, 'nothing'), undefined)
	assert.equal(findPage(pages, ''), undefined)
})

test('findPage pins the host when given', () => {
	const pages = [
		{ id: '1', type: 'page', title: 'other', url: 'https://example.com/rcs/widget', webSocketDebuggerUrl: 'ws://1' },
		{ id: '2', type: 'page', title: '씨미', url: 'https://studio.ci.me/1/rc', webSocketDebuggerUrl: 'ws://2' },
	]
	assert.equal(findPage(pages, '/rc', 'studio.ci.me')?.id, '2')
	assert.equal(findPage(pages, '/rc', 'studio.chzzk.naver.com'), undefined)
	assert.equal(findPage([{ ...pages[0], url: 'not a url' }], 'url', 'studio.ci.me'), undefined)
})

test('evaluate returns value', async () => {
	const cdp = await fakeCdp()
	try {
		assert.equal(await evaluate(cdp.wsUrl('a'), '1+1'), 'ok')
		const [msg] = cdp.received
		assert.equal(msg.method, 'Runtime.evaluate')
		assert.equal(msg.params.expression, '1+1')
		assert.equal(msg.params.returnByValue, true)
		assert.equal(msg.params.userGesture, true)
	} finally {
		await cdp.close()
	}
})

test('evaluate rejects on exception', async () => {
	const cdp = await fakeCdp({ reply: () => ({ result: { result: { type: 'object' }, exceptionDetails: { text: 'boom' } } }) })
	try {
		await assert.rejects(evaluate(cdp.wsUrl('a'), 'throw 1'))
	} finally {
		await cdp.close()
	}
})

test('times out', async () => {
	const cdp = await fakeCdp({ reply: () => undefined })
	try {
		const start = Date.now()
		await assert.rejects(evaluate(cdp.wsUrl('a'), '1', 100))
		const took = Date.now() - start
		assert.ok(took >= 90 && took < 1000, `took ${took}ms`)
		await new Promise((r) => setTimeout(r, 100))
		assert.equal(cdp.openSockets(), 0)
	} finally {
		await cdp.close()
	}
})
