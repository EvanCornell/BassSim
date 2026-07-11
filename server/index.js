#!/usr/bin/env node
// AcouSim production server: one process serving
//   /               the built web app (dist/)
//   /api/simulate   the simulation engine (POST project → results + metrics)
//   /mcp            the MCP endpoint for AI agents (streamable HTTP)
//   /healthz        liveness probe
//
// The engine runs ONLY here — the browser bundle contains no solver code.
//   PORT=8788 ACOUSIM_TOKEN=secret node server/index.js
import { createServer as createHttpServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer as createMcpServer } from '../mcp/acousim.js'
import { runSimulation } from '../src/engine/solver.js'
import { computeMetrics } from '../src/engine/metrics.js'
import { hydrateProject } from '../src/engine/project.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8788)
const TOKEN = process.env.ACOUSIM_TOKEN || ''
const MAX_NPTS = 1024

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
}

const sendJson = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req, limit = 4e6) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > limit) throw new Error('Request body too large')
  }
  return raw ? JSON.parse(raw) : {}
}

// ---- simulation API ----
function handleSimulate(body) {
  const { nodes, edges, settings } = hydrateProject(body)
  settings.npts = Math.min(settings.npts || 512, MAX_NPTS)
  const results = runSimulation(nodes, edges, settings)
  const xmaxNode = nodes.find((n) => n.type === 'driver')
  const metrics = results.ok
    ? computeMetrics(results, { ...settings, xmax: xmaxNode?.data.params.Xmax })
    : null
  return { results, metrics }
}

// ---- static files with SPA fallback ----
function serveStatic(req, res, pathname) {
  let p = normalize(pathname).replace(/^([/\\])+/, '')
  if (!p || p === '.') p = 'index.html'
  let file = join(DIST, p)
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html') // SPA fallback
    if (!existsSync(file)) return sendJson(res, 404, { error: 'dist/ not found — run `npm run build` first' })
  }
  const type = MIME[extname(file)] || 'application/octet-stream'
  const immutable = file.includes(`${join('dist', 'assets')}`) || /-[A-Za-z0-9_-]{8}\./.test(file)
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(file).pipe(res)
}

const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  try {
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, server: 'acousim' })

    if (url.pathname === '/api/simulate') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
      let body
      try { body = await readBody(req) } catch (e) { return sendJson(res, 400, { error: e.message }) }
      try { return sendJson(res, 200, handleSimulate(body)) } catch (e) {
        return sendJson(res, 422, { error: e.message, projectErrors: e.projectErrors })
      }
    }

    if (url.pathname === '/mcp') {
      if (TOKEN && (req.headers.authorization || '') !== `Bearer ${TOKEN}`) {
        res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' })
        return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }))
      }
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'stateless MCP: POST each request' })
      let body
      try { body = await readBody(req) } catch (e) { return sendJson(res, 400, { error: e.message }) }
      const mcp = createMcpServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => { transport.close(); mcp.close() })
      await mcp.connect(transport)
      return transport.handleRequest(req, res, body)
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' })
    return serveStatic(req, res, url.pathname)
  } catch (e) {
    if (!res.headersSent) sendJson(res, 500, { error: e.message })
  }
})

httpServer.listen(PORT, () => {
  console.error(`AcouSim server on http://0.0.0.0:${PORT}  (app: / | api: /api/simulate | mcp: /mcp${TOKEN ? ' [auth]' : ' [OPEN]'})`)
})
