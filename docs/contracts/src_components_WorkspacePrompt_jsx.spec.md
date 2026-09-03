# Contract specification: `src/components/WorkspacePrompt.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The question asked before anything else: where does this workspace live?

Only one answer exists today, which makes the prompt look redundant until
you notice what it is really for. Browser storage is not a filing cabinet —
clearing site data takes it, a private window never had it, and an eviction
under storage pressure happens without asking. A user who learns that after
building six enclosures has learned it too late. So it is said once, at the
front, while there is nothing to lose.

The other half of the reason is that this is where the choice will go when
there is one. A folder on the user's own computer is the obvious next
answer, and it is listed here, visibly not yet available, so the shape of
the decision is familiar before it has consequences.

## EXPORTED (1)

### `WorkspacePrompt()`

- **Reachability:** EXPORTED
- **Obtain via:** import { WorkspacePrompt } from '../../src/components/WorkspacePrompt.jsx'

The startup workspace-location prompt.

Skipping and choosing browser storage do the same thing, deliberately: the
prompt is informative rather than gating, and a user who wants to get on
with it should not be made to read first. Both are recorded, so the question
is asked once rather than on every visit.

**Returns**

- `React.ReactElement|null` — The modal, or `null` once the question has been answered.

**Side effects**

- Subscribes to the store; the buttons write LocalStorage.

## UNREACHABLE (1)

### `WorkspacePrompt > choose()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record the choice and dismiss the prompt.

**Returns**

- `void`

**Side effects**

- Writes store state and LocalStorage.
