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
export const uid = (p = 'n') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`

export const LAYOUT_VERSION = 2

export function stack(panels, opts = {}) {
  return {
    id: opts.id || uid('s'),
    type: 'stack',
    size: opts.size ?? 1,
    panels,
    active: opts.active ?? panels[0] ?? null,
  }
}

export function split(dir, children, size = 1) {
  return { id: uid('d'), type: 'split', dir, size, children }
}

// Default workspace: palette on the left, canvas over the four charts most
// designs are judged by, parameters on the right — the classic three-column
// IDE arrangement. The remaining plots are opened from View ▸ Charts.
export const defaultLayout = () => split('row', [
  stack(['palette'], { size: 16 }),
  split('col', [
    stack(['canvas'], { size: 60 }),
    stack(['spl', 'zin', 'exc', 'vel'], { size: 40, active: 'spl' }),
  ], 60),
  stack(['params'], { size: 24 }),
])

// ---------- queries ----------

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

export function findPanelStack(tree, panelId) {
  if (!tree) return null
  if (tree.type === 'stack') return tree.panels.includes(panelId) ? tree : null
  for (const c of tree.children) {
    const hit = findPanelStack(c, panelId)
    if (hit) return hit
  }
  return null
}

export function openPanels(tree, out = []) {
  if (!tree) return out
  if (tree.type === 'stack') out.push(...tree.panels)
  else tree.children.forEach((c) => openPanels(c, out))
  return out
}

export function isOpen(tree, panelId) {
  return !!findPanelStack(tree, panelId)
}

// ---------- structural edits ----------

function mapStacks(tree, fn) {
  if (tree.type === 'stack') return fn(tree)
  return { ...tree, children: tree.children.map((c) => mapStacks(c, fn)) }
}

export function setActive(tree, stackId, panelId) {
  return mapStacks(tree, (s) => (s.id === stackId ? { ...s, active: panelId } : s))
}

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

export function removePanel(tree, panelId) {
  return removeRec(tree, panelId)
}

const dirOf = (zone) => (zone === 'left' || zone === 'right' ? 'row' : 'col')
const isBefore = (zone) => zone === 'left' || zone === 'top'

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

// Move `panelId` onto `targetStackId`. `zone` is 'center' (add as a tab) or
// one of 'left'/'right'/'top'/'bottom' (split the target).
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

// Dock against an outer edge of the whole workspace.
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

// Reorder a tab within its own stack.
export function moveTabInStack(tree, stackId, from, to) {
  return mapStacks(tree, (s) => {
    if (s.id !== stackId) return s
    const panels = [...s.panels]
    const [p] = panels.splice(from, 1)
    panels.splice(to, 0, p)
    return { ...s, panels }
  })
}

// Show a panel: focus it where it already lives, otherwise dock it at the
// place the panel registry asks for.
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

// Splitter drag result: two adjacent children get new weights that preserve
// their combined share, so siblings outside the pair are unaffected.
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

// Drop panels the current build no longer knows about, then re-prune, so an
// old saved layout can never wedge the workspace.
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
