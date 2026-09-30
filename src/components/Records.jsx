// Records: the bar that steps through a project's save states, and the lock
// that keeps an earlier record from being edited by accident.
//
// The last record is always editable. Selecting any earlier one makes the
// project read-only — every field that edits it is disabled — until its Edit
// button is pressed; the lock returns when another record is selected.
import React from 'react'
import { useStore, isLocked } from '../store'

/**
 * The records bar: previous and next, the record number, Add, Delete and Edit.
 *
 * @returns {React.ReactElement} The bar.
 * @sideEffect Subscribes to the store.
 */
export function RecordsBar() {
  const nav = useStore((s) => s.recordNav)
  const error = useStore((s) => s.recordError)
  const activeFile = useStore((s) => s.activeFile)
  const st = useStore.getState
  const last = nav.selected === nav.count - 1
  const off = nav.busy || !activeFile
  return (
    <div className={`tb-pill tb-records${isLocked({ recordNav: nav }) && !nav.busy ? ' locked' : ''}`}
      title={error ? `The last record action failed: ${error}` : 'Records: numbered save states of this project'}>
      <button className="tb-icon" title="Previous record" disabled={off || nav.selected === 0}
        onClick={() => st().recordStep(-1)}>◀</button>
      <span className="rec-num">Record <b>{nav.selected + 1}</b> of {nav.count}</span>
      <button className="tb-icon" title="Next record" disabled={off || last}
        onClick={() => st().recordStep(1)}>▶</button>
      <span className="rec-sep" />
      <button className="rec-btn" disabled={off} onClick={() => st().recordAdd()}
        title="Add a record at the end, starting as a copy of this one">Add</button>
      <button className="rec-btn" disabled={off || nav.count <= 1}
        onClick={() => { if (confirm(`Delete record ${nav.selected + 1}? This cannot be undone.`)) st().recordDelete() }}
        title={nav.count <= 1 ? 'A project keeps at least one record' : 'Delete this record'}>Delete</button>
      {!last && (
        <button className={`rec-btn${nav.editing ? ' on' : ''}`} disabled={off}
          onClick={() => st().setRecordEditing(!nav.editing)}
          title={nav.editing ? 'Lock this record again' : 'This is an earlier record, so it is read-only. Edit it.'}>
          {nav.editing ? 'Editing' : 'Edit'}
        </button>
      )}
    </div>
  )
}

/**
 * The note an editing panel shows while the project is read-only.
 *
 * @returns {React.ReactElement|null} The note, or nothing when the project can be edited.
 * @sideEffect Subscribes to the store.
 */
export function LockNote() {
  const nav = useStore((s) => s.recordNav)
  if (!isLocked({ recordNav: nav }) || nav.busy) return null
  return (
    <div className="rec-lock-note">
      <span>Record {nav.selected + 1} of {nav.count} is read-only.</span>
      <button className="rec-btn" onClick={() => useStore.getState().setRecordEditing(true)}>Edit</button>
    </div>
  )
}

/**
 * Wrap an editing panel so every field in it is disabled while the project is read-only.
 *
 * A disabled fieldset disables every input, select and button inside it at
 * once, so a panel needs no change of its own; its section headers, which
 * are not form controls, still open and close.
 *
 * @param {Function} Panel - The panel component.
 * @returns {Function} The wrapped component.
 * @pure
 */
export function readOnlyWhenLocked(Panel) {
  /**
   * The panel, disabled while the project is read-only.
   *
   * @param {object} props - Passed to the panel.
   * @returns {React.ReactElement} The panel.
   * @sideEffect Subscribes to the store.
   */
  function Locked(props) {
    const locked = useStore((s) => isLocked(s))
    return (
      <>
        <LockNote />
        <fieldset className="rec-fieldset" disabled={locked}>
          <Panel {...props} />
        </fieldset>
      </>
    )
  }
  Locked.displayName = `ReadOnly(${Panel.displayName || Panel.name || 'Panel'})`
  return Locked
}
