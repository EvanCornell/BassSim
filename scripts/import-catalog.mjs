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

/**
 * Repository root, so profile paths can be written relative to it.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- readers ----------

/**
 * Read a SpreadsheetML 2003 file — an `.xls` that is really XML.
 *
 * This is what B&C's site exports. Parsed with regex rather than an XML
 * library because the format is machine-generated and utterly regular, and
 * this is a build-time script that should not pull a parser into the tree.
 *
 * Self-closing `<Cell/>` elements hold no `<Data>` but still occupy a
 * column, so they are counted and padded — without that, every value after
 * the first blank cell would shift left by one.
 *
 * @param {string} path - Absolute path to the export.
 * @returns {string[][]} Rows of decoded cell strings, header row first.
 * @throws {Error} When the rows are ragged, which means the sheet uses `ss:Index` to skip columns — a format this reader does not handle, and which would silently misalign every column if ignored.
 * @sideEffect Reads the file from disk.
 */
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

/**
 * Decode XML entities and trim a cell's text.
 *
 * `&amp;` is replaced last, so an escaped `&amp;lt;` does not become `<`.
 *
 * @param {string} s - Raw cell text.
 * @returns {string} The decoded, trimmed value.
 * @pure
 */
const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&').trim()

// ---------- cell parsers ----------

/**
 * Parse a numeric cell, taking the metric half of a metric/imperial pair.
 *
 * Catalogs write `245.0 (8.65)` in one cell; everything from the bracket on
 * is imperial and discarded. Placeholders for "not published" — blank, `-`,
 * `N/A` — become `undefined` rather than 0, which would be a real value.
 *
 * @param {string|null|undefined} s - Raw cell text.
 * @returns {number|undefined} The parsed number, or `undefined` when the cell holds no value.
 * @pure
 */
const num = (s) => {
  if (s == null) return undefined
  const m = String(s).split('(')[0].replace(/,/g, '').trim()
  if (m === '' || m === '-' || m === 'N/A') return undefined
  const v = Number.parseFloat(m)
  return Number.isFinite(v) ? v : undefined
}
/**
 * Parse a text cell, treating blanks and dashes as absent.
 *
 * @param {string|null|undefined} s - Raw cell text.
 * @returns {string|undefined} The trimmed text, or `undefined` when the cell is empty.
 * @pure
 */
const text = (s) => {
  const t = String(s ?? '').trim()
  return t === '' || t === '-' ? undefined : t
}
/**
 * Parse a range cell such as `35 - 1500` into its two ends.
 *
 * Splits on both the ASCII hyphen and the en dash, since catalogs use both.
 *
 * @param {string|null|undefined} s - Raw cell text.
 * @returns {[number|undefined, number|undefined]} The low and high ends, both `undefined` when the cell is not a range.
 * @pure
 */
const range = (s) => {
  const parts = String(s ?? '').split(/[-–]/).map((p) => num(p))
  return parts.length === 2 ? parts : [undefined, undefined]
}

/**
 * Round a derived value for output, preserving absent values.
 *
 * @param {number|null|undefined} v - The value.
 * @param {number} dp - Decimal places.
 * @returns {number|undefined} The rounded value, or `undefined` when there was none.
 * @pure
 */
const round = (v, dp) => (v == null ? undefined : Number(v.toFixed(dp)))

// ---------- profiles ----------

/**
 * Catalog import profiles, keyed by the name passed on the command line.
 *
 * Each names its source file, how to read it, and how its columns map onto
 * the schema. Adding a brand means adding a profile, not touching the
 * emitter — so a second catalog lands as data, not as code.
 */
