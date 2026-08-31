// The workspace panel: what used to be the node palette's dock slot.
//
// A workspace holds projects, the folders a user sorts them into, and the app
// data under `.acousim` — custom drivers today. It lives in the browser, which
// is convenient and not durable: clearing site data takes it, a private window
// never had it, and storage pressure can evict it without asking. So the panel
// leads with how long it has been since a copy left the browser, and the
// download button sits beside that sentence rather than buried in a menu.
//
// Everything here is browser-side. There is no account, no server and nothing
// uploaded; a workspace leaves as a file the user can read and comes back the
// same way.
import React, { useRef, useState } from 'react'
import { useStore } from '../store'
import {
  buildTree, isSystemPath, parentOf, baseName, joinPath, timeAgo, isDownloadStale,
  SYSTEM_FOLDER, DRIVERS_PATH,
} from '../workspace'

/**
 * Label for one file's kind, shown beside its name.
 *
 * @param {object} entry - The stored file record.
 * @returns {string} A short description of what the file holds.
 * @pure
 */
function kindLabel(entry) {
  if (entry.kind === 'project') return `${(entry.data?.nodes || []).length} nodes`
  if (entry.kind === 'drivers') return `${(entry.data || []).length} drivers`
  return entry.kind
}

/**
 * How long a workspace has gone without leaving the browser.
 *
 * Deliberately the first thing in the panel. Every other file manager a user
 * has met is backed by a disk that remembers; this one is backed by storage
 * the browser may reclaim, and the only honest response is to keep saying so.
 *
 * @param {object} props - Component props.
 * @param {object} props.workspace - The workspace being described.
 * @param {() => void} props.onDownload - Called when the user asks for a download.
 * @param {() => void} props.onImport - Called when the user asks to import one.
 * @returns {React.ReactElement} The freshness box.
 * @sideEffect Reads the current time to phrase the interval.
 */
function FreshnessBox({ workspace, onDownload, onImport }) {
  const now = Date.now()
  const stale = isDownloadStale(workspace, now)
  const when = timeAgo(workspace.downloaded, now)
  return (
    <div className={`ws-freshness ${stale ? 'stale' : ''}`}>
      <div className="wsf-line">
        <span className="wsf-dot" />
        <span>
          {workspace.downloaded
            ? <>Last download <b>{when}</b></>
            : <>This workspace has <b>never been downloaded</b></>}
        </span>
      </div>
      <div className="wsf-note">
        Workspaces live in this browser only. Clearing site data removes them.
      </div>
      <div className="wsf-actions">
        <button className="primary" onClick={onDownload}>Download workspace</button>
        <button onClick={onImport}>Import…</button>
      </div>
    </div>
  )
}

/**
 * One row of the workspace tree, and — for a folder — everything beneath it.
 *
 * Recursive rather than flattened, because indentation and collapsing are both
 * questions about depth and a flat list would have to re-derive it per row.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - A node from `buildTree`.
 * @param {number} props.depth - Nesting depth, driving the indent.
 * @param {object} props.ctl - Callbacks and state shared by every row: `activeFile`, `collapsed`, `toggle`, `open`, `rename`, `remove`, `addTo`.
 * @returns {React.ReactElement} The row, with its children when it is an expanded folder.
 * @pure
 */
function Row({ node, depth, ctl }) {
  const system = isSystemPath(node.path)
  const pad = { paddingLeft: 6 + depth * 13 }

  if (node.kind === 'folder') {
    const open = !ctl.collapsed.has(node.path)
    return (
      <>
        <div className={`ws-row folder ${system ? 'system' : ''}`} style={pad} onClick={() => ctl.toggle(node.path)}>
          <span className="ws-caret">{open ? '▾' : '▸'}</span>
          <span className="ws-name">{node.name}</span>
          <span className="ws-actions" onClick={(e) => e.stopPropagation()}>
            {!system && <>
              <button title="New project in this folder" onClick={() => ctl.addTo(node.path)}>+</button>
              <button title="Rename" onClick={() => ctl.rename(node.path)}>✎</button>
            </>}
            <button title="Delete" onClick={() => ctl.remove(node.path)}>✕</button>
          </span>
        </div>
        {open && node.children.map((c) => <Row key={c.path} node={c} depth={depth + 1} ctl={ctl} />)}
      </>
    )
  }

  const project = node.entry.kind === 'project'
  return (
    <div
      className={`ws-row file ${node.path === ctl.activeFile ? 'active' : ''} ${system ? 'system' : ''}`}
      style={pad}
      onClick={() => project && ctl.open(node.path)}
    >
      <span className={`ws-icon ${node.entry.kind}`} />
      <span className="ws-name">{node.name}</span>
      <span className="ws-meta">{kindLabel(node.entry)}</span>
      <span className="ws-actions" onClick={(e) => e.stopPropagation()}>
        {!system && <button title="Rename" onClick={() => ctl.rename(node.path)}>✎</button>}
        <button title="Delete" onClick={() => ctl.remove(node.path)}>✕</button>
      </span>
    </div>
  )
}

