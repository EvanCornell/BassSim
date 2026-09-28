// Data saved under the app's former name, AcouSim, carried over to SpeakerSpice.
//
// Everything that knows the old name is here, so a build that no longer needs
// to read it can drop this module and the few calls into it.

/** The prefix browser-storage keys used to carry. */
const OLD_PREFIX = 'acousim:'

/** The prefix they carry now. */
const NEW_PREFIX = 'speakerspice:'

/** The system folder's former name inside a workspace. */
export const LEGACY_SYSTEM_FOLDER = '.acousim'

/** A project file's former extension inside a workspace. */
export const LEGACY_PROJECT_EXT = '.acousim'

/** The IndexedDB database that used to hold a connected folder's handle. */
export const LEGACY_DB_NAME = 'acousim'

/**
 * Move every browser-storage key from the old prefix to the new one.
 *
 * A key already present under the new name is kept, and the old one dropped.
 * Each value is removed before it is written again, so a workspace near the
 * storage quota is never held twice; if the write fails the old key is put
 * back, and nothing is lost.
 *
 * @param {Storage} [storage] - The storage; `localStorage` by default.
 * @returns {number} How many keys were moved.
 * @sideEffect Rewrites keys in the storage.
 */
export function migrateStorage(storage = globalThis.localStorage) {
  if (!storage) return 0
  let moved = 0
  try {
    const keys = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && k.startsWith(OLD_PREFIX)) keys.push(k)
    }
    for (const k of keys) {
      const target = NEW_PREFIX + k.slice(OLD_PREFIX.length)
      const value = storage.getItem(k)
      storage.removeItem(k)
      if (storage.getItem(target) != null) continue
      try {
        storage.setItem(target, value)
        moved++
      } catch {
        try { storage.setItem(k, value) } catch { /* nothing more to try */ }
      }
    }
  } catch { /* storage unavailable */ }
  return moved
}

/**
 * A workspace path under the current names.
 *
 * The system folder and anything in it move to the new folder name; a
 * project file takes the new extension. Every other path is unchanged.
 *
 * @param {string} path - A workspace path.
 * @param {string} systemFolder - The system folder's current name.
 * @param {string} projectExt - A project file's current extension.
 * @returns {string} The path under the current names.
 * @pure
 */
export function modernPath(path, systemFolder, projectExt) {
  if (path === LEGACY_SYSTEM_FOLDER) return systemFolder
  if (path.startsWith(`${LEGACY_SYSTEM_FOLDER}/`)) return systemFolder + path.slice(LEGACY_SYSTEM_FOLDER.length)
  if (path.endsWith(LEGACY_PROJECT_EXT)) return path.slice(0, -LEGACY_PROJECT_EXT.length) + projectExt
  return path
}

/**
 * A filename without the project or workspace suffix it had under the app's former name.
 *
 * @param {string} name - A filename, e.g. `box.acousim.json` or `workspace.acousim`.
 * @returns {string} The name without that suffix; unchanged when it has none.
 * @pure
 */
export function stripLegacySuffix(name) {
  return name.replace(/\.acousim(\.json)?$/i, '')
}
