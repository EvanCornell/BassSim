// The driver record schema, described as data.
//
// A database entry is flat for the parameters the solver consumes and nests
// everything else under `ext`. The split is deliberate: `driverSI()` reads
// Mms/Cms/Rms/Sd/Re/Le/Bl/Fs and nothing else, so spreading a record straight
// into a node's params must never smuggle construction trivia in with it.
//
// `ext` is sparse by design. Manufacturers publish wildly different subsets —
// B&C give flux density and winding depth, most car-audio brands give a power
// rating and little else — so every extended field is optional and code that
// reads them must tolerate `undefined`. Nothing here is required to simulate.
//
// Enumerating the schema rather than hardcoding it lets the database browser,
// the CSV export and the MCP tools stay correct as fields are added, and gives
// an agent a machine-readable answer to "what can I filter on?".

// Units: Fs Hz · Vas L · Re Ω · Bl T·m · Mms g · Cms mm/N · Sd cm² · Le mH
//        Xmax mm · Rms N·s/m
export const CORE_FIELDS = [
  { key: 'Fs', label: 'Fs', unit: 'Hz', type: 'number', solver: true },
  { key: 'Qts', label: 'Qts', unit: '', type: 'number' },
  { key: 'Qes', label: 'Qes', unit: '', type: 'number' },
  { key: 'Qms', label: 'Qms', unit: '', type: 'number' },
  { key: 'Vas', label: 'Vas', unit: 'L', type: 'number' },
  { key: 'Re', label: 'Re', unit: 'Ω', type: 'number', solver: true },
  { key: 'Bl', label: 'Bl', unit: 'T·m', type: 'number', solver: true },
  { key: 'Mms', label: 'Mms', unit: 'g', type: 'number', solver: true },
  { key: 'Cms', label: 'Cms', unit: 'mm/N', type: 'number', solver: true },
  { key: 'Sd', label: 'Sd', unit: 'cm²', type: 'number', solver: true },
  { key: 'Le', label: 'Le', unit: 'mH', type: 'number', solver: true },
  { key: 'Xmax', label: 'Xmax', unit: 'mm', type: 'number', solver: true },
  { key: 'Rms', label: 'Rms', unit: 'N·s/m', type: 'number', solver: true },
]

export const EXT_FIELDS = [
  // --- excursion and efficiency beyond the core set ---
  { key: 'Xvar', group: 'Excursion', label: 'Xvar', unit: 'mm', type: 'number',
    desc: 'Maximum linear-plus-suspension travel before damage, one way.' },
  { key: 'Xmech', group: 'Excursion', label: 'Xmech', unit: 'mm', type: 'number',
    desc: 'Hard mechanical limit, one way.' },
  { key: 'Vd', group: 'Excursion', label: 'Vd', unit: 'L', type: 'number',
    desc: 'Peak displacement volume, Sd · Xmax.' },
  { key: 'eta0', group: 'Excursion', label: 'η₀', unit: '%', type: 'number',
    desc: 'Reference half-space efficiency.' },

  // --- electrical ---
  { key: 'Znom', group: 'Electrical', label: 'Nominal impedance', unit: 'Ω', type: 'number' },
  { key: 'Zmin', group: 'Electrical', label: 'Minimum impedance', unit: 'Ω', type: 'number' },
  { key: 'Leb', group: 'Electrical', label: 'Le @ 1 kHz', unit: 'mH', type: 'number' },
  { key: 'pNom', group: 'Electrical', label: 'Nominal power', unit: 'W', type: 'number',
    desc: 'AES / RMS rating.' },
  { key: 'pCont', group: 'Electrical', label: 'Continuous power', unit: 'W', type: 'number',
    desc: 'Program power, typically 2× nominal.' },
  { key: 'sens', group: 'Electrical', label: 'Sensitivity', unit: 'dB', type: 'number',
    desc: '1 W / 1 m, half space.' },

  // --- motor and construction ---
  { key: 'vcDia', group: 'Motor', label: 'Voice coil diameter', unit: 'mm', type: 'number' },
  { key: 'vcDepth', group: 'Motor', label: 'Winding depth', unit: 'mm', type: 'number' },
  { key: 'gapDepth', group: 'Motor', label: 'Magnetic gap depth', unit: 'mm', type: 'number' },
  { key: 'flux', group: 'Motor', label: 'Flux density', unit: 'T', type: 'number' },
  { key: 'vcWinding', group: 'Motor', label: 'Winding material', unit: '', type: 'text' },
  { key: 'vcFormer', group: 'Motor', label: 'Former material', unit: '', type: 'text' },
  { key: 'magnet', group: 'Motor', label: 'Magnet material', unit: '', type: 'text' },
  { key: 'pole', group: 'Motor', label: 'Pole design', unit: '', type: 'text' },
  { key: 'spider', group: 'Construction', label: 'Spider', unit: '', type: 'text' },
  { key: 'surround', group: 'Construction', label: 'Surround shape', unit: '', type: 'text' },
  { key: 'cone', group: 'Construction', label: 'Cone shape', unit: '', type: 'text' },

  // --- application ---
  { key: 'dia', group: 'Application', label: 'Nominal diameter', unit: 'mm', type: 'number' },
  { key: 'EBP', group: 'Application', label: 'EBP', unit: 'Hz', type: 'number',
    desc: 'Efficiency bandwidth product, Fs / Qes.' },
  { key: 'fLow', group: 'Application', label: 'Range low', unit: 'Hz', type: 'number' },
  { key: 'fHigh', group: 'Application', label: 'Range high', unit: 'Hz', type: 'number' },
  { key: 'vRec', group: 'Application', label: 'Recommended enclosure', unit: 'L', type: 'number' },
  { key: 'fRec', group: 'Application', label: 'Recommended tuning', unit: 'Hz', type: 'number' },
  { key: 'mass', group: 'Application', label: 'Net weight', unit: 'kg', type: 'number' },
]

export const EXT_BY_KEY = Object.fromEntries(EXT_FIELDS.map((f) => [f.key, f]))
export const EXT_GROUPS = [...new Set(EXT_FIELDS.map((f) => f.group))]

// Two more top-level fields sit outside both lists because they describe the
// record rather than the driver:
//
//   source   — provenance, see SOURCE_LABELS below.
//   suspect  — array of strings, present only when the row's published Qes,
//              Qts or Vas contradict the Bl/Re/Mms/Cms the solver runs on.
//              Generated by driver-audit.js; never hand-written.

// Provenance. Anything not `official` is a hand transcription and should be
// checked against the datasheet before a build.
export const SOURCE_LABELS = {
  official: 'Manufacturer catalog export',
  datasheet: 'Manufacturer datasheet (transcribed)',
  custom: 'User entry',
}

// The solver-facing subset of a database row, ready to merge into node params.
export function driverToParams(d) {
  const p = { label: d.model }
  for (const f of CORE_FIELDS) if (d[f.key] != null) p[f.key] = d[f.key]
  return p
}

export function formatExt(key, value) {
  const f = EXT_BY_KEY[key]
  if (!f || value == null || value === '') return null
  return f.unit ? `${value} ${f.unit}` : String(value)
}
