// HTTP smoke test: boots mcp/http.js with a token, then exercises it with the
// real Streamable-HTTP MCP client plus raw fetch checks for auth/health/CORS.
// Run: node mcp/test-http.mjs
import { spawn } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const PORT = 8799
const TOKEN = 'test-secret'
const BASE = `http://127.0.0.1:${PORT}`

const proc = spawn('node', ['mcp/http.js'], {
  env: { ...process.env, PORT: String(PORT), ACOUSIM_TOKEN: TOKEN },
  stdio: ['ignore', 'inherit', 'inherit'],
})

let failures = 0
/**
 * Assert one condition and record the outcome.
 *
 * @param {string} name - Check description.
 * @param {any} cond - Truthy to pass.
 * @param {string} [info=''] - Extra detail appended to the result line.
 * @returns {void}
 * @mutates Bumps the module-level failure counter.
 * @sideEffect Prints the result line.
 */
const check = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`)
  if (!cond) failures++
}

/**
 * Poll the health endpoint until the server under test answers.
 *
 * The server is spawned as a child process, so the test cannot know when it
 * has bound its port; polling is what makes the suite deterministic rather
 * than racing a fixed sleep.
 *
 * @param {number} [tries=40] - Attempts before giving up.
 * @returns {Promise<boolean>} True once the server is healthy, false if it never became ready.
 * @sideEffect Issues repeated HTTP requests and waits between them.
 */
async function waitForHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`)
      if (r.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('server did not become healthy')
}

const ported = {
  name: 'http ported',
  settings: { fmin: 10, fmax: 200, npts: 200, voltage: 28.3 },
  nodes: [
    { id: 'd1', type: 'driver', params: { label: 'Sub', Fs: 30, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150, Cms: 0.19, Sd: 480, Le: 1.5, Xmax: 15 } },
    { id: 'c1', type: 'chamber', params: { label: 'Box', volume: 50 } },
    { id: 'p1', type: 'waveguide', params: { label: 'Port', S1: 100, S2: 100, length: 40 } },
  ],
  edges: [
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
    { source: 'c1', sourceHandle: 'out', target: 'p1', targetHandle: 'throat' },
  ],
}

try {
  await waitForHealth()
  check('healthz', true)

  // CORS preflight
  {
    const r = await fetch(`${BASE}/mcp`, { method: 'OPTIONS' })
    check('CORS preflight', r.status === 204 && r.headers.get('access-control-allow-origin') === '*')
  }
  // Auth rejects a bad token
  {
    const r = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    check('auth rejects bad token', r.status === 401, `status ${r.status}`)
  }
  // Authenticated MCP client round-trip
  {
    const client = new Client({ name: 'http-smoke', version: '0.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    })
    await client.connect(transport)

    const tools = (await client.listTools()).tools.map((t) => t.name)
    check('tools/list over HTTP', tools.length === 9 && tools.includes('build_enclosure'), `${tools.length} tools`)

    const sim = await client.callTool({ name: 'simulate', arguments: { project: ported } })
    const j = JSON.parse(sim.content[0].text)
    const fb = parseFloat(j.metrics.fb_tuning)
    check('simulate over HTTP', j.ok && fb > 20 && fb < 40, `fb=${j.metrics.fb_tuning}`)

    const built = await client.callTool({
      name: 'build_enclosure',
      arguments: { topology: 'ported', driver: { db: 'UM12' }, volume: 60, tuning: 30 },
    })
    const bj = JSON.parse(built.content[0].text)
    check('build_enclosure over HTTP', Math.abs(parseFloat(bj.summary.metrics.fb_tuning) - 30) < 0.3,
      `fb=${bj.summary.metrics.fb_tuning}`)

    // concurrent requests must not cross-talk (fresh server per request)
    const [a, b] = await Promise.all([
      client.callTool({ name: 'validate', arguments: { project: ported } }),
      client.callTool({ name: 'driver_search', arguments: { query: 'sundown' } }),
    ])
    check('concurrent calls isolated',
      JSON.parse(a.content[0].text).ok === true && JSON.parse(b.content[0].text).count > 0)

    await client.close()
  }
} catch (e) {
  check(`fatal: ${e.message}`, false)
} finally {
  proc.kill('SIGTERM')
}

console.log(failures ? `\n${failures} FAILURES` : '\nAll HTTP checks passed')
process.exit(failures ? 1 : 0)
