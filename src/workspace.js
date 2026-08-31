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
// One folder is special. `.acousim` holds data the app itself tracks rather
// than data the user authored — custom drivers today, more as features land.
// It is created lazily and never eagerly: an imported workspace that predates
// the folder, or one a user has trimmed by hand, stays exactly as imported
// until something actually needs to write there. Creating it on import would
// modify a workspace the user only meant to open.
//
// Nothing here touches storage or the DOM. Persistence, downloading and the
// current time all belong to the caller; these are value-to-value functions so
// that "what does renaming a folder do" can be answered without a browser.

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
export const SYSTEM_FOLDER = '.acousim'

/**
 * Path of the custom driver library inside the system folder.
 *
 * Drivers the user saves appear both in the driver database and here as a
 * file, because they are workspace data like any other and travel with a
 * downloaded workspace.
 */
export const DRIVERS_PATH = `${SYSTEM_FOLDER}/drivers.json`

/**
 * Filename extension for a project file inside a workspace.
 */
export const PROJECT_EXT = '.acousim'

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
    app: 'AcouSim',
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
 * because a file at `boxes/ported/a.acousim` implies two folders that no one
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
 * Remove a file, or a folder and everything inside it.
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
  return { ...touch(ws), files, folders }
}

/**
 * Move or rename a file or folder.
 *
 * A folder brings its contents with it: every path underneath is rewritten by
 * prefix, which is why the tree is derived rather than stored — there is no
 * spine to fix up.
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
  return { ...touch(ws), files, folders }
}

// ---------- the system folder ----------

/**
 * Whether the workspace's system folder is present.
 *
 * @param {object} ws - The workspace.
 * @returns {boolean} True when the folder exists, explicitly or by implication.
 * @pure
 */
export function hasSystemFolder(ws) {
  return hasEntry(ws, SYSTEM_FOLDER)
}

/**
 * Make sure the system folder and its driver library exist.
 *
 * Called from the write paths only. An imported workspace that arrives without
 * the folder — because it predates it, or because the user pruned it — is left
 * exactly as it came until something genuinely needs to store app data, at
 * which point the folder appears with the write that needed it.
 *
 * @param {object} ws - The workspace.
 * @returns {object} A workspace whose system folder exists, unchanged when it already did.
 * @sideEffect Reads the current time when a file has to be created.
 */
export function ensureSystemFolder(ws) {
  if (ws.files[DRIVERS_PATH]) return ws
  return writeFile(ws, DRIVERS_PATH, { kind: 'drivers', data: [] })
}

/**
 * The empty driver list returned when the system folder has never been written.
 *
 * A shared constant rather than a fresh `[]`, so a caller that re-reads on
 * every render sees the same identity and does not treat "still none" as a
 * change.
 */
const NO_DRIVERS = []

/**
 * The workspace's custom driver entries.
 *
 * @param {object} ws - The workspace.
 * @returns {Array<object>} The saved drivers, empty when the system folder has never been written.
 * @pure
 */
export function readDrivers(ws) {
  const entry = ws.files[DRIVERS_PATH]
  return Array.isArray(entry?.data) ? entry.data : NO_DRIVERS
}


/**
 * Replace the workspace's custom driver entries.
 *
 * This is a modification, so it is one of the moments the system folder is
 * created if it is missing.
 *
 * @param {object} ws - The workspace.
 * @param {Array<object>} drivers - The full driver list to store.
 * @returns {object} A new workspace holding the drivers.
 * @sideEffect Reads the current time for the modification stamps.
 */
export function writeDrivers(ws, drivers) {
  return writeFile(ensureSystemFolder(ws), DRIVERS_PATH, { kind: 'drivers', data: drivers })
}

// ---------- transport ----------

/**
 * A workspace serialized for download.
 *
 * @param {object} ws - The workspace.
 * @returns {string} Formatted JSON, indented so a downloaded workspace is readable and diffable.
 * @pure
 */
export function serializeWorkspace(ws) {
  return JSON.stringify(ws, null, 2)
}

/**
 * Suggested filename for a downloaded workspace.
 *
 * @param {object} ws - The workspace.
 * @returns {string} The filename, including its extension.
 * @pure
 */
export function workspaceFilename(ws) {
  return `${ws.name || DEFAULT_WORKSPACE_NAME}.acousim-workspace.json`
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
    return { ok: false, error: 'Not an AcouSim workspace.' }
  }
  if (raw.kind !== 'workspace' || !raw.files || typeof raw.files !== 'object') {
    return { ok: false, error: 'Not an AcouSim workspace — no workspace files in it.' }
  }
  if (Number(raw.schemaVersion) > WORKSPACE_VERSION) {
    return { ok: false, error: 'This workspace was saved by a newer version of AcouSim.' }
  }

  const now = new Date().toISOString()
  const files = {}
  for (const [rawPath, entry] of Object.entries(raw.files)) {
    const path = normalizePath(rawPath)
    if (!path || !entry || typeof entry !== 'object') continue
    files[path] = {
      kind: typeof entry.kind === 'string' ? entry.kind : 'json',
      modified: typeof entry.modified === 'string' ? entry.modified : now,
      data: entry.data ?? null,
    }
  }
  const folders = [...new Set(
    (Array.isArray(raw.folders) ? raw.folders : []).map(normalizePath).filter(Boolean),
  )].sort()

  return {
    ok: true,
    workspace: {
      schemaVersion: WORKSPACE_VERSION,
      app: 'AcouSim',
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
