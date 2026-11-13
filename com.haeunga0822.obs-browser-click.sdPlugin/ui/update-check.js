// New-release notice: asks GitHub for the latest release at most once a day and, when it is newer than this
// plugin, adds a line with a "release page" button at the bottom of the settings screen.
// The same file is copied into every plugin and app of this author; keep the copies identical.
;(() => {
	const DAY = 86_400_000

	/** Numbers of "v1.2.3.4+build": the first three, missing ones 0; null when it does not start with a number. */
	function parts(version) {
		const p = String(version).replace(/^v/i, '').split('+')[0].split('.').slice(0, 3).map((n) => parseInt(n, 10))
		if (Number.isNaN(p[0])) return null
		while (p.length < 3) p.push(0)
		return p.map((n) => (Number.isNaN(n) ? 0 : n))
	}

	function isNewer(latestTag, current) {
		const a = parts(latestTag)
		const b = parts(current)
		if (!a || !b) return false
		for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
		return false
	}

	/** { tag, url } of the latest release, or null (offline, rate limit, no release). Failures are cached too. */
	async function latest(repo, now = Date.now()) {
		const key = `update-check:${repo}`
		try {
			const saved = JSON.parse(localStorage.getItem(key))
			if (saved && now - saved.at < DAY) return saved.tag ? { tag: saved.tag, url: saved.url } : null
		} catch {}
		let result = null
		try {
			const res = await fetch(`https://api.github.com/repos/KimTaehan0822/${repo}/releases/latest`, {
				headers: { Accept: 'application/vnd.github+json' },
			})
			if (res.ok) {
				const r = await res.json()
				if (typeof r.tag_name === 'string' && typeof r.html_url === 'string') result = { tag: r.tag_name, url: r.html_url }
			}
		} catch {}
		try {
			localStorage.setItem(key, JSON.stringify({ at: now, tag: result?.tag ?? null, url: result?.url ?? null }))
		} catch {}
		return result
	}

	/** Stream Deck settings screen: the plugin version comes from the connection info; the texts are in <span>s
	 * so each plugin's own translator can swap them. */
	async function mountPluginNotice(repo, text) {
		try {
			const client = SDPIComponents.streamDeckClient
			const { info } = await client.getConnectionInfo()
			const current = (typeof info === 'string' ? JSON.parse(info) : info)?.plugin?.version
			const release = await latest(repo)
			if (!current || !release || !isNewer(release.tag, current)) return
			const box = document.createElement('div')
			box.className = 'update-notice'
			box.style.cssText = 'margin:16px 0 8px;padding:8px 10px;border-left:3px solid #3a8ee2;background:#2d2d2d;color:#d8d8d8;font-size:9pt;line-height:1.4'
			const label = document.createElement('span')
			label.textContent = text.available
			const tag = document.createElement('b')
			tag.textContent = ` ${release.tag} `
			const button = document.createElement('button')
			button.type = 'button'
			button.style.cssText = 'margin-top:6px;display:block;cursor:pointer'
			const buttonText = document.createElement('span')
			buttonText.textContent = text.open
			button.append(buttonText)
			button.addEventListener('click', () => client.send('openUrl', { url: release.url }))
			box.append(label, tag, button)
			document.body.append(box)
		} catch {}
	}

	globalThis.UpdateCheck = { isNewer, latest, mountPluginNotice }
})()
