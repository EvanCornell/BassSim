import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'
import {
  REPO,
  ROOTS,
  IGNORE_FILES,
  IGNORE_DIRS_REL,
  TAGS,
  normalizeTag,
  sourceFiles,
  parseJsdoc,
  scanFile,
  scanRepo,
  __internals,
} from '../../scripts/contracts-lib.mjs'

const {
  walkDir,
  takeType,
  takeName,
  stripDash,
  paramNames,
  returnsValue,
  classify,
  anchorStart,
} = __internals

// UNREACHABLE — not covered:
//   returnsValue > visit
//   scanFile > visit

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Parse a snippet the way the scanner does, so the AST shapes match. */
function ast(code) {
  return parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'objectRestSpread'],
  })
}

/** Depth-first walk yielding [node, parent, parents] for every AST node. */
function* walkAst(node, parent = null, parents = []) {
  if (Array.isArray(node)) {
    for (const n of node) yield* walkAst(n, parent, parents)
    return
  }
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return
  yield [node, parent, parents]
  const next = [...parents, node]
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    yield* walkAst(node[key], node, next)
  }
}

// ===========================================================================
// Exported constants
// ===========================================================================

// CONTRACT: "### `REPO` — Repository root, so scanned paths can be reported
// repo-relative."
test('REPO: is the repository root', () => {
  assert.equal(typeof REPO, 'string')
  assert.ok(path.isAbsolute(REPO))
  assert.equal(path.resolve(REPO), REPO_ROOT)
})

// CONTRACT: "### `ROOTS` — Directories walked for documentable source. Values:
// `src`, `mcp`, `server`, `scripts`, `test`"
test('ROOTS: names exactly the documented directories', () => {
  assert.deepEqual([...ROOTS].sort(), ['mcp', 'scripts', 'server', 'src', 'test'])
})

// CONTRACT: "### `IGNORE_FILES` — Values: `src/data/drivers.bc.js`,
// `src/data/drivers.legacy.js`, `test/support/env.mjs`"
test('IGNORE_FILES: names exactly the documented files', () => {
  assert.deepEqual(
    [...IGNORE_FILES].sort(),
    ['src/data/drivers.bc.js', 'src/data/drivers.legacy.js', 'test/support/env.mjs'],
  )
})

// CONTRACT: "### `IGNORE_DIRS_REL` — Values: `test/contract/`"
test('IGNORE_DIRS_REL: names exactly the documented directories', () => {
  assert.deepEqual([...IGNORE_DIRS_REL], ['test/contract/'])
})

// CONTRACT: "### `TAGS` — The contract vocabulary, as data so the test can
// reject anything outside it. ... Keys: `param`, `returns`, `throws`,
// `yields`, `type`, `typedef`, `property`, `template`, `callback`, `example`,
// `see`, `deprecated`, `pre`, `post`, `invariant`, `mutates`, `sideEffect`,
// `reads`, `pure`"
test('TAGS: is exactly the documented contract vocabulary', () => {
  assert.deepEqual(
    Object.keys(TAGS).sort(),
    [
      'callback', 'deprecated', 'example', 'invariant', 'mutates', 'param', 'post', 'pre',
      'property', 'pure', 'reads', 'returns', 'see', 'sideEffect', 'template', 'throws',
      'type', 'typedef', 'yields',
    ].sort(),
  )
})

// CONTRACT: "### `__internals` — Keys: `walkDir`, `takeType`, `takeName`,
// `stripDash`, `paramNames`, `returnsValue`, `classify`, `anchorStart`"
test('__internals: publishes exactly the documented internal helpers', () => {
  assert.deepEqual(
    Object.keys(__internals).sort(),
    ['anchorStart', 'classify', 'paramNames', 'returnsValue', 'stripDash', 'takeName', 'takeType', 'walkDir'],
  )
})

// ===========================================================================
// normalizeTag
// ===========================================================================

// CONTRACT: "Resolve a tag alias to its canonical name." / "The canonical tag
// name, unchanged when it is not an alias." — with `TAGS` now published, the
// canonical set is known: every TAGS key is its own canonical name.
// AMBIGUITY (remaining): the alias table itself is still not enumerated, so
// which spellings map onto those canonical names cannot be asserted directly.
test('normalizeTag: every TAGS key is its own canonical name', () => {
  for (const t of Object.keys(TAGS)) {
    assert.equal(normalizeTag(t), t, `@${t} is a canonical tag and must not be rewritten`)
  }
})

