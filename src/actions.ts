import {
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type TitleParametersDidChangeEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import { execFile } from 'node:child_process'
import { clickAt, evaluate, findPage, listPages, screenshot, scrollerAt, scrollOf, scrollTo, type CdpPage } from './cdp.js'
import { readBrowserSources, sourceNameFor, type BrowserSource } from './obs-sources.js'
import { pageExpression, type ListItem, type Target } from './page-script.js'
import { PRESETS, presetById, type Service } from './presets.js'

/** The OBS side, swappable in tests. */
export interface Clicker {
	port(): number
	listPages(): Promise<CdpPage[]>
	evaluate(wsUrl: string, expr: string): Promise<unknown>
	clickAt(wsUrl: string, x: number, y: number): Promise<'ok' | 'outside'>
	screenshot(wsUrl: string): Promise<{ data: string; width: number; height: number }>
	scrollOf(wsUrl: string, box: string): Promise<{ x: number; y: number } | null>
	scrollTo(wsUrl: string, box: string, x: number, y: number): Promise<{ x: number; y: number } | null>
	scrollerAt(wsUrl: string, x: number, y: number): Promise<{ box: string; x: number; y: number }>
	/** Whether obs64.exe runs, asked only when the port does not answer. */
	obsRunning(): Promise<boolean>
	browserSources(): Promise<BrowserSource[]>
}

export const OBS_CHECK_MS = 5000

export function createClicker(port: () => number): Clicker {
	let checked = 0
	let running = Promise.resolve(false)
	const obsRunning = () => {
		if (Date.now() - checked < OBS_CHECK_MS) return running
		checked = Date.now()
		running = new Promise((resolve) =>
			execFile('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH'], { windowsHide: true, timeout: 3000 }, (error, out) => resolve(!error && /obs64\.exe/i.test(out))),
		)
		return running
	}
	return { port, listPages: () => listPages(port()), evaluate: (wsUrl, expr) => evaluate(wsUrl, expr), clickAt, screenshot, scrollOf, scrollTo, scrollerAt, obsRunning, browserSources: () => readBrowserSources() }
}

export const POLL_MS = 1000
const OFFLINE = 'OFFLINE'
const MISSING = '없음'
const DEBUG_OFF = '디버그\n꺼짐'
const SCROLLED = '스크롤\n바뀜'

type Status = 'ok' | 'offline' | 'missing' | 'debugOff' | 'scrolled'
type KeyAction = KeyDownEvent<JsonObject>['action']

interface Instance<S> {
	action: KeyAction
	settings: S
	status?: Status
	state?: 0 | 1
	/** Last title this plugin sent, so its echo in titleParametersDidChange is not taken for the user's. */
	sentTitle?: string
	userTitle: boolean
}

const log = (line: string) => console.info(line)
const fail = (error: unknown) => console.error(error instanceof Error ? error.message : String(error))

export abstract class ClickAction<S extends JsonObject> extends SingletonAction<S> {
	private readonly instances = new Map<string, Instance<S>>()
	private timer?: NodeJS.Timeout
	private busy = false

	constructor(protected readonly clicker: Clicker) {
		super()
	}

	protected abstract targetOf(settings: S): Target | undefined
	protected abstract labelOf(settings: S): string

	/** Presses on the page; true when it was pressed. */
	protected async press(_settings: S, page: CdpPage, target: Target): Promise<boolean> {
		return (await this.clicker.evaluate(page.webSocketDebuggerUrl, pageExpression(target, 'click'))) === 'ok'
	}

	/** What a found, non-toggle key shows on each poll. */
	protected async check(_settings: S, _page: CdpPage): Promise<Status> {
		return 'ok'
	}

	get polling(): boolean {
		return this.timer !== undefined
	}

