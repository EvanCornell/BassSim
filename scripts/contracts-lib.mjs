// Shared machinery for the method-contract toolchain.
//
// Two consumers sit on top of this module and must agree exactly, or the
// coverage test would police a different set of methods than the extractor
// publishes:
//
//   scripts/extract-contracts.mjs → docs/api.json   (documentation feed)
//   test/contracts.mjs            → npm run test:contracts (the ratchet)
//
// Everything they disagree about would be a silent documentation hole, so the
// definition of "a method", the tag vocabulary and the JSDoc parser all live
// here once.
//
// The AST comes from @babel/parser rather than a regex because the codebase is
// JSX-heavy and arrow-dense: `onClick={(e) => …}` and `const apply = (d) => …`
// are indistinguishable to a line matcher but only the second is a method we
// expect a contract on.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'

/** Repository root, so scanned paths can be reported repo-relative. */
export const REPO = fileURLToPath(new URL('..', import.meta.url))

/** Directories walked for documentable source. */
export const ROOTS = ['src', 'mcp', 'server', 'scripts', 'test']

/** Directory names never descended into, wherever they appear. */
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git'])

// Excluded by path rather than by name. `data/` holds the raw manufacturer
// catalog exports and has no source in it — but matching on the bare name would
// also swallow `src/data/`, which holds the driver library modules and is very
// much in scope.
const IGNORE_PATHS = new Set([join(REPO, 'data')])
/** File extensions treated as documentable source. */
const SOURCE_EXT = new Set(['.js', '.jsx', '.mjs'])

// Generated or pure-data modules. These hold no executable surface — a
// contract on a 172-element array literal would be noise, and drivers.bc.js is
// rewritten wholesale by `npm run import:catalog`, so anything added by hand
// would not survive the next import.
export const IGNORE_FILES = new Set([
  'src/data/drivers.bc.js',
  'src/data/drivers.legacy.js',
  // Browser-API stubs. Every "method" here is an inert impersonation of a DOM
  // or Storage call that exists only so app modules import cleanly under the
  // test runner; contracting `setAttribute() {}` would be pure noise.
  'test/support/env.mjs',
])

// Directories excluded wholesale.
//
// The blind contract suite consumes contracts rather than carrying them: its
// files are generated from docs/contracts/ by an author that never sees this
// codebase and could not know the convention. Holding assertion helpers to the
// application's documentation standard would police the wrong surface.
export const IGNORE_DIRS_REL = ['test/contract/']

// ---------------------------------------------------------------------------
// Tag vocabulary
// ---------------------------------------------------------------------------

/**
 * The contract vocabulary, as data so the test can reject anything outside it.
 *
 * A typo like `@sideeffect` would otherwise parse cleanly and then silently
 * vanish from the generated docs.
 *
 * Payload kinds: `typed` expects a leading `{type}`, `text` takes free
 * prose, and `flag` takes nothing.
 */
export const TAGS = {
  // --- standard JSDoc ---
  param: 'typed',
  returns: 'typed',
  throws: 'typed',
  yields: 'typed',
  type: 'typed',
  typedef: 'typed',
  property: 'typed',
  template: 'text',
  callback: 'text',
  example: 'text',
  see: 'text',
  deprecated: 'text',

  // --- contract extensions ---
  // Parsed straight through by comment-parser and passed through by TypeDoc
  // once declared in `blockTags`, so these cost no tooling compatibility.
  pre: 'text', // caller must guarantee this on entry
  post: 'text', // holds on normal return
  invariant: 'text', // true both before and after
  mutates: 'text', // argument or module state mutated in place
  sideEffect: 'text', // I/O, storage, network, DOM, timers
  reads: 'text', // depends on mutable state outside its arguments
  pure: 'flag', // no effects, deterministic in its arguments
}

/** Accepted spellings mapped to the canonical tag name. */
const TAG_ALIASES = { return: 'returns', arg: 'param', argument: 'param', exception: 'throws' }

/**
 * Resolve a tag alias to its canonical name.
 *
 * @param {string} t - The tag as written.
 * @returns {string} The canonical tag name, unchanged when it is not an alias.
 * @pure
 */
