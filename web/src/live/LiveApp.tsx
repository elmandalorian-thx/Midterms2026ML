import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTween } from '../components/anim'
import { ChartFrame, Legend, linear, ticks, Tooltip, useWidth } from '../components/charts'
import { Hemicycle, SeatHistogram } from '../components/election'
import { PartyTag, probColor } from '../components/ui'
import { guide, lean, MAJORITY, pct } from '../lib/data'
import {
  alertsFor, demoNight, fetchBackup, fetchRevision, fetchWikitext, GRID, gridIndex, parseCalls, posteriorEnv, priorCurve, simulate, TABLE,
  type Alert, type AlertKind, type Call,
} from '../lib/live'
import {
  fetchSenateBackup, parseSenateCalls, D_CONTROL, R_CONTROL, SENATE_PAGE, senateAlerts, senateDemo, senateLogLik, SF, simulateCongress,
  senateP, simulateSenate, SR, seatOf, seatTotals, sideOf, type SCall,
} from '../lib/senate'
import './live.css'
import { CongressGrid, RaceCards, ReadCard, SenateBar } from './SenatePanels'
import { SiteSwitcher } from '../components/SiteNav'
import { Scoreboard } from './Scoreboard'

type W = 'D' | 'R' | 'O'
interface Point { t: number; called: number; pMaj: number; env: number }
const D = guide.districts
const F = guide.forecast
const GUIDE_URL = import.meta.env.BASE_URL
const STORE = 'house26-live-v1'
const STORE_S = 'senate26-live-v1'
type Tab = 'house' | 'senate' | 'congress' | 'score'

function load<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked */ } }

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => load<'light' | 'dark' | null>('theme-live', null) ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => { document.documentElement.dataset.theme = theme; save('theme-live', theme) }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const
}

function beep(kind: AlertKind) {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = kind === 'upset' || kind === 'milestone' ? 880 : kind === 'flip' ? 660 : 520
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    o.connect(g).connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + 0.4)
  } catch { /* audio unavailable */ }
}

const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`
}
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const KIND_LABEL: Record<AlertKind, string> = { call: 'Call', flip: 'Flip', upset: 'Upset', milestone: 'Milestone', info: 'Update' }
const KIND_ICON: Record<AlertKind, string> = { call: '✓', flip: '⇄', upset: '!', milestone: '★', info: 'i' }

/* ------------------------------------------------------------ race to 218 */

function RaceBar({ d, r, expD, expR }: { d: number; r: number; expD: number; expR: number }) {
  const dT = useTween(d, 800), rT = useTween(r, 800)
  const eD = useTween(expD, 800), eR = useTween(expR, 800)
  const w = (x: number) => `${(x / 435) * 100}%`
  return (
    <div className="race">
      <div className="race-nums">
        <div className="side"><span className="race-big tabular">{Math.round(dT)}</span><span className="party"><i style={{ background: 'var(--dem)' }} />Democrats</span></div>
        <div className="race-mid"><b>{MAJORITY}</b><br />to win</div>
        <div className="side right"><span className="race-big tabular">{Math.round(rT)}</span><span className="party"><i style={{ background: 'var(--rep)' }} />Republicans</span></div>
      </div>
      <div className="race-track" role="img" aria-label={`${d} Democratic and ${r} Republican seats called; ${435 - d - r} uncalled`}>
        <div className="race-seg" style={{ left: 0, width: w(dT), background: 'var(--dem)' }} />
        <div className="race-seg ghost" style={{ left: w(dT), width: w(Math.max(0, eD - dT)), background: 'var(--dem)' }} />
        <div className="race-seg" style={{ right: 0, width: w(rT), background: 'var(--rep)' }} />
        <div className="race-seg ghost" style={{ right: w(rT), width: w(Math.max(0, eR - rT)), background: 'var(--rep)' }} />
        <div className="race-line" style={{ left: w(MAJORITY) }} />
      </div>
      <div className="race-foot muted">
        <span>Solid = called · faded = projected from results so far (expected seats)</span>
        <span>{435 - d - r} uncalled</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ small charts */

function Spark({ points, height = 180 }: { points: Point[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const m = { l: 40, r: 12, t: 10, b: 24 }
  if (points.length < 2) return <div ref={ref} className="empty">The line starts after the second update.</div>
  const x = linear(points[0].t, points[points.length - 1].t, m.l, width - m.r)
  const y = linear(0, 1, height - m.b, m.t)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p.pMaj)}`).join('')
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={height}
        onMouseMove={(e) => {
          const px = e.clientX - e.currentTarget.getBoundingClientRect().left
          let best = 0
          points.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i })
          setHover(best)
        }} onMouseLeave={() => setHover(null)}>
        {ticks(0, 1, 4).map((t) => <g key={t}><line className="gridline" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
          <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{pct(t, 0)}</text></g>)}
        <line x1={m.l} x2={width - m.r} y1={y(0.5)} y2={y(0.5)} stroke="var(--axis)" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        <text x={m.l} y={height - 6}>{clock(points[0].t)}</text>
        <text x={width - m.r} y={height - 6} textAnchor="end">{clock(points[points.length - 1].t)}</text>
        {hover !== null && <circle cx={x(points[hover].t)} cy={y(points[hover].pMaj)} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />}
      </svg>
      {hover !== null && (
        <Tooltip x={x(points[hover].t)} y={y(points[hover].pMaj)}>
          <div className="muted">{clock(points[hover].t)} · {points[hover].called} called</div>
          P(Dem majority) <b>{pct(points[hover].pMaj, 0)}</b> · env {lean(points[hover].env, 1)}
        </Tooltip>
      )}
    </div>
  )
}

