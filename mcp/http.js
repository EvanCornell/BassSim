#!/usr/bin/env node
// Streamable-HTTP entry point, for remote MCP clients (claude.ai custom
// connectors, ChatGPT, MCP inspector, or any HTTP MCP client).
//
//   PORT=8787 ACOUSIM_TOKEN=secret node mcp/http.js
//
// Stateless mode: every tool takes the full project JSON, so no session
// state is kept — each POST gets a fresh server+transport pair, which also
// makes horizontal scaling trivial. Auth is an optional static bearer token
// (ACOUSIM_TOKEN); unset = open, for local/trusted networks only.
import { createServer as createHttpServer } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from './acousim.js'

const PORT = Number(process.env.PORT || 8787)
const TOKEN = process.env.ACOUSIM_TOKEN || ''
const MCP_PATH = '/mcp'

/**
 * CORS headers allowing any origin.
 *
 * Open deliberately: browser-based MCP clients connect from origins this
 * server cannot know in advance. The security boundary is the bearer token,
 * not the origin.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
}

/**
 * Send a JSON response with the CORS headers attached.
 *
 * @param {import('node:http').ServerResponse} res - The response.
 * @param {number} code - HTTP status.
 * @param {any} body - Serializable payload.
 * @param {Object<string, string>} [headers={}] - Extra headers, merged last so they can override.
 * @returns {void}
 * @sideEffect Writes the response head and ends it.
 */
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS, ...headers })
  res.end(JSON.stringify(body))
}

/**
 * Build a JSON-RPC 2.0 error object.
 *
 * Transport-level failures are reported in the protocol's own error shape,
 * so a client sees a structured error rather than an HTML error page.
 *
 * @param {number} code - JSON-RPC error code.
 * @param {string} message - Human-readable message.
 * @param {string|number|null} [id=null] - Request id being answered.
 * @returns {{jsonrpc: string, error: {code: number, message: string}, id: any}} A JSON-RPC error envelope.
 * @pure
 */
const rpcError = (code, message, id = null) => ({ jsonrpc: '2.0', error: { code, message }, id })

/**
 * Read and parse a JSON request body.
 *
 * Capped at 4 MB and checked as it streams, so an oversized request is
 * rejected before it is buffered rather than after.
 *
 * @param {import('node:http').IncomingMessage} req - The request.
 * @returns {Promise<any|undefined>} The parsed body, or `undefined` for an empty one.
 * @throws {Error} When the body exceeds 4 MB or is not valid JSON.
 * @sideEffect Consumes the request stream.
 */
async function readBody(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 4e6) throw new Error('Request body too large')
  }
  return raw ? JSON.parse(raw) : undefined
}

/**
 * Handle one HTTP request: CORS preflight, health check, auth, then MCP.
 *
 * A fresh server and transport are built per request. That is what makes
 * concurrent calls unable to cross-talk, and is only affordable because
 * every tool takes the full project JSON and keeps no session state.
 *
 * Anything other than POST on the MCP path is refused with 405: SSE streams
 * and session resumption are not offered in stateless mode.
 *
 * @param {import('node:http').IncomingMessage} req - The request.
 * @param {import('node:http').ServerResponse} res - The response.
 * @returns {Promise<void>} Resolves once the response has been handed off.
 * @sideEffect Reads environment configuration, constructs an MCP server per request, and writes the response.
 */
const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  if (url.pathname === '/healthz') return send(res, 200, { ok: true, server: 'acousim-mcp' })
  if (url.pathname !== MCP_PATH) return send(res, 404, { error: `MCP endpoint is ${MCP_PATH}` })

  if (TOKEN) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${TOKEN}`) {
      return send(res, 401, rpcError(-32001, 'Unauthorized: missing or invalid bearer token'),
        { 'WWW-Authenticate': 'Bearer' })
    }
  }

  // Stateless: SSE streams / session resumption aren't offered.
  if (req.method !== 'POST') {
    return send(res, 405, rpcError(-32000, 'Method not allowed: this server is stateless, POST each request'),
      { Allow: 'POST, OPTIONS' })
  }

  let body
  try { body = await readBody(req) } catch (e) { return send(res, 400, rpcError(-32700, `Parse error: ${e.message}`)) }

  // Fresh instances per request so concurrent calls can't cross-talk.
  const server = createServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => { transport.close(); server.close() })
  try {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v)
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (e) {
    if (!res.headersSent) send(res, 500, rpcError(-32603, `Internal error: ${e.message}`))
  }
})

httpServer.listen(PORT, () => {
  console.error(`AcouSim MCP server listening on http://0.0.0.0:${PORT}${MCP_PATH}`
    + (TOKEN ? ' (bearer auth ON)' : ' (NO AUTH — set ACOUSIM_TOKEN before exposing publicly)'))
})
