// A stand-in for OBS's remote debugging port: /json/list plus a WebSocket that answers Runtime.evaluate.
import http from 'node:http'
import { WebSocketServer } from 'ws'

/** reply(message) returns the CDP response body (without id), or undefined to stay silent. */
export async function fakeCdp({ targets = [], reply = () => ({ result: { result: { value: 'ok' } } }) } = {}) {
	const received = []
	const sockets = new Set()
	const server = http.createServer((req, res) => {
		if (req.url !== '/json/list') return res.writeHead(404).end()
		res.writeHead(200, { 'content-type': 'application/json' })
		res.end(JSON.stringify(targets.map((t) => ({ ...t, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${t.id}` }))))
	})
	const wss = new WebSocketServer({ server })
	wss.on('connection', (ws) => {
		sockets.add(ws)
		ws.on('close', () => sockets.delete(ws))
		ws.on('message', (data) => {
			const msg = JSON.parse(String(data))
			received.push(msg)
			const body = reply(msg)
			if (body) ws.send(JSON.stringify({ id: msg.id, ...body }))
		})
	})
	await new Promise((r) => server.listen(0, '127.0.0.1', r))
	const port = server.address().port
	return {
		port,
		received,
		openSockets: () => sockets.size,
		wsUrl: (id) => `ws://127.0.0.1:${port}/devtools/page/${id}`,
		close: () => new Promise((r) => { wss.close(); for (const s of sockets) s.terminate(); server.close(r) }),
	}
}
