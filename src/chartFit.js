// Fitting a chart's vertical range to what it shows.
//
// A chart scaled to the very lowest point of every curve wastes most of its
// height on a filter's skirt or a response falling away below the band of
// interest. These pick a range from the top down instead: the highest point
// sets the top, and the bottom goes no further than a set span beneath it,
// so the part that matters fills the chart.

/**
 * Every finite number in some lists.
 *
 * @param {Array<Array<number>>} lists - Lists of values.
 * @returns {number[]} The finite ones.
 * @pure
 */
const finite = (lists) => lists.flat().filter((v) => Number.isFinite(v))

/**
 * A range for levels in dB: the top a little above the highest, the bottom no
 * more than `span` below it, both on whole steps.
 *
 * @param {Array<Array<number>>} lists - Values to show.
 * @param {object} [o] - Options.
 * @param {number} [o.span] - Most dB shown below the top.
 * @param {number} [o.minSpan] - Fewest dB shown, so a flat line is not magnified.
 * @param {number} [o.step] - Ends land on multiples of this.
 * @param {number[]} [o.include] - Values always inside the range, e.g. 0 dB.
 * @returns {number[]} `[lo, hi]`.
 * @pure
 */
export function fitLevels(lists, { span = 48, minSpan = 18, step = 5, include = [] } = {}) {
  const vs = finite([...lists, include])
  if (!vs.length) return [-minSpan, 0]
  const top = Math.max(...vs)
  const bottom = Math.min(...vs)
  let hi = Math.ceil((top + 1.5) / step) * step
  let lo = Math.floor(Math.max(bottom - 1.5, hi - span) / step) * step
  while (hi - lo < minSpan) {
    hi += step
    if (hi - lo < minSpan) lo -= step
  }
  return [lo, hi]
}

/**
 * A range for a quantity that starts at zero: zero to a little above the
 * highest value, taking in a reference line (Xmax, a velocity limit) only
 * when it is near enough to the data to be worth showing.
 *
 * @param {Array<Array<number>>} lists - Values to show.
 * @param {number[]} [refs] - Reference values that may be taken in.
 * @param {number} [reach] - A reference is taken in when within this many times the highest value.
 * @returns {number[]} `[0, hi]`.
 * @pure
 */
export function fitFromZero(lists, refs = [], reach = 2) {
  const vs = finite(lists)
  let top = vs.length ? Math.max(...vs) : 0
  for (const r of refs) if (Number.isFinite(r) && r > top && r <= reach * top) top = r
  return [0, top > 0 ? top * 1.08 : 1]
}

/**
 * A range for a logarithmic axis: up to a little above the highest value,
 * down no more than `decades` below it.
 *
 * @param {Array<Array<number>>} lists - Values to show; only positive ones count.
 * @param {number} [decades] - Most decades shown.
 * @returns {number[]} `[lo, hi]`, both above zero.
 * @pure
 */
export function fitLog(lists, decades = 4) {
  const vs = finite(lists).filter((v) => v > 0)
  if (!vs.length) return [0.1, 1]
  const top = Math.max(...vs)
  const lo = Math.max(Math.min(...vs), top / 10 ** decades)
  return [lo / 1.3, top * 1.3]
}
