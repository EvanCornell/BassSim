// Thin complex-arithmetic layer over math.js Complex instances.
// math.js complex numbers are Complex.js objects exposing fast instance
// methods (.add, .mul, ...), which we use directly in the hot loop.
//
// Every operation here returns a new Complex; none mutate their arguments.
// That is what makes the whole module `@pure` and lets the solver reuse
// operand instances across the 512-point frequency sweep without defensive
// copying.
import { complex } from 'mathjs'

/**
 * A math.js / Complex.js complex number.
 * @typedef {import('mathjs').Complex} Complex
 */

/**
 * A 2×2 complex ABCD (transmission) matrix, laid out as `[[A, B], [C, D]]`.
 *
 * The convention throughout the engine is `[p1; U1] = M · [p2; U2]`: pressure
 * and volume velocity at the input expressed in terms of the output.
 * @typedef {[[Complex, Complex], [Complex, Complex]]} ABCD
 */

/**
 * Construct a complex number.
 *
 * @param {number} re - Real part.
 * @param {number} [im=0] - Imaginary part.
 * @returns {Complex} The value `re + j·im`.
 * @pure
 */
export const C = (re, im = 0) => complex(re, im)

/** Complex additive identity, `0 + 0j`. Shared instance — never mutate it. */
export const ZERO = C(0)

/** Complex multiplicative identity, `1 + 0j`. Shared instance — never mutate it. */
export const ONE = C(1)

/**
 * Complex addition.
 *
 * @param {Complex} a - Left operand.
 * @param {Complex} b - Right operand.
 * @returns {Complex} `a + b`, as a new instance.
 * @pure
 */
export const add = (a, b) => a.add(b)

/**
 * Complex subtraction.
 *
 * @param {Complex} a - Minuend.
 * @param {Complex} b - Subtrahend.
 * @returns {Complex} `a - b`, as a new instance.
 * @pure
 */
export const sub = (a, b) => a.sub(b)

/**
 * Complex multiplication.
 *
 * @param {Complex} a - Left operand.
 * @param {Complex} b - Right operand.
 * @returns {Complex} `a · b`, as a new instance.
 * @pure
 */
export const mul = (a, b) => a.mul(b)

/**
 * Complex division.
 *
 * @param {Complex} a - Dividend.
 * @param {Complex} b - Divisor.
 * @returns {Complex} `a / b`, as a new instance.
 * @pre b is non-zero; division by zero yields Infinity/NaN components rather than throwing
 * @pure
 */
export const div = (a, b) => a.div(b)

/**
 * Complex reciprocal.
 *
 * @param {Complex} a - Value to invert.
 * @returns {Complex} `1 / a`, as a new instance.
 * @pre a is non-zero
 * @pure
 */
export const inv = (a) => a.inverse()

/**
 * Complex negation.
 *
 * @param {Complex} a - Value to negate.
 * @returns {Complex} `-a`, as a new instance.
 * @pure
 */
export const neg = (a) => a.neg()

/**
 * Magnitude (modulus) of a complex number.
 *
 * @param {Complex} a - Value to measure.
 * @returns {number} `|a|`, always ≥ 0.
 * @post result >= 0
 * @pure
 */
export const abs = (a) => a.abs()

/**
 * Argument (phase angle) of a complex number.
 *
 * @param {Complex} a - Value to measure.
 * @returns {number} `arg(a)` in radians, in (−π, π].
 * @post -Math.PI < result && result <= Math.PI
 * @pure
 */
export const arg = (a) => a.arg()

/**
 * Hyperbolic cosine of a complex number.
 *
 * Used for the transmission-line element, where `cosh(Γl)` gives the A and D
 * entries of a lossy duct's ABCD matrix.
 *
 * @param {Complex} a - Complex argument, typically a propagation constant × length.
 * @returns {Complex} `cosh(a)`.
 * @pure
 */
export const cosh = (a) => a.cosh()

/**
 * Hyperbolic sine of a complex number.
 *
 * Supplies the off-diagonal `sinh(Γl)` terms of a transmission-line matrix.
 *
 * @param {Complex} a - Complex argument, typically a propagation constant × length.
 * @returns {Complex} `sinh(a)`.
 * @pure
 */
export const sinh = (a) => a.sinh()

/**
 * The imaginary frequency operator `jω`.
 *
 * @param {number} w - Angular frequency ω, rad/s.
 * @returns {Complex} `0 + jω`.
 * @pure
 */
export const jw = (w) => C(0, w)