/**
 * The workspace file browser.
 *
 * Opening a project switches the canvas to it, saving the outgoing one first.
 * Renaming a project file renames the project inside it, so the two never
 * disagree. `.acousim` is shown rather than hidden — a user who can see where
 * their custom drivers live is not surprised when those drivers travel with a
 * downloaded workspace — but it cannot be renamed, since the app finds its
 * contents by path.
 *
 * @returns {React.ReactElement} The panel.
 * @sideEffect Subscribes to the store. The buttons prompt, confirm, read files and trigger downloads.
 */
export default function FileBrowser() {
  const workspace = useStore((s) => s.workspace)
  const activeFile = useStore((s) => s.activeFile)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [error, setError] = useState(null)
  const fileInput = useRef(null)

  const tree = buildTree(workspace)

  /**
   * Expand or collapse a folder.
   *
   * @param {string} path - The folder's path.
   * @returns {void}
   * @sideEffect Writes component state.
   */
  const toggle = (path) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (!next.delete(path)) next.add(path)
    return next
  })

  /**
   * Ask for a new name and apply it.
   *
   * The prompt is seeded with the current name so a small correction is a
   * small edit, and the result is placed back in the same folder — this is a
   * rename, not a move.
   *
   * @param {string} path - Path of the entry to rename.
   * @returns {void}
   * @sideEffect Shows a prompt, then writes store state. Reports a refused rename in the panel.
   */
  const rename = (path) => {
    const current = baseName(path)
    const name = prompt('New name:', current)
    if (!name || name === current) return
    const ok = useStore.getState().renamePath(path, joinPath(parentOf(path), name))
    setError(ok ? null : `Could not rename to “${name}” — the name is invalid or already taken.`)
  }

  /**
   * Delete an entry after confirming.
   *
   * A folder names how much is going with it, since the number is the whole
   * difference between a routine delete and a costly one.
   *
   * @param {string} path - Path of the entry to delete.
   * @returns {void}
   * @sideEffect Shows a confirmation dialog, then writes store state. Does nothing if declined.
   */
  const remove = (path) => {
    const inside = Object.keys(workspace.files).filter((p) => p.startsWith(`${path}/`)).length
    const what = inside ? `“${path}” and the ${inside} file${inside === 1 ? '' : 's'} in it` : `“${path}”`
    const extra = isSystemPath(path)
      ? '\n\nThis is app data. It will be recreated empty the next time something needs it.'
      : ''
    if (!confirm(`Delete ${what}?${extra}`)) return
    useStore.getState().deletePath(path)
    setError(null)
  }

  /**
   * Read a chosen workspace file and load it.
   *
   * Confirmed first: importing replaces every project in the browser, and the
   * copy being replaced may be the only one that exists.
   *
   * @param {React.ChangeEvent} e - The file input's change event.
   * @returns {void}
   * @sideEffect Shows a confirmation, reads the chosen file, replaces the workspace on success, and clears the input so choosing the same file twice still fires.
   */
  const onImportFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm(`Replace “${workspace.name}” with the contents of “${file.name}”? Every project in this browser is replaced.`)) return
    const reader = new FileReader()
    /**
     * Hand the file's text to the store and report a rejection in the panel.
     *
     * @returns {void}
     * @sideEffect Replaces the workspace on success; writes component state either way.
     */
    reader.onload = () => {
      const result = useStore.getState().importWorkspaceText(String(reader.result))
      setError(result.ok ? null : result.error)
    }
    /**
     * Report a file that could not be read at all.
     *
     * @returns {void}
     * @sideEffect Writes component state.
     */
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  const ctl = {
    activeFile,
    collapsed,
    toggle,
    rename,
    remove,
    /**
     * Open a project file on the canvas.
     *
     * @param {string} path - Path of the file to open.
     * @returns {void}
     * @sideEffect Writes store state, replacing what is on the canvas.
     */
    open: (path) => useStore.getState().openFile(path),
    /**
     * Create a project inside a folder.
     *
     * @param {string} folder - The folder's path.
     * @returns {void}
     * @sideEffect Writes store state, replacing what is on the canvas.
     */
    addTo: (folder) => useStore.getState().newFile(folder),
  }

  return (
    <div className="panel-scroll ws-panel">
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={onImportFile}
      />

      <div className="ws-head">
        <input
          className="ws-title"
          value={workspace.name}
          title="Workspace name — used for the downloaded file"
          onChange={(e) => useStore.getState().setWorkspaceName(e.target.value)}
        />
      </div>

      <FreshnessBox
        workspace={workspace}
        onDownload={() => useStore.getState().downloadWorkspace()}
        onImport={() => fileInput.current?.click()}
      />

      {error && <div className="ws-error">{error}</div>}

      <div className="ws-toolbar">
        <button onClick={() => useStore.getState().newFile('')}>New project</button>
        <button onClick={() => useStore.getState().newFolder('')}>New folder</button>
      </div>

      <div className="ws-tree">
        {tree.map((n) => <Row key={n.path} node={n} depth={0} ctl={ctl} />)}
      </div>

      {!workspace.files[DRIVERS_PATH] && (
        <div className="ws-hint">
          The <code>{SYSTEM_FOLDER}</code> folder appears here as soon as the app
          has something to store in it — saving a custom driver, for one.
        </div>
      )}
    </div>
  )
}
