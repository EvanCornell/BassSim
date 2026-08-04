#!/usr/bin/env node
// Generate docs/contracts/ — the specification pack the blind test suite is
// written from.
//
// This exists to make blindness structural rather than a promise. The pack is
// derived mechanically from docs/api.json, which holds contracts and nothing
// else: no function bodies, no expressions, no line contents. An agent given
// only this directory cannot see how a method is implemented, so the tests it
// writes can only encode what the contract claims — which is the entire point.
// If a test fails, that is a genuine disagreement between the contract and the
// code, not a test written to match whatever the code happened to do.
//
// Each method is also given a *reachability* line: how to import it. That is
// the one piece of information a blind author needs that a contract does not
// contain, and it is derived from the export structure rather than the source.
//
// Run: npm run docs:spec

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { REPO } from './contracts-lib.mjs'

const api = JSON.parse(readFileSync(join(REPO, 'docs/api.json'), 'utf8'))

/**
 * Which module-private functions each module re-exports for testing.
 *
 * Read from the `__internals` declarations rather than hardcoded, so the pack
 * stays correct as the test surface changes.
 *
 * @returns {Object<string, string[]>} Internal names keyed by module path.
 * @sideEffect Reads every module's source to find its `__internals` block.
 */
function internalsByModule() {
  const out = {}
  for (const m of api.modules) {
    const src = readFileSync(join(REPO, m.file), 'utf8')
    const hit = src.match(/export const __internals = \{([^}]*)\}/)
    if (hit) out[m.file] = hit[1].split(',').map((s) => s.trim()).filter(Boolean)
  }
  return out
}

const INTERNALS = internalsByModule()

/**
 * How a test can obtain this method, or why it cannot.
 *
 * @param {object} mod - The module entry from api.json.
 * @param {object} m - The method entry.
 * @returns {{reach: string, how: string}} A reachability class and an import recipe.
 * @pure
 */
function reachability(mod, m) {
  const spec = `../../${mod.file.replace(/\.jsx$/, '.jsx')}`
  const nested = m.qualified.includes('>')

  if (m.exported && !nested) {
    if (m.name === 'default') return { reach: 'EXPORTED', how: `import Default from '${spec}'` }
    return { reach: 'EXPORTED', how: `import { ${m.name} } from '${spec}'` }
  }
  if (!nested && (INTERNALS[mod.file] || []).includes(m.name)) {
    return { reach: 'INTERNAL', how: `import { __internals } from '${spec}'  →  __internals.${m.name}` }
  }
  if (mod.file === 'src/store.js' && m.kind === 'method') {
    // The qualified name carries any enclosing namespace object, so a member of
    // `layoutOps` yields the path that actually resolves at runtime rather than
    // a bare action name that does not exist on the store.
    const path = m.qualified.split(' > ').join('.')
    return { reach: 'STORE ACTION', how: `import { useStore } from '../../src/store.js'  →  useStore.getState().${path}(…)` }
  }
  if (mod.file === 'src/keymap.js' && m.name === 'run') {
    return { reach: 'COMMAND', how: `import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)` }
  }
  return {
    reach: 'UNREACHABLE',
    how: 'Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.',
  }
}

/** Contract fields rendered in a fixed order, so the pack reads uniformly. */
const CLAUSES = [
  ['pre', 'Preconditions (caller must guarantee)'],
  ['post', 'Postconditions (must hold on return)'],
  ['invariant', 'Invariants'],
  ['mutates', 'Mutates'],
  ['sideEffect', 'Side effects'],
  ['reads', 'Reads external mutable state'],
]

/**
 * Render one method as a specification block.
 *
 * @param {object} mod - The module entry.
 * @param {object} m - The method entry.
 * @returns {string} Markdown for that method.
 * @pure
 */
function renderMethod(mod, m) {
  const { reach, how } = reachability(mod, m)
  // A destructured parameter has no name in the AST, so the extractor records
  // it positionally as `arg0`. The contract does name it, and printing two
  // different names for one parameter reads as a documentation error — so the
  // documented name wins wherever there is one.
  const named = m.params.filter((p) => !p.name.includes('.'))
  const sig = m.signature.map((s, i) => (/^arg\d+$/.test(s) && named[i] ? named[i].name : s))

  const L = []
  L.push(`### \`${m.qualified}(${sig.join(', ')})\``)
  L.push('')
  L.push(`- **Reachability:** ${reach}`)
  L.push(`- **Obtain via:** ${how}`)
  if (m.async) L.push('- **Async:** returns a Promise')
  L.push('')
  if (m.description) { L.push(m.description); L.push('') }

  if (m.params.length) {
    L.push('**Parameters**')
    L.push('')
    for (const p of m.params) {
      const opt = p.optional ? ` _(optional${p.default != null ? `, default \`${p.default}\`` : ''})_` : ''
      L.push(`- \`${p.name}\` — \`${p.type ?? 'unknown'}\`${opt}${p.desc ? ` — ${p.desc}` : ''}`)
    }
    L.push('')
  }
  if (m.returns) {
    L.push('**Returns**')
    L.push('')
    L.push(`- \`${m.returns.type ?? 'unknown'}\`${m.returns.desc ? ` — ${m.returns.desc}` : ''}`)
    L.push('')
  }
  if (m.throws.length) {
    L.push('**Throws**')
    L.push('')
    for (const t of m.throws) L.push(`- \`${t.type ?? 'Error'}\`${t.desc ? ` — ${t.desc}` : ''}`)
    L.push('')
  }
  for (const [key, label] of CLAUSES) {
    const vals = m.contract[key]
    if (!vals.length) continue
    L.push(`**${label}**`)
    L.push('')
    for (const v of vals) L.push(`- ${v}`)
    L.push('')
  }
  if (m.contract.pure) {
    L.push('**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.')
    L.push('')
  }
  return L.join('\n')
}

