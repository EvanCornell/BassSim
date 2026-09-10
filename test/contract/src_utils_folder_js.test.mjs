import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  supportsFolders,
  diskContents,
  planSync,
  readFolderEntries,
  readFolderWorkspace,
  applyPlan,
} from '../../src/utils/folder.js'
import { newWorkspace, writeFile, deleteEntry, addFolder, META_PATH } from '../../src/workspace.js'

// UNREACHABLE — not covered:
//   openDb, withStore, rememberFolder, recallFolder, forgetFolder,
//   folderPermission, pickFolder — IndexedDB, the permission store and the
//   folder picker are browser surfaces with no value-level behaviour of their
//   own; what they guard is exercised through the fake handle below.

// ---------------------------------------------------------------------------
// An in-memory File System Access directory. Only the four calls this module
// makes are implemented, and they behave the way the platform's do in the two
// respects the module relies on: a missing level throws unless `create` is
// set, and removing a non-empty directory throws.
// ---------------------------------------------------------------------------

class FakeFile {
  constructor(text = '') {
    this.kind = 'file'
    this.text = text
  }

  async getFile() {
    const self = this
    return {
      size: Buffer.byteLength(self.text),
      async arrayBuffer() { return new TextEncoder().encode(self.text).buffer },
    }
  }

  async createWritable() {
    const self = this
    let buf = ''
    return {
      async write(chunk) { buf += chunk },
      async close() { self.text = buf },
    }
  }
}

class FakeDir {
  constructor(name = 'workspace') {
    this.kind = 'directory'
    this.name = name
    this.children = new Map()
  }

  async *entries() {
    for (const pair of [...this.children]) yield pair
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    const existing = this.children.get(name)
    if (existing) {
      if (existing.kind !== 'directory') throw new Error('not a directory')
      return existing
    }
    if (!create) throw new Error('no such directory')
    const dir = new FakeDir(name)
    this.children.set(name, dir)
    return dir
  }

  async getFileHandle(name, { create = false } = {}) {
    const existing = this.children.get(name)
    if (existing) {
      if (existing.kind !== 'file') throw new Error('not a file')
      return existing
    }
    if (!create) throw new Error('no such file')
    const file = new FakeFile('')
    this.children.set(name, file)
    return file
  }

  async removeEntry(name) {
    const child = this.children.get(name)
    if (!child) throw new Error('no such entry')
    if (child.kind === 'directory' && child.children.size) throw new Error('directory not empty')
    this.children.delete(name)
  }
}

/** Every file in a fake folder, as `path → text`, for asserting on the result. */
function snapshot(dir, prefix = '') {
  const out = {}
  for (const [name, child] of dir.children) {
    const path = prefix ? `${prefix}/${name}` : name
    if (child.kind === 'directory') Object.assign(out, snapshot(child, path))
    else out[path] = child.text
  }
  return out
}

/** Every directory in a fake folder, as a sorted list of paths. */
function dirs(dir, prefix = '') {
  const out = []
  for (const [name, child] of dir.children) {
    if (child.kind !== 'directory') continue
    const path = prefix ? `${prefix}/${name}` : name
    out.push(path, ...dirs(child, path))
  }
  return out.sort()
}

/** Write a folder from nothing, and return it with the state a sync would record. */
async function seed(ws) {
  const root = new FakeDir()
  const plan = planSync(ws, { files: new Map(), folders: [] })
  await applyPlan(root, plan)
  return { root, state: plan.next }
}

// ---------------------------------------------------------------------------
// supportsFolders
// ---------------------------------------------------------------------------

test('supportsFolders: false without the File System Access API', () => {
  assert.equal(supportsFolders(), false)
})

// ---------------------------------------------------------------------------
// diskContents
// ---------------------------------------------------------------------------

test('diskContents: every project file, plus the workspace metadata', () => {
  const ws = newWorkspace('bench', 'first')
  const { files } = diskContents(ws)
  assert.ok(files.has('first.acousim'))
  assert.ok(files.has(META_PATH))
  assert.equal(JSON.parse(files.get(META_PATH)).name, 'bench')
})

test('diskContents: an empty folder is listed even though it holds no file', () => {
  const ws = addFolder(newWorkspace(), 'sketches')
  assert.deepEqual(diskContents(ws).folders, ['sketches'])
})

// ---------------------------------------------------------------------------
// planSync
// ---------------------------------------------------------------------------

