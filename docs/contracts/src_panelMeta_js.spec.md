# Contract specification: `src/panelMeta.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Panel metadata — plain data, no React. Kept separate from panels.jsx so the
store can read it (titles, dock hints, which panels exist for sanitizing a
saved layout) without importing components that import the store back.

  title    label on the tab and in the View menu
  group    'main' panels are listed directly under View; 'charts' go into
           the View ▸ Charts submenu so the menu stays short
  closable false pins the panel open — the canvas is the workspace itself
  dock     where View ▸ puts the panel when it isn't already visible
  requires a settings flag that must be truthy for the panel to be offered

## EXPORTED (1)

### `panelTitle(id)`

- **Reachability:** EXPORTED
- **Obtain via:** import { panelTitle } from '../../src/panelMeta.js'

Display title for a panel.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `string` — The registered title, falling back to the raw id so an unknown panel still labels its tab with something.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
