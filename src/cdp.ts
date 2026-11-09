import WebSocket from 'ws'

/** One entry of OBS's remote debugging /json/list (browser sources and custom docks). */
export interface CdpPage {
	id: string
	type: string
	title: string
	url: string
	webSocketDebuggerUrl: string
}

export async function listPages(port: number): Promise<CdpPage[]> {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
	if (!res.ok) throw new Error(`json/list ${res.status}`)
	const all = (await res.json()) as CdpPage[]
	return all.filter((p) => p.type === 'page')
}

export function findPage(pages: CdpPage[], urlPart: string): CdpPage | undefined {
	if (!urlPart) return undefined
	return pages.find((p) => p.url.includes(urlPart))
}

// shortcut: 호출마다 새 WebSocket. 키가 많아져 느리면 페이지별 연결 유지로 바꿈
export function evaluate(wsUrl: string, expression: string, timeoutMs = 2000): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl)
		const done = (fn: () => void) => {
			clearTimeout(timer)
			ws.removeAllListeners()
			ws.on('error', () => {})
			ws.terminate()
			fn()
		}
		const timer = setTimeout(() => done(() => reject(new Error('CDP timeout'))), timeoutMs)
		ws.on('error', (error) => done(() => reject(error)))
		ws.on('open', () => {
			ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, userGesture: true } }))
		})
		ws.on('message', (data) => {
			const msg = JSON.parse(String(data)) as {
				id?: number
				error?: { message: string }
				result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } }
			}
			if (msg.id !== 1) return
			if (msg.error) return done(() => reject(new Error(msg.error?.message)))
			if (msg.result?.exceptionDetails) return done(() => reject(new Error(msg.result?.exceptionDetails?.text ?? 'page exception')))
			done(() => resolve(msg.result?.result?.value))
		})
	})
}
