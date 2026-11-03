// Senate twin of lib/model.ts + lib/live.ts: the frozen Senate model, the Wikipedia race parser
// (port of ml/senate_tables.py), the nowcast and the alerts. Shares the national-environment grid with the House.
import raw from '../data/senate.json'
import { guide, MAJORITY } from './data'
import { GRID, STATES, TABLE, type Alert } from './live'
import type { Senate, SenateRace2026, Side, TreeNode } from './types'

export const senate = raw as unknown as Senate
export const SR = senate.races
export const SF = senate.forecast
export const SENATE_PAGE = '2026 United States Senate elections'
export const HOLD = SF.hold
/** Seats to control: Republicans 50 (the Vice President breaks ties), Democrats 51 (incl. the 2 independents who caucus with them) */
export const R_CONTROL = 50
export const D_CONTROL = 51
const STATE_NAME = Object.fromEntries(Object.entries(STATES).map(([n, a]) => [a, n])) as Record<string, string>
export const raceName = (r: { id: string; state: string }) => `${STATE_NAME[r.state] ?? r.state}${r.id.endsWith('-S') ? ' (special)' : ''}`

/* ------------------------------------------------------------ model (mirrors features() in ml/build_senate.py) */

const sign = (p: string | null) => (p === 'D' ? 1 : p === 'R' ? -1 : 0)
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
const KEYS = senate.features.map((f) => f.key)

export function senateFeatures(r: SenateRace2026, env: number): Record<string, number> {
  return { pvi: r.lean, env, inc: r.incRunning ? sign(r.incSide) : 0, held: sign(r.incSide) }
}

function gbmP(x: Record<string, number>) {
  const { init, lr, trees } = senate.model.gbm
  let z = init
  for (const nodes of trees as TreeNode[][]) {
    let i = 0
    while (nodes[i].l !== -1) i = x[nodes[i].f!] <= nodes[i].t! ? nodes[i].l : nodes[i].r
    z += lr * nodes[i].v!
  }
  return sigmoid(z)
}

/** P(the Democratic side wins) with one of the exported models ("pooled" = the frozen choice). */
export function senateP(r: SenateRace2026, env: number, key = senate.chosen) {
  if (r.hasD && !r.hasR) return 1
  if (r.hasR && !r.hasD) return 0
  const x = senateFeatures(r, env)
  if (key === 'gbm') return gbmP(x)
  const { mean, scale, coef, intercept } = senate.model.logreg[key]
  return sigmoid(intercept + KEYS.reduce((s, k, i) => s + (coef[i] * (x[k] - mean[i])) / scale[i], 0))
}

/** P(D side) per race at every grid environment (rows = grid points). */
export const STABLE = GRID.map((e) => Float64Array.from(SR, (r) => senateP(r, e)))

/* ------------------------------------------------------------ calls */

/** A called Senate race: the winner's party and name, or a runoff (Georgia requires a majority). */
export interface SCall { id: string; party: 'D' | 'R' | 'I' | 'O' | null; name: string | null; runoff?: boolean }
const byId = new Map(SR.map((r) => [r.id, r]))
export const sRace = (id: string) => byId.get(id)

const strip = (n: string | null) => (n ?? '').replace(/ \(I\)$/, '')
const lastName = (n: string) => n.replace(/\./g, ' ').split(/\s+/).filter((p) => p && !/^(jr|sr|ii|iii)$/i.test(p)).pop()?.toLowerCase() ?? ''

/** Which side won: the Democratic side (nominee or independent stand-in), the Republican side, or X (a third candidate). */
export function sideOf(r: SenateRace2026, c: SCall): Side | 'X' | null {
  if (c.runoff || !c.party) return null
  if (c.party === 'R') return 'R'
  if (c.party === 'D' && !r.dStandin) return 'D'
  if (c.name && r.dName && lastName(c.name) === lastName(strip(r.dName))) return 'D'
  return 'X'
}

/** Which caucus count the seat adds to: D, R, or I (an independent who caucuses with neither). */
export const seatOf = (c: SCall): 'D' | 'R' | 'I' | null => (c.runoff || !c.party ? null : c.party === 'D' || c.party === 'R' ? c.party : 'I')

