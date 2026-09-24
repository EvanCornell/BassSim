// Splitting one frequency sweep into several, to run side by side.
//
// Every frequency of an AC analysis is solved on its own, so a sweep of N
// points can run as k sweeps of about N/k points on k engines and be joined
// back in order. Each piece repeats the circuit's setup (parsing, the
// operating point) — about as long as a few dozen points — so a piece is
// never made smaller than `MIN_POINTS`.

import { decadeStep } from './compile.js'

/** Fewest points one piece of a split sweep carries. */
export const MIN_POINTS = 16

/**
 * A number written for an `.ac` line, exactly.
 *
 * @param {number} v - The value.
 * @returns {string} Fifteen significant figures.
 * @pure
 */
const num = (v) => Number(Number(v).toPrecision(15)).toString()

/**
 * The AC analysis line of a netlist, parsed.
 *
 * @param {string} netlist - A netlist.
 * @returns {{line: string, scale: 'lin'|'dec', n: number, fstart: number, fstop: number}|null} The line and its fields — `n` is the point count for `lin`, points per decade for `dec` — or `null` when the netlist has no `.ac lin` or `.ac dec` line.
 * @pure
 */
export function acLine(netlist) {
  const m = /^\.ac\s+(lin|dec)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/im.exec(netlist)
  if (!m) return null
  const [line, scale, n, fstart, fstop] = m
  const v = [n, fstart, fstop].map(Number)
  if (v.some((x) => !Number.isFinite(x)) || v[0] < 1 || v[1] <= 0) return null
  return { line, scale: scale.toLowerCase(), n: Math.round(v[0]), fstart: v[1], fstop: v[2] }
}

/**
 * How many points an AC line makes.
 *
 * @param {{scale: string, n: number, fstart: number, fstop: number}} ac - From `acLine`.
 * @returns {number} The count; for `dec`, exact when the top is on the grid of steps, as `compileProject` writes it.
 * @pure
 */
export function acCount(ac) {
  if (ac.scale === 'lin') return ac.n
  if (!(ac.fstop > ac.fstart)) return 1
  return Math.round(ac.n * Math.log10(ac.fstop / ac.fstart)) + 1
}

/**
 * A netlist's sweep split into pieces, each a netlist of its own.
 *
 * The pieces cover consecutive points of the original sweep, the same
 * frequencies in the same order. A logarithmic piece starts and stops on the
 * sweep's grid of steps, which is exact when the whole sweep's top is on
 * that grid too, as `compileProject` makes it; the last piece keeps the
 * original stop, so it ends where the whole sweep would.
 *
 * @param {string} netlist - A netlist with an `.ac lin` or `.ac dec` line.
 * @param {number} parts - Pieces wanted.
 * @returns {string[]} The pieces — the netlist itself, alone, when it has no AC line or too few points to split.
 * @pure
 */
export function splitAc(netlist, parts) {
  const ac = acLine(netlist)
  if (!ac) return [netlist]
  const total = acCount(ac)
  const k = Math.min(Math.floor(parts) || 1, Math.floor(total / MIN_POINTS))
  if (k <= 1) return [netlist]
  const out = []
  for (let j = 0; j < k; j++) {
    const i0 = Math.round((j * total) / k)
    const i1 = Math.round(((j + 1) * total) / k) - 1
    let line
    if (ac.scale === 'lin') {
      const df = total > 1 ? (ac.fstop - ac.fstart) / (total - 1) : 0
      const hi = j === k - 1 ? ac.fstop : ac.fstart + i1 * df
      line = `.ac lin ${i1 - i0 + 1} ${num(ac.fstart + i0 * df)} ${num(hi)}`
    } else {
      const lo = j === 0 ? num(ac.fstart) : decadeStep(ac.fstart, ac.n, i0)
      line = `.ac dec ${ac.n} ${lo} ${j === k - 1 ? num(ac.fstop) : decadeStep(ac.fstart, ac.n, i1, true)}`
    }
    out.push(netlist.replace(ac.line, line))
  }
  return out
}

/**
 * Pieces of a split sweep joined back into one result.
 *
 * @param {Array<{scale: number[], vectors: Map<string, object>}>} parts - The pieces' results, in sweep order.
 * @returns {{scale: number[], vectors: Map<string, object>}} One result, as a single run returns it.
 * @pure
 */
export function mergeAc(parts) {
  if (parts.length === 1) return parts[0]
  const scale = parts.flatMap((p) => Array.from(p.scale))
  const vectors = new Map()
  for (const name of parts[0].vectors.keys()) {
    const first = parts[0].vectors.get(name)
    /**
     * One vector's pieces joined end to end.
     *
     * @param {Function} pick - Piece value → the array to join.
     * @returns {Float64Array} The joined array.
     * @pure
     */
    const join = (pick) => {
      const arr = new Float64Array(scale.length)
      let at = 0
      for (const p of parts) {
        const a = pick(p.vectors.get(name))
        arr.set(a, at)
        at += a.length
      }
      return arr
    }
    vectors.set(name, first.re ? { re: join((v) => v.re), im: join((v) => v.im) } : join((v) => v))
  }
  return { scale, vectors }
}
