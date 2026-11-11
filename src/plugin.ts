import streamDeck from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import { setupShortcuts } from './shortcut.js'
import { buttonItems, createClicker, CustomClickAction, pageItems, presetItemsFor, restoreScroll, saveScroller, SERVICE_ACTIONS, ServiceRemoteAction, shotItem } from './actions.js'

// The Stream Deck app keeps no console output; send errors to the plugin's logs folder instead.
console.error = (...args: unknown[]) => streamDeck.logger.error(args.map(String).join(' '))
console.info = (...args: unknown[]) => streamDeck.logger.info(args.map(String).join(' '))

export const DEFAULT_PORT = 9222
let port = DEFAULT_PORT
const clicker = createClicker(() => port)
const custom = new CustomClickAction(clicker)

function applyGlobal(settings: JsonObject): void {
	const n = Number(String(settings.port ?? '').trim())
	port = Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT
}

// The settings page asks with sendToPlugin { event } (sdpi datasource) or { event: 'getButtons', pageUrl } after a page is picked.
streamDeck.ui.onSendToPlugin(async (ev) => {
	const payload = (ev.payload ?? {}) as { event?: unknown; pageUrl?: unknown }
	let items: unknown
	if (payload.event === 'getPresets') items = presetItemsFor(ev.action.manifestId)
	else if (payload.event === 'getPages') items = await pageItems(clicker)
	else if (payload.event === 'getButtons') {
		const settings: JsonObject = await ev.action.getSettings().catch(() => ({}))
		const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : settings.pageUrl
		items = await buttonItems(clicker, typeof pageUrl === 'string' ? pageUrl : '')
	} else if (payload.event === 'getShot') {
		const shot = await shotItem(clicker, typeof payload.pageUrl === 'string' ? payload.pageUrl : '')
		return void streamDeck.ui.sendToPropertyInspector({ event: 'getShot', ...shot } as JsonObject).catch(() => {})
	} else if (payload.event === 'saveScroller') {
		const { x, y } = payload as { x?: unknown; y?: unknown }
		const saved = await saveScroller(clicker, ev.action, Number(x), Number(y))
		if (saved) await custom.settingsChanged(ev.action.id, saved)
		return
	} else if (payload.event === 'restoreScroll') {
		const result = await restoreScroll(clicker, await ev.action.getSettings().catch(() => ({})))
		return void streamDeck.ui.sendToPropertyInspector({ event: 'restoreScroll', result }).catch(() => {})
	} else if (payload.event === 'setupShortcut') {
		const result = await setupShortcuts(port)
		return void streamDeck.ui.sendToPropertyInspector({ event: 'setupShortcut', ...result } as JsonObject).catch(() => {})
	} else return
	streamDeck.ui.sendToPropertyInspector({ event: payload.event, items } as JsonObject).catch(() => {})
})

streamDeck.settings.onDidReceiveGlobalSettings((ev) => applyGlobal(ev.settings))
for (const { service } of SERVICE_ACTIONS) streamDeck.actions.registerAction(new ServiceRemoteAction(clicker, service))
streamDeck.actions.registerAction(custom)
await streamDeck.connect()
applyGlobal(await streamDeck.settings.getGlobalSettings())
