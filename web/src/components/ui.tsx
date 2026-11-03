import type { ReactNode } from 'react'
import { CountUp } from './anim'

export function Chapter({ id, num, title, kicker, book, children }: {
  id: string; num: string; title: string; kicker: string; children: ReactNode
  /** Géron, Hands-On ML (3rd ed.): chapter + section titles this chapter practices */
  book?: { ch: string; sections: string[] }
}) {
  return (
    <section className="chapter" id={id}>
      <header className="chapter-head">
        <span className="chapter-num">{num}</span>
        <h2>{title}</h2>
        <p className="chapter-kicker">{kicker}</p>
      </header>
      {book && (
        <div style={{ margin: '-12px 0 22px' }}>
          <span className="book">📘 <b>HOML {book.ch}</b></span>
          {book.sections.map((s) => <span key={s} className="book">{s}</span>)}
        </div>
      )}
      {children}
    </section>
  )
}

const CALLOUT_TAG = { concept: 'ML concept', pitfall: '⚠ Pitfall', result: '✓ Result', try: 'Try it', fair: '⚖ Neutrality' }

export function Callout({ kind = 'concept', title, children }: {
  kind?: keyof typeof CALLOUT_TAG; title?: string; children: ReactNode
}) {
  return (
    <aside className={`callout ${kind}`}>
      <div className="callout-tag">{CALLOUT_TAG[kind]}{title && <span style={{ textTransform: 'none', letterSpacing: 0 }}>· {title}</span>}</div>
      <p>{children}</p>
    </aside>
  )
}

/** Collapsible Python snippet; lines starting with # render as comments. */
export function Code({ label = 'Show the Python', code }: { label?: string; code: string }) {
  return (
    <details className="code">
      <summary>{label}</summary>
      <pre>{code.trim().split('\n').map((line, i) => (
        <div key={i} className={line.trimStart().startsWith('#') ? 'c' : undefined}>{line || ' '}</div>
      ))}</pre>
    </details>
  )
}

/** Stat tile; numeric values count up when scrolled into view. */
export function StatTile({ label, value, format, note }: {
  label: string; value: ReactNode | number; format?: (v: number) => string; note?: ReactNode
}) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{typeof value === 'number' && format ? <CountUp value={value} format={format} /> : value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}

export const PartyTag = ({ p }: { p: 'D' | 'R' | null | undefined | '' }) =>
  p ? <span className="party"><i style={{ background: p === 'D' ? 'var(--dem)' : 'var(--rep)' }} />{p === 'D' ? 'Dem' : 'Rep'}</span>
    : <span className="muted" style={{ fontSize: 13 }}>none</span>

/** Diverging fill for P(Democrat wins): Republican red → gray toss-up → Democratic blue. */
export function probColor(p: number) {
  const k = Math.min(1, Math.abs(p - 0.5) * 2)
  const pole = p >= 0.5 ? 'var(--dem)' : 'var(--rep)'
  return `color-mix(in oklab, ${pole} ${Math.round(Math.pow(k, 0.75) * 100)}%, var(--tossup))`
}