/**
 * The semi-inductance operator `(jω)ⁿ`.
 *
 * Real voice coils behave as `Le·(jω)ⁿ` with n ≈ 0.6–0.8 rather than as an
 * ideal inductor (n = 1), because eddy currents in the pole piece make the
 * impedance rise more slowly than 6 dB/octave. Exponent n is the driver's
 * `LeExp` parameter.
 *
 * @param {number} w - Angular frequency ω, rad/s.
 * @param {number} n - Semi-inductance exponent, typically 0.5–1.
 * @returns {Complex} `(jω)ⁿ` on the principal branch.
 * @pre w >= 0
 * @pure
 */
export const jwPow = (w, n) => C(0, w).pow(n)

// ---------- 2x2 complex matrix helpers. Matrices are [[A,B],[C,D]]. ----------

/**
 * Multiply two ABCD matrices, cascading two two-ports into one.
 *
 * Order matters and follows signal flow: `matMul(M, N)` is the network in
 * which M's output feeds N's input.
 *
 * @param {ABCD} M - Upstream two-port.
 * @param {ABCD} N - Downstream two-port.
 * @returns {ABCD} The cascade `M · N`, as a new matrix.
 * @post Neither M nor N is modified.
 * @pure
 */
export const matMul = (M, N) => [
  [add(mul(M[0][0], N[0][0]), mul(M[0][1], N[1][0])), add(mul(M[0][0], N[0][1]), mul(M[0][1], N[1][1]))],
  [add(mul(M[1][0], N[0][0]), mul(M[1][1], N[1][0])), add(mul(M[1][0], N[0][1]), mul(M[1][1], N[1][1]))],
]

/**
 * The identity two-port, representing a lossless connection of zero length.
 *
 * Returns a fresh array each call — it is the seed of `reduce`-style cascades
 * and callers are free to overwrite it.
 *
 * @returns {ABCD} `[[1, 0], [0, 1]]`.
 * @post result is a newly allocated matrix sharing the ZERO/ONE constants
 * @pure
 */
export const matIdentity = () => [[ONE, ZERO], [ZERO, ONE]]

/**
 * Input impedance of a two-port terminated in a load.
 *
 * `Zin = (A·Zl + B) / (C·Zl + D)`.
 *
 * @param {ABCD} M - The two-port between the input and the load.
 * @param {Complex} Zl - Terminating (load) impedance, Pa·s/m³.
 * @returns {Complex} Impedance seen at the input, Pa·s/m³.
 * @pre C·Zl + D is non-zero — it vanishes only at a parallel resonance of a lossless network, which the per-node Q terms prevent
 * @pure
 */
export const zInFromMatrix = (M, Zl) =>
  div(add(mul(M[0][0], Zl), M[0][1]), add(mul(M[1][0], Zl), M[1][1]))

/**
 * Carry an acoustic state through a two-port, from input to output.
 *
 * Given the input state `[p1, U1]` and a matrix M defined by
 * `[p1; U1] = M · [p2; U2]`, this solves for the output state `[p2, U2]` by
 * applying M⁻¹.
 *
 * The determinant is computed rather than assumed to be 1: it is exactly 1 for
 * a reciprocal lossless network, but the loss terms and the numeric area
 * profiles push it slightly off, and dividing by the true determinant keeps
 * the propagation consistent with the matrix that was actually built.
 *
 * @param {ABCD} M - The two-port to traverse.
 * @param {Complex} p1 - Pressure at the input, Pa.
 * @param {Complex} U1 - Volume velocity at the input, m³/s.
 * @returns {[Complex, Complex]} The output state `[p2, U2]`.
 * @pre det(M) is non-zero
 * @pure
 */
export const propagate = (M, p1, U1) => {
  const det = sub(mul(M[0][0], M[1][1]), mul(M[0][1], M[1][0]))
  const p2 = div(sub(mul(M[1][1], p1), mul(M[0][1], U1)), det)
  const U2 = div(sub(mul(M[0][0], U1), mul(M[1][0], p1)), det)
  return [p2, U2]
}

/**
 * Parallel (shunt) combination of a list of impedances.
 *
 * Used at graph junctions, where several branches leaving one output port load
 * the source simultaneously: `1/Z = Σ 1/Zᵢ`.
 *
 * @param {Complex[]} zs - Branch impedances, Pa·s/m³.
 * @returns {Complex|null} The combined impedance, or `null` when `zs` is empty — an unconnected port has no load rather than a zero one, and callers must handle that case explicitly.
 * @pre no element of zs is zero
 * @post zs is not modified
 * @pure
 */
export const parallel = (zs) => {
  if (zs.length === 0) return null
  if (zs.length === 1) return zs[0]
  let y = ZERO
  for (const z of zs) y = add(y, inv(z))
  return inv(y)
}
