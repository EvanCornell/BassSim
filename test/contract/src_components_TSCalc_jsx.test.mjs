import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __internals } from '../../src/components/TSCalc.jsx'

// UNREACHABLE — not covered:
//   TSCalc()                 — EXPORTED, but documented to return
//                              `React.ReactElement|null`; rendering React
//                              components is out of scope for this suite.
//   TSCalc > applyToNode()   — spec: UNREACHABLE
//   TSCalc > F(arg0)         — spec: UNREACHABLE

const DS = { Fs: 30, Vas: 60, Qes: 0.4, Qms: 4, Re: 6, Sd: 500 }

// ---------------------------------------------------------------------------
// solveDatasheet
// ---------------------------------------------------------------------------

// CONTRACT: "Derive the full T/S set from published datasheet figures."
// CONTRACT: "The canonical path: Vas gives compliance, compliance and Fs give
// moving mass, and mass with Qes and Qms gives motor strength and mechanical
// resistance."
// CONTRACT: "`object` — The complete T/S set in display units."
// AMBIGUITY: the spec never enumerates the field names of the returned set.
// The names asserted here are the ones the spec pack itself uses for these
// quantities: `Bl`, `Rms` and `Qts` are named in solveAddedMass's @returns,
// and `Cms`/`Mms` are named as driver params in NLLab.jsx and DriverDB.jsx.
test('solveDatasheet: returns the complete T/S set in display units', () => {
  const r = __internals.solveDatasheet({ ...DS })
  assert.equal(typeof r, 'object')
  assert.notEqual(r, null)
  for (const k of ['Cms', 'Mms', 'Bl', 'Rms', 'Qts']) {
    assert.equal(typeof r[k], 'number', `${k} should be a number`)
    assert.ok(Number.isFinite(r[k]), `${k} should be finite`)
    assert.ok(r[k] > 0, `${k} should be positive for positive inputs`)
  }
})

// CONTRACT: "Preconditions (caller must guarantee): Every input is positive; a
// zero Qes or Qms divides by zero."
// The satisfied range is asserted: across a spread of positive inputs the
// result stays finite.
test('solveDatasheet: behaves across the satisfied precondition range', () => {
  for (const m of [
    { Fs: 18, Vas: 200, Qes: 0.3, Qms: 8, Re: 3.2, Sd: 880 },
    { Fs: 55, Vas: 12, Qes: 0.9, Qms: 2.5, Re: 6.4, Sd: 220 },
    { Fs: 120, Vas: 1.5, Qes: 1.4, Qms: 1.1, Re: 8, Sd: 50 },
  ]) {
    const r = __internals.solveDatasheet(m)
    for (const k of ['Cms', 'Mms', 'Bl', 'Rms', 'Qts']) {
      assert.ok(Number.isFinite(r[k]), `${k} finite for ${JSON.stringify(m)}`)
    }
  }
})

// CONTRACT: "@pure — no side effects, no dependence on external mutable state,
// and deterministic in its arguments. Calling it twice with equal inputs must
// produce equal output and change nothing observable."
test('solveDatasheet: @pure — twice-equal results and unmodified arguments', () => {
  const arg = structuredClone(DS)
  const before = structuredClone(arg)
  const a = __internals.solveDatasheet(arg)
  const b = __internals.solveDatasheet(structuredClone(before))
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(arg, before)
})

// ---------------------------------------------------------------------------
// solveAddedMass
// ---------------------------------------------------------------------------

const AM = { Fs: 40, FsPrime: 28, mAdd: 30, Qes: 0.5, Qms: 5, Re: 6, Sd: 500 }

// CONTRACT: "Derive the T/S set from the added-mass measurement." /
// "the size of that drop gives the moving mass directly"
// CONTRACT: "`object` — The T/S set in display units"
test('solveAddedMass: returns the T/S set in display units', () => {
  const r = __internals.solveAddedMass({ ...AM })
  assert.equal(typeof r, 'object')
  assert.notEqual(r, null)
  for (const k of ['Mms', 'Cms', 'Vas', 'Bl', 'Rms', 'Qts']) {
    assert.ok(Number.isFinite(r[k]), `${k} should be a finite number`)
    assert.ok(r[k] > 0, `${k} should be positive`)
  }
})

