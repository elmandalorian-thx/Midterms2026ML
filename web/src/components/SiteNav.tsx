// Shared navigation for all three pages: the site switcher (House guide / Senate guide / Live tracker),
// the guides' chapter rail, and the mobile top bar + drawer. One component, so the pages cannot drift apart.
import { useEffect, useRef, useState, type ReactNode } from 'react'

const BASE = import.meta.env.BASE_URL
export type PageKey = 'house' | 'senate' | 'live'

const MOON = <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
const SUN = <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>

const PAGES: { key: PageKey; label: string; short: string; href: string; badge: string }[] = [
  { key: 'house', label: 'House guide', short: 'House', href: BASE, badge: 'H' },
  { key: 'senate', label: 'Senate guide', short: 'Senate', href: `${BASE}senate/`, badge: 'S' },
  { key: 'live', label: 'Live tracker', short: 'Live', href: `${BASE}live/`, badge: '' },
]

/** The three pages of the site. `row` = horizontal segmented control (top bars); default = stacked card (rail, drawer). */
export function SiteSwitcher({ current, row = false, compact = false }: { current: PageKey; row?: boolean; compact?: boolean }) {
  return (
    <nav className={`switcher${row ? ' row' : ''}`} aria-label="Site">
      {PAGES.map((p) => (
        <a key={p.key} href={p.href} aria-current={p.key === current ? 'page' : undefined}>
          {!row && <span className="sw-badge" aria-hidden="true">{p.badge || <i className="sw-pulse" />}</span>}
          {row && p.key === 'live' && <i className="sw-pulse" aria-hidden="true" />}
          {compact ? p.short : p.label}
        </a>
      ))}
    </nav>
  )
}

/* ------------------------------------------------------------ guides: theme + active chapter */

export function useTheme() {
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

function useActiveChapter(ids: readonly string[]) {
  const [active, setActive] = useState<string>('')
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: '-20% 0px -70% 0px' })
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [ids])
  return active
}

/* ------------------------------------------------------------ guide shell */

export interface NavLink { label: string; href: string }

function NavContent({ current, chapters, active, links, theme, toggle, onNavigate }: {
  current: PageKey; chapters: readonly (readonly [string, string])[]; active: string; links: NavLink[]
  theme: string; toggle: () => void; onNavigate?: () => void
}) {
  return (
    <>
      <div className="nav-head">
        <a className="nav-brand" href={BASE} onClick={onNavigate}>
          <b>Midterms 2026</b>
          <span>A nonpartisan ML walkthrough by Juan Barahona</span>
        </a>
        <button className="btn theme-btn" onClick={toggle} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? SUN : MOON}</button>
      </div>
      <SiteSwitcher current={current} />
      <div>
        <div className="nav-label" id={`toc-${current}`}>Chapters</div>
        <nav className="toc" aria-labelledby={`toc-${current}`}>
          {chapters.map(([id, label], i) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : ''} aria-current={active === id ? 'location' : undefined} onClick={onNavigate}>
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>{label}
            </a>
          ))}
        </nav>
      </div>
      <div className="nav-foot">
        {links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
      </div>
    </>
  )
}

/** Layout for the House and Senate guides: chapter rail on desktop, top bar + drawer on mobile. */
export function GuideShell({ current, chapters, links, children }: {
  current: 'house' | 'senate'; chapters: readonly (readonly [string, string])[]; links: NavLink[]; children: ReactNode
}) {
  const [theme, toggle] = useTheme()
  const [ids] = useState(() => chapters.map(([id]) => id))
  const active = useActiveChapter(ids)
  const [open, setOpen] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLDivElement>(null)

  // Drawer: Escape closes, focus moves in on open and back to the menu button on close, page scroll is locked.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    drawer.current?.querySelector<HTMLElement>('a, button')?.focus()
    const btn = menuBtn.current
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; btn?.focus() }
  }, [open])

  const nav = { current, chapters, active, links, theme, toggle }
  return (
    <>
      <header className="topbar">
        <a className="topbar-brand" href={BASE}>Midterms 2026</a>
        <SiteSwitcher current={current} row compact />
        <button ref={menuBtn} className="btn menu-btn" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="nav-drawer" aria-label="Open chapters menu">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <div id="nav-drawer" ref={drawer} className={`drawer${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Site navigation" hidden={!open}>
        <button className="btn drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
        <NavContent {...nav} onNavigate={() => setOpen(false)} />
      </div>
      <div className="shell">
        <aside className="rail"><NavContent {...nav} /></aside>
        <main>{children}</main>
      </div>
    </>
  )
}
