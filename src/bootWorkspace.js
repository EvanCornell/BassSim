// The workspace as the browser last stored it, read before the app starts.
//
// The store builds its first state synchronously when its module loads, and
// IndexedDB can only be read asynchronously, so main.jsx reads it here first
// and the store picks it up.

import { readStoredWorkspace } from './utils/folder'

let preloaded = null

/**
 * Read the stored workspace, before the store's module is loaded.
 *
 * @returns {Promise<void>} Resolves once read, or once reading failed.
 * @sideEffect Reads IndexedDB; keeps the text for `preloadedWorkspace`.
 */
export async function preloadWorkspace() {
  preloaded = await readStoredWorkspace()
}

/**
 * The workspace JSON read by `preloadWorkspace`.
 *
 * @returns {string|null} The text, or `null` when none was stored.
 * @reads the module's preloaded text.
 */
export function preloadedWorkspace() {
  return preloaded
}
