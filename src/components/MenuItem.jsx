// The dropdown row, shared by the menu bar and the right-click menu.
//
// One implementation rather than two so the two menus cannot drift: a command
// offered in both places gets the same check mark, the same shortcut hint and
// the same disabled styling without anyone having to keep a copy in step.
//
// An item descriptor is plain data — `{label, hint, onClick, disabled,
// checked, danger, submenu}` — which is what lets a menu be built by whoever
// knows the context and rendered by code that knows nothing about it.
import React, { useState } from 'react'

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
 * @param {'right'|'left'} [props.submenuSide='right'] - Which way submenus open. A menu near the right edge of the window opens them leftward so they stay on screen.
 * @returns {React.ReactElement} The menu row.
 * @pure
 */
export function Item({ label, hint, onClick, disabled, checked, danger, submenu, submenuSide = 'right' }) {
  const [openSub, setOpenSub] = useState(false)
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
        ? <span className="mi-hint">{submenuSide === 'left' ? '◂' : '▸'}</span>
        : <span className="mi-hint">{hint || ''}</span>}
      {submenu && openSub && (
        <div className={`menu-dropdown submenu ${submenuSide === 'left' ? 'to-left' : ''}`}>
          {submenu.map((it, i) => (
            <Item key={it.label === '-' ? `s${i}` : it.label} {...it} submenuSide={submenuSide} />
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
