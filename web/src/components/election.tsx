// Election-specific animated charts: hemicycle, year-by-year scatter, seat histogram, tree diagram.
import { useEffect, useMemo, useState } from 'react'
import { guide, lean, MAJORITY, pct } from '../lib/data'
import { featureLabel } from '../lib/model'
import { useInView } from './anim'
import { Legend, linear, ticks, Tooltip, useWidth } from './charts'
import { probColor } from './ui'

/* ------------------------------------------------------------ hemicycle */

interface Seat { x: number; y: number; a: number }

/** Classic parliament layout: concentric arcs, seats per row proportional to radius, ordered left → right. */
function seatLayout(n: number, rows: number): Seat[] {
  const r0 = 0.38
  const radii = Array.from({ length: rows }, (_, i) => r0 + ((1 - r0) * i) / (rows - 1))
  const total = radii.reduce((s, r) => s + r, 0)
  const counts = radii.map((r) => Math.round((n * r) / total))
  counts[rows - 1] += n - counts.reduce((s, c) => s + c, 0)
  const seats: Seat[] = []
  radii.forEach((r, i) => {
    for (let k = 0; k < counts[i]; k++) {
      const a = Math.PI - (Math.PI * (k + 0.5)) / counts[i]
      seats.push({ x: r * Math.cos(a), y: r * Math.sin(a), a })
    }
  })
  return seats.sort((s, t) => t.a - s.a)
}

export interface SeatDatum { id: string; p: number; note?: string }

/** 435 seats, most-Democratic on the left. Seats fly in from the base when scrolled into view;
 *  colors cross-fade when probabilities change. */
