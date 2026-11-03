// In-browser twin of ml/build.py: same four features, same exported models.
import { guide } from './data'
import type { District2026, TreeNode } from './types'

export type Features = Record<string, number>
const sign = (p: string | null) => (p === 'D' ? 1 : p === 'R' ? -1 : 0)

/** Mirrors features() in build.py. + = Democratic, - = Republican, for every feature. */
export function districtFeatures(d: District2026, env: number): Features {
  return {
    pvi: d.pvi,
    env,
    inc: d.incRunning ? sign(d.incParty) : 0,
    held: sign(d.incParty),
  }
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
const featureKeys = guide.features.map((f) => f.key)

/** Logistic regression: P(D wins) plus each feature's push on the log-odds. */
export function logreg(x: Features) {
  const { mean, scale, coef, intercept } = guide.model.logreg
  const contributions = featureKeys.map((k, i) => ({ key: k, value: (coef[i] * (x[k] - mean[i])) / scale[i] }))
  const z = intercept + contributions.reduce((s, c) => s + c.value, 0)
  return { p: sigmoid(z), z, contributions }
}

function leafPath(nodes: TreeNode[], x: Features) {
  const path = [0]
  let i = 0
  while (nodes[i].l !== -1) {
    i = x[nodes[i].f!] <= nodes[i].t! ? nodes[i].l : nodes[i].r
    path.push(i)
  }
  return path
}

export function tree(x: Features) {
  const path = leafPath(guide.model.tree, x)
  return { p: guide.model.tree[path[path.length - 1]].p!, path }
}

export function gbm(x: Features) {
  const { init, lr, trees } = guide.model.gbm
  let z = init
  for (const nodes of trees) {
    const path = leafPath(nodes, x)
    z += lr * nodes[path[path.length - 1]].v!
  }
  return { p: sigmoid(z) }
}

/** Uncontested races are decided before anyone votes. */
export function fixed(d: District2026): number | null {
  if (d.hasD && !d.hasR) return 1
  if (d.hasR && !d.hasD) return 0
  return null
}

export function predict(d: District2026, env: number, model: 'logreg' | 'gbm' = 'logreg') {
  const f = fixed(d)
  if (f !== null) return f
  const x = districtFeatures(d, env)
  return model === 'logreg' ? logreg(x).p : gbm(x).p
}

export const featureLabel = (key: string) => guide.features.find((f) => f.key === key)?.label ?? key

/** Standard normal draw (Box-Muller). */
export function randn(rand: () => number) {
  const u = 1 - rand(), v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Small seeded PRNG so a given setting always replays the same simulation. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
