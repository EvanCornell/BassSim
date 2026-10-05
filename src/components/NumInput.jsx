import React, { useState } from 'react'

/** A plain number as typed: sign, digits, one point, optional exponent. */
export const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

/**
 * Check typed text against a field's limits.
 *
 * @param {string} text - What was typed.
 * @param {object} [limits] - What the field accepts.
 * @param {number|string} [limits.min] - Smallest value accepted.
 * @param {number|string} [limits.max] - Largest value accepted.
 * @param {number|string} [limits.above] - The value must be greater than this.
 * @param {boolean} [limits.integer] - Whole numbers only.
 * @param {boolean} [limits.allowEmpty] - An empty box is a value (stored as null).
 * @param {Function} [limits.validate] - Further check: returns why a number is refused, or nothing.
 * @returns {{ok: boolean, value?: number|null, error?: string}} The number, or why the text is not one the field takes.
 * @pure
 */
export function readNumber(text, { min, max, above, integer, allowEmpty, validate } = {}) {
  const t = String(text).trim()
  if (!t) return allowEmpty ? { ok: true, value: null } : { ok: false, error: 'Enter a number' }
  if (!NUMBER.test(t)) return { ok: false, error: 'Not a number' }
  const v = parseFloat(t)
  if (!Number.isFinite(v)) return { ok: false, error: 'Not a number' }
  if (integer && !Number.isInteger(v)) return { ok: false, error: 'Must be a whole number' }
  if (min != null && min !== '' && v < Number(min)) return { ok: false, error: `Must be at least ${min}` }
  if (above != null && above !== '' && !(v > Number(above))) return { ok: false, error: `Must be more than ${above}` }
  if (max != null && max !== '' && v > Number(max)) return { ok: false, error: `Must be at most ${max}` }
  const why = validate?.(v)
  if (why) return { ok: false, error: why }
  return { ok: true, value: v }
}

/**
 * Hold what is typed in a box apart from the value it edits.
 *
 * The box shows the stored value until it is typed in; from then on it shows
 * exactly what was typed, valid or not, so nothing typed is ever undone under
 * the cursor. Enter or leaving the box applies the text when it reads as a
 * value; leaving with text that does not puts the stored value back. Escape
 * puts it back at once.
 *
 * @param {object} args - The field.
 * @param {*} args.value - The stored value.
 * @param {Function} args.read - Reads text: `{ok, value}` or `{ok: false, error}`.
 * @param {Function} args.onCommit - Called with the value read when it is applied and differs from the stored one.
 * @param {Function} [args.format] - Text for the stored value.
 * @returns {{text: string, editing: boolean, error: string|null, onChange: Function, onBlur: Function, onKeyDown: Function, setText: Function}} What the input needs.
 * @sideEffect Holds the typed text in component state.
 */
export function useDraft({ value, read, onCommit, format = (v) => (v == null ? '' : String(v)) }) {
  const [draft, setText] = useState(null)
  const r = draft == null ? null : read(draft)
  const error = r && !r.ok ? r.error : null
  /**
   * Apply the typed text if it reads as a value.
   *
   * @returns {boolean} Whether the box is now back to showing the stored value.
   * @sideEffect Calls `onCommit` with a changed value; clears the draft.
   */
  const apply = () => {
    if (draft == null) return true
    if (!r.ok) return false
    if (r.value !== value) onCommit(r.value)
    setText(null)
    return true
  }
  /**
   * Hold what was typed.
   *
   * @param {Event} e - The input's change event.
   * @returns {void}
   * @sideEffect Sets the draft.
   */
  const onChange = (e) => setText(e.target.value)
  /**
   * Leaving the box: apply valid text, otherwise put the stored value back.
   *
   * @returns {void}
   * @sideEffect May call `onCommit`; clears the draft.
   */
  const onBlur = () => { if (!apply()) setText(null) }
  /**
   * Enter applies; Escape puts the stored value back.
   *
   * @param {KeyboardEvent} e - The key event.
   * @returns {void}
   * @sideEffect May call `onCommit` or clear the draft; stops Escape from closing a surrounding dialog while editing.
   */
  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); apply() }
    else if (e.key === 'Escape' && draft != null) { e.preventDefault(); e.stopPropagation(); setText(null) }
  }
  return { text: draft ?? format(value), editing: draft != null, error, setText, onChange, onBlur, onKeyDown }
}

