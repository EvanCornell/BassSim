// The dropdown row, shared by the menu bar and the right-click menu.
//
// One implementation rather than two so the two menus cannot drift: a command
// offered in both places gets the same check mark, the same shortcut hint and
// the same disabled styling without anyone having to keep a copy in step.
//
// An item descriptor is plain data — `{label, hint, onClick, disabled,
// checked, danger, submenu}` — which is what lets a menu be built by whoever
// knows the context and rendered by code that knows nothing about it.
//
// A submenu keeps itself on screen the same way the right-click menu does:
// drawn where it would naturally go, measured, then nudged back inside the
// window. Guessing from the parent's position is not enough — a submenu is
// as tall as its own contents, so whether it fits is a question only it can
// answer.
import React, { useLayoutEffect, useRef, useState } from 'react'

/** Gap kept between a submenu and the window edge when it has to be nudged back on screen. */
const EDGE_PAD = 6

/**
 * One dropdown row: a command, a separator, or a submenu parent.
 *
 * A label of `-` renders a separator instead of an item. Clicking a submenu
 * parent is swallowed rather than treated as a command, since the submenu
 * opens on hover and a click there means "I am on my way to the child".
 *
 * @param {object} props - Component props.
 * @param {string} props.label - Display text, or `-` for a separator.
 * @param {string} [props.hint] - Shortcut hint shown on the right.
 * @param {Function} [props.onClick] - Command to run.
 * @param {boolean} [props.disabled] - Render inert.
 * @param {boolean} [props.checked] - Show a check mark.
 * @param {boolean} [props.danger] - Style as destructive.
 * @param {Array<object>} [props.submenu] - Child items; makes this a submenu parent.
 * @param {'right'|'left'} [props.submenuSide='right'] - Which way to try opening a submenu first. Only a starting guess: the submenu measures itself and flips if it does not fit.
 * @returns {React.ReactElement} The menu row.
 * @sideEffect Reads live element geometry while a submenu is open, to keep it inside the window.
 */
export function Item({ label, hint, onClick, disabled, checked, danger, submenu, submenuSide = 'right' }) {
  const [openSub, setOpenSub] = useState(false)
  const subRef = useRef(null)
  // `null` until the open submenu has been measured, which is also what keeps
  // it invisible for the one frame before it is placed.
  const [fit, setFit] = useState(null)

  // Measured in a layout effect so the correction lands before the browser
  // paints. The dependency is deliberately just `openSub`: the effect reads
  // the submenu's *unadjusted* position, so re-running it on its own result
  // would measure the corrected box and oscillate.
  useLayoutEffect(() => {
    if (!openSub) { setFit(null); return }
    const r = subRef.current?.getBoundingClientRect()
    if (!r) return
    // Lift a submenu whose foot is off the bottom, but never so far that its
    // head goes off the top — a menu taller than the window is clamped, not
    // scrolled off both ends.
    let dy = Math.min(0, window.innerHeight - EDGE_PAD - r.bottom)
    if (r.top + dy < EDGE_PAD) dy = EDGE_PAD - r.top
    let side = submenuSide === 'left' ? 'left' : 'right'
    if (side === 'right' && r.right > window.innerWidth - EDGE_PAD) side = 'left'
    else if (side === 'left' && r.left < EDGE_PAD) side = 'right'
    setFit({ dy, side })
  }, [openSub, submenuSide])

  if (label === '-') return <div className="menu-sep" />
  return (
    <div
      className={`menu-item ${disabled ? 'disabled' : ''} ${danger ? 'danger' : ''}`}
      onMouseEnter={() => setOpenSub(true)}
      onMouseLeave={() => setOpenSub(false)}
      onClick={(e) => {
        if (disabled || submenu) { e.stopPropagation(); return }
        onClick?.()
      }}
    >
      <span className="mi-check">{checked ? '✓' : ''}</span>
      <span className="mi-label">{label}</span>
      {submenu
        ? <span className="mi-hint">{(fit?.side ?? submenuSide) === 'left' ? '◂' : '▸'}</span>
        : <span className="mi-hint">{hint || ''}</span>}
      {submenu && openSub && (
        <div
          ref={subRef}
          className={`menu-dropdown submenu ${(fit?.side ?? submenuSide) === 'left' ? 'to-left' : ''}`}
          style={{
            transform: fit?.dy ? `translateY(${fit.dy}px)` : undefined,
            visibility: fit ? 'visible' : 'hidden',
          }}
        >
          {submenu.map((it, i) => (
            // A child inherits the side its parent settled on, so a menu that
            // has already flipped does not send its own children back across.
            <Item key={it.label === '-' ? `s${i}` : it.label} {...it} submenuSide={fit?.side ?? submenuSide} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A list of dropdown rows.
 *
 * Separators repeat their label, so they are keyed by position; everything
 * else is keyed by label, which is unique within one menu.
 *
 * @param {object} props - Component props.
 * @param {Array<object>} props.items - Item descriptors, in display order.
 * @param {'right'|'left'} [props.submenuSide='right'] - Which way submenus open.
 * @returns {React.ReactElement[]} The rendered rows.
 * @pure
 */
export function ItemList({ items, submenuSide = 'right' }) {
  return items.map((it, i) => (
    <Item key={it.label === '-' ? `s${i}` : it.label} {...it} submenuSide={submenuSide} />
  ))
}