export const normalizeTag = (t) => TAG_ALIASES[t] || t

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Collect source files under a directory, recursively.
 *
 * An unreadable directory is skipped rather than throwing, so a missing
 * optional root does not break the scan.
 *
 * @param {string} dir - Absolute directory path.
 * @param {string[]} out - Accumulator, appended to in place.
 * @returns {string[]} The same array.
 * @mutates The `out` array.
 * @sideEffect Reads the filesystem.
 */
function walkDir(dir, out) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue
    const full = join(dir, name)
    if (IGNORE_PATHS.has(full)) continue
    const st = statSync(full)
    if (st.isDirectory()) walkDir(full, out)
    else if (SOURCE_EXT.has(name.slice(name.lastIndexOf('.')))) out.push(full)
  }
  return out
}

/**
 * Every source file in scope, repo-relative and sorted.
 *
 * Sorting matters: it is what makes `docs/api.json` stable across runs, so
 * a regeneration with no source change produces no diff.
 *
 * @returns {string[]} Repo-relative paths, ascending.
 * @sideEffect Reads the filesystem.
 */
export function sourceFiles() {
  const out = []
  for (const root of ROOTS) walkDir(join(REPO, root), out)
  return out
    .map((f) => relative(REPO, f).split('\\').join('/'))
    .filter((f) => !IGNORE_FILES.has(f) && !IGNORE_DIRS_REL.some((d) => f.startsWith(d)))
    .sort()
}

// ---------------------------------------------------------------------------
// JSDoc block parsing
// ---------------------------------------------------------------------------

/**
 * Pull a leading `{type}` off a tag payload.
 *
 * Written as a brace scan rather than a regex so record and union types —
 * `{{driver: Driver}}`, `{Object<string, N>}` — survive intact instead of
 * being truncated at the first `}`.
 *
 * @param {string} s - The tag payload.
 * @returns {[string|null, string]} The type and the remaining text; the type is `null` when there was none or the braces were unbalanced.
 * @pure
 */
function takeType(s) {
  if (!s.startsWith('{')) return [null, s]
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return [s.slice(1, i).trim(), s.slice(i + 1).trim()]
    }
  }
  return [null, s] // unbalanced — treat as prose, the test reports the miss
}

/**
 * Pull a parameter name off a tag payload.
 *
 * Handles all three JSDoc spellings: `name`, `[name]` for optional, and
 * `[name=default]`.
 *
 * @param {string} s - The payload, after any type has been removed.
 * @returns {[string|null, boolean, string|null, string]} The name, whether it was optional, its default, and the remaining text.
 * @pure
 */
function takeName(s) {
  if (s.startsWith('[')) {
    // Depth scan rather than indexOf, because the default value may itself
    // contain brackets — `[out=[]]` is a legal optional-array parameter, and
    // stopping at the first ']' would report a default of '[' and leak the rest
    // into the description.
    let depth = 0
    let close = -1
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '[') depth++
      else if (s[i] === ']') { depth--; if (depth === 0) { close = i; break } }
    }
    if (close === -1) return [null, false, null, s]
    const inner = s.slice(1, close)
    const eq = inner.indexOf('=')
    const name = (eq === -1 ? inner : inner.slice(0, eq)).trim()
    const def = eq === -1 ? null : inner.slice(eq + 1).trim()
    return [name, true, def, s.slice(close + 1).trim()]
  }
  const m = s.match(/^([A-Za-z_$][\w$.]*)\s*/)
  if (!m) return [null, false, null, s]
  return [m[1], false, null, s.slice(m[0].length)]
}

/**
 * Remove the optional `-` separating a parameter name from its description.
 *
 * @param {string} s - The remaining payload.
 * @returns {string} The description alone.
 * @pure
 */
const stripDash = (s) => s.replace(/^-\s*/, '').trim()

/**
 * Parse a raw JSDoc comment body into structured contract fields.
 *
 * Tags continue across lines until the next one, so a long `@pre` can be
 * wrapped without losing its tail.
 *
 * @param {string} raw - Babel's `comment.value`: the text between the delimiters.
 * @returns {object} The parsed contract: `summary`, `description`, `params`, `returns`, `throws`, the contract arrays, `pure`, plus `unknownTags` and `malformed` for the test to report on.
 * @pure
 */
