# Contract specification: `src/utils/folderPrompts.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The questions asked around connecting a workspace folder.

Three places offer the folder — the startup prompt, the explorer's footer
and the File menu — and all three have to ask the same two questions in the
same words. The store deliberately does not ask them itself: it takes the
answer as an argument so that "what does connecting a folder do" stays
answerable without a browser. This is the one place that supplies the
browser's answer.

## EXPORTED (2)

### `connectFolderWithPrompt()`

- **Reachability:** EXPORTED
- **Obtain via:** import { connectFolderWithPrompt } from '../../src/utils/folderPrompts.js'

Connect the workspace to a folder the user picks, confirming an overwrite.

The only question that needs asking is the one where something is lost: a
folder that already holds a workspace opens in place of the current one.
Everything else — an empty folder, a dismissed picker — needs no dialog.

**Returns**

- `Promise<{ok: boolean, adopted?: boolean, cancelled?: boolean, error?: string}>` — What happened, for the caller to report.

**Side effects**

- Shows a folder picker and possibly a confirmation, writes to the user's filesystem, and writes store state.

### `disconnectFolderWithPrompt()`

- **Reachability:** EXPORTED
- **Obtain via:** import { disconnectFolderWithPrompt } from '../../src/utils/folderPrompts.js'
- **Async:** returns a Promise

Stop keeping the workspace in a folder, after saying what that means.

Worth a confirmation despite losing nothing, because the wording is the only
thing that makes that clear: a user clicking "Disconnect" has every reason
to wonder whether their files are about to be deleted.

**Returns**

- `Promise<boolean>` — True when the folder was disconnected.

**Side effects**

- Shows a confirmation, and on agreement writes IndexedDB and store state.
