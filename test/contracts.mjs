#!/usr/bin/env node
// Method-contract ratchet.
//
// Contracts rot the moment nothing checks them: a parameter gets renamed, the
// JSDoc keeps the old name, and the generated documentation is now confidently
// wrong — worse than absent. This test fails the build on that.
//
// It deliberately checks only what a machine can know for certain. Whether
// `@pre w >= 0` is *true* is a human question; whether the function documents
// a parameter it does not have is not.
//
// Mirrors test/drivers.mjs in shape and output so `npm test` reads uniformly.

import { scanRepo, TAGS } from '../scripts/contracts-lib.mjs'

const modules = scanRepo()
const all = modules.flatMap((m) => m.methods.map((x) => ({ ...x, file: m.file })))

const failures = []
let checksRun = 0

/**
 * Run one predicate over every method and report the result.
 *
 * Failures are truncated to the first twelve, since an early-stage file can
 * fail every check at once and a wall of output hides which check matters.
 *
 * @param {string} label - Check description, printed either way.
 * @param {(method: object) => string|null} fn - Returns a problem description, or `null` when the method passes.
 * @returns {void}
 * @mutates Appends to the module-level failure list and bumps the check count.
 * @sideEffect Prints the result line and up to twelve failures.
 */
function check(label, fn) {
  checksRun++
  const bad = []
  for (const m of all) {
    const msg = fn(m)
    if (msg) bad.push(`${m.file}:${m.line}  ${m.qualified} — ${msg}`)
  }
  if (bad.length) failures.push({ label, bad })
  const mark = bad.length ? 'FAIL' : 'ok  '
  console.log(`  ${mark} ${label}${bad.length ? ` (${bad.length})` : ''}`)
  if (bad.length) for (const b of bad.slice(0, 12)) console.log(`       ${b}`)
  if (bad.length > 12) console.log(`       … and ${bad.length - 12} more`)
}

console.log(`\ncontracts: ${modules.length} modules, ${all.length} methods\n`)

// --- presence ---------------------------------------------------------------

check('every method has a contract', (m) => (m.doc ? null : 'no JSDoc contract'))

check('every contract has a summary line', (m) =>
  (m.doc && !m.doc.summary ? 'contract has tags but no description' : null))

// --- signature agreement ----------------------------------------------------

/**
 * A contract's top-level `@param` entries.
 *
 * Sub-properties like `@param {number} opts.gain` document a field of a
 * parameter, not a parameter, so they are excluded from the positional
 * comparison against the signature.
 *
 * @param {object} doc - A parsed contract.
 * @returns {Array<object>} Only the entries describing whole parameters.
 * @pure
 */
const topLevel = (doc) => doc.params.filter((p) => !p.name.includes('.'))

check('@param list matches the signature arity', (m) => {
  if (!m.doc) return null
  const documented = topLevel(m.doc)
  if (documented.length !== m.params.length) {
    return `signature takes ${m.params.length} param(s) (${m.params.map((p) => p.name).join(', ') || 'none'}), contract documents ${documented.length}`
  }
  return null
})

check('@param names match the signature', (m) => {
  if (!m.doc) return null
  const documented = topLevel(m.doc)
  if (documented.length !== m.params.length) return null // reported above
  for (let i = 0; i < m.params.length; i++) {
    const sig = m.params[i]
    // A destructured param has no name of its own, so only its position is
    // meaningful — the author picks whatever reads best (`props`, `opts`).
    if (sig.kind === 'pattern') continue
    const got = documented[i].name.replace(/^\.\.\./, '')
    if (got !== sig.name) return `param ${i + 1} is '${sig.name}' but the contract calls it '${got}'`
  }
  return null
})

check('every @param declares a type', (m) => {
  if (!m.doc) return null
  const untyped = m.doc.params.filter((p) => !p.type).map((p) => p.name)
  return untyped.length ? `untyped @param: ${untyped.join(', ')}` : null
})

// --- returns ----------------------------------------------------------------

check('value-returning methods document @returns', (m) => {
  if (!m.doc) return null
  if (m.returnsValue && !m.doc.returns) return 'returns a value but has no @returns'
  return null
})

check('@returns declares a type', (m) =>
  (m.doc?.returns && !m.doc.returns.type ? '@returns has no {type}' : null))

// `@returns {void}` is the conventional way to say "returns nothing on
// purpose", so it is the one annotation allowed on a method with no return
// value. Any other type there is a claim the body does not back up.
const VOID_TYPES = new Set(['void', 'undefined'])

check('no @returns on a method that never returns a value', (m) => {
  if (!m.doc || !m.doc.returns) return null
  if (m.returnsValue || m.async || m.generator) return null
  if (VOID_TYPES.has(m.doc.returns.type)) return null
  return `@returns {${m.doc.returns.type}} documented but the body returns nothing`
})

// --- contract discipline ----------------------------------------------------

// The point of the exercise: every method states whether it is safe to call
// twice. A method that is neither @pure nor discloses an effect has simply not
// been thought about yet.
check('every method discloses its effects (@pure / @sideEffect / @mutates / @reads)', (m) => {
  if (!m.doc) return null
  const c = m.doc
  if (c.pure || c.sideEffect.length || c.mutates.length || c.reads.length) return null
  return 'no @pure, @sideEffect, @mutates or @reads'
})

// `@pure` is the strongest claim in the vocabulary — no effects and
// deterministic in its arguments. Anything that mutates, performs I/O or
// depends on mutable outer state contradicts it outright, and a contract that
// contradicts itself is worse than none.
check('@pure is not combined with an effect tag', (m) => {
  if (!m.doc) return null
  const c = m.doc
  if (c.pure && (c.sideEffect.length || c.mutates.length || c.reads.length)) {
    return '@pure contradicts @sideEffect/@mutates/@reads on the same method'
  }
  return null
})

// --- vocabulary -------------------------------------------------------------

check('contract tags come from the known vocabulary', (m) => {
  if (!m.doc || !m.doc.unknownTags.length) return null
  return `unknown tag(s): ${[...new Set(m.doc.unknownTags)].map((t) => `@${t}`).join(', ')} — known: ${Object.keys(TAGS).map((t) => `@${t}`).join(', ')}`
})

check('contract tags are well formed', (m) =>
  (m.doc?.malformed.length ? m.doc.malformed.join('; ') : null))

// --- report -----------------------------------------------------------------

const documented = all.filter((m) => m.doc).length
console.log(`\n  ${documented}/${all.length} methods documented`)

if (failures.length) {
  const n = failures.reduce((s, f) => s + f.bad.length, 0)
  console.log(`\n${failures.length} of ${checksRun} checks failed (${n} method(s))\n`)
  process.exit(1)
}
console.log(`\nall ${checksRun} checks passed\n`)
