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

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `PANEL_META`

Metadata for every panel the workspace knows how to render.

Doubles as the panel registry: `layout.sanitize` treats an id absent from
this map as unknown and drops it, which is what keeps an old saved layout
from referencing a panel that no longer exists.

Keys: `palette`, `canvas`, `params`, `nllab`, `spl`, `zin`, `exc`, `vel`, `int`, `pow`, `eff`, `pe`, `ph`

- `palette` holds: `title`, `group`, `closable`, `dock`
- `canvas` holds: `title`, `group`, `closable`, `dock`
- `params` holds: `title`, `group`, `closable`, `dock`
- `nllab` holds: `title`, `group`, `closable`, `dock`, `requires`
- `spl` holds: `title`, `group`
- `zin` holds: `title`, `group`
- `exc` holds: `title`, `group`
- `vel` holds: `title`, `group`
- `int` holds: `title`, `group`
- `pow` holds: `title`, `group`
- `eff` holds: `title`, `group`
- `pe` holds: `title`, `group`
- `ph` holds: `title`, `group`

### `PANEL_IDS`

Every known panel id. The allow-list `layout.sanitize` filters a saved layout against.

### `CHART_IDS`

Panel ids for the plots, listed under View ▸ Charts.

### `MAIN_IDS`

Panel ids for the non-chart panels, listed directly under View.

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
