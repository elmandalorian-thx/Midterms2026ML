// Live results: poll Wikipedia's 2026 House page from the browser, parse called races,
// and update the forecast with what the results so far say about the national environment.
import { guide } from './data'
import { predict } from './model'
import type { District2026 } from './types'

export const PAGE = '2026 United States House of Representatives elections'
const API = 'https://en.wikipedia.org/w/api.php'

export interface Revision { revid: number; timestamp: string }
export interface Call { id: string; winner: 'D' | 'R' | 'O'; how: 'check' | 'status' }

/** Tiny request: the page's latest revision id. Only when it changes do we download the page. */
export async function fetchRevision(page = PAGE): Promise<Revision> {
  const u = `${API}?action=query&prop=revisions&titles=${encodeURIComponent(page)}&rvprop=ids|timestamp&format=json&formatversion=2&origin=*`
  const j = await (await fetch(u)).json()
  const r = j.query.pages[0].revisions[0]
  return { revid: r.revid, timestamp: r.timestamp }
}

export async function fetchWikitext(page = PAGE): Promise<{ text: string; rev: Revision }> {
  const u = `${API}?action=query&prop=revisions&titles=${encodeURIComponent(page)}&rvprop=ids|timestamp|content&rvslots=main&format=json&formatversion=2&origin=*`
  const j = await (await fetch(u)).json()
  const r = j.query.pages[0].revisions[0]
  return { text: r.slots.main.content, rev: { revid: r.revid, timestamp: r.timestamp } }
}

