// A SPICE netlist → a circuit diagram, drawn by netlistsvg.
//
// The diagram is the raw circuit, part for part: every element of the
// netlist is one symbol, every node one wire, laid out automatically by ELK.
// It is not meant to be read like a hand-drawn schematic — it is the netlist
// the engine solves, shown as a picture.
//
// netlistsvg reads the JSON netlist format of the Yosys synthesis tool:
// cells, each with named ports and the numbered nets they connect to. Two-
// terminal parts use the analog skin's symbols; the rest — controlled
// sources, behavioural sources, transmission lines — are labelled boxes.

/**
 * How each SPICE element letter is drawn.
 *
 * `type` is the netlistsvg cell type — a symbol of the analog skin, or any
 * other name for a labelled box; `inputs` and `outputs` name its ports, in
 * the order the element's nodes are written, inputs drawn on the left of a
 * box and outputs on the right.
 */
const ELEMENTS = {
  R: { type: 'r_v', inputs: ['A'], outputs: ['B'] },
  C: { type: 'c_v', inputs: ['A'], outputs: ['B'] },
  L: { type: 'l_v', inputs: ['A'], outputs: ['B'] },
  V: { type: 'v', inputs: ['+'], outputs: ['-'] },
  I: { type: 'i', inputs: ['+'], outputs: ['-'] },
  // node order: out+ out- in+ in-
  E: { type: 'VCVS', outputs: ['+', '-'], inputs: ['c+', 'c-'], order: ['+', '-', 'c+', 'c-'] },
  G: { type: 'VCCS', outputs: ['+', '-'], inputs: ['c+', 'c-'], order: ['+', '-', 'c+', 'c-'] },
  F: { type: 'CCCS', inputs: ['+'], outputs: ['-'] },
  H: { type: 'CCVS', inputs: ['+'], outputs: ['-'] },
  B: { type: 'B source', inputs: ['+'], outputs: ['-'] },
  T: { type: 'T line', inputs: ['1+', '1-'], outputs: ['2+', '2-'], order: ['1+', '1-', '2+', '2-'] },
}

/**
 * A number written short, for a label.
 *
 * @param {string} text - A SPICE number.
 * @returns {string} Four significant figures when it is a plain number; the text unchanged otherwise.
 * @pure
 */
function short(text) {
  const v = Number(text)
  return Number.isFinite(v) && /^[-+.\deE]+$/.test(text) ? String(Number(v.toPrecision(4))) : text
}

/**
 * The value label for one element.
 *
 * @param {string} letter - The element letter.
 * @param {string[]} rest - The tokens after its nodes.
 * @returns {string} A short label; at most 48 characters.
 * @pure
 */
function valueOf(letter, rest) {
  let v
  if (letter === 'T') {
    v = rest.map((t) => t.replace(/^(\w+)=(.*)$/, (_, k, x) => `${k}=${short(x)}`)).join(' ')
  } else if (letter === 'F' || letter === 'H') {
    v = `${short(rest[1] || '')} × i(${rest[0] || '?'})`
  } else if (letter === 'B') {
    v = rest.join(' ')
  } else {
    v = rest.map(short).join(' ')
  }
  return v.length > 48 ? `${v.slice(0, 47)}…` : v
}

/**
 * Convert a SPICE netlist to the JSON netlist netlistsvg draws.
 *
 * Comments, control lines and the title are skipped. Each element becomes a
 * cell named as in the netlist, labelled with its value; each node becomes a
 * net. Ground is drawn as its own symbol at every terminal that touches it,
 * as a schematic would, rather than one wire to every part.
 *
 * @param {string} netlist - The netlist text.
 * @returns {{modules: {circuit: {ports: object, cells: object}}}, elements: number}} The JSON netlist, and how many elements it holds.
 * @pure
 */
export function netlistToYosys(netlist) {
  const cells = {}
  const nets = new Map()
  let nextNet = 2
  let grounds = 0
  let elements = 0
  /**
   * The net for a node, connecting a new ground symbol when it is ground.
   *
   * @param {string} node - The node name.
   * @returns {number} Its net number.
   * @mutates the enclosing nets and cells.
   */
  const netOf = (node) => {
    const key = node.toLowerCase()
    if (key === '0' || key === 'gnd') {
      const n = nextNet++
      cells[`gnd${++grounds}`] = { type: 'gnd', port_directions: { A: 'input' }, connections: { A: [n] } }
      return n
    }
    if (!nets.has(key)) nets.set(key, nextNet++)
    return nets.get(key)
  }
  const lines = netlist.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\s;.*$/, '').trim()
    if (!line || line[0] === '*' || line[0] === '.' || line[0] === '+') continue
    const tokens = line.split(/\s+/)
    const name = tokens[0]
    const letter = name[0].toUpperCase()
    const spec = ELEMENTS[letter] || { type: letter, inputs: ['A'], outputs: ['B'] }
    const order = spec.order || [...spec.inputs, ...spec.outputs]
    const nodes = tokens.slice(1, 1 + order.length)
    if (nodes.length < order.length) continue
    const port_directions = {}
    const connections = {}
    order.forEach((port, k) => {
      port_directions[port] = spec.inputs.includes(port) ? 'input' : 'output'
      connections[port] = [netOf(nodes[k])]
    })
    const value = valueOf(letter, tokens.slice(1 + order.length))
    // A box shows only its type, so a box's name and value go in it.
    const boxed = !['r_v', 'c_v', 'l_v', 'v', 'i'].includes(spec.type)
    cells[name] = {
      type: boxed ? `${name} ${spec.type}: ${value}` : spec.type,
      port_directions,
      connections,
      attributes: { value },
    }
    elements++
  }
  return { modules: { circuit: { ports: {}, cells } }, elements }
}

/**
 * Draw a SPICE netlist as an SVG circuit diagram.
 *
 * @param {string} netlist - The netlist text.
 * @param {object} lib - The renderer: `{render, skin}` — netlistsvg's `render` and the text of its analog skin.
 * @returns {Promise<string>} The SVG document.
 * @throws {Error} When the netlist has no elements, or the layout fails.
 * @sideEffect Runs the layout engine.
 */
export async function netlistToSvg(netlist, lib) {
  const { modules, elements } = netlistToYosys(netlist)
  if (!elements) throw new Error('The netlist has no elements to draw.')
  const svg = await lib.render(lib.skin, { modules })
  if (typeof svg !== 'string' || !svg.includes('<svg')) throw new Error('The circuit could not be laid out.')
  return svg
}
