import { Reveal } from '../components/anim'
import { BarList, ChartFrame, DivergingBars, Legend, LineChart } from '../components/charts'
import { Callout, Chapter, Code, StatTile } from '../components/ui'
import { fmt, lean, pct } from '../lib/data'
import { HOLD, raceName, senate, SF, SR } from '../lib/senate'
import { CIDots, SenateScatter } from './charts'

const c = senate.counts
const q = senate.quality
export const M = Object.fromEntries(senate.summary.map((s) => [s.key, s]))
export const chosen = M[senate.chosen]
const notUp = 100 - SR.length
const label = (race: string) => raceName({ id: race, state: race.slice(0, 2) })

/* ------------------------------------------------------------ 01 */

export function Problem() {
  return (
    <Chapter id="problem" num="01" title="Frame the problem"
      kicker="Same question as the House guide, very different data: a few dozen statewide races, a third of the chamber at a time."
      book={{ ch: 'Ch. 1–2', sections: ['Frame the Problem', 'Select a Performance Measure', 'Check the Assumptions'] }}>
      <div className="grid-3">
        <Reveal><div className="card"><h4>Input</h4><p>One row per Senate race: how the state usually votes (a lean we compute from presidential results), the national mood,
          whether the incumbent is on the ballot, and which side holds the seat. The same four features as the House model, on purpose.</p></div></Reveal>
        <Reveal delay={120}><div className="card"><h4>Output</h4><p>P(the Democratic side wins) for each of the {SR.length} races, then a simulation of the whole chamber: the {notUp} seats
          not up this year are already decided, so control depends on how the {SR.length} that are up add to them.</p></div></Reveal>
        <Reveal delay={240}><div className="card"><h4>Measure</h4><p>Brier score and calibration on elections the model never saw. With about {Math.round(c.contested / c.years.length)} races a year,
          we also have to say how <em>uncertain</em> each score is, which the House guide could mostly skip.</p></div></Reveal>
      </div>
      <Callout kind="concept" title="Why the Senate is a small-data problem">
        Six cycles give {c.races} Senate races, {c.contested} of them contested by both sides. The House guide learned from {fmt(c.houseRows)} contested
        district races over the same years. Fewer examples means noisier estimates, wider error bars, and a real question the House never raised:
        can a model trained on <strong>House</strong> races help predict <strong>Senate</strong> races? Chapters 04 and 05 answer it.
      </Callout>
      <h3 style={{ margin: '36px 0 10px', fontSize: 22 }}>Three rules the House does not have</h3>
      <div className="grid-3">
        <Callout kind="concept" title="Only a third is up">
          {notUp} senators are not on the ballot: {HOLD.R} Republicans, {HOLD.D} Democrats and {HOLD.I_caucusD} independents who caucus with Democrats.
          Their seats enter every simulation as fixed.
        </Callout>
        <Callout kind="concept" title="Ties go to the Vice President">
          With 50–50, the Vice President casts the deciding vote. The current Vice President is {SF.vpParty === 'R' ? 'a Republican' : 'a Democrat'}, so {SF.vpParty === 'R' ? 'Republicans' : 'Democrats'} need 50 seats
          and {SF.vpParty === 'R' ? 'Democrats' : 'Republicans'} need 51. This is a rule about the office, applied as written; it would flip under a Vice President of the other party.
        </Callout>
        <Callout kind="concept" title="Independents">
          In {SR.filter((r) => r.dStandin).length} races this year there is no Democratic nominee and an independent is the main challenger. A seat won by an independent
          who caucuses with neither party counts for neither side of the 50/51 line.
        </Callout>
      </div>
      <h3 style={{ margin: '36px 0 10px', fontSize: 22 }}>How this project stays neutral</h3>
      <div className="grid-2">
        <Callout kind="fair" title="Symmetric by construction">
          Every feature is signed: + leans to the Democratic side, − to the Republican side. Swap the parties and every input flips sign;
          Chapter 06 checks that the answer flips too.
        </Callout>
        <Callout kind="fair" title="One rule for missing nominees">
          When a major party has no nominee, the leading independent stands in for that side. The rule is the same for either party.
          For 2026 the stand-ins were fixed before the election from Wikipedia's list of independent challengers.
        </Callout>
        <Callout kind="fair" title="Inputs, not opinions">
          No candidate ratings, polls of individual races, endorsements or expert ratings: results, a lean computed from presidential votes,
          incumbency, and the published national polling average.
        </Callout>
        <Callout kind="fair" title="Frozen before the votes">
          The model was chosen by a rule written in advance (lowest held-out Brier score), and the forecast file was committed on {SF.frozen.frozenOn},
          before polls closed. The build refuses to overwrite it.
        </Callout>
      </div>
    </Chapter>
  )
}

