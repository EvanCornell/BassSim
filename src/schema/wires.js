// The electrical wiring: channels, driver terminals and the cables between them.
//
// A project's `wiring` holds its channels, the cables (`wires`) and where each
// driver sits in the Wiring window (`layout`). A cable joins two terminals,
// and terminals joined by cables — directly or through others — are one net.
// Nothing else is assumed: any driver may be wired to any channel in any
// arrangement, and the simulation solves whatever circuit results.
//
// Terminal ids:
//
//   ch:<channel>:+   ch:<channel>:-     a channel's output and its return.
//   <node>:+         <node>:-           a driver node wired as a whole: its
//                                       drivers and coils joined inside it
//                                       by its own arrangement.
//   <node>:<u><c>:+  <node>:<u><c>:-    one coil of a node set to `custom`:
//                                       driver u (from 1), coil A or B on a
//                                       dual-coil driver, nothing on a
//                                       single one — `drv:2A:+`, `drv:1:-`.
//
// Every channel's return is the shared amplifier ground, as on a real
// multichannel amplifier, so all `-` channel terminals are one net.
//
// A driver's figures are always those of a single-coil driver. A dual-coil
// driver splits that coil into two equal halves on the same former: each
// half has Re/2 and Bl/2, and the halves are tightly coupled, so in series
// they are exactly the driver as entered.

import { ratingOf, driverNominal } from './nominal.js'

/** How a node's drivers may be joined inside it, and how a dual-coil driver's coils may be. */
export const UNIT_ARRANGEMENTS = ['series', 'parallel', 'series-parallel']
export const COIL_ARRANGEMENTS = ['series', 'parallel', 'one']

/**
 * A channel terminal's id.
 *
 * @param {string} ch - Channel id.
 * @param {'+'|'-'} pol - Which side.
 * @returns {string} e.g. `ch:ch1:+`.
 * @pure
 */
export const chTerm = (ch, pol) => `ch:${ch}:${pol}`

/**
 * A driver terminal's id.
 *
 * @param {string} node - Node id.
 * @param {string} element - `''` for the node as a whole, else `<unit><coil>`.
 * @param {'+'|'-'} pol - Which side.
 * @returns {string} e.g. `drv:+` or `drv:2A:-`.
 * @pure
 */
export const nodeTerm = (node, element, pol) => (element ? `${node}:${element}:${pol}` : `${node}:${pol}`)

/**
 * What a terminal id names.
 *
 * @param {string} t - A terminal id.
 * @returns {{kind: 'channel', ch: string, pol: string}|{kind: 'node', node: string, element: string, pol: string}|null} Its parts; `null` when it is not a terminal id.
 * @pure
 */
export function parseTerm(t) {
  if (typeof t !== 'string') return null
  const pol = t.slice(-1)
  if ((pol !== '+' && pol !== '-') || t[t.length - 2] !== ':') return null
  const body = t.slice(0, -2)
  if (body.startsWith('ch:')) return { kind: 'channel', ch: body.slice(3), pol }
  const i = body.indexOf(':')
  return i < 0 ? { kind: 'node', node: body, element: '', pol } : { kind: 'node', node: body.slice(0, i), element: body.slice(i + 1), pol }
}

/**
 * How many drivers a node holds.
 *
 * @param {object} p - Driver params.
 * @returns {number} At least 1.
 * @pure
 */
export const unitsOf = (p) => Math.max(1, Math.round(Number(p?.count) || 1))

/**
 * Whether a driver node's coils are each wired by hand.
 *
 * @param {object} p - Driver params.
 * @returns {boolean} True for `wiring: 'custom'`.
 * @pure
 */
export const isCustom = (p) => p?.wiring === 'custom'

/**
 * The coils of one driver in a node: `A` and `B` on a dual-coil driver, one unnamed coil otherwise.
 *
 * @param {object} p - Driver params.
 * @returns {string[]} Coil letters.
 * @pure
 */
