#!/usr/bin/env node
// Turn a contract-suite run into a triage report.
//
// The blind suite's failures are not ordinary test failures. Each one is a
// disagreement between a documented contract and the implementation, and which
// side is wrong is a judgement call — so this deliberately does not "fix"
// anything. It groups failures by the module and method whose contract they
// contradict, and prints the contract clause beside the observed behaviour, so
// the decision can be made with both in view.
//
// Run: npm run test:triage

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, globSync } from 'node:fs'
import { join } from 'node:path'
import { REPO } from './contracts-lib.mjs'

const api = JSON.parse(readFileSync(join(REPO, 'docs/api.json'), 'utf8'))

/**
 * Index every method's contract by name, for looking up what a failure violates.
 *
 * Names can collide across modules, so each entry keeps its module path and
 * ambiguous names are resolved by the test file that reported the failure.
 *
 * @returns {Map<string, Array<{file: string, method: object}>>} Methods keyed by bare name.
 * @pure
 */
function indexContracts() {
  const idx = new Map()
  /**
   * Record one declaration under its bare name.
   *
   * @param {string} name - The method or constant name.
   * @param {{file: string, method: object}} entry - Where it is declared.
   * @returns {void}
   * @mutates The index being built.
   */
  const add = (name, entry) => {
    if (!idx.has(name)) idx.set(name, [])
    idx.get(name).push(entry)
  }
  for (const mod of api.modules) {
    for (const m of mod.methods) add(m.name, { file: mod.file, method: m })
    // Exported constants are contracts too — the suite asserts their key sets
    // and counts, and a failure there should name the module it came from
    // rather than reporting the declaration as unknown.
    for (const c of mod.constants || []) {
      add(c.name, { file: mod.file, method: { contract: null, constant: c } })
    }
  }
  return idx
}

/**
 * Run the contract suite and capture its TAP output.
 *
 * @returns {{code: number, out: string}} The runner's exit code and combined output.
 * @sideEffect Spawns the Node test runner, which imports and executes application code.
 */
