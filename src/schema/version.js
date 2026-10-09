// Project file format, version 3: the defaults every loader fills from.
//
// A v3 project is plain JSON:
//
//   { schemaVersion, app, name, modified,
//     air, params, nodes, edges, wiring, analyses, probes, components, display }
//
// `nodes` and `edges` are the acoustic graph. `wiring` holds the amplifier
// channels that drive it. `analyses` says what to simulate, `probes` what to
// measure beyond the automatic outputs, and `display` how to show it. Numeric
// fields anywhere may hold an expression over the named `params` instead of a
// number — see `src/schema/params.js`.
//
// Units in the file are display units (cm, L, cm², g, mm/N, mH); conversion to
// SI happens only when a netlist is built.

/**
 * Version of the `.speakerspice.json` project format this build reads and writes.
 *
 * v2 changed the meaning of `ecFactor`. v3 splits `settings` into `analyses`,
 * `wiring` and `display`, replaces per-element `Q` with physical loss
 * parameters, gives passive radiators two faces, gives waveguides a solid
 * angle per end, and adds taps, named parameters, probes and components.
 * `migrateProject` carries any v1 or v2 file forward in one step.
 */
export const SCHEMA_VERSION = 3

/**
 * Default params for each node type, in display units.
 *
 * Doubles as the node-type registry: a type absent from this map is unknown,
 * and every saved node is merged over its entry so a file written by an older
 * build gains any parameter added since. A field whose default is a number is
 * numeric, which is what decides where an expression may stand in for a value.
 *
 * `throatK`/`mouthK` are a waveguide end's flow loss coefficient, used only
 * by nonlinear time-domain runs: about 1 for a sharp edge, 0.2 for a generous
 * radius. `leakQL: null` is a sealed chamber. `dvc: null` is a single voice coil;
 * `dvc: {coils: 'series'|'parallel'|'one'}` a dual one, whose catalogue
 * figures are always taken as both coils in series. `loss` scales a waveguide's derived wall
 * loss — 1 is the physical estimate, 0 is lossless.
 */
export const DEFAULT_PARAMS = {
  driver: {
    Fs: 30, Qts: 0.45, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150,
    Cms: 0.19, Sd: 480, Le: 1.5, LeExp: 1, Xmax: 15, Rms: 4,
    count: 1, wiring: 'single', dvc: null, label: 'Driver',
  },
  chamber: {
    volume: 30, length: 40, shape: 'rectangular', stuffing: 0,
    leakQL: null, leakHz: 30, taps: [], label: 'Chamber',
  },
  waveguide: {
    S1: 80, S2: 80, length: 30, flare: 'conical', ecFactor: 1,
    throatSpace: 'half', mouthSpace: 'half', loss: 1, throatK: 0.5, mouthK: 0.5, taps: [], label: 'Port',
  },
  pr: { Mmd: 85, Cms: 0.35, Rms: 3, Sd: 480, addedMass: 0, count: 1, label: 'Passive Radiator' },
  radiation: { space: 'half', label: 'Radiation' },
}

/**
 * The handles each node type exposes, taps aside.
 *
 * Connections carry no direction, so these are simply the names an edge may
 * use. A waveguide or chamber also exposes `tap:<id>` for each entry in its
 * `taps` list.
 */
export const NODE_HANDLES = {
  driver: ['front', 'rear'],
  chamber: ['in', 'out'],
  waveguide: ['throat', 'mouth'],
  pr: ['front', 'rear'],
  radiation: ['in'],
}

/**
 * The analysis a new project runs: one frequency sweep.
 *
 * `masking` swaps every chamber's transmission line for a lumped volume.
 */
export const DEFAULT_ANALYSIS = {
  id: 'sweep', type: 'ac', fmin: 10, fmax: 1000, npts: 512, masking: false,
}

/**
 * The amplifier channel a new project drives its drivers with.
 *
 * `volts` is the channel's output at master 0 dB — its gain. `load: null`
 * means the default wiring, every driver node in parallel, which is what
 * keeps a newly added driver driven without anyone editing a tree.
 */
export const DEFAULT_CHANNEL = {
  id: 'ch1', label: 'Amp', volts: 2.83, outputOhms: 0,
  dsp: { polarity: 1, delayMs: 0, filters: [] },
  load: null,
}

/**
 * Default wiring: a master level and one channel.
 */
export const DEFAULT_WIRING = { masterDb: 0, channels: [DEFAULT_CHANNEL] }

/**
 * Default display preferences — nothing here changes a simulation.
 *
 * `nominalOhms` is the impedance the drive-level control uses to show watts
 * alongside volts, until each channel derives its load from its wiring.
 */
export const DEFAULT_DISPLAY = {
  vThreshold: 17, unwrapPhase: true, delayOffset: 0, nominalOhms: 4,
}

/**
 * What a probe can measure: pressure (shown as SPL), volume flow, or particle
 * velocity (flow over the local area).
 */
export const PROBE_KINDS = ['pressure', 'flow', 'velocity']

/**
 * Default air: 20 °C at sea level. Reserved — not yet read by any engine.
 */
export const DEFAULT_AIR = { temperatureC: 20, altitudeM: 0 }
