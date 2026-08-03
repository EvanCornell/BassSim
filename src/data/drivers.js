// The built-in driver library.
//
// Entries arrive from two places. Catalog imports (drivers.<brand>.js) are
// generated from a manufacturer's own multi-driver data export and carry the
// full extended parameter set; hand transcriptions (drivers.legacy.js) carry
// the core T/S only. Both share one record shape, described in
// driver-fields.js, so nothing downstream has to care which it got — beyond
// reading `source` when it wants to say how much to trust the numbers.

import { LEGACY_DRIVERS } from './drivers.legacy.js'
import { BC_DRIVERS } from './drivers.bc.js'
import { CORE_FIELDS, EXT_FIELDS, EXT_BY_KEY, EXT_GROUPS, SOURCE_LABELS, driverToParams } from './driver-fields.js'

export { CORE_FIELDS, EXT_FIELDS, EXT_BY_KEY, EXT_GROUPS, SOURCE_LABELS, driverToParams }

// `ext` is normalized to an object on every row so callers can iterate it
// without guarding, and `name` gives search one field to match against.
const normalize = (d) => ({ ...d, ext: d.ext || {}, name: `${d.brand} ${d.model}` })

export const BUILTIN_DRIVERS = [...BC_DRIVERS, ...LEGACY_DRIVERS]
  .map(normalize)
  .sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model))

export const DRIVER_BRANDS = [...new Set(BUILTIN_DRIVERS.map((d) => d.brand))].sort()

// Which extended fields actually carry data, for building filter UI that does
// not offer columns the library cannot fill.
export const POPULATED_EXT_KEYS = EXT_FIELDS
  .map((f) => f.key)
  .filter((k) => BUILTIN_DRIVERS.some((d) => d.ext[k] != null))