	override async onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
		if (!ev.action.isKey()) return // the manifest offers these on keys only
		this.instances.set(ev.action.id, { action: ev.action as unknown as KeyAction, settings: ev.payload.settings, userTitle: false })
		this.timer ??= setInterval(() => void this.poll(), POLL_MS)
		await this.poll()
	}

	override onWillDisappear(ev: WillDisappearEvent<S>): void {
		this.instances.delete(ev.action.id)
		if (this.instances.size) return
		clearInterval(this.timer)
		this.timer = undefined
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): Promise<void> {
		await this.settingsChanged(ev.action.id, ev.payload.settings)
	}

	/** Also for settings the plugin wrote itself: Stream Deck sends no didReceiveSettings for those. */
	async settingsChanged(id: string, settings: S): Promise<void> {
		const instance = this.instances.get(id)
		if (!instance) return
		instance.settings = settings
		instance.status = undefined // the label may have changed
		await this.poll()
	}

	override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<S>): void {
		const instance = this.instances.get(ev.action.id)
		if (!instance) return
		const title = ev.payload.titleParameters.showTitle ? ev.payload.title : ''
		instance.userTitle = !!title && title !== instance.sentTitle
	}

	override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
		const instance = this.instances.get(ev.action.id)
		if (!instance) return
		const alert = () => instance.action.showAlert().catch(fail)
		const target = this.targetOf(instance.settings)
		if (!target) return void (this.show(instance, 'missing'), alert())
		let pages: CdpPage[]
		try {
			pages = await this.clicker.listPages()
		} catch {
			return void (this.show(instance, await this.offlineStatus()), alert())
		}
		const page = findPage(pages, target.url, target.host)
		if (!page) return void (this.show(instance, 'missing'), alert())
		try {
			if (!(await this.press(instance.settings, page, target))) return void alert()
		} catch (error) {
			fail(error)
			return void alert()
		}
		this.show(instance, 'ok')
		if (target.toggle) await this.readState(instance, page, target)
	}

	/** Checks every visible key once: OBS reachable, page there, and the page's state for toggles. */
	async poll(): Promise<void> {
		if (this.busy || !this.instances.size) return
		this.busy = true
		try {
			let pages: CdpPage[]
			try {
				pages = await this.clicker.listPages()
			} catch {
				const status = await this.offlineStatus()
				for (const instance of this.instances.values()) this.show(instance, status)
				return
			}
			for (const instance of [...this.instances.values()]) {
				const target = this.targetOf(instance.settings)
				const page = target && findPage(pages, target.url, target.host)
				if (!target || !page) {
					this.show(instance, 'missing')
					continue
				}
				if (!target.toggle) this.show(instance, await this.check(instance.settings, page))
				else await this.readState(instance, page, target)
			}
		} finally {
			this.busy = false
		}
	}

	private async readState(instance: Instance<S>, page: CdpPage, target: Target): Promise<void> {
		let result: unknown
		try {
			result = await this.clicker.evaluate(page.webSocketDebuggerUrl, pageExpression(target, 'state'))
		} catch (error) {
			return fail(error)
		}
		if (result !== 'on' && result !== 'off') return this.show(instance, 'missing')
		this.show(instance, 'ok')
		const state = result === 'on' ? 1 : 0
		if (state === instance.state) return
		instance.state = state
		log(`state ${instance.action.id} ${state}`)
		instance.action.setState(state).catch(fail)
	}

	/** No port: OBS started without the debug flag, or not running at all. */
	private async offlineStatus(): Promise<Status> {
		return (await this.clicker.obsRunning().catch(() => false)) ? 'debugOff' : 'offline'
	}

	private show(instance: Instance<S>, status: Status): void {
		if (status === instance.status) return
		instance.status = status
		const text = { offline: OFFLINE, missing: MISSING, debugOff: DEBUG_OFF, scrolled: SCROLLED, ok: '' }[status]
		if (status !== 'ok') log(`state ${instance.action.id} ${text.replace('\n', '')}`)
		if (instance.userTitle) return
		const title = status === 'ok' ? this.labelOf(instance.settings) : text
		if (title === instance.sentTitle) return
		instance.sentTitle = title
		instance.action.setTitle(title).catch(fail)
	}
}

type RemoteSettings = { preset?: string }

/** One Stream Deck action per remote, so each settings list shows only that service (same order as the manifest). */
export const SERVICE_ACTIONS: readonly { service: Service; uuid: string; name: string }[] = [
	{ service: '위플랩', uuid: 'com.haeunga0822.obs-browser-click.remote-weflab', name: '위플랩 리모컨' },
	{ service: '씨미', uuid: 'com.haeunga0822.obs-browser-click.remote-cime', name: '씨미 리모컨' },
	{ service: '치지직', uuid: 'com.haeunga0822.obs-browser-click.remote-chzzk', name: '치지직 리모컨' },
	{ service: '투네이션', uuid: 'com.haeunga0822.obs-browser-click.remote-toonation', name: '투네이션 리모컨' },
]

