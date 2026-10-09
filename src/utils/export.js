import { toPng } from 'html-to-image'
import { workspaceToEntries, workspaceFilename } from '../workspace'
import { createZip } from './zip'
import { prepareProject } from '../engine/pipeline'
import { compileProject } from '../spice/compile'
import { netlistToSvg } from '../spice/schematic'
import { displayName } from '../nodeNames'

/**
 * Push content to the user as a file download.
 *
 * Uses an object URL and a synthetic anchor click, which is the only way to
 * name a download from the browser. The URL is revoked after 5 s — long enough
 * for the download to start, short enough not to leak the blob for the session.
 *
 * @param {string} filename - Suggested filename, including extension.
 * @param {Blob|string} content - A ready Blob, or text to wrap in one.
 * @param {string} mime - MIME type, used only when `content` is text.
 * @returns {void}
 * @sideEffect Creates an object URL, clicks a synthetic anchor to trigger a browser download, and schedules the URL's revocation.
 */
function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Download a project as a formatted `.speakerspice.json` file.
 *
 * @param {object} proj - The project to serialize.
 * @param {string} [proj.name] - Used for the filename; falls back to `speakerspice-project`.
 * @returns {void}
 * @sideEffect Triggers a browser download.
 */
export function exportProjectJSON(proj) {
  download(`${proj.name || 'speakerspice-project'}.speakerspice.json`, JSON.stringify(proj, null, 2), 'application/json')
}

/**
 * Download the circuit the frequency sweep solves, drawn as an SVG diagram.
 *
 * Every element of the netlist is drawn, laid out automatically — the raw
 * circuit, not a tidied schematic. The renderer and its symbols are loaded
 * only when asked for.
 *
 * @param {object} proj - The project, as saved.
 * @param {string} [proj.name] - Used for the filename.
 * @returns {Promise<void>} Resolves once the download has been handed to the browser.
 * @throws {Error} When the project cannot be compiled, or the diagram cannot be laid out.
 * @sideEffect Loads the renderer, runs the layout and triggers a browser download.
 */
export async function exportCircuitSVG(proj) {
  const [lib, skin] = await Promise.all([import('netlistsvg'), import('netlistsvg/lib/analog.svg?raw')])
  const { project } = prepareProject(proj)
  const sweep = (project.analyses || []).find((a) => a.type === 'ac') || { fmin: 10, fmax: 1000, npts: 512 }
  const { netlist } = compileProject(project, sweep)
  const svg = await netlistToSvg(netlist, { render: lib.render || lib.default.render, skin: skin.default })
  download(`${proj.name || 'speakerspice-project'} circuit.svg`, svg, 'image/svg+xml')
}

/**
 * Download a whole workspace as an archive of folders and files.
 *
 * Unzipped it is the tree the explorer shows: each project a readable JSON
 * document where the user filed it, and `.speakerspice` holding the app's own data.
 * A single blob would download faster and be worth less — this one can be
 * browsed, edited in a text editor, diffed and committed.
 *
 * @param {object} ws - The workspace to archive.
 * @returns {Promise<void>} Resolves once the download has been handed to the browser.
 * @sideEffect Compresses through the platform's streams and triggers a browser download.
 */
export async function exportWorkspaceZip(ws) {
  download(workspaceFilename(ws), await createZip(workspaceToEntries(ws)), 'application/zip')
}

/**
 * Download every result series as one wide CSV.
 *
 * Columns are built as `[header, accessor]` pairs so the per-port, per-waveguide
 * and per-probe series — whose count depends on the graph — can be spliced in
 * alongside the fixed ones without a second layout pass. Node labels are
 * resolved into the headers so the file is readable without the project beside
 * it.
 *
 * Values are written at 7 significant digits; absent and non-finite entries
 * become empty cells rather than `NaN`, which spreadsheets handle badly.
 *
 * @param {object|null} results - A sweep result, as `simulateProject` returns it. A failed or absent result exports nothing.
 * @param {Array<object>} nodes - Graph nodes, used to label port and chamber columns.
 * @param {string} projectName - Base filename.
 * @returns {void}
 * @sideEffect Triggers a browser download. Returns silently when there is nothing to export.
 */
export function exportCSV(results, nodes, projectName) {
  if (!results || !results.ok) return
  const cols = [
    ['Frequency (Hz)', (i) => results.freqs[i]],
    ['SPL Combined (dB)', (i) => results.splCombined[i]],
    ['SPL Driver (dB)', (i) => results.splDriver[i]],
  ]
  for (const [pid, arr] of Object.entries(results.splPorts || {})) {
    const label = displayName(nodes, pid)
    cols.push([`SPL ${label} (dB)`, (i) => arr[i]])
  }
  cols.push(
    ['Zin magnitude (ohm)', (i) => results.zinMag[i]],
    ['Zin phase (deg)', (i) => results.zinPhase[i]],
    ['Excursion (mm pk)', (i) => results.excursion[i]],
  )
  for (const [wid, arr] of Object.entries(results.velocity || {})) {
    const label = displayName(nodes, wid)
    cols.push([`Velocity ${label} (m/s pk)`, (i) => arr[i]])
  }
  for (const [cid, arr] of Object.entries(results.splInterior || {})) {
    const label = displayName(nodes, cid)
    cols.push([`Interior SPL ${label} (dB)`, (i) => arr[i]])
  }
  cols.push(
    ['Acoustic power (W)', (i) => results.power[i]],
    ['Electrical power real (W)', (i) => results.peReal?.[i]],
    ['Electrical power apparent (VA)', (i) => results.peApparent?.[i]],
    ['Efficiency (%)', (i) => (results.peReal?.[i] > 1e-9 ? (results.power[i] / results.peReal[i]) * 100 : null)],
    ['Phase (deg)', (i) => results.phaseUnwrapped[i]],
    ['Group delay (ms)', (i) => results.groupDelay[i]],
  )
  const lines = [cols.map(([h]) => `"${h}"`).join(',')]
  for (let i = 0; i < results.freqs.length; i++) {
    lines.push(cols.map(([, fn]) => {
      const v = fn(i)
      return v == null || !isFinite(v) ? '' : Number(v).toPrecision(7)
    }).join(','))
  }
  download(`${projectName}-data.csv`, lines.join('\n'), 'text/csv')
}

