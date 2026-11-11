import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** A browser source as saved in OBS's scene collection; the debug port only knows page titles, not these names. */
export interface BrowserSource {
	name: string
	url: string
}

type Saved = { id?: string; name?: string; settings?: { url?: string; is_local_file?: boolean; local_file?: string } }

export function parseCollection(json: string): BrowserSource[] {
	try {
		const { sources = [] } = JSON.parse(json) as { sources?: Saved[] }
		return sources.flatMap(({ id, name, settings: s }) => {
			const url = s?.is_local_file && s.local_file ? pathToFileURL(s.local_file).href : s?.url
			return id === 'browser_source' && name && url ? [{ name, url }] : []
		})
	} catch {
		return []
	}
}

const clean = (url: string) => {
	if (!URL.canParse(url)) return url
	const u = new URL(url)
	u.hash = ''
	return u.href
}

/** The source showing this page: same address, or the longest source address it continues (a redirect may add a query). */
export function sourceNameFor(pageUrl: string, sources: BrowserSource[]): string | undefined {
	const page = clean(pageUrl)
	return sources
		.map((s) => ({ name: s.name, url: clean(s.url) }))
		.filter((s) => page.startsWith(s.url))
		.sort((a, b) => b.url.length - a.url.length)[0]?.name
}

/** Browser sources of the current scene collection; empty when OBS's files can't be read, so the list falls back to page titles. */
export async function readBrowserSources(appData = process.env.APPDATA ?? ''): Promise<BrowserSource[]> {
	const base = join(appData, 'obs-studio')
	for (const ini of ['user.ini', 'global.ini']) {
		try {
			const file = /^SceneCollectionFile=(.+)$/m.exec(await readFile(join(base, ini), 'utf8'))?.[1].trim()
			if (file) return parseCollection(await readFile(join(base, 'basic', 'scenes', file.replace(/(\.json)?$/, '.json')), 'utf8'))
		} catch {
			// older OBS keeps this in global.ini
		}
	}
	return []
}
