# Contract specification: `src/components/dock/panels.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Panel registry — metadata from src/panelMeta.js paired with its component.

Adding a panel to AcouSim means one entry in PANEL_META plus one line here:
the dock layout, the View menu and the saved-layout sanitizer all read from
those, so nothing else needs to learn about it. Chart panels are generated
from the chart registry instead of listed one by one.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `PANELS`

The panel registry: each panel's metadata paired with its component.

Adding a panel means one entry in `PANEL_META` plus one line in
`COMPONENTS` — the dock, the View menu and the saved-layout sanitizer all
read from these, so nothing else needs to learn about it.

## UNREACHABLE (1)

### `CanvasPanel()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Node Editor panel: the canvas with the palette and popup layered over it.

Both overlays live here rather than at app level so they are clipped to the
canvas and travel with it when the panel is popped out — a popped-out node
editor that could not add nodes would be a strange thing to hand someone.

**Returns**

- `React.ReactElement` — The canvas panel.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
