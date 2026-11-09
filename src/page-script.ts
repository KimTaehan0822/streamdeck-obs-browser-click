/** How a button is found inside an OBS browser page. */
export interface Target {
	/** Part of the page URL. */
	url: string
	/** CSS for the candidates; CLICKABLE when absent. */
	selector?: string
	/** The candidate's text (trimmed, runs of spaces made one) must equal this. */
	text?: string
	/** Only candidates inside an element matching this CSS. */
	within?: string
	/** Only candidates in the nearest ancestor of a leaf element whose text equals this (a row title). */
	row?: string
	/** The nth candidate left after filtering; 0 when absent. */
	index?: number
	toggle?: { onClass: string } | { checked: true }
}

export const CLICKABLE = 'button, a, [role=button], input[type=button], input[type=submit], input[type=checkbox]'

export type Mode = 'click' | 'state' | 'list'
export type ListItem = { text: string; index: number }

/**
 * Runs inside the page (sent as source text by pageExpression), so it must not use anything from outside its body.
 * click → 'ok' | 'missing'; state → 'on' | 'off' | 'missing'; list → every clickable with text.
 */
export function runInPage(target: Target, mode: Mode): string | ListItem[] {
	// Same value as CLICKABLE; repeated because this body runs in the page.
	const clickable = 'button, a, [role=button], input[type=button], input[type=submit], input[type=checkbox]'
	const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ')
	// An <input>'s innerText is '' rather than missing, so fall through on empty too.
	const textOf = (e: Element) => norm((e as HTMLElement).innerText || (e as HTMLInputElement).value || e.textContent)

	if (mode === 'list') {
		const seen: Record<string, number> = {}
		const items: ListItem[] = []
		for (const e of Array.from(document.querySelectorAll(clickable))) {
			const text = textOf(e)
			if (!text) continue
			seen[text] = (seen[text] ?? -1) + 1
			items.push({ text, index: seen[text] })
		}
		return items
	}

	const selector = target.selector || clickable
	let found: Element[] = []
	if (target.row !== undefined) {
		const row = norm(target.row)
		for (const label of Array.from(document.querySelectorAll('*'))) {
			if (label.childElementCount !== 0 || norm(label.textContent) !== row) continue
			for (let p = label.parentElement; p; p = p.parentElement) {
				const inRow = Array.from(p.querySelectorAll(selector))
				if (inRow.length) {
					found.push(...inRow)
					break
				}
			}
		}
	} else {
		const scopes: ParentNode[] = target.within ? Array.from(document.querySelectorAll(target.within)) : [document]
		for (const scope of scopes) found.push(...Array.from(scope.querySelectorAll(selector)))
	}
	found = found.filter((e, i) => found.indexOf(e) === i)
	if (target.text !== undefined) {
		const text = norm(target.text)
		found = found.filter((e) => textOf(e) === text)
	}
	const hit = found[target.index ?? 0] as HTMLElement | undefined
	if (!hit) return 'missing'
	if (mode === 'click') {
		hit.click()
		return 'ok'
	}
	const toggle = target.toggle
	if (!toggle) return 'missing'
	if ('checked' in toggle) return (hit as HTMLInputElement).checked ? 'on' : 'off'
	// Class names may carry a build hash (state_on__ca8fd9b8), so a class starting with onClass counts.
	return String(hit.className).split(/\s+/).some((c) => c.startsWith(toggle.onClass)) ? 'on' : 'off'
}

export function pageExpression(target: Target, mode: Mode): string {
	return `(${runInPage.toString()})(${JSON.stringify(target)}, ${JSON.stringify(mode)})`
}
