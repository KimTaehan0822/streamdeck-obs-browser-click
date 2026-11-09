// A tiny DOM: enough of querySelectorAll/innerText/className/parentElement for runInPage.
// Selectors: comma lists of `tag`, `#id`, `.class`, `[attr=value]`, combined (`button.ToggleView`), and `*`.
function matchesSimple(el, sel) {
	sel = sel.trim()
	if (sel === '*') return true
	const m = /^([a-z]+)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+=[\w-]+\])*)$/i.exec(sel)
	if (!m) throw new Error('fake-dom cannot parse ' + sel)
	if (m[1] && m[1].toLowerCase() !== el.tag) return false
	for (const part of m[2].match(/#[\w-]+|\.[\w-]+|\[[\w-]+=[\w-]+\]/g) ?? []) {
		if (part[0] === '#' && el.id !== part.slice(1)) return false
		if (part[0] === '.' && !el.className.split(/\s+/).includes(part.slice(1))) return false
		if (part[0] === '[') {
			const [k, v] = part.slice(1, -1).split('=')
			if (el.attrs[k] !== v) return false
		}
	}
	return true
}

export class El {
	constructor(tag, { text = '', id = '', className = '', checked = false, attrs = {} } = {}, children = []) {
		Object.assign(this, { tag, ownText: text, id, className, checked, attrs, children, clicks: 0, parentElement: null })
		for (const c of children) c.parentElement = this
	}
	get innerText() {
		return [this.ownText, ...this.children.map((c) => c.innerText)].filter(Boolean).join(' ')
	}
	get textContent() {
		return this.innerText
	}
	get childElementCount() {
		return this.children.length
	}
	descendants() {
		return this.children.flatMap((c) => [c, ...c.descendants()])
	}
	querySelectorAll(selector) {
		const parts = selector.split(',')
		return this.descendants().filter((el) => parts.some((p) => matchesSimple(el, p)))
	}
	getBoundingClientRect() {
		return { width: 0, height: 0 }
	}
	click() {
		this.clicks++
	}
}

export const el = (tag, opts, children) => new El(tag, opts, children)

/** Installs `root` as globalThis.document while fn runs. */
export function withDocument(root, fn) {
	const before = globalThis.document
	globalThis.document = root
	try {
		return fn()
	} finally {
		globalThis.document = before
	}
}
