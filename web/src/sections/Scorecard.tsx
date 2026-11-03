import { Callout, Chapter, Code, StatTile } from '../components/ui'
import { guide, pct } from '../lib/data'

export function Scorecard() {
  const s = guide.score2026
  const fz = guide.forecast.frozen
  return (
    <Chapter id="scorecard" num="09" title="Score the forecast"
      kicker="The part most class projects never get: grading a model on an election that had not happened when it was trained."
      book={{ ch: 'Ch. 2', sections: ['Evaluate Your System on the Test Set', 'Launch, Monitor, and Maintain Your System'] }}>
      {s ? (
        <>
          <div className="grid-4">
            <StatTile label="Races called so far" value={s.called} format={(v) => `${Math.round(v)}`} note="from Wikipedia's results table" />
            <StatTile label="Frozen forecast accuracy" value={s.accuracyLogreg} format={(v) => pct(v)} note="logistic regression" />
            <StatTile label="Gradient boosting" value={s.accuracyGbm} format={(v) => pct(v)} note="same frozen run" />
            <StatTile label="Brier score" value={s.brierLogreg} format={(v) => v.toFixed(3)} note="lower is better; 0.25 = coin flip" />
          </div>
          <div className="block card">
            <h4>Seats so far: {s.seatsD} Democratic · {s.seatsR} Republican (forecast median: {fz.medianSeatsD} D)</h4>
            <p style={{ marginBottom: 6 }}>Misses ({s.misses.length}): the forecast favored the other party.</p>
            <p className="mono" style={{ fontSize: 13 }}>{s.misses.map((m) => `${m.district} (P(D) ${pct(m.p, 0)}, won by ${m.winner})`).join(' · ') || 'none'}</p>
          </div>
        </>
      ) : (
        <div className="card" style={{ padding: 24 }}>
          <span className="pill">Waiting for results</span>
          <h4 style={{ marginTop: 12 }}>The forecast is frozen. The answers are not in yet.</h4>
          <p>
            On {fz.frozenOn} the pipeline wrote <code>data/forecast/forecast_2026.csv</code> with a probability for every district, and the
            build refuses to overwrite it. Once races are called, one command pulls the winners from the same Wikipedia tables and this
            chapter fills itself in: accuracy, Brier score, seat totals and the list of misses.
          </p>
        </div>
      )}
      <Code label="How to score it after Election Day" code={`
# 1. refresh only the 2026 page (winners are marked with a check in the result tables)
.venv/bin/python ml/fetch_data.py --only 2026
# 2. rebuild: the frozen forecast is read back, never retrained, and compared to the winners
.venv/bin/python ml/build.py
# 3. rebuild the site
cd web && npm run build
`} />
      <Callout kind="try" title="A project timeline that works">
        Most House races are called within days; a few (California counts slowly, Louisiana runs off on December 12) take weeks.
        Score the forecast twice: once in mid-November on the races called so far, and again in December on the full set. Report
        accuracy on competitive races and the Brier score, not just the headline accuracy.
      </Callout>
    </Chapter>
  )
}