/**
 * Download a PNG of the node canvas.
 *
 * Rasterizes the live React Flow element at 2× for a legible image, filtering
 * out the minimap and controls so the export shows the schematic rather than the
 * editor chrome. The background is set explicitly because the canvas itself is
 * transparent.
 *
 * @param {string} projectName - Base filename.
 * @returns {Promise<void>} Resolves once the download has been triggered.
 * @sideEffect Reads the live DOM, rasterizes it, and triggers a browser download. Returns silently when the canvas is not mounted.
 */
export async function exportSchematicPNG(projectName) {
  const el = document.querySelector('.react-flow__viewport')?.closest('.react-flow')
  if (!el) return
  const dataUrl = await toPng(el, {
    backgroundColor: '#0d1117',
    /**
     * Exclude the editor chrome from the exported image.
     *
     * The minimap and controls belong to the editor, not the schematic.
     *
     * @param {HTMLElement} n - A candidate node.
     * @returns {boolean} True to include the node in the render.
     * @pure
     */
    filter: (n) => !(n.classList?.contains('react-flow__minimap') || n.classList?.contains('react-flow__controls')),
    pixelRatio: 2,
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${projectName}-schematic.png`
  a.click()
}

/**
 * Download a plain-text summary of the key metrics.
 *
 * The human-readable counterpart to the CSV: a fixed-width report suitable for
 * pasting into a build thread. Every figure degrades to `n/a` rather than being
 * omitted, so the shape of the report is the same for a sealed box and a ported
 * one.
 *
 * @param {object|null} metrics - Metrics from `computeMetrics`. Absent metrics export nothing.
 * @param {object} settings - Sweep settings, for the drive-level header line.
 * @param {string} projectName - Base filename, also used in the title line.
 * @returns {void}
 * @sideEffect Reads the current time for the generated-on stamp and triggers a browser download.
 */
export function exportMetricsTxt(metrics, settings, projectName) {
  if (!metrics) return
  const l = []
  l.push(`SpeakerSpice — key metrics for "${projectName}"`)
  l.push(`Generated ${new Date().toISOString()}`)
  l.push(`Drive: ${settings.voltage?.toFixed(2)} V into ${settings.impedance} Ω nominal (${settings.power?.toFixed(1)} W)`)
  l.push('')
  /**
   * Append one aligned `label value` line to the report.
   * @param {string} k - Row label, padded to a fixed column width.
   * @param {string} v - Formatted value.
   * @returns {number} The new line count, as returned by `Array.push` and ignored by callers.
   * @mutates Appends to the enclosing `l` line buffer.
   */
  const row = (k, v) => l.push(`${k.padEnd(28)} ${v}`)
  row('F3 (-3 dB)', metrics.f3 ? `${metrics.f3.toFixed(1)} Hz` : 'n/a')
  row('F10 (-10 dB)', metrics.f10 ? `${metrics.f10.toFixed(1)} Hz` : 'n/a')
  row('Fb (tuning)', metrics.fb ? `${metrics.fb.toFixed(1)} Hz (${metrics.fbZ?.toFixed(1)} ohm min)` : 'n/a')
  row('Qtc (sealed)', metrics.qtc ? metrics.qtc.toFixed(2) : 'n/a')
  ;(metrics.zPeaks || []).forEach((p, i) => row(`Impedance peak F${i + 1}`, `${p.f.toFixed(1)} Hz, ${p.v.toFixed(1)} ohm`))
  row('Passband level', `${metrics.passband?.toFixed(1)} dB`)
  row('Peak SPL', `${metrics.peakSPL?.toFixed(1)} dB @ 1 m`)
  row('-3 dB bandwidth', metrics.bwHz ? `${metrics.bwHz.toFixed(0)} Hz (${metrics.bwOct.toFixed(2)} octaves)` : 'n/a')
  row('Max excursion', metrics.xPeak ? `${metrics.xPeak.toFixed(2)} mm pk @ ${metrics.xPeakF?.toFixed(1)} Hz` : 'n/a')
  row('Excursion @ Fb', metrics.xAtFb != null ? `${metrics.xAtFb.toFixed(2)} mm` : 'n/a')
  row('Excursion @ F3', metrics.xAtF3 != null ? `${metrics.xAtF3.toFixed(2)} mm` : 'n/a')
  row('Max power before Xmax', metrics.maxPower ? `${metrics.maxPower.toFixed(0)} W (${metrics.vMax.toFixed(1)} V)` : 'n/a')
  download(`${projectName}-metrics.txt`, l.join('\n'), 'text/plain')
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { download }