export class ServiceRemoteAction extends ClickAction<RemoteSettings> {
	override readonly manifestId: string

	constructor(clicker: Clicker, private readonly service: Service) {
		super(clicker)
		this.manifestId = SERVICE_ACTIONS.find((a) => a.service === service)?.uuid ?? ''
	}
	private preset(s: RemoteSettings) {
		const p = presetById(s.preset ?? '')
		return p?.service === this.service ? p : undefined
	}
	protected targetOf(s: RemoteSettings): Target | undefined {
		return this.preset(s)?.target
	}
	protected labelOf(s: RemoteSettings): string {
		return this.preset(s)?.label ?? ''
	}
}

type CustomSettings = {
	pageUrl?: string
	button?: string
	selector?: string
	mode?: string
	pointX?: string
	pointY?: string
	/** The scroll box under the point when it was picked (CSS selector, '' = whole page) and its scroll then. */
	scrollBox?: string
	scrollX?: string
	scrollY?: string
	/** Off: a press on a scrolled page only alerts. Missing means on. */
	scrollRestore?: boolean
}
type Scroll = { x: number; y: number }

/** The saved scroll of a point key; undefined for keys picked before scroll was saved. */
export function savedScrollOf(s: CustomSettings): (Scroll & { box: string }) | undefined {
	if (!pointOf(s)) return undefined
	const num = (v?: string) => (v?.trim() ? Number(v) : NaN)
	const x = num(s.scrollX)
	const y = num(s.scrollY)
	// Negative is real: bottom-up chat lists (flex column-reverse, e.g. Chzzk) scroll from 0 downward.
	return Number.isFinite(x) && Number.isFinite(y) ? { box: s.scrollBox ?? '', x, y } : undefined
}

// Zoomed pages can land a fraction off. A gone box (null) never matches.
export const sameScroll = (a: Scroll | null, b: Scroll) => !!a && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1

/** Scrolls the key's box back to the saved scroll; used by the key and by the settings page button. */
export async function restoreScroll(clicker: Clicker, s: CustomSettings): Promise<'done' | 'short' | 'noSaved' | 'noPage' | 'noBox'> {
	const saved = savedScrollOf(s)
	if (!saved) return 'noSaved'
	try {
		const page = findPage(await clicker.listPages(), s.pageUrl ?? '')
		if (!page) return 'noPage'
		const got = await clicker.scrollTo(page.webSocketDebuggerUrl, saved.box, saved.x, saved.y)
		if (!got) return 'noBox'
		return sameScroll(got, saved) ? 'done' : 'short'
	} catch {
		return 'noPage'
	}
}

type SettingsStore = { getSettings(): Promise<JsonObject>; setSettings(s: JsonObject): Promise<void> }

/**
 * Saves the scroll box under a just-picked point into the key's settings; returns them when saved.
 * Done here, not in the settings page, so a closed page still saves it, and a late answer
 * for an older point (the user clicked again) is dropped.
 */
export async function saveScroller(clicker: Clicker, key: SettingsStore, x: number, y: number): Promise<JsonObject | undefined> {
	try {
		const s = (await key.getSettings()) as CustomSettings
		const page = findPage(await clicker.listPages(), s.pageUrl ?? '')
		if (!page) return undefined
		const found = await clicker.scrollerAt(page.webSocketDebuggerUrl, x, y)
		const now = (await key.getSettings()) as CustomSettings
		if (now.pageUrl !== s.pageUrl || now.pointX !== String(x) || now.pointY !== String(y)) return undefined
		const saved = { ...now, scrollBox: found.box, scrollX: String(found.x), scrollY: String(found.y) }
		await key.setSettings(saved)
		return saved
	} catch {
		return undefined
	}
}

/** The page point to click in "위치 찍기" mode; undefined unless both coordinates are numbers ≥ 0. */
export function pointOf(s: CustomSettings): { x: number; y: number } | undefined {
	if (s.mode !== 'point' || !s.pageUrl) return undefined
	const num = (v?: string) => (v?.trim() ? Number(v) : NaN)
	const x = num(s.pointX)
	const y = num(s.pointY)
	return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 ? { x, y } : undefined
}

