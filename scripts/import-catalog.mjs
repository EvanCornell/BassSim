#!/usr/bin/env node
// Turn a manufacturer catalog export into a generated driver-database module.
//
//   node scripts/import-catalog.mjs bc
//
// Each profile below names the source file, how to read a row, and how its
// columns map onto our schema. Adding a brand means adding a profile, not
// touching the emitter — so a second catalog lands as data, not as code.
//
// Cms and Rms are derived rather than transcribed: catalogs publish Fs, Mms
// and Qms, and the solver runs on Mms/Cms/Rms. Deriving them from the same
// three numbers guarantees the modeled driver resonates at the published Fs
// with the published mechanical Q, which transcribing a rounded Cms does not.
// Published values (Vas, Qts, …) are always copied verbatim, never recomputed.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { auditDriver } from '../src/data/driver-audit.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- readers ----------

// SpreadsheetML 2003 (.xls that is really XML), as exported by B&C's site.
function readSpreadsheetML(path) {
  const xml = readFileSync(path, 'utf8')
  const rows = []
  for (const [, rowXml] of xml.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)) {
    const cells = []
    for (const [, cellXml] of rowXml.matchAll(/<Cell[^>]*>([\s\S]*?)<\/Cell>/g)) {
      const m = cellXml.match(/<Data[^>]*>([\s\S]*?)<\/Data>/)
      cells.push(m ? decode(m[1]) : '')
    }
    // A self-closing <Cell/> holds no <Data>; keep the column alignment.
    const blanks = (rowXml.match(/<Cell[^>]*\/>/g) || []).length
    for (let i = 0; i < blanks; i++) cells.push('')
    rows.push(cells)
  }
  if (rows.some((r) => r.length !== rows[0].length)) {
    throw new Error('ragged sheet: this reader assumes dense rows (no ss:Index)')
  }
  return rows
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&').trim()

// ---------- cell parsers ----------

// "245.0 (8.65)" → 245.0. Catalogs pair metric with imperial in one cell.
const num = (s) => {
  if (s == null) return undefined
  const m = String(s).split('(')[0].replace(/,/g, '').trim()
  if (m === '' || m === '-' || m === 'N/A') return undefined
  const v = Number.parseFloat(m)
  return Number.isFinite(v) ? v : undefined
}
const text = (s) => {
  const t = String(s ?? '').trim()
  return t === '' || t === '-' ? undefined : t
}
// "35 - 1500" → [35, 1500]
const range = (s) => {
  const parts = String(s ?? '').split(/[-–]/).map((p) => num(p))
  return parts.length === 2 ? parts : [undefined, undefined]
}

const round = (v, dp) => (v == null ? undefined : Number(v.toFixed(dp)))

// ---------- profiles ----------

const PROFILES = {
  bc: {
    brand: 'B&C',
    source: 'official',
    note: 'B&C Speakers online comparison matrix export',
    file: 'data/catalogs/bc-speakers-comparison-matrix.xml',
    out: 'src/data/drivers.bc.js',
    read: readSpreadsheetML,
    // The matrix lists one row per impedance variant under a shared model
    // name, which is also how B&C part-number them: 18SW115-4, 18SW115-8.
    model: (r, c) => `${text(r[c('Name')])}-${num(r[c('Nominal impedance - Ohm')])}`,
    map: {
      Fs: (r, c) => num(r[c('Fs - Hz')]),
      Qts: (r, c) => num(r[c('Qts')]),
      Qes: (r, c) => num(r[c('Qes')]),
      Qms: (r, c) => num(r[c('Qms')]),
      Vas: (r, c) => num(r[c('Vas - dm3 (ft3)')]),
      Re: (r, c) => num(r[c('Re - Ohm')]),
      Bl: (r, c) => num(r[c('Bl - Txm')]),
      Mms: (r, c) => num(r[c('Mms - g')]),
      Sd: (r, c) => num(r[c('Sd - cm2 (in2)')]),
      Le: (r, c) => num(r[c('Le - mH')]),
      Xmax: (r, c) => num(r[c('Xmax - mm')]),
    },
    ext: {
      Xvar: (r, c) => num(r[c('Xvar - mm')]),
      eta0: (r, c) => num(r[c('EtaZero - %')]),
      EBP: (r, c) => num(r[c('EBP - Hz')]),
      dia: (r, c) => num(r[c('Nominal diameter - mm (in)')]),
      Znom: (r, c) => num(r[c('Nominal impedance - Ohm')]),
      Zmin: (r, c) => num(r[c('Minimum impedance - Ohm')]),
      pNom: (r, c) => num(r[c('Nominal power handling - W')]),
      pCont: (r, c) => num(r[c('Continuous power handling - W')]),
      sens: (r, c) => num(r[c('Sensitivity (1W/1m) - dB')]),
      fLow: (r, c) => range(r[c('Frequency range - Hz')])[0],
      fHigh: (r, c) => range(r[c('Frequency range - Hz')])[1],
      vcDia: (r, c) => num(r[c('Voice coil diameter - mm (in)')]),
      vcDepth: (r, c) => num(r[c('Winding depth - mm (in)')]),
      gapDepth: (r, c) => num(r[c('Magnetic gap depth - mm (in)')]),
      flux: (r, c) => num(r[c('Flux density - T')]),
      vcWinding: (r, c) => text(r[c('Winding material')]),
      vcFormer: (r, c) => text(r[c('Former material')]),
      magnet: (r, c) => text(r[c('Magnet material')]),
      pole: (r, c) => text(r[c('Pole design')]),
      spider: (r, c) => text(r[c('Spider')]),
      surround: (r, c) => text(r[c('Surround shape')]),
      cone: (r, c) => text(r[c('Cone shape')]),
      vRec: (r, c) => num(r[c('Recommended enclosure')]),
      fRec: (r, c) => num(r[c('Recommended tuning - Hz')]),
    },
  },
}

