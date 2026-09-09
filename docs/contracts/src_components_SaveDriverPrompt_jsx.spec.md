# Contract specification: `src/components/SaveDriverPrompt.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `SaveDriverPrompt()`

- **Reachability:** EXPORTED
- **Obtain via:** import { SaveDriverPrompt } from '../../src/components/SaveDriverPrompt.jsx'

Ask what to call a driver before filing it in the workspace library.

A node is named for its place in a design — "left woofer", "u12" — and a
library entry is named for the driver, so the two should not be the same
string by default. The node's label is offered as a starting point and
nothing more.

Saving under a name the library already holds replaces that entry, which
is what re-saving a driver after adjusting it means; the button says so
rather than leaving the user to find two entries afterwards.

**Returns**

- `React.ReactElement|null` — The modal, or `null` when no driver is being saved.

**Side effects**

- Subscribes to the store.

## UNREACHABLE (1)

### `SaveDriverPrompt > save()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

File the driver under the typed name and close.

**Returns**

- `void`

**Side effects**

- Writes the workspace and closes the modal. Does nothing for a blank name.
