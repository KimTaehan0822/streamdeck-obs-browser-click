import streamDeck from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import { buttonItems, createClicker, CustomClickAction, pageItems, presetItems, RemoteButtonAction } from './actions.js'

// The Stream Deck app keeps no console output; send errors to the plugin's logs folder instead.
console.error = (...args: unknown[]) => streamDeck.logger.error(args.map(String).join(' '))
console.info = (...args: unknown[]) => streamDeck.logger.info(args.map(String).join(' '))

export const DEFAULT_PORT = 9222
let port = DEFAULT_PORT
const clicker = createClicker(() => port)

function applyGlobal(settings: JsonObject): void {
	const n = Number(String(settings.port ?? '').trim())
	port = Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT
}

// The settings page asks with sendToPlugin { event } (sdpi datasource) or { event: 'getButtons', pageUrl } after a page is picked.
streamDeck.ui.onSendToPlugin(async (ev) => {
	const payload = (ev.payload ?? {}) as { event?: unknown; pageUrl?: unknown }
	let items: unknown
	if (payload.event === 'getPresets') items = presetItems()
	else if (payload.event === 'getPages') items = await pageItems(clicker)
	else if (payload.event === 'getButtons') {
		const settings: JsonObject = await ev.action.getSettings().catch(() => ({}))
		const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : settings.pageUrl
		items = await buttonItems(clicker, typeof pageUrl === 'string' ? pageUrl : '')
	} else return
	streamDeck.ui.sendToPropertyInspector({ event: payload.event, items } as JsonObject).catch(() => {})
})

streamDeck.settings.onDidReceiveGlobalSettings((ev) => applyGlobal(ev.settings))
streamDeck.actions.registerAction(new RemoteButtonAction(clicker))
streamDeck.actions.registerAction(new CustomClickAction(clicker))
await streamDeck.connect()
applyGlobal(await streamDeck.settings.getGlobalSettings())
