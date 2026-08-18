// Marquee selection geometry — the arithmetic behind the lasso dragged over the
// node editor's background.
//
// Kept out of the canvas component because it is the part worth being sure
// about: a rectangle dragged up-and-left has a negative width, a node that has
// never been measured has no size, and "inside the box" is really "overlaps the
// box" in every editor users have met. None of that needs React to be checked.
//
// All coordinates here are canvas coordinates, not screen pixels. The caller
// converts through React Flow's `screenToFlowPosition` before calling in.

/**
 * Size assumed for a node React Flow has not measured yet.
 *
 * A node added in the same frame as the drag has no `width`/`height` until it
 * has been laid out once. Treating it as a point would make it unselectable,
 * which reads as the lasso being broken; a nominal box is wrong by a few pixels
 * at worst.
 */
const UNMEASURED = { w: 180, h: 90 }

/**
 * The axis-aligned rectangle spanned by two corners.
 *
 * A drag may run in any direction, so the corners are sorted rather than
 * assumed — dragging up-and-left is as ordinary as down-and-right.
 *
 * @param {{x: number, y: number}} a - One corner, where the drag began.
 * @param {{x: number, y: number}} b - The opposite corner, where it is now.
 * @returns {{x: number, y: number, w: number, h: number}} The rectangle, with non-negative width and height.
 * @pure
 */
export function marqueeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

/**
 * A node's bounding box in canvas coordinates.
 *
 * React Flow writes measured dimensions back onto each node once it has been
 * laid out; until then it falls back to a nominal size so a just-created node
 * is still catchable.
 *
 * @param {object} node - A React Flow node, with `position` and optionally measured `width`/`height`.
 * @returns {{x: number, y: number, w: number, h: number}} The node's box.
 * @pure
 */
export function nodeBox(node) {
  return {
    x: node.position?.x ?? 0,
    y: node.position?.y ?? 0,
    w: node.width || UNMEASURED.w,
    h: node.height || UNMEASURED.h,
  }
}

/**
 * Whether two rectangles overlap at all.
 *
 * Touching edges do not count: a zero-area intersection is what a lasso drawn
 * exactly along a node's border produces, and catching the node then would be
 * indistinguishable from a stray click.
 *
 * @param {{x: number, y: number, w: number, h: number}} a - First rectangle.
 * @param {{x: number, y: number, w: number, h: number}} b - Second rectangle.
 * @returns {boolean} True when the two overlap.
 * @pure
 */
export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Which nodes a marquee has caught.
 *
 * Overlap rather than containment, matching every drawing tool the user has
 * met: sweeping across a row of nodes selects them without having to enclose
 * the last one completely.
 *
 * @param {Array<object>} nodes - The graph's nodes.
 * @param {{x: number, y: number, w: number, h: number}} rect - The marquee, in canvas coordinates.
 * @returns {string[]} Ids of the caught nodes, in graph order.
 * @pure
 */
export function nodesInMarquee(nodes, rect) {
  return nodes.filter((n) => overlaps(nodeBox(n), rect)).map((n) => n.id)
}

/**
 * How far apart two screen points are, in pixels.
 *
 * Used to tell a *click* on empty space from a *drag* across it: below the
 * threshold the gesture is a click, which clears the selection rather than
 * replacing it.
 *
 * @param {{x: number, y: number}} a - First point.
 * @param {{x: number, y: number}} b - Second point.
 * @returns {number} The distance between them.
 * @pure
 */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Smallest drag, in pixels, that counts as a marquee rather than a click.
 *
 * Below this the gesture is a plain click on empty space. Three pixels of
 * travel is within the slop of a deliberate click on a trackpad, so the
 * threshold sits just above it.
 */
export const MARQUEE_THRESHOLD = 4
