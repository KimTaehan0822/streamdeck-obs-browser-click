import WebSocket from 'ws'

/** One entry of OBS's remote debugging /json/list (browser sources and custom docks). */
export interface CdpPage {
	id: string
	type: string
	title: string
	url: string
	webSocketDebuggerUrl: string
}

/** Lists OBS's pages; refuses a port held by something else (Chrome in debug mode, another app) so nothing there is clicked. */
export async function listPages(port: number): Promise<CdpPage[]> {
	const version = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })
	const { 'User-Agent': agent } = (await version.json()) as { 'User-Agent'?: string }
	if (!agent?.includes('OBS/')) throw new Error('port is not OBS')
	const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
	if (!res.ok) throw new Error(`json/list ${res.status}`)
	const all = (await res.json()) as CdpPage[]
	return all.filter((p) => p.type === 'page')
}

/** First page whose URL contains urlPart and, when host is given, whose host is exactly that. */
export function findPage(pages: CdpPage[], urlPart: string, host?: string): CdpPage | undefined {
	if (!urlPart) return undefined
	const hostOf = (url: string) => URL.canParse(url) ? new URL(url).host : ''
	return pages.find((p) => p.url.includes(urlPart) && (!host || hostOf(p.url) === host))
}

export interface CdpCall {
	method: string
	params?: object
}

// shortcut: 호출마다 새 WebSocket. 키가 많아져 느리면 페이지별 연결 유지로 바꿈
/** Sends the calls one after another on one connection and resolves with each call's result, in order. */
export function send(wsUrl: string, calls: CdpCall[], timeoutMs = 2000): Promise<unknown[]> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl)
		const results: unknown[] = []
		const done = (fn: () => void) => {
			clearTimeout(timer)
			ws.removeAllListeners()
			ws.on('error', () => {})
			ws.terminate()
			fn()
		}
		const next = () => {
			if (results.length === calls.length) return done(() => resolve(results))
			const { method, params = {} } = calls[results.length]
			ws.send(JSON.stringify({ id: results.length + 1, method, params }))
		}
		const timer = setTimeout(() => done(() => reject(new Error('CDP timeout'))), timeoutMs)
		ws.on('error', (error) => done(() => reject(error)))
		ws.on('open', next)
		ws.on('message', (data) => {
			let msg: { id?: number; error?: { message: string }; result?: unknown }
			try {
				msg = JSON.parse(String(data))
			} catch {
				return // not a CDP reply
			}
			if (msg.id !== results.length + 1) return
			if (msg.error) return done(() => reject(new Error(msg.error?.message)))
			results.push(msg.result)
			next()
		})
	})
}

type EvalResult = { result?: { value?: unknown }; exceptionDetails?: { text?: string } }

export async function evaluate(wsUrl: string, expression: string, timeoutMs = 2000): Promise<unknown> {
	const [r] = (await send(wsUrl, [{ method: 'Runtime.evaluate', params: { expression, returnByValue: true, userGesture: true } }], timeoutMs)) as EvalResult[]
	if (r?.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'page exception')
	return r?.result?.value
}

const SIZE = '({ width: innerWidth, height: innerHeight })'
type Size = { width: number; height: number }
type Scroll = { x: number; y: number }

// A box is a CSS selector from scrollerAt; '' is the whole page. The selector goes in as a JSON string, never as code.
const boxExpr = (box: string, then: string) =>
	`(() => { const e = ${JSON.stringify(box)} ? document.querySelector(${JSON.stringify(box)}) : document.scrollingElement; if (!e) return null; ${then}; return { x: Math.round(e.scrollLeft), y: Math.round(e.scrollTop) } })()`

/** The scroll of a box on the page; null when the box is gone (the page changed). */
export async function scrollOf(wsUrl: string, box: string): Promise<Scroll | null> {
	return (await evaluate(wsUrl, boxExpr(box, ''))) as Scroll | null
}

/** Scrolls the box and returns where it got (a shorter list stops early); null when the box is gone. */
export async function scrollTo(wsUrl: string, box: string, x: number, y: number): Promise<Scroll | null> {
	return (await evaluate(wsUrl, boxExpr(box, `e.scrollTo({ left: ${Number(x)}, top: ${Number(y)}, behavior: 'instant' })`))) as Scroll | null
}

// Nearest scrolling ancestor of the point, named by a selector path from the nearest id (or the body).
const SCROLLER_AT = `(() => {
	const scrolls = (e) => { const s = getComputedStyle(e); return (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) || (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth) }
	let e = document.elementFromPoint(X, Y)
	while (e && e !== document.body && e !== document.documentElement && !scrolls(e)) e = e.parentElement
	const root = document.scrollingElement
	if (!e || e === document.body || e === document.documentElement) return { box: '', x: Math.round(root.scrollLeft), y: Math.round(root.scrollTop) }
	const parts = []
	for (let n = e; n && n !== document.body; n = n.parentElement) {
		if (n.id && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) { parts.unshift('#' + CSS.escape(n.id)); break }
		parts.unshift(n.localName + ':nth-child(' + ([...n.parentElement.children].indexOf(n) + 1) + ')')
		if (n.parentElement === document.body) parts.unshift('body')
	}
	return { box: parts.join(' > '), x: Math.round(e.scrollLeft), y: Math.round(e.scrollTop) }
})()`

/** The scroll box holding a page point and its scroll now, saved with a picked point. */
export async function scrollerAt(wsUrl: string, x: number, y: number): Promise<Scroll & { box: string }> {
	return (await evaluate(wsUrl, SCROLLER_AT.replace('X, Y', `${Number(x)}, ${Number(y)}`))) as Scroll & { box: string }
}

export async function screenshot(wsUrl: string): Promise<Size & { data: string }> {
	const [size, shot] = await send(wsUrl, [
		{ method: 'Runtime.evaluate', params: { expression: SIZE, returnByValue: true } },
		{ method: 'Page.captureScreenshot', params: { format: 'jpeg', quality: 70 } },
	])
	const { width, height } = (size as EvalResult).result?.value as Size
	return { data: (shot as { data: string }).data, width, height }
}

/** A real mouse click at page coordinates, delivered to this page only; refuses points outside its current size. */
export async function clickAt(wsUrl: string, x: number, y: number): Promise<'ok' | 'outside'> {
	const { width, height } = (await evaluate(wsUrl, SIZE)) as Size
	if (!(x >= 0 && x < width && y >= 0 && y < height)) return 'outside'
	const button = { button: 'left', clickCount: 1 }
	await send(wsUrl, [
		{ method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x, y } },
		{ method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, ...button } },
		{ method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, ...button } },
	])
	return 'ok'
}
