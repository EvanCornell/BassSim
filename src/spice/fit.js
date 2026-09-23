// Passive networks fitted to frequency responses no finite circuit has exactly.
//
// Three quantities in the model are not a single R, L or C: the radiation
// impedance of an opening (Bessel/Struve in ka), the voice coil's
// semi-inductance `Le·(jω)^n`, and boundary-layer loss, which goes as √(jω).
// Each is approximated here by a weighted sum of fixed passive building
// blocks ("atoms"), with the weights found by non-negative least squares.
//
// Non-negative weights on passive atoms are what make the result safe: every
// fitted network is a series chain of positive R‖L (or R‖L‖C) sections, so it
// is passive by construction and can never add energy, and it behaves the
// same in an AC sweep and in a transient run. The price is that the fit is an
// approximation; each use states and tests its own accuracy.
//
// An atom is a unit-weight impedance in a normalized frequency variable q:
//
//   corner(q0)       jq/(jq + q0)                     — R‖L, corner at q0
//   resonance(q0,Q)  (jq/(Q·q0)) / (1 − (q/q0)² + jq/(Q·q0))  — R‖L‖C
//
// A weight w scales an atom into a section with R = w, L = w/q0 (and, for a
// resonance, L = w/(Q·q0), C = Q/(w·q0)), all in normalized units the caller
// scales to physical ones.

/**
 * Unit-weight impedance of one atom at normalized frequency q.
 *
 * @param {{kind: string, q0: number, Q?: number}} atom - `corner` or `resonance`.
 * @param {number} q - Normalized frequency.
 * @returns {{re: number, im: number}} The atom's impedance.
 * @pure
 */
export function atomZ(atom, q) {
  if (atom.kind === 'corner') {
    // jq/(jq + q0) = (q² + j q q0) / (q² + q0²)
    const d = q * q + atom.q0 * atom.q0
    return { re: (q * q) / d, im: (q * atom.q0) / d }
  }
  // parallel RLC with R = 1: Z = 1 / (1 + 1/(jqL) + jqC), L = 1/(Q q0), C = Q/q0
  const L = 1 / (atom.Q * atom.q0)
  const C = atom.Q / atom.q0
  const yRe = 1
  const yIm = q * C - 1 / (q * L)
  const d = yRe * yRe + yIm * yIm
  return { re: yRe / d, im: -yIm / d }
}

/**
 * Non-negative least squares, min ‖A·x − b‖ subject to x ≥ 0.
 *
 * Lawson–Hanson active set method. Sizes here are small (a few hundred rows,
 * a few dozen columns), so dense normal-equation solves are fine.
 *
 * @param {number[][]} A - Row-major matrix, m × n.
 * @param {number[]} b - Target, length m.
 * @param {number} [maxIter=500] - Iteration cap.
 * @returns {number[]} The non-negative solution, length n.
 * @pure
 */
export function nnls(A, b, maxIter = 500) {
  const m = A.length
  const n = A[0].length
  const x = new Array(n).fill(0)
  const passive = new Array(n).fill(false) // true = in the free set P
  /**
   * The gradient Aᵀ(b − A·x).
   *
   * @returns {number[]} One entry per column.
   * @reads the enclosing `A`, `b` and `x`.
   */
  const gradient = () => {
    const r = b.map((bi, i) => bi - A[i].reduce((s, a, j) => s + a * x[j], 0))
    const w = new Array(n).fill(0)
    for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) w[j] += A[i][j] * r[i]
    return w
  }
  /**
   * Unconstrained least squares restricted to the free set.
   *
   * @param {number[]} P - Column indices in the free set.
   * @returns {number[]} A full-length vector, zero outside P.
   * @reads the enclosing `A` and `b`.
   */
  const solveFree = (P) => {
    const k = P.length
    const M = Array.from({ length: k }, () => new Array(k + 1).fill(0))
    for (let a = 0; a < k; a++) {
      for (let c = 0; c < k; c++) {
        let s = 0
        for (let i = 0; i < m; i++) s += A[i][P[a]] * A[i][P[c]]
        M[a][c] = s
      }
      let s = 0
      for (let i = 0; i < m; i++) s += A[i][P[a]] * b[i]
      M[a][k] = s
    }
    // Gaussian elimination with partial pivoting and a tiny ridge for safety.
    for (let a = 0; a < k; a++) M[a][a] += 1e-14 * (M[a][a] || 1)
    for (let c = 0; c < k; c++) {
      let p = c
      for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
      ;[M[c], M[p]] = [M[p], M[c]]
      for (let r = c + 1; r < k; r++) {
        const f = M[r][c] / M[c][c]
        for (let t = c; t <= k; t++) M[r][t] -= f * M[c][t]
      }
    }
    const z = new Array(k).fill(0)
    for (let r = k - 1; r >= 0; r--) {
      let s = M[r][k]
      for (let t = r + 1; t < k; t++) s -= M[r][t] * z[t]
      z[r] = s / M[r][r]
    }
    const full = new Array(n).fill(0)
    P.forEach((j, a) => { full[j] = z[a] })
    return full
  }
  for (let iter = 0; iter < maxIter; iter++) {
    const w = gradient()
    let best = -1
    let bestW = 1e-12 * Math.max(1, ...w.map(Math.abs))
    for (let j = 0; j < n; j++) if (!passive[j] && w[j] > bestW) { bestW = w[j]; best = j }
    if (best < 0) break
    passive[best] = true
    for (let inner = 0; inner < maxIter; inner++) {
      const P = []
      for (let j = 0; j < n; j++) if (passive[j]) P.push(j)
      const z = solveFree(P)
      if (P.every((j) => z[j] > 0)) { for (let j = 0; j < n; j++) x[j] = z[j]; break }
      let alpha = Infinity
      for (const j of P) {
        if (z[j] <= 0) alpha = Math.min(alpha, x[j] / (x[j] - z[j]))
      }
      for (let j = 0; j < n; j++) x[j] += alpha * (z[j] - x[j])
      for (const j of P) if (x[j] <= 1e-15) { passive[j] = false; x[j] = 0 }
    }
  }
  return x
}

