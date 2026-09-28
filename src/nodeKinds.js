// The element types a user can drop onto the canvas.
//
// Plain data, no React, so the floating palette on the canvas, the canvas's
// right-click Add Node submenu and anything added later all read one list. Two
// copies of it would drift the moment an element type is added.

/**
 * The draggable node types.
 *
 * `color` is the element's theme colour — the only thing the element dock
 * shows besides the name. `short` is the name the dock uses, where the full
 * one would crowd it. `desc` is the long form, kept for tooltips and for
 * anywhere a fuller explanation is wanted; the dock deliberately does not
 * render it.
 */
export const NODE_KINDS = [
  { type: 'driver', color: 'var(--s1)', name: 'Driver', desc: 'Loudspeaker motor system with T/S parameters, amplifier coupling and array options.' },
  { type: 'chamber', color: 'var(--s2)', name: 'Chamber', desc: 'Enclosed air volume modeled as a transmission line — standing waves included.' },
  { type: 'waveguide', color: 'var(--s3)', name: 'Waveguide Segment', short: 'Waveguide', desc: 'Duct, port or horn segment. Straight port when S1 = S2. Unconnected mouth = open end; cap with a Rigid wall Radiation node to close it.' },
  { type: 'pr', color: 'var(--s4)', name: 'Passive Radiator', short: 'Passive radiator', desc: 'Drone cone: mass-loaded membrane, tunable with added mass.' },
  { type: 'radiation', color: 'var(--s5)', name: 'Radiation Termination', short: 'Radiation', desc: 'What an opening radiates into: 4π/2π/π/π⁄2 space, rigid wall, or anechoic.' },
]

/**
 * The MIME-ish drag type marking a drag as coming from the node palette.
 *
 * Named rather than inferred so the canvas can tell a palette drag from a
 * panel-tab drag, a file drag, or anything the OS hands it.
 */
export const NODE_DRAG_TYPE = 'application/speakerspice-node'
