// Records: numbered save states of one project, kept in the project file.
//
// Each record is a git commit — made and read by isomorphic-git — whose tree
// holds the project as one file. Git's object store is content-addressed:
// every object is named by the hash of what it holds, so records that share
// a design share its objects, and a record saved twice unchanged is stored
// once. The objects travel inside the project file, deflated as git keeps
// them, so a project's records go wherever the project goes.
//
// There is no merging. The records are a numbered list; the project's own
// content is the working copy of the selected one, written into it when
// another record is selected, added or the list is changed. Each record also
// has an id that stays with it while its commit changes, so a time-domain run
// can say which record it came from.
//
// A time-domain run is a branch: a commit whose parent is the record it was
// run from and whose tree holds the project exactly as it was run, beside the
// run's results. The record can go on changing; the run keeps its own state,
// and that state can be restored as a new record.
//
// Nothing here touches the store or the DOM: each function takes the records
// and returns new ones.

import { Buffer } from 'buffer'

// isomorphic-git expects Node's Buffer; a browser has none of its own.
if (!globalThis.Buffer) globalThis.Buffer = Buffer

/** The git directory of the in-memory repository the objects are read into. */
const GITDIR = '/records'

/** The one file in each record's tree. */
const FILE = 'project.json'

/** The results file in a run's tree, beside the project. */
const RUN_FILE = 'run.json'

/** Who a record's commit is recorded as made by. */
const AUTHOR = 'SpeakerSpice'

/** Project fields that are not part of a record: the file's name, its save stamp, the records themselves and the time-domain boards. */
const NOT_RECORDED = ['name', 'modified', 'records', 'tdBoards']

/** A git object's name. */
const OID = /^[0-9a-f]{40}$/

/**
 * A fresh id for a record or a run.
 *
 * @param {string} prefix - `r` for a record, `run` for a run.
 * @returns {string} e.g. `r-k3j9x2`.
 * @sideEffect Reads the random number generator and the clock.
 */
