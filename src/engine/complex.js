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

// Dense complex linear solve A·x = b by Gaussian elimination with partial
// pivoting. A is an n×n array of rows, b a length-n vector; both are consumed
// in place. Returns null if the matrix is singular to working precision.
//
// The nodal solver calls this once per frequency on a matrix the size of the
// acoustic junction count — single digits for any realistic enclosure — so a
// dense O(n³) solve costs nothing worth optimising away.
export function solveLinear(A, b) {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let piv = col
    let best = A[col][col].abs()
    for (let r = col + 1; r < n; r++) {
      const m = A[r][col].abs()
      if (m > best) { best = m; piv = r }
    }
    if (!(best > 1e-300)) return null
    if (piv !== col) {
      const t = A[piv]; A[piv] = A[col]; A[col] = t
      const tb = b[piv]; b[piv] = b[col]; b[col] = tb
    }
    const d = A[col][col]
    for (let r = col + 1; r < n; r++) {
      const f = div(A[r][col], d)
      if (f.re === 0 && f.im === 0) continue
      for (let c = col; c < n; c++) A[r][c] = sub(A[r][c], mul(f, A[col][c]))
      b[r] = sub(b[r], mul(f, b[col]))
    }
  }
  const x = new Array(n)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let c = r + 1; c < n; c++) s = sub(s, mul(A[r][c], x[c]))
    x[r] = div(s, A[r][r])
  }
  return x
}
