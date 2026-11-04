import { useMemo, useState, type ReactNode } from 'react'
import { linear, ticks, Tooltip, useWidth } from '../components/charts'
import { etTime, guide, lean, pct } from '../lib/data'
import { CLOSE, controlResult, observations, resultsOnlyEnv, scoreMarkets, scoreModels, scorePolls, type ModelRow, type PollRow } from '../lib/scoreboard'
import type { SCall } from '../lib/senate'
import { marketVerdict, MarketsPanel } from './MarketsPanel'

const MIN_N = 8 // fewer close races than this: say so instead of crowning a winner
const TIE = 0.005 // Brier gaps smaller than this are noise at tonight's sample sizes

/** One row per polling average: its two-party margin as a dot, against the band the called races imply. */
function PollDots({ rows, est, sd }: { rows: PollRow[]; est: number | null; sd: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const vals = rows.map((r) => r.margin).concat(est === null ? [] : [est - sd, est + sd])
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5)
  const row = 30, lw = 140, h = rows.length * row + 26
  const x = linear(lo, hi, lw, width - 16)
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={h} role="img" aria-label="Generic-ballot averages against the national margin implied by the called races">
        {est !== null && <>
          <rect x={x(Math.max(lo, est - sd))} width={Math.max(0, x(Math.min(hi, est + sd)) - x(Math.max(lo, est - sd)))} y={0} height={rows.length * row}
            fill="var(--series-3)" opacity={0.18} />
          <line x1={x(est)} x2={x(est)} y1={0} y2={rows.length * row} stroke="var(--series-3)" strokeWidth={2} />
        </>}
        {ticks(lo, hi, 6).map((t) => <g key={t}><line className="gridline" x1={x(t)} x2={x(t)} y1={0} y2={rows.length * row} />
          <text x={x(t)} y={rows.length * row + 17} textAnchor="middle">{lean(t)}</text></g>)}
        {rows.map((r, i) => {
          const cy = i * row + row / 2
          return (
            <g key={r.source} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={i * row} width={width} height={row} fill="transparent" />
              <text className="label" x={lw - 12} y={cy + 4} textAnchor="end" style={{ fontWeight: r.isAverage ? 650 : 400 }}>{r.source}</text>
              <circle cx={x(r.margin)} cy={cy} r={hover === i ? 7 : 5.5} fill={r.isAverage ? 'var(--text-primary)' : 'var(--series-1)'} stroke="var(--surface-1)" strokeWidth={1.5} />
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={x(rows[hover].margin)} y={hover * row + 2}>
          <b>{rows[hover].source}</b>: {lean(rows[hover].margin, 1)} two-party{est !== null && ` · ${Math.abs(rows[hover].gap).toFixed(1)} pts from the results`}
        </Tooltip>
      )}
    </div>
  )
}

export function Scoreboard({ called, sCalled, sLogLik, controls, closedAt }: {
  called: Map<string, 'D' | 'R' | 'O'>; sCalled: Map<string, SCall>; sLogLik: number[]; controls: ReactNode; closedAt?: string | null
}) {
  const obs = useMemo(() => observations(called, sCalled), [called, sCalled])
  const models = useMemo(() => scoreModels(obs), [obs])
  const est = useMemo(() => resultsOnlyEnv(called, sLogLik), [called, sLogLik])
  const n = obs.house.length + obs.sen.length
  const polls = useMemo(() => scorePolls(obs, est.mean), [obs, est.mean])

  // Rank on close races only: every model gets the safe seats right.
  const best = (ch: 'House' | 'Senate') => {
    const rows = models.filter((m) => m.chamber === ch && m.close).sort((a, b) => a.close!.brier - b.close!.brier)
    return rows.length ? { top: rows[0], tied: rows.length > 1 && rows[1].close!.brier - rows[0].close!.brier < TIE } : null
  }
  const bestH = best('House'), bestS = best('Senate')
  const ranked = [...polls].sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
  const closest = ranked[0]
  const spread = Math.max(...polls.map((p) => p.margin)) - Math.min(...polls.map((p) => p.margin))
  const resolved = n >= MIN_N && est.sd < spread / 2

  const nClose = (ch: 'House' | 'Senate') => (ch === 'House' ? obs.house : obs.sen).filter((o) => o.close).length
  const ranked1 = (b: typeof bestH, ch: 'House' | 'Senate') => !!b && !b.tied && nClose(ch) >= MIN_N
  const verdict = (ch: 'House' | 'Senate', b: typeof bestH) => {
    const nn = nClose(ch)
    if (!b) return `No close ${ch} races called yet.`
    if (nn < MIN_N) return `${ch}: ${nn} close race${nn === 1 ? '' : 's'} called, too few to rank the models.`
    if (b.tied) return `${ch}: the top models are within ${TIE} Brier on ${nn} close races, a tie so far.`
    return b.top.frozenChoice
      ? `${ch}: the frozen choice (${b.top.name}) leads on ${nn} close races.`
      : `${ch}: ${b.top.name} leads the frozen choice on ${nn} close races.`
  }
  const isBest = (m: ModelRow) => [bestH, bestS].some((b) => b && b.top === m && ranked1(b, m.chamber))
  const ours = polls.find((p) => p.isAverage) ? { margin: guide.forecast.frozen.env } : undefined // the input the forecast was frozen with
  const final = (t: string) => t.replace(' so far', '')
  const ctrl = controlResult(called, sCalled)
  const who = (c: 'D' | 'R' | null) => (c === 'D' ? 'Democrats' : c === 'R' ? 'Republicans' : 'not decided')
  const mkt = useMemo(() => scoreMarkets(obs).map((r) => ({ r, v: marketVerdict(r) })).filter((x) => x.v), [obs])
  const hD = [...called.values()].filter((w) => w === 'D').length, hR = [...called.values()].filter((w) => w === 'R').length

  return (
    <>
      {closedAt && n > 0 && (
        <section className="panel">
          <span className="pill">Exercise closed · {etTime(closedAt)}</span>
          <h2 style={{ marginTop: 12 }}>Final findings</h2>
          <ol className="findings">
            <li><b>Results at the close.</b> House: {called.size} of 435 races called, {hD} Democratic and {hR} Republican; majority: {who(ctrl.house)}.
              Senate control: {who(ctrl.senate)}. The frozen forecasts had given Democrats {pct(guide.forecast.frozen.pDemMajority, 0)} for the House.</li>
            <li><b>Models.</b> {final(verdict('House', bestH))} {final(verdict('Senate', bestS))} No model was refit after the polls closed.</li>
            {ours && <li><b>The national mood.</b> On their own, the called House and Senate races together imply {lean(est.mean, 1)} (± {est.sd.toFixed(1)}); our input, the
              frozen polling average, said {lean(ours.margin, 1)}, so it understated {est.mean > ours.margin ? 'Democrats' : 'Republicans'} by{' '}
              {Math.abs(est.mean - ours.margin).toFixed(1)} points. {resolved ? `${closest.source} came closest.` : `The averages were too close together to rank (${closest.source} nearest).`}{' '}
              One shared input moves every race the same way, which is why the misses all leaned one way.</li>}
            <li><b>Prediction markets.</b> {mkt.length
              ? mkt.map(({ r, v }) => `${r.chamber}, ${r.name}: ${v === 'tie' ? 'tied with the model' : v === 'market' ? 'ahead of the model' : 'behind the model'} on ${r.mClose!.n} close races.`).join(' ')
              : 'Too few close races priced and called to rank the markets against the model.'}{' '}
              Markets stayed a benchmark, never an input.</li>
            {ours && <li><b>Bottom line.</b> The error that mattered most was the shared national input: a {Math.abs(est.mean - ours.margin).toFixed(1)}-point miss
              against the ±{guide.forecast.frozen.sigmaEnv} points the forecast allowed for{Math.abs(est.mean - ours.margin) > guide.forecast.frozen.sigmaEnv ? ', so its ranges were too narrow' : ''}.
              Both guides' Chapter 09 grade the frozen forecasts race by race.</li>}
          </ol>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 0 }}>
            The count continued after this exercise closed; these findings use the results as of the close and do not change.
          </p>
        </section>
      )}
      <section className="panel hero-panel">
        <div className="hero-head">
          <div>
            <h1>Scoreboard</h1>
            <p className="muted" style={{ margin: 0 }}>Every candidate model, every polling average and two prediction markets, graded on the contested races called so far. Nothing is refit: these are the pre-election versions.</p>
          </div>
          {controls}
        </div>
        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Contested races scored</div><div className="kpi-value tabular">{n}</div>
            <div className="kpi-note">{obs.house.length} House · {obs.sen.length} Senate</div></div>
          <div className="kpi"><div className="kpi-label">Best House model so far</div><div className="kpi-value" style={{ fontSize: 20 }}>{ranked1(bestH, 'House') ? bestH!.top.name : bestH?.tied && nClose('House') >= MIN_N ? 'Tied' : '—'}</div>
            <div className="kpi-note">{bestH ? `close races: ${nClose('House')} · Brier ${bestH.top.close!.brier.toFixed(3)}` : 'waiting for close races'}</div></div>
          <div className="kpi"><div className="kpi-label">Best Senate model so far</div><div className="kpi-value" style={{ fontSize: 20 }}>{ranked1(bestS, 'Senate') ? bestS!.top.name : bestS?.tied && nClose('Senate') >= MIN_N ? 'Tied' : '—'}</div>
            <div className="kpi-note">{bestS ? `close races: ${nClose('Senate')} · Brier ${bestS.top.close!.brier.toFixed(3)}` : 'waiting for close races'}</div></div>
          <div className="kpi"><div className="kpi-label">National margin, from results only</div><div className="kpi-value tabular">{n ? lean(est.mean, 1) : '—'}</div>
            <div className="kpi-note">{n ? `± ${est.sd.toFixed(1)} · polls said ${lean(polls.find((p) => p.isAverage)?.margin ?? 0, 1)}` : 'no polls used in this estimate'}</div></div>
        </div>
      </section>

      <section className="panel">
        <h2>Which model predicts better?</h2>
        <p className="muted sub">Brier score = average squared gap between the probability and what happened (0 is perfect, 0.25 is a coin flip). Log loss punishes confident misses harder. Models are ranked on close races (lean within {CLOSE} points): every model gets the safe seats right.</p>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Chamber</th><th>Model</th><th className="num">Races</th><th className="num">Accuracy</th><th className="num">Brier</th><th className="num">Log loss</th><th className="num">Close races</th><th className="num">Brier, close</th><th /></tr></thead>
            <tbody>{models.map((m) => (
              <tr key={m.chamber + m.key}>
                <td>{m.chamber}</td><td>{m.name}</td>
                <td className="num">{m.s?.n ?? 0}</td>
                <td className="num">{m.s ? pct(m.s.acc, 1) : '—'}</td>
                <td className="num">{m.s ? m.s.brier.toFixed(3) : '—'}</td>
                <td className="num">{m.s ? m.s.logloss.toFixed(3) : '—'}</td>
                <td className="num">{m.close?.n ?? 0}</td>
                <td className="num"><b>{m.close ? m.close.brier.toFixed(3) : '—'}</b></td>
                <td>{m.frozenChoice && <span className="tag">frozen choice</span>} {isBest(m) && <span className="tag tag-best">best so far</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p style={{ fontSize: 14.5, marginBottom: 0 }}>{verdict('House', bestH)} {verdict('Senate', bestS)}</p>
        <p className="muted" style={{ fontSize: 13.5 }}>
          The frozen choices were picked by a rule written down before the election (lowest held-out Brier). If another model wins tonight, that is a
          finding, not a reason to have switched: one night is one draw, and most races are safe seats every model gets right.
        </p>
      </section>


      <section className="panel">
        <h2>Which polling average was closest?</h2>
        <p className="muted sub">
          Each dot is a final generic-ballot average converted to a two-party margin. The aqua band is the national margin the called races imply on their own
          (flat prior, so no poll is favored), ± one standard deviation.
        </p>
        <PollDots rows={polls} est={n ? est.mean : null} sd={est.sd} />
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Average</th><th className="num">Two-party margin</th><th className="num">Gap to results</th><th className="num">Brier if the forecast had used it</th></tr></thead>
            <tbody>{ranked.map((p) => (
              <tr key={p.source}>
                <td>{p.isAverage ? <b>{p.source} (our input)</b> : p.source}</td>
                <td className="num">{lean(p.margin, 1)}</td>
                <td className="num">{n ? `${p.gap > 0 ? '+' : ''}${p.gap.toFixed(1)}` : '—'}</td>
                <td className="num">{p.s ? p.s.brier.toFixed(4) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p style={{ fontSize: 14.5, marginBottom: 0 }}>
          {!n ? 'Waiting for the first contested races.'
            : resolved ? <>So far <b>{closest.source}</b> is closest: {Math.abs(closest.gap).toFixed(1)} points from what the results imply.</>
              : <>Too close to call: the results pin the national margin to ±{est.sd.toFixed(1)} points, but the averages are only {spread.toFixed(1)} points apart.{' '}
                {closest.source} is nearest for now.</>}
        </p>
        <p className="muted" style={{ fontSize: 13.5 }}>
          Caveats: this reads the national mood through the model, so a model bias (say, too much credit for incumbents) shifts the estimate too. Calls
          are not random: safe seats and eastern states come first. These are averages of many polls, not individual polls. The final answer is the
          national House popular vote, which takes weeks to count; positive gaps mean the average overstated Democrats.
        </p>
      </section>

      <MarketsPanel called={called} sCalled={sCalled} />
    </>
  )
}