const partyOfStripe = (s: string): 'D' | 'R' | 'I' | 'O' => {
  const t = s.toLowerCase()
  if ((t.includes('democratic') && !t.includes('republican') && !t.includes('social')) || t.includes('farmer') || t === 'dfl') return 'D'
  if (t.startsWith('republican')) return 'R'
  if (t.startsWith('independent')) return 'I'
  return 'O'
}
const nameOf = (line: string) => line
  .replace(/\{\{\s*sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2')
  .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>|\{\{[^}]*\}\}|'''/g, ' ')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
  .replace(/^[*\s]+/, '').split(' (')[0].replace(/\s+/g, ' ').trim()

/** Port of parse_senate_page(): one entry per race that has a declared winner ({{Aye}}) or a runoff. */
export function parseSenateCalls(text: string): SCall[] {
  const startSec = text.search(/=+\s*(?:Special elections during the preceding Congress|Elections leading to the next Congress)\s*=+/)
  if (startSec < 0) return []
  const rest = text.slice(startSec)
  const endM = rest.slice(1).search(/\n==[^=]/)
  const sec = endM >= 0 ? rest.slice(0, endM + 1) : rest
  const starts = [...sec.matchAll(/^!\s*\[\[([^|\]]*)\|([^\]]*)\]\]/gm)]
  const out = new Map<string, SCall>()
  starts.forEach((m, i) => {
    const label = m[2].replace(/<[^>]+>.*/, '').trim()
    const st = STATES[label] ?? STATES[m[1].replace(/^#/, '').split(' in ').pop()!.trim()]
    if (!st) return
    const end = i + 1 < starts.length ? starts[i + 1].index! : sec.length
    const block = sec.slice(m.index!, end).split('\n|}')[0]
    const id = /special/i.test(m[1]) ? `${st}-S` : st
    const split = block.search(/\{\{\s*plainlist/i)
    if (split < 0) return
    const head = block.slice(0, split)
    const cand = block.slice(split).replace(/(\{\{\s*plainlist\s*\|)\s*\*/i, '$1\n*')
    let win: SCall | null = null
    for (const line of cand.split('\n').filter((l) => l.startsWith('*'))) {
      const s = line.match(/Party stripe\|([^}|]+)/i)
      if (s && /\{\{(?:Aye|Yes2|tick)\}\}/i.test(line)) win = { id, party: partyOfStripe(s[1]), name: nameOf(line) }  // keep the last (runoff rows)
    }
    if (win) { out.set(id, win); return }
    const hold = head.match(/(Democratic|Republican|Independent) (hold|gain)\b/)
    if (hold) { out.set(id, { id, party: partyOfStripe(hold[1]), name: null }); return }
    // General-election runoff (Georgia needs a majority). Ignore primary runoffs ("nominated in runoff").
    if (/(?:advanc|head|go|proceed|move)\w*\s+to\s+(?:a\s+)?(?:general[- ]election\s+)?runoff/i.test(head) || /\{\{\s*Mby\s*\}\}/i.test(cand)) {
      out.set(id, { id, party: null, name: null, runoff: true })
    }
  })
  return [...out.values()].filter((c) => byId.has(c.id))
}

/** Minimal CSV line parser (quoted fields may hold commas). */
function csvLine(line: string) {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

/** Backup feed: data/raw/senate_2026.csv, re-published by the GitHub Actions workflow. */
export async function fetchSenateBackup(base: string): Promise<SCall[]> {
  const text = await (await fetch(`${base}data/raw/senate_2026.csv?t=${Date.now()}`)).text()
  const [head, ...rows] = text.trim().split(/\r?\n/)
  const cols = csvLine(head)
  const iR = cols.indexOf('race'), iW = cols.indexOf('winner'), iN = cols.indexOf('winner_name')
  return rows.map(csvLine).filter((r) => ['D', 'R', 'I', 'O'].includes(r[iW]))
    .map((r) => ({ id: r[iR], party: r[iW] as SCall['party'], name: r[iN] || null }))
}

/* ------------------------------------------------------------ nowcast */

/** Log-likelihood of the Senate calls at every grid environment: adds to the House evidence in posteriorEnv(). */
export function senateLogLik(called: Map<string, SCall>): number[] {
  const idx = SR.map((r, i) => [i, called.get(r.id) ? sideOf(r, called.get(r.id)!) : null] as const)
    .filter(([i, s]) => (s === 'D' || s === 'R') && SR[i].hasD && SR[i].hasR)
  return GRID.map((_, g) => idx.reduce((s, [i, w]) => {
    const p = Math.min(1 - 1e-6, Math.max(1e-6, STABLE[g][i]))
    return s + Math.log(w === 'D' ? p : 1 - p)
  }, 0))
}

/** Chamber simulation: called seats fixed, the rest drawn at environments from the posterior. */
export function simulateSenate(called: Map<string, SCall>, post: number[], n = 4000, seed = 11) {
  let a = seed >>> 0
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const cdf: number[] = []
  post.reduce((s, p, i) => (cdf[i] = s + p), 0)
  let fR = HOLD.R, fD = HOLD.D + HOLD.I_caucusD, fI = 0
  const open: number[] = []
  SR.forEach((r, i) => {
    const c = called.get(r.id)
    const seat = c ? seatOf(c) : null
    if (seat === 'R') fR++
    else if (seat === 'D') fD++
    else if (seat === 'I') fI++
    else open.push(i)
  })
  const hist = new Array(101).fill(0)
  let pR = 0, pD = 0
  for (let k = 0; k < n; k++) {
    const u = rand()
    let lo = 0, hi = cdf.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid }
    const row = STABLE[lo]
    let r = fR, d = fD
    for (const i of open) {
      if (rand() < row[i]) { if (!SR[i].dStandin) d++ } else r++
    }
    hist[r]++
    if (r >= R_CONTROL) pR++
    else if (d >= D_CONTROL) pD++
  }
  return { hist, pR: pR / n, pD: pD / n, pN: 1 - (pR + pD) / n, fixed: { R: fR, D: fD, I: fI } }
}

/* ------------------------------------------------------------ alerts */

const who = (p: string | null) => (p === 'D' ? 'Democrat' : p === 'R' ? 'Republican' : p === 'I' ? 'independent' : 'third-party candidate')
const pc = (x: number) => `${Math.round(x * 100)}%`

export function seatTotals(called: Map<string, SCall>) {
  let R = HOLD.R, D = HOLD.D + HOLD.I_caucusD, I = 0
  for (const c of called.values()) { const s = seatOf(c); if (s === 'R') R++; else if (s === 'D') D++; else if (s === 'I') I++ }
  return { R, D, I }
}

export function senateAlerts(newCalls: SCall[], before: Map<string, SCall>, after: Map<string, SCall>, t: number): Alert[] {
  const out: Alert[] = []
  for (const c of newCalls) {
    const r = byId.get(c.id)
    if (!r) continue
    const title = `Senate · ${raceName(r)}`
    if (c.runoff) {
      out.push({ id: `S-${c.id}-runoff`, t, kind: 'info', district: c.id, title: `${title} heads to a runoff`, body: 'No candidate won a majority, so the top two meet again. The seat stays uncalled until then.' })
      continue
    }
    const side = sideOf(r, c)
    const pWin = side === 'D' ? r.pFrozen : side === 'R' ? 1 - r.pFrozen : 0
    const seat = seatOf(c)
    const party = seat === 'D' || seat === 'R' ? seat : undefined
    const winner = c.name ? `${c.name} (${seat === 'I' ? 'I' : seat})` : who(c.party)
    const held = r.incParty
    const flip = held && seat && held !== seat
    const fc = r.hasD && r.hasR ? `Frozen forecast gave this side ${pc(pWin)}.` : 'Only one side on the ballot: decided before Election Day.'
    if (r.hasD && r.hasR && pWin < 0.3) out.push({ id: `S-${c.id}-upset`, t, kind: 'upset', party, district: c.id, title: `Upset: ${title}`, body: `${winner} wins${flip ? `, flipping a ${held === 'D' ? 'Democratic' : held === 'R' ? 'Republican' : 'independent'} seat` : ''}. ${fc}` })
    else if (flip) out.push({ id: `S-${c.id}-flip`, t, kind: 'flip', party, district: c.id, title: `${title} flips ${held} → ${seat}`, body: `${winner} wins. ${fc}` })
    else out.push({ id: `S-${c.id}-call`, t, kind: 'call', party, district: c.id, title: `${title}: ${winner}`, body: `${held === seat ? 'Hold. ' : ''}${fc}` })
  }
  const b = seatTotals(before), a = seatTotals(after)
  if (b.R < R_CONTROL && a.R >= R_CONTROL) out.push({ id: 'S-ctrl-R', t, kind: 'milestone', party: 'R', title: 'Republicans keep the Senate', body: `50 Republican seats (incl. ${HOLD.R} not up this year); the Vice President breaks ties. Frozen forecast: ${pc(SF.frozen.pRControl)}.` })
  if (b.D < D_CONTROL && a.D >= D_CONTROL) out.push({ id: 'S-ctrl-D', t, kind: 'milestone', party: 'D', title: 'Democrats win the Senate', body: `51 seats for Democrats and the independents who caucus with them. Frozen forecast: ${pc(SF.frozen.pDControl)}.` })
  return out
}

/* ------------------------------------------------------------ demo */

/** Simulated Senate night at the same national error as the House demo. */
export function senateDemo(shift: number, rand: () => number) {
  const g = Math.max(0, Math.min(GRID.length - 1, Math.round((SF.env + shift - GRID[0]) / (GRID[1] - GRID[0]))))
  const row = STABLE[g]
  const west = new Set(['AK', 'MT', 'CO', 'NM', 'OR', 'ID', 'WY'])
  return SR.map((r, i) => {
    const dWin = rand() < row[i]
    const call: SCall = dWin ? { id: r.id, party: r.dStandin ? 'I' : 'D', name: strip(r.dName) } : { id: r.id, party: 'R', name: r.rName }
    return { call, order: (1 - Math.abs(row[i] - 0.5) * 2) * 2 + (west.has(r.state) ? 1.2 : 0) + rand() * 0.8 }
  })
}

/* ------------------------------------------------------------ both chambers */

/** Control of Congress: House and Senate drawn at the SAME simulated national environment each run,
 *  so their correlation is built in. Returns P(House winner x Senate outcome), keys like "DR" (N = no majority). */
export function simulateCongress(calledH: Map<string, 'D' | 'R' | 'O'>, calledS: Map<string, SCall>, post: number[], n = 2500, seed = 23) {
  let a = seed >>> 0
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const cdf: number[] = []
  post.reduce((s, p, i) => (cdf[i] = s + p), 0)
  const H = guide.districts
  const fixedH = H.reduce((s, d) => s + (calledH.get(d.id) === 'D' ? 1 : 0), 0)
  const openH = H.map((d, i) => (calledH.has(d.id) ? -1 : i)).filter((i) => i >= 0)
  const { fixed } = simulateSenate(calledS, post, 1)
  const openS = SR.map((r, i) => (calledS.get(r.id) && seatOf(calledS.get(r.id)!) ? -1 : i)).filter((i) => i >= 0)
  const out: Record<string, number> = { DD: 0, DR: 0, DN: 0, RD: 0, RR: 0, RN: 0 }
  for (let k = 0; k < n; k++) {
    const u = rand()
    let lo = 0, hi = cdf.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid }
    let h = fixedH
    for (const i of openH) if (rand() < TABLE[lo][i]) h++
    let r = fixed.R, d = fixed.D
    for (const i of openS) { if (rand() < STABLE[lo][i]) { if (!SR[i].dStandin) d++ } else r++ }
    out[(h >= MAJORITY ? 'D' : 'R') + (r >= R_CONTROL ? 'R' : d >= D_CONTROL ? 'D' : 'N')]++
  }
  for (const k in out) out[k] /= n
  return out
}

/** The chosen logistic model's arithmetic for one race: each feature's push on the log-odds, relative to an average past race. */
export function senateContrib(r: SenateRace2026, env: number, key = senate.chosen) {
  const { mean, scale, coef, intercept } = senate.model.logreg[key]
  const x = senateFeatures(r, env)
  const parts = senate.features.map((f, i) => ({ key: f.key, label: f.label, x: x[f.key], push: (coef[i] * (x[f.key] - mean[i])) / scale[i] }))
  const z = intercept + parts.reduce((s, p) => s + p.push, 0)
  return { intercept, parts, z, p: sigmoid(z) }
}
