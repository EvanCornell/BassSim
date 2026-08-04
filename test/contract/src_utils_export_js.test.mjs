import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  exportProjectJSON,
  exportCSV,
  exportSchematicPNG,
  exportMetricsTxt,
  __internals,
} from '../../src/utils/export.js'

// UNREACHABLE — not covered:
//   exportSchematicPNG > filter(n)  — marked UNREACHABLE in the spec
//   exportMetricsTxt > row(k, v)    — marked UNREACHABLE in the spec

// ---------------------------------------------------------------------------
// Instrumentation. Every download documented in this module goes through
// `download`, which "Uses an object URL and a synthetic anchor click", so
// counting object-URL creations is the observable "a download was triggered"
// and its absence is the observable "exports nothing / returns silently".
// try/finally (no catch) restores the globals without swallowing failures.
// ---------------------------------------------------------------------------

function instrument({ timers = true } = {}) {
  const rec = { created: [], revoked: [], delays: [], anchors: [] }
  const orig = {
    create: globalThis.URL.createObjectURL,
    revoke: globalThis.URL.revokeObjectURL,
    setTimeout: globalThis.setTimeout,
    createElement: globalThis.document && globalThis.document.createElement,
  }
  globalThis.URL.createObjectURL = (b) => {
    rec.created.push(b)
    return `blob:contract-test/${rec.created.length}`
  }
  globalThis.URL.revokeObjectURL = (u) => { rec.revoked.push(u) }
  if (timers) {
    globalThis.setTimeout = (fn, ms) => { rec.delays.push(ms); return 0 }
  }
  if (orig.createElement) {
    globalThis.document.createElement = function (tag, ...rest) {
      const el = orig.createElement.call(this, tag, ...rest)
      if (String(tag).toLowerCase() === 'a') rec.anchors.push(el)
      return el
    }
  }
  rec.restore = () => {
    globalThis.URL.createObjectURL = orig.create
    globalThis.URL.revokeObjectURL = orig.revoke
    if (timers) globalThis.setTimeout = orig.setTimeout
    if (orig.createElement) globalThis.document.createElement = orig.createElement
  }
  return rec
}

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

// CONTRACT: "Push content to the user as a file download." /
// "Uses an object URL and a synthetic anchor click, which is the only way to
// name a download from the browser." / "`void`"
test('download: creates an object URL and clicks a synthetic anchor', () => {
  const rec = instrument()
  let ret
  try {
    ret = __internals.download('report.txt', 'hello', 'text/plain')
  } finally {
    rec.restore()
  }
  assert.equal(ret, undefined)
  assert.equal(rec.created.length, 1, 'exactly one object URL for one download')
  assert.ok(rec.anchors.length >= 1, 'a synthetic anchor is created')
  assert.equal(rec.anchors[rec.anchors.length - 1].download, 'report.txt',
    'the anchor names the download')
})

// CONTRACT: "The URL is revoked after 5 s — long enough for the download to
// start, short enough not to leak the blob for the session."
test('download: schedules the object URL revocation after 5 s', () => {
  const rec = instrument()
  try {
    __internals.download('report.txt', 'hello', 'text/plain')
  } finally {
    rec.restore()
  }
  assert.ok(rec.delays.includes(5000), `expected a 5000 ms revocation, got ${rec.delays.join(', ')}`)
})

// CONTRACT: "`content` — `Blob|string` — A ready Blob, or text to wrap in one."
test('download: accepts a ready Blob as well as text', () => {
  const rec = instrument()
  try {
    __internals.download('data.bin', new Blob(['abc'], { type: 'application/octet-stream' }), 'text/plain')
  } finally {
    rec.restore()
  }
  assert.equal(rec.created.length, 1)
  assert.ok(rec.created[0] instanceof Blob, 'the object URL is made from a Blob')
})

// ---------------------------------------------------------------------------
// exportProjectJSON
// ---------------------------------------------------------------------------

// CONTRACT: "Download a project as a formatted `.acousim.json` file." / "`void`"
test('exportProjectJSON: triggers a download of a .acousim.json file', () => {
  const rec = instrument()
  let ret
  try {
    ret = exportProjectJSON({ name: 'Ported Box', nodes: [], edges: [] })
  } finally {
    rec.restore()
  }
  assert.equal(ret, undefined)
  assert.equal(rec.created.length, 1, 'a download is triggered')
  const a = rec.anchors[rec.anchors.length - 1]
  assert.match(a.download, /\.acousim\.json$/)
})