/**
 * Fit non-negative atom weights to a complex target response.
 *
 * Each sample contributes its real and imaginary parts as two rows. By
 * default both are divided by the target's magnitude, so the fit minimizes
 * relative error in |Z|. With `componentwise`, each part is divided by its own
 * magnitude instead — needed where one part is much smaller than the other but
 * still matters, as radiation resistance does at low ka, where it is tiny next
 * to the reactance yet sets the radiated power. Atoms whose weight comes out
 * zero are dropped.
 *
 * @param {Array<object>} atoms - Candidate atoms.
 * @param {Array<{q: number, z: {re: number, im: number}, w?: number}>} samples - Target samples.
 * @param {boolean} [componentwise=false] - Weight the real and imaginary parts by their own magnitudes.
 * @returns {Array<object>} The atoms kept, each with its `weight`.
 * @pure
 */
export function fitAtoms(atoms, samples, componentwise = false) {
  const A = []
  const b = []
  for (const s of samples) {
    const mag = Math.max(Math.hypot(s.z.re, s.z.im), 1e-300)
    const sRe = (s.w ?? 1) / (componentwise ? Math.max(Math.abs(s.z.re), 1e-6 * mag) : mag)
    const sIm = (s.w ?? 1) / (componentwise ? Math.max(Math.abs(s.z.im), 1e-6 * mag) : mag)
    const row = atoms.map((a) => atomZ(a, s.q))
    A.push(row.map((z) => z.re * sRe)); b.push(s.z.re * sRe)
    A.push(row.map((z) => z.im * sIm)); b.push(s.z.im * sIm)
  }
  const x = nnls(A, b)
  return atoms.map((a, j) => ({ ...a, weight: x[j] })).filter((a) => a.weight > 0)
}

/**
 * Impedance of a fitted network at normalized frequency q.
 *
 * @param {Array<object>} fit - Atoms with weights, from `fitAtoms`.
 * @param {number} q - Normalized frequency.
 * @returns {{re: number, im: number}} The network's impedance.
 * @pure
 */
export function fitZ(fit, q) {
  let re = 0
  let im = 0
  for (const a of fit) {
    const z = atomZ(a, q)
    re += a.weight * z.re
    im += a.weight * z.im
  }
  return { re, im }
}

/**
 * Logarithmically spaced values, inclusive.
 *
 * @param {number} lo - First value.
 * @param {number} hi - Last value.
 * @param {number} n - Count, at least 2.
 * @returns {number[]} The values.
 * @pure
 */
export function logspace(lo, hi, n) {
  const a = Math.log(lo)
  const b = Math.log(hi)
  return Array.from({ length: n }, (_, i) => Math.exp(a + ((b - a) * i) / (n - 1)))
}

const fractionalCache = new Map()

/**
 * Fit `(jq)^α` for 0 < α < 1 over q ∈ [1, qMax] with R‖L corners.
 *
 * Used for the voice coil's semi-inductance and for boundary-layer loss
 * (α = ½). The caller maps its band onto [1, qMax] by choosing the frequency
 * unit, then scales the weights by its coefficient. Corners extend a decade
 * beyond the band on each side so the fit holds right to its edges.
 *
 * @param {number} alpha - Exponent, 0 < α < 1.
 * @param {number} [qMax=1e4] - Upper end of the band, as a multiple of its lower end.
 * @param {number} [perDecade=3] - Candidate corners per decade; fewer means a smaller network and a looser fit.
 * @returns {Array<object>} Corner atoms with weights.
 * @reads A module-level cache keyed by the arguments.
 */
export function fitFractional(alpha, qMax = 1e4, perDecade = 3) {
  const key = `${alpha}|${qMax}|${perDecade}`
  if (fractionalCache.has(key)) return fractionalCache.get(key)
  // Near α = 1 the response keeps rising almost linearly, so corners have to
  // reach further above the band before the sections turn resistive.
  const above = Math.min(6, Math.max(1, 0.5 / Math.max(1 - alpha, 0.05)))
  const decades = Math.log10(qMax) + 1 + above
  const atoms = logspace(0.1, qMax * Math.pow(10, above), Math.ceil(decades * perDecade) + 1).map((q0) => ({ kind: 'corner', q0 }))
  const samples = logspace(1, qMax, 160).map((q) => {
    const mag = Math.pow(q, alpha)
    const ph = (alpha * Math.PI) / 2
    return { q, z: { re: mag * Math.cos(ph), im: mag * Math.sin(ph) } }
  })
  const fit = fitAtoms(atoms, samples)
  fractionalCache.set(key, fit)
  return fit
}
