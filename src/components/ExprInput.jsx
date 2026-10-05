import React from 'react'
import { NUMBER, useDraft } from './NumInput'
import { evaluateExpression, isExpression } from '../schema/params'
import { useParamValues } from '../useResolved'

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
 * expression, and shows what it resolves to. Anything can be typed: text that
 * is not a value the field takes — half an expression, a misspelt name, a
 * number under the minimum — turns the box red and is not applied. Enter or
 * leaving the box applies valid text; leaving with invalid text puts the
 * stored value back. Arrow keys step a plain number.
 *
 * @param {object} props - Component props.
 * @param {number|string|null|undefined} props.value - The stored value.
 * @param {Function} props.onCommit - Called with a number or an expression string.
 * @param {number} [props.step] - Arrow-key step for a plain number.
 * @param {number} [props.min] - Smallest number accepted.
 * @param {number} [props.above] - A number must be greater than this.
 * @param {string} [props.placeholder] - Shown when empty.
 * @param {boolean} [props.disabled] - Disable the input.
 * @param {string} [props.title] - Tooltip.
 * @returns {React.ReactElement} The input, with the resolved value beside an expression.
 * @sideEffect Subscribes to the store for the named params.
 */
export default function ExprInput({ value, onCommit, step, min, above, placeholder, disabled, title }) {
  const { values } = useParamValues()
  /**
   * Read typed text as a value this field takes.
   *
   * @param {string} t - The text.
   * @returns {{ok: boolean, value?: number|string, error?: string}} The value, or why it is refused.
   * @pure
   */
  const read = (t) => {
    const r = readTyped(t, values)
    if (r.ok && typeof r.value === 'number' && min != null && r.value < Number(min)) return { ok: false, error: `Must be at least ${min}` }
    if (r.ok && typeof r.value === 'number' && above != null && !(r.value > Number(above))) return { ok: false, error: `Must be more than ${above}` }
    return r.error === 'empty' ? { ok: false, error: 'Enter a number or an expression' } : r
  }
  const d = useDraft({ value, read, onCommit })
  const expr = isExpression(value)
  const resolved = expr ? evaluateExpression(value, values) : null
  return (
    <span className="expr-input">
      <input
        type="text"
        inputMode="decimal"
        spellCheck={false}
        autoComplete="off"
        className={d.error ? 'invalid' : ''}
        value={d.text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={d.error ? true : undefined}
        title={d.error || title || 'A number, or an expression over the project parameters, e.g. Vb / 2'}
        onChange={d.onChange}
        onBlur={d.onBlur}
        onKeyDown={(e) => {
          if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || isExpression(value)) { d.onKeyDown(e); return }
          e.preventDefault()
          const delta = (Number(step) || 1) * (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
          const next = Number((Number(value || 0) + delta).toPrecision(12))
          if ((min != null && next < Number(min)) || (above != null && !(next > Number(above)))) return
          d.setText(null)
          onCommit(next)
        }}
      />
      {expr && <span className="expr-value" title={resolved.error || ''}>= {resolved.error ? '?' : shortNum(resolved.value)}</span>}
    </span>
  )
}