// CONTRACT: "`proj.name` — `string` (optional) — Used for the filename; falls
// back to `acousim-project`."
test('exportProjectJSON: the filename falls back to acousim-project', () => {
  const rec = instrument()
  try {
    exportProjectJSON({ nodes: [], edges: [] })
  } finally {
    rec.restore()
  }
  const a = rec.anchors[rec.anchors.length - 1]
  assert.ok(a.download.includes('acousim-project'),
    `expected the fallback name in "${a.download}"`)
  assert.match(a.download, /\.acousim\.json$/)
})

// ---------------------------------------------------------------------------
// exportCSV
// ---------------------------------------------------------------------------

// CONTRACT: "`results` — `object|null` — A result from `runSimulation`. A
// failed or absent result exports nothing." /
// "Returns silently when there is nothing to export."
// The failed shape is the one runSimulation documents: `{ok: false, validation,
// freqs: []}` (see src/engine/solver.js spec).
test('exportCSV: a failed or absent result exports nothing', () => {
  for (const results of [
    null,
    undefined,
    { ok: false, validation: { warnings: {}, errors: ['no driver'] }, freqs: [] },
  ]) {
    const rec = instrument()
    let ret
    try {
      ret = exportCSV(results, [], 'proj')
    } finally {
      rec.restore()
    }
    assert.equal(ret, undefined)
    assert.equal(rec.created.length, 0,
      `no download for results = ${JSON.stringify(results) ?? 'undefined'}`)
    assert.equal(rec.anchors.length, 0, 'no synthetic anchor either')
  }
})

// ---------------------------------------------------------------------------
// exportSchematicPNG
// ---------------------------------------------------------------------------

// CONTRACT: "`Promise<void>` — Resolves once the download has been triggered."
// / "Returns silently when the canvas is not mounted."
test('exportSchematicPNG: returns a promise resolving to void', async () => {
  const rec = instrument({ timers: false })
  let p
  try {
    p = exportSchematicPNG('proj')
    assert.ok(p instanceof Promise, 'documented as async, returning a Promise')
    assert.equal(await p, undefined)
  } finally {
    rec.restore()
  }
})

// CONTRACT: "Returns silently when the canvas is not mounted."
test('exportSchematicPNG: exports nothing when the canvas is not mounted', async () => {
  const rec = instrument({ timers: false })
  try {
    await exportSchematicPNG('proj')
  } finally {
    rec.restore()
  }
  assert.equal(rec.created.length, 0, 'no download without a mounted canvas')
})

// ---------------------------------------------------------------------------
// exportMetricsTxt
// ---------------------------------------------------------------------------

// CONTRACT: "`metrics` — `object|null` — Metrics from `computeMetrics`. Absent
// metrics export nothing."
test('exportMetricsTxt: absent metrics export nothing', () => {
  for (const metrics of [null, undefined]) {
    const rec = instrument()
    let ret
    try {
      ret = exportMetricsTxt(metrics, {}, 'proj')
    } finally {
      rec.restore()
    }
    assert.equal(ret, undefined)
    assert.equal(rec.created.length, 0, 'no download for absent metrics')
  }
})

// CONTRACT: "Download a plain-text summary of the key metrics." / "Every figure
// degrades to `n/a` rather than being omitted, so the shape of the report is
// the same for a sealed box and a ported one."
// AMBIGUITY: only `null`/absent is documented as exporting nothing, so a
// present-but-empty metrics object must still produce the full-shape report.
test('exportMetricsTxt: present metrics trigger a download', () => {
  const rec = instrument()
  let ret
  try {
    ret = exportMetricsTxt({}, {}, 'proj')
  } finally {
    rec.restore()
  }
  assert.equal(ret, undefined)
  assert.equal(rec.created.length, 1, 'a download is triggered for present metrics')
  assert.ok(rec.anchors.length >= 1)
  assert.ok(rec.anchors[rec.anchors.length - 1].download.includes('proj'),
    'the project name is the base filename')
})
