import React, { useState } from 'react'
import { evaluateExpression, isExpression } from '../schema/params'
import { useParamValues } from '../useResolved'

/** A plain number as typed: sign, digits, one point, optional exponent. */
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

/**
 * Round a value for display without trailing noise.
 *
 * @param {number} v - The value.
 * @returns {string} Up to six significant figures.
 * @pure
 */
export const shortNum = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '—')

/**
 * Read typed text as a field value: a number, an expression, or neither.
 *
 * @param {string} text - What was typed.
 * @param {Object<string, number>} values - Resolved named params.
 * @returns {{ok: boolean, value?: number|string, error?: string}} The value to store, or why the text cannot be stored yet.
 * @pure
 */
export function readTyped(text, values) {
  const t = text.trim()
  if (!t) return { ok: false, error: 'empty' }
  if (NUMBER.test(t)) return { ok: true, value: parseFloat(t) }
  const r = evaluateExpression(t, values)
  if (r.error) return { ok: false, error: r.error }
  return { ok: true, value: t }
}

/**
 * A numeric input that also takes an expression over the named params.
 *
 * Typing a number stores a number; typing anything else stores it as an
 * expression once it resolves, and shows what it resolves to. Text that does
 * not resolve yet — half an expression, a misspelt name — is held in the box,
 * outlined, and never written, so a half-typed edit cannot break the run.
 * Arrow keys step a plain number.
 *
 * @param {object} props - Component props.
 * @param {number|string|null|undefined} props.value - The stored value.
 * @param {Function} props.onCommit - Called with a number or an expression string.
 * @param {number} [props.step] - Arrow-key step for a plain number.
 * @param {number} [props.min] - Smallest number accepted.
 * @param {string} [props.placeholder] - Shown when empty.
 * @param {boolean} [props.disabled] - Disable the input.
 * @param {string} [props.title] - Tooltip.
 * @returns {React.ReactElement} The input, with the resolved value beside an expression.
 * @sideEffect Subscribes to the store for the named params.
 */
export default function ExprInput({ value, onCommit, step, min, placeholder, disabled, title }) {
  const { values } = useParamValues()
  const [text, setText] = useState(null)
  const [bad, setBad] = useState(null)
  const shown = text ?? (value == null ? '' : String(value))
  const expr = isExpression(value)
  const resolved = expr ? evaluateExpression(value, values) : null
  /**
   * Store what was typed if it can be stored.
   *
   * @param {string} t - The text.
   * @returns {void}
   * @sideEffect Calls `onCommit` when the text is a usable value.
   */
  const commit = (t) => {
    const r = readTyped(t, values)
    if (r.ok && typeof r.value === 'number' && min != null && r.value < Number(min)) {
      setBad(`must be at least ${min}`)
      return
    }
    setBad(r.ok ? null : r.error)
    if (r.ok) onCommit(r.value)
  }
  return (
    <span className="expr-input">
      <input
        type="text"
        inputMode="decimal"
        spellCheck={false}
        className={bad && bad !== 'empty' ? 'invalid' : ''}
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        title={bad && bad !== 'empty' ? bad : (title || 'A number, or an expression over the project parameters, e.g. Vb / 2')}
        onChange={(e) => { setText(e.target.value); commit(e.target.value) }}
        onBlur={() => { setText(null); setBad(null) }}
        onKeyDown={(e) => {
          if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || isExpression(value)) return
          e.preventDefault()
          const d = (Number(step) || 1) * (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
          const next = Number((Number(value || 0) + d).toPrecision(12))
          if (min != null && next < Number(min)) return
          setText(null)
          onCommit(next)
        }}
      />
      {expr && <span className="expr-value" title={resolved.error || ''}>= {resolved.error ? '?' : shortNum(resolved.value)}</span>}
    </span>
  )
}