test('planSync: an unchanged workspace plans no work at all', () => {
  const ws = newWorkspace()
  const first = planSync(ws, { files: new Map(), folders: [] })
  const second = planSync(ws, first.next)
  assert.deepEqual(second.writes, [])
  assert.deepEqual(second.deletes, [])
  assert.deepEqual(second.gone, [])
})

test('planSync: only the file that changed is rewritten', () => {
  const ws = writeFile(newWorkspace('w', 'a'), 'b.acousim', { kind: 'project', data: { name: 'b', nodes: [], edges: [] } })
  const state = planSync(ws, { files: new Map(), folders: [] }).next

  const edited = writeFile(ws, 'b.acousim', { kind: 'project', data: { name: 'b', nodes: [1], edges: [] } })
  const plan = planSync(edited, state)
  const written = plan.writes.map((w) => w.path)
  assert.ok(written.includes('b.acousim'))
  // The untouched project is not rewritten. The metadata may be, since it
  // carries the workspace's modification stamp.
  assert.ok(!written.includes('a.acousim'))
  assert.ok(written.every((p) => p === 'b.acousim' || p === META_PATH))
})

test('planSync: a deleted file is removed from the folder', () => {
  const ws = writeFile(newWorkspace('w', 'a'), 'b.acousim', { kind: 'project', data: { name: 'b', nodes: [], edges: [] } })
  const state = planSync(ws, { files: new Map(), folders: [] }).next
  const plan = planSync(deleteEntry(ws, 'b.acousim'), state)
  assert.deepEqual(plan.deletes, ['b.acousim'])
})

test('planSync: a file the app never wrote is never deleted', () => {
  const ws = newWorkspace('w', 'a')
  // `previous` holds only what the app read or wrote, so a README sitting in
  // the folder is not in it — and cannot be planned for removal.
  const plan = planSync(ws, { files: new Map(), folders: [] })
  assert.deepEqual(plan.deletes, [])
})

test('planSync: a folder that no longer exists is listed for removal', () => {
  const ws = addFolder(newWorkspace(), 'sketches')
  const state = planSync(ws, { files: new Map(), folders: [] }).next
  const plan = planSync(deleteEntry(ws, 'sketches'), state)
  assert.deepEqual(plan.gone, ['sketches'])
})

// ---------------------------------------------------------------------------
// applyPlan
// ---------------------------------------------------------------------------

test('applyPlan: writes the workspace as real files in real folders', async () => {
  const ws = writeFile(newWorkspace('w', 'a'), 'boxes/ported/b.acousim', {
    kind: 'project', data: { name: 'b', nodes: [], edges: [] },
  })
  const { root } = await seed(ws)
  const files = snapshot(root)
  assert.ok(files['a.acousim'])
  assert.ok(files['boxes/ported/b.acousim'])
  assert.equal(JSON.parse(files['boxes/ported/b.acousim']).name, 'b')
  assert.ok(dirs(root).includes('boxes/ported'))
})

test('applyPlan: an empty folder is created on disk', async () => {
  const { root } = await seed(addFolder(newWorkspace(), 'sketches'))
  assert.ok(dirs(root).includes('sketches'))
})

test('applyPlan: reports the files it could not write', async () => {
  const ws = newWorkspace('w', 'a')
  const root = new FakeDir()
  // A directory where the file has to go: `getFileHandle` cannot produce a
  // handle for it, which is the shape a locked or unwritable path takes here.
  root.children.set('a.acousim', new FakeDir('a.acousim'))
  const { failed, written } = await applyPlan(root, planSync(ws, { files: new Map(), folders: [] }))
  assert.deepEqual(failed, ['a.acousim'])
  assert.equal(written, 1)
})

test('applyPlan: a deletion takes the file and prunes the folder it emptied', async () => {
  const ws = writeFile(newWorkspace('w', 'a'), 'old/b.acousim', {
    kind: 'project', data: { name: 'b', nodes: [], edges: [] },
  })
  const { root, state } = await seed(ws)
  await applyPlan(root, planSync(deleteEntry(ws, 'old'), state))
  assert.equal(snapshot(root)['old/b.acousim'], undefined)
  assert.ok(!dirs(root).includes('old'))
})

