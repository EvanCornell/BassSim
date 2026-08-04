// Dock layout model — the data behind the Eclipse-style workspace.
//
// The workspace is a tree of two node kinds:
//
//   { id, type: 'split', dir: 'row'|'col', size, children: [node, …] }
//   { id, type: 'stack', size, panels: ['canvas', …], active: 'canvas' }
//
// A *stack* is a tabbed panel group (one visible at a time); a *split* lays
// its children out horizontally or vertically. `size` is a flex weight shared
// among siblings — the absolute numbers are meaningless, only their ratios
// matter, which is what lets a splitter drag redistribute weight between two
// neighbours without touching the rest of the tree.
//
// Every operation here is pure: it returns a new tree, never mutates. Two
// invariants are maintained after each edit:
//   - a stack always holds at least one panel (empty stacks are pruned)
//   - a split always holds at least two children (a lone child replaces it)

let counter = 0

/**
 * Generate a layout node id.
 *
 * Combines the clock with a per-session counter so ids stay unique even when
 * several nodes are created inside the same millisecond, which a single docking
 * operation routinely does.
 *
 * @param {string} [p='n'] - Prefix identifying the node kind: 's' for stacks, 'd' for splits.
 * @returns {string} A new id, unique within this session.
 * @sideEffect Advances the module-level counter, so successive calls with the same argument differ.
 */
