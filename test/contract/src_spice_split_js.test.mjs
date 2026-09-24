// Contract tests for src/spice/split.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acLine, acCount, splitAc, mergeAc, MIN_POINTS } from '../../src/spice/split.js'
import { runLocal } from '../../src/spice/run.js'
import { decadeStep } from '../../src/spice/compile.js'

/**
 * A small RC ladder with the given analysis line.
 *
 * @param {string} line - The `.ac` line.
 * @returns {string} The netlist.
 */
const rc = (line) => `rc\nV1 1 0 DC 0 AC 1\nR1 1 2 100\nC1 2 0 1u\nR2 2 3 50\nL1 3 0 10m\n.save v(2) i(v1)\n${line}\n.end`

// CONTRACT (acLine / acCount): the AC line parsed, and the points it makes.
test('acLine and acCount read lin and dec sweeps', () => {
  assert.deepEqual(acLine(rc('.ac lin 64 1 100')), { line: '.ac lin 64 1 100', scale: 'lin', n: 64, fstart: 1, fstop: 100 })
  assert.equal(acCount(acLine(rc('.ac lin 64 1 100'))), 64)
  assert.equal(acCount(acLine(rc('.ac dec 100 10 1000'))), 201)
  assert.equal(acLine('.tran 1m 1\n.end'), null)
})

// CONTRACT (splitAc): "the netlist itself, alone, when it has no AC line or
// too few points to split"; never a piece under MIN_POINTS.
test('splitAc: small sweeps and transient runs stay whole', () => {
  assert.equal(splitAc(rc('.ac lin 20 1 100'), 8).length, 1)
  assert.equal(splitAc('t\n.tran 1m 1\n.end', 8).length, 1)
  const parts = splitAc(rc('.ac lin 100 1 100'), 50)
  assert.equal(parts.length, Math.floor(100 / MIN_POINTS))
})

// CONTRACT (splitAc / mergeAc): "the same frequencies in the same order" —
// the joined pieces are the whole sweep, point for point, when a decade
// sweep's top is on its grid, as compileProject writes it.
test('splitAc + mergeAc: pieces joined equal the whole sweep', async () => {
  const odd = `.ac dec 37 7.3 ${decadeStep(7.3, 37, 81, true)}`
  for (const line of ['.ac lin 200 0.5 100', `.ac dec 100 10 ${decadeStep(10, 100, 200, true)}`, odd]) {
    const whole = await runLocal(rc(line), 'complex')
    for (const k of [2, 3, 7]) {
      const parts = splitAc(rc(line), k)
      assert.equal(parts.length, Math.min(k, Math.floor(whole.scale.length / MIN_POINTS)))
      const m = mergeAc(await Promise.all(parts.map((p) => runLocal(p, 'complex'))))
      assert.equal(m.scale.length, whole.scale.length, `${line} in ${k}`)
      whole.scale.forEach((f, i) => assert.ok(Math.abs(m.scale[i] / f - 1) < 1e-7, `${line} in ${k}: point ${i}`))
      for (const [name, v] of whole.vectors) {
        const w = m.vectors.get(name)
        v.re.forEach((x, i) => assert.ok(Math.abs(w.re[i] - x) <= 1e-6 * Math.hypot(x, v.im[i]) + 1e-15 && Math.abs(w.im[i] - v.im[i]) <= 1e-6 * Math.hypot(x, v.im[i]) + 1e-15, `${name}[${i}]`))
      }
    }
  }
})

// CONTRACT (mergeAc): real vectors join too; a single piece is returned as is.
test('mergeAc: joins real vectors, passes one piece through', () => {
  const a = { scale: [1, 2], vectors: new Map([['x', Float64Array.of(1, 2)]]) }
  const b = { scale: [3], vectors: new Map([['x', Float64Array.of(3)]]) }
  const m = mergeAc([a, b])
  assert.deepEqual(m.scale, [1, 2, 3])
  assert.deepEqual(Array.from(m.vectors.get('x')), [1, 2, 3])
  assert.equal(mergeAc([a]), a)
})