/** A selector wins over the chosen button; `button` is "<index>\t<text>" as buttonItems makes it. */
export function customTarget(s: CustomSettings): Target | undefined {
	if (!s.pageUrl) return undefined
	const selector = s.selector?.trim()
	if (selector) return { url: s.pageUrl, selector }
	const tab = s.button?.indexOf('\t') ?? -1
	if (!s.button || tab < 0) return undefined
	return { url: s.pageUrl, text: s.button.slice(tab + 1), index: Number(s.button.slice(0, tab)) || 0 }
}

export class CustomClickAction extends ClickAction<CustomSettings> {
	override readonly manifestId = 'com.haeunga0822.obs-browser-click.custom-click'
	protected targetOf(s: CustomSettings): Target | undefined {
		if (s.mode !== 'point') return customTarget(s)
		return pointOf(s) && { url: s.pageUrl ?? '' } // only finds the page; press() clicks the point
	}
	protected labelOf(s: CustomSettings): string {
		const p = pointOf(s)
		if (p) return `위치 ${p.x},${p.y}`
		const t = customTarget(s)
		return t?.selector ?? t?.text ?? ''
	}
	protected override async press(s: CustomSettings, page: CdpPage, target: Target): Promise<boolean> {
		const p = pointOf(s)
		if (!p) return super.press(s, page, target)
		const saved = savedScrollOf(s)
		if (saved && !sameScroll(await this.clicker.scrollOf(page.webSocketDebuggerUrl, saved.box), saved)) {
			// The point now covers other content: never click; scroll back if allowed and let the next press click.
			if (s.scrollRestore === false) return false
			return sameScroll(await this.clicker.scrollTo(page.webSocketDebuggerUrl, saved.box, saved.x, saved.y), saved)
		}
		return (await this.clicker.clickAt(page.webSocketDebuggerUrl, p.x, p.y)) === 'ok'
	}
	protected override async check(s: CustomSettings, page: CdpPage): Promise<'ok' | 'scrolled'> {
		const saved = savedScrollOf(s)
		if (!saved) return 'ok'
		try {
			return sameScroll(await this.clicker.scrollOf(page.webSocketDebuggerUrl, saved.box), saved) ? 'ok' : 'scrolled'
		} catch {
			return 'ok' // a slow page must not stall the poll; a press still refuses
		}
	}
}

export async function shotItem(
	clicker: Clicker,
	pageUrl: string,
): Promise<{ ok: true; data: string; width: number; height: number } | { ok: false }> {
	try {
		const page = findPage(await clicker.listPages(), pageUrl)
		if (!page) return { ok: false }
		return { ok: true, ...(await clicker.screenshot(page.webSocketDebuggerUrl)) }
	} catch {
		return { ok: false }
	}
}

type Item = { value: string; label: string }

/** The presets of the remote action with this UUID; empty for any other action. */
export function presetItemsFor(manifestId: string): Item[] {
	const service = SERVICE_ACTIONS.find((a) => a.uuid === manifestId)?.service
	return PRESETS.filter((p) => p.service === service).map((p) => ({ value: p.id, label: p.label }))
}

export async function pageItems(clicker: Clicker): Promise<Item[]> {
	try {
		const [pages, sources] = await Promise.all([clicker.listPages(), clicker.browserSources()])
		// One row per address: the action finds pages by address, so a second copy could never be reached.
		const items = new Map<string, Item>()
		for (const p of pages) {
			const name = sourceNameFor(p.url, sources)
			if (!items.has(p.url)) items.set(p.url, { value: p.url, label: name ? `[소스] ${name}` : p.title || p.url })
		}
		return [...items.values()]
	} catch {
		return []
	}
}

export async function buttonItems(clicker: Clicker, pageUrl: string): Promise<Item[]> {
	try {
		const page = findPage(await clicker.listPages(), pageUrl)
		if (!page) return []
		const list = (await clicker.evaluate(page.webSocketDebuggerUrl, pageExpression({ url: pageUrl }, 'list'))) as ListItem[]
		return list.map(({ text, index }) => ({ value: `${index}\t${text}`, label: index ? `${text} (${index + 1})` : text }))
	} catch {
		return []
	}
}
