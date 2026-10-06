// Keeping a workspace in a real folder on the user's computer.
//
// Browser storage is not a filing cabinet: clearing site data takes it, a
// private window never had it, and an eviction under storage pressure happens
// without asking. The File System Access API is the way out of that — the user
// points at a folder once, and from then on their projects are ordinary files
// on their own disk, in their own backups, in their own git repository.
//
// The folder is authoritative. When one is connected, what is on disk is the
// workspace: it is read on startup and every change is written back. Browser
// storage keeps mirroring alongside it, but only as a fallback for the session
// where permission has lapsed and the folder cannot be read.
//
// What is written is exactly what a downloaded archive unzips to — the same
// entries, from the same `workspaceToEntries`. A workspace zipped from the
// browser and a workspace synced to a folder are the same tree, so one can be
// unzipped over the other and neither format has to be maintained twice.
//
// Two rules keep this from ever being destructive. Deletions are confined to
// files this app previously wrote or read there, so a folder that also holds
// the user's notes, a README or a `.git` keeps them. And a folder is only
// removed when it is already empty — a directory the app no longer knows about
// but that still has something in it stays exactly where it is.
//
// The handle survives a reload in IndexedDB, which is the only store that can
// hold one. Permission does not survive with it: the browser re-asks on the
// next visit, and that ask needs a user gesture, so a resumed session may come
// back locked and waiting for a click rather than connected.

import { workspaceToEntries, entriesToWorkspace, DEFAULT_WORKSPACE_NAME } from '../workspace'
import { LEGACY_DB_NAME } from '../legacy'

/** IndexedDB database holding the folder handle. */
const DB_NAME = 'speakerspice'

/** Object store inside it. */
const DB_STORE = 'handles'

/** Key the workspace folder's handle is stored under. */
const DB_KEY = 'workspace-folder'

/** Key the browser's own copy of the workspace is stored under. */
const WORKSPACE_DB_KEY = 'workspace'

/**
 * Largest file read back from a connected folder.
 *
 * Everything the app writes is JSON — a project with stored time-domain runs
 * can run to tens of megabytes. A folder may hold other
 * things — an unrelated archive, an image someone dropped in — and reading a
 * hundred megabytes only to fail to parse it as JSON would stall startup for
 * no possible gain.
 */
const MAX_READ_BYTES = 96 * 1024 * 1024

/**
 * Most entries read back from a connected folder.
 *
 * A workspace is tens of files. This exists for the case where the picker was
 * pointed at a home directory by mistake: the read stops rather than walking a
 * hundred thousand files before the app can say the folder is not one.
 */
const MAX_ENTRIES = 5000

/**
 * Whether this browser can keep a workspace in a folder.
 *
 * Chromium-based browsers can; Safari and Firefox have the pickers but not
 * the persistent read-write handles this needs, so they are told the option
 * does not exist rather than being offered one that fails at the second step.
 *
 * @returns {boolean} True when the File System Access API is usable here.
 * @sideEffect Reads the global `window`.
 */
export function supportsFolders() {
  return typeof window !== 'undefined'
    && typeof window.showDirectoryPicker === 'function'
    && typeof window.indexedDB !== 'undefined'
}

// ---------- what to write ----------

/**
 * The files a workspace should have on disk, as text.
 *
 * The same entries a download produces, so a synced folder and an unzipped
 * archive are byte-for-byte the same tree.
 *
 * @param {object} ws - The workspace.
 * @returns {{files: Map<string, string>, folders: string[]}} Each file's contents by path, and every folder the workspace has.
 * @pure
 */
export function diskContents(ws) {
  const entries = workspaceToEntries(ws)
  const files = new Map()
  const folders = []
  for (const entry of entries) {
    if (entry.folder) folders.push(entry.path)
    else files.set(entry.path, entry.data)
  }
  return { files, folders }
}

/**
 * What has to happen on disk to bring a folder up to date.
 *
 * Only files whose text actually changed are rewritten, which matters more
 * than it looks: a workspace commits on every simulation, and rewriting forty
 * unchanged projects each time would churn the user's filesystem, their
 * backups and their git history.
 *
 * Deletions are drawn from `previous` rather than from the folder, so this can
 * only ever remove a file the app itself put there. Anything else in the
 * folder is invisible to it.
 *
 * `prune` off removes even that: nothing is deleted, only written. That is the
 * setting for the first write after a folder is connected, where "the
 * workspace does not have this file" does not yet mean the user got rid of it
 * — it can equally mean this browser has never heard of it. A folder only ever
 * loses a file to a deletion the user made while it was connected.
 *
 * @param {object} ws - The workspace to write.
 * @param {{files: Map<string, string>, folders: string[]}} previous - What the app last saw on disk.
 * @param {boolean} [prune] - Whether files and folders the workspace no longer has may be removed.
 * @returns {{writes: Array<{path: string, data: string}>, deletes: string[], folders: string[], gone: string[], next: {files: Map<string, string>, folders: string[]}}} The files to write, the files and folders to remove, the folders to create, and the state to record once it is done.
 * @pure
 */