// CONTRACT: "Qes and Qms are optional here: without them the mass, compliance
// and Vas are still recoverable, and the motor figures are simply left
// undefined." / "`Bl`, `Rms` and `Qts` are `undefined` when the Q values were
// not supplied."
test('solveAddedMass: Bl, Rms and Qts are undefined without the Q values', () => {
  const r = __internals.solveAddedMass({ Fs: 40, FsPrime: 28, mAdd: 30, Re: 6, Sd: 500 })
  assert.equal(r.Bl, undefined)
  assert.equal(r.Rms, undefined)
  assert.equal(r.Qts, undefined)
  for (const k of ['Mms', 'Cms', 'Vas']) {
    assert.ok(Number.isFinite(r[k]), `${k} should still be recoverable`)
  }
})

// CONTRACT: "Throws Error — When the loaded resonance is not below the free-air
// one, which means the measurements are swapped or wrong."
test('solveAddedMass: throws when the loaded resonance is not below the free-air one', () => {
  // Strictly above.
  assert.throws(() => __internals.solveAddedMass({ ...AM, Fs: 28, FsPrime: 40 }), Error)
  // Equal is also "not below".
  assert.throws(() => __internals.solveAddedMass({ ...AM, Fs: 40, FsPrime: 40 }), Error)
  // Neighbouring valid input does not throw.
  assert.doesNotThrow(() => __internals.solveAddedMass({ ...AM, Fs: 40, FsPrime: 39.9 }))
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('solveAddedMass: @pure — twice-equal results and unmodified arguments', () => {
  const arg = structuredClone(AM)
  const before = structuredClone(arg)
  const a = __internals.solveAddedMass(arg)
  const b = __internals.solveAddedMass(structuredClone(before))
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(arg, before)
})

// ---------------------------------------------------------------------------
// solveKnownBox
// ---------------------------------------------------------------------------

const KB = { Fs: 30, Fc: 60, Vb: 20, Qes: 0.4, Qms: 4, Re: 6, Sd: 500 }

// CONTRACT: "Derive the T/S set from the resonance shift in a box of known
// volume." / "`object` — The complete T/S set in display units."
test('solveKnownBox: returns the complete T/S set in display units', () => {
  const r = __internals.solveKnownBox({ ...KB })
  assert.equal(typeof r, 'object')
  assert.notEqual(r, null)
  for (const k of ['Cms', 'Mms', 'Bl', 'Rms', 'Qts']) {
    assert.ok(Number.isFinite(r[k]), `${k} should be a finite number`)
  }
})

// CONTRACT: "Sealing the driver in a known volume raises its resonance, and the
// size of that rise gives Vas — after which this is the datasheet method."
// AMBIGUITY: the spec states the delegation but not the formula for the derived
// Vas. The only relation "the size of that rise" can mean for a sealed test box
// is Vas = Vb * ((Fc/Fs)^2 - 1); Fs=30, Fc=60, Vb=20 gives exactly 60 L, so the
// equivalence is asserted against solveDatasheet with Vas = 60.
test('solveKnownBox: after deriving Vas this is the datasheet method', () => {
  const viaBox = __internals.solveKnownBox({ ...KB })
  const viaDatasheet = __internals.solveDatasheet({
    Fs: KB.Fs, Vas: 60, Qes: KB.Qes, Qms: KB.Qms, Re: KB.Re, Sd: KB.Sd,
  })
  assert.deepStrictEqual(viaBox, viaDatasheet)
})

// CONTRACT: "Throws Error — When the in-box resonance is not above the free-air
// one, which means the measurements are swapped or the box is leaking."
test('solveKnownBox: throws when the in-box resonance is not above the free-air one', () => {
  assert.throws(() => __internals.solveKnownBox({ ...KB, Fs: 60, Fc: 30 }), Error)
  // Equal is also "not above".
  assert.throws(() => __internals.solveKnownBox({ ...KB, Fs: 30, Fc: 30 }), Error)
  // Neighbouring valid input does not throw.
  assert.doesNotThrow(() => __internals.solveKnownBox({ ...KB, Fs: 30, Fc: 30.1 }))
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('solveKnownBox: @pure — twice-equal results and unmodified arguments', () => {
  const arg = structuredClone(KB)
  const before = structuredClone(arg)
  const a = __internals.solveKnownBox(arg)
  const b = __internals.solveKnownBox(structuredClone(before))
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(arg, before)
})