export const uid = (p = 'n') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`

/**
 * Version of the persisted layout tree.
 *
 * A saved layout whose version does not match is discarded rather than migrated
 * — the workspace arrangement is cheap to rebuild and not worth a migration path.
 */
export const LAYOUT_VERSION = 2

/**
 * Build a stack: a tabbed group showing one of its panels at a time.
 *
 * @param {string[]} panels - Panel ids in tab order.
 * @param {object} [opts={}] - Overrides.
 * @param {string} [opts.id] - Explicit id; a fresh one is generated when omitted.
 * @param {number} [opts.size=1] - Flex weight relative to its siblings.
 * @param {string} [opts.active] - Initially visible panel. Defaults to the first, or `null` for an empty stack.
 * @returns {object} A new stack node.
 * @sideEffect Consumes an id from `uid` unless `opts.id` is supplied.
 */
export function stack(panels, opts = {}) {
  return {
    id: opts.id || uid('s'),
    type: 'stack',
    size: opts.size ?? 1,
    panels,
    active: opts.active ?? panels[0] ?? null,
  }
}

/**
 * Build a split: a row or column laying its children out side by side.
 *
 * @param {'row'|'col'} dir - Layout direction.
 * @param {Array<object>} children - Child stacks or splits.
 * @param {number} [size=1] - Flex weight relative to its siblings.
 * @returns {object} A new split node.
 * @pre children.length >= 2 — a lone child collapses under the tree invariants
 * @sideEffect Consumes an id from `uid`.
 */
export function split(dir, children, size = 1) {
  return { id: uid('d'), type: 'split', dir, size, children }
}

/**
 * The default workspace arrangement.
 *
 * Palette on the left, canvas over the four charts most designs are judged by,
 * parameters on the right — the classic three-column IDE arrangement. The
 * remaining plots are opened from View ▸ Charts.
 *
 * @returns {object} A freshly built layout tree, safe for the caller to keep.
 * @sideEffect Consumes ids from `uid`, so two calls return trees with different node ids.
 */
export const defaultLayout = () => split('row', [
  stack(['palette'], { size: 16 }),
  split('col', [
    stack(['canvas'], { size: 60 }),
    stack(['spl', 'zin', 'exc', 'vel'], { size: 40, active: 'spl' }),
  ], 60),
  stack(['params'], { size: 24 }),
])

// ---------- queries ----------

/**
 * Find any node — stack or split — by id.
 *
 * @param {object|null} tree - Layout tree to search.
 * @param {string} id - Node id.
 * @returns {object|null} The node, or `null` when the tree has no such id.
 * @post Returns the live node, not a copy; callers must not mutate it.
 * @pure
 */
export function findNode(tree, id) {
  if (!tree) return null
  if (tree.id === id) return tree
  if (tree.type === 'split') {
    for (const c of tree.children) {
      const hit = findNode(c, id)
      if (hit) return hit
    }
  }
  return null
}

/**
 * Find the stack that currently holds a panel.
 *
 * @param {object|null} tree - Layout tree to search.
 * @param {string} panelId - Panel id.
 * @returns {object|null} The containing stack, or `null` when the panel is closed or popped out.
 * @post Returns the live node, not a copy; callers must not mutate it.
 * @pure
 */
export function findPanelStack(tree, panelId) {
  if (!tree) return null
  if (tree.type === 'stack') return tree.panels.includes(panelId) ? tree : null
  for (const c of tree.children) {
    const hit = findPanelStack(c, panelId)
    if (hit) return hit
  }
  return null
}

/**
 * Collect the ids of every panel currently in the tree.
 *
 * @param {object|null} tree - Layout tree to walk.
 * @param {string[]} [out=[]] - Accumulator, appended to in place. Callers normally omit it.
 * @returns {string[]} The same array, carrying every open panel id in traversal order.
 * @mutates The `out` array passed in, which is the recursion's accumulator.
 */
export function openPanels(tree, out = []) {
  if (!tree) return out
  if (tree.type === 'stack') out.push(...tree.panels)
  else tree.children.forEach((c) => openPanels(c, out))
  return out
}

/**
 * Whether a panel is currently docked anywhere in the tree.
 *
 * @param {object|null} tree - Layout tree.
 * @param {string} panelId - Panel id.
 * @returns {boolean} True when the panel is open.
 * @pure
 */
export function isOpen(tree, panelId) {
  return !!findPanelStack(tree, panelId)
}

// ---------- structural edits ----------

/**
 * Rebuild the tree with `fn` applied to every stack.
 *
 * The structural spine of the pure edits: splits are copied, stacks are
 * replaced by whatever `fn` returns.
 *
 * @param {object} tree - Layout tree.
 * @param {(stack: object) => object} fn - Called for each stack; should return a stack, returning the original when it has no change to make.
 * @returns {object} A new tree. Untouched subtrees are still copied, so identity is not preserved.
 * @pre fn does not mutate the stack it is given
 * @pure
 */
function mapStacks(tree, fn) {
  if (tree.type === 'stack') return fn(tree)
  return { ...tree, children: tree.children.map((c) => mapStacks(c, fn)) }
}

/**
 * Bring a panel to the front of its stack.
 *
 * @param {object} tree - Layout tree.
 * @param {string} stackId - Stack whose active tab is changing.
 * @param {string} panelId - Panel to show.
 * @returns {object} A new tree with that stack's `active` updated.
 * @pure
 */
export function setActive(tree, stackId, panelId) {
  return mapStacks(tree, (s) => (s.id === stackId ? { ...s, active: panelId } : s))
}

/**
 * Remove a panel and repair the tree around it.
 *
 * Maintains both structural invariants on the way back up: a stack emptied by
 * the removal is dropped, and a split left with one child collapses into that
 * child, inheriting the split's weight so the rest of the layout does not shift.
 *
 * When the removed panel was the active tab, focus moves to the tab that took
 * its index — or the last one, if it was at the end.
 *
 * @param {object} node - Subtree to remove from.
 * @param {string} panelId - Panel to remove.
 * @returns {object|null} The rebuilt subtree, or `null` when it no longer holds anything.
 * @pure
 */
function removeRec(node, panelId) {
  if (node.type === 'stack') {
    const idx = node.panels.indexOf(panelId)
    if (idx < 0) return node
    const panels = node.panels.filter((p) => p !== panelId)
    if (!panels.length) return null
    const active = node.active === panelId
      ? panels[Math.min(idx, panels.length - 1)]
      : node.active
    return { ...node, panels, active }
  }
  const children = node.children.map((c) => removeRec(c, panelId)).filter(Boolean)
  if (!children.length) return null
  // a split with one surviving child collapses into that child, inheriting
  // the split's weight so the rest of the layout doesn't shift
  if (children.length === 1) return { ...children[0], size: node.size }
  return { ...node, children }
}

/**
 * Close a panel, pruning any stack or split left empty by its removal.
 *
 * @param {object} tree - Layout tree.
 * @param {string} panelId - Panel to close.
 * @returns {object|null} A new tree, or `null` if that panel was the last one open.
 * @pure
 */
export function removePanel(tree, panelId) {
  return removeRec(tree, panelId)
}

/**
 * The split direction a drop zone implies.
 *
 * @param {'left'|'right'|'top'|'bottom'|'center'} zone - Drop zone.
 * @returns {'row'|'col'} `row` for horizontal zones, `col` otherwise.
 * @pure
 */
const dirOf = (zone) => (zone === 'left' || zone === 'right' ? 'row' : 'col')
/**
 * Whether a drop zone places the new panel ahead of the existing one.
 *
 * @param {'left'|'right'|'top'|'bottom'|'center'} zone - Drop zone.
 * @returns {boolean} True when the new panel goes first in child order.
 * @pure
 */
const isBefore = (zone) => zone === 'left' || zone === 'top'

/**
 * Insert a panel at a target stack, tabbing it in or splitting the target.
 *
 * A `center` drop appends a tab and focuses it. An edge drop halves the target's
 * weight and puts the newcomer beside it.
 *
 * The flattening case matters for feel: when the target is a direct child of a
 * split that already runs in the requested direction, the panel becomes a
 * sibling rather than nesting a new split inside the old one. Without it,
 * repeated docking builds a deep tree whose splitters behave unpredictably.
 *
 * @param {object} node - Subtree to insert into.
 * @param {string} targetId - Stack to dock against.
 * @param {'center'|'left'|'right'|'top'|'bottom'} zone - Where relative to the target.
 * @param {string} panelId - Panel being placed.
 * @returns {object} A new subtree. Unchanged when `targetId` is not inside it.
 * @pre The panel has already been removed from its previous stack.
 * @sideEffect Consumes ids from `uid` for the stacks and splits it creates.
 */
function insertRec(node, targetId, zone, panelId) {
  if (node.type === 'stack') {
    if (node.id !== targetId) return node
    if (zone === 'center') {
      return { ...node, panels: [...node.panels, panelId], active: panelId }
    }
    const half = node.size / 2
    const fresh = stack([panelId], { size: half })
    const kept = { ...node, size: half }
    return split(dirOf(zone), isBefore(zone) ? [fresh, kept] : [kept, fresh], node.size)
  }

  // If the target is a direct child and the requested split direction already
  // matches this split, insert a sibling instead of nesting a new split — the
  // tree stays flat, which is what makes repeated docking feel predictable.
  const i = node.children.findIndex((c) => c.id === targetId)
  if (i >= 0 && zone !== 'center' && dirOf(zone) === node.dir) {
    const target = node.children[i]
    const half = target.size / 2
    const children = [...node.children]
    children[i] = { ...target, size: half }
    children.splice(isBefore(zone) ? i : i + 1, 0, stack([panelId], { size: half }))
    return { ...node, children }
  }

  return { ...node, children: node.children.map((c) => insertRec(c, targetId, zone, panelId)) }
}

/**
 * Move a panel onto a target stack — the result of a completed tab drag.
 *
 * Removal happens before insertion, which creates the case this function exists
 * to handle: pruning the panel's old stack can delete the very target it was
 * being dropped on. When that happens the panel docks against the right edge
 * instead, so the drag still does something rather than silently failing.
 *
 * Dropping a panel back onto its own stack only changes focus.
 *
 * @param {object} tree - Layout tree.
 * @param {string} panelId - Panel being moved.
 * @param {string} targetStackId - Stack to dock against.
 * @param {'center'|'left'|'right'|'top'|'bottom'} zone - `center` adds a tab; the others split the target.
 * @returns {object} A new tree, or the original when the move would empty the workspace.
 * @sideEffect Consumes ids from `uid` when the move creates stacks or splits.
 */
export function dockPanel(tree, panelId, targetStackId, zone) {
  const from = findPanelStack(tree, panelId)
  // dropping a panel back onto its own stack: nothing to restructure
  if (from && from.id === targetStackId && (zone === 'center' || from.panels.length === 1)) {
    return setActive(tree, targetStackId, panelId)
  }
  const pruned = from ? removePanel(tree, panelId) : tree
  if (!pruned) return tree
  // the target may have been pruned along with the panel's old stack
  if (!findNode(pruned, targetStackId)) return dockToEdge(pruned, panelId, 'right')
  return insertRec(pruned, targetStackId, zone, panelId)
}

/**
 * Dock a panel against an outer edge of the whole workspace.
 *
 * When the root split already runs in the right direction the panel joins it as
 * a sibling at a quarter of the average weight; otherwise a new root split is
 * created giving the newcomer 22% of the width or height.
 *
 * @param {object} tree - Layout tree.
 * @param {string} panelId - Panel to dock.
 * @param {'left'|'right'|'top'|'bottom'} edge - Which outer edge.
 * @returns {object} A new tree. Falls back to a lone stack if the panel was the only one open.
 * @sideEffect Consumes ids from `uid`.
 */
export function dockToEdge(tree, panelId, edge) {
  const pruned = findPanelStack(tree, panelId) ? removePanel(tree, panelId) : tree
  if (!pruned) return stack([panelId])
  const dir = dirOf(edge)
  if (pruned.type === 'split' && pruned.dir === dir) {
    const total = pruned.children.reduce((a, c) => a + c.size, 0)
    const fresh = stack([panelId], { size: total / 4 })
    const children = isBefore(edge) ? [fresh, ...pruned.children] : [...pruned.children, fresh]
    return { ...pruned, children }
  }
  const fresh = stack([panelId], { size: 22 })
  const kept = { ...pruned, size: 78 }
  return split(dir, isBefore(edge) ? [fresh, kept] : [kept, fresh], 1)
}

/**
 * Reorder a tab within its own stack.
 *
 * @param {object} tree - Layout tree.
 * @param {string} stackId - Stack containing the tab.
 * @param {number} from - Current index.
 * @param {number} to - Destination index, in the list after the tab is lifted out.
 * @returns {object} A new tree with the tab order changed.
 * @pre Both indices are within the stack's panel list.
 * @post The stack's `active` panel is unchanged — reordering does not switch tabs.
 * @pure
 */
export function moveTabInStack(tree, stackId, from, to) {
  return mapStacks(tree, (s) => {
    if (s.id !== stackId) return s
    const panels = [...s.panels]
    const [p] = panels.splice(from, 1)
    panels.splice(to, 0, p)
    return { ...s, panels }
  })
}

/**
 * Show a panel, focusing it if it is already open and docking it if not.
 *
 * Placement follows the panel registry's hint. `nextTo` names one preferred
 * neighbour; `nextToAny` names a family — the charts — so a newly opened plot
 * joins whichever sibling happens to be on screen rather than landing somewhere
 * unrelated. With no candidate available it falls back to an outer edge.
 *
 * @param {object} tree - Layout tree.
 * @param {string} panelId - Panel to show.
 * @param {object} [hint] - Placement hint from the panel registry.
 * @param {string} [hint.nextTo] - Preferred neighbour panel id.
 * @param {string[]} [hint.nextToAny] - Acceptable neighbours, tried in order.
 * @param {'center'|'left'|'right'|'top'|'bottom'} [hint.zone='center'] - How to dock beside the neighbour.
 * @param {'left'|'right'|'top'|'bottom'} [hint.edge='bottom'] - Fallback edge when no neighbour is open.
 * @returns {object} A new tree with the panel visible.
 * @sideEffect Consumes ids from `uid` when docking creates nodes.
 */
export function openPanel(tree, panelId, hint) {
  const existing = findPanelStack(tree, panelId)
  if (existing) return setActive(tree, existing.id, panelId)
  // `nextTo` names one neighbour; `nextToAny` names a family (the charts), so
  // the panel joins whichever member happens to be on screen
  const candidates = hint?.nextTo ? [hint.nextTo] : (hint?.nextToAny || [])
  for (const sibling of candidates) {
    if (sibling === panelId) continue
    const host = findPanelStack(tree, sibling)
    if (host) return dockPanel(tree, panelId, host.id, hint.zone || 'center')
  }
  return dockToEdge(tree, panelId, hint?.edge || 'bottom')
}

/**
 * Apply a splitter drag, reweighting two adjacent children.
 *
 * The caller is expected to have preserved the pair's combined share, which is
 * what keeps siblings outside the pair — and the rest of the layout — from
 * moving when one splitter is dragged.
 *
 * @param {object} tree - Layout tree.
 * @param {string} splitId - Split whose children are being resized.
 * @param {number} index - Index of the child on the left or top of the splitter.
 * @param {number} weightA - New weight for child `index`.
 * @param {number} weightB - New weight for child `index + 1`.
 * @returns {object} A new tree. Unchanged when the root is not a split.
 * @pre index + 1 is a valid child index
 * @pure
 */
export function resizeChildren(tree, splitId, index, weightA, weightB) {
  if (tree.type !== 'split') return tree
  if (tree.id === splitId) {
    const children = [...tree.children]
    children[index] = { ...children[index], size: weightA }
    children[index + 1] = { ...children[index + 1], size: weightB }
    return { ...tree, children }
  }
  return { ...tree, children: tree.children.map((c) => resizeChildren(c, splitId, index, weightA, weightB)) }
}

// ---------- persistence ----------

/**
 * Rebuild a persisted layout, discarding anything this build cannot render.
 *
 * The trust boundary for LocalStorage. A saved tree may name panels that no
 * longer exist, carry a non-numeric size, or have been hand-edited into an
 * invalid shape; every field is re-derived here rather than accepted, and both
 * structural invariants are re-established on the way back up. The result is
 * that an old or corrupt layout can never wedge the workspace — at worst it
 * sanitizes to `null` and the caller falls back to the default.
 *
 * @param {any} tree - Untrusted layout tree, typically parsed from LocalStorage.
 * @param {string[]} knownPanels - Panel ids this build knows how to render. Anything else is dropped.
 * @returns {object|null} A valid layout tree, or `null` when nothing renderable survived.
 * @post Every returned node has a valid id, a positive numeric size, and — for stacks — an `active` panel drawn from its own list.
 * @sideEffect Consumes ids from `uid` for any node that was missing one.
 */
export function sanitize(tree, knownPanels) {
  if (!tree || typeof tree !== 'object') return null
  if (tree.type === 'stack') {
    const panels = (tree.panels || []).filter((p) => knownPanels.includes(p))
    if (!panels.length) return null
    return {
      id: tree.id || uid('s'),
      type: 'stack',
      size: Number(tree.size) > 0 ? Number(tree.size) : 1,
      panels,
      active: panels.includes(tree.active) ? tree.active : panels[0],
    }
  }
  if (tree.type === 'split') {
    const children = (tree.children || []).map((c) => sanitize(c, knownPanels)).filter(Boolean)
    if (!children.length) return null
    if (children.length === 1) return { ...children[0], size: Number(tree.size) > 0 ? Number(tree.size) : 1 }
    return {
      id: tree.id || uid('d'),
      type: 'split',
      dir: tree.dir === 'col' ? 'col' : 'row',
      size: Number(tree.size) > 0 ? Number(tree.size) : 1,
      children,
    }
  }
  return null
}