export function planSync(ws, previous, prune = true) {
  const next = diskContents(ws)
  const writes = []
  for (const [path, data] of next.files) {
    if (previous.files.get(path) !== data) writes.push({ path, data })
  }
  if (!prune) return { writes, deletes: [], folders: next.folders, gone: [], next }
  const deletes = [...previous.files.keys()].filter((p) => !next.files.has(p))
  const keep = new Set(next.folders)
  const gone = previous.folders.filter((f) => !keep.has(f))
  return { writes, deletes, folders: next.folders, gone, next }
}

// ---------- remembering the folder ----------

/**
 * Open the handle database, creating its store on first use.
 *
 * @param {string} [name] - The database; this app's by default.
 * @returns {Promise<IDBDatabase>} The open database.
 * @sideEffect Opens IndexedDB, creating the database and its object store if they do not exist.
 */
function openDb(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    /**
     * Create the handle store the first time this database is opened.
     *
     * @returns {void}
     * @sideEffect Creates the object store.
     */
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE)
    }
    /**
     * Hand back the open database.
     *
     * @returns {void}
     * @sideEffect Settles the enclosing promise.
     */
    req.onsuccess = () => resolve(req.result)
    /**
     * Report that the database could not be opened.
     *
     * @returns {void}
     * @sideEffect Rejects the enclosing promise.
     */
    req.onerror = () => reject(req.error)
  })
}

/**
 * Run one transaction against the handle store and close the database.
 *
 * @param {string} mode - `'readonly'` or `'readwrite'`.
 * @param {Function} run - Given the object store, issues the request and returns it.
 * @param {string} [name] - The database; this app's by default.
 * @returns {Promise<*>} The request's result, or `null` when it produced none.
 * @sideEffect Reads or writes IndexedDB.
 */
async function withStore(mode, run, name = DB_NAME) {
  const db = await openDb(name)
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode)
      const req = run(tx.objectStore(DB_STORE))
      /**
       * Hand back the request's result once the transaction has committed.
       *
       * Waiting for the transaction rather than the request is what makes a
       * write durable before the caller is told it happened.
       *
       * @returns {void}
       * @sideEffect Settles the enclosing promise.
       */
      tx.oncomplete = () => resolve(req ? req.result : null)
      /**
       * Report a failed transaction.
       *
       * @returns {void}
       * @sideEffect Rejects the enclosing promise.
       */
      tx.onerror = () => reject(tx.error)
      /**
       * Report an aborted transaction.
       *
       * @returns {void}
       * @sideEffect Rejects the enclosing promise.
       */
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Remember the folder a workspace lives in, so the next visit can resume it.
 *
 * A directory handle is not serializable but is structured-cloneable, which is
 * why this is IndexedDB and not LocalStorage.
 *
 * @param {FileSystemDirectoryHandle} handle - The chosen folder.
 * @returns {Promise<boolean>} True when it was stored; false when this browser refused.
 * @sideEffect Writes IndexedDB.
 */
export async function rememberFolder(handle) {
  try {
    await withStore('readwrite', (store) => store.put(handle, DB_KEY))
    return true
  } catch {
    return false
  }
}

/**
 * The folder remembered from a previous visit.
 *
 * A folder remembered under the app's former name is moved to the current
 * database, so a renamed app resumes the same folder.
 *
 * @returns {Promise<FileSystemDirectoryHandle|null>} The handle, or `null` when none was stored or it could not be read.
 * @sideEffect Reads IndexedDB; may move a handle out of the former database and delete that database.
 */
export async function recallFolder() {
  try {
    const handle = await withStore('readonly', (store) => store.get(DB_KEY))
    if (handle) return handle
  } catch {
    return null
  }
  try {
    const old = await withStore('readonly', (store) => store.get(DB_KEY), LEGACY_DB_NAME)
    if (old && await rememberFolder(old)) indexedDB.deleteDatabase(LEGACY_DB_NAME)
    return old || null
  } catch {
    return null
  }
}