/**
 * A number box that takes any typing and applies it on Enter or on leaving.
 *
 * While the text is not a number the field accepts, the box turns red and its
 * tooltip says why; nothing is applied. Leaving the box with such text puts
 * the stored value back. The arrow keys step the value and apply it at once.
 *
 * @param {object} props - Component props; anything not listed is passed to the input.
 * @param {number|null|undefined} props.value - The stored value.
 * @param {Function} props.onCommit - Called with the new number (or null for an allowed empty box).
 * @param {number|string} [props.min] - Smallest value accepted.
 * @param {number|string} [props.max] - Largest value accepted.
 * @param {number|string} [props.above] - The value must be greater than this.
 * @param {boolean} [props.integer] - Whole numbers only.
 * @param {boolean} [props.allowEmpty] - An empty box applies as null.
 * @param {Function} [props.validate] - Further check: returns why a number is refused, or nothing.
 * @param {Function} [props.format] - Text for the stored value.
 * @param {number|string} [props.step] - Arrow-key step; Shift steps ten times as far.
 * @param {string} [props.className] - Extra classes for the input.
 * @param {string} [props.title] - Tooltip when the text is valid.
 * @returns {React.ReactElement} The input.
 * @sideEffect Holds the typed text in component state.
 */
export default function NumInput({ value, onCommit, min, max, above, integer, allowEmpty, validate, format, step, className, title, ...rest }) {
  const limits = { min, max, above, integer, allowEmpty, validate }
  /**
   * Read typed text against this field's limits.
   *
   * @param {string} t - The text.
   * @returns {{ok: boolean, value?: number|null, error?: string}} The number, or why it is refused.
   * @pure
   */
  const read = (t) => readNumber(t, limits)
  const d = useDraft({ value, onCommit, format, read })
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      spellCheck={false}
      autoComplete="off"
      className={`num${d.error ? ' invalid' : ''}${className ? ` ${className}` : ''}`}
      value={d.text}
      title={d.error || title || ''}
      aria-invalid={d.error ? true : undefined}
      onChange={d.onChange}
      onBlur={d.onBlur}
      onKeyDown={(e) => {
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !rest.readOnly) {
          e.preventDefault()
          const base = readNumber(d.text, { allowEmpty: false })
          const from = base.ok ? base.value : Number(value) || 0
          const delta = (Number(step) || 1) * (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
          const next = Number((from + delta).toPrecision(12))
          const r = readNumber(String(next), limits)
          if (!r.ok) return
          d.setText(null)
          if (r.value !== value) onCommit(r.value)
          return
        }
        d.onKeyDown(e)
      }}
    />
  )
}

/**
 * Read typed text as a list of numbers separated by commas or spaces.
 *
 * @param {string} text - What was typed.
 * @param {object} [limits] - What each entry must satisfy, as for `readNumber`.
 * @returns {{ok: boolean, value?: number[], error?: string}} The numbers, or why the text is not a list the field takes.
 * @pure
 */
export function readNumberList(text, limits = {}) {
  const parts = String(text).split(/[\s,;]+/).filter(Boolean)
  if (!parts.length) return { ok: false, error: 'Enter at least one number' }
  const value = []
  for (const part of parts) {
    const r = readNumber(part, limits)
    if (!r.ok) return { ok: false, error: `${part}: ${r.error}` }
    value.push(r.value)
  }
  return { ok: true, value }
}

/**
 * A list as the text a box shows.
 *
 * @param {number[]} list - The list.
 * @returns {string} e.g. `0, 6, 12`.
 * @pure
 */
const listText = (list) => list.join(', ')

/**
 * A box holding a list of numbers, taking any typing and applying it on
 * Enter or on leaving, like `NumInput`.
 *
 * @param {object} props - Component props; anything not listed is passed to the input.
 * @param {number[]} props.value - The stored list.
 * @param {Function} props.onCommit - Called with the new list.
 * @param {number|string} [props.min] - Smallest entry accepted.
 * @param {number|string} [props.above] - Every entry must be greater than this.
 * @param {string} [props.title] - Tooltip when the text is valid.
 * @returns {React.ReactElement} The input.
 * @sideEffect Holds the typed text in component state.
 */
export function ListInput({ value, onCommit, min, above, title, ...rest }) {
  /**
   * Apply a list that differs from the stored one.
   *
   * @param {number[]} list - The list read.
   * @returns {void}
   * @sideEffect Calls `onCommit` when the list changed.
   */
  const commitList = (list) => { if (list.join() !== value.join()) onCommit(list) }
  /**
   * Read typed text as this field's list.
   *
   * @param {string} t - The text.
   * @returns {{ok: boolean, value?: number[], error?: string}} The list, or why it is refused.
   * @pure
   */
  const readList = (t) => readNumberList(t, { min, above })
  const d = useDraft({ value, onCommit: commitList, format: listText, read: readList })
  return (
    <input
      {...rest}
      type="text"
      spellCheck={false}
      autoComplete="off"
      className={d.error ? 'invalid' : ''}
      value={d.text}
      title={d.error || title || ''}
      aria-invalid={d.error ? true : undefined}
      onChange={d.onChange}
      onBlur={d.onBlur}
      onKeyDown={d.onKeyDown}
    />
  )
}