export const coilsOf = (p) => (p?.dvc ? ['A', 'B'] : [''])

/**
 * The electrical elements a driver node shows in the Wiring window: one for
 * the node as a whole, or one per coil when it is wired by hand.
 *
 * @param {object} node - A driver node: `{id, params}` or an editor node `{id, data: {params}}`.
 * @returns {Array<{key: string, label: string, plus: string, minus: string, nominal: number}>} Each element's terminals and nominal ohms.
 * @pure
 */
export function elementsOf(node) {
  const p = node.params || node.data?.params || {}
  if (!isCustom(p)) return [{ key: '', label: '', plus: nodeTerm(node.id, '', '+'), minus: nodeTerm(node.id, '', '-'), nominal: driverNominal(p) }]
  const coils = coilsOf(p)
  const n = unitsOf(p)
  const coilOhms = ratingOf(Number(p.Re) || 0) / coils.length
  const out = []
  for (let u = 1; u <= n; u++) {
    for (const c of coils) {
      const key = `${u}${c}`
      const label = [n > 1 ? `Driver ${u}` : '', c ? `coil ${c}` : ''].filter(Boolean).join(' · ') || 'Coil'
      out.push({ key, label: label[0].toUpperCase() + label.slice(1), plus: nodeTerm(node.id, key, '+'), minus: nodeTerm(node.id, key, '-'), nominal: coilOhms })
    }
  }
  return out
}

/**
 * Every terminal that exists: each channel's two, and each driver element's two.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} nodes - The project's nodes, editor or saved.
 * @returns {Set<string>} Terminal ids.
 * @pure
 */
export function allTerminals(wiring, nodes) {
  const out = new Set()
  for (const c of wiring?.channels || []) { out.add(chTerm(c.id, '+')); out.add(chTerm(c.id, '-')) }
  for (const n of nodes || []) {
    if (n.type !== 'driver') continue
    for (const e of elementsOf(n)) { out.add(e.plus); out.add(e.minus) }
  }
  return out
}

/**
 * The cables that still join two terminals that exist.
 *
 * A cable to a node that was deleted, to a channel that was removed, or to a
 * coil a node no longer exposes goes. So does one that joins a terminal to
 * itself, and a repeat of another.
 *
 * @param {Array<{a: string, b: string}>} wires - The cables.
 * @param {Set<string>} terms - Terminals that exist.
 * @returns {Array<{a: string, b: string}>} The cables kept, in order.
 * @pure
 */
export function liveWires(wires, terms) {
  const seen = new Set()
  const out = []
  for (const w of wires || []) {
    if (!terms.has(w?.a) || !terms.has(w?.b) || w.a === w.b) continue
    const key = [w.a, w.b].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ a: w.a, b: w.b })
  }
  return out
}

/** The net every channel return belongs to. */
export const GROUND = 'ground'

/**
 * Group terminals into nets.
 *
 * @param {Array<{a: string, b: string}>} wires - The cables.
 * @param {Iterable<string>} [terms] - Terminals to include even when no cable reaches them.
 * @returns {Map<string, string>} Terminal → its net's name. Channel returns, and everything joined to them, are `ground`.
 * @pure
 */
export function netsOf(wires, terms = []) {
  const parent = new Map()
  /**
   * The root of a terminal's set.
   *
   * @param {string} t - Terminal id.
   * @returns {string} Its root.
   * @mutates the enclosing parent map.
   */
  const find = (t) => {
    if (!parent.has(t)) parent.set(t, t)
    let r = t
    while (parent.get(r) !== r) r = parent.get(r)
    parent.set(t, r)
    return r
  }
  const all = [...terms, ...(wires || []).flatMap((w) => [w.a, w.b])]
  for (const t of all) find(t)
  for (const t of all) if (parseTerm(t)?.kind === 'channel' && parseTerm(t).pol === '-') parent.set(find(t), find(GROUND))
  for (const w of wires || []) parent.set(find(w.a), find(w.b))
  const out = new Map()
  const groundRoot = find(GROUND)
  for (const t of all) out.set(t, find(t) === groundRoot ? GROUND : find(t))
  return out
}

