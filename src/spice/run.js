// Run netlists through ngspice (WebAssembly), the same way in a browser
// worker and in Node.
//
// The engine is loaded on first use — it is several megabytes — and kept for
// the life of the process. ngspice holds one circuit at a time, so runs are
// queued rather than interleaved.

let enginePromise = null
let queue = Promise.resolve()

/**
 * The shared ngspice instance, started on first call.
 *
 * @returns {Promise<object>} The started `Simulation`.
 * @sideEffect Loads the WebAssembly engine the first time.
 */
function engine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const { Simulation } = await import('eecircuit-engine')
      const sim = new Simulation()
      await sim.start()
      return sim
    })()
    enginePromise.catch(() => { enginePromise = null })
  }
  return enginePromise
}

/**
 * Whether an ngspice message line means the run failed.
 *
 * Notes and warnings that the engine recovered from are not failures.
 *
 * @param {string} line - One message line.
 * @returns {boolean} True for an error.
 * @pure
 */
export function isFatal(line) {
  return /error|singular matrix|not parsed|failed/i.test(line) && !/^\s*note:/i.test(line)
}

/**
 * Run one AC netlist and return its complex vectors.
 *
 * @param {string} netlist - A complete netlist ending in `.end`.
 * @returns {Promise<{freqs: number[], vec: Function, names: string[]}>} The frequencies; `vec(name)` → `{re, im}` arrays for a saved vector (lowercase name, as in `.save`); and every name returned.
 * @throws {Error} When ngspice reports an error; the message lines are on `spiceErrors`.
 * @sideEffect Runs the engine; queued behind any run already in progress.
 */
export function runNetlist(netlist) {
  const job = queue.then(async () => {
    const sim = await engine()
    sim.setNetList(netlist)
    const res = await sim.runSim()
    const messages = sim.getError() || []
    const fatal = messages.filter(isFatal)
    if (fatal.length || !res || res.numPoints < 1 || res.dataType !== 'complex') {
      const err = new Error(`SPICE could not solve this circuit: ${(fatal[0] || messages[0] || 'no result').trim()}`)
      err.spiceErrors = messages
      throw err
    }
    const vectors = new Map()
    let freqs = []
    for (const d of res.data) {
      if (d.type === 'frequency') { freqs = d.values.map((v) => v.real); continue }
      vectors.set(d.name.toLowerCase(), {
        re: Float64Array.from(d.values, (v) => v.real),
        im: Float64Array.from(d.values, (v) => v.img),
      })
    }
    return {
      freqs,
      names: [...vectors.keys()],
      /**
       * One saved vector.
       *
       * @param {string} name - Lowercase vector name, e.g. `i(v3)`.
       * @returns {{re: Float64Array, im: Float64Array}} Its complex values.
       * @throws {Error} When the vector was not returned.
       * @reads the parsed result.
       */
      vec: (name) => {
        const v = vectors.get(name.toLowerCase())
        if (!v) throw new Error(`SPICE result has no vector ${name}`)
        return v
      },
    }
  })
  queue = job.catch(() => {})
  return job
}
