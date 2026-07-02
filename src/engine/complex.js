// Thin complex-arithmetic layer over math.js Complex instances.
// math.js complex numbers are Complex.js objects exposing fast instance
// methods (.add, .mul, ...), which we use directly in the hot loop.
import { complex } from 'mathjs'

export const C = (re, im = 0) => complex(re, im)
export const ZERO = C(0)
export const ONE = C(1)

export const add = (a, b) => a.add(b)
export const sub = (a, b) => a.sub(b)
export const mul = (a, b) => a.mul(b)
export const div = (a, b) => a.div(b)
export const inv = (a) => a.inverse()
export const neg = (a) => a.neg()
export const abs = (a) => a.abs()
export const arg = (a) => a.arg()

// cosh/sinh of a complex number
export const cosh = (a) => a.cosh()
export const sinh = (a) => a.sinh()

// jω as complex
export const jw = (w) => C(0, w)

// (jω)^n for semi-inductance models
export const jwPow = (w, n) => C(0, w).pow(n)

// 2x2 complex matrix helpers. Matrices are [[A,B],[C,D]].
export const matMul = (M, N) => [
  [add(mul(M[0][0], N[0][0]), mul(M[0][1], N[1][0])), add(mul(M[0][0], N[0][1]), mul(M[0][1], N[1][1]))],
  [add(mul(M[1][0], N[0][0]), mul(M[1][1], N[1][0])), add(mul(M[1][0], N[0][1]), mul(M[1][1], N[1][1]))],
]

export const matIdentity = () => [[ONE, ZERO], [ZERO, ONE]]

// Input impedance of a two-port terminated in Zl: Zin = (A·Zl + B)/(C·Zl + D)
export const zInFromMatrix = (M, Zl) =>
  div(add(mul(M[0][0], Zl), M[0][1]), add(mul(M[1][0], Zl), M[1][1]))

// Given input state [p1, U1] and matrix M with [p1;U1] = M·[p2;U2],
// return output state [p2, U2] (uses inverse; det may deviate slightly from 1).
export const propagate = (M, p1, U1) => {
  const det = sub(mul(M[0][0], M[1][1]), mul(M[0][1], M[1][0]))
  const p2 = div(sub(mul(M[1][1], p1), mul(M[0][1], U1)), det)
  const U2 = div(sub(mul(M[0][0], U1), mul(M[1][0], p1)), det)
  return [p2, U2]
}

// Parallel (shunt) combination of a list of impedances
export const parallel = (zs) => {
  if (zs.length === 0) return null
  if (zs.length === 1) return zs[0]
  let y = ZERO
  for (const z of zs) y = add(y, inv(z))
  return inv(y)
}