function runSuite() {
  // Files are globbed here rather than passing the directory: Node's test
  // runner resolves a directory argument as a module and fails outright.
  const files = globSync('test/contract/*.test.mjs', { cwd: REPO }).sort()
  const r = spawnSync('node', ['--test', '--import', './test/support/setup.mjs', ...files], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  })
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` }
}

/**
 * Extract failing tests from TAP output, with their full diagnostic block.
 *
 * Node emits each failure as a YAML block whose `error` may be a multi-line
 * literal (`error: |-`) holding an assertion diff. Reading only the first line
 * loses exactly the part that says what went wrong, so the block is parsed
 * properly rather than scanned for keys.
 *
 * Test names follow the suite's convention `<method>: <clause>`, which is what
 * lets a failure be traced back to the contract it contradicts.
 *
 * @param {string} out - Raw runner output.
 * @returns {Array<{name: string, method: string, clause: string, message: string, expected: string|null, actual: string|null, location: string|null}>} One entry per failure.
 * @pure
 */
function parseFailures(out) {
  const fails = []
  const lines = out.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const hit = lines[i].match(/^\s*not ok \d+ - (.+)$/)
    if (!hit) continue
    const name = hit[1].trim()

    // The YAML block runs from the `---` on the next line to the closing `...`.
    let j = i + 1
    while (j < lines.length && !/^\s*---\s*$/.test(lines[j])) j++
    const body = []
    for (j += 1; j < lines.length && !/^\s*\.\.\.\s*$/.test(lines[j]); j++) body.push(lines[j])

    /**
     * Read one key out of the failure's YAML block.
     *
     * Handles both an inline scalar and a `|-` literal block, which is how
     * Node emits a multi-line assertion diff.
     *
     * @param {string} key - The YAML key to read.
     * @returns {string|null} The value with quotes stripped, or `null` when the key is absent.
     * @reads the `body` lines captured for the current failure.
     */
    const field = (key) => {
      const at = body.findIndex((l) => new RegExp(`^\\s*${key}:`).test(l))
      if (at < 0) return null
      const inline = body[at].slice(body[at].indexOf(':') + 1).trim()
      if (inline !== '|-' && inline !== '|') return inline.replace(/^['"]|['"]$/g, '')
      // Literal block: everything indented further than the key itself.
      const indent = body[at].search(/\S/)
      const collected = []
      for (let k = at + 1; k < body.length; k++) {
        if (body[k].trim() && body[k].search(/\S/) <= indent) break
        collected.push(body[k].trim())
      }
      return collected.join('\n').trim()
    }

    const [method, ...rest] = name.split(':')
    const loc = field('location')
    fails.push({
      name,
      method: method.trim(),
      clause: rest.join(':').trim() || '(unnamed clause)',
      message: (field('error') || '').slice(0, 600),
      expected: field('expected'),
      actual: field('actual'),
      // Strip the repo prefix so the path is clickable from the repo root.
      location: loc ? loc.replace(REPO, '').replace(/^\/+/, '') : null,
    })
  }
  return fails
}

const { code, out } = runSuite()
const idx = indexContracts()
const fails = parseFailures(out)

const counts = out.match(/^# (pass|fail) (\d+)$/gm) || []
const summary = Object.fromEntries(counts.map((l) => l.replace('# ', '').split(' ')))

const R = ['# Contract suite findings', '',
  'Generated by `npm run test:triage`. Every entry is a **disagreement between a',
  'documented contract and the implementation** — not necessarily a bug in either.',
  'Decide per entry which side is wrong; nothing here is fixed automatically.', '',
  `**Result:** ${summary.pass ?? 0} passing, ${summary.fail ?? 0} failing.`, '']

if (!fails.length) {
  R.push('No disagreements. Every contract the blind suite could express is upheld by the code.')
} else {
  const byMethod = new Map()
  for (const f of fails) {
    if (!byMethod.has(f.method)) byMethod.set(f.method, [])
    byMethod.get(f.method).push(f)
  }
  R.push(`${fails.length} failing assertion(s) across ${byMethod.size} method(s).`, '')

  // An index first, so the shape of the run is visible before the detail.
  R.push('## Index', '')
  R.push('| Method | Failing | Declared in |', '|---|---|---|')
  for (const [method, list] of [...byMethod].sort((a, b) => b[1].length - a[1].length)) {
    const where = (idx.get(method) || []).map((h) => `\`${h.file}\``).join(', ') || '_unknown_'
    R.push(`| [\`${method}\`](#${method.toLowerCase()}--${list.length}-failing) | ${list.length} | ${where} |`)
  }
  R.push('')
  for (const [method, list] of [...byMethod].sort((a, b) => b[1].length - a[1].length)) {
    const hits = idx.get(method) || []
    R.push(`## \`${method}\` — ${list.length} failing`)
    R.push('')
    if (hits.length) {
      R.push(`Declared in: ${hits.map((h) => `\`${h.file}\``).join(', ')}`)
      R.push('')
      const c = hits[0].method.contract
      const clauses = !c ? [] : [
        ...c.pre.map((x) => `@pre ${x}`),
        ...c.post.map((x) => `@post ${x}`),
        ...c.mutates.map((x) => `@mutates ${x}`),
        ...c.sideEffect.map((x) => `@sideEffect ${x}`),
        ...c.reads.map((x) => `@reads ${x}`),
        ...(c.pure ? ['@pure'] : []),
      ]
      if (clauses.length) {
        R.push('Contract clauses:')
        R.push('')
        for (const cl of clauses) R.push(`- \`${cl}\``)
        R.push('')
      }
    } else {
      R.push('_No contract found under this name — the test may be misnamed._', '')
    }
    for (const f of list) {
      R.push(`### ${f.clause}`)
      R.push('')
      if (f.location) R.push(`\`${f.location}\``)
      R.push('')
      if (f.message) {
        R.push('```')
        R.push(f.message)
        if (f.expected != null && !f.message.includes('expected')) {
          R.push(`expected: ${f.expected}`)
          R.push(`actual:   ${f.actual}`)
        }
        R.push('```')
        R.push('')
      }
    }
  }
}

writeFileSync(join(REPO, 'test/contract/FINDINGS.md'), `${R.join('\n')}\n`)
console.log(`test/contract/FINDINGS.md — ${summary.pass ?? 0} passing, ${summary.fail ?? 0} failing`)
process.exit(code === 0 ? 0 : 0) // reporting tool: never fails the build itself
