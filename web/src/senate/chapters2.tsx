import { useEffect, useMemo, useRef, useState } from 'react'
import { useTween } from '../components/anim'
import { BarList, ChartFrame, Legend, LineChart } from '../components/charts'
import { SeatHistogram, YearBars } from '../components/election'
import { Callout, Chapter, Code, probColor, StatTile } from '../components/ui'
import { dataUrl, guide, lean, pct } from '../lib/data'
import { GRID, gridIndex } from '../lib/live'
import { mulberry32, randn } from '../lib/model'
import { D_CONTROL, HOLD, R_CONTROL, raceName, senate, SF, SR, STABLE } from '../lib/senate'
import { chosen } from './chapters1'

const fz = SF.frozen
const N_SIMS = 8000
const CHUNK = 800

/* ------------------------------------------------------------ 06 */

export function Neutral() {
  const sym = senate.symmetry
  return (
    <Chapter id="neutral" num="06" title="The neutrality check"
      kicker="Swap the parties. A fair model's answer should swap too."
      book={{ ch: 'Ch. 2', sections: ['Check the Assumptions', 'Nonrepresentative Training Data'] }}>
      <p>
        Negate every feature, so a race that leans 8 points to the Democratic side becomes one that leans 8 points to the Republican side, with the
        incumbent and seat holder swapped too, and compare P(Democratic side) before with P(Republican side) after.
      </p>
      <div className="grid-3">
        <StatTile label="Senate logistic: avg. asymmetry" value={sym.logregGap} format={(v) => pct(v, 1)} note="|P(x) + P(swapped x) − 1|" />
        <StatTile label="Gradient boosting: avg. asymmetry" value={sym.gbmGap} format={(v) => pct(v, 1)} note="trees split at uneven thresholds" />
        <StatTile label="Stand-in rule" value="Symmetric" note="an independent stands in for whichever party has no nominee" />
      </div>
      <Callout kind="fair" title="Where the remaining gap comes from">
        A logistic model has an intercept: its answer when every feature is zero (an even state, even national mood, open seat). Learned from
        history, it is not exactly 50%, and that is the whole asymmetry. With only {senate.counts.contested} Senate races the intercept is noisy; the pooled
        model's intercept leans on the House as well. If you want exact symmetry, train on party-swapped copies of every race (the House guide shows this costs nothing).
      </Callout>
      <Callout kind="fair" title="The two asymmetric rules are not the model's">
        The Vice President's tie-break and which independents caucus with whom are facts about the Senate in 2026, applied in the seat count, not
        learned. Both are stated up front and both would flip with the facts.
      </Callout>
    </Chapter>
  )
}

/* ------------------------------------------------------------ 07 */