// ---------- derivation ----------

// Cms [mm/N] from the suspension resonating Mms [g] at Fs [Hz].
function cmsFrom(Fs, Mms) {
  if (!(Fs > 0) || !(Mms > 0)) return undefined
  const w = 2 * Math.PI * Fs
  return (1 / (w * w * (Mms / 1000))) * 1000
}

// Rms [N·s/m] = ωs · Mms / Qms.
function rmsFrom(Fs, Mms, Qms) {
  if (!(Fs > 0) || !(Mms > 0) || !(Qms > 0)) return undefined
  return (2 * Math.PI * Fs * (Mms / 1000)) / Qms
}

// Sd [cm²] · Xmax [mm] → Vd [L].
function vdFrom(Sd, Xmax) {
  if (!(Sd > 0) || !(Xmax > 0)) return undefined
  return (Sd * 1e-4) * (Xmax * 1e-3) * 1000
}

// ---------- emit ----------

function build(profile) {
  const rows = profile.read(join(ROOT, profile.file))
  const header = rows[0]
  const c = (name) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`column "${name}" not in ${profile.file}`)
    return i
  }

  const out = []
  for (const r of rows.slice(1)) {
    if (!text(r[0])) continue
    const d = { brand: profile.brand, model: profile.model(r, c) }
    for (const [k, fn] of Object.entries(profile.map)) {
      const v = fn(r, c)
      if (v !== undefined) d[k] = v
    }
    d.Cms = round(cmsFrom(d.Fs, d.Mms), 4)
    d.Rms = round(rmsFrom(d.Fs, d.Mms, d.Qms), 2)

    const ext = {}
    for (const [k, fn] of Object.entries(profile.ext)) {
      const v = fn(r, c)
      if (v !== undefined) ext[k] = v
    }
    const vd = round(vdFrom(d.Sd, d.Xmax), 3)
    if (vd !== undefined) ext.Vd = vd
    d.ext = ext
    d.source = profile.source
    // A catalog can contradict itself. Label the row rather than "fixing" a
    // column we have no authority to change.
    const flags = auditDriver(d)
    if (flags.length) d.suspect = flags
    out.push(d)
  }
  return out
}

// One line per driver: long, but it diffs cleanly when a catalog is refreshed.
function emit(profile, drivers) {
  const body = drivers.map((d) => {
    const { ext, source, suspect, ...core } = d
    const kv = Object.entries(core).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    const ex = Object.entries(ext).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    const sus = suspect ? `, suspect: ${JSON.stringify(suspect)}` : ''
    return `  { ${kv.join(', ')}, source: '${source}', ext: { ${ex.join(', ')} }${sus} },`
  }).join('\n')

  return `// GENERATED — do not edit by hand.
// Source: ${profile.note}
//   ${profile.file}
// Regenerate: node scripts/import-catalog.mjs ${profile.key}
//
// Cms and Rms are derived from the published Fs, Mms and Qms; every other
// value is the catalog's own. See scripts/import-catalog.mjs for why.
export const ${profile.varName} = [
${body}
]
`
}

const key = process.argv[2]
const profile = PROFILES[key]
if (!profile) {
  console.error(`usage: import-catalog.mjs <${Object.keys(PROFILES).join('|')}>`)
  process.exit(1)
}
profile.key = key
profile.varName = `${key.toUpperCase()}_DRIVERS`

const drivers = build(profile)
writeFileSync(join(ROOT, profile.out), emit(profile, drivers))
console.log(`${profile.out}: ${drivers.length} drivers from ${profile.brand}`)
