// Smoke test: spawns the MCP server over stdio and exercises every tool.
// Run: node mcp/test-client.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const ported = {
  name: 'test ported',
  settings: { fmin: 10, fmax: 200, npts: 256, voltage: 28.3, impedance: 4 },
  nodes: [
    { id: 'd1', type: 'driver', params: { label: 'Sub', Fs: 30, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150, Cms: 0.19, Sd: 480, Le: 1.5, Xmax: 15 } },
    { id: 'c1', type: 'chamber', params: { label: 'Box', volume: 50, length: 40 } },
    { id: 'p1', type: 'waveguide', params: { label: 'Port', S1: 100, S2: 100, length: 40, flare: 'conical' } },
  ],
  edges: [
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
    { source: 'c1', sourceHandle: 'out', target: 'p1', targetHandle: 'throat' },
  ],
}

const bad = { ...ported, nodes: ported.nodes.filter((n) => n.type !== 'driver') }

const client = new Client({ name: 'smoke', version: '0.0.0' })
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp/server.js'] }))

let failures = 0
const check = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`)
  if (!cond) failures++
}
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  return { r, text: r.content[0].text }
}

{
  const tools = (await client.listTools()).tools.map((t) => t.name).sort()
  check('tool list', JSON.stringify(tools) === JSON.stringify(['design_guide', 'get_curve', 'simulate', 'sweep_parameter', 'validate']), tools.join(','))
}
{
  const { text } = await call('design_guide')
  check('design_guide', text.includes('Topology semantics'))
}
{
  const { text } = await call('validate', { project: ported })
  const j = JSON.parse(text)
  check('validate ok', j.ok && j.warnings.some((w) => w.includes('Mouth is unconnected')), JSON.stringify(j.warnings))
}
{
  const { r, text } = await call('validate', { project: bad })
  check('validate catches broken project', r.isError === true && text.includes('not a node id'), text)
}
{
  const { text } = await call('simulate', { project: ported })
  const j = JSON.parse(text)
  const fb = parseFloat(j.metrics.fb_tuning)
  check('simulate metrics', j.ok && fb > 20 && fb < 40, `fb=${j.metrics.fb_tuning}, f3=${j.metrics.f3}`)
  check('simulate curves', j.curves.spl_db.length >= 40 && j.curves.impedance_ohm.length >= 40)
  check('simulate velocity summary', !!j.max_air_velocity, JSON.stringify(j.max_air_velocity))
}
{
  const { text } = await call('get_curve', { project: ported, quantity: 'velocity', node: 'Port', points: 20, fmin: 15, fmax: 60 })
  const j = JSON.parse(text)
  const inWindow = j.data.every(([f]) => f >= 14 && f <= 62)
  check('get_curve velocity by label + window', j.data.length >= 15 && inWindow, `${j.data.length} pts, node=${j.node}`)
}
{
  const { r } = await call('get_curve', { project: ported, quantity: 'velocity' })
  check('get_curve missing node errors', r.isError === true)
}
{
  const { text } = await call('sweep_parameter', { project: ported, node: 'p1', param: 'length', from: 20, to: 80, steps: 7 })
  const j = JSON.parse(text)
  const fbs = j.rows.map((r) => r.fb_hz)
  const monotonic = fbs.every((v, i) => i === 0 || v < fbs[i - 1])
  check('sweep port length: fb falls monotonically', j.rows.length === 7 && monotonic, fbs.join(' → '))
}
{
  const { text } = await call('sweep_parameter', { project: ported, param: 'voltage', values: [10, 20, 40] })
  const j = JSON.parse(text)
  const [a, b, c] = j.rows.map((r) => r.max_excursion_mm)
  check('sweep voltage: excursion scales linearly', Math.abs(b / a - 2) < 0.01 && Math.abs(c / a - 4) < 0.01, `${a}/${b}/${c} mm`)
}
{
  const res = await client.readResource({ uri: 'acousim://guide' })
  check('guide resource', res.contents[0].text.includes('Project format'))
}

await client.close()
console.log(failures ? `\n${failures} FAILURES` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
