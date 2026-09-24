// Contract tests for src/spice/filters.js — filter design and its circuit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { butterworthStages, filterSections, sectionsResponse, compileSections, FILTER_TYPES } from '../../src/spice/filters.js'
import { createNetlist } from '../../src/spice/netlist.js'
import { runNetlist } from '../../src/spice/run.js'

/**
 * Magnitude of a filter in dB at one frequency.
 *
 * @param {object} f - A filter.
 * @param {number} hz - Frequency.
 * @returns {number} dB.
 */
const db = (f, hz) => { const h = sectionsResponse(filterSections(f), hz); return 20 * Math.log10(Math.hypot(h.re, h.im)) }

// CONTRACT: "The Q of each second-order stage of a Butterworth filter".
test('butterworthStages: the textbook pole Qs', () => {
  assert.deepEqual(butterworthStages(1), { qs: [], first: true })
  assert.ok(Math.abs(butterworthStages(2).qs[0] - Math.SQRT1_2) < 1e-12)
  const q4 = butterworthStages(4).qs
  assert.ok(Math.abs(q4[0] - 1.306563) < 1e-6 && Math.abs(q4[1] - 0.541196) < 1e-6)
  const q3 = butterworthStages(3)
  assert.ok(q3.first && Math.abs(q3.qs[0] - 1) < 1e-12)
})

// CONTRACT: Butterworth is −3 dB at its frequency, Linkwitz-Riley −6 dB, and
// both fall at 6 dB/octave per order.
test('filterSections: corner levels and slopes', () => {
  for (const order of [1, 2, 3, 4, 8]) {
    assert.ok(Math.abs(db({ type: 'highpass', shape: 'butterworth', order, hz: 30 }, 30) + 3.0103) < 1e-3, `BW${order}`)
    const slope = db({ type: 'lowpass', shape: 'butterworth', order, hz: 30 }, 3000) - db({ type: 'lowpass', shape: 'butterworth', order, hz: 30 }, 6000)
    assert.ok(Math.abs(slope - 6.0206 * order) < 0.01, `slope ${slope}`)
  }
  for (const order of [2, 4, 8]) {
    assert.ok(Math.abs(db({ type: 'lowpass', shape: 'linkwitz-riley', order, hz: 80 }, 80) + 6.0206) < 1e-3, `LR${order}`)
  }
  assert.equal(filterSections({ type: 'highpass', shape: 'linkwitz-riley', order: 4, hz: 80 }).length, 2)
})

// CONTRACT: Linkwitz-Riley "is two Butterworth filters of order n in cascade"
// — so its high and low halves sum flat.
test('filterSections: a Linkwitz-Riley crossover sums flat', () => {
  const hp = filterSections({ type: 'highpass', shape: 'linkwitz-riley', order: 4, hz: 100 })
  const lp = filterSections({ type: 'lowpass', shape: 'linkwitz-riley', order: 4, hz: 100 })
  for (const hz of [10, 50, 90, 100, 110, 200, 1000]) {
    const a = sectionsResponse(hp, hz)
    const b = sectionsResponse(lp, hz)
    assert.ok(Math.abs(Math.hypot(a.re + b.re, a.im + b.im) - 1) < 1e-9, `${hz} Hz`)
  }
})

// CONTRACT: parametric and shelving gains "in dB".
test('filterSections: EQ gains land where they should', () => {
  assert.ok(Math.abs(db({ type: 'peq', hz: 50, q: 4, db: 6 }, 50) - 6) < 1e-9)
  assert.ok(Math.abs(db({ type: 'peq', hz: 50, q: 4, db: -9 }, 50) + 9) < 1e-9)
  assert.ok(Math.abs(db({ type: 'peq', hz: 50, q: 4, db: 6 }, 5000)) < 0.01)
  assert.ok(Math.abs(db({ type: 'lowshelf', hz: 50, q: 0.7, db: 5 }, 0.5) - 5) < 0.01)
  assert.ok(Math.abs(db({ type: 'lowshelf', hz: 50, q: 0.7, db: 5 }, 5000)) < 0.01)
  assert.ok(Math.abs(db({ type: 'highshelf', hz: 50, q: 0.7, db: -4 }, 5000) + 4) < 0.01)
  assert.ok(Math.abs(db({ type: 'highshelf', hz: 50, q: 0.7, db: -4 }, 0.5)) < 0.01)
})

// CONTRACT: "@throws {Error} When the filter type is unknown or a value is out of range."
test('filterSections: refuses what it cannot build', () => {
  assert.throws(() => filterSections({ type: 'bandstop', hz: 50 }), /unknown filter type/)
  assert.throws(() => filterSections({ type: 'highpass', hz: 0 }), /frequency/)
  assert.throws(() => filterSections({ type: 'peq', hz: 50, q: 0 }), /Q/)
  assert.throws(() => filterSections({ type: 'lowpass', shape: 'bessel', hz: 50 }), /shape/)
  assert.deepEqual(FILTER_TYPES, ['highpass', 'lowpass', 'peq', 'lowshelf', 'highshelf'])
})

// CONTRACT (compileSections): "Each section reads its input as a node voltage
// and drives its output from an ideal controlled source" — the circuit is the
// analytic cascade.
test('compileSections: the circuit is the cascade', async () => {
  const secs = [
    ...filterSections({ type: 'highpass', shape: 'butterworth', order: 3, hz: 20 }),
    ...filterSections({ type: 'peq', hz: 60, q: 2, db: -6 }),
    ...filterSections({ type: 'lowpass', shape: 'butterworth', order: 1, hz: 200 }),
  ]
  const nl = createNetlist('f')
  nl.lines.push('V1 in 0 DC 0 AC 1')
  const out = compileSections(nl, 'in', secs, 'test')
  nl.lines.push(`.save v(${out})`, '.ac dec 20 2 2000', '.end')
  const raw = await runNetlist(nl.text())
  const v = raw.vec(`v(${out})`)
  raw.freqs.forEach((f, i) => {
    const h = sectionsResponse(secs, f)
    assert.ok(Math.hypot(v.re[i] - h.re, v.im[i] - h.im) < 1e-9 * Math.max(1, Math.hypot(h.re, h.im)), `${f} Hz`)
  })
})
