// Named parameters and expressions.
//
// A project may define named values once — `{ name: 'Vb', value: 60 }` — and
// any numeric field may then hold an expression over them instead of a
// number: `"volume": "Vb / 2"`. Expressions are resolved here, before a
// netlist is built, so the engine only ever sees numbers and an error names
// the field it came from rather than surfacing from inside SPICE.
//
// The language is deliberately small: numbers, the named params, `pi` and
// `e`, + − × ÷ ^, parentheses, and a short list of functions. It is parsed
// with mathjs, but only the node types listed below are accepted, so nothing
// can assign, define a function, reach a unit or call anything else.

import { parse } from 'mathjs'
import { DEFAULT_PARAMS } from './version.js'

/** Functions an expression may call. */
const FUNCTIONS = new Set(['sqrt', 'min', 'max', 'abs', 'log', 'log10', 'exp', 'pow', 'round', 'floor', 'ceil'])

/** Constants an expression may use without defining them. */
const CONSTANTS = { pi: Math.PI, e: Math.E }

/** Operators an expression may use, by mathjs function name. */
const OPERATORS = new Set(['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus'])

/**
 * Node fields that are numeric but default to `null` rather than a number.
 * `leakQL: null` means sealed.
 */
const NULLABLE_NUMERIC = new Set(['leakQL', 'areaOverride'])

/**
 * Whether a stored value is an expression rather than a plain number.
 *
 * @param {*} v - A stored field value.
 * @returns {boolean} True for a string — the only form an expression takes.
 * @pure
 */
export function isExpression(v) {
  return typeof v === 'string'
}

/**
 * Whether a name may be used for a parameter.
 *
 * An identifier that does not collide with a constant or a function name,
 * so an expression can never be ambiguous about what a name refers to.
 *
 * @param {string} name - The proposed name.
 * @returns {boolean} True when the name is usable.
 * @pure
 */
export function isValidParamName(name) {
  return typeof name === 'string'
    && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    && !FUNCTIONS.has(name)
    && !(name in CONSTANTS)
}

/**
 * Parse an expression and check it uses only the permitted language.
 *
 * @param {string} src - The expression text.
 * @returns {{node: object|null, symbols: string[], error: string|null}} The parsed tree, the parameter names it references, and an error when it does not parse or uses anything outside the language.
 * @pure
 */
function parseExpression(src) {
  if (!src.trim()) return { node: null, symbols: [], error: 'empty expression' }
  let node
  try {
    node = parse(src)
  } catch (err) {
    return { node: null, symbols: [], error: `cannot parse "${src}": ${err.message}` }
  }
  const symbols = new Set()
  let error = null
  node.traverse((n, path, parent) => {
    if (error) return
    switch (n.type) {
      case 'ConstantNode':
        if (typeof n.value !== 'number') error = `"${src}" contains a non-numeric constant`
        break
      case 'ParenthesisNode':
        break
      case 'OperatorNode':
        if (!OPERATORS.has(n.fn)) error = `"${src}" uses the operator "${n.op}", which is not allowed`
        break
      case 'FunctionNode':
        if (!FUNCTIONS.has(n.fn?.name)) error = `"${src}" calls "${n.fn?.name}", which is not an allowed function`
        break
      case 'SymbolNode':
        if (parent?.type === 'FunctionNode' && path === 'fn') break
        if (!(n.name in CONSTANTS)) symbols.add(n.name)
        break
      default:
        error = `"${src}" uses ${n.type}, which is not allowed in an expression`
    }
  })
  return { node: error ? null : node, symbols: [...symbols], error }
}

/**
 * Evaluate the project's named parameters, in dependency order.
 *
 * Parameters may reference each other. A reference to an unknown name, a
 * cycle, a duplicate or invalid name, or a result that is not a finite
 * number is reported, and that parameter (with anything depending on it) is
 * left out of `values`.
 *
 * @param {Array<{name: string, value: number|string}>} params - The project's `params` list.
 * @returns {{values: Object<string, number>, errors: string[]}} Resolved values by name, and every problem found.
 * @post params is not modified
 * @pure
 */
export function evaluateParams(params = []) {
  const errors = []
  const defs = new Map()
  for (const p of params) {
    if (!isValidParamName(p?.name)) { errors.push(`"${p?.name}" is not a valid parameter name`); continue }
    if (defs.has(p.name)) { errors.push(`parameter "${p.name}" is defined more than once`); continue }
    defs.set(p.name, p.value)
  }
  const values = {}
  const state = new Map() // name -> 'visiting' | 'done' | 'failed'
  /**
   * Resolve one parameter, resolving its references first.
   *
   * @param {string} name - Parameter name.
   * @param {string[]} stack - Names being resolved above this one, for reporting a cycle.
   * @returns {boolean} True when the parameter resolved to a finite number.
   * @mutates the enclosing `values`, `state` and `errors`.
   */
  const resolve = (name, stack) => {
    if (state.get(name) === 'done') return true
    if (state.get(name) === 'failed') return false
    if (state.get(name) === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(name)), name]
      errors.push(`parameters reference each other in a cycle: ${cycle.join(' → ')}`)
      return false
    }
    state.set(name, 'visiting')
    const raw = defs.get(name)
    let ok = true
    let v = NaN
    if (typeof raw === 'number') {
      v = raw
    } else if (isExpression(raw)) {
      const { node, symbols, error } = parseExpression(raw)
      if (error) { errors.push(`parameter "${name}": ${error}`); ok = false }
      for (const s of ok ? symbols : []) {
        if (!defs.has(s)) { errors.push(`parameter "${name}" refers to "${s}", which is not defined`); ok = false; continue }
        if (!resolve(s, [...stack, name])) ok = false
      }
      if (ok) v = node.compile().evaluate({ ...CONSTANTS, ...values })
    } else {
      errors.push(`parameter "${name}" has no value`)
      ok = false
    }
    if (ok && !(typeof v === 'number' && isFinite(v))) {
      errors.push(`parameter "${name}" does not evaluate to a finite number`)
      ok = false
    }
    state.set(name, ok ? 'done' : 'failed')
    if (ok) values[name] = v
    return ok
  }
  for (const name of defs.keys()) resolve(name, [])
  return { values, errors }
}

