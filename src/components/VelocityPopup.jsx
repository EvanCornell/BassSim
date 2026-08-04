import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { useStore } from '../store'

/**
 * Floating chart of air velocity in one waveguide.
 *
 * Opened by clicking a waveguide node's on-canvas velocity readout. A
 * reference line marks the turbulence threshold, which is the number that
 * actually matters — a port above roughly 17 m/s chuffs audibly regardless
 * of how good the response looks.
 *
 * @returns {React.ReactElement|null} The popup, or `null` when no waveguide is selected for it.
 * @sideEffect Subscribes to the store.
 */
export default function VelocityPopup() {
  const nodeId = useStore((s) => s.velocityPopupNodeId)
  const setVelocityPopup = useStore((s) => s.setVelocityPopup)
  const node = useStore((s) => s.nodes.find((n) => n.id === s.velocityPopupNodeId))
  const results = useStore((s) => s.results)
  const vThreshold = useStore((s) => s.settings.vThreshold)
  const settings = useStore((s) => s.settings)

  const data = useMemo(() => {
    const arr = results?.velocity?.[nodeId]
    if (!arr) return []
    return results.freqs.map((f, i) => ({ f, v: arr[i] }))
  }, [results, nodeId])

  if (!nodeId || !node) return null
  const ticks = [10, 20, 30, 50, 100, 200, 500, 1000].filter((t) => t >= settings.fmin && t <= settings.fmax)

  return (
    <div className="vel-popup">
      <div className="vp-head">
        <b>Port velocity — {node.data.params.label || 'Waveguide'}</b>
        <button onClick={() => setVelocityPopup(null)}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#2d3646" strokeDasharray="2 4" />
            <XAxis dataKey="f" type="number" scale="log" domain={[settings.fmin, settings.fmax]}
              ticks={ticks} tick={{ fill: '#9aa7b8', fontSize: 10 }} stroke="#2d3646" />
            <YAxis tick={{ fill: '#9aa7b8', fontSize: 10 }} stroke="#2d3646" width={40}
              label={{ value: 'm/s (peak)', angle: -90, position: 'insideLeft', fill: '#6b7687', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #2d3646', borderRadius: 6 }}
              labelFormatter={(v) => `${v.toFixed(1)} Hz`} formatter={(v) => [`${v.toFixed(2)} m/s`, 'velocity']}
              isAnimationActive={false} />
            <ReferenceLine y={vThreshold} stroke="#e66767" strokeDasharray="6 4"
              label={{ value: `turbulence ~${vThreshold} m/s`, fill: '#e66767', fontSize: 10, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="v" stroke="#c98500" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
