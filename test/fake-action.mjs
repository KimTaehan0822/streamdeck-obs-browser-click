// A Stream Deck key as the actions see it, recording what they send.
export function fakeAction(id, settings = {}) {
	const calls = { titles: [], states: [], alerts: 0 }
	const action = {
		id,
		isKey: () => true,
		isDial: () => false,
		setTitle: async (t) => void calls.titles.push(t),
		setState: async (s) => void calls.states.push(s),
		showAlert: async () => void calls.alerts++,
		getSettings: async () => settings,
	}
	const ev = (payload = {}) => ({ action, payload: { settings, ...payload } })
	return { action, calls, ev }
}

/** A Clicker whose pages and page answers the test sets; records every evaluate. */
export function fakeClicker({ pages = [], answer = () => 'ok', offline = false, point = () => 'ok' } = {}) {
	const evaluated = []
	const clicked = []
	const shots = []
	return {
		evaluated,
		clicked,
		shots,
		clickAt: async (wsUrl, x, y) => {
			clicked.push({ wsUrl, x, y })
			return point(x, y)
		},
		screenshot: async (wsUrl) => {
			shots.push(wsUrl)
			return { data: 'SlBFRw==', width: 617, height: 414 }
		},
		pages,
		set offline(v) { offline = v },
		set answer(fn) { answer = fn },
		port: () => 9222,
		listPages: async () => {
			if (offline) throw new Error('ECONNREFUSED')
			return pages
		},
		evaluate: async (wsUrl, expr) => {
			evaluated.push({ wsUrl, expr })
			return answer(expr, wsUrl)
		},
	}
}

export const PAGES = [
	{ id: 'w', type: 'page', title: '후원관리 | 리모컨 | 위플랩', url: 'https://weflab.com/alertlist?mode=remote', webSocketDebuggerUrl: 'ws://w' },
	{ id: 't', type: 'page', title: 'Toonation', url: 'https://toon.at/widget/controller/key', webSocketDebuggerUrl: 'ws://t' },
]
