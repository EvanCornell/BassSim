import { test } from 'node:test'
import assert from 'node:assert/strict'
import { popoutPanelId, isPopout, openPanelWindow } from '../../src/popout.js'

// ---------------------------------------------------------------------------
// Helpers: these functions are documented as reading `window.location` at call
// time, so the tests install and remove a window stub around each case.
// ---------------------------------------------------------------------------

const hadWindow = 'window' in globalThis
const realWindow = globalThis.window

function withWindow(win, fn) {
  globalThis.window = win
  try {
    fn()
  } finally {
    if (hadWindow) globalThis.window = realWindow
    else delete globalThis.window
  }
}

function withoutWindow(fn) {
  const had = 'window' in globalThis
  const saved = globalThis.window
  delete globalThis.window
  try {
    fn()
  } finally {
    if (had) globalThis.window = saved
  }
}

function makeWindow(pathname, search, openImpl) {
  const opened = []
  return {
    opened,
    win: {
      location: {
        pathname,
        search,
        href: `http://localhost${pathname}${search}`,
        origin: 'http://localhost',
      },
      open: (url, name, features) => {
        opened.push({ url, name, features })
        return openImpl ? openImpl(url, name, features) : null
      },
    },
  }
}

// ---------------------------------------------------------------------------
// popoutPanelId
// ---------------------------------------------------------------------------

// CONTRACT: "`string|null` — The panel id, or `null` in the main window or outside a browser."
test('popoutPanelId: returns null outside a browser', () => {
  withoutWindow(() => {
    assert.equal(popoutPanelId(), null)
  })
})

// CONTRACT: "Checked against the path as well as the query string, so a stray `?id=` on the main
// app cannot convince it that it is a panel window."
test('popoutPanelId: a stray ?id= on the main app is not a panel window', () => {
  const { win } = makeWindow('/', '?id=spl')
  withWindow(win, () => {
    assert.equal(popoutPanelId(), null)
  })
})

// CONTRACT: "`null` in the main window"
test('popoutPanelId: the main window with no query is not a panel window', () => {
  const { win } = makeWindow('/', '')
  withWindow(win, () => {
    assert.equal(popoutPanelId(), null)
  })
})

// CONTRACT (module): "The tab loads the same app at /panel?id=<panel> and renders that one
// panel full-window."
// CONTRACT (src/panelMeta.js constants): "`PANEL_META` — Keys: `palette`, `canvas`, `params`,
// `nllab`, `spl`, `zin`, `exc`, `vel`, `int`, `pow`, `eff`, `pe`, `ph`"
test('popoutPanelId: reads the panel id out of the documented /panel?id= URL', () => {
  for (const id of ['spl', 'canvas', 'zin', 'params']) {
    const { win } = makeWindow('/panel', `?id=${id}`)
    withWindow(win, () => {
      assert.equal(popoutPanelId(), id)
    })
  }
})

// CONTRACT: "Checked against the path as well as the query string" — the path alone is not enough
test('popoutPanelId: the popout path without an id names no panel', () => {
  const { win } = makeWindow('/panel', '')
  withWindow(win, () => {
    assert.equal(popoutPanelId(), null)
  })
})

// CONTRACT: "`string|null` — The panel id" — the answer is a string or null for any URL shape
test('popoutPanelId: always answers with a string or null', () => {
  for (const [path, search] of [
    ['/panel', '?id=spl'],
    ['/panel', '?id='],
    ['/panel/spl', ''],
    ['/index.html', '?id=spl'],
    ['/', '?id='],
    ['/', '?other=1'],
  ]) {
    const { win } = makeWindow(path, search)
    withWindow(win, () => {
      const got = popoutPanelId()
      assert.ok(got === null || typeof got === 'string', `${path}${search} gave ${JSON.stringify(got)}`)
    })
  }
})

// ---------------------------------------------------------------------------
// isPopout
// ---------------------------------------------------------------------------

// CONTRACT: "`boolean` — True in a panel tab."
// CONTRACT (module): "The tab loads the same app at /panel?id=<panel>"
test('isPopout: true in a panel tab', () => {
  const { win } = makeWindow('/panel', '?id=spl')
  withWindow(win, () => {
    assert.equal(isPopout(), true)
  })
})

