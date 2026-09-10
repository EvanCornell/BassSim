// The question asked before anything else: where does this workspace live?
//
// Browser storage is not a filing cabinet — clearing site data takes it, a
// private window never had it, and an eviction under storage pressure happens
// without asking. A user who learns that after building six enclosures has
// learned it too late. So it is said once, at the front, while there is
// nothing to lose.
//
// The other answer is a folder on the user's own computer, where the projects
// are ordinary files in their own backups and their own version control. It is
// offered first where the browser supports it, and shown as unavailable rather
// than hidden where it does not — a user on Safari should find out that the
// option exists and what would give it to them.
import React from 'react'
import { useStore } from '../store'
import { supportsFolders } from '../utils/folder'
import { connectFolderWithPrompt } from '../utils/folderPrompts'

/**
 * The startup workspace-location prompt.
 *
 * Skipping and choosing browser storage do the same thing, deliberately: the
 * prompt is informative rather than gating, and a user who wants to get on
 * with it should not be made to read first. Both are recorded, so the question
 * is asked once rather than on every visit.
 *
 * @returns {React.ReactElement|null} The modal, or `null` once the question has been answered.
 * @sideEffect Subscribes to the store; the buttons write LocalStorage, and choosing a folder opens a picker and writes to disk.
 */
export default function WorkspacePrompt() {
  const show = useStore((s) => s.workspacePrompt)
  const name = useStore((s) => s.workspace.name)
  const canUseFolder = supportsFolders()
  if (!show) return null

  /**
   * Record the choice and dismiss the prompt.
   *
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage.
   */
  const choose = () => useStore.getState().chooseWorkspaceStorage('browser')

  /**
   * Pick a folder to keep the workspace in.
   *
   * A folder that already holds a workspace is opened instead — the prompt is
   * the first thing a returning user on a new machine sees, and pointing it at
   * their synced folder should bring their work back, not overwrite it.
   *
   * @returns {Promise<void>} Resolves once the folder is connected or the picker is dismissed.
   * @sideEffect Shows a folder picker and a confirmation, writes to the user's filesystem, and writes store state.
   */
  const chooseFolder = async () => {
    const result = await connectFolderWithPrompt()
    if (result.error) alert(result.error)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wsp" style={{ maxWidth: 520, minWidth: 420 }}>
        <h3>Where should your work be kept?</h3>
        <p className="wsp-lead">
          AcouSim keeps your projects in a <b>workspace</b> — a set of files and
          folders you can download, edit and bring back. Starting in <b>{name}</b>.
        </p>

        {canUseFolder ? (
          <button className="wsp-option chosen" onClick={chooseFolder}>
            <span className="wsp-dot" />
            <span className="wsp-body">
              <span className="wsp-title">A folder on this computer</span>
              <span className="wsp-desc">
                Real files written straight to a folder you pick, saved as you
                work. Yours to back up, sync and keep in version control — and a
                folder that already holds a workspace opens instead.
              </span>
            </span>
          </button>
        ) : (
          <div className="wsp-option disabled">
            <span className="wsp-dot" />
            <span className="wsp-body">
              <span className="wsp-title">A folder on this computer <em>— not in this browser</em></span>
              <span className="wsp-desc">
                Chrome and Edge can write straight to a folder you pick. This
                browser cannot yet.
              </span>
            </span>
          </div>
        )}

        <button className="wsp-option" onClick={choose}>
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

        <div className="close-row">
          <button onClick={choose}>Skip for now</button>
          <button className="primary" onClick={canUseFolder ? chooseFolder : choose}>
            {canUseFolder ? 'Choose a folder…' : 'Use this browser'}
          </button>
        </div>
      </div>
    </div>
  )
}
