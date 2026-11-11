import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseCollection, readBrowserSources, sourceNameFor } from '../dist/obs-sources.js'

const COLLECTION = JSON.stringify({
	sources: [
		{ id: 'scene', name: '게임컴', settings: {} },
		{ id: 'browser_source', name: '위플랩 알림', settings: { url: 'https://weflab.com/page/abc' } },
		{ id: 'browser_source', name: '스포티파이', settings: { is_local_file: true, local_file: 'C:/widgets/now playing.html', url: 'https://ignored.example/' } },
		{ id: 'browser_source', name: '빈 소스', settings: {} },
		{ id: 'text_gdiplus_v3', name: '글자', settings: { url: 'https://text.example/' } },
	],
})

test('parseCollection keeps browser sources only', () => {
	const sources = parseCollection(COLLECTION)
	assert.deepEqual(sources.map((s) => s.name), ['위플랩 알림', '스포티파이'])
	assert.equal(sources[1].url, 'file:///C:/widgets/now%20playing.html')
})

test('parseCollection survives a broken file', () => {
	assert.deepEqual(parseCollection('not json'), [])
	assert.deepEqual(parseCollection('{}'), [])
})

test('sourceNameFor matches exact, redirected and hashed pages', () => {
	const sources = parseCollection(COLLECTION)
	assert.equal(sourceNameFor('https://weflab.com/page/abc', sources), '위플랩 알림')
	assert.equal(sourceNameFor('https://weflab.com/page/abc?x=1#top', sources), '위플랩 알림')
	assert.equal(sourceNameFor('file:///C:/widgets/now%20playing.html', sources), '스포티파이')
	assert.equal(sourceNameFor('https://weflab.com/alertlist?mode=remote', sources), undefined)
})

test('sourceNameFor prefers the longest match', () => {
	const sources = [{ name: '넓은', url: 'https://a.example/' }, { name: '좁은', url: 'https://a.example/b' }]
	assert.equal(sourceNameFor('https://a.example/b/c', sources), '좁은')
})

test('readBrowserSources follows the current collection', async () => {
	const appData = mkdtempSync(join(tmpdir(), 'obs-'))
	mkdirSync(join(appData, 'obs-studio', 'basic', 'scenes'), { recursive: true })
	writeFileSync(join(appData, 'obs-studio', 'user.ini'), '[Basic]\r\nSceneCollection=x\r\nSceneCollectionFile=mine.json\r\n')
	writeFileSync(join(appData, 'obs-studio', 'basic', 'scenes', 'mine.json'), COLLECTION)
	assert.equal((await readBrowserSources(appData)).length, 2)
	assert.deepEqual(await readBrowserSources(join(appData, 'nothing')), [])
})