// CONTRACT: "`boolean` — True in a panel tab." + "Reads `window.location` via `popoutPanelId`."
test('isPopout: is exactly the boolean form of popoutPanelId', () => {
  for (const [path, search] of [
    ['/', ''],
    ['/', '?id=spl'],
    ['/panel', '?id=spl'],
    ['/panel', ''],
    ['/index.html', '?id=spl'],
  ]) {
    const { win } = makeWindow(path, search)
    withWindow(win, () => {
      const got = isPopout()
      assert.equal(typeof got, 'boolean', `${path}${search} must give a boolean`)
      assert.equal(got, popoutPanelId() !== null, `${path}${search}: isPopout must track popoutPanelId`)
    })
  }
})

// CONTRACT: "`null` ... outside a browser" (popoutPanelId), so the main workspace is assumed
test('isPopout: false outside a browser', () => {
  withoutWindow(() => {
    assert.equal(isPopout(), false)
  })
})

// ---------------------------------------------------------------------------
// openPanelWindow
// ---------------------------------------------------------------------------

// CONTRACT: "`Window|null` — The panel window, or `null` when the browser blocked it."
// CONTRACT: "Opens a browser window and moves focus to it."
test('openPanelWindow: returns the opened window and focuses it', () => {
  let focused = 0
  const fake = { focus: () => { focused++ } }
  const { win, opened } = makeWindow('/', '', () => fake)
  withWindow(win, () => {
    const got = openPanelWindow('spl')
    assert.ok(Object.is(got, fake), 'must return the window that was opened')
    assert.equal(opened.length, 1, 'must call window.open once')
    assert.equal(focused, 1, 'must move focus to the panel window')
  })
})

// CONTRACT: "`null` when the browser blocked it."
test('openPanelWindow: returns null when the browser blocks the window', () => {
  const { win } = makeWindow('/', '', () => null)
  withWindow(win, () => {
    assert.equal(openPanelWindow('spl'), null)
  })
})

// CONTRACT: "The window name is keyed on the panel id, so a second click focuses the existing tab
// instead of opening a duplicate."
test('openPanelWindow: the window name is keyed on the panel id', () => {
  const fake = { focus: () => {} }
  const { win, opened } = makeWindow('/', '', () => fake)
  withWindow(win, () => {
    openPanelWindow('spl')
    openPanelWindow('spl')
    openPanelWindow('impedance')
  })
  assert.equal(opened.length, 3)
  assert.equal(typeof opened[0].name, 'string')
  assert.ok(opened[0].name.length > 0, 'the window must be named, not anonymous')
  assert.equal(opened[0].name, opened[1].name, 'the same panel id must reuse the same window name')
  assert.notEqual(opened[0].name, opened[2].name, 'a different panel id must use a different window name')
  assert.ok(opened[0].name.includes('spl'), 'the name must be keyed on the panel id')
  assert.ok(opened[2].name.includes('impedance'), 'the name must be keyed on the panel id')
})

// CONTRACT (module): "The tab loads the same app at /panel?id=<panel> and renders that one panel
// full-window."
test('openPanelWindow: opens the documented /panel?id= URL', () => {
  const fake = { focus: () => {} }
  const { win, opened } = makeWindow('/', '', () => fake)
  withWindow(win, () => {
    openPanelWindow('spl')
    openPanelWindow('canvas')
  })
  assert.equal(typeof opened[0].url, 'string')
  assert.ok(
    opened[0].url.includes('/panel?id=spl'),
    `the URL must be the documented /panel?id=<panel>, got ${opened[0].url}`,
  )
  assert.ok(
    opened[1].url.includes('/panel?id=canvas'),
    `the URL must be the documented /panel?id=<panel>, got ${opened[1].url}`,
  )
})

// CONTRACT (module): the popped-out tab is recognised by the URL it was opened with, so the URL
// openPanelWindow produces must be one popoutPanelId reads back as that panel.
test('openPanelWindow: the URL it opens round-trips through popoutPanelId', () => {
  const fake = { focus: () => {} }
  const { win, opened } = makeWindow('/', '', () => fake)
  withWindow(win, () => {
    openPanelWindow('zin')
  })
  const url = new URL(opened[0].url, 'http://localhost/')
  const { win: tab } = makeWindow(url.pathname, url.search)
  withWindow(tab, () => {
    assert.equal(popoutPanelId(), 'zin')
    assert.equal(isPopout(), true)
  })
})