/**
 * Render one module's specification file.
 *
 * @param {object} mod - The module entry from api.json.
 * @returns {string} Markdown for the whole module.
 * @pure
 */
function renderModule(mod) {
  const L = []
  L.push(`# Contract specification: \`${mod.file}\``)
  L.push('')
  L.push('> Generated from method contracts. This file contains **no implementation code**.')
  L.push('> Write tests against what is claimed here, not against what you expect the code to do.')
  L.push('')
  if (mod.module?.description) { L.push('## Module'); L.push(''); L.push(mod.module.description); L.push('') }

  if (mod.constants?.length) {
    L.push('## Exported constants')
    L.push('')
    L.push('Names this module publishes that are not methods. The method contracts')
    L.push('above and below refer to these by role — a command, a node type, a panel —')
    L.push('so this is the vocabulary they assume.')
    L.push('')
    for (const c of mod.constants) {
      L.push(`### \`${c.name}\``)
      L.push('')
      if (c.description) { L.push(c.description); L.push('') }
      const sh = c.shape
      if (sh?.kind === 'object' && sh.keys?.length) {
        L.push(`Keys: ${sh.keys.map((k) => `\`${k}\``).join(', ')}`)
        L.push('')
        for (const [outer, inner] of Object.entries(sh.nested || {})) {
          L.push(`- \`${outer}\` holds: ${inner.map((k) => `\`${k}\``).join(', ')}`)
        }
        if (sh.nested) L.push('')
      } else if ((sh?.kind === 'array' || sh?.kind === 'set') && sh.values?.length) {
        L.push(`Values: ${sh.values.map((v) => `\`${v}\``).join(', ')}`)
        L.push('')
      } else if (sh?.kind === 'array') {
        L.push(`An array of ${sh.length} entries.`)
        L.push('')
      } else if (sh?.kind === 'literal') {
        L.push(`Value: \`${JSON.stringify(sh.value)}\``)
        L.push('')
      }
    }
  }

  const groups = { EXPORTED: [], INTERNAL: [], 'STORE ACTION': [], COMMAND: [], UNREACHABLE: [] }
  for (const m of mod.methods) groups[reachability(mod, m).reach].push(m)

  for (const [name, list] of Object.entries(groups)) {
    if (!list.length) continue
    L.push(`## ${name} (${list.length})`)
    L.push('')
    for (const m of list) L.push(renderMethod(mod, m))
  }
  return L.join('\n')
}

const outDir = join(REPO, 'docs/contracts')
// AMBIGUITIES.md is hand-written — the findings a blind author raised about the
// contracts themselves — so it is preserved across a regeneration.
const keep = 'AMBIGUITIES.md'
const kept = existsSync(join(outDir, keep)) ? readFileSync(join(outDir, keep), 'utf8') : null
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
if (kept) writeFileSync(join(outDir, keep), kept)

const index = ['# Contract specification pack', '',
  'One file per module, generated from `docs/api.json`. Contains contracts only —',
  'no implementation. This is the sole input to the blind contract test suite.', '',
  '| Module | Methods | Testable | Unreachable |', '|---|---|---|---|']

let total = 0, testable = 0
for (const mod of api.modules) {
  if (!mod.methods.length) continue
  const name = `${mod.file.replace(/[/.]/g, '_')}.spec.md`
  writeFileSync(join(outDir, name), renderModule(mod))
  const reach = mod.methods.map((m) => reachability(mod, m).reach)
  const un = reach.filter((r) => r === 'UNREACHABLE').length
  total += mod.methods.length
  testable += mod.methods.length - un
  index.push(`| [\`${mod.file}\`](${name}) | ${mod.methods.length} | ${mod.methods.length - un} | ${un} |`)
}
index.push(`| **Total** | **${total}** | **${testable}** | **${total - testable}** |`)
writeFileSync(join(outDir, 'README.md'), `${index.join('\n')}\n`)

console.log(`docs/contracts/ — ${api.modules.filter((m) => m.methods.length).length} modules, ${testable}/${total} methods reachable by a test`)
