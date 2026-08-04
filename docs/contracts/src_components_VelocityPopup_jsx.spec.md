# Contract specification: `src/components/VelocityPopup.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `VelocityPopup()`

- **Reachability:** EXPORTED
- **Obtain via:** import { VelocityPopup } from '../../src/components/VelocityPopup.jsx'

Floating chart of air velocity in one waveguide.

Opened by clicking a waveguide node's on-canvas velocity readout. A
reference line marks the turbulence threshold, which is the number that
actually matters — a port above roughly 17 m/s chuffs audibly regardless
of how good the response looks.

**Returns**

- `React.ReactElement|null` — The popup, or `null` when no waveguide is selected for it.

**Side effects**

- Subscribes to the store.
