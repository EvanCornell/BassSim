// The workspace explorer, modelled on the VS Code and Eclipse file navigators.
//
// The conventions those two share are the ones a user arrives already knowing,
// so they are followed rather than reinvented: a compact indented tree with
// twisties and indent guides, single click to select and open, arrow keys to
// walk it, F2 to rename in place, Delete to remove, Ctrl+X/C/V to move and
// copy, drag onto a folder to move, and a right-click menu that is the same
// set of commands again.
//
// Renaming and creating happen *in the tree*, not in a dialog. That is the
// detail that most makes a file navigator feel like one: the row turns into a
// text box where it sits, the extension is left out of the initial selection
// so typing replaces only the name, and a bad name is reported under the box
// without throwing the edit away.
//
// The tree is derived from the workspace on every render — see src/workspace.js
// for why the model is flat. Selection, expansion, the inline editor and the
// file clipboard live in the store rather than here, because the right-click
// menu is a separate component that has to read and drive all four.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { isPopout } from '../popout'
import {
  buildTree, isSystemPath, parentOf, baseName, joinPath, timeAgo, isDownloadStale,
  PROJECT_EXT,
} from '../workspace'
import { supportsFolders } from '../utils/folder'
import { connectFolderWithPrompt, disconnectFolderWithPrompt } from '../utils/folderPrompts'

/** The drag type marking a drag as one of the explorer's own rows. */
const ROW_DRAG_TYPE = 'application/speakerspice-path'

/**
 * The twisty drawn beside a folder.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the folder is expanded.
 * @returns {React.ReactElement} The chevron.
 * @pure
 */
function Chevron({ open }) {
  return (
    <svg className={`ws-chevron ${open ? 'open' : ''}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The marker drawn beside a row.
 *
 * A file gets a small square in the hue of what it holds — a project, the
 * driver library, the snapshots — so they are told apart at a glance
 * rather than by reading. A folder has its chevron and nothing else.
 *
 * @param {object} props - Component props.
 * @param {string} props.kind - `'folder'` for a folder, otherwise the file entry's kind.
 * @returns {React.ReactElement} The marker.
 * @pure
 */
function RowIcon({ kind }) {
  return <span className={`ws-sq ${kind}`} aria-hidden="true" />
}

/**
 * The visible rows of the tree, in display order.
 *
 * Flattened rather than rendered recursively because every other behaviour
 * here is a question about the *visible* list: which row the down arrow moves
 * to, which rows a shift-click spans, where the indent guides run. A recursive
 * render would answer none of those without re-deriving this anyway.
 *
 * @param {Array<object>} nodes - Tree nodes from `buildTree`.
 * @param {string[]} collapsed - Paths of the collapsed folders.
 * @param {number} [depth] - Nesting depth of `nodes`, used by the recursion.
 * @returns {Array<object>} Row descriptors, each carrying its node, depth and expanded state.
 * @pure
 */
function flatten(nodes, collapsed, depth = 0) {
  const out = []
  for (const node of nodes) {
    const open = node.kind === 'folder' && !collapsed.includes(node.path)
    out.push({ node, depth, open })
    if (open) out.push(...flatten(node.children, collapsed, depth + 1))
  }
  return out
}

/**
 * The text box a row becomes while it is being named.
 *
 * Seeded with the current name and, for a file, with only the stem selected —
 * the convention every file manager follows, since the extension is almost
 * never the part being changed. Enter commits, Escape abandons, and clicking
 * away commits, which is what a user who has typed a name and moved on
 * expects.
 *
 * @param {object} props - Component props.
 * @param {string} props.value - Initial name.
 * @param {string|null} props.error - Message to show under the box, or `null`.
 * @param {(name: string) => void} props.onCommit - Called with the typed name.
 * @param {() => void} props.onCancel - Called when the edit is abandoned.
 * @returns {React.ReactElement} The input, with any error beneath it.
 * @sideEffect Focuses itself on mount and selects the part of the name worth replacing.
 */
function NameEditor({ value, error, onCommit, onCancel }) {
  const ref = useRef(null)
  const [text, setText] = useState(value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = value.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : value.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="ws-editor">
      <input
        ref={ref}
        className={`ws-edit-input ${error ? 'bad' : ''}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') onCommit(text)
          else if (e.key === 'Escape') onCancel()
        }}
      />
      {error && <div className="ws-edit-error">{error}</div>}
    </div>
  )
}

