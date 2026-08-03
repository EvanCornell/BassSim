// Driver-library integrity checks.
//
// The library is large enough now that a bad row would hide rather than
// announce itself, and a driver whose parameters disagree with each other
// produces a plausible-looking simulation of nothing real.
//
// Two tiers. Hard checks are identities the loader controls — the schema, and
// the Cms/Rms the importer derives — and must hold exactly. The audit tier
// covers published values that can legitimately disagree with each other in a
// real catalog; those rows are permitted, but only if they carry a `suspect`
// label, so the count can never grow silently.

import { BUILTIN_DRIVERS, EXT_BY_KEY, CORE_FIELDS } from '../src/data/drivers.js'
import { auditDriver } from '../src/data/driver-audit.js'

let fails = 0
let checks = 0

function check(name, fn) {
  checks++
  const bad = []
  for (const d of BUILTIN_DRIVERS) {
    const msg = fn(d)
    if (msg) bad.push(`${d.brand} ${d.model}: ${msg}`)
  }
  if (bad.length) {
    fails++
    console.log(`FAIL  ${name} — ${bad.length} driver(s)`)
    for (const b of bad.slice(0, 6)) console.log(`        ${b}`)
    if (bad.length > 6) console.log(`        … and ${bad.length - 6} more`)
  } else {
    console.log(`ok    ${name}`)
  }
}

const rel = (a, b) => Math.abs(a - b) / Math.abs(b)

// --- structural ---

check('every solver parameter is present and positive', (d) => {
  for (const f of CORE_FIELDS) {
    if (!f.solver) continue
    const v = d[f.key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return `${f.key} = ${v}`
  }
  return null
})

check('brand and model are non-empty strings', (d) =>
  (typeof d.brand === 'string' && d.brand && typeof d.model === 'string' && d.model)
    ? null : 'missing brand/model')

check('source is declared', (d) =>
  ['official', 'datasheet', 'custom'].includes(d.source) ? null : `source = ${d.source}`)

check('every ext key is declared in the schema', (d) => {
  const undeclared = Object.keys(d.ext).filter((k) => !EXT_BY_KEY[k])
  return undeclared.length ? `undeclared: ${undeclared.join(', ')}` : null
})

check('ext values match their declared type', (d) => {
  for (const [k, v] of Object.entries(d.ext)) {
    const f = EXT_BY_KEY[k]
    if (f.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) return `${k} = ${v}`
    if (f.type === 'text' && typeof v !== 'string') return `${k} = ${v}`
  }
  return null
})

// --- identities the importer is responsible for ---

// Fs is where Cms resonates Mms. The solver takes its resonance from those
// two, so a row failing this would sim at a frequency its own spec sheet
// does not claim. The importer derives Cms from Fs precisely to guarantee it.
check('Fs agrees with Cms and Mms (≤2%)', (d) => {
  const f = 1 / (2 * Math.PI * Math.sqrt((d.Cms * 1e-3) * (d.Mms * 1e-3)))
  return rel(f, d.Fs) <= 0.02 ? null : `implied Fs ${f.toFixed(1)} vs published ${d.Fs}`
})

// Qms = ωs·Mms/Rms, likewise: mechanical damping reaches the solver as Rms.
check('Qms agrees with Rms and Mms (≤3%)', (d) => {
  if (!(d.Qms > 0)) return null
  const q = (2 * Math.PI * d.Fs * (d.Mms * 1e-3)) / d.Rms
  return rel(q, d.Qms) <= 0.03 ? null : `implied Qms ${q.toFixed(2)} vs published ${d.Qms}`
})

// --- sanity ranges ---

// Sd is the radiating area, which cannot exceed the frame it is cut from.
// (No Xvar-versus-Xmax check: B&C's Xvar is a variance-based displacement
// limit, not geometric headroom, and is legitimately below Xmax on 37 of
// their drivers.)
check('Sd is plausible for the stated diameter', (d) => {
  const dia = d.ext.dia
  if (!(dia > 0)) return null
  const sdMax = Math.PI * Math.pow(dia / 20, 2) // full nominal circle, cm²
  return d.Sd <= sdMax ? null : `Sd ${d.Sd} cm² exceeds the ${dia} mm frame`
})

check('Re does not exceed the nominal impedance', (d) =>
  (d.ext.Znom == null || d.Re <= d.ext.Znom) ? null : `Re ${d.Re} > Znom ${d.ext.Znom}`)

// --- the audit ratchet ---

check('rows failing the consistency audit are labelled', (d) => {
  const flags = auditDriver(d)
  if (flags.length && !d.suspect) return `unlabelled: ${flags[0]}`
  return null
})

check('no row is labelled without failing the audit', (d) =>
  (d.suspect && !auditDriver(d).length) ? 'stale suspect label' : null)

// --- uniqueness ---

checks++
const seen = new Set()
const clashes = []
for (const d of BUILTIN_DRIVERS) {
  const k = `${d.brand}|${d.model}`.toLowerCase()
  if (seen.has(k)) clashes.push(k)
  seen.add(k)
}
if (clashes.length) {
  fails++
  console.log(`FAIL  brand+model is unique — ${clashes.length} duplicate(s): ${clashes.slice(0, 5).join(', ')}`)
} else {
  console.log('ok    brand+model is unique')
}

// --- summary ---

const bySource = {}
for (const d of BUILTIN_DRIVERS) {
  const s = (bySource[d.source] ||= { n: 0, suspect: 0 })
  s.n++
  if (d.suspect) s.suspect++
}
console.log()
for (const [src, s] of Object.entries(bySource)) {
  console.log(`  ${src.padEnd(10)} ${String(s.n).padStart(4)} drivers, ${s.suspect} labelled inconsistent`)
}
console.log(`\n${BUILTIN_DRIVERS.length} drivers, ${checks - fails}/${checks} checks passed`)
process.exit(fails ? 1 : 0)
