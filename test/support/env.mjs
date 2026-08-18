// Minimal browser-environment shims, installed before any app module loads.
//
// Several modules read `localStorage`, `window`, `BroadcastChannel` or `Worker`
// at import time — the store hydrates its layout, keymap and toolbar from
// storage as the module initialises. Without these the import throws and the
// whole file's contracts become untestable, so this supplies the smallest
// surface that lets those modules load. It is not a DOM: nothing here renders.
//
// Storage is in-memory and per-process, so tests that write to it do not leak
// into the developer's browser or into each other across runs.

/** In-memory Storage implementation backed by a Map. */
class MemoryStorage {
  /** @returns {void} @mutates Initialises the backing map. */
  constructor() { this.map = new Map() }

  /** @returns {number} Number of stored keys. @pure */
  get length() { return this.map.size }

  /**
   * @param {string} k - Storage key.
   * @returns {string|null} The stored value, or null when absent.
   * @pure
   */
  getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null }

  /**
   * @param {string} k - Storage key.
   * @param {any} v - Value, coerced to a string as the real API does.
   * @returns {void}
   * @mutates The backing map.
   */
  setItem(k, v) { this.map.set(String(k), String(v)) }

  /**
   * @param {string} k - Storage key.
   * @returns {void}
   * @mutates The backing map.
   */
  removeItem(k) { this.map.delete(String(k)) }

  /** @returns {void} @mutates Empties the backing map. */
  clear() { this.map.clear() }

  /**
   * @param {number} i - Index into the key list.
   * @returns {string|null} The key at that index, or null when out of range.
   * @pure
   */
  key(i) { return [...this.map.keys()][i] ?? null }
}

/** A BroadcastChannel that never delivers, so cross-window sync stays inert. */
class InertChannel {
  /**
   * @param {string} name - Channel name.
   * @returns {void}
   * @mutates Initialises the instance.
   */
  constructor(name) { this.name = name; this.onmessage = null }

  /** @returns {void} @sideEffect None — messages are intentionally dropped. */
  postMessage() {}

  /** @returns {void} @sideEffect None. */
  close() {}
}

/**
 * A Worker that never replies, so a scheduled sweep stays pending forever.
 *
 * The store spawns one of these to run the solver off the UI thread. Tests
 * cover the compute pipeline's bookkeeping — the debounce, the graph
 * signature, the supersede token — rather than the sweep itself, which is
 * tested directly against the engine. Dropping the message leaves the request
 * promise unresolved, which is inert: an unsettled promise schedules no work
 * and so cannot outlive the test that created it.
 */
class InertWorker {
  /**
   * @param {URL|string} url - Module URL of the worker script.
   * @returns {void}
   * @mutates Initialises the instance.
   */
  constructor(url) { this.url = url; this.onmessage = null }

  /** @returns {void} @sideEffect None — messages are intentionally dropped. */
  postMessage() {}

  /** @returns {void} @sideEffect None. */
  terminate() {}
}

/**
 * Install the shims on globalThis, replacing any already present.
 *
 * @returns {void}
 * @sideEffect Defines localStorage, window, document, navigator, BroadcastChannel, Worker and performance on the global object.
 */
export function installEnv() {
  const storage = new MemoryStorage()
  globalThis.localStorage = storage
  globalThis.sessionStorage = new MemoryStorage()
  globalThis.BroadcastChannel = InertChannel
  globalThis.Worker = InertWorker
  globalThis.navigator ??= { platform: 'Linux x86_64', userAgent: 'node' }
  globalThis.performance ??= { now: () => Date.now() }
  globalThis.window = globalThis
  globalThis.location = { pathname: '/', search: '', origin: 'http://localhost' }
  // React Flow injects a <style> element at import time, so createElement has
  // to return something append-able rather than a bare object.
  const el = () => ({
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    dataset: {},
    children: [],
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    appendChild(c) { this.children.push(c); return c },
    removeChild() {},
    insertBefore(c) { this.children.push(c); return c },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    closest: () => null,
    click() {},
    remove() {},
    get firstChild() { return this.children[0] ?? null },
    get sheet() { return { cssRules: [], insertRule() {} } },
  })
  const head = el()
  const body = el()
  globalThis.document = {
    createElement: el,
    createTextNode: () => el(),
    createElementNS: el,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    head,
    body,
    documentElement: el(),
    addEventListener() {},
    removeEventListener() {},
  }
  // Opening a panel window is a documented side effect, and the state change
  // beside it is testable — but only if the call does not throw first.
  globalThis.open ??= (url, name) => ({ url, name, focus() {}, close() {} })
  globalThis.addEventListener ??= () => {}
  globalThis.removeEventListener ??= () => {}
  globalThis.confirm ??= () => true
  globalThis.alert ??= () => {}
  globalThis.prompt ??= () => null
  globalThis.URL.createObjectURL ??= () => 'blob:test'
  globalThis.URL.revokeObjectURL ??= () => {}
}

installEnv()
