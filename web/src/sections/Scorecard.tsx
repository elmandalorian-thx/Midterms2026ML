import { Callout, Chapter, Code, StatTile } from '../components/ui'
import { etTime, guide, lean, missWords, pct } from '../lib/data'

export function Scorecard() {
  const s = guide.score2026
  const fz = guide.forecast.frozen
  const gap = s ? s.impliedEnv - s.frozenEnv : 0
  const understated = gap > 0 ? 'Democrats' : 'Republicans'
  return (
    <Chapter id="scorecard" num="09" title="Score the forecast"
      kicker="The part most class projects never get: grading a model on an election that had not happened when it was trained."
      book={{ ch: 'Ch. 2', sections: ['Evaluate Your System on the Test Set', 'Launch, Monitor, and Maintain Your System'] }}>
      {s ? (
        <>
          <div className="grid-4">
            <StatTile label="Races called at the close" value={s.called} format={(v) => `${Math.round(v)}`} note={`${s.uncalled} still counting on ${etTime(s.closedAt)}`} />
            <StatTile label="Frozen forecast accuracy" value={s.accuracyLogreg} format={(v) => pct(v)} note="logistic regression" />
            <StatTile label="Gradient boosting" value={s.accuracyGbm} format={(v) => pct(v)} note="same frozen run" />
            <StatTile label="Brier score" value={s.brierLogreg} format={(v) => v.toFixed(3)} note="lower is better; 0.25 = coin flip" />
          </div>
          <div className="block card">
            <h4>
              Seats called: {s.seatsD} Democratic · {s.seatsR} Republican
              {s.majority ? ` · ${s.majority === 'D' ? 'Democrats' : 'Republicans'} reached the 218-seat majority` : ''} (forecast: P(Democratic majority){' '}
              {pct(fz.pDemMajority, 0)}, median {fz.medianSeatsD} D)
            </h4>
            <p style={{ marginBottom: 6 }}>Misses ({s.misses.length}): the forecast favored the other party.</p>
            <p className="mono" style={{ fontSize: 13 }}>{s.misses.map((m) => `${m.district} (P(D) ${pct(m.p, 0)}, won by ${m.winner})`).join(' · ') || 'none'}</p>
          </div>
          <div className="block grid-2">
            <Callout kind="result" title="The district model held up">
              On the {s.contested} called races with both parties on the ballot, the frozen forecast picked {pct(s.contestedAccuracy)} of winners
              (Brier {s.contestedBrier.toFixed(3)}), and {s.closeAccuracy !== null ? `${pct(s.closeAccuracy)} of the ${s.closeN} close ones (lean within 5 points)` : 'no close race was called'}.
              On held-out 2024 (Chapter 07) it scored {pct(guide.inflation.contestedOnly)} and {pct(guide.inflation.competitiveOnly)} on the same two
              subsets: a new election, scored the same way, gives a similar picture.
            </Callout>
            <Callout kind="result" title="The national input was off, in one direction">
              Of the misses on contested races, {missWords(s.missToD, s.missToR)}. A one-sided pattern like that points at the shared input,
              not at individual districts: the called races fit best with a national environment of <b>{lean(s.impliedEnv, 1)}</b> (likely range{' '}
              {lean(s.impliedLo, 1)} to {lean(s.impliedHi, 1)}), against the {lean(s.frozenEnv, 1)} polling average the forecast was frozen with.
            </Callout>
            <Callout kind="concept" title="Same model, right input">
              Feeding that environment into the unchanged frozen model would have scored {pct(s.hindsightAccuracy)} with a Brier score of{' '}
              {s.hindsightBrier.toFixed(3)}. Hindsight is not a forecast, but it separates the two error sources: the model's structure was sound,
              and most of the error came from the polls understating {understated} by about {Math.abs(gap).toFixed(1)} points.
            </Callout>
            <Callout kind="pitfall" title="What to change next time">
              A {Math.abs(gap).toFixed(1)}-point polling miss is {(Math.abs(gap) / fz.sigmaEnv).toFixed(1)}× the ±{fz.sigmaEnv}-point error the simulation
              assumed, so the seat ranges were too narrow. Estimate the polling error from past generic-ballot misses instead of fixing it.
              {s.dataIssues.length > 0 && <> {s.dataIssues.join(', ')} counts as a miss but is a data error: the parsed table showed only one party on the ballot.</>}
            </Callout>
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
      <p style={{ marginTop: 16 }}>
        <a className="btn live-link" href={`${import.meta.env.BASE_URL}live/`} style={{ textDecoration: 'none' }}><i />{s ? 'See the final count' : 'Follow the count live'}</a>
        <span className="muted" style={{ fontSize: 14, marginLeft: 10 }}>calls, flips, upsets, and every model, polling average and prediction market graded</span>
      </p>
      <Code label="How the forecast was scored" code={`
# 1. refresh only the 2026 page (winners are marked with a check in the result tables)
.venv/bin/python ml/fetch_data.py --only 2026
# 2. rebuild: the frozen forecast is read back, never retrained, and compared to the winners
.venv/bin/python ml/build.py
# 3. rebuild the site
cd web && npm run build
`} />
      {s && (
        <Callout kind="try" title="Finish the scoring yourself">
          The exercise closed on {etTime(s.closedAt)} with {s.uncalled} House races still being counted (California counts slowly, and Louisiana
          runs off in December). Run the three commands above after the count ends to grade the full set; the frozen forecast never changes.
        </Callout>
      )}
    </Chapter>
  )
}
