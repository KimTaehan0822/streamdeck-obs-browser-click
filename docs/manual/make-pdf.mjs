// Prints manual.<lang>.html to PDF with Edge (Noto Sans KR/JP must be installed). Run: node docs/manual/make-pdf.mjs
import { execFileSync } from 'node:child_process'
import { rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const names = {
	ko: 'OBS Browser Click 스트림덱 플러그인 사용설명서',
	en: 'OBS Browser Click Stream Deck Plugin Manual (English)',
	ja: 'OBS Browser Click Stream Deck プラグイン 取扱説明書 (日本語)',
}
for (const [lang, name] of Object.entries(names)) {
	const out = join(here, `${name}.pdf`)
	rmSync(out, { force: true })
	execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${out}`, pathToFileURL(join(here, `manual.${lang}.html`)).href], { stdio: 'ignore' })
	console.log(statSync(out).size, name)
}