/**
 * Evaluate one field's expression against resolved parameter values.
 *
 * @param {string} src - The expression.
 * @param {Object<string, number>} values - Resolved parameters.
 * @returns {{value: number, error: string|null}} The number, or an error and `NaN`.
 * @pure
 */
export function evaluateExpression(src, values) {
  const { node, symbols, error } = parseExpression(src)
  if (error) return { value: NaN, error }
  const missing = symbols.filter((s) => !(s in values))
  if (missing.length) return { value: NaN, error: `"${src}" refers to ${missing.map((s) => `"${s}"`).join(', ')}, which ${missing.length > 1 ? 'are' : 'is'} not defined` }
  const v = node.compile().evaluate({ ...CONSTANTS, ...values })
  if (!(typeof v === 'number' && isFinite(v))) return { value: NaN, error: `"${src}" does not evaluate to a finite number` }
  return { value: v, error: null }
}

/**
 * Whether a node field is numeric, and so may hold an expression.
 *
 * @param {string} type - Node type.
 * @param {string} field - Param name.
 * @returns {boolean} True when the field's default is a number, or it is a numeric field that defaults to `null`.
 * @pure
 */
export function isNumericField(type, field) {
  return typeof DEFAULT_PARAMS[type]?.[field] === 'number' || NULLABLE_NUMERIC.has(field)
}

/**
 * Replace every expression in a project with its value.
 *
 * Covers node params, tap positions, the master level, channel volts and
 * output resistance, DSP delay and filter values, analysis ranges and probe
 * positions. Anything that cannot be resolved is reported with where it is,
 * and left as `NaN` so a caller that ignores the errors still cannot mistake
 * it for a real value.
 *
 * @param {object} proj - A v3 project (see `migrateProject`).
 * @returns {{project: object, values: Object<string, number>, errors: string[]}} A copy holding only numbers, the resolved parameters, and every problem found.
 * @post proj is not modified
 * @pure
 */
export function resolveProject(proj) {
  const { values, errors } = evaluateParams(proj.params)
  /**
   * Resolve one value if it is an expression.
   *
   * @param {*} v - The stored value.
   * @param {string} where - Location used in any error message.
   * @returns {*} The number for an expression; anything else unchanged.
   * @mutates the enclosing `errors`.
   */
  const num = (v, where) => {
    if (!isExpression(v)) return v
    const r = evaluateExpression(v, values)
    if (r.error) errors.push(`${where}: ${r.error}`)
    return r.value
  }
  const nodes = (proj.nodes || []).map((n) => {
    const params = { ...n.params }
    for (const [k, v] of Object.entries(params)) {
      if (isNumericField(n.type, k)) params[k] = num(v, `${n.params?.label || n.id} › ${k}`)
    }
    if (Array.isArray(params.taps)) {
      params.taps = params.taps.map((t) => ({ ...t, position: num(t.position, `${n.params?.label || n.id} › tap ${t.id}`) }))
    }
    return { ...n, params }
  })
  const w = proj.wiring || { masterDb: 0, channels: [] }
  const wiring = {
    ...w,
    masterDb: num(w.masterDb, 'master level'),
    channels: (w.channels || []).map((c) => ({
      ...c,
      volts: num(c.volts, `${c.label || c.id} › volts`),
      outputOhms: num(c.outputOhms, `${c.label || c.id} › output resistance`),
      dsp: c.dsp && {
        ...c.dsp,
        delayMs: num(c.dsp.delayMs, `${c.label || c.id} › delay`),
        filters: (c.dsp.filters || []).map((f, i) => {
          const out = { ...f }
          for (const k of ['hz', 'q', 'db', 'order']) {
            if (k in out) out[k] = num(out[k], `${c.label || c.id} › filter ${i + 1} › ${k}`)
          }
          return out
        }),
      },
    })),
  }
  const analyses = (proj.analyses || []).map((a) => {
    const out = { ...a }
    for (const k of ['fmin', 'fmax', 'npts', 'duration', 'step']) {
      if (k in out) out[k] = num(out[k], `analysis ${a.id} › ${k}`)
    }
    return out
  })
  const probes = (proj.probes || []).map((p) => (
    p.at && 'position' in p.at
      ? { ...p, at: { ...p.at, position: num(p.at.position, `probe ${p.label || p.id} › position`) } }
      : p
  ))
  return { project: { ...proj, nodes, wiring, analyses, probes }, values, errors }
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { parseExpression }