export function Forecast() {
  const [env, setEnv] = useState(SF.env)
  const [sigma, setSigma] = useState(SF.sigmaEnv)
  const [hist, setHist] = useState<number[]>(() => Array(101).fill(0))
  const [ctrl, setCtrl] = useState({ r: 0, d: 0, n: 0 })
  const run = useRef(0)

  // Monte Carlo: one shared national error per simulated election, then one draw per race; held-over seats are fixed.
  useEffect(() => {
    const id = ++run.current
    const rand = mulberry32(2026)
    const acc = Array(101).fill(0)
    let n = 0, r50 = 0, d51 = 0, raf = 0
    const step = () => {
      if (id !== run.current) return
      for (let s = 0; s < CHUNK && n < N_SIMS; s++, n++) {
        const row = STABLE[gridIndex(env + sigma * randn(rand))]
        let r = HOLD.R, d = HOLD.D + HOLD.I_caucusD
        for (let i = 0; i < row.length; i++) {
          if (rand() < row[i]) { if (!SR[i].dStandin) d++ } else r++
        }
        acc[r]++
        if (r >= R_CONTROL) r50++
        else if (d >= D_CONTROL) d51++
      }
      setHist(acc.slice())
      setCtrl({ r: r50, d: d51, n })
      if (n < N_SIMS) raf = requestAnimationFrame(step)
    }
    const t = setTimeout(() => { raf = requestAnimationFrame(step) }, 120)
    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [env, sigma])

  const total = Math.max(1, ctrl.n)
  const pR = useTween(ctrl.r / total, 400), pD = useTween(ctrl.d / total, 400)
  const row = STABLE[gridIndex(env)]
  const races = SR.map((r, i) => ({ r, p: row[i] })).sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5))
  const tipping = [...SR].sort((a, b) => b.pTipping - a.pTipping).slice(0, 10)
  const curve = SF.ctrlCurve
  const evenEnv = useMemo(() => {
    const k = GRID.findIndex((e) => e >= -15 && STABLE[gridIndex(e)].reduce((s, p, i) => s + (SR[i].dStandin ? 0 : p), 0) + HOLD.D + HOLD.I_caucusD >= D_CONTROL - 0.5)
    return k >= 0 ? GRID[k] : null
  }, [])

  return (
    <Chapter id="forecast" num="07" title="The 2026 forecast"
      kicker="The chosen model meets the 35 races of 2026, at the same national mood as the House forecast."
      book={{ ch: 'Ch. 3–4', sections: ['Estimating Probabilities', 'Decision Boundaries'] }}>
      <div className="card" style={{ padding: 24 }}>
        <div className="grid-2" style={{ alignItems: 'center' }}>
          <div>
            <div className="tile-label">Frozen forecast · committed {fz.frozenOn}, before polls closed</div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 8 }}>
              <div><div className="big-num" style={{ color: 'var(--text-primary)' }}>{pct(fz.pRControl, 0)}</div><div className="muted" style={{ fontSize: 13 }}>P(Republicans keep control)</div></div>
              <div><div className="big-num">{pct(fz.pDControl, 0)}</div><div className="muted" style={{ fontSize: 13 }}>P(Democrats take control)</div></div>
              <div><div className="big-num" style={{ fontSize: 'clamp(28px,4vw,40px)', paddingTop: 10 }}>{fz.p10R}–{fz.p90R}</div><div className="muted" style={{ fontSize: 13 }}>Republican seats, 80% range (median {fz.medianSeatsR})</div></div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 15 }}>
            Same inputs as the House: generic ballot {lean(fz.env, 1)}, polling error ±{fz.sigmaEnv} points, {fz.sims.toLocaleString()} simulated elections.
            Model: {fz.modelName}. P(no majority without the independents) = {pct(fz.pNoMajority, 1)}. At a national mood where the House is close to certain,
            the Senate is close to a coin flip: the map, not the mood, is doing the work.
          </p>
        </div>
      </div>

      <div className="block">
        <h3>Steer it yourself</h3>
        <div className="card" style={{ display: 'grid', gap: 14 }}>
          <div className="slider-row">
            <label htmlFor="senv">National environment</label>
            <input id="senv" type="range" min={-12} max={20} step={0.25} value={env} onChange={(e) => setEnv(+e.target.value)} />
            <b className="tabular">{lean(env, 1)}</b>
          </div>
          <div className="slider-row">
            <label htmlFor="ssig">Polling error (1 s.d.)</label>
            <input id="ssig" type="range" min={0} max={6} step={0.25} value={sigma} onChange={(e) => setSigma(+e.target.value)} />
            <b className="tabular">±{sigma.toFixed(2)}</b>
          </div>
          <div className="controls" style={{ margin: 0 }}>
            <button className="btn" onClick={() => { setEnv(SF.env); setSigma(SF.sigmaEnv) }}>Reset to polls</button>
            <button className="btn" onClick={() => setEnv(0)}>Tied nation</button>
            <button className="btn" onClick={() => setEnv(-SF.env)}>Mirror: same lead for Republicans</button>
            {evenEnv !== null && <span className="muted" style={{ fontSize: 13.5 }}>Democrats reach 51 expected seats at about {lean(evenEnv, 1)}.</span>}
          </div>
        </div>
      </div>

      <div className="block grid-2">
        <ChartFrame title="Simulated Republican seat totals" sub={`${ctrl.n.toLocaleString()} simulated elections · ${100 - SR.length} held-over seats included`}
          legend={<Legend items={[{ label: `Republican control (${R_CONTROL}+)`, color: 'var(--rep)' }, { label: 'Republicans short of 50', color: 'var(--dem)' }]} />}
          table={{ columns: ['Statistic', 'Value'], rows: [['P(Republican control)', pct(ctrl.r / total)], ['P(Democratic control)', pct(ctrl.d / total)], ['P(no majority w/o independents)', pct(1 - (ctrl.r + ctrl.d) / total)]] }}>
          <SeatHistogram counts={hist} total={total} lo={38} hi={62} majority={R_CONTROL} above="var(--rep)" below="var(--dem)" describe={(n) => `${n} Republican seats`} />
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 10 }}>
            <div><div className="tile-value tabular">{pct(pR, 0)}</div><div className="muted" style={{ fontSize: 13 }}>P(Republican control)</div></div>
            <div><div className="tile-value tabular">{pct(pD, 0)}</div><div className="muted" style={{ fontSize: 13 }}>P(Democratic control)</div></div>
          </div>
        </ChartFrame>
        <ChartFrame title="Control vs. the national mood" sub="Frozen model, polling error removed: how control moves as the environment shifts"
          legend={<Legend items={[{ label: 'P(Republican control)', color: 'var(--rep)' }, { label: 'P(Democratic control)', color: 'var(--dem)' }]} />}
          table={{ columns: ['Environment', 'P(R control)', 'P(D control)', 'Expected R seats'], rows: curve.map((p) => [lean(p.env, 1), pct(p.pR), pct(p.pD), p.seatsR]) }}>
          <LineChart height={260} yDomain={[0, 1]} xFormat={(v) => lean(v, 0)} yFormat={(v) => pct(v, 0)} xLabel="National environment"
            series={[{ key: 'r', label: 'R control', color: 'var(--rep)', points: curve.map((p) => ({ x: p.env, y: p.pR })), endLabel: false },
              { key: 'd', label: 'D control', color: 'var(--dem)', points: curve.map((p) => ({ x: p.env, y: p.pD })), endLabel: false }]}
            markers={[{ x: SF.env, label: 'polls' }]} />
        </ChartFrame>
      </div>

      <div className="block grid-2">
        <ChartFrame title="Tipping-point races" sub="How often each race delivered the seat that decided control, in the frozen simulation"
          table={{ columns: ['Race', 'P(tipping point)', 'P(Democratic side)'], rows: tipping.map((r) => [raceName(r), pct(r.pTipping, 1), pct(r.pFrozen, 0)]) }}>
          <BarList items={tipping.map((r) => ({ label: raceName(r), value: r.pTipping, note: `P(D side) ${pct(r.pFrozen, 0)} · ${r.dName ?? '—'} vs ${r.rName ?? '—'}` }))}
            format={(v) => pct(v, 0)} labelWidth={150} emphasis={false} />
        </ChartFrame>
        <Callout kind="concept" title="Why tipping points beat close races">
          The closest race is not always the one that matters. A tipping-point race is the one that hands a party its {R_CONTROL}th (or {D_CONTROL}st) seat once
          every race is lined up from safest to least safe for that party. It combines how close a race is with where it sits in the order, which is
          exactly what campaigns use to decide where to spend. We read it straight off the simulation: in each run, sort the races, find the deciding one,
          count.
        </Callout>
      </div>

      <div className="block">
        <h3>Every race at {lean(env, 1)}</h3>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Race</th><th>Democratic side</th><th>Republican side</th><th className="num">Lean</th><th className="num">Cook</th><th>Incumbent</th><th style={{ minWidth: 170 }}>P(Democratic side)</th><th className="num">Frozen</th></tr></thead>
            <tbody>{races.map(({ r, p }) => (
              <tr key={r.id}>
                <td>{raceName(r)}</td><td>{r.dName ?? '—'}</td><td>{r.rName ?? '—'}</td>
                <td className="num">{lean(r.lean, 1)}</td><td className="num">{r.cook === null ? '—' : lean(r.cook)}</td>
                <td>{r.incRunning ? `${r.incParty} running` : `open (${r.incParty ?? '—'})`}</td>
                <td><div className="pbar"><div style={{ width: `${p * 100}%`, background: probColor(p) }} /><span /></div></td>
                <td className="num">{pct(r.pFrozen, 0)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13.5 }}>“(I)” = an independent standing in where Democrats have no nominee. The model sees only the side, not the candidate.</p>
      </div>
    </Chapter>
  )
}