// CONTRACT: "unchanged when it is not an alias" / "A typo like `@sideeffect`
// would otherwise parse cleanly and then silently vanish from the generated
// docs" — so `sideeffect` is a typo to be rejected, not an alias to absorb.
test('normalizeTag: a tag that is not an alias comes back unchanged', () => {
  assert.equal(normalizeTag('zzz_not_a_tag'), 'zzz_not_a_tag')
  assert.equal(normalizeTag('sideeffect'), 'sideeffect')
  assert.equal(Object.keys(TAGS).includes(normalizeTag('sideeffect')), false)
})

// CONTRACT: "The canonical tag name" — resolution lands in TAGS and is a fixed
// point there, so applying it twice changes nothing.
test('normalizeTag: resolution is idempotent', () => {
  for (const t of [...Object.keys(TAGS), 'return', 'arg', 'argument', 'exception', 'zzz_not_a_tag']) {
    assert.equal(typeof normalizeTag(t), 'string')
    assert.equal(normalizeTag(normalizeTag(t)), normalizeTag(t), `not idempotent for @${t}`)
  }
})

// CONTRACT: @pure
test('normalizeTag: @pure — equal inputs give equal output', () => {
  assert.equal(normalizeTag('param'), normalizeTag('param'))
})

// ===========================================================================
// sourceFiles
// ===========================================================================

