# Contract specification: `src/engine/project.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Project (.acousim.json) schema helpers shared by the app and the MCP server.
A project is plain JSON: { name, settings, nodes: [{id,type,position,params}],
edges: [{source,sourceHandle,target,targetHandle}] }.

## EXPORTED (1)

### `hydrateProject(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { hydrateProject } from '../../src/engine/project.js'

Turn a serialized project into the shape `runSimulation` expects.

Missing params are filled from `DEFAULT_PARAMS`, so a project that specifies
only what matters — which is how the MCP tools and hand-written JSON tend to
arrive — hydrates into a complete graph. This mirrors the app's own loader, so
a file behaves identically whether opened in the editor or posted to the API.

Structural problems are collected and reported together rather than thrown at
the first one, because a hand-edited file usually has more than one and fixing
them one round-trip at a time is miserable.

**Parameters**

- `proj` — `object` — A parsed `.acousim.json` project.
- `proj.nodes` — `Array<object>` _(optional)_ — Serialized nodes, each `{id, type, position, params}`.
- `proj.edges` — `Array<object>` _(optional)_ — Serialized edges. Missing ids are assigned positionally.
- `proj.settings` — `object` _(optional)_ — Sweep settings, merged over `DEFAULT_SETTINGS`.

**Returns**

- `{nodes: Array<object>, edges: Array<object>, settings: object}` — The hydrated graph.

**Throws**

- `Error` — When a node lacks an id, a node has an unknown type, or an edge references a missing node. The full list is on the error's `projectErrors` property as well as its message.

**Postconditions (must hold on return)**

- proj is not modified — nodes and params are copied, not aliased.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
