import { useEffect, useMemo, useRef, useState } from 'react'
import { useTween } from '../components/anim'
import { ChartFrame, Legend, LineChart } from '../components/charts'
import { Hemicycle, SeatHistogram } from '../components/election'
import { Callout, Chapter, Code, PartyTag, probColor } from '../components/ui'
import { guide, lean, MAJORITY, pct } from '../lib/data'
import { districtFeatures, fixed, logreg, mulberry32, predict, randn } from '../lib/model'

const f = guide.forecast
const D = guide.districts
const GRID_LO = -25, GRID_HI = 35, STEP = 0.25
const GRID = Array.from({ length: (GRID_HI - GRID_LO) / STEP + 1 }, (_, i) => GRID_LO + i * STEP)
const N_SIMS = 10000
const CHUNK = 500

/** P(D) for every district at every environment on the grid: rows = grid points. */
function buildTable(model: 'logreg' | 'gbm') {
  return GRID.map((e) => Float64Array.from(D, (d) => predict(d, e, model)))
}

function lookup(table: Float64Array[], env: number) {
  const k = Math.max(0, Math.min(GRID.length - 1, Math.round((env - GRID_LO) / STEP)))
  return table[k]
}

export function Forecast() {
  const [env, setEnv] = useState(f.env)
  const [sigma, setSigma] = useState(f.sigmaEnv)
  const [model, setModel] = useState<'logreg' | 'gbm'>('logreg')
  const [counts, setCounts] = useState<number[]>(() => Array(436).fill(0))
  const [done, setDone] = useState(0)
  const [q, setQ] = useState('')
  const table = useMemo(() => buildTable(model), [model])
  const run = useRef(0)

  // Live Monte Carlo: one shared national polling error per simulated election, then 435 coin flips.
  useEffect(() => {
    const id = ++run.current
    const rand = mulberry32(2026)
    const acc = Array(436).fill(0)
    let n = 0, raf = 0
    const step = () => {
      if (id !== run.current) return
      for (let s = 0; s < CHUNK && n < N_SIMS; s++, n++) {
        const probs = lookup(table, env + sigma * randn(rand))
        let seats = 0
        for (let i = 0; i < probs.length; i++) if (rand() < probs[i]) seats++
        acc[seats]++
      }
      setCounts(acc.slice())
      setDone(n)
      if (n < N_SIMS) raf = requestAnimationFrame(step)
    }
    const t = setTimeout(() => { raf = requestAnimationFrame(step) }, 120) // debounce slider drags
    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [env, sigma, table])

  const total = Math.max(1, done)
  const pMaj = counts.slice(MAJORITY).reduce((s, c) => s + c, 0) / total
  const quant = (qq: number) => { let c = 0; for (let i = 0; i < 436; i++) { c += counts[i]; if (c >= qq * total) return i } return 435 }
  const median = quant(0.5), p10 = quant(0.1), p90 = quant(0.9)
  const pMajT = useTween(pMaj, 400)
  const probs = lookup(table, env)
  const expected = probs.reduce((s, p) => s + p, 0)
  const seats = D.map((d, i) => ({ id: d.id, p: probs[i], note: `PVI ${lean(d.pvi)} · ${d.incRunning ? `${d.incParty} incumbent` : 'open seat'}` }))
  const curve = useMemo(() => GRID.filter((e) => e >= -10 && e <= 20 && Math.abs(e * 2 - Math.round(e * 2)) < 1e-9)
    .map((e) => ({ x: e, y: lookup(table, e).reduce((s, p) => s + p, 0) })), [table])
  const breakEven = curve.find((c) => c.y >= MAJORITY)?.x

  const list = useMemo(() => {
    const s = q.trim().toUpperCase()
    const rows = D.map((d, i) => ({ d, p: probs[i] }))
    return (s ? rows.filter(({ d }) => d.id.includes(s) || d.state === s) : rows.filter(({ d }) => fixed(d) === null))
      .sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5)).slice(0, s ? 60 : 30)
  }, [q, probs])

  const fz = f.frozen
  return (
    <Chapter id="forecast" num="08" title="The 2026 forecast"
      kicker="The model trained on 2014–2024 meets the 2026 districts. You control the one thing it cannot know: the national mood."
      book={{ ch: 'Ch. 3–4', sections: ['Estimating Probabilities', 'Decision Boundaries', 'The Precision/Recall Trade-off'] }}>
      <div className="card" style={{ padding: 24 }}>
        <div className="grid-2" style={{ alignItems: 'center' }}>
          <div>
            <div className="tile-label">Frozen forecast · written {fz.frozenOn}, before any 2026 votes were counted</div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 8 }}>
              <div><div className="big-num">{pct(fz.pDemMajority, 0)}</div><div className="muted" style={{ fontSize: 13 }}>P(Democratic majority)</div></div>
              <div><div className="big-num">{fz.medianSeatsD}</div><div className="muted" style={{ fontSize: 13 }}>median Democratic seats</div></div>
              <div><div className="big-num" style={{ fontSize: 'clamp(28px,4vw,40px)', paddingTop: 10 }}>{fz.p10}–{fz.p90}</div><div className="muted" style={{ fontSize: 13 }}>80% of simulations</div></div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 15 }}>
            Inputs: generic-ballot average {lean(fz.env, 1)} (two-party), an assumed polling error of ±{fz.sigmaEnv} points (1 s.d.), {fz.sims.toLocaleString()} simulated
            elections, logistic regression. This is a <strong>conditional</strong> forecast: if the polls are right on average, this is what the
            district patterns of 2014–2024 imply. It is a classroom exercise, not a prediction you should bet or campaign on.
          </p>
        </div>
      </div>

      <div className="block">
        <h3>Steer it yourself</h3>
        <div className="card" style={{ display: 'grid', gap: 14 }}>
          <div className="slider-row">
            <label htmlFor="env">National environment</label>
            <input id="env" type="range" min={-12} max={20} step={0.25} value={env} onChange={(e) => setEnv(+e.target.value)} />
            <b className="tabular">{lean(env, 1)}</b>
          </div>
          <div className="slider-row">
            <label htmlFor="sig">Polling error (1 s.d.)</label>
            <input id="sig" type="range" min={0} max={6} step={0.25} value={sigma} onChange={(e) => setSigma(+e.target.value)} />
            <b className="tabular">±{sigma.toFixed(2)}</b>
          </div>
          <div className="controls" style={{ margin: 0 }}>
            <div className="seg" role="group" aria-label="Model">
              <button aria-pressed={model === 'logreg'} onClick={() => setModel('logreg')}>Logistic regression</button>
              <button aria-pressed={model === 'gbm'} onClick={() => setModel('gbm')}>Gradient boosting</button>
            </div>
            <button className="btn" onClick={() => { setEnv(f.env); setSigma(f.sigmaEnv); setModel('logreg') }}>Reset to polls</button>
            <button className="btn" onClick={() => setEnv(0)}>Tied nation</button>
            <button className="btn" onClick={() => setEnv(-f.env)}>Mirror: same lead for Republicans</button>
          </div>
        </div>
      </div>

      <div className="block grid-2">
        <ChartFrame title="Simulated Democratic seat totals"
          sub={<span>{done < N_SIMS ? <span className="live">Simulating… {done.toLocaleString()} / {N_SIMS.toLocaleString()}</span> : `${N_SIMS.toLocaleString()} simulated elections`}</span>}
          legend={<Legend items={[{ label: 'Democratic majority (≥218)', color: 'var(--dem)' }, { label: 'Republican majority', color: 'var(--rep)' }]} />}
          table={{ columns: ['Statistic', 'Value'], rows: [['P(Dem majority)', pct(pMaj)], ['Median D seats', median], ['10th–90th pct', `${p10}–${p90}`], ['Expected seats (no error)', expected.toFixed(1)]] }}>
          <SeatHistogram counts={counts} total={total} lo={150} hi={300} />
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 10 }}>
            <div><div className="tile-value tabular">{pct(pMajT, 0)}</div><div className="muted" style={{ fontSize: 13 }}>P(Democratic majority)</div></div>
            <div><div className="tile-value tabular">{pct(1 - pMajT, 0)}</div><div className="muted" style={{ fontSize: 13 }}>P(Republican majority)</div></div>
            <div><div className="tile-value tabular">{median}</div><div className="muted" style={{ fontSize: 13 }}>median D seats ({p10}–{p90})</div></div>
          </div>
        </ChartFrame>
        <ChartFrame title="The House at this environment" sub={`Expected ${expected.toFixed(0)} D – ${(435 - expected).toFixed(0)} R. Seats sorted from most to least likely Democratic.`}>
          <Hemicycle seats={seats} height={250} />
        </ChartFrame>
      </div>

      <div className="block">
        <ChartFrame title="How many seats each national environment buys" sub={`Expected Democratic seats (no polling error). Break-even for a majority: about ${breakEven !== undefined ? lean(breakEven, 1) : 'n/a'}.`}
          table={{ columns: ['Environment', 'Expected D seats'], rows: curve.filter((_, i) => i % 4 === 0).map((c) => [lean(c.x, 1), c.y.toFixed(1)]) }}>
          <LineChart height={280} yDomain={[150, 330]} xFormat={(v) => lean(v)} yFormat={(v) => `${v}`} xLabel="National environment (two-party margin)"
            markers={[{ x: Math.max(-10, Math.min(20, env)), label: `you: ${lean(env, 1)}` }]}
            series={[{ key: 's', label: 'D seats', color: 'var(--series-1)', points: curve },
              { key: 'm', label: '218', color: 'var(--axis)', points: curve.map((c) => ({ x: c.x, y: MAJORITY })), dashed: true }]} />
        </ChartFrame>
        <Callout kind="fair" title="Try the mirror button">
          Give Republicans the same lead and the picture should look like a reflection, minus the real structural differences in the map
          (the break-even point above is not exactly EVEN, because district lines and incumbents are not distributed evenly). The model
          has no party preference; the map and the polls drive the result.
        </Callout>
      </div>

      <div className="block">
        <h3>District explorer</h3>
        <input type="search" placeholder="Search a district (e.g. AZ-6) or a state (e.g. PA)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>{q ? 'Matches' : 'The 30 closest contested races'} at {lean(env, 1)} · {model === 'logreg' ? 'logistic regression' : 'gradient boosting'} · frozen = the published pre-election forecast</p>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead><tr><th style={{ paddingLeft: 18 }}>District</th><th className="num">PVI</th><th>Held by</th><th>Status</th><th style={{ minWidth: 200 }}>P(Democrat) now</th><th className="num">Frozen</th></tr></thead>
            <tbody>{list.map(({ d, p }) => {
              const why = fixed(d) === null ? logreg(districtFeatures(d, env)).contributions : null
              return (
                <tr key={d.id} title={why ? why.map((c) => `${c.key}: ${c.value >= 0 ? '+' : ''}${c.value.toFixed(2)}`).join('  ') : 'uncontested'}>
                  <td style={{ paddingLeft: 18 }} className="mono">{d.id}{d.newSeat ? <span className="pill" style={{ marginLeft: 6 }}>new</span> : null}</td>
                  <td className="num">{lean(d.pvi)}</td>
                  <td><PartyTag p={d.incParty} /></td>
                  <td style={{ fontSize: 12.5, maxWidth: 220 }} className="muted">{fixed(d) !== null ? 'Uncontested' : d.incRunning ? 'Incumbent running' : d.newSeat ? 'New seat' : 'Open seat'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, width: `${p * 100}%`, background: probColor(p), borderRadius: 4, transition: 'width .5s ease, background .5s ease' }} />
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--text-muted)' }} />
                      </div>
                      <b className="tabular" style={{ width: 44, textAlign: 'right' }}>{pct(p, 0)}</b>
                    </div>
                  </td>
                  <td className="num">{pct(d.pFrozen, 0)}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </div>

      <div className="block grid-2">
        <ChartFrame title="Where the environment number comes from" sub={`${f.genericBallot.source} · retrieved ${f.genericBallot.retrieved}`}
          table={{ columns: ['Aggregator', 'Dem', 'Rep', 'Two-party margin'], rows: f.genericBallot.rows.map((r) => [r.source, `${r.dem}%`, `${r.rep}%`, lean(100 * (r.dem - r.rep) / (r.dem + r.rep), 1)]) }}>
          <table className="data-table">
            <thead><tr><th>Aggregator</th><th className="num">Dem</th><th className="num">Rep</th><th className="num">Two-party</th></tr></thead>
            <tbody>{f.genericBallot.rows.map((r) => (
              <tr key={r.source} style={r.source === 'Average' ? { fontWeight: 700 } : undefined}>
                <td>{r.source}</td><td className="num">{r.dem}%</td><td className="num">{r.rep}%</td><td className="num">{lean(100 * (r.dem - r.rep) / (r.dem + r.rep), 1)}</td>
              </tr>
            ))}</tbody>
          </table>
        </ChartFrame>
        <div>
          <Callout kind="pitfall" title="What this model does not know">
            Candidate quality, scandals, money, turnout operations, third-party spoilers, ranked-choice rounds, California and
            Washington's top-two primaries, and Louisiana's December runoffs. Each is a reason a real forecaster adds judgment, and each
            is a feature you could try to add.
          </Callout>
          <Callout kind="concept" title="Why simulate instead of summing probabilities?">
            Summing 435 probabilities gives the expected seat count ({expected.toFixed(1)} now) but not the spread. Polling misses hit every
            district at once, so the outcomes are correlated. Drawing one national error per simulated election, then flipping the 435 coins,
            produces the realistic fat spread you see in the histogram. Set the polling error to 0 and watch it collapse.
          </Callout>
        </div>
      </div>
      <Code code={`
shifts = rng.normal(0, SIGMA_ENV, N_SIMS)                 # one national polling error per simulated election
for s in shifts:
    p = final_lr.predict_proba(X26.assign(env=env26 + s))[:, 1]
    p = np.where(contested, p, np.where(only_dem, 1.0, 0.0))
    seats.append((rng.random(435) < p).sum())         # 435 correlated coin flips
p_majority = (np.array(seats) >= 218).mean()
`} />
    </Chapter>
  )
}
