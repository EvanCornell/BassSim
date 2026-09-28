# Contract specification: `src/theme.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Light and dark appearance.

A preference of the person, not of the project, so it lives in
LocalStorage. `system` follows the operating system's setting, which the
stylesheet reads with `prefers-color-scheme`; `dark` and `light` pin the
page by setting `data-theme` on the root element, which the stylesheet's
token blocks key on. Every colour in the app — charts included — is a
token, so switching needs no re-render.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `THEMES`

The choices, in the order Settings offers them.

An array of 3 entries.

## EXPORTED (3)

### `loadTheme()`

- **Reachability:** EXPORTED
- **Obtain via:** import { loadTheme } from '../../src/theme.js'

The appearance this browser last chose.

**Returns**

- `string` — `system`, `dark` or `light`; `system` when nothing valid is stored or storage is unavailable.

**Reads external mutable state**

- LocalStorage.

### `applyTheme(theme, root)`

- **Reachability:** EXPORTED
- **Obtain via:** import { applyTheme } from '../../src/theme.js'

Show the page in an appearance.

**Parameters**

- `theme` — `string` — `system`, `dark` or `light`.
- `root` — `object` _(optional)_ — The element carrying the theme; the document's root by default.

**Returns**

- `void`

**Side effects**

- Sets or removes `data-theme` on the root element.

### `saveTheme(theme)`

- **Reachability:** EXPORTED
- **Obtain via:** import { saveTheme } from '../../src/theme.js'

Remember and show an appearance.

**Parameters**

- `theme` — `string` — `system`, `dark` or `light`.

**Returns**

- `void`

**Side effects**

- Writes LocalStorage and applies the theme to the page.
