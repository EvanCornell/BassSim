# Contract specification: `src/engine/pipeline.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

One simulation, from a saved project to results.

The worker and the MCP server both call `simulateProject`, so a project
simulates identically in the browser and over the API. The stages are:

  migrate → resolve expressions → validate → SPICE → metrics

Validation errors stop the run; warnings travel with the results.

## EXPORTED (2)

### `prepareProject(input)`

- **Reachability:** EXPORTED
- **Obtain via:** import { prepareProject } from '../../src/engine/pipeline.js'

Carry a saved project to a resolved, validated v3 project.

**Parameters**

- `input` — `object` — A parsed `.speakerspice.json` project, any version.

**Returns**

- `{project: object, warnings: Object<string, string[]>}` — The project with every expression resolved, and its warnings keyed by node id.

**Throws**

- `Error` — When expressions do not resolve or the project cannot be simulated; every reason is on `projectErrors`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `simulateProject(input)`

- **Reachability:** EXPORTED
- **Obtain via:** import { simulateProject } from '../../src/engine/pipeline.js'
- **Async:** returns a Promise

Simulate a saved project of any schema version.

**Parameters**

- `input` — `object` — A parsed `.speakerspice.json` project, any version.

**Returns**

- `Promise<{results: object, metrics: object|null, warnings: Object<string, string[]>, netlist: string}>` — The sweep, its metrics, the project's warnings keyed by node id, and the netlist it ran.

**Throws**

- `Error` — When the project cannot be simulated — unresolvable expressions, structural errors, or something SPICE cannot build or solve. Every reason is on `projectErrors`.

**Side effects**

- Runs ngspice.

## UNREACHABLE (2)

### `projectError(reasons)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Build the error `simulateProject` throws for a project it cannot run.

**Parameters**

- `reasons` — `string[]` — Every problem found.

**Returns**

- `Error` — An error whose message joins them and whose `projectErrors` lists them.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

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
