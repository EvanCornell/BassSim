// A small builder for SPICE netlists.
//
// Element and node names are generated, never taken from the graph, so
// nothing a user types can reach the netlist as syntax. Each element may carry
// a comment naming the graph node it came from, which is what makes a netlist
// readable when it is exported or debugged.
//
// Domain conventions (impedance analogy): acoustic nets carry pressure (Pa) as
// voltage and volume velocity (m³/s) as current; mechanical nets force (N) and
// velocity (m/s); electrical nets volts and amps. Node `0` is the common
// reference — ambient pressure, rest, and electrical ground.

/**
 * Acoustic resistance, Pa·s/m³, put in series with every acoustic element
 * that is a short circuit at DC (inductors, transmission lines, sense
 * sources). Without it a loop of such elements — two ducts in parallel, two
 * radiators on one junction — makes SPICE's DC operating point singular. It
 * is about a millionth of any acoustic impedance in a loudspeaker model.
 */
export const DC_TIE = 1e-3

/**
 * Format a number for a netlist.
 *
 * @param {number} v - The value.
 * @returns {string} Twelve significant figures, exponent form where needed.
 * @pure
 */
export function fmt(v) {
  if (!Number.isFinite(v)) throw new Error(`non-finite netlist value ${v}`)
  return Number(v.toPrecision(12)).toString()
}

/**
 * Start an empty netlist.
 *
 * @param {string} title - The title line.
 * @returns {object} The builder: `node`, `add`, `comment`, `text`, and `lines` for inspection.
 * @pure
 */
export function createNetlist(title) {
  const lines = [`* ${String(title).replace(/[\r\n]+/g, ' ')}`]
  const counters = {}
  let nodes = 0
  return {
    lines,
    /**
     * A fresh node name.
     *
     * @returns {string} The name.
     * @mutates the builder's node counter.
     */
    node() {
      nodes += 1
      return `n${nodes}`
    },
    /**
     * Add one element.
     *
     * @param {string} letter - SPICE element letter (R, L, C, V, E, F, H, T).
     * @param {string[]} pins - Node names, and for H/F the controlling source name last.
     * @param {string} value - Everything after the pins: a value, or keyword parameters.
     * @param {string} [note] - A comment appended to the line.
     * @returns {string} The element's name.
     * @mutates the builder's lines and counters.
     */
    add(letter, pins, value, note) {
      counters[letter] = (counters[letter] || 0) + 1
      const name = `${letter}${counters[letter]}`
      lines.push(`${name} ${pins.join(' ')} ${value}${note ? ` ; ${String(note).replace(/[\r\n]+/g, ' ')}` : ''}`)
      return name
    },
    /**
     * Add a comment line.
     *
     * @param {string} text - The comment.
     * @returns {void}
     * @mutates the builder's lines.
     */
    comment(text) {
      lines.push(`* ${String(text).replace(/[\r\n]+/g, ' ')}`)
    },
    /**
     * The netlist so far, as text.
     *
     * @returns {string} Newline-joined lines.
     * @reads the builder's lines.
     */
    text() {
      return lines.join('\n')
    },
  }
}

/**
 * Add a series resistor.
 *
 * @param {object} nl - A netlist builder.
 * @param {string} a - One node.
 * @param {string} b - The other node.
 * @param {number} R - Resistance.
 * @param {string} [note] - Comment.
 * @returns {string} The element name.
 * @mutates nl.
 */
export function resistor(nl, a, b, R, note) {
  return nl.add('R', [a, b], fmt(R), note)
}

/**
 * Add a 0 V sense source followed by the DC tie, from `a` to a new node.
 *
 * Current through the source, `i(name)`, is the flow from `a` onward. The tie
 * keeps loops of such sources from making the DC solution singular.
 *
 * @param {object} nl - A netlist builder.
 * @param {string} a - The node the flow leaves.
 * @param {string} [note] - Comment.
 * @param {string} [to] - An existing node to end on; a new one by default.
 * @returns {{name: string, out: string}} The source's name and the node beyond the tie.
 * @mutates nl.
 */
export function sense(nl, a, note, to) {
  const mid = nl.node()
  const out = to || nl.node()
  const name = nl.add('V', [a, mid], 'DC 0', note)
  resistor(nl, mid, out, DC_TIE)
  return { name, out }
}