export function Hemicycle({ seats, height = 300, label, rows = 12, majorityText = `${MAJORITY} for a majority`, pLabel = 'P(Dem)' }:
  { seats: SeatDatum[]; height?: number; label?: string; rows?: number; majorityText?: string; pLabel?: string }) {
  const [wref, width] = useWidth<HTMLDivElement>()
  const [vref, inView] = useInView<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const layout = useMemo(() => seatLayout(seats.length, rows), [seats.length, rows])
  const sorted = useMemo(() => [...seats].sort((a, b) => b.p - a.p), [seats])
  const W = Math.min(width, height * 2.05)
  const R = W / 2 - 8
  const dot = Math.max(2.2, R / (rows * 4.3))
  const cx = width / 2, cy = R + 10
  const demSeats = seats.reduce((s, d) => s + d.p, 0)
  return (
    <div ref={(el) => { wref.current = el; vref.current = el }} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={cy + 8} role="img" aria-label={label ?? `Seat chart: ${Math.round(demSeats)} expected Democratic seats of ${seats.length}`}>
        <line x1={cx} x2={cx} y1={cy - R - 6} y2={cy - R * 0.38 + dot + 2} stroke="var(--text-primary)" strokeWidth={1.5} strokeDasharray="3 3" />
        <text x={cx} y={cy - 2} textAnchor="middle" style={{ fill: 'var(--text-primary)', fontWeight: 650, fontSize: 13 }}>{majorityText}</text>
        {sorted.map((s, i) => {
          const L = layout[i]
          const tx = inView ? cx + L.x * R : cx
          const ty = inView ? cy - L.y * R : cy
          return (
            <circle key={s.id} r={hover === i ? dot + 2 : dot} className="dot-move"
              style={{ transform: `translate(${tx}px, ${ty}px)`, transitionDelay: inView ? `${(i % 145) * 4 + Math.floor(i / 145) * 60}ms` : '0ms',
                fill: probColor(s.p), opacity: inView ? 1 : 0 }}
              stroke={hover === i ? 'var(--text-primary)' : 'none'}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          )
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={cx + layout[hover].x * R} y={cy - layout[hover].y * R}>
          <b>{sorted[hover].id}</b> · {pLabel} {pct(sorted[hover].p, 0)}
          {sorted[hover].note && <div className="muted">{sorted[hover].note}</div>}
        </Tooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ PVI vs result, animated by year */

export function YearScatter() {
  const years = Object.keys(guide.scatter)
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
  const pts = guide.scatter[year]
  const env = guide.envByYear[year]
  const height = Math.min(440, Math.max(300, width * 0.62))
  const m = { l: 46, r: 16, t: 14, b: 42 }
  const x = linear(-40, 40, m.l, width - m.r)
  const y = linear(-80, 80, height - m.b, m.t)
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const maxN = Math.max(...years.map((k) => guide.scatter[k].length))
  // "theory" line: margin = 2 × PVI + national environment
  const line = (v: number) => y(clamp(2 * v + env, -80, 80))
  const flips = pts.filter(([p, , w]) => (p > 0) !== (w === 1) && p !== 0).length
  return (
    <div>
      <div className="controls">
        <button className="btn" onClick={() => setPlaying((p) => !p)} style={{ minWidth: 92 }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <div className="seg" role="group" aria-label="Election year">
          {years.map((k, i) => <button key={k} aria-pressed={i === yi} onClick={() => { setPlaying(false); setYi(i) }}>{k}</button>)}
        </div>
      </div>
      <Legend items={[{ label: 'Democrat won', color: 'var(--dem)' }, { label: 'Republican won', color: 'var(--rep)' },
        { label: 'margin = 2 × PVI + national environment', color: 'var(--text-primary)', line: true }]} />
      <div ref={ref} className="chart" style={{ position: 'relative' }}>
        <svg width={width} height={height} role="img" aria-label={`District lean vs. result, ${year}`}>
          {ticks(-80, 80, 8).map((t) => (
            <g key={`y${t}`}>
              <line className="gridline" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end">{lean(t)}</text>
            </g>
          ))}
          {ticks(-40, 40, 8).map((t) => <text key={`x${t}`} x={x(t)} y={height - m.b + 18} textAnchor="middle">{lean(t)}</text>)}
          <text x={(m.l + width - m.r) / 2} y={height - 4} textAnchor="middle">District lean (Cook PVI) →</text>
          <text x={m.l + 6} y={m.t + 12} style={{ fill: 'var(--text-secondary)' }}>House result (two-party margin)</text>
          <line className="axisline" x1={x(0)} x2={x(0)} y1={m.t} y2={height - m.b} />
          <line className="axisline" x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} />
          {Array.from({ length: maxN }, (_, i) => {
            const p = pts[i]
            const on = !!p
            const px = on ? x(clamp(p[0], -40, 40)) : x(0)
            const py = on ? y(clamp(p[1], -80, 80)) : y(0)
            return (
              <circle key={i} r={hover === i ? 6 : 3.6} className="dot-move"
                style={{ transform: `translate(${px}px, ${py}px)`, fill: on ? (p[2] ? 'var(--dem)' : 'var(--rep)') : 'transparent', opacity: on ? 0.78 : 0 }}
                stroke="var(--surface-1)" strokeWidth={1}
                onMouseEnter={() => on && setHover(i)} onMouseLeave={() => setHover(null)} />
            )
          })}
          <line x1={x(-40)} x2={x(40)} y1={line(-40)} y2={line(40)} stroke="var(--text-primary)" strokeWidth={2}
            style={{ transition: 'all 0.9s cubic-bezier(0.3,0.7,0.2,1)' }} />
          <text x={width - m.r} y={m.t + 12} textAnchor="end" style={{ fill: 'var(--text-primary)', fontSize: 30, fontWeight: 800, opacity: 0.12 }}>{year}</text>
        </svg>
        {hover !== null && pts[hover] && (
          <Tooltip x={x(clamp(pts[hover][0], -40, 40))} y={y(clamp(pts[hover][1], -80, 80))}>
            PVI <b>{lean(pts[hover][0])}</b> · result <b>{lean(pts[hover][1], 1)}</b>
          </Tooltip>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
        {year}: national House vote {lean(env, 1)} · {pts.length} contested races · {flips} won against the district's lean.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ seat histogram */

export function SeatHistogram({ counts, total, height = 240, lo = 160, hi = 300, majority = MAJORITY, above = 'var(--dem)', below = 'var(--rep)', describe }: {
  counts: number[]; total: number; height?: number; lo?: number; hi?: number
  /** Bars at or above this count get the `above` color (House: 218 Democratic seats) */
  majority?: number; above?: string; below?: string
  /** Tooltip text for a bar (default: House Democratic seats) */
  describe?: (seats: number) => string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const m = { l: 40, r: 10, t: 16, b: 30 }
  const x = linear(lo, hi + 1, m.l, width - m.r)
  const bw = Math.max(1, x(lo + 1) - x(lo) - 1)
  const slice = counts.slice(lo, hi + 1)
  const maxP = Math.max(0.02, ...slice.map((c) => c / Math.max(1, total)))
  const y = linear(0, maxP, height - m.b, m.t)
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label="Distribution of simulated seat totals"
        onMouseLeave={() => setHover(null)}>
        {ticks(0, maxP, 4).map((t) => (
          <g key={t}>
            <line className="gridline" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{pct(t, 0)}</text>
          </g>
        ))}
        {ticks(lo, hi, 7).map((t) => <text key={t} x={x(t) + bw / 2} y={height - 10} textAnchor="middle">{t}</text>)}
        {slice.map((c, i) => {
          const s = lo + i
          const p = c / Math.max(1, total)
          return (
            <g key={s} onMouseEnter={() => setHover(s)}>
              <rect x={x(s)} y={m.t} width={bw + 1} height={height - m.b - m.t} fill="transparent" />
              <rect x={x(s)} y={y(p)} width={bw} height={Math.max(0, height - m.b - y(p))} rx={Math.min(2, bw / 2)}
                fill={s >= majority ? above : below} opacity={hover === null || hover === s ? 1 : 0.55} />
            </g>
          )
        })}
        <line className="axisline" x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} />
        <line x1={x(majority) - 0.5} x2={x(majority) - 0.5} y1={m.t - 6} y2={height - m.b} stroke="var(--text-primary)" strokeWidth={1.5} strokeDasharray="3 3" />
        <text x={x(majority) + 6} y={m.t + 4} style={{ fill: 'var(--text-primary)', fontWeight: 600 }}>{majority}</text>
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover) + bw / 2} y={y(counts[hover] / Math.max(1, total))}>
          {describe ? describe(hover) : <><b>{hover}</b> Democratic seats ({435 - hover} Republican)</>} · {pct(counts[hover] / Math.max(1, total), 1)} of runs
        </Tooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ depth-3 tree */

const RULE: Record<string, (t: number) => string> = {
  pvi: (t) => `PVI ≤ ${lean(t, 1)}`,
  env: (t) => `Nation ≤ ${lean(t, 1)}`,
  inc: (t) => (t < 0 ? 'Rep. incumbent runs' : t < 1 ? 'No Dem. incumbent' : 'inc ≤ ' + t),
  held: (t) => (t < 0 ? 'Rep.-held seat' : t < 1 ? 'Not Dem.-held' : 'held ≤ ' + t),
}

export function TreeDiagram({ path = [] }: { path?: number[] }) {
  const nodes = guide.model.tree
  const [ref, measured] = useWidth<HTMLDivElement>()
  const width = Math.max(measured, 760)
  const pos = new Map<number, { x: number; depth: number }>()
  let leaf = 0
  const leaves = nodes.filter((n) => n.l === -1).length
  const walk = (i: number, depth: number): number => {
    const n = nodes[i]
    const x = n.l === -1 ? (leaf++ + 0.5) / leaves : (walk(n.l, depth + 1) + walk(n.r, depth + 1)) / 2
    pos.set(i, { x, depth })
    return x
  }
  walk(0, 0)
  const maxDepth = Math.max(...[...pos.values()].map((p) => p.depth))
  const rowH = 92, boxW = Math.min(150, width / leaves - 8), boxH = 54
  const X = (i: number) => pos.get(i)!.x * width
  const Y = (i: number) => pos.get(i)!.depth * rowH + 4
  const on = new Set(path)
  return (
    <div ref={ref} className="chart" style={{ overflowX: 'auto' }}>
      <svg width={width} height={(maxDepth + 1) * rowH} role="img" aria-label="Decision tree diagram">
        {nodes.map((n, i) => n.l === -1 ? null : [n.l, n.r].map((c, k) => (
          <g key={`${i}-${c}`}>
            <path d={`M${X(i)},${Y(i) + boxH}C${X(i)},${Y(i) + boxH + 22} ${X(c)},${Y(c) - 22} ${X(c)},${Y(c)}`} fill="none"
              stroke={on.has(i) && on.has(c) ? 'var(--text-primary)' : 'var(--axis)'} strokeWidth={on.has(i) && on.has(c) ? 2.5 : 1.25} />
            <text x={(X(i) + X(c)) / 2 + (k ? 6 : -6)} y={Y(i) + boxH + 20} textAnchor={k ? 'start' : 'end'} style={{ fontSize: 11 }}>{k ? 'no' : 'yes'}</text>
          </g>
        )))}
        {nodes.map((n, i) => {
          const isLeaf = n.l === -1
          const p = n.p!
          const active = on.has(i)
          return (
            <g key={i} transform={`translate(${X(i) - boxW / 2},${Y(i)})`} opacity={path.length && !active ? 0.45 : 1}>
              <rect width={boxW} height={boxH} rx={10} fill="var(--surface-1)" stroke={active ? 'var(--text-primary)' : 'var(--border)'} strokeWidth={active ? 2 : 1} />
              <text x={10} y={20} style={{ fontSize: 11.5, fill: 'var(--text-primary)', fontWeight: 600 }}>
                {isLeaf ? (p >= 0.5 ? 'Predict: Democrat' : 'Predict: Republican') : (RULE[n.f!] ?? ((t: number) => `${featureLabel(n.f!)} ≤ ${t}`))(n.t!)}
              </text>
              <rect x={10} y={30} width={boxW - 20} height={6} rx={3} fill="var(--rep)" />
              <rect x={10} y={30} width={(boxW - 20) * p} height={6} rx={3} fill="var(--dem)" />
              <text x={10} y={49} style={{ fontSize: 10.5 }}>P(D) {pct(p, 0)} · {n.n} races</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------ simple vertical grouped bars */

export function YearBars({ rows, series, format, domain }: {
  rows: { label: string; values: number[] }[]
  series: { label: string; color: string }[]
  format: (v: number) => string
  domain: [number, number]
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 260, m = { l: 48, r: 8, t: 10, b: 28 }
  const band = (width - m.l - m.r) / rows.length
  const bw = Math.max(2, Math.min(26, (band - 14) / series.length))
  const y = linear(domain[0], domain[1], height - m.b, m.t)
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img">
        {ticks(domain[0], domain[1], 4).map((t) => (
          <g key={t}>
            <line className="gridline" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = m.l + i * band + (band - bw * series.length - 2 * (series.length - 1)) / 2
          return (
            <g key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={m.l + i * band} y={m.t} width={band} height={height - m.b - m.t} fill="transparent" />
              {r.values.map((v, k) => (
                <rect key={k} x={x0 + k * (bw + 2)} y={y(v)} width={bw} height={Math.max(0, y(domain[0]) - y(v))} rx={3}
                  fill={series[k].color} className="bar-v" opacity={hover === null || hover === i ? 1 : 0.55}
                  style={{ transitionDelay: `${i * 80 + k * 30}ms` }} />
              ))}
              <text x={m.l + i * band + band / 2} y={height - 8} textAnchor="middle" className="label">{r.label}</text>
            </g>
          )
        })}
        <line className="axisline" x1={m.l} x2={width - m.r} y1={y(domain[0])} y2={y(domain[0])} />
      </svg>
      {hover !== null && (
        <Tooltip x={m.l + hover * band + band / 2} y={y(Math.max(...rows[hover].values))}>
          <div className="muted">{rows[hover].label}</div>
          {series.map((s, k) => (
            <div key={s.label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <i style={{ width: 8, height: 8, borderRadius: 4, background: s.color, display: 'inline-block' }} />
              {s.label} <b className="tabular" style={{ marginLeft: 'auto' }}>{format(rows[hover].values[k])}</b>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  )
}