export function parseJsdoc(raw) {
  const lines = raw.split('\n').map((l) => l.replace(/^\s*\*+ ?/, '').trimEnd())

  const descLines = []
  const rawTags = []
  let current = null
  for (const line of lines) {
    const m = line.match(/^@(\w+)\s*/)
    if (m) {
      if (current) rawTags.push(current)
      current = { tag: normalizeTag(m[1]), original: m[1], text: line.slice(m[0].length) }
    } else if (current) {
      current.text += `\n${line}`
    } else {
      descLines.push(line)
    }
  }
  if (current) rawTags.push(current)

  const description = descLines.join('\n').trim()
  const doc = {
    // The first paragraph is the one-line answer; the rest is the "why", which
    // this codebase tends to have a lot of and which should not be lost.
    summary: description.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim(),
    description,
    params: [],
    returns: null,
    throws: [],
    pre: [],
    post: [],
    invariant: [],
    mutates: [],
    sideEffect: [],
    reads: [],
    pure: false,
    other: [],
    unknownTags: [],
    malformed: [],
  }

  for (const t of rawTags) {
    const kind = TAGS[t.tag]
    const text = t.text.trim()
    if (!kind) {
      doc.unknownTags.push(t.original)
      continue
    }
    if (t.tag === 'param' || t.tag === 'property') {
      const [type, rest] = takeType(text)
      const [name, optional, def, tail] = takeName(rest)
      if (!name) { doc.malformed.push(`@${t.tag} has no parameter name`); continue }
      const entry = { name, type, optional, default: def, desc: stripDash(tail) }
      if (t.tag === 'param') doc.params.push(entry)
      else doc.other.push({ tag: t.tag, ...entry })
    } else if (t.tag === 'returns' || t.tag === 'yields') {
      const [type, rest] = takeType(text)
      doc.returns = { type, desc: stripDash(rest) }
    } else if (t.tag === 'throws') {
      const [type, rest] = takeType(text)
      doc.throws.push({ type, desc: stripDash(rest) })
    } else if (t.tag === 'pure') {
      doc.pure = true
    } else if (Array.isArray(doc[t.tag])) {
      doc[t.tag].push(text)
    } else {
      doc.other.push({ tag: t.tag, text })
    }
  }
  return doc
}

// ---------------------------------------------------------------------------
// AST scan
// ---------------------------------------------------------------------------

const FN_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])

/**
 * Parameter names as the signature actually declares them.
 *
 * Destructured and rest params are reported with a `pattern` kind, because
 * their JSDoc name is the author's choice — only their position is
 * checkable.
 *
 * @param {object} fn - A Babel function node.
 * @returns {Array<{kind: 'name'|'rest'|'pattern', name: string, optional: boolean}>} One descriptor per declared parameter, in order.
 * @pure
 */
function paramNames(fn) {
  return (fn.params || []).map((p, i) => {
    let node = p
    let optional = false
    if (node.type === 'AssignmentPattern') { optional = true; node = node.left }
    if (node.type === 'RestElement') {
      const inner = node.argument
      return { kind: inner.type === 'Identifier' ? 'rest' : 'pattern', name: inner.name || `arg${i}`, optional: true }
    }
    if (node.type === 'Identifier') return { kind: 'name', name: node.name, optional }
    return { kind: 'pattern', name: `arg${i}`, optional }
  })
}

/**
 * Whether a function can return a value, so a `@returns` is expected.
 *
 * A nested function's returns belong to that function, so the walk stops at
 * any function boundary below the one being examined.
 *
 * @param {object} fn - A Babel function node.
 * @returns {boolean} True for a concise arrow body, or a body containing a `return` with an argument.
 * @pure
 */