/* ------------------------------------------------------------ 08 */

const CELL: Record<string, string> = { D: 'Democratic Senate', R: 'Republican Senate', N: 'No Senate majority without independents' }

export function Congress() {
  const j = fz.joint, ind = fz.jointIfIndependent
  const be = SF.byEnv
  const splitJ = j.DR + j.RD, splitI = ind.DR + ind.RD
  return (
    <Chapter id="congress" num="08" title="Control of Congress"
      kicker="Two forecasts, one national mood. Multiplying their odds would be a classic mistake."
      book={{ ch: 'Ch. 2 & 4', sections: ['Look for Correlations', 'Estimating Probabilities'] }}>
      <p>
        Both chambers were simulated together: each run draws one national polling error, then every House district and every Senate race at that
        same environment. Next to each joint probability is what you would get by multiplying the two chambers' separate odds, as if they were independent.
      </p>
      <div className="scroll-x card" style={{ padding: 0 }}>
        <table className="data-table congress">
          <thead><tr><th /><th className="num">Democratic House</th><th className="num">Republican House</th></tr></thead>
          <tbody>{(['D', 'R', 'N'] as const).map((s) => (
            <tr key={s}><th scope="row">{CELL[s]}</th>
              {(['D', 'R'] as const).map((h) => <td key={h} className="num"><b className="tabular" style={{ fontSize: 20 }}>{pct(j[h + s], 1)}</b>
                <div className="muted" style={{ fontSize: 12 }}>if independent: {pct(ind[h + s], 1)}</div></td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="block grid-2">
        <ChartFrame title="Same national mood, both chambers" sub="Frozen simulation split by how wrong the polls turned out (shift of more than 2 points either way)"
          legend={<Legend items={[{ label: 'P(Democratic House)', color: 'var(--dem)' }, { label: 'P(Republican Senate)', color: 'var(--rep)' }]} />}
          table={{ columns: ['World', 'Share of runs', 'P(D House)', 'P(R Senate)', 'P(D Senate)'], rows: be.map((b) => [b.label, pct(b.share, 0), pct(b.pHouseD), pct(b.pSenateR), pct(b.pSenateD)]) }}>
          <YearBars rows={be.map((b) => ({ label: b.label.replace('Polls ', ''), values: [b.pHouseD, b.pSenateR] }))}
            series={[{ label: 'D House', color: 'var(--dem)' }, { label: 'R Senate', color: 'var(--rep)' }]} format={(v) => pct(v, 0)} domain={[0, 1]} />
        </ChartFrame>
        <div>
          <Callout kind="concept" title="Correlation, not coincidence">
            P(Republican Senate) is {pct(be[0].pSenateR, 0)} in the runs where the polls overstated Democrats and {pct(be[2].pSenateR, 0)} where they understated
            them. The House moves the same way. So "Democratic House <em>and</em> Republican Senate" is {pct(j.DR, 1)} jointly versus {pct(ind.DR, 1)} if you
            multiply, and a Republican House with a Democratic Senate is {pct(j.RD, 2)} versus {pct(ind.RD, 2)}: the worlds where Republicans win the House are
            exactly the worlds where they also hold the Senate.
          </Callout>
          <Callout kind="pitfall" title="Where the independence assumption bites">
            Split control comes out at {pct(splitJ, 1)} jointly against {pct(splitI, 1)} under independence. The difference looks small here only because the House
            is so lopsided ({pct(fz.houseD, 0)} Democratic). In a year where both chambers are close, assuming independence badly overstates the
            mixed outcomes, the same way a portfolio model that ignores correlation understates crashes.
          </Callout>
        </div>
      </div>
      <Code code={`
shift = rng.normal(0, 3.0, N)                       # one national polling error per run
house_D = simulate_house(env + shift) >= 218        # every district at that environment
senate_R = simulate_senate(env + shift) >= 50       # every Senate race at the SAME environment
joint = (house_D & senate_R).mean()                 # vs. house_D.mean() * senate_R.mean()
`} />
    </Chapter>
  )
}

/* ------------------------------------------------------------ 09 */

export function Score() {
  const s = senate.score2026
  return (
    <Chapter id="scorecard" num="09" title="Score the forecast"
      kicker="Graded on races that had not happened when the forecast was committed."
      book={{ ch: 'Ch. 2', sections: ['Evaluate Your System on the Test Set', 'Launch, Monitor, and Maintain Your System'] }}>
      {s ? (
        <>
          <div className="grid-4">
            <StatTile label="Races called so far" value={s.called} format={(v) => `${Math.round(v)}`} note={`of ${SR.length}`} />
            <StatTile label="Frozen forecast accuracy" value={s.accuracy} format={(v) => pct(v)} note={chosen.name} />
            <StatTile label="Brier score" value={s.brier} format={(v) => v.toFixed(3)} note={`held-out years: ${chosen.brier!.toFixed(3)} · coin flip 0.25`} />
            <StatTile label="Sides won" value={`${s.dSide} D · ${s.rSide} R`} note="Democratic side incl. independent stand-ins" />
          </div>
          <div className="block card">
            <h4>Misses ({s.misses.length}): the frozen forecast favored the other side</h4>
            <p className="mono" style={{ fontSize: 13 }}>{s.misses.map((m) => `${m.race} (P(D side) ${pct(m.p, 0)}, won by ${m.winner} side)`).join(' · ') || 'none'}</p>
          </div>
        </>
      ) : (
        <div className="card" style={{ padding: 24 }}>
          <span className="pill">Waiting for results</span>
          <h4 style={{ marginTop: 12 }}>The forecast is frozen. The answers are not in yet.</h4>
          <p>
            On {fz.frozenOn} the pipeline wrote <code>data/forecast/senate_forecast_2026.csv</code> with a probability for every race and committed it before polls
            closed. Every 10 minutes a GitHub Action pulls the winners from the same Wikipedia tables and this chapter fills itself in.
          </p>
        </div>
      )}
      <p style={{ marginTop: 16 }}>
        <a className="btn live-link" href={`${import.meta.env.BASE_URL}live/`} style={{ textDecoration: 'none' }}><i />Follow the count live</a>
        <span className="muted" style={{ fontSize: 14, marginLeft: 10 }}>House, Senate and control of Congress, scored against both frozen forecasts</span>
      </p>
      <Callout kind="try" title="Score it on probabilities, not just hits">
        With {SR.length} races and most of them safe, accuracy will look high whatever happens. Compare the Brier score on 2026 with the held-out
        score from Chapter 05 ({chosen.brier!.toFixed(3)}): if 2026 is much worse, either the year was unusual or the model is overconfident. A Georgia
        runoff, if there is one, is only scored once it is decided.
      </Callout>
    </Chapter>
  )
}

/* ------------------------------------------------------------ 10 */

export function Wrap() {
  return (
    <Chapter id="wrap" num="10" title="Limits & files"
      kicker="What this model cannot see, and everything you need to rerun it."
      book={{ ch: 'Ch. 1', sections: ['Main Challenges of Machine Learning', 'Testing and Validating'] }}>
      <div className="grid-2">
        <Callout kind="pitfall" title="Candidates are invisible">
          The biggest Senate surprises are candidate effects (Chapter 03). An independent like Nebraska's challenger is scored exactly like a generic
          Democrat would be, and in Montana, where an independent and a Democrat both run, the model only knows the Democratic nominee.
        </Callout>
        <Callout kind="pitfall" title="Races are not independent given the mood">
          States in the same region, or with the same kind of electorate, tend to miss together. Like the House model, this one only shares the
          national error, so its 80% ranges are probably too narrow.
        </Callout>
        <Callout kind="pitfall" title="Small samples all the way down">
          Every number in this guide comes from a few hundred races at most. The pre-registered rule picked {chosen.name.toLowerCase()} by a small margin;
          on a different set of years it could have picked another model.
        </Callout>
        <Callout kind="concept" title="Same national input as the House">
          Both forecasts use the generic-ballot average ({lean(guide.forecast.env, 1)}) for the national mood. Senate polls of individual races were left out on
          purpose to keep the two models comparable; adding them is the obvious next step.
        </Callout>
      </div>
      <div className="block card">
        <h4>Files</h4>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
          <li><a href={dataUrl('forecast/senate_forecast_2026.csv')}>senate_forecast_2026.csv</a>: frozen P(Democratic side) per race, every candidate model, tipping-point odds</li>
          <li><a href={dataUrl('forecast/senate_forecast_2026.json')}>senate_forecast_2026.json</a>: frozen chamber odds, joint House × Senate odds, settings</li>
          <li><a href={dataUrl('raw/senate_2026.csv')}>senate_2026.csv</a> and earlier years: parsed Wikipedia race tables</li>
          <li><a href={dataUrl('raw/senate_results_538.csv')}>senate_results_538.csv</a>, <a href={dataUrl('raw/president_states_538.csv')}>president_states_538.csv</a>: trimmed 538 returns</li>
          <li><a href="https://github.com/elmandalorian-thx/Midterms2026ML/blob/main/ml/build_senate.py">ml/build_senate.py</a>: the whole Senate pipeline</li>
        </ul>
      </div>
      <Code label="Rerun it" code={`
.venv/bin/python ml/fetch_data.py          # House + Senate pages, 538 Senate + presidential returns
.venv/bin/python ml/build.py               # the House model (the Senate build reuses its data and frozen forecast)
.venv/bin/python ml/build_senate.py        # Senate: evaluate, choose, forecast (frozen once with --freeze)
cd web && npm run build
`} />
    </Chapter>
  )
}
