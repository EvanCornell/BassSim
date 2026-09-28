// The workspace model: a user's projects, folders and app data as one
// self-contained, downloadable object.
//
// A workspace is deliberately flat. Files are held in a map keyed by path
// rather than in a nested tree, because every interesting operation — write,
// rename, delete, "does this exist" — is a single map lookup on a path, while
// the same operations on a tree are recursive walks that have to rebuild the
// spine. The tree the file browser draws is *derived*, once, at render time.
//
// Folders are implied by the paths of the files inside them, which means a
// folder normally needs no record of its own. Empty folders are the exception:
// a user who makes a folder and has not yet put anything in it would otherwise
// watch it vanish, so those are listed explicitly and pruned as files arrive.
//
// One folder is special. `.speakerspice` holds data the app itself tracks rather
// than data the user authored — custom drivers today, more as features land.
// It is created lazily and never eagerly: an imported workspace that predates
// the folder, or one a user has trimmed by hand, stays exactly as imported
// until something actually needs to write there. Creating it on import would
// modify a workspace the user only meant to open.
//
// Nothing here touches storage or the DOM. Persistence, downloading and the
// current time all belong to the caller; these are value-to-value functions so
// that "what does renaming a folder do" can be answered without a browser.

import { modernPath } from './legacy.js'

/**
 * Version stamp written into every workspace this build produces.
 *
 * Read on import to decide whether a workspace needs migrating. Bumped only
 * when the shape changes in a way an older build could not read.
 */
export const WORKSPACE_VERSION = 1

/**
 * The folder holding app-tracked data rather than user-authored files.
 *
 * Dot-prefixed by the same convention as `.git` and `.vscode`: it is the
 * workspace's own bookkeeping, shown in the browser but visibly not a project.
 */
export const SYSTEM_FOLDER = '.speakerspice'

/**
 * Path of the custom driver library inside the system folder.
 *
 * Drivers the user saves appear both in the driver database and here as a
 * file, because they are workspace data like any other and travel with a
 * downloaded workspace.
 */
export const DRIVERS_PATH = `${SYSTEM_FOLDER}/drivers.json`

/**
 * Path of the reference snapshots inside the system folder.
 *
 * Snapshots are workspace data, not project data — see `readSnapshots` for
 * why — so they live here beside the driver library and travel with a
 * downloaded workspace.
 */
export const SNAPSHOTS_PATH = `${SYSTEM_FOLDER}/snapshots.json`

/**
 * Filename extension for a project file inside a workspace.
 */
export const PROJECT_EXT = '.speakerspice'

/**
 * Name given to the workspace a first-time user lands in.
 */
export const DEFAULT_WORKSPACE_NAME = 'workspace'

/**
 * Name given to the project a first-time user lands in.
 */
export const DEFAULT_PROJECT_NAME = 'project'

/**
 * Characters a path segment may not contain.
 *
 * `/` is the separator, and the rest are rejected by one filesystem or another
 * — a workspace that cannot be unpacked onto disk later would be a poor
 * archive format.
 */