function EnvChart({ prior, post }: { prior: number[]; post: number[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const h = 190, m = { l: 12, r: 12, t: 10, b: 26 }
  const lo = -10, hi = 25
  const x = linear(lo, hi, m.l, width - m.r)
  const sl = GRID.map((e, i) => ({ e, a: prior[i], b: post[i] })).filter((p) => p.e >= lo && p.e <= hi)
  const max = Math.max(...sl.map((p) => Math.max(p.a, p.b)), 1e-9)
  const y = linear(0, max, h - m.b, m.t)
  const area = (k: 'a' | 'b') => `M${x(lo)},${y(0)}` + sl.map((p) => `L${x(p.e)},${y(p[k])}`).join('') + `L${x(hi)},${y(0)}Z`
  return (
    <div ref={ref} className="chart">
      <svg width={width} height={h} role="img" aria-label="Prior and updated belief about the national environment">
        {ticks(lo, hi, 7).map((t) => <text key={t} x={x(t)} y={h - 8} textAnchor="middle">{lean(t)}</text>)}
        <line className="axisline" x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} />
        <path d={area('a')} fill="var(--axis)" fillOpacity={0.35} stroke="var(--axis)" strokeWidth={1.5} />
        <path d={area('b')} fill="var(--series-3)" fillOpacity={0.22} stroke="var(--series-3)" strokeWidth={2} style={{ transition: 'd .6s ease' }} />
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------ app */

export default function LiveApp() {
  const [theme, toggleTheme] = useTheme()
  const saved = load<{ calls: [string, W][]; alerts: Alert[]; history: Point[]; rev?: number; revTime?: string }>(STORE, { calls: [], alerts: [], history: [] })
  const [called, setCalled] = useState<Map<string, W>>(() => new Map(saved.calls))
  const [alerts, setAlerts] = useState<Alert[]>(saved.alerts)
  const [history, setHistory] = useState<Point[]>(saved.history)
  const [rev, setRev] = useState<{ id?: number; time?: string }>({ id: saved.rev, time: saved.revTime })
  const savedS = load<{ calls: [string, SCall][]; rev?: number; revTime?: string }>(STORE_S, { calls: [] })
  const [sCalled, setSCalled] = useState<Map<string, SCall>>(() => new Map(savedS.calls))
  const [sRev, setSRev] = useState<{ id?: number; time?: string }>({ id: savedS.rev, time: savedS.revTime })
  const [tab, setTabState] = useState<Tab>(() => load<Tab>('live-tab', 'house'))
  const setTab = (t: Tab) => { setTabState(t); save('live-tab', t) }
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'backup' | 'error'>('idle')
  const [lastCheck, setLastCheck] = useState<number | null>(null)
  const [interval, setIntervalS] = useState(120)
  const [paused, setPaused] = useState(false)
  const [demo, setDemo] = useState(false)
  const [demoSpeed, setDemoSpeed] = useState(4)
  const [notify, setNotify] = useState(false)
  const [sound, setSound] = useState(false)
  const [filter, setFilter] = useState<'all' | AlertKind>('all')
  const [now, setNow] = useState(Date.now())
  const [q, setQ] = useState('')
  const live = useRef({ called, notify, sound, rev, sCalled, sRev })
  live.current = { called, notify, sound, rev, sCalled, sRev }
  const fresh = useRef<Set<string>>(new Set())

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  // Persist the real feed (never the demo)
  useEffect(() => {
    if (!demo) save(STORE, { calls: [...called], alerts: alerts.slice(0, 300), history: history.slice(-500), rev: rev.id, revTime: rev.time })
  }, [called, alerts, history, rev, demo])
  useEffect(() => { if (!demo) save(STORE_S, { calls: [...sCalled], rev: sRev.id, revTime: sRev.time }) }, [sCalled, sRev, demo])

  /** Show new alerts; beep / notify for the most important one. */
  const emit = useCallback((made: Alert[], quiet: boolean) => {
    if (!made.length) return
    made.forEach((a) => fresh.current.add(a.id))
    setTimeout(() => made.forEach((a) => fresh.current.delete(a.id)), 4000)
    setAlerts((prev) => [...[...made].reverse(), ...prev].slice(0, 400))
    if (quiet) return
    const top = made.find((a) => a.kind === 'milestone') ?? made.find((a) => a.kind === 'upset') ?? made.find((a) => a.kind === 'flip') ?? made[0]
    if (live.current.sound) beep(top.kind)
    if (live.current.notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(made.length > 1 ? `${top.title} (+${made.length - 1} more)` : top.title, { body: top.body, tag: 'midterms26' })
    }
  }, [])

  /** Senate: merge a batch of calls (winners or runoffs), alert on what changed. */
  const ingestS = useCallback((batch: SCall[], quiet = false) => {
    const before = live.current.sCalled
    const after = new Map(before)
    const same = (a?: SCall, b?: SCall) => !!a && !!b && a.party === b.party && !!a.runoff === !!b.runoff
    const newCalls = batch.filter((c) => !same(before.get(c.id), c))
    for (const c of batch) after.set(c.id, c)
    if (!newCalls.length) return
    live.current.sCalled = after
    setSCalled(after)
    emit(senateAlerts(newCalls, before, after, Date.now()), quiet)
  }, [emit])

  /** Merge a batch of calls: diff against what we had, emit alerts, notify. */
  const ingest = useCallback((batch: Call[], quiet = false) => {
    const before = live.current.called
    const after = new Map(before)
    const newCalls = batch.filter((c) => before.get(c.id) !== c.winner)
    for (const c of batch) after.set(c.id, c.winner)
    if (!newCalls.length) return
    live.current.called = after
    setCalled(after)
    emit(alertsFor(newCalls, before, after, Date.now()), quiet)
  }, [emit])

  // Real feed: check the revision id; download + parse only when the page changed.
  const poll = useCallback(async () => {
    setStatus('checking')
    try {
      const r = await fetchRevision()
      if (r.revid !== live.current.rev.id) {
        const { text, rev: rv } = await fetchWikitext()
        const firstLoad = live.current.rev.id === undefined
        ingest(parseCalls(text), firstLoad)
        setRev({ id: rv.revid, time: rv.timestamp })
      }
      const sr = await fetchRevision(SENATE_PAGE)
      if (sr.revid !== live.current.sRev.id) {
        const { text, rev: rv } = await fetchWikitext(SENATE_PAGE)
        ingestS(parseSenateCalls(text), live.current.sRev.id === undefined)
        setSRev({ id: rv.revid, time: rv.timestamp })
      }
      setStatus('ok')
    } catch {
      // Wikipedia unreachable or rate-limited: fall back to the copies our GitHub Action publishes
      try {
        ingest(await fetchBackup(GUIDE_URL), live.current.rev.id === undefined && live.current.called.size === 0)
        ingestS(await fetchSenateBackup(GUIDE_URL), live.current.sRev.id === undefined && live.current.sCalled.size === 0)
        setStatus('backup')
      } catch {
        setStatus('error')
      }
    }
    setLastCheck(Date.now())
  }, [ingest, ingestS])

  useEffect(() => {
    if (demo || paused) return
    poll()
    const t = setInterval(poll, interval * 1000)
    return () => clearInterval(t)
  }, [demo, paused, interval, poll])

  // Demo: replay a simulated night into a separate, unsaved state
  const demoRef = useRef<{ calls: ({ h: Call } | { s: SCall })[]; i: number } | null>(null)
  const startDemo = () => {
    const night = demoNight()
    const timeline = [
      ...night.calls.map((c) => ({ item: { h: { id: c.id, winner: c.winner, how: 'check' as const } }, order: c.order })),
      ...senateDemo(night.shift, night.rand).map((c) => ({ item: { s: c.call }, order: c.order })),
    ].sort((a, b) => a.order - b.order)
    demoRef.current = { calls: timeline.map((t) => t.item), i: 0 }
    live.current.called = new Map(); live.current.sCalled = new Map()
    setCalled(new Map()); setSCalled(new Map()); setAlerts([]); setHistory([])
    setDemo(true)
  }
  const stopDemo = () => {
    demoRef.current = null
    const s = load<{ calls: [string, W][]; alerts: Alert[]; history: Point[] }>(STORE, { calls: [], alerts: [], history: [] })
    const ss = load<{ calls: [string, SCall][] }>(STORE_S, { calls: [] })
    live.current.called = new Map(s.calls); live.current.sCalled = new Map(ss.calls)
    setCalled(new Map(s.calls)); setSCalled(new Map(ss.calls)); setAlerts(s.alerts); setHistory(s.history)
    setDemo(false)
  }
  useEffect(() => {
    if (!demo || paused) return
    const t = setInterval(() => {
      const st = demoRef.current
      if (!st || st.i >= st.calls.length) return
      const n = Math.max(1, Math.round(demoSpeed * (0.5 + Math.random())))
      const batch = st.calls.slice(st.i, st.i + n)
      const hs = batch.flatMap((b) => ('h' in b ? [b.h] : [])), ss = batch.flatMap((b) => ('s' in b ? [b.s] : []))
      if (hs.length) ingest(hs)
      if (ss.length) ingestS(ss)
      st.i += n
    }, 900)
    return () => clearInterval(t)
  }, [demo, paused, demoSpeed, ingest, ingestS])

  // Nowcast from the calls so far
  const sLogLik = useMemo(() => senateLogLik(sCalled), [sCalled])
  const { post, mean, sd } = useMemo(() => posteriorEnv(called, sLogLik), [called, sLogLik])
  const prior = useMemo(() => priorCurve(), [])
  const counts = useMemo(() => simulate(called, post, 3000), [called, post])
  const total = counts.reduce((a, b) => a + b, 0)
  const pMaj = counts.slice(MAJORITY).reduce((a, b) => a + b, 0) / total
  const quant = (qq: number) => { let c = 0; for (let i = 0; i < 436; i++) { c += counts[i]; if (c >= qq * total) return i } return 435 }
  const row = TABLE[gridIndex(mean)]
  const probs = D.map((d, i) => (called.has(d.id) ? (called.get(d.id) === 'D' ? 1 : 0) : row[i]))
  const expD = probs.reduce((a, b) => a + b, 0)
  const nD = [...called.values()].filter((w) => w === 'D').length
  const nR = [...called.values()].filter((w) => w === 'R').length

  // Senate: chamber odds, expected seats, race probabilities at the updated environment
  const sSim = useMemo(() => simulateSenate(sCalled, post, 3000), [sCalled, post])
  // Exact, not the 0.25-point grid: otherwise rounding alone could make "now" differ from "frozen" before any call.
  const sProbs = useMemo(() => SR.map((r) => senateP(r, mean)), [mean])
  const sTot = seatTotals(sCalled)
  const sExp = SR.reduce((acc, r, i) => {
    const c = sCalled.get(r.id)
    if (c && seatOf(c)) return acc
    return { d: acc.d + (r.dStandin ? 0 : sProbs[i]), r: acc.r + 1 - sProbs[i] }
  }, { d: 0, r: 0 })
  const sDone = [...sCalled.values()].filter((c) => seatOf(c)).length
  const sRecord = useMemo(() => {
    let hit = 0, n = 0, brier = 0
    for (const r of SR) {
      const c = sCalled.get(r.id)
      const side = c ? sideOf(r, c) : null
      if ((side !== 'D' && side !== 'R') || !(r.hasD && r.hasR)) continue
      const y = side === 'D' ? 1 : 0
      n++; hit += Number((r.pFrozen >= 0.5) === (y === 1)); brier += (r.pFrozen - y) ** 2
    }
    return { n, hit, brier: n ? brier / n : null }
  }, [sCalled])
  const joint = useMemo(() => (tab === 'congress' ? simulateCongress(called, sCalled, post) : null), [tab, called, sCalled, post])

  // History of the nowcast (one point per change in calls)
  useEffect(() => {
    setHistory((h) => (h.length && h[h.length - 1].called === called.size ? h : [...h, { t: Date.now(), called: called.size, pMaj, env: mean }].slice(-500)))
  }, [called.size, pMaj, mean])

  // Forecast record among called contested races
  const record = useMemo(() => {
    let hit = 0, n = 0, brier = 0
    for (const d of D) {
      const w = called.get(d.id)
      if (!w || w === 'O' || !(d.hasD && d.hasR)) continue
      const y = w === 'D' ? 1 : 0
      n++; hit += Number((d.pFrozen >= 0.5) === (y === 1)); brier += (d.pFrozen - y) ** 2
    }
    return { n, hit, brier: n ? brier / n : null }
  }, [called])

  const watch = useMemo(() => {
    const s = q.trim().toUpperCase()
    return D.map((d, i) => ({ d, p: probs[i], w: called.get(d.id) }))
      .filter(({ d, w }) => (s ? d.id.includes(s) || d.state === s : !w && d.hasD && d.hasR))
      .sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5)).slice(0, s ? 60 : 14)
  }, [q, probs, called])

  const shown = alerts.filter((a) => filter === 'all' || a.kind === filter)
  const countBy = (k: AlertKind) => alerts.filter((a) => a.kind === k).length
  const nextIn = lastCheck ? Math.max(0, Math.round((lastCheck + interval * 1000 - now) / 1000)) : null
  const seats = D.map((d, i) => ({ id: d.id, p: probs[i], note: called.has(d.id) ? `Called: ${called.get(d.id)}` : `Uncalled · P(Dem) ${pct(probs[i], 0)}` }))

  const pollControls = !demo && (
    <div className="seg" role="group" aria-label="Polling interval">
      {[60, 120, 300].map((s) => <button key={s} aria-pressed={interval === s} onClick={() => setIntervalS(s)}>{s / 60} min</button>)}
      <button onClick={() => poll()} disabled={status === 'checking'}>↻ Now</button>
    </div>
  )
  const senateByEnv = SF.byEnv

  const askNotify = async () => {
    if (!('Notification' in window)) return
    if (notify) { setNotify(false); return }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setNotify(p === 'granted')
  }

  return (
    <div className="live-page">
      <header className="live-top">
        <div className="live-nav">
          <a href={GUIDE_URL} className="brand">Midterms 2026</a>
          <SiteSwitcher current="live" row />
        </div>
        <div className={`status ${demo ? 'demo' : paused ? 'paused' : status}`}>
          <i />{demo ? 'DEMO REPLAY' : paused ? 'PAUSED' : status === 'error' ? 'RETRYING' : status === 'backup' ? 'LIVE · BACKUP FEED' : 'LIVE'}
          {!demo && !paused && <span className="muted tabular">{status === 'checking' ? 'checking…' : nextIn !== null ? `next check ${nextIn}s` : ''}</span>}
        </div>
        <div className="top-actions">
          <button className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
          <button className="btn" aria-pressed={notify} onClick={askNotify} title="Browser notification when this tab is in the background">{notify ? '🔔 On' : '🔕 Alerts'}</button>
          <button className="btn" aria-pressed={sound} onClick={() => setSound((s) => !s)} title={sound ? 'Sound alerts on: click to mute' : 'Sound alerts off: click for a chime on each call'} aria-label={sound ? 'Mute sound alerts' : 'Turn on sound alerts'}>{sound ? '🔊' : '🔈'}</button>
          <button className="btn" onClick={toggleTheme} title="Light / dark mode" aria-label="Toggle light and dark mode">{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
      </header>

      {demo && (
        <div className="banner">
          <b>Simulated replay, not real results.</b> Outcomes are drawn from the frozen forecast with a random national polling error, so you can see how the
          tracker behaves. <span className="seg" style={{ marginLeft: 8 }}>{[1, 4, 12].map((s) => <button key={s} aria-pressed={demoSpeed === s} onClick={() => setDemoSpeed(s)}>{s}×</button>)}</span>
          <button className="btn" style={{ marginLeft: 8 }} onClick={stopDemo}>Back to live data</button>
        </div>
      )}

      <main className="live-main">
        <div className="tabs" role="group" aria-label="Chamber">
          {([['house', 'House'], ['senate', 'Senate'], ['congress', 'Control of Congress'], ['score', 'Scoreboard']] as const).map(([k, label]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {tab === 'house' && <section className="panel hero-panel">
          <div className="hero-head">
            <div>
              <h1>Race to 218</h1>
              <p className="muted" style={{ margin: 0 }}>
                {demo ? 'Simulated feed' : <>Source: Wikipedia's 2026 House results tables, polled every {interval / 60} min{rev.time ? ` · page updated ${clock(Date.parse(rev.time))}` : ''}</>}
              </p>
            </div>
            {pollControls}
          </div>
          <RaceBar d={nD} r={nR} expD={expD} expR={435 - expD} />
          <div className="kpis">
            <div className="kpi"><div className="kpi-label">Races called</div><div className="kpi-value tabular">{called.size}<span className="muted"> / 435</span></div></div>
            <div className="kpi"><div className="kpi-label">P(Democratic majority), now</div><div className="kpi-value tabular">{pct(pMaj, 0)}</div>
              <div className="kpi-note">frozen forecast: {pct(F.frozen.pDemMajority, 0)}</div></div>
            <div className="kpi"><div className="kpi-label">Projected seats (80% range)</div><div className="kpi-value tabular">{quant(0.5)} D</div>
              <div className="kpi-note">{quant(0.1)}–{quant(0.9)} · R {435 - quant(0.5)}</div></div>
            <div className="kpi"><div className="kpi-label">Forecast record so far</div><div className="kpi-value tabular">{record.n ? `${record.hit}/${record.n}` : '—'}</div>
              <div className="kpi-note">{record.brier !== null ? `Brier ${record.brier.toFixed(3)} · contested races` : 'contested races, frozen forecast'}</div></div>
          </div>
          {!called.size && !demo && (
            <div className="empty-state">
              <b>No House races called yet.</b> Polls close from 6 p.m. Eastern; this page checks for calls every {interval / 60} min and alerts you as they land.
              <button className="btn btn-primary" onClick={startDemo}>Watch a simulated replay meanwhile</button>
            </div>
          )}
        </section>}

        {tab === 'senate' && <section className="panel hero-panel">
          <div className="hero-head">
            <div>
              <h1>Race for the Senate</h1>
              <p className="muted" style={{ margin: 0 }}>
                {demo ? 'Simulated feed' : <>Source: Wikipedia's 2026 Senate results tables, polled every {interval / 60} min{sRev.time ? ` · page updated ${clock(Date.parse(sRev.time))}` : ''}</>}
              </p>
            </div>
            {pollControls}
          </div>
          <SenateBar d={sTot.D} r={sTot.R} i={sTot.I} expD={sTot.D + sExp.d} expR={sTot.R + sExp.r} />
          <div className="kpis">
            <div className="kpi"><div className="kpi-label">Races called</div><div className="kpi-value tabular">{sDone}<span className="muted"> / {SR.length}</span></div>
              <div className="kpi-note">{[...sCalled.values()].some((c) => c.runoff) ? 'runoff pending' : `${100 - SR.length} seats not up this year`}</div></div>
            <div className="kpi"><div className="kpi-label">P(Republicans keep control), now</div><div className="kpi-value tabular">{pct(sSim.pR, 0)}</div>
              <div className="kpi-note">frozen forecast: {pct(SF.frozen.pRControl, 0)}</div></div>
            <div className="kpi"><div className="kpi-label">P(Democrats take control), now</div><div className="kpi-value tabular">{pct(sSim.pD, 0)}</div>
              <div className="kpi-note">frozen {pct(SF.frozen.pDControl, 0)} · no majority {pct(sSim.pN, 0)}</div></div>
            <div className="kpi"><div className="kpi-label">Forecast record so far</div><div className="kpi-value tabular">{sRecord.n ? `${sRecord.hit}/${sRecord.n}` : '—'}</div>
              <div className="kpi-note">{sRecord.brier !== null ? `Brier ${sRecord.brier.toFixed(3)} · contested races` : 'contested races, frozen forecast'}</div></div>
          </div>
          {!sDone && !demo && (
            <div className="empty-state">
              <b>No Senate races called yet.</b> Republicans need {R_CONTROL} seats (the Vice President breaks a 50–50 tie); Democrats need {D_CONTROL}.
              <button className="btn btn-primary" onClick={startDemo}>Watch a simulated replay meanwhile</button>
            </div>
          )}
        </section>}

        {tab === 'congress' && <section className="panel hero-panel">
          <div className="hero-head">
            <div>
              <h1>Control of Congress</h1>
              <p className="muted" style={{ margin: 0 }}>Both chambers simulated together at the same national mood, updated with every call in either chamber.</p>
            </div>
            {pollControls}
          </div>
          <CongressGrid joint={joint ?? SF.frozen.joint} />
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 0 }}>
            “If independent” multiplies the two chambers' separate odds, as if they had nothing to do with each other. They do: one polling miss
            moves every race the same way. Before the election, a polling miss toward Republicans meant P(Republican Senate) {pct(SF.frozen.joint.DR + SF.frozen.joint.RR, 0)} overall
            but {pct(senateByEnv[0].pSenateR, 0)} in that world, versus {pct(senateByEnv[2].pSenateR, 0)} if the polls had underrated Democrats.
          </p>
        </section>}

        <div className="live-grid">
          <div className="col-main">
            {tab === 'score' && <Scoreboard called={called} sCalled={sCalled} sLogLik={sLogLik} controls={pollControls} />}
            {tab === 'senate' && <>
              <section className="panel">
                <div className="hero-head">
                  <div><h2>All {SR.length} races</h2><p className="muted sub" style={{ margin: 0 }}>Closest uncalled first. Probabilities update with every call in either chamber.</p></div>
                  <input type="search" placeholder="State or candidate, e.g. Texas" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
                </div>
                <ReadCard env={{ mean, sd }} probs={sProbs} />
                <RaceCards called={sCalled} probs={sProbs} q={q} env={{ mean, sd }} />
              </section>
              <div className="two">
                <section className="panel">
                  <h2>Republican seats, simulated</h2>
                  <p className="muted sub">Called seats fixed; the rest drawn 3,000 times at the updated national mood.</p>
                  <SeatHistogram counts={sSim.hist} total={sSim.hist.reduce((a, b) => a + b, 0)} lo={40} hi={62} height={200} majority={R_CONTROL}
                    above="var(--rep)" below="var(--dem)" describe={(n) => `${n} Republican seats`} />
                  <Legend items={[{ label: 'Republican control (50+)', color: 'var(--rep)' }, { label: 'Republicans short of 50', color: 'var(--dem)' }]} />
                </section>
                <section className="panel">
                  <h2>What all results say about the national mood</h2>
                  <p className="muted sub">House and Senate calls are evidence about the same national environment.</p>
                  <EnvChart prior={prior} post={post} />
                  <Legend items={[{ label: `Polls: ${lean(F.env, 1)} ± ${F.sigmaEnv}`, color: 'var(--axis)' }, { label: `Results so far: ${lean(mean, 1)} ± ${sd.toFixed(1)}`, color: 'var(--series-3)' }]} />
                </section>
              </div>
            </>}
            {tab === 'congress' && <>
              <section className="panel">
                <h2>House</h2>
                <RaceBar d={nD} r={nR} expD={expD} expR={435 - expD} />
                <p className="muted sub" style={{ marginTop: 8 }}>P(Democratic majority) now {pct(pMaj, 0)} · frozen {pct(F.frozen.pDemMajority, 0)}</p>
              </section>
              <section className="panel">
                <h2>Senate</h2>
                <SenateBar d={sTot.D} r={sTot.R} i={sTot.I} expD={sTot.D + sExp.d} expR={sTot.R + sExp.r} />
                <p className="muted sub" style={{ marginTop: 8 }}>P(Republican control) now {pct(sSim.pR, 0)} · frozen {pct(SF.frozen.pRControl, 0)}</p>
              </section>
              <section className="panel">
                <h2>One national mood, two chambers</h2>
                <p className="muted sub">Gray: belief from polls. Aqua: updated with every called race in either chamber.</p>
                <EnvChart prior={prior} post={post} />
                <Legend items={[{ label: `Polls: ${lean(F.env, 1)} ± ${F.sigmaEnv}`, color: 'var(--axis)' }, { label: `Results so far: ${lean(mean, 1)} ± ${sd.toFixed(1)}`, color: 'var(--series-3)' }]} />
              </section>
            </>}
            {tab === 'house' && <>
            <section className="panel">
              <h2>The House, as results come in</h2>
              <p className="muted sub">Called seats are solid; uncalled seats are shaded by the updated probability. Hover a seat.</p>
              <Hemicycle seats={seats} height={260} />
            </section>
            <div className="two">
              <section className="panel">
                <h2>What the results say about the national mood</h2>
                <p className="muted sub">Gray: belief from polls ({lean(F.env, 1)}). Aqua: updated with every called race, House and Senate.</p>
                <EnvChart prior={prior} post={post} />
                <Legend items={[{ label: `Polls: ${lean(F.env, 1)} ± ${F.sigmaEnv}`, color: 'var(--axis)' }, { label: `Results so far: ${lean(mean, 1)} ± ${sd.toFixed(1)}`, color: 'var(--series-3)' }]} />
              </section>
              <section className="panel">
                <h2>P(Democratic majority) over the night</h2>
                <p className="muted sub">Recomputed after every batch of calls.</p>
                <Spark points={history} />
              </section>
            </div>
            <section className="panel">
              <h2>Seat projection</h2>
              <p className="muted sub">Called seats fixed; uncalled seats simulated 3,000 times at environments drawn from the updated belief.</p>
              <ChartFrame legend={<Legend items={[{ label: 'Democratic majority', color: 'var(--dem)' }, { label: 'Republican majority', color: 'var(--rep)' }]} />}>
                <SeatHistogram counts={counts} total={total} lo={150} hi={300} height={200} />
              </ChartFrame>
            </section>
            <section className="panel">
              <div className="hero-head">
                <div><h2>Watchlist</h2><p className="muted sub" style={{ margin: 0 }}>{q ? 'Matches' : 'Closest uncalled races right now'}</p></div>
                <input type="search" placeholder="District or state, e.g. PA-7 or AZ" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
              </div>
              <div className="scroll-x">
                <table className="data-table">
                  <thead><tr><th>District</th><th className="num">PVI</th><th>Held by</th><th style={{ minWidth: 180 }}>P(Democrat) now</th><th className="num">Frozen</th><th>Result</th></tr></thead>
                  <tbody>{watch.map(({ d, p, w }) => (
                    <tr key={d.id}>
                      <td className="mono">{d.id}</td><td className="num">{lean(d.pvi)}</td><td><PartyTag p={d.incParty} /></td>
                      <td><div className="pbar"><div style={{ width: `${p * 100}%`, background: probColor(p) }} /><span /></div></td>
                      <td className="num">{pct(d.pFrozen, 0)}</td>
                      <td>{w ? <PartyTag p={w === 'O' ? null : w} /> : <span className="muted">uncalled</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
            </>}
          </div>

          <aside className="col-feed panel">
            <div className="feed-head">
              <h2>Alerts</h2>
              <span className="muted tabular" style={{ fontSize: 13 }}>{alerts.length}</span>
            </div>
            <div className="chips">
              {(['all', 'upset', 'flip', 'milestone', 'call'] as const).map((k) => (
                <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'All' : KIND_LABEL[k]}{k !== 'all' && <span className="tabular"> {countBy(k)}</span>}
                </button>
              ))}
            </div>
            <ol className="feed">
              {shown.map((a) => (
                <li key={a.id} className={`alert ${a.kind} ${fresh.current.has(a.id) ? 'fresh' : ''}`}>
                  <span className={`badge ${a.party ?? ''}`}>{KIND_ICON[a.kind]}</span>
                  <div>
                    <div className="alert-top"><b>{a.title}</b><span className="muted">{ago(a.t, now)}</span></div>
                    <div className="alert-body">{a.body}</div>
                    <span className="kind">{KIND_LABEL[a.kind]}</span>
                  </div>
                </li>
              ))}
              {!shown.length && <li className="empty">Alerts appear here as races are called in either chamber: every call, every seat that flips, upsets against the frozen forecasts, runoffs, and milestones like 218 House seats or Senate control.</li>}
            </ol>
          </aside>
        </div>

        <section className="panel">
          <h2>Where live results come from (and other APIs you can use)</h2>
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Source</th><th>What it gives</th><th>Cost / access</th><th>Used here</th></tr></thead>
              <tbody>
                <tr><td><b>Wikipedia API</b> (MediaWiki)</td><td>The 2026 House and Senate pages; editors add a ✓ to each winner as networks call races. CORS-enabled, so a static page can read it.</td><td>Free, no key. We fetch the tiny revision id first and only download the page when it changed.</td><td>Yes</td></tr>
                <tr><td><b>AP Elections API</b></td><td>The official vote counts and race calls most news sites use, by county and district, minute by minute.</td><td>Paid license (developer.ap.org)</td><td>Drop-in upgrade</td></tr>
                <tr><td><b>Decision Desk HQ API</b></td><td>Race calls and vote counts, also used by major outlets.</td><td>Paid / enterprise</td><td>Drop-in upgrade</td></tr>
                <tr><td><b>State election sites</b> (many use Clarity / Scytl ENR)</td><td>Official, unprojected counts as they are reported, often as JSON per state.</td><td>Free, but a different format per state</td><td>No</td></tr>
                <tr><td><b>FiftyPlusOne</b></td><td>Polls (generic ballot, approval), not live results.</td><td>Paid plans from $100/month</td><td>Optional pre-election input</td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>
            How the update works: before any calls, our belief about the national environment is the polling average ± the assumed error. Each called race is
            evidence: if Democrats win seats the model rated R+3, the environment was probably better for Democrats than the polls said, and vice versa. Bayes' rule
            combines all calls into the aqua curve; uncalled seats are re-scored at that environment. Caveat: calls are not random (safe seats and eastern states come
            first), so early-night swings in the curve deserve caution. Wikipedia can lag a network call by minutes and is edited by volunteers; treat it as a
            teaching feed, not an official source. Alerts and your history stay in this browser only.
          </p>
        </section>
        <footer className="live-foot muted">
          A nonpartisan teaching project by Juan Barahona · <a href={GUIDE_URL}>Read the ML walkthrough</a> · <a href="https://github.com/elmandalorian-thx/Midterms2026ML">Code & data</a> ·
          Frozen forecasts: House {F.frozen.frozenOn}, Senate {SF.frozen.frozenOn} · <a href={`${GUIDE_URL}senate/`}>Senate walkthrough</a> · Data: Wikipedia contributors (CC BY-SA), FiveThirtyEight (CC BY), Cook PVI.
          {!demo && <> · <button className="linkish" onClick={startDemo}>Run demo replay</button></>}
        </footer>
      </main>
    </div>
  )
}
