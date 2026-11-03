// Live scoreboard: grade every frozen model and every generic-ballot average on the races called so far.
// Nothing is refit: each model is evaluated exactly as it stood before Election Day.
import raw from '../data/markets.json'
import { guide, MAJORITY } from './data'
import { posteriorEnv } from './live'
import { districtFeatures, fixed, gbm, logreg, tree } from './model'
import { D_CONTROL, R_CONTROL, seatTotals, senate, senateP, sideOf, SR, SF, type SCall } from './senate'
import type { District2026, MarketKey, MarketQuotes, Markets, SenateRace2026 } from './types'

/** Prediction-market snapshot, frozen before polls closed. A benchmark only: never a model input. */
export const markets = raw as unknown as Markets

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

/* ------------------------------------------------------------ prediction markets */

const liquid = (q: MarketQuotes | undefined, k: MarketKey) => (q?.[k]?.liquid ? q[k]!.p : null)

export interface MarketRow {
  chamber: 'House' | 'Senate'; key: MarketKey; name: string
  priced: number // contested races with a liquid quote (graded once called)
  market: Score | null; model: Score | null; mClose: Score | null; modelClose: Score | null
}

/** Each market against the frozen model on exactly the called races that market priced: same races, same grading. */
export function scoreMarkets(obs: ReturnType<typeof observations>): MarketRow[] {
  const env = guide.forecast.env
  const contestedH = guide.districts.filter((d) => fixed(d) === null)
  const contestedS = SR.filter((r) => r.hasD && r.hasR)
  return markets.sources.flatMap(({ key, name }) => {
    const h = obs.house.filter((o) => liquid(markets.house[o.d.id], key) !== null)
    const s = obs.sen.filter((o) => liquid(markets.senate[o.r.id], key) !== null)
    const hm = both(h, (o) => liquid(markets.house[o.d.id], key)!), hd = both(h, (o) => houseP(o.d, env, HOUSE_CHOICE))
    const sm = both(s, (o) => liquid(markets.senate[o.r.id], key)!), sd = both(s, (o) => senateP(o.r, SF.env))
    return [
      { chamber: 'House' as const, key, name, priced: contestedH.filter((d) => liquid(markets.house[d.id], key) !== null).length,
        market: hm.s, model: hd.s, mClose: hm.close, modelClose: hd.close },
      { chamber: 'Senate' as const, key, name, priced: contestedS.filter((r) => liquid(markets.senate[r.id], key) !== null).length,
        market: sm.s, model: sd.s, mClose: sm.close, modelClose: sd.close },
    ]
  })
}

/** Who controls each chamber once enough seats are called (null = not decided yet). */
export function controlResult(called: Map<string, HCall>, sCalled: Map<string, SCall>) {
  let hD = 0, hR = 0
  for (const w of called.values()) { if (w === 'D') hD++; else if (w === 'R') hR++ }
  const t = seatTotals(sCalled)
  return {
    house: hD >= MAJORITY ? 'D' : hR >= MAJORITY ? 'R' : null,
    // Republicans need 50 (the VP breaks ties); Democrats 51, counting independents who win a stand-in race.
    senate: t.R >= R_CONTROL ? 'R' : t.D + t.I >= D_CONTROL ? 'D' : null,
  } as { house: 'D' | 'R' | null; senate: 'D' | 'R' | null }
}

export interface Disagreement { chamber: 'House' | 'Senate'; id: string; model: number; q: MarketQuotes; avg: number }

/** Contested races where the markets' average and the frozen model differ most (the interesting bets of the night). */
export function disagreements(k = 10): Disagreement[] {
  const avg = (q: MarketQuotes) => {
    const ps = markets.sources.map((s) => liquid(q, s.key)).filter((p): p is number => p !== null)
    return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null
  }
  const rows: Disagreement[] = []
  for (const d of guide.districts) {
    const q = markets.house[d.id], a = q && avg(q)
    if (fixed(d) === null && a != null) rows.push({ chamber: 'House', id: d.id, model: houseP(d, guide.forecast.env, HOUSE_CHOICE), q, avg: a })
  }
  for (const r of SR) {
    const q = markets.senate[r.id], a = q && avg(q)
    if (r.hasD && r.hasR && a != null) rows.push({ chamber: 'Senate', id: r.id, model: senateP(r, SF.env), q, avg: a })
  }
  return rows.sort((x, y) => Math.abs(y.avg - y.model) - Math.abs(x.avg - x.model)).slice(0, k)
}