/**
 * The browser's own copy of the workspace, as last stored.
 *
 * @returns {Promise<string|null>} The workspace JSON, or `null` when none is stored or IndexedDB is unavailable.
 * @sideEffect Reads IndexedDB.
 */
export async function readStoredWorkspace() {
  try {
    if (typeof indexedDB === 'undefined') return null
    const text = await withStore('readonly', (store) => store.get(WORKSPACE_DB_KEY))
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}

/**
 * Store the browser's own copy of the workspace.
 *
 * IndexedDB rather than LocalStorage: a workspace whose projects keep their
 * time-domain runs is far past LocalStorage's few megabytes.
 *
 * @param {string} text - The workspace JSON.
 * @returns {Promise<boolean>} True once stored; false when IndexedDB is unavailable or refused.
 * @sideEffect Writes IndexedDB.
 */
export async function storeWorkspace(text) {
  try {
    if (typeof indexedDB === 'undefined') return false
    await withStore('readwrite', (store) => store.put(text, WORKSPACE_DB_KEY))
    return true
  } catch {
    return false
  }
}

/**
 * Forget the remembered folder.
 *
 * @returns {Promise<void>} Resolves once it is gone, or immediately when it could not be removed.
 * @sideEffect Writes IndexedDB.
 */
export async function forgetFolder() {
  try {
    await withStore('readwrite', (store) => store.delete(DB_KEY))
  } catch { /* nothing to forget */ }
}

// ---------- permission ----------

/**
 * Whether the app may still read and write a remembered folder.
 *
 * Permission is not remembered with the handle: the browser re-asks on a new
 * visit, and the ask has to come from a user gesture. So the resumed case
 * distinguishes `'granted'` — carry on silently — from `'prompt'`, which means
 * the folder is there but a click is needed before it can be touched.
 *
 * @param {FileSystemDirectoryHandle} handle - The folder.
 * @param {boolean} [ask] - Whether to raise the browser's permission prompt; only valid from a user gesture.
 * @returns {Promise<string>} `'granted'`, `'prompt'` or `'denied'`.
 * @sideEffect Queries the browser's permission store, and may show a permission prompt.
 */
export async function folderPermission(handle, ask = false) {
  const opts = { mode: 'readwrite' }
  try {
    const state = await handle.queryPermission(opts)
    if (state === 'granted' || !ask) return state
    return await handle.requestPermission(opts)
  } catch {
    return 'denied'
  }
}

/**
 * Ask the user to choose a folder for their workspace.
 *
 * @returns {Promise<FileSystemDirectoryHandle|null>} The chosen folder, or `null` when the picker was dismissed.
 * @sideEffect Shows the browser's folder picker.
 */
export async function pickFolder() {
  try {
    return await window.showDirectoryPicker({ id: 'speakerspice-workspace', mode: 'readwrite' })
  } catch {
    return null
  }
}

// ---------- reading ----------

/**
 * Walk a folder into archive entries.
 *
 * Recursive, and deliberately indiscriminate: whatever is in the folder is
 * offered to the importer, which keeps what parses as JSON and skips the rest.
 * That is what lets a user keep a README beside their projects without either
 * file troubling the other.
 *
 * @param {FileSystemDirectoryHandle} handle - The folder to read.
 * @param {string} [prefix] - Path of this folder within the workspace; empty at the top.
 * @param {{n: number}} [budget] - Shared entry budget, so the cap covers the whole walk rather than each folder.
 * @returns {Promise<Array<{path: string, data: Uint8Array|null, folder: boolean}>>} Entries for `entriesToWorkspace`.
 * @sideEffect Reads the user's filesystem.
 */
export async function readFolderEntries(handle, prefix = '', budget = { n: MAX_ENTRIES }) {
  const out = []
  for await (const [name, child] of handle.entries()) {
    if (budget.n-- <= 0) break
    const path = prefix ? `${prefix}/${name}` : name
    if (child.kind === 'directory') {
      out.push({ path, data: null, folder: true })
      out.push(...await readFolderEntries(child, path, budget))
      continue
    }
    try {
      const file = await child.getFile()
      if (file.size > MAX_READ_BYTES) continue
      out.push({ path, data: new Uint8Array(await file.arrayBuffer()), folder: false })
    } catch { /* unreadable — treat it as one of the folder's own files */ }
  }
  return out
}

/**
 * Read a folder as a workspace.
 *
 * The folder's own name becomes the workspace name when the folder holds no
 * metadata of ours — which is what makes pointing at a plain directory of
 * project files work.
 *
 * @param {FileSystemDirectoryHandle} handle - The folder to read.
 * @returns {Promise<{ok: boolean, workspace?: object, previous?: {files: Map<string, string>, folders: string[]}, empty?: boolean, error?: string, skipped?: string[]}>} The workspace and the on-disk state to sync against, or why it could not be read. `empty` marks a folder with nothing of ours in it.
 * @sideEffect Reads the user's filesystem.
 */
export async function readFolderWorkspace(handle) {
  let entries
  try {
    entries = await readFolderEntries(handle)
  } catch (err) {
    return { ok: false, error: err?.message || 'That folder could not be read.' }
  }
  if (!entries.length) return { ok: false, empty: true }

  const parsed = entriesToWorkspace(entries, handle.name || DEFAULT_WORKSPACE_NAME)
  if (!parsed.ok) return { ok: false, empty: true, error: parsed.error }

  // What the sync should consider its own. Recording it from the workspace
  // rather than from the raw files means the text compared later is the text
  // this app would write, so adopting a folder does not immediately rewrite
  // every file in it over a difference in indentation.
  // Files and folders read from a path under the app's former name are on
  // disk at that path, not at their current one: recorded so, the first save
  // writes them under the current name and removes the former, rather than
  // leaving both behind.
  const previous = diskContents(parsed.workspace)
  for (const r of parsed.renamed || []) {
    if (r.folder) { previous.folders.push(r.from); continue }
    previous.files.delete(r.to)
    previous.files.set(r.from, '')
  }
  return { ok: true, workspace: parsed.workspace, skipped: parsed.skipped, previous }
}

// ---------- writing ----------

/**
 * Walk to a folder inside another, creating the levels on the way.
 *
 * @param {FileSystemDirectoryHandle} root - The workspace folder.
 * @param {string} path - A `/`-separated folder path; empty means the root itself.
 * @param {boolean} [create] - Whether to create levels that do not exist.
 * @returns {Promise<FileSystemDirectoryHandle|null>} The folder, or `null` when a level is missing and `create` is false.
 * @sideEffect May create directories on the user's filesystem.
 */
async function dirFor(root, path, create = true) {
  let dir = root
  for (const seg of path.split('/').filter(Boolean)) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create })
    } catch {
      return null
    }
  }
  return dir
}

