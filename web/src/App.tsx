import { useEffect, useState } from 'react'
import { Data } from './sections/Data'
import { Evaluate } from './sections/Evaluate'
import { Explore } from './sections/Explore'
import { Features } from './sections/Features'
import { Forecast } from './sections/Forecast'
import { Hero, Problem } from './sections/Intro'
import { Baselines, Models } from './sections/Models'
import { Scorecard } from './sections/Scorecard'
import { Wrap } from './sections/Wrap'

const CHAPTERS = [
  ['problem', 'Frame the problem'], ['data', 'Meet the data'], ['explore', 'Explore'], ['features', 'Features'],
  ['baselines', 'Baselines'], ['models', 'Models'], ['evaluate', 'Evaluate honestly'], ['forecast', '2026 forecast'],
  ['scorecard', 'Score it'], ['wrap', 'Limits & files'],
] as const

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

export default function App() {
  const [theme, toggle] = useTheme()
  const active = useActiveChapter()
  const themeBtn = <button className="btn" onClick={toggle} style={{ fontSize: 13 }}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
  return (
    <>
      <div className="topbar"><span>House 2026 · ML guide</span><span style={{ display: 'flex', gap: 8 }}><a className="btn live-link" href={`${import.meta.env.BASE_URL}live/`} style={{ textDecoration: 'none', fontSize: 13 }}><i />Live</a>{themeBtn}</span></div>
      <div className="shell">
        <nav className="rail" aria-label="Chapters">
          <div className="rail-title">House 2026<div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>A nonpartisan ML walkthrough by Juan Barahona</div></div>
          <a className="live-link rail-live" href={`${import.meta.env.BASE_URL}live/`}><i />Live results tracker</a>
          {CHAPTERS.map(([id, label], i) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : ''}>
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>{label}
            </a>
          ))}
          <div className="rail-foot">
            <a href="https://github.com/elmandalorian-thx/Midterms2026ML/blob/main/notebooks/midterms_2026_ml.ipynb" target="_blank" rel="noreferrer">Notebook ↗</a>
            <a href="https://github.com/elmandalorian-thx/Midterms2026ML" target="_blank" rel="noreferrer">Code & data ↗</a>
            {themeBtn}
          </div>
        </nav>
        <main>
          <Hero />
          <Problem />
          <Data />
          <Explore />
          <Features />
          <Baselines />
          <Models />
          <Evaluate />
          <Forecast />
          <Scorecard />
          <Wrap />
        </main>
      </div>
    </>
  )
}