const PROFILES = {
  bc: {
    brand: 'B&C',
    source: 'official',
    note: 'B&C Speakers online comparison matrix export',
    file: 'data/catalogs/bc-speakers-comparison-matrix.xml',
    out: 'src/data/drivers.bc.js',
    read: readSpreadsheetML,
    /**
     * The model name, including the impedance suffix.
     *
     * The matrix lists one row per impedance variant under a shared model name,
     * which is also how B&C part-number them: 18SW115-4, 18SW115-8. Without the
     * suffix the two rows would collide.
     *
     * @param {string[]} r - The source row.
     * @param {(name: string) => number} c - Resolve a column index by header name.
     * @returns {string} The full model name.
     * @pure
     */
    model: (r, c) => `${text(r[c('Name')])}-${num(r[c('Nominal impedance - Ohm')])}`,
    map: {
      /**
       * Free-air resonance, Hz.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Fs: (r, c) => num(r[c('Fs - Hz')]),
      /**
       * Total Q at Fs.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Qts: (r, c) => num(r[c('Qts')]),
      /**
       * Electrical Q at Fs.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Qes: (r, c) => num(r[c('Qes')]),
      /**
       * Mechanical Q at Fs.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Qms: (r, c) => num(r[c('Qms')]),
      /**
       * Equivalent compliance volume, litres.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Vas: (r, c) => num(r[c('Vas - dm3 (ft3)')]),
      /**
       * Voice-coil DC resistance, ohms.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Re: (r, c) => num(r[c('Re - Ohm')]),
      /**
       * Motor force factor, T·m.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Bl: (r, c) => num(r[c('Bl - Txm')]),
      /**
       * Moving mass including air load, grams.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Mms: (r, c) => num(r[c('Mms - g')]),
      /**
       * Effective radiating area, cm².
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Sd: (r, c) => num(r[c('Sd - cm2 (in2)')]),
      /**
       * Voice-coil inductance, mH.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Le: (r, c) => num(r[c('Le - mH')]),
      /**
       * Linear excursion limit one way, mm.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Xmax: (r, c) => num(r[c('Xmax - mm')]),
    },
    ext: {
      /**
       * Variance-based displacement limit, mm. B&C publish this below Xmax; it is not geometric headroom.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Xvar: (r, c) => num(r[c('Xvar - mm')]),
      /**
       * Reference half-space efficiency, percent.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      eta0: (r, c) => num(r[c('EtaZero - %')]),
      /**
       * Efficiency bandwidth product, Hz.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      EBP: (r, c) => num(r[c('EBP - Hz')]),
      /**
       * Nominal diameter, mm.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      dia: (r, c) => num(r[c('Nominal diameter - mm (in)')]),
      /**
       * Nominal impedance, ohms.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Znom: (r, c) => num(r[c('Nominal impedance - Ohm')]),
      /**
       * Minimum impedance, ohms.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      Zmin: (r, c) => num(r[c('Minimum impedance - Ohm')]),
      /**
       * Nominal (AES) power handling, W.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      pNom: (r, c) => num(r[c('Nominal power handling - W')]),
      /**
       * Continuous program power handling, W.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      pCont: (r, c) => num(r[c('Continuous power handling - W')]),
      /**
       * Sensitivity at 1 W / 1 m, dB.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      sens: (r, c) => num(r[c('Sensitivity (1W/1m) - dB')]),
      /**
       * Low end of the usable frequency range, Hz.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      fLow: (r, c) => range(r[c('Frequency range - Hz')])[0],
      /**
       * High end of the usable frequency range, Hz.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      fHigh: (r, c) => range(r[c('Frequency range - Hz')])[1],
      /**
       * Voice coil diameter, mm.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      vcDia: (r, c) => num(r[c('Voice coil diameter - mm (in)')]),
      /**
       * Winding depth, mm.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      vcDepth: (r, c) => num(r[c('Winding depth - mm (in)')]),
      /**
       * Magnetic gap depth, mm.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      gapDepth: (r, c) => num(r[c('Magnetic gap depth - mm (in)')]),
      /**
       * Gap flux density, T.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      flux: (r, c) => num(r[c('Flux density - T')]),
      /**
       * Voice coil winding material.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {string|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      vcWinding: (r, c) => text(r[c('Winding material')]),
      /**
       * Voice coil former material.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {string|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      vcFormer: (r, c) => text(r[c('Former material')]),
      /**
       * Magnet material.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {string|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      magnet: (r, c) => text(r[c('Magnet material')]),
      /**
       * Pole piece design.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {string|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      pole: (r, c) => text(r[c('Pole design')]),
      /**
       * Spider construction.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {string|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      spider: (r, c) => text(r[c('Spider')]),
      /**
       * Surround shape.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {string|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      surround: (r, c) => text(r[c('Surround shape')]),
      /**
       * Cone shape.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {string|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      cone: (r, c) => text(r[c('Cone shape')]),
      /**
       * Recommended enclosure volume, litres.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      vRec: (r, c) => num(r[c('Recommended enclosure')]),
      /**
       * Recommended tuning frequency, Hz.
       * @param {string[]} r - The source row.
       * @param {(name: string) => number} c - Resolve a column index by header name.
       * @returns {number|undefined} The parsed cell, or `undefined` when it is blank or unparseable.
       * @pure
       */
      fRec: (r, c) => num(r[c('Recommended tuning - Hz')]),
    },
  },
}

