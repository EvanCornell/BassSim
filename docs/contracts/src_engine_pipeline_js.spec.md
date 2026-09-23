# Contract specification: `src/engine/pipeline.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

One simulation, from a saved project to results, for any engine.

The worker and the MCP server both call `simulateProject`, so a project
simulates identically in the browser and over the API. The stages are the
same whichever engine runs:

  migrate → resolve expressions → validate → engine → metrics

Validation errors stop the run; warnings travel with the results.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `ENGINES`

The engines `simulateProject` accepts.

Values: `spice`, `legacy`

### `DEFAULT_ENGINE`

The engine used when none is named.

Value: `"spice"`

## EXPORTED (1)

### `simulateProject(input, opts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { simulateProject } from '../../src/engine/pipeline.js'
- **Async:** returns a Promise

Simulate a saved project of any schema version.

**Parameters**

- `input` — `object` — A parsed `.acousim.json` project, any version.
- `opts` — `object` _(optional)_ — Options.
- `opts.engine` — `string` _(optional)_ — One of `ENGINES`; defaults to `DEFAULT_ENGINE`.

**Returns**

- `Promise<{results: object, metrics: object|null, warnings: Object<string, string[]>, netlist?: string}>` — The sweep, its metrics, the project's warnings keyed by node id, and — from the SPICE engine — the netlist it ran.

**Throws**

- `Error` — When the project cannot be simulated — unresolvable expressions, structural errors, or an engine that cannot represent it. Every reason is on `projectErrors`.

**Side effects**

- Runs an engine.

## UNREACHABLE (3)

### `projectError(reasons)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Build the error `simulateProject` throws for a project it cannot run.

**Parameters**

- `reasons` — `string[]` — Every problem found.

**Returns**

- `Error` — An error whose message joins them and whose `projectErrors` lists them.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `runLegacy(project)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run the legacy engine on a resolved, validated v3 project.

**Parameters**

- `project` — `object` — A resolved v3 project.

**Returns**

- `{results: object, metrics: object|null}` — The sweep and its metrics.

**Throws**

- `Error` — When the project uses anything the legacy engine cannot represent.

**Side effects**

- Runs the legacy solver.

### `runSpice(project, warnings)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Run the SPICE engine on a resolved, validated v3 project.

**Parameters**

- `project` — `object` — A resolved v3 project.
- `warnings` — `Object<string, string[]>` — The project's warnings, attached to the results.

**Returns**

- `Promise<{results: object, metrics: object|null, netlist: string}>` — The sweep, its metrics, and the netlist that produced it.

**Throws**

- `Error` — When the project uses something the compiler cannot build yet, or SPICE cannot solve it.

**Side effects**

- Runs ngspice.
