// The question asked before anything else: where does this workspace live?
//
// Only one answer exists today, which makes the prompt look redundant until
// you notice what it is really for. Browser storage is not a filing cabinet —
// clearing site data takes it, a private window never had it, and an eviction
// under storage pressure happens without asking. A user who learns that after
// building six enclosures has learned it too late. So it is said once, at the
// front, while there is nothing to lose.
//
// The other half of the reason is that this is where the choice will go when
// there is one. A folder on the user's own computer is the obvious next
// answer, and it is listed here, visibly not yet available, so the shape of
// the decision is familiar before it has consequences.
import React from 'react'
import { useStore } from '../store'

/**
 * The startup workspace-location prompt.
 *
 * Skipping and choosing browser storage do the same thing, deliberately: the
 * prompt is informative rather than gating, and a user who wants to get on
 * with it should not be made to read first. Both are recorded, so the question
 * is asked once rather than on every visit.
 *
 * @returns {React.ReactElement|null} The modal, or `null` once the question has been answered.
 * @sideEffect Subscribes to the store; the buttons write LocalStorage.
 */
export default function WorkspacePrompt() {
  const show = useStore((s) => s.workspacePrompt)
  const name = useStore((s) => s.workspace.name)
  if (!show) return null

  /**
   * Record the choice and dismiss the prompt.
   *
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage.
   */
  const choose = () => useStore.getState().chooseWorkspaceStorage('browser')

  return (
    <div className="modal-backdrop">
      <div className="modal wsp" style={{ maxWidth: 520, minWidth: 420 }}>
        <h3>Where should your work be kept?</h3>
        <p className="wsp-lead">
          AcouSim keeps your projects in a <b>workspace</b> — a set of files and
          folders you can download, edit and bring back. Starting in <b>{name}</b>.
        </p>

        <button className="wsp-option chosen" onClick={choose}>
          <span className="wsp-dot" />
          <span className="wsp-body">
            <span className="wsp-title">This browser</span>
            <span className="wsp-desc">
              Available now, on this machine, in this browser. It is not permanent
              storage: clearing site data removes it. Download your workspace
              regularly — the panel tells you how long it has been.
            </span>
          </span>
        </button>

        <div className="wsp-option disabled">
          <span className="wsp-dot" />
          <span className="wsp-body">
            <span className="wsp-title">A folder on this computer <em>— not yet</em></span>
            <span className="wsp-desc">
              Real files written straight to a folder you pick, saved as you work.
            </span>
          </span>
        </div>

        <div className="close-row">
          <button onClick={choose}>Skip for now</button>
          <button className="primary" onClick={choose}>Use this browser</button>
        </div>
      </div>
    </div>
  )
}
