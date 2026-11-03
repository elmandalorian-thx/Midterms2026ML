// Live scoreboard: grade every frozen model and every generic-ballot average on the races called so far.
// Nothing is refit: each model is evaluated exactly as it stood before Election Day.
import { guide } from './data'
import { posteriorEnv } from './live'
import { districtFeatures, fixed, gbm, logreg, tree } from './model'
import { senate, senateP, sideOf, SR, SF, type SCall } from './senate'
import type { District2026, SenateRace2026 } from './types'

type HCall = 'D' | 'R' | 'O'
interface HObs { d: District2026; y: 0 | 1; close: boolean }
interface SObs { r: SenateRace2026; y: 0 | 1; close: boolean }

/** Competitive = lean within 5 points, the House guide's definition; safe seats tell models apart much less. */
export const CLOSE = 5

/** Called races that were actually contested (both sides on the ballot) and won by one of the two sides. */
export function observations(called: Map<string, HCall>, sCalled: Map<string, SCall>) {
  const house: HObs[] = []
  for (const d of guide.districts) {
    const w = called.get(d.id)
    if ((w === 'D' || w === 'R') && fixed(d) === null) house.push({ d, y: w === 'D' ? 1 : 0, close: Math.abs(d.pvi) <= CLOSE })
  }
  const sen: SObs[] = []
  for (const r of SR) {
    const c = sCalled.get(r.id)
    if (!c || c.runoff || !(r.hasD && r.hasR)) continue
    const side = sideOf(r, c)
    if (side === 'D' || side === 'R') sen.push({ r, y: side === 'D' ? 1 : 0, close: Math.abs(r.lean) <= CLOSE })
  }
  return { house, sen }
}

export function houseP(d: District2026, env: number, key: string) {
  const x = districtFeatures(d, env)
  return key === 'gbm' ? gbm(x).p : key === 'tree' ? tree(x).p : logreg(x).p
}

export interface Score { n: number; acc: number; brier: number; logloss: number }

function score(ps: number[], ys: (0 | 1)[]): Score | null {
  if (!ps.length) return null
  let hit = 0, b = 0, ll = 0
  ps.forEach((p, i) => {
    const y = ys[i]
    hit += (p > 0.5 ? 1 : p < 0.5 ? 0 : 0.5) === y ? 1 : p === 0.5 ? 0.5 : 0
    b += (p - y) ** 2
    const q = Math.min(1 - 1e-4, Math.max(1e-4, p))
    ll -= y ? Math.log(q) : Math.log(1 - q)
  })
  return { n: ps.length, acc: hit / ps.length, brier: b / ps.length, logloss: ll / ps.length }
}

export interface ModelRow { chamber: 'House' | 'Senate'; key: string; name: string; frozenChoice: boolean; s: Score | null; close: Score | null }

/** Score on all observations and on the close ones only. */
function both<T extends { y: 0 | 1; close: boolean }>(obs: T[], p: (o: T) => number) {
  const c = obs.filter((o) => o.close)
  return { s: score(obs.map(p), obs.map((o) => o.y)), close: score(c.map(p), c.map((o) => o.y)) }
}

const HOUSE_CHOICE = 'logreg' // the House forecast was frozen with logistic regression (forecast_2026.csv p_dem_logreg)
const SENATE_KEYS = [...Object.keys(senate.model.logreg), 'gbm']

/** Each candidate model at the frozen national environment, scored on the called races. */
export function scoreModels(obs: ReturnType<typeof observations>): ModelRow[] {
  const env = guide.forecast.env
  const house = guide.models.map((m) => ({
    chamber: 'House' as const, key: m.key, name: m.name, frozenChoice: m.key === HOUSE_CHOICE,
    ...both(obs.house, (o) => houseP(o.d, env, m.key)),
  }))
  const sen = SENATE_KEYS.map((k) => ({
    chamber: 'Senate' as const, key: k, name: senate.summary.find((m) => m.key === k)?.name ?? k, frozenChoice: k === senate.chosen,
    ...both(obs.sen, (o) => senateP(o.r, SF.env, k)),
  }))
  return [...house, ...sen]
}

export interface PollRow { source: string; margin: number; isAverage: boolean; gap: number; s: Score | null }

/** Two-party Democratic margin of each generic-ballot average (the same conversion the forecast used). */
export const POLLS = guide.forecast.genericBallot.rows.map((r) => ({
  source: r.source, margin: (100 * (r.dem - r.rep)) / (r.dem + r.rep), isAverage: r.source === 'Average',
}))

/** What the called races alone say about the national environment: a flat prior, so no polling average is favored. */
export function resultsOnlyEnv(called: Map<string, HCall>, senateLogLik: number[]) {
  return posteriorEnv(called, senateLogLik, 0, 1e4)
}

/** Each polling average: distance from the results-only estimate, and how well the frozen models would have scored had it been the input. */
export function scorePolls(obs: ReturnType<typeof observations>, estMean: number): PollRow[] {
  const ys = [...obs.house.map((o) => o.y), ...obs.sen.map((o) => o.y)]
  return POLLS.map((p) => ({
    ...p, gap: p.margin - estMean,
    s: score([...obs.house.map((o) => houseP(o.d, p.margin, HOUSE_CHOICE)), ...obs.sen.map((o) => senateP(o.r, p.margin))], ys),
  }))
}
