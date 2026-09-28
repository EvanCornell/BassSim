// Light and dark appearance.
//
// A preference of the person, not of the project, so it lives in
// LocalStorage. `system` follows the operating system's setting, which the
// stylesheet reads with `prefers-color-scheme`; `dark` and `light` pin the
// page by setting `data-theme` on the root element, which the stylesheet's
// token blocks key on. Every colour in the app — charts included — is a
// token, so switching needs no re-render.

/** The choices, in the order Settings offers them. */
export const THEMES = [
  ['system', 'Match the system'],
  ['dark', 'Dark'],
  ['light', 'Light'],
]

const THEME_KEY = 'speakerspice:theme'

/**
 * The appearance this browser last chose.
 *
 * @returns {string} `system`, `dark` or `light`; `system` when nothing valid is stored or storage is unavailable.
 * @reads LocalStorage.
 */
export function loadTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (THEMES.some(([k]) => k === v)) return v
  } catch { /* storage unavailable */ }
  return 'system'
}

/**
 * Show the page in an appearance.
 *
 * @param {string} theme - `system`, `dark` or `light`.
 * @param {object} [root] - The element carrying the theme; the document's root by default.
 * @returns {void}
 * @sideEffect Sets or removes `data-theme` on the root element.
 */
export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return
  if (theme === 'dark' || theme === 'light') root.dataset.theme = theme
  else delete root.dataset.theme
}

/**
 * Remember and show an appearance.
 *
 * @param {string} theme - `system`, `dark` or `light`.
 * @returns {void}
 * @sideEffect Writes LocalStorage and applies the theme to the page.
 */
export function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* storage unavailable */ }
  applyTheme(theme)
}