function returnsValue(fn) {
  if (fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement') return true
  let found = false
  const seen = new Set()
  /**
   * Walk the body looking for a value-returning `return`.
   *
   * @param {any} n - An AST node, array, or anything else, which is ignored.
   * @returns {void}
   * @mutates The enclosing `found` flag and the visited set.
   */
  const visit = (n) => {
    if (found || !n || typeof n !== 'object' || seen.has(n)) return
    seen.add(n)
    if (Array.isArray(n)) { n.forEach(visit); return }
    if (!n.type) return
    // A nested function's returns belong to that function, not this one.
    if (n !== fn && FN_TYPES.has(n.type)) return
    if (n.type === 'ReturnStatement' && n.argument) { found = true; return }
    for (const k of Object.keys(n)) {
      if (k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'loc') continue
      visit(n[k])
    }
  }
  visit(fn.body)
  return found
}

/**
 * Decide whether an AST node is a documentable method, and name it.
 *
 * "Absolutely everything" means every *named* function binding at any depth
 * — including one-line aliases like `export const add = (a, b) => a.add(b)`
 * and helpers declared inside a component body. Anonymous functions passed
 * straight to a call or a JSX prop are excluded: `filtered.map((d) => …)`
 * has no name to document, and a block comment there would break up the
 * markup it lives in.
 *
 * @param {object} node - The AST node.
 * @param {object|null} parent - Its parent, needed to recognise a default export.
 * @returns {{name: string, kind: string, fn: object|null}|null} The method's name, kind and function node, or `null` when the node is not a method.
 * @pure
 */
function classify(node, parent) {
  if (node.type === 'FunctionDeclaration' && node.id) {
    return { name: node.id.name, kind: 'function', fn: node }
  }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init && FN_TYPES.has(node.init.type)) {
    return { name: node.id.name, kind: 'function', fn: node.init }
  }
  if (node.type === 'ObjectMethod' && (node.key.type === 'Identifier' || node.key.type === 'StringLiteral')) {
    return { name: node.key.name ?? node.key.value, kind: 'method', fn: node }
  }
  if (node.type === 'ObjectProperty' && !node.computed
      && (node.key.type === 'Identifier' || node.key.type === 'StringLiteral')
      && node.value && FN_TYPES.has(node.value.type)) {
    return { name: node.key.name ?? node.key.value, kind: 'method', fn: node.value }
  }
  if (node.type === 'ClassMethod' && (node.key.type === 'Identifier' || node.key.type === 'StringLiteral')) {
    return { name: node.key.name ?? node.key.value, kind: node.kind === 'constructor' ? 'constructor' : 'method', fn: node }
  }
  if (node.type === 'ClassDeclaration' && node.id) {
    return { name: node.id.name, kind: 'class', fn: null }
  }
  // `export default function () {}` and `export default () => {}`
  if (parent && parent.type === 'ExportDefaultDeclaration' && FN_TYPES.has(node.type) && !node.id) {
    return { name: 'default', kind: 'function', fn: node }
  }
  // `Foo.bar = () => {}`
  if (node.type === 'AssignmentExpression' && node.operator === '='
      && FN_TYPES.has(node.right.type)
      && (node.left.type === 'Identifier' || (node.left.type === 'MemberExpression' && !node.left.computed))) {
    const name = node.left.type === 'Identifier'
      ? node.left.name
      : `${node.left.object.name ?? '?'}.${node.left.property.name}`
    return { name, kind: 'function', fn: node.right }
  }
  return null
}

/**
 * Where a method's contract would have to end for it to belong to that method.
 *
 * A contract sits above the whole declaration, not above the inner arrow:
 * in `export const f = () => {}` the arrow starts well after the comment
 * that documents it, so this walks out through the wrappers that share a
 * start position.
 *
 * @param {object} node - The method's AST node.
 * @param {Array<object>} parents - Its ancestors, outermost first.
 * @returns {number} Source offset the contract must be adjacent to.
 * @pure
 */
function anchorStart(node, parents) {
  let anchor = node
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i]
    const wraps = (p.type === 'VariableDeclaration' && p.declarations[0] === anchor)
      || p.type === 'ExportNamedDeclaration'
      || p.type === 'ExportDefaultDeclaration'
      || (p.type === 'VariableDeclarator' && p.init === anchor)
      || p.type === 'ExpressionStatement'
    if (!wraps) break
    anchor = p
  }
  return anchor.start
}

/**
 * Scan one source file for methods and the contracts attached to them.
 *
 * A contract belongs to a method only when nothing but whitespace separates
 * them, which is what stops an unrelated block comment further up the file
 * from being read as one.
 *
 * @param {string} relPath - Repo-relative path.
 * @returns {{file: string, moduleDoc: object|null, methods: Array<object>}} The file's module-level contract and every method in source order, each with `doc: null` when it has none.
 * @throws {Error} When the file cannot be parsed.
 * @sideEffect Reads the file from disk.
 */