export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 8)}`
}

let gitModule = null

/**
 * The version-control library, loaded on first use.
 *
 * @returns {Promise<object>} isomorphic-git.
 * @sideEffect Loads the library the first time.
 */
async function git() {
  if (!gitModule) gitModule = await import('isomorphic-git')
  return gitModule.default?.readCommit ? gitModule.default : gitModule
}

/**
 * An error as Node's filesystem raises it, which is how isomorphic-git tells a missing file.
 *
 * @param {string} code - `ENOENT` and the like.
 * @param {string} path - The path.
 * @returns {Error} The error.
 * @pure
 */
function fsError(code, path) {
  const err = new Error(`${code}: ${path}`)
  err.code = code
  return err
}

/**
 * A stat result, as isomorphic-git reads one.
 *
 * @param {boolean} file - A file; otherwise a directory.
 * @param {number} size - Its size, bytes.
 * @returns {object} The stat.
 * @pure
 */
function statOf(file, size) {
  return {
    type: file ? 'file' : 'dir', mode: file ? 0o100644 : 0o40000, size,
    ino: 0, mtimeMs: 0, ctimeMs: 0, uid: 0, gid: 0, dev: 0,
    // constant answers, bound rather than written out
    isFile: Boolean.bind(null, file),
    isDirectory: Boolean.bind(null, !file),
    isSymbolicLink: Boolean.bind(null, false),
  }
}

/**
 * A filesystem in memory holding a repository's objects, as isomorphic-git reads and writes them.
 *
 * Only loose objects are ever written — the repository is never packed — so
 * the object's path names its hash, and the files are exactly the objects.
 *
 * @param {Object<string, string>} objects - Each object's deflated bytes, base64, by hash.
 * @returns {{fs: object, objects: Map<string, Uint8Array>}} The filesystem, and the object map it reads and writes.
 * @pure
 */
function memoryRepo(objects) {
  const files = new Map()
  const prefix = `${GITDIR}/objects/`
  for (const [oid, b64] of Object.entries(objects || {})) {
    files.set(`${prefix}${oid.slice(0, 2)}/${oid.slice(2)}`, new Uint8Array(Buffer.from(b64, 'base64')))
  }
  /**
   * Whether a path is a directory: some file lies beneath it.
   *
   * @param {string} path - The path.
   * @returns {boolean} True when it holds a file.
   * @reads the files.
   */
  const isDir = (path) => {
    const p = path.endsWith('/') ? path : `${path}/`
    for (const k of files.keys()) if (k.startsWith(p)) return true
    return false
  }
  /**
   * A stat result.
   *
   * @param {string} path - The path.
   * @returns {object} What isomorphic-git reads of a stat.
   * @throws {Error} ENOENT when nothing is there.
   * @reads the files.
   */
  const stat = async (path) => {
    if (files.has(path)) return statOf(true, files.get(path).length)
    if (isDir(path)) return statOf(false, 0)
    throw fsError('ENOENT', path)
  }
  const promises = {
    /**
     * Read a file.
     *
     * @param {string} path - The path.
     * @param {object|string} [opts] - `{encoding: 'utf8'}` for text.
     * @returns {Promise<Uint8Array|string>} Its contents.
     * @throws {Error} ENOENT when it does not exist.
     * @reads the files.
     */
    async readFile(path, opts) {
      if (!files.has(path)) throw fsError('ENOENT', path)
      const data = files.get(path)
      const enc = typeof opts === 'string' ? opts : opts?.encoding
      return enc ? Buffer.from(data).toString(enc) : Buffer.from(data)
    },
    /**
     * Write a file.
     *
     * @param {string} path - The path.
     * @param {Uint8Array|string} data - The contents.
     * @returns {Promise<void>} Resolves once written.
     * @mutates the files.
     */
    async writeFile(path, data) {
      files.set(path, typeof data === 'string' ? new Uint8Array(Buffer.from(data)) : new Uint8Array(data))
    },
    /**
     * Remove a file.
     *
     * @param {string} path - The path.
     * @returns {Promise<void>} Resolves once removed.
     * @mutates the files.
     */
    async unlink(path) { files.delete(path) },
    /**
     * List a directory.
     *
     * @param {string} path - The path.
     * @returns {Promise<string[]>} The names directly inside it.
     * @throws {Error} ENOENT when it holds nothing.
     * @reads the files.
     */
    async readdir(path) {
      const p = path.endsWith('/') ? path : `${path}/`
      const names = new Set()
      for (const k of files.keys()) if (k.startsWith(p)) names.add(k.slice(p.length).split('/')[0])
      if (!names.size) throw fsError('ENOENT', path)
      return [...names]
    },
    /**
     * Make a directory; directories exist implicitly here.
     *
     * @returns {Promise<void>} Resolves at once.
     * @pure
     */
    async mkdir() {},
    /**
     * Remove a directory; directories exist implicitly here.
     *
     * @returns {Promise<void>} Resolves at once.
     * @pure
     */
    async rmdir() {},
    stat,
    lstat: stat,
    /**
     * Read a symbolic link; there are none.
     *
     * @param {string} path - The path.
     * @returns {Promise<never>} Always rejects.
     * @throws {Error} ENOENT.
     * @pure
     */
    async readlink(path) { throw fsError('ENOENT', path) },
    /**
     * Make a symbolic link; not supported.
     *
     * @param {string} target - The target.
     * @param {string} path - The path.
     * @returns {Promise<never>} Always rejects.
     * @throws {Error} ENOTSUP.
     * @pure
     */
    async symlink(target, path) { throw fsError('ENOTSUP', path) },
    /**
     * Change a file's mode; modes are not kept.
     *
     * @returns {Promise<void>} Resolves at once.
     * @pure
     */
    async chmod() {},
  }
  return { fs: { promises }, files }
}

/**
 * The objects of an in-memory repository, as the project file keeps them.
 *
 * @param {Map<string, Uint8Array>} files - The repository's files.
 * @returns {Object<string, string>} Each object's deflated bytes, base64, by hash.
 * @pure
 */
function objectsOf(files) {
  const out = {}
  const prefix = `${GITDIR}/objects/`
  for (const [path, data] of files) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length).split('/')
    if (rest.length === 2 && rest[0].length === 2) out[rest[0] + rest[1]] = Buffer.from(data).toString('base64')
  }
  return out
}

/**
 * A project's content as a record holds it: everything but its name, save stamp and records.
 *
 * @param {object} project - A serialized project.
 * @returns {object} The content.
 * @pure
 */
export function recordContent(project) {
  const out = { ...project }
  for (const k of NOT_RECORDED) delete out[k]
  return out
}

/**
 * The records a project file carries, checked; none when it carries none or they are unusable.
 *
 * @param {*} raw - The file's `records` field.
 * @returns {{list: string[], selected: number, objects: Object<string, string>}|null} The records, or `null`.
 * @pure
 */
export function readRecords(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.list) || !raw.list.length) return null
  const keep = raw.list.map((oid) => typeof oid === 'string' && OID.test(oid))
  const list = raw.list.filter((_, i) => keep[i])
  if (!list.length || !raw.objects || typeof raw.objects !== 'object') return null
  const selected = Math.min(Math.max(Math.round(Number(raw.selected) || 0), 0), list.length - 1)
  // ids: kept when there is one per record, otherwise made from the commits, which is stable until the next save writes them
  const given = Array.isArray(raw.ids) && raw.ids.length === raw.list.length ? raw.ids.filter((_, i) => keep[i]) : null
  const ids = given && given.every((x) => typeof x === 'string' && x) && new Set(given).size === given.length
    ? given : list.map((oid, i) => `r-${oid.slice(0, 8)}${i}`)
  const runs = (Array.isArray(raw.runs) ? raw.runs : [])
    .filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && typeof r.oid === 'string' && OID.test(r.oid) && raw.objects[r.oid])
  return { list, ids, selected, objects: { ...raw.objects }, runs }
}

/**
 * Write content as a record: its blob, a tree holding it, and a commit of that tree.
 *
 * @param {object} repo - From `memoryRepo`.
 * @param {object} content - The record's content.
 * @param {number} now - The time, ms since the epoch.
 * @returns {Promise<string>} The commit's hash.
 * @sideEffect Loads the library; writes the repository.
 */
async function writeRecord(repo, content, now) {
  const g = await git()
  const blob = await g.writeBlob({ fs: repo.fs, gitdir: GITDIR, blob: new Uint8Array(Buffer.from(JSON.stringify(content))) })
  const tree = await g.writeTree({ fs: repo.fs, gitdir: GITDIR, tree: [{ mode: '100644', path: FILE, oid: blob, type: 'blob' }] })
  const who = { name: AUTHOR, email: '', timestamp: Math.floor(now / 1000), timezoneOffset: 0 }
  return g.writeCommit({ fs: repo.fs, gitdir: GITDIR, commit: { message: 'Record\n', tree, parent: [], author: who, committer: who } })
}

/**
 * The hash of the project file inside a record.
 *
 * @param {object} repo - From `memoryRepo`.
 * @param {string} oid - The record's commit.
 * @returns {Promise<{tree: string, blob: string, time: number}>} Its tree, its file's blob, and when it was saved, ms since the epoch.
 * @sideEffect Loads the library.
 */
async function recordParts(repo, oid) {
  const g = await git()
  const { commit } = await g.readCommit({ fs: repo.fs, gitdir: GITDIR, oid })
  const { tree } = await g.readTree({ fs: repo.fs, gitdir: GITDIR, oid: commit.tree })
  const entry = tree.find((e) => e.path === FILE)
  if (!entry) throw new Error('A record holds no project.')
  return { tree: commit.tree, blob: entry.oid, time: commit.committer.timestamp * 1000 }
}

/**
 * Drop every object no record or run reaches.
 *
 * @param {object} repo - From `memoryRepo`.
 * @param {string[]} list - The records.
 * @param {Array<{oid: string}>} [runs] - The runs, whose commits, trees and parent records are kept too.
 * @returns {Promise<void>} Resolves once done.
 * @sideEffect Loads the library; removes objects from the repository.
 */
async function collect(repo, list, runs = []) {
  const keep = new Set()
  for (const oid of list) {
    const p = await recordParts(repo, oid)
    keep.add(oid).add(p.tree).add(p.blob)
  }
  const g = await git()
  for (const run of runs) {
    // the run's commit, everything in its tree, and the record commit it branched from
    const { commit } = await g.readCommit({ fs: repo.fs, gitdir: GITDIR, oid: run.oid })
    keep.add(run.oid).add(commit.tree)
    const { tree } = await g.readTree({ fs: repo.fs, gitdir: GITDIR, oid: commit.tree })
    for (const e of tree) keep.add(e.oid)
    for (const parent of commit.parent) {
      if (!repo.files.has(`${GITDIR}/objects/${parent.slice(0, 2)}/${parent.slice(2)}`)) continue
      const p = await recordParts(repo, parent)
      keep.add(parent).add(p.tree).add(p.blob)
    }
  }
  for (const oid of Object.keys(objectsOf(repo.files))) {
    if (!keep.has(oid)) repo.files.delete(`${GITDIR}/objects/${oid.slice(0, 2)}/${oid.slice(2)}`)
  }
}

/**
 * Read a record's content.
 *
 * @param {object} records - The project's records.
 * @param {number} index - Which record.
 * @returns {Promise<object>} The content it holds.
 * @throws {Error} When the record is missing or unreadable.
 * @sideEffect Loads the library.
 */
export async function readRecord(records, index) {
  const oid = records.list[index]
  if (!oid) throw new Error(`There is no record ${index + 1}.`)
  const repo = memoryRepo(records.objects)
  const g = await git()
  const { blob } = await recordParts(repo, oid)
  const { blob: bytes } = await g.readBlob({ fs: repo.fs, gitdir: GITDIR, oid: blob })
  return JSON.parse(Buffer.from(bytes).toString('utf8'))
}

/**
 * When each record was last saved.
 *
 * @param {object} records - The project's records.
 * @returns {Promise<number[]>} Ms since the epoch, per record.
 * @sideEffect Loads the library.
 */
export async function recordTimes(records) {
  const repo = memoryRepo(records.objects)
  const out = []
  for (const oid of records.list) out.push((await recordParts(repo, oid)).time)
  return out
}

/**
 * Save content into the selected record, or start the records with it.
 *
 * A record saved unchanged keeps its commit — content-addressed, the
 * content's hash already says so — and so its time.
 *
 * @param {object|null} records - The project's records; `null` for a project that has none yet.
 * @param {object} project - The serialized project; its content is saved.
 * @param {number} [now] - The time, ms since the epoch.
 * @returns {Promise<object>} The records.
 * @sideEffect Loads the library.
 */
export async function saveRecord(records, project, now = Date.now()) {
  const content = recordContent(project)
  if (!records) {
    const repo = memoryRepo({})
    const oid = await writeRecord(repo, content, now)
    return { list: [oid], ids: [newId('r')], selected: 0, objects: objectsOf(repo.files), runs: [] }
  }
  const repo = memoryRepo(records.objects)
  const g = await git()
  const { oid: blob } = await g.hashBlob({ object: new Uint8Array(Buffer.from(JSON.stringify(content))) })
  const current = records.list[records.selected]
  if (current && (await recordParts(repo, current)).blob === blob) return records
  const oid = await writeRecord(repo, content, now)
  const list = records.list.slice()
  list[records.selected] = oid
  await collect(repo, list, records.runs)
  return { ...records, list, objects: objectsOf(repo.files) }
}

/**
 * Add a record at the end, from the selected one, and select it.
 *
 * The selected record is saved first, with the project's content, and the
 * new one starts as a copy of it.
 *
 * @param {object|null} records - The project's records.
 * @param {object} project - The serialized project.
 * @param {number} [now] - The time, ms since the epoch.
 * @returns {Promise<object>} The records, the new one selected.
 * @sideEffect Loads the library.
 */
export async function addRecord(records, project, now = Date.now()) {
  const saved = await saveRecord(records, project, now)
  const repo = memoryRepo(saved.objects)
  // one second on, so the new record's commit is its own even when nothing has changed yet
  const oid = await writeRecord(repo, recordContent(project), now + 1000)
  const list = [...saved.list, oid]
  return { ...saved, list, ids: [...saved.ids, newId('r')], selected: list.length - 1, objects: objectsOf(repo.files) }
}

/**
 * Delete the selected record, selecting the one before it (or the new first).
 *
 * @param {object} records - The project's records.
 * @returns {Promise<object>} The records.
 * @throws {Error} When it is the only record.
 * @sideEffect Loads the library.
 */
export async function deleteRecord(records) {
  if (records.list.length <= 1) throw new Error('A project keeps at least one record.')
  const list = records.list.filter((_, i) => i !== records.selected)
  const ids = records.ids.filter((_, i) => i !== records.selected)
  const repo = memoryRepo(records.objects)
  await collect(repo, list, records.runs)
  return { ...records, list, ids, selected: Math.max(0, records.selected - 1), objects: objectsOf(repo.files) }
}

/**
 * Select another record, saving the selected one first.
 *
 * @param {object|null} records - The project's records.
 * @param {object} project - The serialized project, the selected record's working copy.
 * @param {number} index - The record to select.
 * @param {number} [now] - The time, ms since the epoch.
 * @returns {Promise<{records: object, content: object}>} The records, and the content of the one now selected.
 * @throws {Error} When there is no such record.
 * @sideEffect Loads the library.
 */
export async function selectRecord(records, project, index, now = Date.now()) {
  const saved = await saveRecord(records, project, now)
  if (index < 0 || index >= saved.list.length) throw new Error(`There is no record ${index + 1}.`)
  const next = { ...saved, selected: index }
  return { records: next, content: await readRecord(next, index) }
}

/**
 * The record a run branches from: the selected one, saved with the project first.
 *
 * Called when a run is queued, so the branch point is the record as it was
 * then, whatever is edited while the run waits.
 *
 * @param {object|null} records - The project's records; `null` starts them.
 * @param {object} project - The serialized project.
 * @param {number} [now] - The time, ms since the epoch.
 * @returns {Promise<{records: object, parent: string, recordId: string, content: object}>} The records, the record's commit, its id, and the content a run of it holds.
 * @sideEffect Loads the library.
 */
export async function branchPoint(records, project, now = Date.now()) {
  const saved = await saveRecord(records, project, now)
  return { records: saved, parent: saved.list[saved.selected], recordId: saved.ids[saved.selected], content: recordContent(project) }
}

/**
 * Store a finished run as a branch off its record.
 *
 * The commit's tree holds the project as it was run and the run's results;
 * its parent is the record commit the run was queued from, or, when that has
 * since been replaced by a later save, the record's commit now.
 *
 * @param {object} records - The project's records.
 * @param {object} run - The run.
 * @param {string} run.id - Its id.
 * @param {string} [run.parent] - The record commit it was queued from.
 * @param {string} [run.recordId] - The id of the record it was queued from.
 * @param {object} run.content - The project content it ran.
 * @param {object} run.data - Its settings and results, as `run.json` holds them.
 * @param {object} [run.meta] - What the run list shows of it: title, kind, figures.
 * @param {number} [now] - The time, ms since the epoch.
 * @returns {Promise<object>} The records, the run at the end of `runs`.
 * @sideEffect Loads the library.
 */
export async function addRun(records, run, now = Date.now()) {
  const repo = memoryRepo(records.objects)
  const g = await git()
  /**
   * Write a JSON file's blob.
   *
   * @param {object} value - The content.
   * @returns {Promise<string>} The blob's hash.
   * @sideEffect Writes the repository.
   */
  const blobOf = (value) => g.writeBlob({ fs: repo.fs, gitdir: GITDIR, blob: new Uint8Array(Buffer.from(JSON.stringify(value))) })
  const tree = await g.writeTree({
    fs: repo.fs, gitdir: GITDIR,
    tree: [
      { mode: '100644', path: FILE, oid: await blobOf(run.content), type: 'blob' },
      { mode: '100644', path: RUN_FILE, oid: await blobOf(run.data), type: 'blob' },
    ],
  })
  /**
   * Whether the repository holds an object.
   *
   * @param {string} [oid] - Its hash.
   * @returns {boolean} True when present.
   * @reads the repository's files.
   */
  const has = (oid) => !!oid && repo.files.has(`${GITDIR}/objects/${oid.slice(0, 2)}/${oid.slice(2)}`)
  const byId = records.ids.indexOf(run.recordId)
  const parent = has(run.parent) ? run.parent : byId >= 0 ? records.list[byId] : null
  const who = { name: AUTHOR, email: '', timestamp: Math.floor(now / 1000), timezoneOffset: 0 }
  const oid = await g.writeCommit({
    fs: repo.fs, gitdir: GITDIR,
    commit: { message: `Run ${run.meta?.title || run.id}\n`, tree, parent: parent ? [parent] : [], author: who, committer: who },
  })
  const entry = { ...(run.meta || {}), id: run.id, oid, recordId: run.recordId || null, at: now }
  return { ...records, runs: [...(records.runs || []), entry], objects: objectsOf(repo.files) }
}

/**
 * Read a run's project and results.
 *
 * @param {object} records - The records holding the run.
 * @param {string} oid - The run's commit.
 * @returns {Promise<{content: object, data: object}>} The project as it was run, and `run.json`.
 * @throws {Error} When the run is missing or unreadable.
 * @sideEffect Loads the library.
 */
export async function readRun(records, oid) {
  const repo = memoryRepo(records.objects)
  const g = await git()
  const { commit } = await g.readCommit({ fs: repo.fs, gitdir: GITDIR, oid })
  const { tree } = await g.readTree({ fs: repo.fs, gitdir: GITDIR, oid: commit.tree })
  const out = {}
  for (const [key, path] of [['content', FILE], ['data', RUN_FILE]]) {
    const entry = tree.find((e) => e.path === path)
    if (!entry) throw new Error('A run is missing its files.')
    const { blob } = await g.readBlob({ fs: repo.fs, gitdir: GITDIR, oid: entry.oid })
    out[key] = JSON.parse(Buffer.from(blob).toString('utf8'))
  }
  return out
}

/**
 * Delete runs, dropping whatever only they reached.
 *
 * @param {object} records - The project's records.
 * @param {string[]} ids - The runs.
 * @returns {Promise<object>} The records.
 * @sideEffect Loads the library.
 */
export async function deleteRuns(records, ids) {
  const runs = (records.runs || []).filter((r) => !ids.includes(r.id))
  const repo = memoryRepo(records.objects)
  await collect(repo, records.list, runs)
  return { ...records, runs, objects: objectsOf(repo.files) }
}

/**
 * Add a record at the end holding given content — a run's project — and select it.
 *
 * The selected record is saved with the working copy first, as when adding
 * any record.
 *
 * @param {object|null} records - The project's records.
 * @param {object} project - The serialized project, the selected record's working copy.
 * @param {object} content - The new record's content.
 * @param {number} [now] - The time, ms since the epoch.
 * @returns {Promise<object>} The records, the new one selected.
 * @sideEffect Loads the library.
 */
export async function addRecordFrom(records, project, content, now = Date.now()) {
  const saved = await saveRecord(records, project, now)
  const repo = memoryRepo(saved.objects)
  const oid = await writeRecord(repo, recordContent(content), now + 1000)
  const list = [...saved.list, oid]
  return { ...saved, list, ids: [...saved.ids, newId('r')], selected: list.length - 1, objects: objectsOf(repo.files) }
}
