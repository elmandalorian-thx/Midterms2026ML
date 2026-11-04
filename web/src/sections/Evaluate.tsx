import { BarList, ChartFrame, Legend, LineChart } from '../components/charts'
import { YearBars } from '../components/election'
import { Callout, Chapter, Code, StatTile } from '../components/ui'
import { guide, lean, pct } from '../lib/data'

export function Evaluate() {
  const inf = guide.inflation
  const loco = guide.loco
  const sym = guide.symmetry
  const worst = loco.reduce((a, b) => (b.logreg < a.logreg ? b : a))
  const lc = guide.learningCurve
  const cal = guide.calibration
  return (
    <Chapter id="evaluate" num="07" title="Evaluate honestly"
      kicker="An election model is easy to make look good. These checks are how you stop fooling yourself."
      book={{ ch: 'Ch. 2–4', sections: ['Create a Test Set', 'Confusion Matrices', 'Learning Curves', 'Nonrepresentative Training Data'] }}>
      <h3 style={{ fontSize: 22, marginBottom: 12 }}>1 · Accuracy inflation: count only the races that were in doubt</h3>
      <div className="grid-4">
        <StatTile label="All 2024 races" value={inf.withUncontested} format={(v) => pct(v)} note="incl. uncontested: free points" />
        <StatTile label="Contested races" value={inf.contestedOnly} format={(v) => pct(v)} note="the usual headline" />
        <StatTile label="Competitive races" value={inf.competitiveOnly} format={(v) => pct(v)} note={`PVI within 5 · only ${inf.competitiveN} races`} />
        <StatTile label="Safe districts" value={inf.safeShare} format={(v) => pct(v, 0)} note="of all races: PVI beyond ±10" />
      </div>
      <Callout kind="pitfall" title="Report the hard subset">
        This is class imbalance in disguise: most seats are safe, so the easy cases swamp the score. Always say how the model does
        where it matters, and how many cases that is. With {inf.competitiveN} competitive races, one more miss moves the score by {pct(1 / inf.competitiveN)}.
      </Callout>

      <div className="block">
        <h3>2 · Split by time, not at random</h3>
        <p>
          A random 80/20 split scores {pct(guide.splitPitfall.random)}; training on earlier years and testing on 2024 scores {pct(guide.splitPitfall.temporal)}.
          The gap is small here, but the principle matters: a random split lets the model see other races from the test year, so it
          quietly learns that year's national mood. In real forecasting the future is never in the training set.
        </p>
        <ChartFrame title="Leave one election out" sub="Train on the other five cycles, test on this one. National vote margin under each year."
          legend={<Legend items={[{ label: 'Logistic regression', color: 'var(--series-1)' }, { label: 'Gradient boosting', color: 'var(--series-2)' }, { label: 'Logistic, no env feature', color: 'var(--series-3)' }]} />}
          table={{ columns: ['Year', 'National vote', 'Logistic', 'Boosting', 'No env', 'Seats predicted', 'Seats actual'],
            rows: loco.map((l) => [l.year, lean(l.env, 1), pct(l.logreg), pct(l.gbm), pct(l.logregNoEnv), l.seatsPred, l.seatsActual]) }}>
          <YearBars rows={loco.map((l) => ({ label: `${l.year} (${lean(l.env, 0)})`, values: [l.logreg, l.gbm, l.logregNoEnv] }))}
            series={[{ label: 'Logistic', color: 'var(--series-1)' }, { label: 'Boosting', color: 'var(--series-2)' }, { label: 'No env', color: 'var(--series-3)' }]}
            format={(v) => pct(v, 0)} domain={[0.85, 1]} />
        </ChartFrame>
        <Callout kind="result" title={`${worst.year} was the hard year`}>
          In {worst.year} (national vote {lean(worst.env, 1)}) accuracy fell to {pct(worst.logreg)} and the model expected {worst.seatsPred} Democratic seats
          against {worst.seatsActual} actual. Wave years push many close races the same way at once, which a model trained mostly on calmer
          years under-predicts. That is a warning label for 2026, whose polling environment ({lean(guide.forecast.env, 1)}) is also wave-sized.
        </Callout>
      </div>

      <div className="block grid-2">
        <ChartFrame title="Calibration (out-of-year predictions)" sub="When the model says X%, how often does the Democrat win?"
          legend={<Legend items={[{ label: 'Model', color: 'var(--series-1)' }, { label: 'Perfect calibration', color: 'var(--axis)', line: true }]} />}
          table={{ columns: ['Predicted', 'Actual', 'Races'], rows: cal.map((c) => [pct(c.predicted), pct(c.actual), c.n]) }}>
          <LineChart height={260} yDomain={[0, 1]} xFormat={(v) => pct(v, 0)} yFormat={(v) => pct(v, 0)} xLabel="Predicted P(Dem)"
            series={[{ key: 'm', label: 'Model', color: 'var(--series-1)', points: cal.map((c) => ({ x: c.predicted, y: c.actual })) },
              { key: 'ideal', label: 'Ideal', color: 'var(--axis)', points: cal.map((c) => ({ x: c.predicted, y: c.predicted })), endLabel: false, dashed: true }]} />
        </ChartFrame>
        <ChartFrame title="Overfitting: tree depth" sub="Train (2014–20) vs. validation (2022) accuracy"
          legend={<Legend items={[{ label: 'Train', color: 'var(--series-1)' }, { label: 'Validation', color: 'var(--series-2)' }]} />}
          table={{ columns: ['Depth', 'Train', 'Validation'], rows: guide.depthCurve.map((d) => [d.depth, pct(d.train), pct(d.val)]) }}>
          <LineChart height={260} yDomain={[0.9, 1]} xFormat={(v) => `${v}`} yFormat={(v) => pct(v, (v * 1000) % 10 ? 1 : 0)} xLabel="Max depth"
            series={[{ key: 't', label: 'Train', color: 'var(--series-1)', points: guide.depthCurve.map((d) => ({ x: d.depth, y: d.train })), endLabel: false },
              { key: 'v', label: 'Validation', color: 'var(--series-2)', points: guide.depthCurve.map((d) => ({ x: d.depth, y: d.val })), endLabel: false }]} />
        </ChartFrame>
      </div>

      <div className="block grid-2">
        <ChartFrame title="Learning curve" sub="2024 test accuracy vs. number of training races (average of 5 draws)"
          legend={<Legend items={[{ label: 'Logistic', color: 'var(--series-1)' }, { label: 'Boosting', color: 'var(--series-2)' }]} />}
          table={{ columns: ['Training races', 'Logistic', 'Boosting'], rows: lc.map((l) => [l.n, pct(l.logreg), pct(l.gbm)]) }}>
          <LineChart height={260} logX yDomain={[0.85, 1]} xFormat={(v) => `${v}`} yFormat={(v) => pct(v, 0)} xLabel="Training races (log scale)"
            series={[{ key: 'l', label: 'Logistic', color: 'var(--series-1)', points: lc.map((l) => ({ x: l.n, y: l.logreg })), endLabel: false },
              { key: 'g', label: 'Boosting', color: 'var(--series-2)', points: lc.map((l) => ({ x: l.n, y: l.gbm })), endLabel: false }]} />
        </ChartFrame>
        <ChartFrame title="Ablation: which features earn their place?" sub="Average leave-one-election-out accuracy"
          table={{ columns: ['Features', 'Accuracy'], rows: guide.ablation.map((a) => [a.name, pct(a.accuracy)]) }}>
          <BarList items={guide.ablation.map((a) => ({ label: a.name, value: a.accuracy }))} format={(v) => pct(v, 1)} domain={[0.9, 1]} labelWidth={170} emphasis={false} />
        </ChartFrame>
      </div>

      <div className="block">
        <h3>3 · The neutrality check: swap the parties</h3>
        <p>
          In the Pokémon project, swapping the two fighters exposed a hidden rule (speed ties go to the second Pokémon). Here we do the same
          with parties: negate every feature, so each Democratic-leaning race becomes an equally Republican-leaning one, and see whether
          P(Democrat) turns into P(Republican).
        </p>
        <div className="grid-4">
          <StatTile label="Logistic: avg. asymmetry" value={sym.logregGap} format={(v) => pct(v, 1)} note="|P(x) + P(swapped x) − 1|" />
          <StatTile label="Boosting: avg. asymmetry" value={sym.gbmGap} format={(v) => pct(v, 1)} note="same check" />
          <StatTile label="Party-swap augmented" value={sym.augmentedAccuracy} format={(v) => pct(v)} note="forced perfectly symmetric" />
          <StatTile label="Plain logistic" value={sym.plainAccuracy} format={(v) => pct(v)} note="2024 test accuracy" />
        </div>
        <Callout kind="fair" title="What the gap means">
          The remaining asymmetry averages {pct(sym.logregGap, 1)}, coming from the intercept the model learned from history (equal to
          {' '}{sym.intercept > 0 ? '+' : ''}{sym.intercept} on the log-odds scale when every feature is zero). Training on party-swapped copies removes it entirely and scores
          {' '}{pct(sym.augmentedAccuracy)} on 2024 vs. {pct(sym.plainAccuracy)} without, so {sym.augmentedAccuracy >= sym.plainAccuracy ? 'imposing symmetry costs nothing here' : 'imposing symmetry costs a little accuracy here'}. Whether to impose it is a modeling choice you should state, not hide.
        </Callout>
      </div>
      <Code code={`
# Leave one election out = GroupKFold with year as the group
for year in [2014, 2016, 2018, 2020, 2022, 2024]:
    train, test = (d.year != year) & contested, (d.year == year) & contested
    m = LogReg().fit(X[train], y[train])
    print(year, m.score(X[test], y[test]))

# Neutrality: P(D | x) + P(D | -x) should be 1
gap = np.abs(m.predict_proba(X)[:, 1] + m.predict_proba(-X)[:, 1] - 1).mean()
`} />
      <Callout kind="result" title="Takeaway">
        Headline accuracy flatters a House model: {pct(inf.contestedOnly)} on contested 2024 races, but {pct(inf.competitiveOnly)} on the {inf.competitiveN} competitive
        ones. Testing one whole election at a time shows wave years such as {worst.year} are the hardest, a warning for 2026. The party-swap
        check finds an average asymmetry of {pct(sym.logregGap, 1)}, which training on party-swapped copies removes entirely.
      </Callout>
    </Chapter>
  )
}