/**
 * Carry out a sync plan against a folder.
 *
 * Each step is attempted independently: one file the user has open in another
 * program and locked should cost that file, not the other thirty-nine. What
 * failed comes back so the caller can say so rather than reporting a clean
 * save.
 *
 * @param {FileSystemDirectoryHandle} root - The workspace folder.
 * @param {{writes: Array<{path: string, data: string}>, deletes: string[], folders: string[], gone: string[]}} plan - The plan from `planSync`.
 * @returns {Promise<{written: number, failed: string[]}>} How many files were written, and the paths that could not be.
 * @sideEffect Creates, overwrites and removes files and directories on the user's filesystem.
 */
export async function applyPlan(root, plan) {
  const failed = []
  let written = 0

  for (const path of plan.folders) {
    await dirFor(root, path, true)
  }

  for (const { path, data } of plan.writes) {
    const slash = path.lastIndexOf('/')
    const dir = slash === -1 ? root : await dirFor(root, path.slice(0, slash), true)
    if (!dir) { failed.push(path); continue }
    try {
      const file = await dir.getFileHandle(path.slice(slash + 1), { create: true })
      const stream = await file.createWritable()
      await stream.write(data)
      await stream.close()
      written++
    } catch {
      failed.push(path)
    }
  }

  for (const path of plan.deletes) {
    const slash = path.lastIndexOf('/')
    const dir = slash === -1 ? root : await dirFor(root, path.slice(0, slash), false)
    if (!dir) continue
    try { await dir.removeEntry(path.slice(slash + 1)) } catch { /* already gone */ }
  }

  // Deepest first, so a folder emptied by removing the one below it is itself
  // removable in the same pass. Non-recursive on purpose: a directory that
  // still holds something the app does not know about survives.
  for (const path of [...plan.gone].sort((a, b) => b.length - a.length)) {
    const slash = path.lastIndexOf('/')
    const dir = slash === -1 ? root : await dirFor(root, path.slice(0, slash), false)
    if (!dir) continue
    try { await dir.removeEntry(path.slice(slash + 1)) } catch { /* not empty, or not there */ }
  }

  return { written, failed }
}