test('applyPlan: a folder holding something of the user\'s survives', async () => {
  const ws = writeFile(newWorkspace('w', 'a'), 'old/b.acousim', {
    kind: 'project', data: { name: 'b', nodes: [], edges: [] },
  })
  const { root, state } = await seed(ws)
  const old = await root.getDirectoryHandle('old')
  old.children.set('notes.txt', new FakeFile('port length: 34 cm'))

  await applyPlan(root, planSync(deleteEntry(ws, 'old'), state))
  assert.ok(dirs(root).includes('old'))
  assert.equal(snapshot(root)['old/notes.txt'], 'port length: 34 cm')
})

// ---------------------------------------------------------------------------
// readFolderEntries / readFolderWorkspace
// ---------------------------------------------------------------------------

test('readFolderEntries: walks nested folders and reads the files', async () => {
  const ws = writeFile(newWorkspace('w', 'a'), 'boxes/b.acousim', {
    kind: 'project', data: { name: 'b', nodes: [], edges: [] },
  })
  const { root } = await seed(ws)
  const entries = await readFolderEntries(root)
  const paths = entries.map((e) => e.path).sort()
  assert.ok(paths.includes('boxes'))
  assert.ok(paths.includes('boxes/b.acousim'))
  assert.equal(entries.find((e) => e.path === 'boxes').folder, true)
})

test('readFolderWorkspace: a folder the app wrote reads back as the same workspace', async () => {
  const ws = writeFile(newWorkspace('bench', 'a'), 'boxes/b.acousim', {
    kind: 'project', data: { name: 'b', nodes: [], edges: [] },
  })
  const { root } = await seed(ws)
  const read = await readFolderWorkspace(root)
  assert.equal(read.ok, true)
  assert.equal(read.workspace.name, 'bench')
  assert.deepEqual(Object.keys(read.workspace.files).sort(), ['a.acousim', 'boxes/b.acousim'])
  assert.deepEqual(read.workspace.files['boxes/b.acousim'].data, { name: 'b', nodes: [], edges: [] })
})

test('readFolderWorkspace: reading a folder then syncing to it writes nothing', async () => {
  const ws = writeFile(newWorkspace('bench', 'a'), 'boxes/b.acousim', {
    kind: 'project', data: { name: 'b', nodes: [], edges: [] },
  })
  const { root } = await seed(ws)
  const read = await readFolderWorkspace(root)
  // Adopting a folder must not immediately rewrite every file in it.
  const plan = planSync(read.workspace, read.previous)
  assert.deepEqual(plan.writes, [])
  assert.deepEqual(plan.deletes, [])
})

test('readFolderWorkspace: a plain folder of project files takes the folder\'s name', async () => {
  const root = new FakeDir('from-git')
  root.children.set('sub.acousim', new FakeFile(JSON.stringify({ name: 'sub', nodes: [], edges: [] })))
  const read = await readFolderWorkspace(root)
  assert.equal(read.ok, true)
  assert.equal(read.workspace.name, 'from-git')
  assert.equal(read.workspace.files['sub.acousim'].kind, 'project')
})

test('readFolderWorkspace: an empty folder is reported as empty, not as a failure', async () => {
  const read = await readFolderWorkspace(new FakeDir('nothing'))
  assert.equal(read.ok, false)
  assert.equal(read.empty, true)
})

test('readFolderWorkspace: a file that is not JSON is skipped, not fatal', async () => {
  const root = new FakeDir('mixed')
  root.children.set('a.acousim', new FakeFile(JSON.stringify({ name: 'a', nodes: [], edges: [] })))
  root.children.set('README.md', new FakeFile('# my enclosures'))
  const read = await readFolderWorkspace(root)
  assert.equal(read.ok, true)
  assert.deepEqual(read.skipped, ['README.md'])
  assert.equal(read.workspace.files['README.md'], undefined)
})

test('a foreign file survives a full write-read-write cycle', async () => {
  const ws = newWorkspace('bench', 'a')
  const { root } = await seed(ws)
  root.children.set('README.md', new FakeFile('# my enclosures'))

  const read = await readFolderWorkspace(root)
  const edited = writeFile(read.workspace, 'a.acousim', {
    kind: 'project', data: { name: 'a', nodes: [{ id: 'n1' }], edges: [] },
  })
  await applyPlan(root, planSync(edited, read.previous))

  const files = snapshot(root)
  assert.equal(files['README.md'], '# my enclosures')
  assert.deepEqual(JSON.parse(files['a.acousim']).nodes, [{ id: 'n1' }])
})
