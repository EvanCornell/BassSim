// The questions asked around connecting a workspace folder.
//
// Three places offer the folder — the startup prompt, the explorer's footer
// and the File menu — and all three have to ask the same two questions in the
// same words. The store deliberately does not ask them itself: it takes the
// answer as an argument so that "what does connecting a folder do" stays
// answerable without a browser. This is the one place that supplies the
// browser's answer.

import { useStore } from '../store'

/**
 * Connect the workspace to a folder the user picks, confirming an overwrite.
 *
 * The only question that needs asking is the one where something is lost: a
 * folder that already holds a workspace opens in place of the current one.
 * Everything else — an empty folder, a dismissed picker — needs no dialog.
 *
 * @returns {Promise<{ok: boolean, adopted?: boolean, cancelled?: boolean, error?: string}>} What happened, for the caller to report.
 * @sideEffect Shows a folder picker and possibly a confirmation, writes to the user's filesystem, and writes store state.
 */
export function connectFolderWithPrompt() {
  return useStore.getState().connectWorkspaceFolder(
    /**
     * Confirm opening a workspace the chosen folder already holds.
     *
     * @param {{name: string, files: number}} info - The folder's name and how many files are in it.
     * @returns {boolean} True to open it in place of the current workspace.
     * @sideEffect Shows a confirmation dialog.
     */
    (info) => confirm(`“${info.name}” already holds a workspace — ${info.files} file${info.files === 1 ? '' : 's'}. `
      + 'Open it? The workspace currently in this browser is replaced.'),
  )
}

/**
 * Stop keeping the workspace in a folder, after saying what that means.
 *
 * Worth a confirmation despite losing nothing, because the wording is the only
 * thing that makes that clear: a user clicking "Disconnect" has every reason
 * to wonder whether their files are about to be deleted.
 *
 * @returns {Promise<boolean>} True when the folder was disconnected.
 * @sideEffect Shows a confirmation, and on agreement writes IndexedDB and store state.
 */
export async function disconnectFolderWithPrompt() {
  const name = useStore.getState().folderName
  if (!confirm(`Stop saving to “${name}”? The folder keeps everything already in it, and the workspace stays in this browser.`)) {
    return false
  }
  await useStore.getState().disconnectWorkspaceFolder()
  return true
}
