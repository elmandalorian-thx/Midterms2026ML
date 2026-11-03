import { useEffect, useState } from 'react'
import { Hemicycle } from '../components/election'
import { StatTile } from '../components/ui'
import { lean, pct } from '../lib/data'
import { HOLD, raceName, senate, SF, SR } from '../lib/senate'
import { Borrow, chosen, Data, Explore, Problem, SmallData } from './chapters1'
import { Congress, Forecast, Neutral, Score, Wrap } from './chapters2'

const CHAPTERS = [
  ['problem', 'Frame the problem'], ['data', 'Meet the data'], ['explore', 'Explore'], ['small-data', 'Evaluate honestly'],
  ['borrow', 'Borrow from the House'], ['neutral', 'Neutrality check'], ['forecast', '2026 forecast'],
  ['congress', 'Control of Congress'], ['scorecard', 'Score it'], ['wrap', 'Limits & files'],
] as const

const BASE = import.meta.env.BASE_URL

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
      if (saved) return saved
    } catch { /* storage blocked */ }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch { /* storage blocked */ }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const
}

function useActiveChapter() {
  const [active, setActive] = useState<string>('')
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: '-20% 0px -70% 0px' })
    CHAPTERS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [])
  return active
}

function Hero() {
  const fz = SF.frozen
  // 100 seats: held-over seats are certain (1 or 0); the seats up in 2026 carry the frozen P(Democratic side).
  const seats = [
    ...Array.from({ length: HOLD.D + HOLD.I_caucusD }, (_, i) => ({ id: `hold-d${i}`, p: 1, note: 'not up in 2026 (Democratic caucus)' })),
    ...Array.from({ length: HOLD.R }, (_, i) => ({ id: `hold-r${i}`, p: 0, note: 'not up in 2026 (Republican)' })),
    ...SR.map((r) => ({ id: raceName(r), p: r.pFrozen, note: `${r.dName ?? '—'} vs ${r.rName ?? '—'}` })),
  ]
  return (
    <>
      <header className="hero">
        <div>
          <span className="eyebrow">A nonpartisan machine learning walkthrough · U.S. Senate, November 2026</span>
          <h1>{SR.length} races.<br />Too few to learn from.<br />So we borrow.</h1>
          <p className="hero-lede">
            The House guide had thousands of district races to learn from. The Senate has {senate.counts.contested} contested races since 2014. This guide shows
            what changes when the data gets small: honest error bars, a model that borrows strength from the House, independents who stand in for a party,
            and a forecast for control of the whole Congress, frozen before the votes are counted.
          </p>
          <p style={{ fontSize: 14, marginTop: -4 }}>
            By <a href="https://github.com/elmandalorian-thx" target="_blank" rel="noreferrer"><strong>Juan Barahona</strong></a> ·
            For learning only: not a prediction service, not advocacy · Method: Géron, <em>Hands-On Machine Learning</em> (3rd ed.)
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href="#problem" style={{ textDecoration: 'none' }}>Start the walkthrough</a>
            <a className="btn live-link" href={`${BASE}live/`} style={{ textDecoration: 'none' }}><i />Live results tracker</a>
            <a className="btn" href="#forecast" style={{ textDecoration: 'none' }}>Skip to the forecast →</a>
            <a className="btn" href={BASE} style={{ textDecoration: 'none' }}>The House guide</a>
          </div>
        </div>
        <div className="hero-art">
          <Hemicycle seats={seats} height={240} rows={6} majorityText="50 + VP or 51" pLabel="P(D side)" label={`Senate: ${HOLD.D + HOLD.I_caucusD} Democratic-caucus and ${HOLD.R} Republican seats not up, plus ${SR.length} races in 2026`} />
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            All 100 seats. The {100 - SR.length} not up this year are fixed; the {SR.length} up in 2026 are colored by the frozen P(Democratic side). Hover a seat.
          </p>
        </div>
      </header>
      <div className="grid-4">
        <StatTile label="Past Senate races learned from" value={senate.counts.contested} format={(v) => `${Math.round(v)}`} note={`${senate.counts.years.length} cycles, plus the House's district races`} />
        <StatTile label="Held-out Brier score" value={chosen.brier!} format={(v) => v.toFixed(3)} note={`${chosen.name} · coin flip = 0.25`} />
        <StatTile label="P(Republicans keep control)" value={fz.pRControl} format={(v) => pct(v, 0)} note={`frozen ${fz.frozenOn} · Democrats ${pct(fz.pDControl, 0)}`} />
        <StatTile label="Generic-ballot input" value={lean(fz.env, 1)} note="the same national mood as the House forecast" />
      </div>
    </>
  )
}

export default function SenateApp() {
  const [theme, toggle] = useTheme()
  const active = useActiveChapter()
  const themeBtn = <button className="btn" onClick={toggle} style={{ fontSize: 13 }}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
  return (
    <>
      <div className="topbar"><span>Senate 2026 · ML guide</span><span style={{ display: 'flex', gap: 8 }}><a className="btn live-link" href={`${BASE}live/`} style={{ textDecoration: 'none', fontSize: 13 }}><i />Live</a>{themeBtn}</span></div>
      <div className="shell">
        <nav className="rail" aria-label="Chapters">
          <div className="rail-title">Senate 2026<div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>A nonpartisan ML walkthrough by Juan Barahona</div></div>
          <a className="live-link rail-live" href={`${BASE}live/`}><i />Live results tracker</a>
          {CHAPTERS.map(([id, label], i) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : ''}>
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>{label}
            </a>
          ))}
          <div className="rail-foot">
            <a href={BASE}>← House guide</a>
            <a href="https://github.com/elmandalorian-thx/Midterms2026ML/blob/main/ml/build_senate.py" target="_blank" rel="noreferrer">Code & data ↗</a>
            {themeBtn}
          </div>
        </nav>
        <main>
          <Hero />
          <Problem />
          <Data />
          <Explore />
          <SmallData />
          <Borrow />
          <Neutral />
          <Forecast />
          <Congress />
          <Score />
          <Wrap />
        </main>
      </div>
    </>
  )
}
