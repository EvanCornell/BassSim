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

/**
 * Bring a raw database row up to the full record shape.
 *
 * Two guarantees the rest of the app relies on: `ext` is always an object, so
 * callers can iterate it without guarding, and `name` exists as one
 * pre-joined field for search to match against.
 *
 * @param {object} d - A row from a catalog or legacy module.
 * @returns {object} A copy carrying a guaranteed `ext` object and a `name`.
 * @post The input row is not modified.
 * @pure
 */
const normalize = (d) => ({ ...d, ext: d.ext || {}, name: `${d.brand} ${d.model}` })

/**
 * Every built-in driver, normalized and sorted by brand then model.
 *
 * Catalog and hand-transcribed entries are merged into one list deliberately:
 * consumers filter on `source` when provenance matters rather than choosing
 * between two arrays.
 *
 * Sorted by brand then model using `localeCompare`, so ordering follows the
 * runtime's collation rather than code-unit order — the two disagree on real
 * brand names. Same-brand rows are therefore contiguous.
 */
export const BUILTIN_DRIVERS = [...BC_DRIVERS, ...LEGACY_DRIVERS]
  .map(normalize)
  .sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model))

/** Distinct brand names in the library, sorted, for populating filter menus. */
export const DRIVER_BRANDS = [...new Set(BUILTIN_DRIVERS.map((d) => d.brand))].sort()

/**
 * Extended field keys that at least one driver actually populates.
 *
 * Extended parameters are sparse, so filter UI built from the full `EXT_FIELDS`
 * list would offer columns the library cannot fill. This is the subset worth
 * showing.
 */
export const POPULATED_EXT_KEYS = EXT_FIELDS
  .map((f) => f.key)
  .filter((k) => BUILTIN_DRIVERS.some((d) => d.ext[k] != null))
