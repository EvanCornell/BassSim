// Contract tests for src/spice/schematic.js — a netlist drawn as a diagram.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { netlistToYosys, netlistToSvg } from '../../src/spice/schematic.js'
import { prepareProject } from '../../src/engine/pipeline.js'
import { compileProject } from '../../src/spice/compile.js'

const require = createRequire(import.meta.url)
const LIB = {
  render: require('netlistsvg').render,
  skin: fs.readFileSync(require.resolve('netlistsvg/lib/analog.svg'), 'utf8'),
}

const NET = `title line
* a comment
.options rshunt=1e12
V1 in 0 DC 0 AC 1 0 ; source
R1 in mid 4.1
C1 mid 0 1e-6
L1 mid out 0.00137
E1 a 0 mid 0 2
H1 b 0 V1 22.4
T1 out 0 far 0 Z0=5430.61333333 TD=0.000116279069767
B1 far 0 V=4625*i(V1)*abs(i(V1))
.ac dec 10 10 1000
.end`

// CONTRACT (netlistToYosys): every element is a cell named as in the
// netlist; control lines and comments are not; ground is its own symbol at
// every terminal on it.
test('netlistToYosys: one cell per element, ground at every terminal', () => {
  const { modules, elements } = netlistToYosys(NET)
  const cells = modules.circuit.cells
  assert.equal(elements, 8)
  const parts = Object.keys(cells).filter((k) => !k.startsWith('gnd'))
  assert.deepEqual(parts.sort(), ['B1', 'C1', 'E1', 'H1', 'L1', 'R1', 'T1', 'V1'])
  const grounds = Object.keys(cells).filter((k) => k.startsWith('gnd'))
  assert.equal(grounds.length, 8, 'V1, C1, E1 ×2, H1, T1 ×2, B1')
  const gnets = grounds.map((g) => cells[g].connections.A[0])
  assert.equal(new Set(gnets).size, gnets.length, 'each ground symbol on its own wire')
  // two-terminal parts share nets through their nodes
  assert.equal(cells.R1.connections.B[0], cells.C1.connections.A[0])
  assert.equal(cells.C1.connections.A[0], cells.L1.connections.A[0])
  assert.equal(cells.R1.type, 'r_v')
  assert.equal(cells.R1.attributes.value, '4.1')
  assert.equal(cells.V1.type, 'v')
  // boxes carry their name and value in their label
  assert.match(cells.T1.type, /^T1 T line: Z0=5431 TD=0\.0001163$/)
  assert.match(cells.H1.type, /^H1 CCVS: 22\.4 × i\(V1\)$/)
  assert.deepEqual(Object.keys(cells.E1.connections), ['+', '-', 'c+', 'c-'])
  assert.equal(cells.E1.connections['c+'][0], cells.R1.connections.B[0])
})

// CONTRACT (netlistToSvg): an SVG with every element drawn; nothing to draw
// is an error.
test('netlistToSvg: every element drawn', async () => {
  const svg = await netlistToSvg(NET, LIB)
  assert.match(svg, /^<svg/)
  for (const k of ['V1', 'R1', 'C1', 'L1', 'E1', 'H1', 'T1', 'B1']) assert.ok(svg.includes(`id="cell_${k}"`), k)
  await assert.rejects(netlistToSvg('title\n.end', LIB), /no elements/)
})

// CONTRACT: a compiled project draws, element for element.
test('a compiled project draws every element of its netlist', async () => {
  const { project } = prepareProject({
    schemaVersion: 3,
    nodes: [
      { id: 'd', type: 'driver', params: { Fs: 30, Qts: 0.45, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150, Cms: 0.19, Sd: 480, Le: 1.5, LeExp: 0.7, Xmax: 10, Rms: 4 } },
      { id: 'c', type: 'chamber', params: { volume: 60, length: 40 } },
    ],
    edges: [{ source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }],
  })
  const { netlist } = compileProject(project, { fmin: 10, fmax: 1000, npts: 50 })
  const { elements } = netlistToYosys(netlist)
  const count = netlist.split('\n').slice(1).filter((l) => /^[A-Za-z]/.test(l)).length
  assert.equal(elements, count)
  const svg = await netlistToSvg(netlist, LIB)
  assert.equal((svg.match(/id="cell_(?!gnd)/g) || []).length, count)
})