/**
 * The workspace explorer panel.
 *
 * @returns {React.ReactElement} The panel.
 * @sideEffect Subscribes to the store. Its commands rename, move, copy and delete workspace entries, trigger downloads, and read imported files.
 */
export default function FileBrowser() {
  const workspace = useStore((s) => s.workspace)
  const activeFile = useStore((s) => s.activeFile)
  const selection = useStore((s) => s.wsSelection)
  const collapsed = useStore((s) => s.wsCollapsed)
  const edit = useStore((s) => s.wsEdit)
  const clip = useStore((s) => s.fileClipboard)
  const folderStatus = useStore((s) => s.folderStatus)
  const folderName = useStore((s) => s.folderName)
  const folderError = useStore((s) => s.folderError)
  const folderSaved = useStore((s) => s.folderSaved)

  const [error, setError] = useState(null)
  const [editError, setEditError] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const fileInput = useRef(null)
  const treeRef = useRef(null)

  const rows = useMemo(() => flatten(buildTree(workspace), collapsed), [workspace, collapsed])

  // The row the keyboard acts on. VS Code keeps one "focused" row rather than
  // acting on the whole selection, so a lone selected row is the common case
  // and the last-selected is the anchor when several are.
  const focused = selection[selection.length - 1] || activeFile

  /**
   * Select a row, honouring the modifier keys.
   *
   * Ctrl or Cmd toggles one row in or out; Shift extends from the anchor
   * across the visible list, which is why the flattened rows are what is
   * spanned rather than the tree.
   *
   * @param {string} path - The clicked row's path.
   * @param {React.MouseEvent} e - The click, read for its modifier keys.
   * @returns {void}
   * @sideEffect Writes store state.
   */
  const select = (path, e) => {
    const st = useStore.getState()
    if (e.ctrlKey || e.metaKey) {
      st.setWsSelection(selection.includes(path) ? selection.filter((p) => p !== path) : [...selection, path])
      return
    }
    if (e.shiftKey && focused) {
      const from = rows.findIndex((r) => r.node.path === focused)
      const to = rows.findIndex((r) => r.node.path === path)
      if (from !== -1 && to !== -1) {
        const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((r) => r.node.path)
        st.setWsSelection(span)
        return
      }
    }
    st.setWsSelection([path])
  }

  /**
   * Act on a row: open a project, or expand a folder.
   *
   * @param {object} node - The row's tree node.
   * @returns {void}
   * @sideEffect Writes store state; opening a project replaces what is on the canvas.
   */
  const activate = (node) => {
    const st = useStore.getState()
    if (node.kind === 'folder') st.toggleWsFolder(node.path)
    else if (node.entry.kind === 'project') st.openFile(node.path)
  }

  /**
   * The folder a new entry or a paste belongs in, given what is selected.
   *
   * A selected folder takes the entry; a selected file puts it beside itself.
   * Both match what every file manager does with New File while something is
   * highlighted.
   *
   * @returns {string} A folder path, or the empty string for the root.
   * @reads The current selection and the workspace.
   */
  const targetFolder = () => {
    if (!focused) return ''
    if (workspace.files[focused]) return parentOf(focused)
    return focused
  }

  /**
   * Delete what is selected, after one confirmation covering all of it.
   *
   * @returns {void}
   * @sideEffect Shows a confirmation dialog, then writes store state. Does nothing if declined.
   */
  const deleteSelection = () => {
    const paths = selection.length ? selection : (focused ? [focused] : [])
    if (!paths.length) return
    const extra = paths.some(isSystemPath)
      ? '\n\nThat includes app data, which is recreated empty the next time something needs it.'
      : ''
    const what = paths.length === 1 ? `“${paths[0]}”` : `${paths.length} entries`
    if (!confirm(`Delete ${what}?${extra}`)) return
    const st = useStore.getState()
    for (const p of paths) st.deletePath(p)
    st.setWsSelection([])
    setError(null)
  }

  /**
   * Finish an inline edit.
   *
   * A refusal keeps the box open with the reason under it, because the user is
   * looking straight at the thing that needs correcting.
   *
   * @param {string} name - The typed name.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace on success; writes component state on failure.
   */
  const commitEdit = (name) => {
    const st = useStore.getState()
    if (!edit) return
    if (edit.mode === 'rename') {
      const current = baseName(edit.path)
      if (!name.trim() || name === current) { st.endWsEdit(); setEditError(null); return }
      const to = joinPath(parentOf(edit.path), name.trim())
      if (!st.renamePath(edit.path, to)) {
        setEditError(`“${name.trim()}” is not a usable name here, or already exists.`)
        return
      }
      st.setWsSelection([to])
    } else {
      const result = st.createWsEntry(edit.mode, edit.path, name)
      if (!result.ok) { setEditError(result.error); return }
    }
    setEditError(null)
    st.endWsEdit()
  }

  /**
   * Abandon an inline edit.
   *
   * @returns {void}
   * @sideEffect Writes store and component state.
   */
  const cancelEdit = () => { setEditError(null); useStore.getState().endWsEdit() }

  /**
   * Handle a key pressed while the tree has focus.
   *
   * Every key handled here is stopped from bubbling, so the workspace-wide
   * shortcuts do not also fire — Delete in the explorer must not delete the
   * selected *nodes* on the canvas.
   *
   * @param {React.KeyboardEvent} e - The keydown event.
   * @returns {void}
   * @sideEffect Writes store state; may open, rename or delete workspace entries.
   */
  const onKeyDown = (e) => {
    const st = useStore.getState()
    const i = rows.findIndex((r) => r.node.path === focused)
    const row = i === -1 ? null : rows[i]

    /**
     * Move the selection to a row by index, if it exists.
     *
     * @param {number} next - Index into the visible rows.
     * @returns {void}
     * @sideEffect Writes store state.
     */
    const moveTo = (next) => {
      const r = rows[next]
      if (r) st.setWsSelection([r.node.path])
    }

    switch (e.key) {
      case 'ArrowDown': moveTo(i + 1); break
      case 'ArrowUp': moveTo(i === -1 ? rows.length - 1 : i - 1); break
      case 'ArrowRight':
        if (row?.node.kind === 'folder' && !row.open) st.toggleWsFolder(row.node.path, true)
        else moveTo(i + 1)
        break
      case 'ArrowLeft':
        if (row?.node.kind === 'folder' && row.open) st.toggleWsFolder(row.node.path, false)
        else if (row) {
          const up = parentOf(row.node.path)
          if (up) st.setWsSelection([up])
        }
        break
      case 'Enter': if (row) activate(row.node); break
      case 'F2': if (row && !isSystemPath(row.node.path)) st.beginWsEdit('rename', row.node.path); break
      case 'Delete': case 'Backspace': deleteSelection(); break
      case 'Escape': st.setWsSelection([]); break
      case 'c': case 'C':
        if (!(e.ctrlKey || e.metaKey)) return
        st.setFileClipboard(selection.length ? selection : (focused ? [focused] : []), false)
        break
      case 'x': case 'X':
        if (!(e.ctrlKey || e.metaKey)) return
        st.setFileClipboard((selection.length ? selection : (focused ? [focused] : [])).filter((p) => !isSystemPath(p)), true)
        break
      case 'v': case 'V':
        if (!(e.ctrlKey || e.metaKey)) return
        st.pasteFiles(targetFolder())
        break
      default: return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  /**
   * Raise the explorer's right-click menu.
   *
   * Right-clicking outside the current selection moves the selection to the
   * clicked row first, so the menu always describes what it is pointing at.
   * Right-clicking inside a multi-row selection leaves it alone, which is the
   * behaviour that makes "delete these six" possible.
   *
   * @param {React.MouseEvent} e - The contextmenu event.
   * @param {object|null} node - The row's tree node, or `null` for the blank area below the tree.
   * @returns {void}
   * @sideEffect Writes store state and opens the context menu.
   */
  const onContextMenu = (e, node) => {
    e.preventDefault()
    e.stopPropagation()
    const st = useStore.getState()
    if (node && !selection.includes(node.path)) st.setWsSelection([node.path])
    if (!node) st.setWsSelection([])
    st.openContextMenu(e.clientX, e.clientY, node
      ? { kind: 'wsEntry', path: node.path, entryKind: node.kind === 'folder' ? 'folder' : node.entry.kind }
      : { kind: 'wsRoot' })
  }

  /**
   * Accept a dragged row over a drop target.
   *
   * @param {React.DragEvent} e - The dragover event.
   * @param {string|null} folder - The folder under the pointer; `null` marks the root area.
   * @returns {void}
   * @sideEffect Prevents the default so the drop is allowed, and writes component state.
   */
  const onDragOver = (e, folder) => {
    if (!e.dataTransfer.types.includes(ROW_DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(folder === null ? '' : folder)
  }

  /**
   * Move the dragged row into the folder it was dropped on.
   *
   * @param {React.DragEvent} e - The drop event.
   * @param {string} folder - Destination folder; the empty string means the root.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace.
   */
  const onDrop = (e, folder) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const from = e.dataTransfer.getData(ROW_DRAG_TYPE)
    if (from) useStore.getState().moveFile(from, folder)
  }

  /**
   * Read a chosen workspace file and load it.
   *
   * Confirmed first: importing replaces every project in the browser, and the
   * copy being replaced may be the only one that exists.
   *
   * Both an archive and the single JSON document earlier builds produced are
   * accepted; the store decides which by looking at the file.
   *
   * @param {React.ChangeEvent} e - The file input's change event.
   * @returns {Promise<void>} Resolves once the import has been attempted.
   * @sideEffect Shows a confirmation, reads the chosen file, replaces the workspace on success, and clears the input so choosing the same file twice still fires.
   */
  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm(`Replace “${workspace.name}” with the contents of “${file.name}”? Every project in this browser is replaced.`)) return
    const result = await useStore.getState().importWorkspaceFile(file)
    if (!result.ok) { setError(result.error); return }
    setError(result.skipped?.length
      ? `Imported. ${result.skipped.length} file${result.skipped.length === 1 ? '' : 's'} could not be read and were skipped: ${result.skipped.join(', ')}`
      : null)
  }

  /**
   * Point the workspace at a folder on disk, reporting a refusal in the panel.
   *
   * @returns {Promise<void>} Resolves once the folder is connected or the picker is dismissed.
   * @sideEffect Shows a folder picker and a confirmation, writes to the user's filesystem, and writes store and component state.
   */
  const connectFolder = async () => {
    setError(null)
    const result = await connectFolderWithPrompt()
    if (result.error) setError(result.error)
  }

  /**
   * Draw one row of the tree.
   *
   * @param {object} row - A row descriptor from `flatten`.
   * @returns {React.ReactElement} The row.
   * @reads Selection, the inline editor, the clipboard and the active file.
   */
  const renderRow = (row) => {
    const { node, depth, open } = row
    const folder = node.kind === 'folder'
    const path = node.path
    const renaming = edit?.mode === 'rename' && edit.path === path
    const cut = clip?.cut && clip.paths.some((p) => path === p || path.startsWith(`${p}/`))

    const classes = [
      'ws-row',
      folder ? 'folder' : 'file',
      selection.includes(path) ? 'selected' : '',
      path === activeFile ? 'active' : '',
      isSystemPath(path) ? 'system' : '',
      dropTarget === path ? 'drop' : '',
      cut ? 'cut' : '',
    ].filter(Boolean).join(' ')

    return (
      <div
        key={path}
        className={classes}
        style={{ paddingLeft: 4 + depth * 12 }}
        draggable={!renaming && !isSystemPath(path)}
        onDragStart={(e) => {
          e.dataTransfer.setData(ROW_DRAG_TYPE, path)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={folder ? (e) => onDragOver(e, path) : undefined}
        onDragLeave={folder ? () => setDropTarget(null) : undefined}
        onDrop={folder ? (e) => onDrop(e, path) : undefined}
        onClick={(e) => { if (!renaming) { select(path, e); activate(node) } }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {/* Indent guides, one per level crossed — the vertical rules VS Code
            draws so a deep row can be traced back to its parent. */}
        {Array.from({ length: depth }, (_, k) => (
          <span key={k} className="ws-guide" style={{ left: 9 + k * 12 }} />
        ))}
        {folder ? <Chevron open={open} /> : <span className="ws-chevron" />}
        <RowIcon kind={folder ? 'folder' : node.entry.kind} />
        {renaming
          ? <NameEditor value={baseName(path)} error={editError} onCommit={commitEdit} onCancel={cancelEdit} />
          : <>
            <span className="ws-name">{node.name}</span>
            {!folder && <span className="ws-meta">{node.entry.kind === 'project'
              ? `${(node.entry.data?.nodes || []).length}`
              : `${(node.entry.data || []).length}`}</span>}
          </>}
      </div>
    )
  }

  // The new-entry editor is an extra row, drawn where the entry will appear:
  // first inside the chosen folder, or at the top of the root.
  const newEditor = edit && edit.mode !== 'rename'
    ? (() => {
      const depth = edit.path ? edit.path.split('/').length : 0
      return (
        <div className="ws-row editing" style={{ paddingLeft: 4 + depth * 12 }}>
          <span className="ws-chevron" />
          <RowIcon kind={edit.mode === 'newFolder' ? 'folder' : 'project'} />
          <NameEditor
            value={edit.mode === 'newFolder' ? '' : `Untitled${PROJECT_EXT}`}
            error={editError}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
        </div>
      )
    })()
    : null

  const insertAfter = edit && edit.mode !== 'rename' && edit.path
    ? rows.findIndex((r) => r.node.path === edit.path)
    : -1

  const now = Date.now()
  const stale = isDownloadStale(workspace, now)

  return (
    <div className="ws-explorer">
      <input
        ref={fileInput}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        style={{ display: 'none' }}
        onChange={onImportFile}
      />

      {/* Section header: the workspace's name, with the tree's own commands —
          the arrangement both VS Code and Eclipse put above an explorer. */}
      <div className="ws-header">
        <input
          className="ws-title"
          value={workspace.name}
          title="Workspace name — used for the downloaded file"
          onChange={(e) => useStore.getState().setWorkspaceName(e.target.value)}
        />
        <div className="ws-tools">
          <button title="New Project" onClick={() => useStore.getState().beginWsEdit('newFile', targetFolder())}>🗋</button>
          <button title="New Folder" onClick={() => useStore.getState().beginWsEdit('newFolder', targetFolder())}>🗀</button>
          <button title="Collapse All" onClick={() => useStore.getState().collapseAllWsFolders()}>⌄</button>
          {supportsFolders() && folderStatus === 'off' && !isPopout() && (
            <button title="Keep this workspace in a folder…" onClick={connectFolder}>🗁</button>
          )}
          <button title="Download workspace" onClick={() => useStore.getState().downloadWorkspace()}>⭳</button>
          <button title="Import workspace…" onClick={() => fileInput.current?.click()}>⭱</button>
        </div>
      </div>

      {error && <div className="ws-error">{error}</div>}

      <div
        className={`ws-tree ${dropTarget === '' ? 'drop' : ''}`}
        ref={treeRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => onContextMenu(e, null)}
        onDragOver={(e) => onDragOver(e, null)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => onDrop(e, '')}
        onClick={(e) => { if (e.target === treeRef.current) useStore.getState().setWsSelection([]) }}
      >
        {insertAfter === -1 && newEditor}
        {rows.map((row, i) => (
          <React.Fragment key={row.node.path}>
            {renderRow(row)}
            {i === insertAfter && newEditor}
          </React.Fragment>
        ))}
      </div>

      {/* Where the work actually is. With a folder connected that is the folder
          and the readout says so; without one, browser storage is not durable,
          so how long it has been since a copy left the browser is a standing
          readout rather than something to go looking for. */}
      {folderStatus === 'off' ? (
        <button
          className={`ws-status ${stale ? 'stale' : ''}`}
          title="Download this workspace as a file"
          onClick={() => useStore.getState().downloadWorkspace()}
        >
          <span className="wss-dot" />
          <span className="wss-text">
            {workspace.downloaded ? `Downloaded ${timeAgo(workspace.downloaded, now)}` : 'Never downloaded'}
          </span>
          <span className="wss-cta">Download</span>
        </button>
      ) : (
        <button
          className={`ws-status folder ${folderStatus}`}
          // The folder belongs to the main window: it holds the handle and does
          // the writing, so a popped-out explorer reports the state and leaves
          // the two commands that change it where they work.
          disabled={isPopout()}
          title={folderError || `Saved to the folder “${folderName}” as you work`}
          onClick={folderStatus === 'locked'
            ? () => useStore.getState().reconnectWorkspaceFolder()
            : disconnectFolderWithPrompt}
        >
          <span className="wss-dot" />
          <span className="wss-text">
            {folderStatus === 'locked' && `${folderName} — needs permission`}
            {folderStatus === 'error' && `${folderName} — not fully saved`}
            {folderStatus === 'connected'
              && `${folderName}${folderSaved ? ` — saved ${timeAgo(folderSaved, now)}` : ''}`}
          </span>
          <span className="wss-cta">{folderStatus === 'locked' ? 'Reconnect' : 'Disconnect'}</span>
        </button>
      )}
    </div>
  )
}
