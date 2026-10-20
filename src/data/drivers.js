// The built-in driver library.
//
// Every entry has one record shape, described in driver-fields.js: the core
// T/S values, plus whichever extended parameters its datasheet publishes.

import { DRIVERS } from './drivers.library.js'
import { CORE_FIELDS, EXT_FIELDS, EXT_BY_KEY, EXT_GROUPS, driverToParams } from './driver-fields.js'

export { CORE_FIELDS, EXT_FIELDS, EXT_BY_KEY, EXT_GROUPS, driverToParams }

/**
 * Bring a raw database row up to the full record shape.
 *
 * Two guarantees the rest of the app relies on: `ext` is always an object, so
 * callers can iterate it without guarding, and `name` exists as one
 * pre-joined field for search to match against.
 *
 * @param {object} d - A row from the library.
 * @returns {object} A copy carrying a guaranteed `ext` object and a `name`.
 * @post The input row is not modified.
 * @pure
 */
const normalize = (d) => ({ ...d, ext: d.ext || {}, name: `${d.brand} ${d.model}` })

/**
 * Every built-in driver, normalized and sorted by brand then model.
 *
 * Sorted by brand then model using `localeCompare`, so ordering follows the
 * runtime's collation rather than code-unit order — the two disagree on real
 * brand names. Same-brand rows are therefore contiguous.
 */
export const BUILTIN_DRIVERS = DRIVERS
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