export function scanFile(relPath) {
  const source = readFileSync(join(REPO, relPath), 'utf8')
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx'],
    ranges: true,
    attachComment: true,
  })

  // JSDoc blocks keyed by where they end, so a method can look up whether one
  // sits immediately above it with nothing but whitespace in between.
  const docs = (ast.comments || [])
    .filter((c) => c.type === 'CommentBlock' && c.value.startsWith('*'))
    .map((c) => ({ start: c.start, end: c.end, value: c.value, used: false }))

  const found = []
  const constants = []
  const parents = []
  const scope = []

  /**
   * Summarise a constant's value shape without reproducing its implementation.
   *
   * The keys of an exported object are vocabulary, not code: they are the
   * command ids, node types and panel ids that method contracts refer to by
   * role and never enumerate. Publishing them closes the single most-reported
   * gap in the spec pack. Values are deliberately not published — only names,
   * and the primitive value of a scalar.
   *
   * @param {object} node - The initialiser expression.
   * @returns {{kind: string, keys?: string[], length?: number, values?: Array<string|number>, value?: any}|null} A shape summary, or `null` when there is nothing useful to say.
   * @pure
   */
  const shapeOf = (node) => {
    if (!node) return null
    if (node.type === 'ObjectExpression') {
      const props = node.properties
        .filter((pr) => (pr.type === 'ObjectProperty' || pr.type === 'ObjectMethod') && !pr.computed)
      const keys = props.map((pr) => pr.key?.name ?? pr.key?.value).filter((k) => k != null)
      // One level of nesting, because for a registry keyed by kind — node types
      // to their parameters, panels to their metadata — the inner names are the
      // vocabulary, and the outer ones alone say almost nothing.
      const nested = {}
      for (const pr of props) {
        if (pr.value?.type !== 'ObjectExpression') continue
        const inner = pr.value.properties
          .filter((q) => (q.type === 'ObjectProperty' || q.type === 'ObjectMethod') && !q.computed)
          .map((q) => q.key?.name ?? q.key?.value)
          .filter((k) => k != null)
        if (inner.length) nested[pr.key?.name ?? pr.key?.value] = inner
      }
      return Object.keys(nested).length ? { kind: 'object', keys, nested } : { kind: 'object', keys }
    }
    if (node.type === 'ArrayExpression') {
      const lit = node.elements.filter((e) => e && (e.type === 'StringLiteral' || e.type === 'NumericLiteral'))
      const out = { kind: 'array', length: node.elements.length }
      if (lit.length === node.elements.length && node.elements.length) out.values = lit.map((e) => e.value)
      return out
    }
    if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') {
      return { kind: 'literal', value: node.value }
    }
    if (node.type === 'NewExpression' && node.callee.name === 'Set') {
      const arg = node.arguments[0]
      if (arg?.type === 'ArrayExpression') {
        const lit = arg.elements.filter((e) => e?.type === 'StringLiteral')
        return { kind: 'set', length: arg.elements.length, values: lit.length === arg.elements.length ? lit.map((e) => e.value) : undefined }
      }
      return { kind: 'set' }
    }
    return null
  }

  /**
   * Walk the AST, recording every documentable method it finds.
   *
   * @param {any} node - An AST node, array, or anything else, which is ignored.
   * @returns {void}
   * @mutates The enclosing `found` list, and the parent and scope stacks it maintains during the walk.
   */
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node.type) return

    const parent = parents[parents.length - 1] || null
    const hit = classify(node, parent)

    // An exported binding that is not a function is a constant. It carries no
    // method contract, so it is kept out of `methods` and never policed by the
    // coverage ratchet — but its documentation and the names it defines are
    // published.
    if (!hit && node.type === 'VariableDeclarator' && node.id.type === 'Identifier'
        && !scope.length && node.init && !FN_TYPES.has(node.init.type)
        && parents[parents.length - 2]?.type === 'ExportNamedDeclaration') {
      const start = anchorStart(node, parents)
      let doc = null
      for (let i = docs.length - 1; i >= 0; i--) {
        const c = docs[i]
        if (c.end > start) continue
        if (source.slice(c.end, start).trim() === '') { doc = c; c.used = true }
        break
      }
      constants.push({
        name: node.id.name,
        line: node.loc.start.line,
        shape: shapeOf(node.init),
        doc: doc ? parseJsdoc(doc.value) : null,
      })
    }

    if (hit) {
      const start = anchorStart(node, parents)
      // Nearest preceding JSDoc block separated only by whitespace.
      let doc = null
      for (let i = docs.length - 1; i >= 0; i--) {
        const c = docs[i]
        if (c.end > start) continue
        if (source.slice(c.end, start).trim() === '') { doc = c; c.used = true }
        break
      }
      found.push({
        name: hit.name,
        qualified: [...scope, hit.name].join(' > '),
        kind: hit.kind,
        exported: !!(parent && (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportDefaultDeclaration'))
          || !!(parents.length >= 2 && parents[parents.length - 2]?.type === 'ExportNamedDeclaration'
                && parent?.type === 'VariableDeclaration')
          || !!(parents.length >= 3 && parents[parents.length - 3]?.type === 'ExportNamedDeclaration'),
        line: node.loc.start.line,
        params: hit.fn ? paramNames(hit.fn) : [],
        returnsValue: hit.fn ? returnsValue(hit.fn) : false,
        async: !!(hit.fn && hit.fn.async),
        generator: !!(hit.fn && hit.fn.generator),
        doc: doc ? parseJsdoc(doc.value) : null,
      })
      scope.push(hit.name)
    }

    // A property holding a plain object is a namespace, not a method — but its
    // members belong to it. Without pushing it, `layoutOps: { reset() {} }`
    // reports a bare `reset`, and anything deriving a call path from the
    // qualified name emits `store.reset()` instead of `store.layoutOps.reset()`.
    const namespace = node.type === 'ObjectProperty' && !node.computed
      && (node.key.type === 'Identifier' || node.key.type === 'StringLiteral')
      && node.value?.type === 'ObjectExpression'
    if (namespace) scope.push(node.key.name ?? node.key.value)

    parents.push(node)
    for (const k of Object.keys(node)) {
      if (k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'loc') continue
      visit(node[k])
    }
    parents.pop()
    if (namespace) scope.pop()
    if (hit) scope.pop()
  }

  visit(ast.program)

  // A file-level block documents the module only when a blank line separates it
  // from the first statement. Without that test, a JSDoc sitting directly above
  // the first declaration — which is the common case — would be read as the
  // module's description as well as that declaration's.
  const firstStmt = ast.program.body[0]?.start ?? Infinity
  let moduleDoc = docs.length && docs[0].end < firstStmt && !docs[0].used
    && /\n\s*\n/.test(source.slice(docs[0].end, firstStmt))
    ? parseJsdoc(docs[0].value)
    : null

  // Most modules here introduce themselves with a `//` header rather than a
  // JSDoc block — and that header is where the shared vocabulary lives: the
  // shape of a layout node, the ABCD matrix convention, the protocol between
  // windows. Dropping it loses exactly the context a reader needs before any
  // individual method makes sense, so a leading run of line comments counts as
  // the module's documentation when there is no JSDoc block.
  if (!moduleDoc) {
    const header = []
    for (const c of ast.comments || []) {
      if (c.type !== 'CommentLine' || c.start >= firstStmt) break
      // Stop at the first gap: a second, unrelated comment block further down
      // is not part of the header.
      if (header.length && /\n\s*\n/.test(source.slice(header[header.length - 1].end, c.start))) break
      header.push(c)
    }
    if (header.length) {
      const text = header.map((c) => c.value.replace(/^ /, '')).join('\n').trim()
      if (text) {
        moduleDoc = {
          summary: text.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim(),
          description: text,
        }
      }
    }
  }

  return {
    file: relPath,
    moduleDoc,
    methods: found.sort((a, b) => a.line - b.line),
    constants: constants.sort((a, b) => a.line - b.line),
  }
}

/**
 * Scan every source file in scope.
 *
 * @returns {Array<{file: string, moduleDoc: object|null, methods: Array<object>}>} One entry per file, in sorted path order.
 * @throws {Error} When any file fails to parse.
 * @sideEffect Reads the filesystem.
 */
export function scanRepo() {
  return sourceFiles().map(scanFile)
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { walkDir, takeType, takeName, stripDash, paramNames, returnsValue, classify, anchorStart }
