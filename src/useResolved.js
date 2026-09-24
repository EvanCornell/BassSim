// Hooks that give components numbers for fields that may hold expressions.
//
// A numeric node field can hold an expression over the project's named
// params — `"Vb / 2"` — so anything that computes with a field, a canvas
// readout or a derived figure in a form, reads it through here.

import { useMemo } from 'react'
import { useStore } from './store'
import { evaluateParams, resolveNodeParams } from './schema/params'

/**
 * The project's named params, resolved.
 *
 * @returns {{values: Object<string, number>, errors: string[]}} Values by name, and any problems.
 * @sideEffect Subscribes to the store.
 */
export function useParamValues() {
  const params = useStore((s) => s.projectExtras?.params)
  return useMemo(() => evaluateParams(params || []), [params])
}

/**
 * One node's params with every expression replaced by its value.
 *
 * @param {string} id - Node id.
 * @param {string} type - Node type.
 * @param {object} params - The node's stored params.
 * @returns {object} The params, numbers throughout; `NaN` where an expression does not resolve.
 * @sideEffect Subscribes to the store.
 */
export function useResolvedParams(id, type, params) {
  const { values } = useParamValues()
  return useMemo(() => resolveNodeParams({ id, type, params }, values), [id, type, params, values])
}
