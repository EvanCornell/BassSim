import React from 'react'
import { useStore } from '../store'
import ExprInput, { shortNum } from './ExprInput'
import { useParamValues } from '../useResolved'
import { isValidParamName } from '../schema/params'
import { freshId } from '../schema/extras'

/**
 * The project's named parameters: values defined once and used by name.
 *
 * Any numeric field — a node parameter, a tap position, a channel's volts, a
 * filter frequency — may hold an expression over these, e.g. `Vb / 2`.
 * A parameter may itself be an expression over others. Renaming a parameter
 * does not rewrite the expressions that use it; they report the missing name
 * until they are updated.
 *
 * @returns {React.ReactElement} The panel.
 * @sideEffect Subscribes to the store.
 */
export default function VariablesPanel() {
  const params = useStore((s) => s.projectExtras.params) || []
  const setExtra = useStore((s) => s.setExtra)
  const { values, errors } = useParamValues()
  /**
   * Replace one parameter.
   *
   * @param {number} i - Its index.
   * @param {object} change - Fields to merge.
   * @param {boolean} [live] - A typed value: no undo step.
   * @returns {void}
   * @sideEffect Writes the project's params.
   */
  const edit = (i, change, live) => setExtra('params', params.map((p, k) => (k === i ? { ...p, ...change } : p)), !live)
  return (
    <div className="panel-scroll">
      <div className="panel-section">
        <h4>Project parameters</h4>
        <div className="ts-hint">
          Define a value once and use it by name in any numeric field — type
          <code> Vb / 2</code> into a chamber's volume, for example. Functions:
          sqrt, min, max, abs, log, log10, exp, pow, round, floor, ceil; constants pi and e.
        </div>
        <div className="vars-table">
          {params.map((p, i) => {
            const nameOk = isValidParamName(p.name)
            return (
              <div className="vars-row" key={i}>
                <input
                  className={`vars-name${nameOk ? '' : ' invalid'}`}
                  value={p.name}
                  spellCheck={false}
                  title={nameOk ? 'Name' : 'A name is letters, digits and _, starting with a letter, and not a function or constant name'}
                  onChange={(e) => edit(i, { name: e.target.value.trim() }, true)}
                />
                <span className="vars-eq">=</span>
                <ExprInput value={p.value} onCommit={(v) => edit(i, { value: v }, true)} />
                <span className="vars-val" title="Resolved value">{p.name in values ? shortNum(values[p.name]) : '?'}</span>
                <input className="vars-note" value={p.note || ''} placeholder="note" onChange={(e) => edit(i, { note: e.target.value || undefined }, true)} />
                <button className="icon-btn" title="Remove" onClick={() => setExtra('params', params.filter((_, k) => k !== i))}>✕</button>
              </div>
            )
          })}
        </div>
        <button onClick={() => setExtra('params', [...params, { name: freshId('p', params.map((p) => p.name)), value: 1 }])}>+ Parameter</button>
        {errors.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {errors.map((e, i) => <div key={i} className="node-warning"><span className="warn-dot" /> {e}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}
