import { useState } from 'react'
import { useTween } from '../components/anim'
import { InfoTip, probColor } from '../components/ui'
import { lean, pct } from '../lib/data'
import { D_CONTROL, HOLD, R_CONTROL, raceName, senate, senateContrib, SF, sideOf, SR, seatOf, type SCall } from '../lib/senate'
import type { SenateRace2026 } from '../lib/types'

const IND = 'var(--text-muted)'

/** Senate party tag: Dem / Rep / Ind (an independent who caucuses with neither). */
export const SeatTag = ({ p }: { p: 'D' | 'R' | 'I' | null }) =>
  p ? <span className="party"><i style={{ background: p === 'D' ? 'var(--dem)' : p === 'R' ? 'var(--rep)' : IND }} />{p === 'D' ? 'Dem' : p === 'R' ? 'Rep' : 'Ind'}</span>
    : <span className="muted" style={{ fontSize: 13 }}>none</span>

/* ------------------------------------------------------------ race for the Senate */

export function SenateBar({ d, r, i, expD, expR }: { d: number; r: number; i: number; expD: number; expR: number }) {
  const dT = useTween(d, 800), rT = useTween(r, 800), eD = useTween(expD, 800), eR = useTween(expR, 800)
  const w = (x: number) => `${x}%`
  const holdD = HOLD.D + HOLD.I_caucusD
  return (
    <div className="race">
      <div className="race-nums">
        <div className="side"><span className="race-big tabular">{Math.round(dT)}</span><span className="party"><i style={{ background: 'var(--dem)' }} />Democrats + 2 allied independents</span></div>
        <div className="race-mid"><b>{R_CONTROL} / {D_CONTROL}</b><br />for control</div>
        <div className="side right"><span className="race-big tabular">{Math.round(rT)}</span><span className="party"><i style={{ background: 'var(--rep)' }} />Republicans</span></div>
      </div>
      <div className="race-track" role="img" aria-label={`${d} Democratic-caucus and ${r} Republican seats decided; ${100 - d - r - i} uncalled`}>
        <div className="race-seg hold" style={{ left: 0, width: w(holdD), backgroundColor: 'var(--dem)' }} />
        <div className="race-seg" style={{ left: w(holdD), width: w(Math.max(0, dT - holdD)), background: 'var(--dem)' }} />
        <div className="race-seg ghost" style={{ left: w(dT), width: w(Math.max(0, eD - dT)), background: 'var(--dem)' }} />
        <div className="race-seg hold" style={{ right: 0, width: w(HOLD.R), backgroundColor: 'var(--rep)' }} />
        <div className="race-seg" style={{ right: w(HOLD.R), width: w(Math.max(0, rT - HOLD.R)), background: 'var(--rep)' }} />
        <div className="race-seg ghost" style={{ right: w(rT), width: w(Math.max(0, eR - rT)), background: 'var(--rep)' }} />
        <div className="race-line" style={{ left: '50%' }} />
      </div>
      <div className="race-foot muted">
        <span>Hatched = {100 - SR.length} seats not up in 2026 · solid = called · faded = projected</span>
        <span>Republicans need {R_CONTROL} (the Vice President breaks ties); Democrats need {D_CONTROL}{i ? ` · ${i} unaligned independent${i > 1 ? 's' : ''}` : ''}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ race cards */

const side = (v: number) => (v >= 0 ? 'D' : 'R')
const party = (v: number) => (v >= 0 ? 'Democratic' : 'Republican')
const tipRank = [...SR].sort((a, b) => b.pTipping - a.pTipping).map((r) => r.id)

/** Race-specific explanations for every number on a card (hover on desktop, tap on mobile). */
function cardTips(r: SenateRace2026, p: number, env: { mean: number; sd: number }) {
  const name = raceName(r)
  const dWho = r.dName ? `${r.dName}${r.dStandin ? ', an independent standing in because there is no Democratic nominee' : ''}` : 'the Democratic side'
  const moved = Math.abs(p - r.pFrozen) >= 0.005
  return {
    lean: <><b>{name} leans {side(r.lean)}+{Math.abs(r.lean).toFixed(1)}.</b> In the last two presidential elections it voted about {Math.abs(r.lean).toFixed(1)} points
      more {party(r.lean)} than the country (weighted 75% on 2024, 25% on 2020){r.cook !== null && <>; Cook's published index says {lean(r.cook)}</>}. It is the
      state's baseline from before 2026: not a poll, and not tonight's count.</>,
    bar: <><b>Bar length = P({r.dName ?? 'Democratic side'} wins) = {pct(p, 0)}.</b> The thin tick marks 50%: a bar short of the tick means the Republican side is
      favored, past it the Democratic side. Color runs red → gray → blue with the probability. When the race is called the bar fills (or empties) and a ✓ appears.</>,
    now: <><b>The model's probability right now that {dWho} wins.</b> It moves only when races are <em>called</em>, in either chamber: each call updates the estimate
      of the national mood (now {lean(env.mean, 1)} ± {env.sd.toFixed(1)}; the polls said {lean(SF.env, 1)}), and every uncalled race is re-scored at that mood.
      It does not read partial vote counts. {moved ? `Tonight's calls have moved it from the frozen ${pct(r.pFrozen, 0)}.` : 'The calls so far have not moved it off the frozen value.'}</>,
    frozen: <><b>Frozen {pct(r.pFrozen, 0)}:</b> the probability committed to GitHub on {SF.frozen.frozenOn}, before polls closed. It never changes; it is the
      prediction the scorecard grades. Compare it with “now” to see how much tonight's calls have moved the model.</>,
    tipping: <><b>Tipping point {pct(r.pTipping, 0)}:</b> in {SF.frozen.sims.toLocaleString()} simulated elections, {name} was the race that delivered the
      deciding seat (Republicans' {R_CONTROL}th or Democrats' {D_CONTROL}st) {pct(r.pTipping, 1)} of the time, #{tipRank.indexOf(r.id) + 1} of {SR.length}.
      High means pivotal: whichever side wins here usually wins the Senate.</>,
  }
}

export function RaceCards({ called, probs, q, env }: { called: Map<string, SCall>; probs: number[]; q: string; env: { mean: number; sd: number } }) {
  const s = q.trim().toLowerCase()
  const rows = SR.map((r, i) => ({ r, p: probs[i], c: called.get(r.id) }))
    .filter(({ r }) => !s || raceName(r).toLowerCase().includes(s) || r.id.toLowerCase() === s || (r.dName ?? '').toLowerCase().includes(s) || (r.rName ?? '').toLowerCase().includes(s))
    .sort((a, b) => Number(!!a.c && !a.c.runoff) - Number(!!b.c && !b.c.runoff) || Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5))
  return (
    <div className="race-cards">
      {rows.map(({ r, p, c }) => {
        const won = c ? sideOf(r, c) : null
        const seat = c ? seatOf(c) : null
        const contested = r.hasD && r.hasR
        const t = cardTips(r, p, env)
        return (
          <article key={r.id} className={`rcard ${c?.runoff ? 'runoff' : won ? `won-${won}` : ''}`}>
            <header>
              <b>{raceName(r)}</b>
              <InfoTip tip={t.lean} align="right"><span className="muted tabular">{side(r.lean)}+{Math.abs(r.lean).toFixed(0)}</span></InfoTip>
            </header>
            <div className={`cand ${won === 'D' ? 'win' : ''}`}><i style={{ background: r.dStandin ? IND : 'var(--dem)' }} />{r.dName ?? <span className="muted">no candidate</span>}</div>
            <div className={`cand ${won === 'R' ? 'win' : ''}`}><i style={{ background: 'var(--rep)' }} />{r.rName ?? <span className="muted">no candidate</span>}</div>
            {contested && (
              <InfoTip tip={t.bar}>
                <span className="pbar"><span className="pbar-fill" style={{ width: `${(won === 'D' ? 1 : won === 'R' ? 0 : p) * 100}%`, background: probColor(won === 'D' ? 1 : won === 'R' ? 0 : p) }} /><span className="pbar-tick" /></span>
              </InfoTip>
            )}
            <footer className="muted">
              {c?.runoff ? <span className="chip-runoff">Runoff</span>
                : c ? <>Called · <SeatTag p={seat} />{c.name ? ` ${c.name}` : ''}</>
                  : contested ? <>
                    <InfoTip tip={t.now}>D side {pct(p, 0)} now</InfoTip> · <InfoTip tip={t.frozen}>frozen {pct(r.pFrozen, 0)}</InfoTip>
                    {r.pTipping >= 0.02 && <> · <InfoTip tip={t.tipping} align="right">tipping {pct(r.pTipping, 0)}</InfoTip></>}
                  </>
                    : 'Only one side on the ballot'}
            </footer>
          </article>
        )
      })}
      {!rows.length && <p className="muted">No race matches “{q}”.</p>}
    </div>
  )
}

/** Long-form guide to the cards, with the most pivotal race worked through number by number. */
export function ReadCard({ env, probs }: { env: { mean: number; sd: number }; probs: number[] }) {
  const [id, setId] = useState(tipRank[0])
  const r = SR.find((x) => x.id === id)!
  const i = SR.indexOf(r)
  const k = senateContrib(r, env.mean)
  const name = raceName(r)
  const fmt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`
  const shown = (key: string, x: number) =>
    key === 'pvi' ? `${side(x)}+${Math.abs(x).toFixed(1)}` : key === 'env' ? lean(x, 1)
      : key === 'inc' ? (x ? `${x > 0 ? 'Democrat' : 'Republican'} running` : 'no (open seat)') : x > 0 ? 'Democratic side' : x < 0 ? 'Republican side' : 'neither'
  const byPush = [...k.parts].sort((a, b) => a.push - b.push)
  const model = senate.summary.find((m) => m.key === senate.chosen)?.name ?? senate.chosen
  return (
    <details className="explainer">
      <summary>How to read a race card (with a worked example)</summary>
      <div className="explainer-body">
        <ol>
          <li><b>{side(r.lean)}+{Math.abs(r.lean).toFixed(0)} (top right): the state's lean.</b> How much more Republican (R) or Democratic (D) the state voted than
            the whole country in the last two presidential elections, in points. It is fixed before the election; it is not a poll and not tonight's count.</li>
          <li><b>The two names.</b> Blue dot = the Democratic side, red = the Republican side. A gray dot is an independent standing in for a party with no nominee.</li>
          <li><b>The bar and “D side X% now”.</b> The model's probability, right now, that the Democratic side wins. The tick marks 50%. It changes only when races
            are <em>called</em>: every call (House or Senate) updates the estimate of the national mood, and each uncalled race is re-scored at that mood.</li>
          <li><b>“Frozen X%”.</b> The same probability as committed before polls closed. It never changes, so it can be graded honestly afterwards.</li>
          <li><b>“Tipping X%”.</b> How often, in {SF.frozen.sims.toLocaleString()} simulated elections, this race delivered the seat that decided control.</li>
        </ol>
        <p className="muted" style={{ margin: '4px 0 0' }}>Hover (or tap) any number on a card for its race-specific explanation.</p>

        <h3 className="explainer-pick">Where
          <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Race for the worked example">
            {[...SR].filter((x) => x.hasD && x.hasR).sort((a, b) => raceName(a).localeCompare(raceName(b))).map((x) => <option key={x.id} value={x.id}>{raceName(x)}</option>)}
          </select>'s {pct(probs[i], 0)} comes from</h3>
        <p>The chosen model ({model}) is a logistic regression. It adds one “push” per feature on the log-odds scale, starting from an average past race
          (a feature equal to that average pushes 0), then turns the total into a probability.</p>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Feature</th><th>{name}</th><th className="num">Push (log-odds)</th></tr></thead>
            <tbody>
              <tr><td>Starting point (average past race)</td><td /><td className="num tabular">{fmt(k.intercept)}</td></tr>
              {k.parts.map((f) => <tr key={f.key}><td>{f.label}</td><td>{shown(f.key, f.x)}</td><td className="num tabular">{fmt(f.push)}</td></tr>)}
              <tr><td><b>Total</b></td><td /><td className="num tabular"><b>{fmt(k.z)}</b></td></tr>
            </tbody>
          </table>
        </div>
        <p>Probability = 1 / (1 + e<sup>−total</sup>) = 1 / (1 + e<sup>{(-k.z).toFixed(2)}</sup>) = <b>{pct(k.p, 1)}</b>.
          {' '}The biggest push toward the Republican side is {byPush[0].label.toLowerCase()} ({fmt(byPush[0].push)}); toward the Democratic side,
          {' '}{byPush[byPush.length - 1].label.toLowerCase()} ({fmt(byPush[byPush.length - 1].push)}). A total below 0 favors the Republican side; above 0, the Democratic side.</p>

        <h3>“The Democrat is ahead in the count, so why does the card say {pct(probs[i], 0)}?”</h3>
        <ul>
          <li><b>The card never reads the count.</b> It updates only when a race is called. Until then it shows the pre-election model, adjusted for what other
            calls say about the national mood.</li>
          <li><b>Early counts are not a random sample.</b> Votes are counted in batches: early and mail ballots, then election-day votes, county by county. In Texas,
            early-vote totals usually come out first and big metro counties can report faster than rural ones, so an early lead can shrink as later batches arrive.
            Which batches favor whom differs by state and year.</li>
          <li><b>{pct(probs[i], 0)} does not mean “loses”.</b> It means that in about {Math.round(probs[i] * 10)} of 10 elections like this one the Democratic side wins.
            Underdogs at 40% win all the time; a good model is one whose 40% calls come true about 40% of the time.</li>
          <li><b>When the race is called,</b> the card shows a ✓ and the bar fills. The call is also evidence about the national mood: a Democratic win in an
            R-leaning state nudges the estimate toward Democrats, and every other uncalled card moves a little with it.</li>
        </ul>
      </div>
    </details>
  )
}

/* ------------------------------------------------------------ control of Congress */

const CELL_LABEL: Record<string, string> = { D: 'Democratic Senate', R: 'Republican Senate', N: 'No Senate majority without independents' }

export function CongressGrid({ joint }: { joint: Record<string, number> }) {
  const frozen = SF.frozen.joint, indep = SF.frozen.jointIfIndependent
  return (
    <div className="scroll-x">
      <table className="data-table congress">
        <thead><tr><th /><th>Democratic House</th><th>Republican House</th></tr></thead>
        <tbody>
          {(['D', 'R', 'N'] as const).map((s) => (
            <tr key={s}>
              <th scope="row">{CELL_LABEL[s]}</th>
              {(['D', 'R'] as const).map((h) => (
                <td key={h} className="num">
                  <div className="joint-now tabular">{pct(joint[h + s], 1)}</div>
                  <div className="muted joint-sub">frozen {pct(frozen[h + s], 1)} · if independent {pct(indep[h + s], 1)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
