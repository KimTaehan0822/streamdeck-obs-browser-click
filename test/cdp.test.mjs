import assert from 'node:assert/strict'
import test from 'node:test'
import { listPages, findPage, evaluate, send, screenshot, clickAt } from '../dist/cdp.js'
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

test('not OBS is offline', async () => {
	const cdp = await fakeCdp({ targets: TARGETS, userAgent: 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36' })
	try {
		await assert.rejects(listPages(cdp.port), /port is not OBS/)
	} finally {
		await cdp.close()
	}
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

// Answers Runtime.evaluate with a 300×200 viewport and Page/Input calls with an empty result.
const pageReply = (msg) => {
	if (msg.method === 'Runtime.evaluate') return { result: { result: { value: { width: 300, height: 200 } } } }
	if (msg.method === 'Page.captureScreenshot') return { result: { data: 'SlBFRw==' } }
	return { result: {} }
}

test('send returns results in order', async () => {
	const cdp = await fakeCdp({ reply: (m) => ({ result: { n: m.params.n } }) })
	try {
		assert.deepEqual(await send(cdp.wsUrl('a'), [{ method: 'A', params: { n: 1 } }, { method: 'B', params: { n: 2 } }]), [{ n: 1 }, { n: 2 }])
		assert.deepEqual(cdp.received.map((m) => m.method), ['A', 'B'])
	} finally {
		await cdp.close()
	}
})

test('send rejects on error', async () => {
	const cdp = await fakeCdp({ reply: () => ({ error: { message: 'nope' } }) })
	try {
		await assert.rejects(send(cdp.wsUrl('a'), [{ method: 'A' }]), /nope/)
	} finally {
		await cdp.close()
	}
})

test('screenshot returns jpeg and size', async () => {
	const cdp = await fakeCdp({ reply: pageReply })
	try {
		assert.deepEqual(await screenshot(cdp.wsUrl('a')), { data: 'SlBFRw==', width: 300, height: 200 })
		const shot = cdp.received.find((m) => m.method === 'Page.captureScreenshot')
		assert.deepEqual(shot.params, { format: 'jpeg', quality: 70 })
	} finally {
		await cdp.close()
	}
})

test('clickAt sends move press release', async () => {
	const cdp = await fakeCdp({ reply: pageReply })
	try {
		assert.equal(await clickAt(cdp.wsUrl('a'), 60, 108), 'ok')
		const mouse = cdp.received.filter((m) => m.method === 'Input.dispatchMouseEvent').map((m) => m.params)
		assert.deepEqual(mouse, [
			{ type: 'mouseMoved', x: 60, y: 108 },
			{ type: 'mousePressed', x: 60, y: 108, button: 'left', clickCount: 1 },
			{ type: 'mouseReleased', x: 60, y: 108, button: 'left', clickCount: 1 },
		])
	} finally {
		await cdp.close()
	}
})

test('clickAt refuses outside', async () => {
	const cdp = await fakeCdp({ reply: pageReply })
	try {
		assert.equal(await clickAt(cdp.wsUrl('a'), 300, 10), 'outside')
		assert.equal(await clickAt(cdp.wsUrl('a'), 10, 200), 'outside')
		assert.equal(await clickAt(cdp.wsUrl('a'), -1, 10), 'outside')
		assert.equal(cdp.received.filter((m) => m.method.startsWith('Input.')).length, 0)
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