export const STATES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY',
  Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA',
  Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
}
const ABBR = new Set(Object.values(STATES))
const ROW = /^!\s*(?:rowspan="?\d+"?\s*\|)?\s*(?:\{\{ushr\|([A-Za-z ]+?)\|([\w-]+)\|x\}\}|\[\[([A-Z][A-Za-z ]+?)'s (?:(\d+)(?:st|nd|rd|th)|(at-large)) congressional district)/gim
const partyOf = (s: string): 'D' | 'R' | 'O' => (/Democratic/.test(s) ? 'D' : /Republican/.test(s) ? 'R' : 'O')

/** Port of ml/wiki_tables.py, reduced to what the tracker needs: which districts have a declared winner.
 *  A winner is the candidate line marked {{Aye}} (editors add it when a race is called); as a fallback,
 *  a status cell ending "Democratic hold/gain" or "Republican hold/gain". */
export function parseCalls(text: string): Call[] {
  const starts = [...text.matchAll(ROW)]
  const out = new Map<string, Call>()
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index! : text.length
    const block = text.slice(m.index!, end).split('\n|}')[0]
    let st: string | undefined, n: string
    if (m[1]) { st = STATES[m[1].trim()] ?? m[1].toUpperCase(); n = m[2].toUpperCase() } else { st = STATES[m[3]]; n = m[5] ? 'AL' : m[4] }
    if (!st || !ABBR.has(st)) return
    if (!/shading PVI|\b[RD]\+\d|EVEN/i.test(block)) return
    const split = block.search(/\{\{\s*plainlist|\{\{\s*Party stripe/i)
    if (split < 0) return
    const id = `${st}-${n === 'AL' || n === 'AT-LARGE' || n === '0' ? 'AL' : parseInt(n, 10)}`
    const cand = block.slice(split)
    const aye = cand.split('\n').find((l) => /\{\{(?:Aye|Yes2|tick)\}\}/i.test(l))
    if (aye) {
      const stripe = aye.match(/Party stripe\|([^}|]+)/)
      out.set(id, { id, winner: partyOf(stripe ? stripe[1] : aye), how: 'check' })
      return
    }
    const status = block.slice(0, split).match(/(Democratic|Republican|DFL) (hold|gain)\b/)
    if (status) out.set(id, { id, winner: status[1] === 'Republican' ? 'R' : 'D', how: 'status' })
  })
  return [...out.values()]
}

/** Backup feed: data/raw/districts_2026.csv, re-published by the GitHub Actions workflow every ~10 minutes. */
export async function fetchBackup(base: string): Promise<Call[]> {
  const text = await (await fetch(`${base}data/raw/districts_2026.csv?t=${Date.now()}`)).text()
  const [head, ...rows] = text.trim().split('\n')
  const cols = head.split(',')
  const iD = cols.indexOf('district'), iW = cols.indexOf('winner')
  return rows.map((r) => r.split(',')).filter((r) => r[iW] === 'D' || r[iW] === 'R' || r[iW] === 'O')
    .map((r) => ({ id: r[iD], winner: r[iW] as 'D' | 'R' | 'O', how: 'check' as const }))
}

/* ------------------------------------------------------------ nowcast */

export const GRID_LO = -25, GRID_HI = 35, STEP = 0.25
export const GRID = Array.from({ length: (GRID_HI - GRID_LO) / STEP + 1 }, (_, i) => GRID_LO + i * STEP)
const D = guide.districts
/** P(D) per district at every grid environment (rows = grid points), logistic regression. */
export const TABLE = GRID.map((e) => Float64Array.from(D, (d) => predict(d, e, 'logreg')))
export const gridIndex = (env: number) => Math.max(0, Math.min(GRID.length - 1, Math.round((env - GRID_LO) / STEP)))

/** Bayesian update of the national environment. Prior: the polls (mean = generic ballot, sd = assumed
 *  polling error). Likelihood: each called race's winner under the logistic model at that environment.
 *  `extra` adds log-likelihood from other evidence on the same grid (the Senate calls: one national mood, two chambers). */
export function posteriorEnv(called: Map<string, 'D' | 'R' | 'O'>, extra?: number[], prior = guide.forecast.env, sd = guide.forecast.sigmaEnv) {
  const idx = D.map((d, i) => [i, called.get(d.id)] as const).filter(([, w]) => w === 'D' || w === 'R')
  const logp = GRID.map((e, g) => {
    let s = -0.5 * ((e - prior) / sd) ** 2 + (extra ? extra[g] : 0)
    for (const [i, w] of idx) {
      const p = Math.min(1 - 1e-6, Math.max(1e-6, TABLE[g][i]))
      s += Math.log(w === 'D' ? p : 1 - p)
    }
    return s
  })
  const mx = Math.max(...logp)
  const w = logp.map((l) => Math.exp(l - mx))
  const z = w.reduce((a, b) => a + b, 0)
  const post = w.map((x) => x / z)
  const mean = GRID.reduce((s, e, g) => s + e * post[g], 0)
  const sdPost = Math.sqrt(GRID.reduce((s, e, g) => s + (e - mean) ** 2 * post[g], 0))
  return { post, mean, sd: sdPost }
}

export function priorCurve(prior = guide.forecast.env, sd = guide.forecast.sigmaEnv) {
  const w = GRID.map((e) => Math.exp(-0.5 * ((e - prior) / sd) ** 2))
  const z = w.reduce((a, b) => a + b, 0)
  return w.map((x) => x / z)
}

/** Seat simulation: called races are fixed; the rest are drawn at an environment sampled from the posterior. */
export function simulate(called: Map<string, 'D' | 'R' | 'O'>, post: number[], n = 4000, seed = 7) {
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const cdf: number[] = []
  post.reduce((s, p, i) => (cdf[i] = s + p), 0)
  const fixedD = D.reduce((s, d) => s + (called.get(d.id) === 'D' ? 1 : 0), 0)
  const open = D.map((d, i) => (called.has(d.id) ? -1 : i)).filter((i) => i >= 0)
  const counts = new Array(436).fill(0)
  for (let k = 0; k < n; k++) {
    const u = rand()
    let lo = 0, hi = cdf.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid }
    const row = TABLE[lo]
    let seats = fixedD
    for (const i of open) if (rand() < row[i]) seats++
    counts[seats]++
  }
  return counts
}

/* ------------------------------------------------------------ alerts */

export type AlertKind = 'call' | 'flip' | 'upset' | 'milestone' | 'info'
export interface Alert { id: string; t: number; kind: AlertKind; title: string; body: string; party?: 'D' | 'R'; district?: string }

const byId = new Map<string, District2026>(D.map((d) => [d.id, d]))
const name = (p: 'D' | 'R' | 'O') => (p === 'D' ? 'Democrat' : p === 'R' ? 'Republican' : 'third-party candidate')
const pc = (x: number) => `${Math.round(x * 100)}%`

/** Turn newly called races into alerts, comparing each with the frozen pre-election forecast. */
export function alertsFor(newCalls: Call[], before: Map<string, 'D' | 'R' | 'O'>, after: Map<string, 'D' | 'R' | 'O'>, t: number): Alert[] {
  const out: Alert[] = []
  for (const c of newCalls) {
    const d = byId.get(c.id)
    if (!d) continue
    const pWin = c.winner === 'D' ? d.pFrozen : c.winner === 'R' ? 1 - d.pFrozen : 0
    const held = d.incParty
    const flip = held && c.winner !== 'O' && held !== c.winner
    const party = c.winner === 'O' ? undefined : c.winner
    const fc = d.hasD && d.hasR ? `Frozen forecast gave the ${name(c.winner)} ${pc(pWin)}.` : 'Only one party on the November ballot: decided before Election Day.'
    if (pWin < 0.3 && d.hasD && d.hasR) {
      out.push({ id: `${c.id}-upset`, t, kind: 'upset', party, district: c.id, title: `Upset in ${c.id}`, body: `${name(c.winner)} wins${flip ? `, flipping a ${held === 'D' ? 'Democratic' : 'Republican'} seat` : ''}. ${fc}` })
    } else if (flip) {
      out.push({ id: `${c.id}-flip`, t, kind: 'flip', party, district: c.id, title: `${c.id} flips ${held} → ${c.winner}`, body: `${name(c.winner)} takes a seat held by ${held === 'D' ? 'Democrats' : 'Republicans'}. ${fc}` })
    } else {
      out.push({ id: `${c.id}-call`, t, kind: 'call', party, district: c.id, title: `${c.id} called for the ${name(c.winner)}`, body: `${d.newSeat ? 'New seat. ' : held ? `${held === c.winner ? 'Hold' : 'Seat'} · ` : ''}${fc}` })
    }
  }
  // Milestones
  const count = (m: Map<string, string>, p: string) => [...m.values()].filter((w) => w === p).length
  for (const p of ['D', 'R'] as const) {
    if (count(before, p) < 218 && count(after, p) >= 218) {
      out.push({ id: `maj-${p}`, t, kind: 'milestone', party: p, title: `${p === 'D' ? 'Democrats' : 'Republicans'} clinch the House majority`, body: `218 seats called. Frozen forecast: P(Democratic majority) ${pc(guide.forecast.frozen.pDemMajority)}.` })
    }
  }
  for (const k of [50, 100, 200, 300, 400, 435]) {
    if (before.size < k && after.size >= k) out.push({ id: `n-${k}`, t, kind: 'milestone', title: `${k} races called`, body: `${count(after, 'D')} Democratic · ${count(after, 'R')} Republican so far.` })
  }
  return out
}

/** A simulated election night for the demo: outcomes drawn from the frozen forecast with one shared national error,
 *  called roughly in the real order (safe seats and eastern states first, close western races last). */
export function demoNight(seed = Date.now()) {
  let a = seed >>> 0
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const shift = (rand() + rand() + rand() - 1.5) * 2 * guide.forecast.sigmaEnv
  const row = TABLE[gridIndex(guide.forecast.env + shift)]
  const west = new Set(['CA', 'OR', 'WA', 'NV', 'AZ', 'AK', 'HI', 'ID', 'UT', 'MT', 'CO', 'NM', 'WY'])
  const calls = D.map((d, i) => ({ id: d.id, winner: (rand() < row[i] ? 'D' : 'R') as 'D' | 'R', order: (1 - Math.abs(row[i] - 0.5) * 2) * 2 + (west.has(d.state) ? 1.2 : 0) + rand() * 0.8 }))
  return { shift, rand, calls: calls.sort((x, y) => x.order - y.order) }
}
