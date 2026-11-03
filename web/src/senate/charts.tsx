import { useEffect, useState } from 'react'
import { linear, ticks, Tooltip, useWidth } from '../components/charts'
import { lean, pct } from '../lib/data'
import { senate } from '../lib/senate'

/** State lean vs. the Democratic side's margin, one election at a time, with the "lean + national mood" line. */
export function SenateScatter() {
  const years = Object.keys(senate.scatter)
  const [yi, setYi] = useState(years.length - 1)
  const [playing, setPlaying] = useState(false)
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setYi((i) => (i + 1) % years.length), 1500)
    return () => clearInterval(t)
  }, [playing, years.length])
  const year = years[yi]
  const pts = senate.scatter[year]
  const env = senate.envByYear[year]
  const height = Math.min(420, Math.max(280, width * 0.6))
  const m = { l: 46, r: 16, t: 14, b: 42 }
  const x = linear(-30, 30, m.l, width - m.r)
  const y = linear(-60, 60, height - m.b, m.t)
  const cl = (v: number) => Math.max(-60, Math.min(60, v))
  const surprises = pts.filter(([l, , w]) => (2 * l + env > 0) !== (w === 1)).length
  const drift = senate.drift.find((d) => String(d.year) === year)!
  return (
    <div>
      <div className="controls">
        <div className="seg" role="group" aria-label="Election year">
          {years.map((yr, i) => <button key={yr} aria-pressed={i === yi} onClick={() => { setYi(i); setPlaying(false) }}>{yr}</button>)}
        </div>
        <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚ Pause' : '▶ Play years'}</button>
        <span className="muted" style={{ fontSize: 13.5 }}>
          National mood {lean(env, 1)} · {pts.length} contested races · {surprises} on the "wrong" side of the line · correlation {drift.corr.toFixed(2)}
        </span>
      </div>
      <div ref={ref} className="chart" style={{ position: 'relative' }}>
        <svg width={width} height={height} role="img" aria-label={`Senate ${year}: state lean against the Democratic side's vote margin`}>
          {ticks(-60, 60, 6).map((t) => <g key={t}><line className="gridline" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{t > 0 ? `D+${t}` : t < 0 ? `R+${-t}` : '0'}</text></g>)}
          {ticks(-30, 30, 6).map((t) => <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle">{lean(t)}</text>)}
          <line className="axisline" x1={x(0)} x2={x(0)} y1={m.t} y2={height - m.b} />
          <line className="axisline" x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} />
          <line x1={x(-30)} y1={y(cl(2 * -30 + env))} x2={x(30)} y2={y(cl(2 * 30 + env))} stroke="var(--text-primary)" strokeDasharray="5 4" strokeWidth={1.5}
            style={{ transition: 'all .6s ease' }} />
          {pts.map(([l, mg, w], i) => (
            <circle key={i} cx={x(Math.max(-30, Math.min(30, l)))} cy={y(cl(mg))} r={hover === i ? 7 : 5}
              fill={w ? 'var(--dem)' : 'var(--rep)'} fillOpacity={0.8} stroke="var(--surface-1)" strokeWidth={1}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'cx .6s ease, cy .6s ease' }} />
          ))}
          <text x={width - m.r} y={height - 6} textAnchor="end">State lean (computed from presidential results) →</text>
          <text x={m.l + 4} y={m.t + 10}>↑ Democratic side's margin</text>
        </svg>
        {hover !== null && pts[hover] && (
          <Tooltip x={x(Math.max(-30, Math.min(30, pts[hover][0])))} y={y(cl(pts[hover][1]))}>
            Lean {lean(pts[hover][0], 1)} · result {lean(pts[hover][1] / 2, 1)} two-party · {pts[hover][2] ? 'Democratic side won' : 'Republican side won'}
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/** One dot per year with a bootstrap interval: how sure can a ~30-race accuracy be? */
export function CIDots({ rows, domain = [0.6, 1] }: { rows: { label: string; value: number; lo: number; hi: number; n: number }[]; domain?: [number, number] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const row = 36, lw = 92, m = { r: 20 }
  const x = linear(domain[0], domain[1], lw, width - m.r)
  const h = rows.length * row + 28
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={h} role="img" aria-label="Accuracy by held-out year with 90% bootstrap intervals">
        {ticks(domain[0], domain[1], 4).map((t) => <g key={t}><line className="gridline" x1={x(t)} x2={x(t)} y1={0} y2={rows.length * row} />
          <text x={x(t)} y={rows.length * row + 18} textAnchor="middle">{pct(t, 0)}</text></g>)}
        {rows.map((r, i) => {
          const cy = i * row + row / 2
          return (
            <g key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={i * row} width={width} height={row} fill="transparent" />
              <text className="label" x={lw - 12} y={cy + 4} textAnchor="end">{r.label}</text>
              <line x1={x(r.lo)} x2={x(r.hi)} y1={cy} y2={cy} stroke="var(--series-1)" strokeWidth={3} strokeLinecap="round" opacity={0.35} />
              <circle cx={x(r.value)} cy={cy} r={hover === i ? 7 : 6} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={x(rows[hover].value)} y={hover * row + 4}>
          <b>{rows[hover].label}</b>: {pct(rows[hover].value)} of {rows[hover].n} races · 90% interval {pct(rows[hover].lo, 0)}–{pct(rows[hover].hi, 0)}
        </Tooltip>
      )}
    </div>
  )
}
