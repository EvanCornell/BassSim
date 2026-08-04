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

// CONTRACT: "The panel id this window was opened to show, if it is a popped-out tab."
// AMBIGUITY: the contract never states what path marks a popout, so the only assertable
// property here is the type of the answer for a popout-looking URL.
test('popoutPanelId: always answers with a string or null', () => {
  for (const [path, search] of [
    ['/popout', '?id=spl'],
    ['/popout/spl', ''],
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

// CONTRACT: "`boolean` — True in a panel tab." + "Reads `window.location` via `popoutPanelId`."
test('isPopout: is exactly the boolean form of popoutPanelId', () => {
  for (const [path, search] of [
    ['/', ''],
    ['/', '?id=spl'],
    ['/popout', '?id=spl'],
    ['/popout/spl', ''],
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

// CONTRACT: "Open — or focus — the browser tab showing one panel." — the URL must identify the panel
test('openPanelWindow: the opened URL names the panel', () => {
  const fake = { focus: () => {} }
  const { win, opened } = makeWindow('/', '', () => fake)
  withWindow(win, () => {
    openPanelWindow('spl')
  })
  assert.equal(typeof opened[0].url, 'string')
  assert.ok(opened[0].url.includes('spl'), `the URL must carry the panel id, got ${opened[0].url}`)
})
