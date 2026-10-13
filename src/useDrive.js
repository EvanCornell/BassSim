// A channel's drive — voltage, impedance and power — as a React hook.

import { useMemo } from 'react'
import { useStore } from './store'
import { channelDrive } from './schema/extras'

/**
 * A channel's drive, kept current with the wiring, the drivers and the named params.
 *
 * @param {string} [id] - Channel id; the toolbar channel when omitted.
 * @returns {{channel: object|undefined, volts: number, ohms: number, auto: boolean, watts: number, master: number}} See `channelDrive`.
 * @sideEffect Subscribes to the store.
 */
export function useDrive(id) {
  const wiring = useStore((s) => s.projectExtras.wiring)
  const nodes = useStore((s) => s.nodes)
  const params = useStore((s) => s.projectExtras.params)
  return useMemo(() => channelDrive(wiring, nodes, params, id), [wiring, nodes, params, id])
}
