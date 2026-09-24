// Run netlists through ngspice (WebAssembly), the same way in a browser
// worker and in Node.
//
// The engine is loaded on first use — it is several megabytes — and kept for
// the life of the process. ngspice holds one circuit at a time, so runs are
// queued rather than interleaved.
//
// Where several engines are available — a pool of browser workers, one per
// processor thread — a worker coordinating a job swaps in a runner that
// sends each netlist to the pool (see `setRunner`), and says how many runs
// may go at once (`setThreads`). The analyses start independent runs
// together and the pool spreads them; here, in one process, they queue.

let enginePromise = null
let queue = Promise.resolve()
let runner = null
let threads = 1

/**
 * Send every run through another runner, or back to this process's engine.
 *
 * @param {Function|null} fn - `(netlist, kind) → Promise<{scale, vectors}>`, as `runLocal`; `null` for the local engine.
 * @returns {void}
 * @mutates the module's runner.
 */
export function setRunner(fn) {
  runner = fn
}

/**
 * Say how many runs can proceed at once.
 *
 * @param {number} n - Engines available; at least 1.
 * @returns {void}
 * @mutates the module's thread count.
 */
export function setThreads(n) {
  threads = Math.max(1, Math.floor(Number(n) || 1))
}

/**
 * How many runs can proceed at once — the analyses size their batches by it.
 *
 * @returns {number} At least 1.
 * @reads the module's thread count.
 */
export function threadCount() {
  return threads
}

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
  return /error|singular matrix|not parsed|failed|timestep too small|aborted/i.test(line) && !/^\s*note:/i.test(line)
}

/**
 * Run one netlist in this process's engine and collect its vectors, queued behind any run in progress.
 *
 * @param {string} netlist - A complete netlist ending in `.end`.
 * @param {'complex'|'real'} kind - The result type the analysis must produce: `complex` for `.ac`, `real` for `.tran`.
 * @returns {Promise<{scale: number[], vectors: Map<string, object>}>} The sweep variable (frequency or time) and every other vector: `{re, im}` for complex, a Float64Array for real.
 * @throws {Error} When ngspice reports an error or returns the wrong kind of result; the message lines are on `spiceErrors`.
 * @sideEffect Runs the engine. A run that throws inside the engine drops it, so the next run starts a fresh one.
 */
export function runLocal(netlist, kind) {
  const job = queue.then(async () => {
    const sim = await engine()
    let res
    try {
      sim.setNetList(netlist)
      res = await sim.runSim()
    } catch (err) {
      enginePromise = null
      throw new Error(`SPICE stopped: ${err.message || err}`)
    }
    const messages = sim.getError() || []
    const fatal = messages.filter(isFatal)
    if (fatal.length || !res || res.numPoints < 1 || res.dataType !== kind) {
      const err = new Error(`SPICE could not solve this circuit: ${(fatal[0] || messages[0] || 'no result').trim()}`)
      err.spiceErrors = messages
      throw err
    }
    const vectors = new Map()
    let scale = []
    for (const d of res.data) {
      if (d.type === 'frequency' || d.type === 'time') {
        scale = d.values.map((v) => (typeof v === 'number' ? v : v.real))
        continue
      }
      vectors.set(d.name.toLowerCase(), kind === 'complex'
        ? { re: Float64Array.from(d.values, (v) => v.real), im: Float64Array.from(d.values, (v) => v.img) }
        : Float64Array.from(d.values, (v) => (typeof v === 'number' ? v : v.real)))
    }
    return { scale, vectors }
  })
  queue = job.catch(() => {})
  return job
}

/**
 * Run one netlist through the current runner.
 *
 * @param {string} netlist - A complete netlist ending in `.end`.
 * @param {'complex'|'real'} kind - The result type the analysis must produce.
 * @returns {Promise<{scale: number[], vectors: Map<string, object>}>} As `runLocal`.
 * @throws {Error} As `runLocal`.
 * @sideEffect Runs an engine, here or in the pool.
 */
function runRaw(netlist, kind) {
  return runner ? runner(netlist, kind) : runLocal(netlist, kind)
}

/**
 * A lookup for one saved vector, failing loudly when it is missing.
 *
 * @param {Map<string, object>} vectors - The run's vectors.
 * @returns {Function} `(name) → vector`.
 * @pure
 */
function lookup(vectors) {
  /**
   * One saved vector.
   *
   * @param {string} name - Lowercase vector name, e.g. `i(v3)`.
   * @returns {object} Its values.
   * @throws {Error} When the vector was not returned.
   * @reads the parsed result.
   */
  return (name) => {
    const v = vectors.get(name.toLowerCase())
    if (!v) throw new Error(`SPICE result has no vector ${name}`)
    return v
  }
}

/**
 * Run one AC netlist and return its complex vectors.
 *
 * @param {string} netlist - A complete netlist ending in `.end`.
 * @returns {Promise<{freqs: number[], vec: Function, names: string[]}>} The frequencies; `vec(name)` → `{re, im}` arrays for a saved vector (lowercase name, as in `.save`); and every name returned.
 * @throws {Error} When ngspice reports an error; the message lines are on `spiceErrors`.
 * @sideEffect Runs the engine; queued behind any run already in progress.
 */
export async function runNetlist(netlist) {
  const { scale, vectors } = await runRaw(netlist, 'complex')
  return { freqs: scale, names: [...vectors.keys()], vec: lookup(vectors) }
}

/**
 * Run one transient netlist and return its real vectors.
 *
 * The netlist should set `.options interp` so the samples fall on the
 * `.tran` step exactly. A run started from rest (`.tran … uic`) gets its
 * zero sample at t = 0 put back; otherwise the time axis is whatever ngspice
 * produced.
 *
 * @param {string} netlist - A complete netlist ending in `.end`.
 * @returns {Promise<{time: number[], vec: Function, names: string[]}>} The sample times, s; `vec(name)` → a Float64Array for a saved vector; and every name returned.
 * @throws {Error} When ngspice reports an error; the message lines are on `spiceErrors`.
 * @sideEffect Runs the engine; queued behind any run already in progress.
 */
export async function runTransient(netlist) {
  let { scale, vectors } = await runRaw(netlist, 'real')
  // A run started from rest (`uic`) reports nothing at t = 0, where every
  // node is at zero; the sample is put back so the time axis starts there.
  if (scale.length && scale[0] > 0) {
    scale = [0, ...scale]
    const padded = new Map()
    for (const [name, v] of vectors) {
      const a = new Float64Array(v.length + 1)
      a.set(v, 1)
      padded.set(name, a)
    }
    vectors = padded
  }
  return { time: scale, names: [...vectors.keys()], vec: lookup(vectors) }
}