/**
 * Whether a cable may join two terminals, and if not why.
 *
 * A cable may not join a terminal to itself or repeat one already there. It
 * may not join two channel terminals, and it may not leave a channel's output
 * in the same net as the ground or as another channel's output — either would
 * short an amplifier.
 *
 * @param {object} wiring - The project's wiring.
 * @param {string} a - One terminal.
 * @param {string} b - The other.
 * @param {Object<string, string>} [names] - Channel id → its name, for the message.
 * @returns {string|null} Why not; `null` when it may.
 * @pure
 */
export function wireRefusal(wiring, a, b, names = {}) {
  if (a === b) return 'A cable needs two different terminals.'
  const wires = wiring?.wires || []
  if (wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return 'Those two are already joined.'
  const pa = parseTerm(a)
  const pb = parseTerm(b)
  if (pa?.kind === 'channel' && pb?.kind === 'channel') return 'Two channel terminals can\'t be joined directly — wire a driver between them.'
  const nets = netsOf([...wires, { a, b }], [a, b])
  const outputs = new Map()
  for (const c of wiring?.channels || []) {
    const net = nets.get(chTerm(c.id, '+'))
    if (net == null) continue
    const name = names[c.id] || c.label || c.id
    if (net === GROUND) return `That would short ${name}: its + would be joined to the ground.`
    if (outputs.has(net)) return `That would join ${outputs.get(net)} and ${name} directly.`
    outputs.set(net, name)
  }
  return null
}

/**
 * Which channels reach each driver element, and how each is wired.
 *
 * An element is driven by a channel when, without passing through the
 * ground, its cables and the drivers between reach that channel's output,
 * and something along the way returns to the ground. One whose terminal meets nothing else is
 * dangling; one whose two terminals share a net is shorted.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} nodes - The project's nodes.
 * @returns {Map<string, {channels: string[], dangling: boolean, shorted: boolean}>} By node id: the channel ids that drive any of its elements, and whether any element dangles or is shorted.
 * @pure
 */
export function driverStatus(wiring, nodes) {
  const terms = allTerminals(wiring, nodes)
  const wires = liveWires(wiring?.wires, terms)
  const nets = netsOf(wires, terms)
  const count = new Map()
  for (const t of terms) count.set(nets.get(t), (count.get(nets.get(t)) || 0) + 1)
  // Groups of nets joined through drivers, the ground left out: every
  // channel's return is the ground, so joining through it would make every
  // channel reach every driver.
  const parent = new Map()
  /**
   * The root of a net's group.
   *
   * @param {string} n - Net name.
   * @returns {string} Its root.
   * @mutates the enclosing parent map.
   */
  const find = (n) => {
    if (!parent.has(n)) parent.set(n, n)
    let r = n
    while (parent.get(r) !== r) r = parent.get(r)
    parent.set(n, r)
    return r
  }
  const elements = (nodes || []).filter((n) => n.type === 'driver').map((n) => ({ node: n, els: elementsOf(n) }))
  for (const { els } of elements) {
    for (const e of els) {
      const a = nets.get(e.plus); const b = nets.get(e.minus)
      if (a !== GROUND && b !== GROUND) parent.set(find(a), find(b))
    }
  }
  // A group is grounded when a driver in it has an end on the ground.
  const grounded = new Set()
  for (const { els } of elements) {
    for (const e of els) {
      const a = nets.get(e.plus); const b = nets.get(e.minus)
      if (a === GROUND && b !== GROUND) grounded.add(find(b))
      if (b === GROUND && a !== GROUND) grounded.add(find(a))
    }
  }
  const channelsOf = new Map()
  for (const c of wiring?.channels || []) {
    const net = nets.get(chTerm(c.id, '+'))
    if (net == null || net === GROUND) continue
    const root = find(net)
    if (!channelsOf.has(root)) channelsOf.set(root, [])
    channelsOf.get(root).push(c.id)
  }
  const out = new Map()
  for (const { node, els } of elements) {
    const chans = new Set()
    let dangling = false
    let shorted = false
    for (const e of els) {
      for (const t of [e.plus, e.minus]) {
        const net = nets.get(t)
        if (net === GROUND) continue
        const root = find(net)
        if (grounded.has(root)) for (const id of channelsOf.get(root) || []) chans.add(id)
      }
      /**
       * Whether a terminal meets nothing at all.
       *
       * @param {string} t - Terminal id.
       * @returns {boolean} True when its net holds it alone.
       * @reads the enclosing nets and counts.
       */
      const lone = (t) => count.get(nets.get(t)) === 1
      if (lone(e.plus) !== lone(e.minus)) dangling = true
      if (nets.get(e.plus) === nets.get(e.minus) && wires.some((w) => [w.a, w.b].includes(e.plus) || [w.a, w.b].includes(e.minus))) shorted = true
    }
    out.set(node.id, { channels: [...chans], dangling, shorted })
  }
  return out
}

/**
 * The circuit at rest, each driver element taken as its nominal resistance:
 * what each channel sees, and the current through each element.
 *
 * The figures an amplifier is rated against — nominal ohms and watts — for a
 * circuit of any shape. Solved by nodal analysis with every channel at its
 * level; channel output resistance is left out, as a nominal load does.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} nodes - The project's nodes.
 * @param {Object<string, number>} volts - Channel id → its volts at the master level.
 * @returns {{channels: Object<string, {ohms: number, amps: number, watts: number}>, elements: Object<string, number>}} Per channel its nominal load, current and power; per element terminal pair (`plus` id) its current in amps.
 * @pure
 */
export function nominalSolve(wiring, nodes, volts) {
  const terms = allTerminals(wiring, nodes)
  const wires = liveWires(wiring?.wires, terms)
  const nets = netsOf(wires, terms)
  const names = [...new Set(nets.values())].filter((n) => n !== GROUND)
  const index = new Map(names.map((n, i) => [n, i]))
  const channels = (wiring?.channels || []).filter((c) => nets.get(chTerm(c.id, '+')) !== GROUND)
  const size = names.length + channels.length
  const A = Array.from({ length: size }, () => new Float64Array(size))
  const z = new Float64Array(size)
  /**
   * Stamp a conductance between two nets.
   *
   * @param {string} a - One net.
   * @param {string} b - The other.
   * @param {number} g - Siemens.
   * @returns {void}
   * @mutates the enclosing matrix.
   */
  const stamp = (a, b, g) => {
    const i = index.get(a); const j = index.get(b)
    if (i != null) A[i][i] += g
    if (j != null) A[j][j] += g
    if (i != null && j != null) { A[i][j] -= g; A[j][i] -= g }
  }
  const elements = []
  for (const n of nodes || []) {
    if (n.type !== 'driver') continue
    for (const e of elementsOf(n)) {
      const r = e.nominal > 0 ? e.nominal : 1e9
      elements.push({ e, r })
      stamp(nets.get(e.plus), nets.get(e.minus), 1 / r)
    }
  }
  for (const n of names) A[index.get(n)][index.get(n)] += 1e-9
  channels.forEach((c, k) => {
    const row = names.length + k
    const i = index.get(nets.get(chTerm(c.id, '+')))
    A[i][row] += 1; A[row][i] += 1
    z[row] = Number(volts[c.id]) || 0
  })
  const x = solve(A, z)
  /**
   * A net's voltage in the solution.
   *
   * @param {string} net - Net name.
   * @returns {number} Volts; 0 for the ground.
   * @reads the enclosing solution.
   */
  const v = (net) => (net === GROUND ? 0 : x[index.get(net)] || 0)
  const out = { channels: {}, elements: {} }
  for (const c of wiring?.channels || []) out.channels[c.id] = { ohms: Infinity, amps: 0, watts: 0 }
  channels.forEach((c, k) => {
    const amps = -x[names.length + k]
    const vc = Number(volts[c.id]) || 0
    // The leak every net has to the ground keeps the system solvable; a
    // channel drawing no more than that is driving nothing.
    const ohms = Math.abs(amps) > 1e-6 * Math.max(Math.abs(vc), 1) ? vc / amps : Infinity
    out.channels[c.id] = { ohms, amps, watts: Number.isFinite(ohms) ? vc * amps : 0 }
  })
  for (const { e, r } of elements) out.elements[e.plus] = (v(nets.get(e.plus)) - v(nets.get(e.minus))) / r
  return out
}

/**
 * Solve a small dense linear system by Gaussian elimination with partial pivoting.
 *
 * @param {Array<Float64Array>} A - The matrix; overwritten.
 * @param {Float64Array} b - The right-hand side; overwritten.
 * @returns {Float64Array} The solution; zeros where the system is singular.
 * @mutates A and b.
 */
function solve(A, b) {
  const n = b.length
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-15) continue
    ;[A[c], A[p]] = [A[p], A[c]]
    ;[b[c], b[p]] = [b[p], b[c]]
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c]
      if (!f) continue
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]
      b[r] -= f * b[c]
    }
  }
  const x = new Float64Array(n)
  for (let r = n - 1; r >= 0; r--) {
    if (Math.abs(A[r][r]) < 1e-15) continue
    let s = b[r]
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]
    x[r] = s / A[r][r]
  }
  return x
}

