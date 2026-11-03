// Small hand-built SVG chart kit. Specs: thin marks, 4px rounded data-ends,
// hairline solid grid, hover tooltips, a data-table view on every chart.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useInView } from './anim'

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0)

export function ticks(min: number, max: number, count = 5) {
  const step0 = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}

/** Path for a bar with a 4px rounded data-end and a square baseline end. */
export function barPath(x: number, y: number, w: number, h: number, horizontal: boolean, r = 4) {
  if (horizontal) {
    if (w <= 0) return ''
    const rr = Math.min(r, w, h / 2)
    return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`
  }
  if (h <= 0) return ''
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export interface TableSpec { columns: string[]; rows: (string | number)[][] }

export function ChartFrame({ title, sub, legend, table, children }: {
  title?: ReactNode; sub?: ReactNode; legend?: ReactNode; table?: TableSpec; children: ReactNode
}) {
  // Charts animate in (bars grow, lines draw) the first time they scroll into view: see .reveal in index.css
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <figure ref={ref} className={`chart reveal ${inView ? 'in' : ''}`} style={{ margin: 0 }}>
      {title && <div className="chart-title">{title}</div>}
      {sub && <div className="chart-sub">{sub}</div>}
      {legend}
      {children}
      {table && (
        <details className="table-view">
          <summary>View as table</summary>
          <table className="data-table">
            <thead><tr>{table.columns.map((c, i) => <th key={c} className={i ? 'num' : ''}>{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => (
              <tr key={i}>{r.map((v, j) => <td key={j} className={j ? 'num' : ''}>{v}</td>)}</tr>
            ))}</tbody>
          </table>
        </details>
      )}
    </figure>
  )
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => <span key={i.label}><i className={i.line ? 'line' : ''} style={{ background: i.color }} />{i.label}</span>)}
    </div>
  )
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div className="tooltip" style={{ left: x, top: y }}>{children}</div>
}

/* ------------------------------------------------------------ horizontal bars */

export interface BarItem { label: string; value: number; highlight?: boolean; note?: string }

export function BarList({ items, format, domain, reference, labelWidth = 200, emphasis = true }: {
  items: BarItem[]; format: (v: number) => string; domain?: [number, number]
  reference?: { value: number; label: string }; labelWidth?: number; emphasis?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const lw = width < 520 ? Math.min(130, labelWidth) : labelWidth
  const row = 34, bar = 18, valueW = 56
  const [d0, d1] = domain ?? [0, Math.max(...items.map((i) => i.value))]
  const x = linear(d0, d1, 0, Math.max(40, width - lw - valueW))
  const h = items.length * row + 24
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={h} role="img">
        {ticks(d0, d1, 4).map((t) => (
          <g key={t} transform={`translate(${lw + x(t)},0)`}>
            <line className="gridline" y1={0} y2={items.length * row} />
            <text y={items.length * row + 16} textAnchor="middle">{format(t)}</text>
          </g>
        ))}
        {items.map((it, i) => {
          const y = i * row + (row - bar) / 2
          const w = Math.max(0, x(it.value))
          const color = !emphasis || it.highlight ? 'var(--series-1)' : 'var(--deemph)'
          return (
            <g key={it.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={i * row} width={width} height={row} fill="transparent" />
              <text className="label" x={lw - 12} y={y + bar / 2 + 4.5} textAnchor="end"
                style={it.highlight ? { fill: 'var(--text-primary)', fontWeight: 700 } : undefined}>{it.label}</text>
              <path d={barPath(lw, y, w, bar, true)} fill={color} opacity={hover === null || hover === i ? 1 : 0.55}
                className="bar-h" style={{ transitionDelay: `${i * 60}ms` }} />
              <text className="value" x={lw + w + 8} y={y + bar / 2 + 4.5}>{format(it.value)}</text>
            </g>
          )
        })}
        <line className="axisline" x1={lw} x2={lw} y1={0} y2={items.length * row} />
        {reference && (
          <g transform={`translate(${lw + x(reference.value)},0)`}>
            <line y1={-4} y2={items.length * row} stroke="var(--text-primary)" strokeWidth={1.5} />
            <text y={-8} textAnchor="middle" style={{ fill: 'var(--text-primary)', fontWeight: 600 }}>{reference.label}</text>
          </g>
        )}
      </svg>
      {hover !== null && items[hover].note && (
        <Tooltip x={lw + x(items[hover].value)} y={hover * row + 6}>{items[hover].note}</Tooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ diverging bars */

export function DivergingBars({ items, format, leftLabel, rightLabel }: {
  items: { label: string; value: number }[]; format: (v: number) => string; leftLabel: string; rightLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const row = 28, bar = 14, lw = 124
  const max = Math.max(0.5, ...items.map((i) => Math.abs(i.value)))
  const half = (width - lw - 8) / 2
  const cx = lw + half
  const x = linear(0, max, 0, half - 52) // leave room for the value label
  return (
    <div ref={ref} className="chart">
      <svg width={width} height={items.length * row + 26}>
        <text x={cx - 8} y={12} textAnchor="end">← {leftLabel}</text>
        <text x={cx + 8} y={12}>{rightLabel} →</text>
        <g transform="translate(0,22)">
          {items.map((it, i) => {
            const y = i * row + (row - bar) / 2
            const w = x(Math.abs(it.value))
            const pos = it.value >= 0
            return (
              <g key={it.label}>
                <text className="label" x={lw - 10} y={y + bar / 2 + 4.5} textAnchor="end">{it.label}</text>
                {/* negative bars: draw rightward, then mirror around the center line */}
                <g transform={pos ? undefined : `matrix(-1,0,0,1,${2 * cx},0)`}>
                  <path d={barPath(cx, y, w, bar, true)} fill={pos ? 'var(--series-1)' : 'var(--series-2)'}
                    className="bar-h" style={{ transitionDelay: `${i * 60}ms` }} />
                </g>
                <text className="value" x={pos ? cx + w + 6 : cx - w - 6} y={y + bar / 2 + 4.5} textAnchor={pos ? 'start' : 'end'}
                  style={{ fontWeight: 500 }}>{format(it.value)}</text>
              </g>
            )
          })}
          <line className="axisline" x1={cx} x2={cx} y1={0} y2={items.length * row} />
        </g>
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------ line chart */

export interface Series { key: string; label: string; color: string; points: { x: number; y: number }[]; endLabel?: boolean; dashed?: boolean }

export function LineChart({ series, xFormat, yFormat, yDomain, logX, height = 280, xLabel, markers }: {
  series: Series[]; xFormat: (v: number) => string; yFormat: (v: number) => string
  yDomain: [number, number]; logX?: boolean; height?: number; xLabel?: string
  markers?: { x: number; label: string }[]
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hx, setHx] = useState<number | null>(null)
  const m = { l: 48, r: 92, t: 12, b: xLabel ? 44 : 28 }
  const xs = series[0].points.map((p) => p.x)
  const tx = (v: number) => (logX ? Math.log10(v) : v)
  const x = linear(tx(Math.min(...xs)), tx(Math.max(...xs)), m.l, width - m.r)
  const X = (v: number) => x(tx(v))
  const y = linear(yDomain[0], yDomain[1], height - m.b, m.t)
  const xTicks = logX ? xs : ticks(Math.min(...xs), Math.max(...xs), 6)
  const nearest = hx === null ? null : xs.reduce((best, v) => (Math.abs(X(v) - hx) < Math.abs(X(best) - hx) ? v : best), xs[0])
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={height}
        onMouseMove={(e) => setHx(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onMouseLeave={() => setHx(null)}>
        {ticks(yDomain[0], yDomain[1], 4).map((t) => (
          <g key={t}>
            <line className="gridline" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">{yFormat(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => <text key={t} x={X(t)} y={height - m.b + 18} textAnchor="middle">{xFormat(t)}</text>)}
        {xLabel && <text x={(m.l + width - m.r) / 2} y={height - 4} textAnchor="middle">{xLabel}</text>}
        <line className="axisline" x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} />
        {markers?.map((mk) => (
          <g key={mk.label}>
            <line x1={X(mk.x)} x2={X(mk.x)} y1={m.t} y2={height - m.b} stroke="var(--axis)" />
            <text x={X(mk.x) + 6} y={m.t + 12} style={{ fill: 'var(--text-secondary)' }}>{mk.label}</text>
          </g>
        ))}
        {series.map((s) => {
          const last = s.points[s.points.length - 1]
          return (
            <g key={s.key}>
              <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${y(p.y)}`).join('')} pathLength={1} className={s.dashed ? "fade-line" : "draw"}
                fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '0.012 0.01' : undefined} />
              <circle cx={X(last.x)} cy={y(last.y)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
              {s.endLabel !== false && <text className="label" x={X(last.x) + 10} y={y(last.y) + 4}>{s.label}</text>}
            </g>
          )
        })}
        {nearest !== null && (
          <g>
            <line x1={X(nearest)} x2={X(nearest)} y1={m.t} y2={height - m.b} stroke="var(--axis)" />
            {series.map((s) => {
              const p = s.points.find((q) => q.x === nearest)!
              return <circle key={s.key} cx={X(p.x)} cy={y(p.y)} r={5} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
            })}
          </g>
        )}
      </svg>
      {nearest !== null && (
        <Tooltip x={X(nearest)} y={y(Math.max(...series.map((s) => s.points.find((q) => q.x === nearest)!.y)))}>
          <div className="muted">{xLabel ? `${xLabel}: ` : ''}{xFormat(nearest)}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <i style={{ width: 8, height: 8, borderRadius: 4, background: s.color, display: 'inline-block' }} />
              {s.label} <b className="tabular" style={{ marginLeft: 'auto' }}>{yFormat(s.points.find((q) => q.x === nearest)!.y)}</b>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ radar (spider) chart */

export interface RadarSeries { key: string; label: string; color: string; values: number[]; outline?: boolean }

/** Stat-profile radar. Rings are hairlines; series are 2px outlines with a light wash.
 *  Hovering a spoke shows every series' value on that axis. */
export function Radar({ series, axes, max, size = 260, compact = false, axisNote }: {
  series: RadarSeries[]; axes: string[]; max: number; size?: number; compact?: boolean
  /** extra text under each axis label, e.g. the values */
  axisNote?: (i: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const pad = compact ? 22 : axisNote ? 44 : 34
  const r = size / 2 - pad
  const c = size / 2
  const n = axes.length
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, v: number) => {
    const k = (Math.min(v, max) / max) * r
    return [c + k * Math.cos(angle(i)), c + k * Math.sin(angle(i))] as const
  }
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ')
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    const a = Math.atan2(e.clientY - b.top - c, e.clientX - b.left - c)
    let best = 0, bd = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(Math.atan2(Math.sin(a - angle(i)), Math.cos(a - angle(i))))
      if (d < bd) { bd = d; best = i }
    }
    setHover(best)
  }
  const [hx, hy] = hover === null ? [0, 0] : pt(hover, max * 0.62)
  return (
    <div className="chart" style={{ position: 'relative', width: size, maxWidth: '100%' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: '100%', height: 'auto' }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
        aria-label={series.map((s) => `${s.label}: ${axes.map((a, i) => `${a} ${Math.round(s.values[i])}`).join(', ')}`).join('; ')}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={poly(axes.map(() => max * f))} fill="none" className="gridline" />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, max)
          return <line key={i} x1={c} y1={c} x2={x} y2={y} className={hover === i ? 'axisline' : 'gridline'} strokeWidth={hover === i ? 1.5 : 1} />
        })}
        {series.map((s) => (
          <g key={s.key}>
            <polygon points={poly(s.values)} fill={s.outline ? 'none' : s.color} fillOpacity={0.14}
              stroke={s.color} strokeWidth={s.outline ? 1.5 : 2} strokeLinejoin="round" />
            {!compact && !s.outline && s.values.map((v, i) => {
              const [x, y] = pt(i, v)
              return <circle key={i} cx={x} cy={y} r={hover === i ? 5 : 3.5} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
            })}
          </g>
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, max * (1 + (compact ? 0.2 : 0.18)))
          const anchor = Math.abs(Math.cos(angle(i))) < 0.3 ? 'middle' : Math.cos(angle(i)) > 0 ? 'start' : 'end'
          return (
            <text key={a} x={x} y={y + 4} textAnchor={anchor} className={compact ? undefined : 'label'}
              style={{ fontSize: compact ? 9.5 : 12, fontWeight: hover === i ? 700 : undefined }}>
              {a}
              {axisNote && <tspan x={x} dy={14} className="value" style={{ fontSize: 11.5 }}>{axisNote(i)}</tspan>}
            </text>
          )
        })}
      </svg>
      {hover !== null && !compact && (
        <Tooltip x={hx} y={hy}>
          <div className="muted">{axes[hover]}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <i style={{ width: 8, height: 8, borderRadius: 4, background: s.color, display: 'inline-block' }} />
              {s.label} <b className="tabular" style={{ marginLeft: 'auto' }}>{Math.round(s.values[hover])}</b>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  )
}
