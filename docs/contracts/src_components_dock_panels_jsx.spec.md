# Contract specification: `src/components/dock/panels.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Panel registry — metadata from src/panelMeta.js paired with its component.

Adding a panel to AcouSim means one entry in PANEL_META plus one line here:
the dock layout, the View menu and the saved-layout sanitizer all read from
those, so nothing else needs to learn about it. Chart panels are generated
from the chart registry instead of listed one by one.

## UNREACHABLE (1)

### `CanvasPanel()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Node Editor panel: the canvas with the velocity popup layered over it.

The popup lives here rather than at app level so it is clipped to the
canvas and travels with it when the panel is popped out.

**Returns**

- `React.ReactElement` — The canvas panel.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