/**
 * The cables that join a node's coils the way its arrangement does.
 *
 * What a node switching to `custom` starts from, so wiring it by hand begins
 * as the circuit it already was: its drivers and coils joined as before, with
 * `plus` and `minus` the terminals that take over the node's own two.
 *
 * @param {object} node - A driver node, with its arrangement (not yet `custom`).
 * @returns {{wires: Array<{a: string, b: string}>, plus: string, minus: string}} The internal cables and the outer terminals.
 * @pure
 */
export function arrangementWires(node) {
  const p = node.params || node.data?.params || {}
  const wires = []
  const coils = coilsOf(p)
  const n = unitsOf(p)
  /**
   * Join blocks end to end.
   *
   * @param {Array<{plus: string, minus: string}>} blocks - Two-terminal blocks.
   * @returns {{plus: string, minus: string}} The chain.
   * @mutates the enclosing wires.
   */
  const series = (blocks) => {
    for (let i = 1; i < blocks.length; i++) wires.push({ a: blocks[i - 1].minus, b: blocks[i].plus })
    return { plus: blocks[0].plus, minus: blocks[blocks.length - 1].minus }
  }
  /**
   * Join blocks side by side.
   *
   * @param {Array<{plus: string, minus: string}>} blocks - Two-terminal blocks.
   * @returns {{plus: string, minus: string}} The group.
   * @mutates the enclosing wires.
   */
  const parallel = (blocks) => {
    for (let i = 1; i < blocks.length; i++) {
      wires.push({ a: blocks[0].plus, b: blocks[i].plus })
      wires.push({ a: blocks[0].minus, b: blocks[i].minus })
    }
    return { plus: blocks[0].plus, minus: blocks[0].minus }
  }
  const units = []
  for (let u = 1; u <= n; u++) {
    const cs = coils.map((c) => ({ plus: nodeTerm(node.id, `${u}${c}`, '+'), minus: nodeTerm(node.id, `${u}${c}`, '-') }))
    const how = p.dvc?.coils
    units.push(cs.length === 1 || how === 'one' ? cs[0] : how === 'parallel' ? parallel(cs) : series(cs))
  }
  let whole
  if (p.wiring === 'series') whole = series(units)
  else if (p.wiring === 'series-parallel' && Math.round(Math.sqrt(n)) ** 2 === n && n > 1) {
    const r = Math.round(Math.sqrt(n))
    whole = parallel(Array.from({ length: r }, (_, g) => series(units.slice(g * r, g * r + r))))
  } else whole = parallel(units)
  return { wires, ...whole }
}

