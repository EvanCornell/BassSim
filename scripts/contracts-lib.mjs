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

export const REPO = fileURLToPath(new URL('..', import.meta.url))

// Directories walked for documentable source.
export const ROOTS = ['src', 'mcp', 'server', 'scripts', 'test']

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', 'data'])
const SOURCE_EXT = new Set(['.js', '.jsx', '.mjs'])

// Generated or pure-data modules. These hold no executable surface — a
// contract on a 172-element array literal would be noise, and drivers.bc.js is
// rewritten wholesale by `npm run import:catalog`, so anything added by hand
// would not survive the next import.
export const IGNORE_FILES = new Set([
  'src/data/drivers.bc.js',
  'src/data/drivers.legacy.js',
])

// ---------------------------------------------------------------------------
// Tag vocabulary
// ---------------------------------------------------------------------------

// The contract vocabulary, as data so the test can reject anything outside it.
// A typo like `@sideeffect` would otherwise parse cleanly and then silently
// vanish from the generated docs.
//
//   typed — leading {type} is expected, e.g. `@param {number} w - …`
//   text  — free prose payload, e.g. `@pre w >= 0`
//   flag  — no payload, e.g. `@pure`
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

// `@return` and `@returns` mean the same thing; normalize so downstream code
// only ever sees one spelling.
const TAG_ALIASES = { return: 'returns', arg: 'param', argument: 'param', exception: 'throws' }

export const normalizeTag = (t) => TAG_ALIASES[t] || t

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walkDir(dir, out) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkDir(full, out)
    else if (SOURCE_EXT.has(name.slice(name.lastIndexOf('.')))) out.push(full)
  }
  return out
}

/** Every source file in scope, repo-relative and sorted for stable output. */
export function sourceFiles() {
  const out = []
  for (const root of ROOTS) walkDir(join(REPO, root), out)
  return out
    .map((f) => relative(REPO, f).split('\\').join('/'))
    .filter((f) => !IGNORE_FILES.has(f))
    .sort()
}

// ---------------------------------------------------------------------------
// JSDoc block parsing
// ---------------------------------------------------------------------------

// Pull a leading {type} off a tag payload. Written as a brace scan rather than
// a regex so record and union types — {{driver: Driver}}, {Object<string, N>} —
// survive intact instead of being truncated at the first '}'.
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

// `name`, `[name]` and `[name=default]` are all legal JSDoc param names.
function takeName(s) {
  if (s.startsWith('[')) {
    const close = s.indexOf(']')
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

const stripDash = (s) => s.replace(/^-\s*/, '').trim()

/**
 * Parse a raw `/** … *\/` comment body into structured contract fields.
 * `raw` is Babel's `comment.value`: the text between the delimiters.
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
 * Destructured and rest params are reported with a `pattern` kind because
 * their JSDoc name is the author's choice, so only their position is checkable.
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

/** True when the function can return a value, so a `@returns` is expected. */
function returnsValue(fn) {
  if (fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement') return true
  let found = false
  const seen = new Set()
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

// Which node kinds carry a contract. "Absolutely everything" means every
// *named* function binding at any depth — including one-line aliases like
// `export const add = (a, b) => a.add(b)` and helpers declared inside a
// component body. Anonymous functions passed straight to a call or a JSX prop
// are excluded: `filtered.map((d) => …)` has no name to document and a block
// comment there would break up the markup it lives in.
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

// A contract sits above the whole declaration, not above the inner arrow, so
// walk out through the wrappers that share a start position: the arrow in
// `export const f = () => {}` starts well after the comment that documents it.
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
 * Scan one source file and return every documentable method with the contract
 * attached to it (or `doc: null` when it has none).
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
  const parents = []
  const scope = []

  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node.type) return

    const parent = parents[parents.length - 1] || null
    const hit = classify(node, parent)

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

    parents.push(node)
    for (const k of Object.keys(node)) {
      if (k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'loc') continue
      visit(node[k])
    }
    parents.pop()
    if (hit) scope.pop()
  }

  visit(ast.program)

  // A file-level block before the first import/statement documents the module.
  const moduleDoc = docs.length && docs[0].start < (ast.program.body[0]?.start ?? Infinity) && !docs[0].used
    ? parseJsdoc(docs[0].value)
    : null

  return { file: relPath, moduleDoc, methods: found.sort((a, b) => a.line - b.line) }
}

/** Scan the whole repo. */
export function scanRepo() {
  return sourceFiles().map(scanFile)
}