// ---------- derivation ----------

/**
 * Derive compliance from the mass resonating at the published Fs.
 *
 * Catalogs publish Fs, Mms and Qms; the solver runs on Mms, Cms and Rms.
 * Deriving Cms from the same three numbers guarantees the modeled driver
 * resonates at exactly the frequency its datasheet claims — which
 * transcribing a rounded published Cms does not.
 *
 * @param {number|undefined} Fs - Free-air resonance, Hz.
 * @param {number|undefined} Mms - Moving mass, grams.
 * @returns {number|undefined} Compliance in mm/N, or `undefined` when either input is missing or non-positive.
 * @pure
 */
function cmsFrom(Fs, Mms) {
  if (!(Fs > 0) || !(Mms > 0)) return undefined
  const w = 2 * Math.PI * Fs
  return (1 / (w * w * (Mms / 1000))) * 1000
}

/**
 * Derive mechanical resistance from the published mechanical Q.
 *
 * `Rms = ωs · Mms / Qms`. Derived for the same reason as Cms: it makes the
 * modeled driver's mechanical Q exactly the published one.
 *
 * @param {number|undefined} Fs - Free-air resonance, Hz.
 * @param {number|undefined} Mms - Moving mass, grams.
 * @param {number|undefined} Qms - Mechanical Q.
 * @returns {number|undefined} Mechanical resistance in N·s/m, or `undefined` when any input is missing or non-positive.
 * @pure
 */
function rmsFrom(Fs, Mms, Qms) {
  if (!(Fs > 0) || !(Mms > 0) || !(Qms > 0)) return undefined
  return (2 * Math.PI * Fs * (Mms / 1000)) / Qms
}

/**
 * Peak displacement volume, `Sd · Xmax`.
 *
 * @param {number|undefined} Sd - Effective radiating area, cm².
 * @param {number|undefined} Xmax - Linear excursion one way, mm.
 * @returns {number|undefined} Displacement volume in litres, or `undefined` when either input is missing or non-positive.
 * @pure
 */
function vdFrom(Sd, Xmax) {
  if (!(Sd > 0) || !(Xmax > 0)) return undefined
  return (Sd * 1e-4) * (Xmax * 1e-3) * 1000
}

// ---------- emit ----------

/**
 * Read a catalog and produce the driver records for it.
 *
 * Every mapped value that comes back `undefined` is left off the record
 * rather than written as null, which is what keeps extended parameters
 * genuinely sparse.
 *
 * Rows are audited as they are built. A catalog can contradict itself, and
 * the response is to label the row rather than "fix" a column we have no
 * authority to change — the fix needs the datasheet, not a guess.
 *
 * @param {object} profile - A catalog profile.
 * @returns {Array<object>} Driver records, each with derived Cms and Rms, an `ext` object, a `source`, and a `suspect` array when the audit found a contradiction.
 * @throws {Error} When the source file is missing a mapped column.
 * @sideEffect Reads the catalog file from disk.
 */
function build(profile) {
  const rows = profile.read(join(ROOT, profile.file))
  const header = rows[0]
  /**
   * Resolve a column index by its header text.
   *
   * Throws rather than returning -1, so a renamed column in a refreshed
   * catalog fails the import loudly instead of silently emitting a database
   * full of `undefined`.
   *
   * @param {string} name - Exact header text.
   * @returns {number} The column index.
   * @throws {Error} When the header is not present, naming both the column and the file.
   * @reads the header row captured above.
   */
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

/**
 * Render the driver records as a generated ES module.
 *
 * One line per driver: long lines, but they diff cleanly when a catalog is
 * refreshed, which a pretty-printed object would not.
 *
 * @param {object} profile - The catalog profile, for the generated header.
 * @param {Array<object>} drivers - Records from `build`.
 * @returns {string} The module source, ready to write.
 * @pure
 */
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