/**
 * Cables that put drivers on a channel, each in parallel with what is there.
 *
 * @param {Array<object>} drivers - Driver nodes.
 * @param {string} ch - Channel id.
 * @returns {Array<{a: string, b: string}>} One pair of cables per driver.
 * @pure
 */
export function parallelWires(drivers, ch) {
  const out = []
  for (const n of drivers) {
    const p = n.params || n.data?.params || {}
    if (isCustom(p)) continue
    out.push({ a: chTerm(ch, '+'), b: nodeTerm(n.id, '', '+') }, { a: chTerm(ch, '-'), b: nodeTerm(n.id, '', '-') })
  }
  return out
}

/**
 * Cables equivalent to the series/parallel load trees of older projects.
 *
 * A tree joins its leaves through nets of its own; each net becomes a chain of
 * cables between the terminals in it. The one channel with no tree took every
 * driver no tree claimed, in parallel, and still does.
 *
 * @param {Array<object>} channels - Channels as they were saved, with `load`.
 * @param {string[]} driverIds - Every driver node's id.
 * @returns {Array<{a: string, b: string}>} The cables.
 * @pure
 */
export function wiresFromLoads(channels, driverIds) {
  const claimed = new Set()
  /**
   * Collect a tree's drivers.
   *
   * @param {object} t - A tree.
   * @returns {void}
   * @mutates the enclosing claimed set.
   */
  const claim = (t) => {
    if (!t) return
    if (t.driver) claimed.add(t.driver)
    for (const k of ['parallel', 'series']) if (Array.isArray(t[k])) t[k].forEach(claim)
  }
  for (const c of channels || []) claim(c.load)
  const ids = new Set(driverIds)
  const members = new Map()
  let fresh = 0
  /**
   * Put a terminal in a net.
   *
   * @param {string} net - Net name.
   * @param {string} t - Terminal id.
   * @returns {void}
   * @mutates the enclosing members map.
   */
  const join = (net, t) => {
    if (!members.has(net)) members.set(net, [])
    members.get(net).push(t)
  }
  /**
   * Lay a tree between two nets.
   *
   * @param {object} t - A tree.
   * @param {string} a - The + net.
   * @param {string} b - The − net.
   * @returns {void}
   * @mutates the enclosing members map and counter.
   */
  const lay = (t, a, b) => {
    if (!t) return
    if (t.driver) {
      if (!ids.has(t.driver)) return
      join(a, nodeTerm(t.driver, '', '+'))
      join(b, nodeTerm(t.driver, '', '-'))
      return
    }
    if (Array.isArray(t.parallel)) for (const k of t.parallel) lay(k, a, b)
    if (Array.isArray(t.series)) {
      let at = a
      t.series.forEach((k, i) => {
        const next = i === t.series.length - 1 ? b : `n${fresh++}`
        lay(k, at, next)
        at = next
      })
    }
  }
  let catchAll = false
  for (const c of channels || []) {
    const a = `${c.id}+`
    const b = `${c.id}-`
    join(a, chTerm(c.id, '+'))
    join(b, chTerm(c.id, '-'))
    if (c.load) lay(c.load, a, b)
    else if (!catchAll) {
      catchAll = true
      for (const id of driverIds) if (!claimed.has(id)) lay({ driver: id }, a, b)
    }
  }
  const out = []
  for (const ts of members.values()) for (let i = 1; i < ts.length; i++) out.push({ a: ts[0], b: ts[i] })
  return out
}

/**
 * The channel the toolbar's drive level sets.
 *
 * @param {object} wiring - The project's wiring.
 * @returns {object|undefined} The channel named by `toolbar`, else the first.
 * @pure
 */
export function toolbarChannel(wiring) {
  const chs = wiring?.channels || []
  return chs.find((c) => c.id === wiring?.toolbar) || chs[0]
}