// CONTRACT: "Every source file in scope, repo-relative and sorted." /
// "Sorting matters: it is what makes `docs/api.json` stable across runs, so a
// regeneration with no source change produces no diff." / "Repo-relative paths,
// ascending."
test('sourceFiles: returns repo-relative paths in ascending order', () => {
  const files = sourceFiles()
  assert.ok(Array.isArray(files))
  assert.ok(files.length > 0)
  for (const f of files) {
    assert.equal(typeof f, 'string')
    assert.equal(path.isAbsolute(f), false, `${f} is not repo-relative`)
    assert.equal(f.startsWith('..'), false, `${f} escapes the repo`)
    assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} does not exist under the repo root`)
  }
  assert.deepEqual(files, [...files].sort())
  // Stable across runs.
  assert.deepEqual(sourceFiles(), files)
  // No duplicates, or the "no diff" guarantee would not hold.
  assert.equal(new Set(files).size, files.length)
})

// CONTRACT: "Every source file in scope" — scope being `ROOTS`, less
// `IGNORE_FILES` and `IGNORE_DIRS_REL`.
test('sourceFiles: covers exactly the documented scope', () => {
  const files = sourceFiles()
  const roots = [...ROOTS]
  const ignoreFiles = new Set([...IGNORE_FILES])
  for (const f of files) {
    assert.ok(
      roots.some((r) => f === r || f.startsWith(`${r}/`)),
      `${f} lies outside ROOTS`,
    )
    assert.equal(ignoreFiles.has(f), false, `${f} is in IGNORE_FILES but was scanned`)
    for (const d of IGNORE_DIRS_REL) {
      assert.equal(f.startsWith(d), false, `${f} lies under the ignored directory ${d}`)
    }
  }
  // Each root that exists on disk contributes at least one file.
  for (const r of roots) {
    if (!fs.existsSync(path.join(REPO_ROOT, r))) continue
    assert.ok(files.some((f) => f.startsWith(`${r}/`)), `root ${r} contributed nothing`)
  }
})

// ===========================================================================
// parseJsdoc
// ===========================================================================

const RAW = `*
 * Summary line.
 *
 * Longer description here.
 *
 * @param {number} a - The first.
 * @param {string} [b=5] - The second.
 * @returns {boolean} Whether it worked.
 * @throws {Error} When it is bad.
 * @throws {RangeError} When it is out of range.
 * @pre a is finite and
 *   this continues here.
 * @pure
 * @bogusTag whatever
 `

// CONTRACT: "The parsed contract: `summary`, `description`, `params`,
// `returns`, `throws`, the contract arrays, `pure`, plus `unknownTags` and
// `malformed` for the test to report on."
test('parseJsdoc: returns every documented field', () => {
  const d = parseJsdoc(RAW)
  assert.equal(typeof d, 'object')
  for (const k of ['summary', 'description', 'params', 'returns', 'throws', 'pure', 'unknownTags', 'malformed']) {
    assert.ok(k in d, `missing field ${k}`)
  }
  assert.equal(d.summary, 'Summary line.')
  assert.ok(String(d.description).includes('Longer description here.'))
  assert.equal(d.pure, true)
})

// CONTRACT: the parsed `params`, built from `takeType` and `takeName`
// ("Handles all three JSDoc spellings: `name`, `[name]` for optional, and
// `[name=default]`").
test('parseJsdoc: params carry type, name, optionality and default', () => {
  const d = parseJsdoc(RAW)
  assert.ok(Array.isArray(d.params))
  assert.equal(d.params.length, 2)
  assert.equal(d.params[0].name, 'a')
  assert.equal(d.params[0].type, 'number')
  assert.equal(d.params[0].optional, false)
  assert.ok(String(d.params[0].description).includes('The first.'))
  assert.equal(d.params[1].name, 'b')
  assert.equal(d.params[1].type, 'string')
  assert.equal(d.params[1].optional, true)
  assert.equal(d.params[1].default, '5')
})

// CONTRACT: `returns` and `throws` are parsed contract fields.
// AMBIGUITY: the contract does not say whether `throws` is a list; since JSDoc
// permits several @throws and the field is named alongside the plural contract
// arrays, the strict reading is that every one is retained.
test('parseJsdoc: returns and throws are parsed', () => {
  const d = parseJsdoc(RAW)
  assert.equal(d.returns.type, 'boolean')
  assert.ok(String(d.returns.description).includes('Whether it worked.'))
  assert.ok(Array.isArray(d.throws))
  assert.equal(d.throws.length, 2)
  assert.equal(d.throws[0].type, 'Error')
  assert.equal(d.throws[1].type, 'RangeError')
})

// CONTRACT: "Tags continue across lines until the next one, so a long `@pre`
// can be wrapped without losing its tail."
test('parseJsdoc: a wrapped tag keeps its tail', () => {
  const d = parseJsdoc(RAW)
  assert.ok(Array.isArray(d.pre), 'a @pre contract array')
  assert.equal(d.pre.length, 1)
  assert.ok(String(d.pre[0]).includes('a is finite'))
  assert.ok(String(d.pre[0]).includes('this continues here'), 'the wrapped tail was lost')
})

// CONTRACT: "plus `unknownTags` and `malformed` for the test to report on."
test('parseJsdoc: an unrecognised tag is reported in unknownTags', () => {
  const d = parseJsdoc(RAW)
  assert.ok(JSON.stringify(d.unknownTags).includes('bogusTag'), 'the unknown tag was not reported')
  // A document with no unknown tags reports none.
  const clean = parseJsdoc('*\n * Just a summary.\n ')
  assert.equal(JSON.stringify(clean.unknownTags).includes('bogusTag'), false)
})

// CONTRACT: "`pure`" — absent @pure means not pure.
test('parseJsdoc: pure is false without a @pure tag', () => {
  const d = parseJsdoc('*\n * Summary.\n * @param {number} a - x.\n ')
  assert.notEqual(d.pure, true)
})

// CONTRACT: @pure
test('parseJsdoc: @pure — equal inputs give equal output', () => {
  assert.deepEqual(parseJsdoc(RAW), parseJsdoc(RAW))
})

// ===========================================================================
// scanFile
// ===========================================================================

// CONTRACT: "`{file, moduleDoc, methods}` — The file's module-level contract
// and every method in source order, each with `doc: null` when it has none."
test('scanFile: returns the file, its module doc and every method', () => {
  const r = scanFile('mcp/builders.js')
  assert.equal(r.file, 'mcp/builders.js')
  // The module header is captured, not dropped.
  assert.notEqual(r.moduleDoc, null, 'mcp/builders.js has a module header')
  assert.equal(typeof r.moduleDoc, 'object')
  assert.equal(
    r.moduleDoc.summary,
    'Phase-2 helpers for the MCP server: driver lookup, self-calibrating',
    'the module summary is the header\'s first line',
  )
  assert.ok(Array.isArray(r.methods))
  const names = r.methods.map((m) => m.name)
  // Documented exports of that module, per its own contract spec.
  for (const n of ['searchDrivers', 'findDriver', 'driverParams', 'optimizeProject']) {
    assert.ok(names.includes(n), `method ${n} was not found`)
  }
  for (const m of r.methods) {
    assert.ok('doc' in m, `method ${m.name} has no doc field`)
    assert.ok(m.doc === null || typeof m.doc === 'object')
  }
})

// CONTRACT: "A contract belongs to a method only when nothing but whitespace
// separates them, which is what stops an unrelated block comment further up the
// file from being read as one."
test('scanFile: a contract separated by more than whitespace does not attach', (t) => {
  const rel = 'test/contract/tmp-detached-contract.fixture.js'
  const abs = path.join(REPO_ROOT, rel)
  t.after(() => fs.rmSync(abs, { force: true }))
  fs.writeFileSync(
    abs,
    [
      '/**',
      ' * Attached summary.',
      ' */',
      'export function attached() { return 1 }',
      '',
      '/**',
      ' * Detached summary.',
      ' */',
      'const inBetween = 1',
      '',
      'export function detached() { return inBetween }',
      '',
    ].join('\n'),
  )
  const r = scanFile(rel)
  const attached = r.methods.find((m) => m.name === 'attached')
  const detached = r.methods.find((m) => m.name === 'detached')
  assert.ok(attached, 'attached() must be found')
  assert.ok(detached, 'detached() must be found')
  assert.notEqual(attached.doc, null)
  assert.equal(attached.doc.summary, 'Attached summary.')
  assert.equal(detached.doc, null, 'a comment separated by a statement must not attach')
  // "every method in source order"
  assert.ok(
    r.methods.indexOf(attached) < r.methods.indexOf(detached),
    'methods must be in source order',
  )
})

// CONTRACT: @throws Error "When the file cannot be parsed."
test('scanFile: a file that cannot be parsed throws', (t) => {
  const rel = 'test/contract/tmp-unparseable.fixture.js'
  const abs = path.join(REPO_ROOT, rel)
  t.after(() => fs.rmSync(abs, { force: true }))
  fs.writeFileSync(abs, 'export function ( { := this is not javascript\n')
  assert.throws(() => scanFile(rel), Error)
  // Neighbouring valid input.
  assert.doesNotThrow(() => scanFile('mcp/builders.js'))
})

// ===========================================================================
// scanRepo
// ===========================================================================

// CONTRACT: "Scan every source file in scope." / "One entry per file, in sorted
// path order."
test('scanRepo: one entry per source file, in sorted path order', () => {
  const all = scanRepo()
  assert.ok(Array.isArray(all))
  const files = all.map((e) => e.file)
  assert.deepEqual(files, sourceFiles(), 'scanRepo must cover exactly sourceFiles(), in the same order')
  assert.deepEqual(files, [...files].sort())
  for (const e of all) {
    assert.ok(e.moduleDoc === null || typeof e.moduleDoc === 'object')
    assert.ok(Array.isArray(e.methods))
  }
})

// ===========================================================================
// walkDir
// ===========================================================================

// CONTRACT: "Collect source files under a directory, recursively." /
// "`string[]` — The same array." / @mutates "The `out` array."
test('walkDir: appends to the accumulator in place and returns it', () => {
  const out = []
  const r = walkDir(path.join(REPO_ROOT, 'mcp'), out)
  assert.equal(r, out, 'the same array must be returned')
  assert.ok(out.length > 0)
  for (const f of out) assert.equal(typeof f, 'string')
})

// CONTRACT: "An unreadable directory is skipped rather than throwing, so a
// missing optional root does not break the scan."
test('walkDir: an unreadable directory is skipped rather than throwing', () => {
  const out = ['pre-existing']
  let r
  assert.doesNotThrow(() => {
    r = walkDir(path.join(REPO_ROOT, 'no-such-directory-xyz'), out)
  })
  assert.equal(r, out)
  assert.deepEqual(out, ['pre-existing'])
})

// ===========================================================================
// takeType
// ===========================================================================

// CONTRACT: "Written as a brace scan rather than a regex so record and union
// types — `{{driver: Driver}}`, `{Object<string, N>}` — survive intact instead
// of being truncated at the first `}`."
test('takeType: nested record and generic types survive intact', () => {
  const [t1, rest1] = takeType('{{a: B}} the rest')
  assert.equal(t1, '{a: B}')
  assert.equal(rest1.trim(), 'the rest')

  const [t2, rest2] = takeType('{Object<string, number>} the rest')
  assert.equal(t2, 'Object<string, number>')
  assert.equal(rest2.trim(), 'the rest')

  const [t3] = takeType('{{driver: {model: string}}} x')
  assert.equal(t3, '{driver: {model: string}}')
})

// CONTRACT: "Pull a leading `{type}` off a tag payload." / union types
test('takeType: a plain and a union type are pulled off', () => {
  const [plain, plainRest] = takeType('{number} a - x')
  assert.equal(plain, 'number')
  assert.equal(plainRest.trim(), 'a - x')
  const [t] = takeType("{'a'|'b'|'c'} x")
  assert.equal(t, "'a'|'b'|'c'")
  const [u] = takeType('{number|null} x')
  assert.equal(u, 'number|null')
})

// CONTRACT: "the type is `null` when there was none or the braces were
// unbalanced."
test('takeType: no braces or unbalanced braces give a null type', () => {
  assert.deepEqual(takeType('a - no type here'), [null, 'a - no type here'])
  assert.equal(takeType('{Object<string, number> a - x')[0], null)
  assert.equal(takeType('{{a: B} a - x')[0], null)
  assert.equal(takeType('')[0], null)
})

// CONTRACT: @pure
test('takeType: @pure — equal inputs give equal output', () => {
  assert.deepEqual(takeType('{{a: B}} rest'), takeType('{{a: B}} rest'))
})

// ===========================================================================
// takeName
// ===========================================================================

// CONTRACT: "Handles all three JSDoc spellings: `name`, `[name]` for optional,
// and `[name=default]`." / "`[string|null, boolean, string|null, string]` — The
// name, whether it was optional, its default, and the remaining text."
test('takeName: all three JSDoc name spellings work', () => {
  const [n1, o1, d1, r1] = takeName('a - The first.')
  assert.equal(n1, 'a')
  assert.equal(o1, false)
  assert.equal(d1, null)
  assert.ok(r1.includes('The first.'))

  const [n2, o2, d2, r2] = takeName('[a] - The first.')
  assert.equal(n2, 'a')
  assert.equal(o2, true)
  assert.equal(d2, null)
  assert.ok(r2.includes('The first.'))

  const [n3, o3, d3, r3] = takeName('[a=5] - The first.')
  assert.equal(n3, 'a')
  assert.equal(o3, true)
  assert.equal(d3, '5')
  assert.ok(r3.includes('The first.'))
})

// CONTRACT: "The name ... `string|null`" — null when there is no name.
test('takeName: an empty payload yields a null name', () => {
  const [n, o, d] = takeName('')
  assert.equal(n, null)
  assert.equal(o, false)
  assert.equal(d, null)
})

// CONTRACT: dotted property names are ordinary JSDoc names.
test('takeName: a dotted property name is taken whole', () => {
  assert.equal(takeName('spec.driver - x')[0], 'spec.driver')
  assert.equal(takeName('[spec.count=1] - x')[0], 'spec.count')
  assert.equal(takeName('[spec.count=1] - x')[2], '1')
})

// CONTRACT: @pure
test('takeName: @pure — equal inputs give equal output', () => {
  assert.deepEqual(takeName('[a=5] - x'), takeName('[a=5] - x'))
})

// ===========================================================================
// stripDash
// ===========================================================================

// CONTRACT: "Remove the optional `-` separating a parameter name from its
// description." / "The description alone."
test('stripDash: the optional dash separator is removed', () => {
  assert.equal(stripDash('- The description.'), 'The description.')
  assert.equal(stripDash(' - The description.'), 'The description.')
  assert.equal(stripDash('The description.'), 'The description.')
  // Only the separator goes: a dash inside the text stays.
  assert.equal(stripDash('- A well-known thing.'), 'A well-known thing.')
})

// CONTRACT: @pure
test('stripDash: @pure — equal inputs give equal output', () => {
  assert.equal(stripDash('- x'), stripDash('- x'))
})

// ===========================================================================
// paramNames
// ===========================================================================

function firstFunction(code) {
  for (const [node] of walkAst(ast(code).program)) {
    if (/Function/.test(node.type) || node.type === 'ArrowFunctionExpression') return node
  }
  return null
}

// CONTRACT: "Parameter names as the signature actually declares them." /
// "`Array<{kind: 'name'|'rest'|'pattern', name: string, optional: boolean}>` —
// One descriptor per declared parameter, in order." / "Destructured and rest
// params are reported with a `pattern` kind"
test('paramNames: one descriptor per declared parameter, in order', () => {
  const fn = firstFunction('function f(a, { b }, [c], ...rest) {}')
  const p = paramNames(fn)
  assert.ok(Array.isArray(p))
  assert.equal(p.length, 4)
  assert.equal(p[0].kind, 'name')
  assert.equal(p[0].name, 'a')
  assert.equal(p[0].optional, false)
  assert.equal(p[1].kind, 'pattern')
  assert.equal(p[2].kind, 'pattern')
  assert.equal(p[3].kind, 'rest')
  for (const d of p) {
    assert.equal(typeof d.name, 'string')
    assert.equal(typeof d.optional, 'boolean')
  }
})

// CONTRACT: "`optional`" — a defaulted parameter is optional.
test('paramNames: a defaulted parameter is reported optional', () => {
  const p = paramNames(firstFunction('function f(a, b = 1) {}'))
  assert.equal(p.length, 2)
  assert.equal(p[0].optional, false)
  assert.equal(p[1].kind, 'name')
  assert.equal(p[1].name, 'b')
  assert.equal(p[1].optional, true)
})

// CONTRACT: "Destructured ... params are reported with a `pattern` kind,
// because their JSDoc name is the author's choice — only their position is
// checkable."
test('paramNames: a defaulted destructured parameter is still a pattern', () => {
  const p = paramNames(firstFunction('function f({ a } = {}) {}'))
  assert.equal(p.length, 1)
  assert.equal(p[0].kind, 'pattern')
  assert.equal(p[0].optional, true)
})

// CONTRACT: @pure
test('paramNames: @pure — equal results for the same node', () => {
  const fn = firstFunction('function f(a, { b }, ...rest) {}')
  assert.deepEqual(paramNames(fn), paramNames(fn))
})

// ===========================================================================
// returnsValue
// ===========================================================================

// CONTRACT: "True for a concise arrow body, or a body containing a `return`
// with an argument."
test('returnsValue: true for a concise arrow body and for a returned value', () => {
  assert.equal(returnsValue(firstFunction('const f = () => 1')), true)
  assert.equal(returnsValue(firstFunction('function f() { return 1 }')), true)
  assert.equal(returnsValue(firstFunction('function f() { if (x) { return 1 } }')), true)
  assert.equal(returnsValue(firstFunction('const f = () => ({ a: 1 })')), true)
})

// CONTRACT: "True for ... a body containing a `return` with an argument."
test('returnsValue: false without a value-returning return', () => {
  assert.equal(returnsValue(firstFunction('function f() { return }')), false)
  assert.equal(returnsValue(firstFunction('function f() { const a = 1 }')), false)
  assert.equal(returnsValue(firstFunction('const f = () => { g() }')), false)
})

// CONTRACT: "A nested function's returns belong to that function, so the walk
// stops at any function boundary below the one being examined."
test('returnsValue: a nested function\'s return does not count', () => {
  assert.equal(returnsValue(firstFunction('function f() { const g = () => 1; g() }')), false)
  assert.equal(returnsValue(firstFunction('function f() { function g() { return 1 } g() }')), false)
  assert.equal(returnsValue(firstFunction('function f() { [1].map((d) => d + 1) }')), false)
})

// CONTRACT: @pure
test('returnsValue: @pure — equal results for the same node', () => {
  const fn = firstFunction('function f() { return 1 }')
  assert.equal(returnsValue(fn), returnsValue(fn))
})

// ===========================================================================
// classify
// ===========================================================================

/** Every name classify() recognises anywhere in a snippet. */
function classifiedNames(code) {
  const out = []
  for (const [node, parent] of walkAst(ast(code).program)) {
    const c = classify(node, parent)
    if (c) {
      assert.equal(typeof c.name, 'string')
      assert.equal(typeof c.kind, 'string')
      assert.ok(c.fn === null || typeof c.fn === 'object')
      out.push(c.name)
    }
  }
  return out
}

// CONTRACT: "\"Absolutely everything\" means every *named* function binding at
// any depth — including one-line aliases like `export const add = (a, b) =>
// a.add(b)` and helpers declared inside a component body."
test('classify: every named function binding at any depth is a method', () => {
  const names = classifiedNames(
    'export const add = (a, b) => a.add(b)\n' +
      'function outer() {\n' +
      '  const helper = () => 1\n' +
      '  return helper()\n' +
      '}\n',
  )
  for (const n of ['add', 'outer', 'helper']) {
    assert.ok(names.includes(n), `${n} was not classified as a method`)
  }
})

// CONTRACT: "Anonymous functions passed straight to a call or a JSX prop are
// excluded: `filtered.map((d) => …)` has no name to document"
test('classify: anonymous functions passed to a call or a JSX prop are excluded', () => {
  const names = classifiedNames('function outer(filtered) { return filtered.map((d) => d + 1) }')
  assert.deepEqual(new Set(names), new Set(['outer']))

  const jsx = classifiedNames('function C() { return <button onClick={() => go()} /> }')
  assert.deepEqual(new Set(jsx), new Set(['C']))
})

// CONTRACT: "`parent` — Its parent, needed to recognise a default export." /
// "`{name, kind, fn}|null` — ... or `null` when the node is not a method."
test('classify: a default export is recognised, and non-methods classify to null', () => {
  const names = classifiedNames('export default function Widget() { return 1 }')
  assert.ok(names.includes('Widget'))
  // A node that is plainly not a method.
  const program = ast('const x = 1').program
  for (const [node, parent] of walkAst(program)) {
    if (node.type === 'NumericLiteral') assert.equal(classify(node, parent), null)
  }
})

// CONTRACT: @pure
test('classify: @pure — equal results for the same node', () => {
  const code = 'export const add = (a, b) => a.add(b)'
  assert.deepEqual(classifiedNames(code), classifiedNames(code))
})

// ===========================================================================
// anchorStart
// ===========================================================================

// CONTRACT: "A contract sits above the whole declaration, not above the inner
// arrow: in `export const f = () => {}` the arrow starts well after the comment
// that documents it, so this walks out through the wrappers that share a start
// position." / "Source offset the contract must be adjacent to."
test('anchorStart: walks out to the declaration the contract sits above', () => {
  const code = '/** Doc. */\nexport const f = () => {}\n'
  const program = ast(code).program
  let arrow = null
  let arrowParents = null
  let exportDecl = null
  for (const [node, , parents] of walkAst(program)) {
    if (node.type === 'ExportNamedDeclaration') exportDecl = node
    if (node.type === 'ArrowFunctionExpression') {
      arrow = node
      arrowParents = parents
    }
  }
  assert.ok(arrow && exportDecl)
  const a = anchorStart(arrow, arrowParents)
  assert.equal(typeof a, 'number')
  assert.ok(a < arrow.start, 'the anchor must sit before the inner arrow')
  assert.equal(a, exportDecl.start, 'the anchor is the whole export declaration')
  // The doc comment ends exactly where the anchor begins, modulo whitespace.
  assert.equal(code.slice(code.indexOf('*/') + 2, a).trim(), '')
})

// CONTRACT: "this walks out through the wrappers that share a start position"
// — a plain declaration has nothing to walk out through.
test('anchorStart: a plain declaration anchors at itself', () => {
  const code = '/** Doc. */\nfunction f() {}\n'
  const program = ast(code).program
  let fn = null
  let parents = null
  for (const [node, , ps] of walkAst(program)) {
    if (node.type === 'FunctionDeclaration') {
      fn = node
      parents = ps
    }
  }
  assert.ok(fn)
  assert.equal(anchorStart(fn, parents), fn.start)
})

// CONTRACT: @pure
test('anchorStart: @pure — equal results for the same node', () => {
  const program = ast('export const f = () => {}').program
  let arrow = null
  let parents = null
  for (const [node, , ps] of walkAst(program)) {
    if (node.type === 'ArrowFunctionExpression') {
      arrow = node
      parents = ps
    }
  }
  assert.equal(anchorStart(arrow, parents), anchorStart(arrow, parents))
})
