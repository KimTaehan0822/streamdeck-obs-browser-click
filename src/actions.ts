import {
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type TitleParametersDidChangeEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import { evaluate, findPage, listPages, type CdpPage } from './cdp.js'
import { pageExpression, type ListItem, type Target } from './page-script.js'
import { PRESETS, presetById } from './presets.js'

/** The OBS side, swappable in tests. */
export interface Clicker {
	port(): number
	listPages(): Promise<CdpPage[]>
	evaluate(wsUrl: string, expr: string): Promise<unknown>
}

export function createClicker(port: () => number): Clicker {
	return { port, listPages: () => listPages(port()), evaluate: (wsUrl, expr) => evaluate(wsUrl, expr) }
}

export const POLL_MS = 1000
const OFFLINE = 'OFFLINE'
const MISSING = '없음'

type Status = 'ok' | 'offline' | 'missing'
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

	constructor(private readonly clicker: Clicker) {
		super()
	}

	protected abstract targetOf(settings: S): Target | undefined
	protected abstract labelOf(settings: S): string

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
		const instance = this.instances.get(ev.action.id)
		if (!instance) return
		instance.settings = ev.payload.settings
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
			return void (this.show(instance, 'offline'), alert())
		}
		const page = findPage(pages, target.url)
		if (!page) return void (this.show(instance, 'missing'), alert())
		try {
			if ((await this.clicker.evaluate(page.webSocketDebuggerUrl, pageExpression(target, 'click'))) !== 'ok') return void alert()
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
				for (const instance of this.instances.values()) this.show(instance, 'offline')
				return
			}
			for (const instance of [...this.instances.values()]) {
				const target = this.targetOf(instance.settings)
				const page = target && findPage(pages, target.url)
				if (!target || !page) {
					this.show(instance, 'missing')
					continue
				}
				if (!target.toggle) this.show(instance, 'ok')
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

	private show(instance: Instance<S>, status: Status): void {
		if (status === instance.status) return
		instance.status = status
		if (status !== 'ok') log(`state ${instance.action.id} ${status === 'offline' ? OFFLINE : MISSING}`)
		if (instance.userTitle) return
		const title = status === 'offline' ? OFFLINE : status === 'missing' ? MISSING : this.labelOf(instance.settings)
		if (title === instance.sentTitle) return
		instance.sentTitle = title
		instance.action.setTitle(title).catch(fail)
	}
}

type RemoteSettings = { preset?: string }

export class RemoteButtonAction extends ClickAction<RemoteSettings> {
	override readonly manifestId = 'com.haeunga0822.obs-browser-click.remote-button'
	protected targetOf(s: RemoteSettings): Target | undefined {
		return presetById(s.preset ?? '')?.target
	}
	protected labelOf(s: RemoteSettings): string {
		return presetById(s.preset ?? '')?.label ?? ''
	}
}

type CustomSettings = { pageUrl?: string; button?: string; selector?: string }

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
		return customTarget(s)
	}
	protected labelOf(s: CustomSettings): string {
		const t = customTarget(s)
		return t?.selector ?? t?.text ?? ''
	}
}

type Item = { value: string; label: string }

export function presetItems(): { label: string; children: Item[] }[] {
	const groups: { label: string; children: Item[] }[] = []
	for (const p of PRESETS) {
		let group = groups.find((g) => g.label === p.service)
		if (!group) groups.push((group = { label: p.service, children: [] }))
		group.children.push({ value: p.id, label: p.label })
	}
	return groups
}

export async function pageItems(clicker: Clicker): Promise<Item[]> {
	try {
		return (await clicker.listPages()).map((p) => ({ value: p.url, label: p.title || p.url }))
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