/* ------------------------------------------------------------ 02 */

export function Data() {
  const cook = q.cookCheck
  return (
    <Chapter id="data" num="02" title="Meet the data"
      kicker="Three public sources, cross-checked against each other before any model sees them."
      book={{ ch: 'Ch. 2', sections: ['Get the Data', 'Take a Quick Look at the Data Structure', 'Prepare the Data'] }}>
      <div className="scroll-x card" style={{ padding: 0 }}>
        <table className="data-table">
          <thead><tr><th>Source</th><th>What we take</th><th>Access</th></tr></thead>
          <tbody>
            <tr><td><b>Wikipedia</b>, “&lt;year&gt; United States Senate elections” (2014–2026)</td><td>Every race incl. specials: incumbent, party, on the ballot or not, every candidate, the winner (✓). Also the Cook PVI, used only as a check.</td><td>Free, <code>action=raw</code>, CC BY-SA</td></tr>
            <tr><td><b>FiveThirtyEight</b> <code>election-results</code>, Senate</td><td>Candidate votes per race, so we can compute each race's two-side margin (runoffs use the deciding round).</td><td>Free, CC BY 4.0</td></tr>
            <tr><td><b>FiveThirtyEight</b> <code>election-results</code>, President</td><td>Statewide presidential votes 2000–2024, used to compute each state's lean.</td><td>Free, CC BY 4.0</td></tr>
            <tr><td><b>Wikipedia</b>, 2026 House page</td><td>The generic-ballot polling average, the same national input as the House forecast.</td><td>Free</td></tr>
          </tbody>
        </table>
      </div>
      <div className="block grid-4">
        <StatTile label="Senate races, 2014–2024" value={q.races} format={(v) => `${Math.round(v)}`} note="regular + special elections" />
        <StatTile label="Winners: both sources agree" value={q.agree / q.checked} format={(v) => pct(v)} note={`${q.agree} of ${q.checked} contested races`} />
        <StatTile label="Our lean vs. Cook PVI (2026)" value={cook.corr} format={(v) => v.toFixed(2)} note={`correlation · average gap ${cook.mae} points`} />
        <StatTile label="Dropped" value={q.noOpponent + q.thirdCandidateWon} format={(v) => `${Math.round(v)}`} note={`${q.noOpponent} with one side only · ${q.thirdCandidateWon} won by a third candidate`} />
      </div>
      <Callout kind="concept" title="Build the feature instead of buying it">
        Cook's Partisan Voting Index compares a state's presidential vote with the nation's. We rebuilt it from public returns (75% the latest
        election, 25% the one before, halved to vote-share points) so we have it for every year, including years where the Wikipedia tables
        do not print it. Against the {cook.n} values Cook published for 2026 our version correlates {cook.corr.toFixed(2)}, off by {cook.mae} points on average.
        Reproducing a known number is the cheapest test that your feature pipeline is right.
      </Callout>
      <div className="block">
        <h3>The stand-ins</h3>
        <p>Races in our history where a major party had no nominee and an independent stood in for that side:</p>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Year</th><th>Race</th><th>Independent</th><th>Stood in for</th><th>Won?</th></tr></thead>
            <tbody>{q.standIns.map((s) => (
              <tr key={`${s.year}${s.race}`}><td className="mono">{s.year}</td><td>{label(s.race)}</td><td>{s.name}</td>
                <td>{s.side === 'D' ? 'Democratic side' : 'Republican side'}</td><td>{s.won ? 'yes' : 'no'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <Code code={`
# State lean, Cook-style: how much more Democratic than the nation, in vote-share points
dev = state_margin - national_margin                 # per presidential year, two-party
lean[2026] = (0.75 * dev[2024] + 0.25 * dev[2020]) / 2

# Two sides per race; a stand-in only when a major party has no nominee
side_D = democratic_nominee or leading_independent
side_R = republican_nominee or leading_independent
`} />
    </Chapter>
  )
}

/* ------------------------------------------------------------ 03 */

export function Explore() {
  const drift = senate.drift
  const st = senate.straightTicket
  const first = st[0], last = st[st.length - 1]
  const rising = last.share < first.share
  return (
    <Chapter id="explore" num="03" title="Explore"
      kicker="Statewide races follow the state's presidential lean closely, but candidates still move them by double digits."
      book={{ ch: 'Ch. 2', sections: ['Discover and Visualize the Data', 'Look for Correlations', 'Experiment with Attribute Combinations'] }}>
      <ChartFrame title="State lean vs. result, one election at a time"
        sub="Dashed line: what lean + national mood alone predict (margin = 2 × lean + national margin). Dots far from it are candidate effects."
        legend={<Legend items={[{ label: 'Democratic side won', color: 'var(--dem)' }, { label: 'Republican side won', color: 'var(--rep)' }, { label: 'Lean + national mood', color: 'var(--text-primary)', line: true }]} />}
        table={{ columns: ['Year', 'Races', 'Correlation', 'Slope', 'Spread around the line (s.d.)'], rows: drift.map((d) => [d.year, d.n, d.corr.toFixed(2), d.slope.toFixed(2), `${d.residSd} pts`]) }}>
        <SenateScatter />
      </ChartFrame>
      <div className="block grid-2">
        <ChartFrame title="Same party for Senate and President?" sub="Share of contested Senate races won by the party that carried the state for President that day"
          table={{ columns: ['Year', 'Same party', 'Races', 'Share'], rows: st.map((s) => [s.year, s.same, s.n, pct(s.share)]) }}>
          <BarList items={st.map((s) => ({ label: `${s.year}`, value: s.share, note: `${s.same} of ${s.n} races` }))} format={(v) => pct(v, 0)} domain={[0.5, 1]} labelWidth={70} emphasis={false} />
        </ChartFrame>
        <ChartFrame title="How tightly results follow lean" sub="Correlation between state lean and the result, by year"
          table={{ columns: ['Year', 'Correlation', 'Spread (s.d.)'], rows: drift.map((d) => [d.year, d.corr.toFixed(3), d.residSd]) }}>
          <LineChart height={240} yDomain={[0.8, 1]} xFormat={(v) => `${v}`} yFormat={(v) => v.toFixed(2)}
            series={[{ key: 'c', label: 'Correlation', color: 'var(--series-1)', points: drift.map((d) => ({ x: d.year, y: d.corr })), endLabel: false }]} />
        </ChartFrame>
      </div>
      <Callout kind={rising ? 'pitfall' : 'result'} title="Check the story against the data">
        A common claim is that ticket-splitting is dying, so Senate races simply follow the presidential vote. Our data says {pct(first.share, 0)} of
        {' '}{first.year} races matched the presidential winner and {pct(last.share, 0)} in {last.year}{rising ? ': in the most recent year, splitting went up, not down' : ''}.
        Six points do not make a trend. Treat "drift" claims the way you treat a model: test them on data before you build them in.
      </Callout>
      <div className="block grid-2">
        <ChartFrame title="Biggest candidate effects, 2014–2024" sub="Result minus what lean + national mood predicted (two-party margin points). + = Democratic side did better."
          table={{ columns: ['Race', 'Candidates', 'Expected', 'Result', 'Difference'], rows: senate.outliers.map((o) => [`${o.year} ${label(o.race)}`, `${o.dName}${o.dStandin ? ' (I)' : ''} vs ${o.rName}`, lean(o.expected / 2, 1), lean(o.margin / 2, 1), `${o.resid > 0 ? '+' : ''}${o.resid}`]) }}>
          <DivergingBars items={senate.outliers.map((o) => ({ label: `${o.year} ${o.race}: ${(o.resid > 0 ? o.dName : o.rName).split(' ').pop()}`, value: o.resid }))}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`} leftLabel="Republican side outperformed" rightLabel="Democratic side outperformed" />
        </ChartFrame>
        <ChartFrame title="Incumbents outperform" sub="Average result minus lean + national mood, by who is on the ballot (margin points)"
          table={{ columns: ['Group', 'Races', 'Avg. difference'], rows: senate.incumbency.map((g) => [g.group, g.n, g.resid]) }}>
          <DivergingBars items={senate.incumbency.map((g) => ({ label: `${g.group} (${g.n})`, value: g.resid }))}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} leftLabel="toward Republicans" rightLabel="toward Democrats" />
        </ChartFrame>
      </div>
      <Callout kind="concept" title="Irreducible error lives here">
        The spread around the dashed line (about {Math.round(drift.reduce((s, d) => s + d.residSd, 0) / drift.length)} margin points a year) is mostly candidates: who they are,
        how they campaign, scandals, money. Our four features cannot see any of it. In the House, 435 such errors average out; in the Senate,
        {' '}{SR.length} of them decide the chamber. That is why the Senate forecast is far less certain than the House one, even at the same national mood.
      </Callout>
    </Chapter>
  )
}

/* ------------------------------------------------------------ 04 */

export function SmallData() {
  const loco = senate.loco
  const avgWidth = loco.reduce((s, l) => s + (l.ciHi - l.ciLo), 0) / loco.length
  const lc = senate.learning
  return (
    <Chapter id="small-data" num="04" title="Evaluate honestly, with error bars"
      kicker="With ~33 races per test year, a single accuracy number hides how much luck is in it."
      book={{ ch: 'Ch. 2–4', sections: ['Better Evaluation Using Cross-Validation', 'Learning Curves', 'Create a Test Set'] }}>
      <p>
        Leave one election out: train on five cycles, test on the sixth, repeat for each year. Then <strong>bootstrap</strong> each test year: resample its races
        with replacement 2,000 times and see how much the accuracy moves. The bars below are 90% intervals.
      </p>
      <div className="grid-2">
        <ChartFrame title="Held-out accuracy by year (Senate-only logistic regression)" sub="Dot = accuracy on that year's contested races · bar = 90% bootstrap interval"
          table={{ columns: ['Year', 'Races', 'Accuracy', '90% interval', 'Expected D-side seats', 'Actual'], rows: loco.map((l) => [l.year, l.n, pct(l.senate), `${pct(l.ciLo, 0)}–${pct(l.ciHi, 0)}`, l.seatsPred, l.seatsActual]) }}>
          <CIDots rows={loco.map((l) => ({ label: `${l.year} (${lean(l.env, 0)})`, value: l.senate, lo: l.ciLo, hi: l.ciHi, n: l.n }))} domain={[0.6, 1]} />
        </ChartFrame>
        <div>
          <div className="grid-2">
            <StatTile label="Average interval width" value={avgWidth} format={(v) => pct(v, 0)} note="from ~33 races per year" />
            <StatTile label="One race is worth" value={1 / (c.contested / c.years.length)} format={(v) => pct(v, 1)} note="of a year's accuracy" />
          </div>
          <Callout kind="pitfall" title="Don't rank models on noise">
            Two models that differ by a race or two in a single year are tied. Compare them on <strong>all</strong> held-out years together, and prefer
            a probability score (Brier) over accuracy: it uses how confident each prediction was, not just which side of 50% it fell on, so it
            is less noisy with small samples.
          </Callout>
        </div>
      </div>
      <div className="block">
        <ChartFrame title="Learning curve: is more Senate data the answer?" sub="Held-out Brier score (lower is better) vs. how many Senate races the Senate-only model trains on. Dashed: the House model, trained on House races only."
          legend={<Legend items={[{ label: 'Senate-only model', color: 'var(--series-1)' }, { label: 'House model, transferred', color: 'var(--series-2)', line: true }]} />}
          table={{ columns: ['Senate training races', 'Brier (Senate-only)', 'Brier (House model)'], rows: lc.map((l) => [l.n, l.brier.toFixed(4), senate.houseBrier.toFixed(4)]) }}>
          <LineChart height={260} yDomain={[0.05, Math.max(0.1, ...lc.map((l) => l.brier)) + 0.005]} xFormat={(v) => `${v}`} yFormat={(v) => v.toFixed(3)} xLabel="Senate races in the training set"
            series={[{ key: 's', label: 'Senate-only', color: 'var(--series-1)', points: lc.map((l) => ({ x: l.n, y: l.brier })), endLabel: false },
              { key: 'h', label: 'House model', color: 'var(--series-2)', points: lc.map((l) => ({ x: l.n, y: senate.houseBrier })), endLabel: false, dashed: true }]} />
        </ChartFrame>
        <Callout kind="result" title="Data-starved, not mis-specified">
          The Senate-only model keeps improving as it gets more races{lc[lc.length - 1].brier > senate.houseBrier
            ? ', and with every Senate race we have it is still worse than a model that has never seen a Senate race'
            : ', and with all of them it catches up with the House model'}. That is the signature of too little data, not of the wrong features.
          There will never be much more Senate data (about 33 races every two years), so the fix has to come from somewhere else.
        </Callout>
      </div>
    </Chapter>
  )
}

/* ------------------------------------------------------------ 05 */

export function Borrow() {
  const probs = senate.summary.filter((s) => s.probabilistic).sort((a, b) => a.brier! - b.brier!)
  const rules = senate.summary.filter((s) => !s.probabilistic)
  const eff = senate.effects
  const cal = senate.calibration[senate.chosen] ?? senate.calibration.pooled
  const feats = senate.features
  return (
    <Chapter id="borrow" num="05" title="Borrow strength from the House"
      kicker={`Same four features, ${Math.round(c.houseRows / c.contested)}× the examples. Transfer the House model, or pool both, and let held-out data decide.`}
      book={{ ch: 'Ch. 4 & 11', sections: ['Regularized Linear Models', 'Reusing Pretrained Layers (transfer learning)', 'Ensemble Learning'] }}>
      <div className="grid-2">
        <ChartFrame title="Every method, every held-out year" sub="Brier score over all held-out Senate races (lower is better)"
          table={{ columns: ['Method', 'Brier', 'Log loss', 'Accuracy', 'Competitive races'], rows: probs.map((s) => [s.name, s.brier!.toFixed(4), s.logLoss!.toFixed(3), pct(s.accuracy), pct(s.competitiveAccuracy)]) }}>
          <BarList items={probs.map((s) => ({ label: s.name, value: s.brier!, highlight: s.key === senate.chosen, note: `accuracy ${pct(s.accuracy)}` }))}
            format={(v) => v.toFixed(3)} domain={[0, Math.max(...probs.map((s) => s.brier!)) * 1.1]} labelWidth={230} />
        </ChartFrame>
        <ChartFrame title="Simple rules, same years" sub="Accuracy only: rules give a side, not a probability"
          table={{ columns: ['Rule', 'Accuracy', 'Competitive races'], rows: rules.map((s) => [s.name, pct(s.accuracy), pct(s.competitiveAccuracy)]) }}>
          <BarList items={rules.map((s) => ({ label: s.name, value: s.accuracy }))} format={(v) => pct(v, 1)} domain={[0.7, 1]} labelWidth={230} emphasis={false} />
        </ChartFrame>
      </div>
      <Callout kind="result" title={`Chosen in advance by the rule: ${chosen.name}`}>
        The rule written before looking at 2026: pick the lowest held-out Brier score among the Senate-only, gradient-boosting, House-transfer and pooled models.
        {' '}{chosen.name} scored {chosen.brier!.toFixed(4)}{M.senate ? ` against ${M.senate.brier!.toFixed(4)} for the Senate-only logistic regression` : ''}.
        Note what did <em>not</em> win: gradient boosting, the most flexible model, is the one that most needs data it does not have.
      </Callout>
      <div className="block grid-2">
        <ChartFrame title="What each model learned" sub="One unit of each feature, in points of state lean (the lean coefficient = 1)"
          table={{ columns: ['Feature', 'Senate only', 'House', 'Pooled'], rows: feats.map((f) => [f.label, eff.senate[f.key], eff.house[f.key], eff.pooled[f.key]]) }}>
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Feature</th><th className="num">Senate only</th><th className="num">House</th><th className="num">Pooled</th></tr></thead>
              <tbody>{feats.map((f) => (
                <tr key={f.key}><td>{f.label}</td>{(['senate', 'house', 'pooled'] as const).map((k) => <td key={k} className="num tabular">{eff[k][f.key].toFixed(2)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>
            Read “Incumbent on ballot = {eff.pooled.inc.toFixed(1)}” as: an incumbent running is worth as much as {eff.pooled.inc.toFixed(1)} points of state lean to the pooled model.
            The Senate-only estimates rest on a few dozen open seats and incumbents, so they swing more from sample to sample.
          </p>
        </ChartFrame>
        <ChartFrame title={`Calibration of the chosen model (${chosen.name})`} sub="Held-out predictions in five bins: when it says X%, how often does the Democratic side win?"
          legend={<Legend items={[{ label: 'Model', color: 'var(--series-1)' }, { label: 'Perfect calibration', color: 'var(--axis)', line: true }]} />}
          table={{ columns: ['Predicted', 'Actual', 'Races'], rows: cal.map((b) => [pct(b.predicted), pct(b.actual), b.n]) }}>
          <LineChart height={250} yDomain={[0, 1]} xFormat={(v) => pct(v, 0)} yFormat={(v) => pct(v, 0)} xLabel="Predicted P(Democratic side)"
            series={[{ key: 'm', label: 'Model', color: 'var(--series-1)', points: cal.map((b) => ({ x: b.predicted, y: b.actual })), endLabel: false },
              { key: 'i', label: 'Ideal', color: 'var(--axis)', points: cal.map((b) => ({ x: b.predicted, y: b.predicted })), endLabel: false, dashed: true }]} />
          <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>The middle bins hold only {cal.filter((b) => b.bin > 0.2 && b.bin < 0.8).reduce((s, b) => s + b.n, 0)} races, so their dots wobble.</p>
        </ChartFrame>
      </div>
      <Callout kind="concept" title="Transfer learning without a neural network">
        In deep learning you reuse layers a network learned on a big dataset and fine-tune them on a small one. Here the same idea is one line:
        stack the House rows on top of the Senate rows and fit once. The House supplies stable estimates of how much lean, the national mood
        and incumbency matter; the Senate rows pull them toward what statewide races do. It works because the features mean the same thing in
        both datasets. If they did not (say, district lean and state lean on different scales), pooling would quietly hurt.
      </Callout>
      <Code code={`
# Pooled House + Senate: same 4 signed features, one fit
X_pool = pd.concat([X_house, X_senate]); y_pool = np.concatenate([y_house, y_senate])
pooled = LogReg().fit(X_pool, y_pool)

# Pre-registered choice: lowest leave-one-cycle-out Brier among the candidates
chosen = min(["senate", "gbm", "house", "pooled"], key=lambda k: brier[k])
`} />
    </Chapter>
  )
}