const ILLEGAL = /[\\/:*?"<>|]/

// ---------- paths ----------

/**
 * Clean a path, or reject it.
 *
 * Collapses repeated and trailing separators and trims each segment, so the
 * paths a user types by hand normalize to the same key as the ones the app
 * builds. Traversal segments are rejected outright rather than resolved: a
 * workspace has no parent to escape to, so `..` can only be a mistake or an
 * attack in an imported file.
 *
 * @param {string} path - A candidate path, `/`-separated.
 * @returns {string|null} The normalized path, or `null` when it is empty, absolute, or contains an illegal segment.
 * @pure
 */
export function normalizePath(path) {
  if (typeof path !== 'string') return null
  const segs = path.split('/').map((s) => s.trim()).filter(Boolean)
  if (!segs.length) return null
  for (const s of segs) {
    if (s === '.' || s === '..') return null
    if (ILLEGAL.test(s)) return null
  }
  return segs.join('/')
}

/**
 * The last segment of a path.
 *
 * @param {string} path - A normalized path.
 * @returns {string} The file or folder name, without its parent folders.
 * @pure
 */
export function baseName(path) {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

/**
 * The folder containing a path.
 *
 * @param {string} path - A normalized path.
 * @returns {string} The parent folder's path, or the empty string for a top-level entry.
 * @pure
 */
export function parentOf(path) {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/**
 * Join a folder and a name into a path.
 *
 * @param {string} folder - Parent folder path; the empty string means the workspace root.
 * @param {string} name - Entry name.
 * @returns {string} The combined path.
 * @pure
 */
export function joinPath(folder, name) {
  return folder ? `${folder}/${name}` : name
}

/**
 * Whether a path lives in the workspace's own system folder.
 *
 * The browser uses this to hold back the operations that would leave the app
 * looking for a file the user has moved.
 *
 * @param {string} path - A normalized path.
 * @returns {boolean} True for the system folder itself and everything under it.
 * @pure
 */
export function isSystemPath(path) {
  return path === SYSTEM_FOLDER || path.startsWith(`${SYSTEM_FOLDER}/`)
}

/**
 * Whether one path is the other or sits underneath it.
 *
 * The prefix is compared segment-wise, so `models` does not contain
 * `models-old` — a plain `startsWith` would move the wrong folder on rename.
 *
 * @param {string} folder - The candidate ancestor path.
 * @param {string} path - The path being tested.
 * @returns {boolean} True when `path` is `folder` or lies inside it.
 * @pure
 */
export function isUnder(folder, path) {
  return path === folder || path.startsWith(`${folder}/`)
}

/**
 * A name not already taken in a folder.
 *
 * Appends ` 2`, ` 3` and so on before the extension, which is what a user
 * expects a duplicate to be called and keeps the file type intact.
 *
 * @param {object} ws - The workspace.
 * @param {string} folder - Folder to place the entry in; the empty string means the root.
 * @param {string} name - Desired name, extension included.
 * @returns {string} `name` if it is free, otherwise the first numbered variant that is.
 * @pure
 */
export function uniqueName(ws, folder, name) {
  if (!hasEntry(ws, joinPath(folder, name))) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${stem} ${n}${ext}`
    if (!hasEntry(ws, joinPath(folder, candidate))) return candidate
  }
}

// ---------- construction ----------

/**
 * An empty workspace holding one empty project.
 *
 * A workspace with nothing in it would give a first-time user a file browser
 * and nowhere to work, so the default project exists from the start. The
 * system folder deliberately does not — nothing has asked to write there yet.
 *
 * @param {string} [name] - Workspace name; defaults to the standard first-run name.
 * @param {string} [projectName] - Name of the project file created inside it.
 * @returns {object} A new workspace.
 * @sideEffect Reads the current time for the creation and modification stamps.
 */
export function newWorkspace(name = DEFAULT_WORKSPACE_NAME, projectName = DEFAULT_PROJECT_NAME) {
  const now = new Date().toISOString()
  return {
    schemaVersion: WORKSPACE_VERSION,
    app: 'SpeakerSpice',
    kind: 'workspace',
    name,
    created: now,
    modified: now,
    downloaded: null,
    folders: [],
    files: {
      [`${projectName}${PROJECT_EXT}`]: {
        kind: 'project',
        modified: now,
        data: { name: projectName, nodes: [], edges: [] },
      },
    },
  }
}

/**
 * A copy of a workspace with a fresh modification stamp.
 *
 * Every mutation below ends here, so "when did this workspace last change" is
 * answered in one place rather than by each operation remembering to say so.
 *
 * @param {object} ws - The workspace.
 * @returns {object} A shallow copy with `modified` set to now.
 * @sideEffect Reads the current time.
 */
export function touch(ws) {
  return { ...ws, modified: new Date().toISOString() }
}

// ---------- queries ----------

/**
 * Whether a workspace holds a file or folder at a path.
 *
 * Folders count whether they are explicitly listed or merely implied by the
 * files inside them, so a new entry can never collide with an existing one.
 *
 * @param {object} ws - The workspace.
 * @param {string} path - A normalized path.
 * @returns {boolean} True when something already occupies the path.
 * @pure
 */
export function hasEntry(ws, path) {
  if (ws.files[path]) return true
  if ((ws.folders || []).includes(path)) return true
  return Object.keys(ws.files).some((p) => p.startsWith(`${path}/`))
}

/**
 * Every folder in a workspace.
 *
 * Union of the explicitly recorded folders and every ancestor of every file,
 * because a file at `boxes/ported/a.speakerspice` implies two folders that no one
 * ever created by hand.
 *
 * @param {object} ws - The workspace.
 * @returns {string[]} Folder paths, sorted.
 * @pure
 */
export function listFolders(ws) {
  const out = new Set(ws.folders || [])
  for (const path of Object.keys(ws.files)) {
    let parent = parentOf(path)
    while (parent) {
      out.add(parent)
      parent = parentOf(parent)
    }
  }
  return [...out].sort()
}

/**
 * Every project file in a workspace.
 *
 * @param {object} ws - The workspace.
 * @returns {string[]} Paths of the project files, sorted.
 * @pure
 */
export function listProjects(ws) {
  return Object.keys(ws.files).filter((p) => ws.files[p].kind === 'project').sort()
}

/**
 * The workspace as a nested tree, ready to render.
 *
 * Folders sort ahead of files and each group sorts by name, which is the order
 * every file browser a user has met puts them in. The system folder is sorted
 * last regardless, since it is app bookkeeping and should not sit above the
 * user's own work.
 *
 * @param {object} ws - The workspace.
 * @returns {Array<object>} The root's children: folder nodes with their own `children`, and file nodes carrying the stored entry.
 * @pure
 */
export function buildTree(ws) {
  const folders = listFolders(ws)
  const children = new Map([['', []]])
  for (const path of folders) children.set(path, [])

  for (const path of folders) {
    children.get(parentOf(path)).push({ kind: 'folder', name: baseName(path), path })
  }
  for (const path of Object.keys(ws.files)) {
    children.get(parentOf(path)).push({ kind: 'file', name: baseName(path), path, entry: ws.files[path] })
  }

  /**
   * Order one folder's contents and recurse into the folders it holds.
   *
   * @param {string} folder - Folder path; the empty string is the root.
   * @returns {Array<object>} The folder's children, sorted, with folder nodes filled in.
   * @pure
   */
  const build = (folder) => children.get(folder)
    .sort((a, b) => {
      const aSys = isSystemPath(a.path) ? 1 : 0
      const bSys = isSystemPath(b.path) ? 1 : 0
      if (aSys !== bSys) return aSys - bSys
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map((n) => (n.kind === 'folder' ? { ...n, children: build(n.path) } : n))

  return build('')
}

// ---------- mutation ----------

/**
 * Write a file into a workspace, creating it or replacing what is there.
 *
 * Any folder the path implies comes into existence with the file, so a caller
 * never has to create the parents first.
 *
 * @param {object} ws - The workspace.
 * @param {string} path - A normalized path.
 * @param {object} entry - The file record: at least `kind` and `data`.
 * @returns {object} A new workspace with the file written.
 * @sideEffect Reads the current time for the file's and the workspace's modification stamps.
 */
export function writeFile(ws, path, entry) {
  const now = new Date().toISOString()
  const files = { ...ws.files, [path]: { ...entry, modified: now } }
  // A folder that now holds a file no longer needs recording: it is implied.
  const folders = (ws.folders || []).filter((f) => !isUnder(f, parentOf(path)))
  return { ...touch(ws), files, folders }
}

/**
 * Create an empty folder.
 *
 * Recorded explicitly, because until a file lands in it there is nothing to
 * imply its existence.
 *
 * @param {object} ws - The workspace.
 * @param {string} path - A normalized folder path.
 * @returns {object} A new workspace with the folder, unchanged if something already occupies the path.
 * @sideEffect Reads the current time for the modification stamp.
 */
export function addFolder(ws, path) {
  if (hasEntry(ws, path)) return ws
  return { ...touch(ws), folders: [...(ws.folders || []), path].sort() }
}

/**
 * Keep folders that an operation emptied rather than removed.
 *
 * Most folders need no record because their contents imply them — but that
 * means taking the last file out of one would make it disappear, and a folder
 * vanishing because you moved a file out of it is not something any file
 * manager does. So before an operation, the folders that survive it are noted;
 * afterwards, any that are no longer implied get a record of their own.
 *
 * @param {object} before - The workspace as it was.
 * @param {object} after - The workspace as the operation left it.
 * @param {string} removed - The path the operation emptied or took away; folders at or under it are not preserved.
 * @returns {object} `after`, with any newly-unimplied folder recorded explicitly.
 * @pure
 */
function preserveFolders(before, after, removed) {
  const survivors = listFolders(before).filter((f) => !isUnder(removed, f))
  const present = new Set(listFolders(after))
  const missing = survivors.filter((f) => !present.has(f))
  if (!missing.length) return after
  return { ...after, folders: [...new Set([...(after.folders || []), ...missing])].sort() }
}

/**
 * Remove a file, or a folder and everything inside it.
 *
 * The folders above it stay, even if this took their last file: they were
 * there before and nothing asked for them to go.
 *
 * @param {object} ws - The workspace.
 * @param {string} path - A normalized path.
 * @returns {object} A new workspace without the entry.
 * @sideEffect Reads the current time for the modification stamp.
 */
export function deleteEntry(ws, path) {
  const files = {}
  for (const [p, entry] of Object.entries(ws.files)) {
    if (!isUnder(path, p)) files[p] = entry
  }
  const folders = (ws.folders || []).filter((f) => !isUnder(path, f))
  return preserveFolders(ws, { ...touch(ws), files, folders }, path)
}

/**
 * Move or rename a file or folder.
 *
 * A folder brings its contents with it: every path underneath is rewritten by
 * prefix, which is why the tree is derived rather than stored — there is no
 * spine to fix up. The folder it *left* stays behind, empty.
 *
 * Moving a folder into itself is refused. Nothing else would go wrong
 * mechanically, but the result would be a folder that has vanished from the
 * workspace, which is indistinguishable from a bug.
 *
 * @param {object} ws - The workspace.
 * @param {string} from - Existing normalized path.
 * @param {string} to - New normalized path.
 * @returns {object} A new workspace with the entry moved, or the original when the move is a no-op, the destination is taken, or the move is into itself.
 * @sideEffect Reads the current time for the modification stamp.
 */
export function renameEntry(ws, from, to) {
  if (from === to) return ws
  if (!hasEntry(ws, from)) return ws
  if (hasEntry(ws, to)) return ws
  if (isUnder(from, to)) return ws

  /**
   * Rewrite one path for the move, leaving unrelated paths alone.
   *
   * @param {string} p - A path in the workspace.
   * @returns {string} The path after the move.
   * @pure
   */
  const moved = (p) => (isUnder(from, p) ? to + p.slice(from.length) : p)

  const files = {}
  for (const [p, entry] of Object.entries(ws.files)) files[moved(p)] = entry
  const folders = (ws.folders || []).map(moved)
  // The folder the entry left keeps existing, even if that was its last file.
  return preserveFolders(ws, { ...touch(ws), files, folders }, from)
}

/**
 * Every file at or under a path.
 *
 * @param {object} ws - The workspace.
 * @param {string} path - A file or folder path.
 * @returns {string[]} Paths of the files, sorted; a file path yields just itself.
 * @pure
 */
export function filesUnder(ws, path) {
  return Object.keys(ws.files).filter((p) => isUnder(path, p)).sort()
}

/**
 * Copy a file or folder into another folder.
 *
 * The copy takes a free name in the destination rather than refusing when one
 * is taken, which is what makes pasting into the folder you copied from
 * produce "thing 2" instead of an error.
 *
 * @param {object} ws - The workspace.
 * @param {string} from - Path of the entry to copy.
 * @param {string} folder - Destination folder; the empty string means the root.
 * @returns {object} A new workspace holding the copy, unchanged when the source does not exist or a folder is copied into itself.
 * @sideEffect Reads the current time for the modification stamps.
 */
export function copyInto(ws, from, folder) {
  if (!hasEntry(ws, from)) return ws
  if (isUnder(from, folder)) return ws
  const to = joinPath(folder, uniqueName(ws, folder, baseName(from)))

  const files = { ...ws.files }
  const now = new Date().toISOString()
  for (const p of filesUnder(ws, from)) {
    files[to + p.slice(from.length)] = { ...ws.files[p], modified: now }
  }
  const folders = [...(ws.folders || [])]
  for (const f of ws.folders || []) {
    if (isUnder(from, f)) folders.push(to + f.slice(from.length))
  }
  // A folder copied while empty has no files to imply it, so it needs its own
  // record — exactly as it did when it was created.
  if (!filesUnder(ws, from).length) folders.push(to)
  return { ...touch(ws), files, folders: [...new Set(folders)].sort() }
}

/**
 * Move a file or folder into another folder, keeping its name.
 *
 * @param {object} ws - The workspace.
 * @param {string} from - Path of the entry to move.
 * @param {string} folder - Destination folder; the empty string means the root.
 * @returns {{ws: object, path: string}} The new workspace and the entry's new path, both unchanged when the move is refused.
 * @sideEffect Reads the current time for the modification stamp.
 */
export function moveInto(ws, from, folder) {
  const to = joinPath(folder, baseName(from))
  if (to === from) return { ws, path: from }
  const next = renameEntry(ws, from, to)
  return next === ws ? { ws, path: from } : { ws: next, path: to }
}

// ---------- app data in the system folder ----------
//
// Everything the app tracks for itself lives here rather than in a key of its
// own: it shows up in the explorer as a file, it travels with a downloaded
// workspace, and it is one place to look. Each writer creates the folder
// implicitly by writing into it, which is what keeps the folder lazy — a
// workspace that has never saved a driver or taken a snapshot does not have
// one.

/**
 * The empty list returned when a system file has never been written.
 *
 * A shared constant rather than a fresh `[]`, so a caller that re-reads on
 * every render sees the same identity and does not treat "still none" as a
 * change. That matters: these are read straight from store selectors.
 */
const NOTHING = []

/**
 * Read one of the system folder's list files.
 *
 * @param {object} ws - The workspace.
 * @param {string} path - Path of the file inside the system folder.
 * @returns {Array<object>} The stored list, empty when the file has never been written.
 * @pure
 */
function readList(ws, path) {
  const entry = ws.files[path]
  return Array.isArray(entry?.data) ? entry.data : NOTHING
}

/**
 * The workspace's custom driver entries.
 *
 * @param {object} ws - The workspace.
 * @returns {Array<object>} The saved drivers, empty when none have been saved.
 * @pure
 */
export function readDrivers(ws) {
  return readList(ws, DRIVERS_PATH)
}

/**
 * Replace the workspace's custom driver entries.
 *
 * A modification, so this is one of the moments the system folder comes into
 * existence if it was not there.
 *
 * @param {object} ws - The workspace.
 * @param {Array<object>} drivers - The full driver list to store.
 * @returns {object} A new workspace holding the drivers.
 * @sideEffect Reads the current time for the modification stamps.
 */
export function writeDrivers(ws, drivers) {
  return writeFile(ws, DRIVERS_PATH, { kind: 'drivers', data: drivers })
}

/**
 * The workspace's reference snapshots.
 *
 * Snapshots belong to the workspace, not to a project. The whole point of one
 * is to be compared against something else — usually the design in the *next*
 * file — so a snapshot that vanished when you opened that file would be
 * useless exactly when it was wanted.
 *
 * @param {object} ws - The workspace.
 * @returns {Array<object>} The saved snapshots, empty when none have been taken.
 * @pure
 */
export function readSnapshots(ws) {
  return readList(ws, SNAPSHOTS_PATH)
}

/**
 * Replace the workspace's reference snapshots.
 *
 * @param {object} ws - The workspace.
 * @param {Array<object>} snapshots - The full snapshot list to store.
 * @returns {object} A new workspace holding the snapshots.
 * @sideEffect Reads the current time for the modification stamps.
 */
export function writeSnapshots(ws, snapshots) {
  return writeFile(ws, SNAPSHOTS_PATH, { kind: 'snapshots', data: snapshots })
}

// ---------- transport ----------
//
// A workspace downloads as an archive of real folders and real files, not as
// one blob. Unzipped it is exactly the tree the explorer shows: projects where
// the user filed them, each a readable JSON document, and `.speakerspice` holding
// the app's own data. It can be browsed, edited in a text editor, diffed,
// committed to a repository, and zipped back up.
//
// The workspace's own metadata — its name, when it was created, when it was
// last downloaded — is a file in the archive like everything else, at
// `.speakerspice/workspace.json`. It is lifted back out into the workspace's fields
// on import rather than left in the file map, so there is one place the name
// lives and both routes to editing it agree.

/**
 * Path of the workspace's metadata inside a downloaded archive.
 */
export const META_PATH = `${SYSTEM_FOLDER}/workspace.json`

/**
 * The archive entries for a workspace.
 *
 * Every folder gets an entry of its own, not only the empty ones. Unpackers
 * cope either way, but an archive that lists its folders is the one that
 * survives being opened by something that is not this app.
 *
 * @param {object} ws - The workspace.
 * @returns {Array<{path: string, data?: string, folder?: boolean}>} Entries for `createZip`, folders first.
 * @pure
 */
export function workspaceToEntries(ws) {
  const meta = {
    schemaVersion: WORKSPACE_VERSION,
    app: 'SpeakerSpice',
    kind: 'workspace',
    name: ws.name || DEFAULT_WORKSPACE_NAME,
    created: ws.created,
    modified: ws.modified,
    downloaded: ws.downloaded,
  }
  // The system folder is listed only when the workspace actually has one. The
  // metadata file inside it still gets written — every unpacker creates the
  // parent — but a workspace that has never needed app data must not acquire
  // an empty `.speakerspice` just by being downloaded and opened again.
  return [
    ...listFolders(ws).map((path) => ({ path, folder: true })),
    { path: META_PATH, data: JSON.stringify(meta, null, 2) },
    ...Object.keys(ws.files).sort().map((path) => ({
      path,
      data: JSON.stringify(ws.files[path].data, null, 2),
    })),
  ]
}

/**
 * What kind of file a path holds.
 *
 * By path, since that is all an archive from outside the app gives us. A file
 * dropped into a workspace by hand is still recognisable as a project if it is
 * named like one.
 *
 * @param {string} path - The file's path in the workspace.
 * @returns {string} `'project'`, `'drivers'`, or `'json'`.
 * @pure
 */
export function kindForPath(path) {
  if (path === DRIVERS_PATH) return 'drivers'
  if (path === SNAPSHOTS_PATH) return 'snapshots'
  if (path.endsWith(PROJECT_EXT)) return 'project'
  return 'json'
}

/**
 * Rebuild a workspace from archive entries.
 *
 * Tolerant on purpose: the archive may have been unzipped, edited and zipped
 * back up, or may be a plain folder of project files that this app never
 * produced. Unreadable files are skipped rather than failing the import, since
 * one bad file should not cost the user the other forty.
 *
 * The system folder is not created here. An archive that arrives without one
 * keeps the shape it arrived in — that is the whole point of creating it
 * lazily — so a folder of `.speakerspice` files imports as exactly those files.
 *
 * @param {Array<{path: string, data: Uint8Array|null, folder: boolean}>} entries - Entries from `readZip`.
 * @param {string} fallbackName - Workspace name to use when the archive carries no metadata.
 * @returns {{ok: boolean, workspace?: object, error?: string, skipped?: string[], renamed?: Array<{from: string, to: string, folder: boolean}>}} The workspace, the paths that could not be read, the entries read from a path under the app's former name and the path they now have, or the reason nothing could be.
 * @sideEffect Reads the current time to stamp a workspace whose metadata is absent.
 */
export function entriesToWorkspace(entries, fallbackName) {
  const decoder = new TextDecoder()
  const now = new Date().toISOString()
  const files = {}
  const folders = new Set()
  const skipped = []
  let meta = null

  // Paths saved under the app's former name are read under the current one;
  // where both are present, the current one wins.
  const renamed = []
  const modern = new Set(entries.map((e) => normalizePath(e.path)).filter((p) => p && modernPath(p, SYSTEM_FOLDER, PROJECT_EXT) === p))
  for (const entry of entries) {
    const original = normalizePath(entry.path)
    if (!original) continue
    const path = modernPath(original, SYSTEM_FOLDER, PROJECT_EXT)
    if (path !== original) {
      if (modern.has(path)) continue
      renamed.push({ from: original, to: path, folder: !!entry.folder })
    }
    if (entry.folder) { folders.add(path); continue }

    let parsed
    try { parsed = JSON.parse(decoder.decode(entry.data)) } catch { skipped.push(path); continue }
    if (path === META_PATH) { meta = parsed; continue }
    files[path] = { kind: kindForPath(path), modified: now, data: parsed }
  }

  if (!Object.keys(files).length && !folders.size) {
    return { ok: false, error: 'That archive holds no workspace files.' }
  }
  if (meta && Number(meta.schemaVersion) > WORKSPACE_VERSION) {
    return { ok: false, error: 'This workspace was saved by a newer version of SpeakerSpice.' }
  }

  // Folders that only ever held the metadata file have no contents left to
  // imply them, so their archive entries are what keeps them.
  for (const path of Object.keys(files)) {
    let parent = parentOf(path)
    while (parent) { folders.delete(parent); parent = parentOf(parent) }
  }

  return {
    ok: true,
    skipped,
    renamed,
    workspace: {
      schemaVersion: WORKSPACE_VERSION,
      app: 'SpeakerSpice',
      kind: 'workspace',
      name: typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : fallbackName,
      created: typeof meta?.created === 'string' ? meta.created : now,
      modified: typeof meta?.modified === 'string' ? meta.modified : now,
      downloaded: typeof meta?.downloaded === 'string' ? meta.downloaded : null,
      folders: [...folders].sort(),
      files,
    },
  }
}

/**
 * Suggested filename for a downloaded workspace.
 *
 * @param {object} ws - The workspace.
 * @returns {string} The filename, including its extension.
 * @pure
 */
export function workspaceFilename(ws) {
  return `${ws.name || DEFAULT_WORKSPACE_NAME}.speakerspice.zip`
}

/**
 * Read a downloaded workspace back.
 *
 * Imported data is not trusted: it may come from an older build, a hand-edited
 * file, or something that is not a workspace at all. Every field is checked
 * and anything unusable is dropped rather than allowed to reach the store,
 * where a malformed path or a non-object file entry would surface later as an
 * unexplained crash in the file browser.
 *
 * The system folder is not added here. Import must reproduce what was in the
 * file — creating a folder the user did not download would make a round trip
 * lossy in the one direction that is supposed to be exact.
 *
 * @param {string} text - The file's contents.
 * @returns {{ok: boolean, workspace?: object, error?: string}} The parsed workspace, or the reason it was rejected.
 * @sideEffect Reads the current time to stamp a workspace whose own stamps are missing or unusable.
 */
export function parseWorkspace(text) {
  let raw
  try { raw = JSON.parse(text) } catch { return { ok: false, error: 'Not valid JSON.' } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Not a SpeakerSpice workspace.' }
  }
  if (raw.kind !== 'workspace' || !raw.files || typeof raw.files !== 'object') {
    return { ok: false, error: 'Not a SpeakerSpice workspace — no workspace files in it.' }
  }
  if (Number(raw.schemaVersion) > WORKSPACE_VERSION) {
    return { ok: false, error: 'This workspace was saved by a newer version of SpeakerSpice.' }
  }

  const now = new Date().toISOString()
  const files = {}
  for (const [rawPath, entry] of Object.entries(raw.files)) {
    const original = normalizePath(rawPath)
    if (!original || !entry || typeof entry !== 'object') continue
    const path = modernPath(original, SYSTEM_FOLDER, PROJECT_EXT)
    if (path !== original && raw.files[path]) continue
    files[path] = {
      kind: typeof entry.kind === 'string' ? entry.kind : 'json',
      modified: typeof entry.modified === 'string' ? entry.modified : now,
      data: entry.data ?? null,
    }
  }
  const folders = [...new Set(
    (Array.isArray(raw.folders) ? raw.folders : []).map(normalizePath).filter(Boolean).map((p) => modernPath(p, SYSTEM_FOLDER, PROJECT_EXT)),
  )].sort()

  return {
    ok: true,
    workspace: {
      schemaVersion: WORKSPACE_VERSION,
      app: 'SpeakerSpice',
      kind: 'workspace',
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : DEFAULT_WORKSPACE_NAME,
      created: typeof raw.created === 'string' ? raw.created : now,
      modified: typeof raw.modified === 'string' ? raw.modified : now,
      downloaded: typeof raw.downloaded === 'string' ? raw.downloaded : null,
      folders,
      files,
    },
  }
}

// ---------- freshness ----------

/**
 * How long a downloaded workspace can go unsaved before it is worth a warning.
 *
 * Browser storage is not a filing cabinet: clearing site data, a private
 * window, or an eviction under storage pressure all take it without asking.
 * A week is long enough not to nag someone mid-session and short enough that
 * the loss, if it comes, is a week of work rather than a year of it.
 */
export const STALE_DOWNLOAD_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Time units for `timeAgo`, as `[seconds, name]` pairs in ascending order.
 *
 * A month is the mean Gregorian month and a year the mean Gregorian year, so
 * the phrase does not drift across a leap year. Precision beyond that would be
 * spurious for a label that rounds down to whole units anyway.
 */
const SCALES = [
  [60, 'minute'],
  [3600, 'hour'],
  [86400, 'day'],
  [604800, 'week'],
  [2629800, 'month'],
  [31557600, 'year'],
]

/**
 * A human phrase for how long ago something happened.
 *
 * Coarse on purpose — the exact minute is never the point, and "3 days ago"
 * carries the only fact that matters, which is roughly how much work is at
 * risk.
 *
 * @param {string|null} iso - An ISO timestamp, or `null` when the event has never happened.
 * @param {number} now - Current time in milliseconds, passed in so the phrase is testable.
 * @returns {string} The phrase, or `'never'` for a missing or unparseable stamp.
 * @pure
 */
export function timeAgo(iso, now) {
  if (!iso) return 'never'
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'never'
  const s = Math.max(0, (now - then) / 1000)
  if (s < 60) return 'just now'
  let [size, unit] = SCALES[0]
  for (const scale of SCALES) if (s >= scale[0]) [size, unit] = scale
  const n = Math.floor(s / size)
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`
}

/**
 * Whether a workspace has gone too long without being downloaded.
 *
 * A workspace that has never been downloaded counts as stale from the moment
 * it was created, since that is exactly the case where nothing outside the
 * browser holds a copy.
 *
 * @param {object} ws - The workspace.
 * @param {number} now - Current time in milliseconds.
 * @returns {boolean} True when the last download — or, failing that, the workspace's creation — is older than the staleness window.
 * @pure
 */
export function isDownloadStale(ws, now) {
  const stamp = Date.parse(ws.downloaded || ws.created || '')
  if (Number.isNaN(stamp)) return true
  return now - stamp > STALE_DOWNLOAD_MS
}
