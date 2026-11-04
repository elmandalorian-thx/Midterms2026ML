import { Callout, Chapter } from '../components/ui'
import { dataUrl, etTime, guide, lean, pct } from '../lib/data'

const BOOK: [string, string, string][] = [
  ['Ch. 1 · The Machine Learning Landscape', 'Nonrepresentative Training Data · Sampling Bias', 'Why polls can miss, and why one wave year (2018) behaves unlike the rest'],
  ['Ch. 2 · End-to-End Machine Learning Project', 'Frame the Problem · Create a Test Set · Prepare the Data', 'Chapters 01–04 here; we split by year instead of at random'],
  ['Ch. 3 · Classification', 'Confusion Matrices · ROC Curve · Precision/Recall', 'Chapters 05–07: baselines, accuracy inflation, the hard subset'],
  ['Ch. 4 · Training Models', 'Logistic Regression · Learning Curves · Regularized Linear Models', 'The main forecaster, the C grid, the learning curve'],
  ['Ch. 6 · Decision Trees', 'Making Predictions · Regularization Hyperparameters', 'The depth-3 tree and the depth/overfitting curve'],
  ['Ch. 7 · Ensemble Learning and Random Forests', 'Random Forests · Boosting', 'Gradient boosting per district; the forest that fails on 14 national points'],
]

export function Wrap() {
  const sc = guide.score2026
  const fz = guide.forecast.frozen
  return (
    <Chapter id="wrap" num="10" title="Limits, book map & files"
      kicker="What this project can and cannot tell you, how it maps onto the textbook, and how to run it yourself.">
      {sc && (
        <div className="block card">
          <span className="pill">Exercise closed · {etTime(sc.closedAt)}</span>
          <h3 style={{ marginTop: 12 }}>What we learned</h3>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><b>Four neutral features go a long way.</b> District lean, the national mood, incumbency and the party holding the seat picked{' '}
              {pct(sc.contestedAccuracy)} of {sc.contested} contested 2026 races and {sc.closeAccuracy !== null ? pct(sc.closeAccuracy) : '—'} of the {sc.closeN} close ones,
              close to what the year-by-year test predicted.</li>
            <li><b>Simple held its own.</b> Gradient boosting scored {pct(sc.accuracyGbm)} against {pct(sc.accuracyLogreg)} for the logistic regression
              we froze, a difference of {Math.round(Math.abs(sc.accuracyGbm - sc.accuracyLogreg) * sc.called)} of {sc.called} races; the simpler model
              is the one you can read and check line by line.</li>
            <li><b>The biggest error was the input, not the model.</b> The polling average said {lean(sc.frozenEnv, 1)}; the results fit{' '}
              {lean(sc.impliedEnv, 1)}. Every district shares that one number, so its miss moved all of them together, and the ±{fz.sigmaEnv}-point
              error we assumed was too small.</li>
            <li><b>Freezing the forecast made the grade honest.</b> The probabilities were committed before the first polls closed and never refit,
              so every number in Chapter 09 is a real out-of-sample test, misses included.</li>
          </ol>
        </div>
      )}
      <div className="grid-2">
        <Callout kind="fair" title="Use it to learn, not to persuade">
          A forecast is a statement about uncertainty, not about who should win. Nothing here rates candidates or parties, and every
          modeling choice is written down so it can be challenged. If you share results, share the uncertainty with them.
        </Callout>
        <Callout kind="pitfall" title="Known limitations">
          Six training cycles is not much history; the national environment is an assumption; Cook PVI compresses a district into one
          number; independent and third-party winners are dropped; a few districts per year are missing from the parsed tables.
        </Callout>
      </div>
      <div className="block">
        <h3>Map to Géron, <em>Hands-On Machine Learning</em> (3rd ed.)</h3>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead><tr><th style={{ paddingLeft: 18 }}>Book chapter</th><th>Sections to read</th><th>Where it shows up here</th></tr></thead>
            <tbody>{BOOK.map(([a, b, c]) => <tr key={a}><td style={{ paddingLeft: 18, fontWeight: 600 }}>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Section titles only; the book's text is not reproduced here. Chapter 1's own example of sampling bias is a famous wrong election poll.</p>
      </div>
      <div className="block grid-2">
        <div className="card">
          <h4>Run it yourself</h4>
          <pre style={{ fontSize: 12.5 }}>{`uv venv .venv && uv pip install --python .venv/bin/python -r ml/requirements.txt
.venv/bin/python ml/fetch_data.py   # 538 + Wikipedia -> data/raw/
.venv/bin/python ml/build.py        # train, evaluate, forecast, export
cd web && npm install && npm run dev`}</pre>
          <p style={{ marginTop: 12 }}>Notebook: <a href="https://github.com/elmandalorian-thx/Midterms2026ML/blob/main/notebooks/midterms_2026_ml.ipynb" target="_blank" rel="noreferrer">notebooks/midterms_2026_ml.ipynb</a> runs the same pipeline step by step.</p>
        </div>
        <div className="card">
          <h4>Ideas to extend it</h4>
          <p>Add Census ACS demographics per district · Add FiftyPlusOne district polls where they exist · Model the vote margin
            (regression) instead of the winner · Replace the fixed polling-error assumption with one estimated from past generic-ballot
            misses · Let regional errors move together, not only the national one. (The Senate version is the{' '}
            <a href={`${import.meta.env.BASE_URL}senate/`}>Senate guide</a>.)</p>
          <p style={{ margin: 0 }}><a href={dataUrl('forecast/forecast_2026.csv')} download>Download the frozen forecast (CSV)</a></p>
        </div>
      </div>
      <div className="block card">
        <h4>Credits</h4>
        <p style={{ fontSize: 14 }}>
          Created by Juan Barahona (<a href="https://github.com/elmandalorian-thx" target="_blank" rel="noreferrer">github.com/elmandalorian-thx</a>), as a companion to
          {' '}<a href="https://elmandalorian-thx.github.io/PokemonML/" target="_blank" rel="noreferrer">PokemonML</a>. Results data: FiveThirtyEight election-results (CC BY 4.0).
          District tables and polling aggregates: Wikipedia contributors (CC BY-SA 4.0). District lean: Cook Partisan Voting Index, The Cook
          Political Report. Polling averages as published by Decision Desk HQ, FiftyPlusOne, NBC News, RealClearPolitics and Silver Bulletin.
          Method: Aurélien Géron, <em>Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow</em>, 3rd ed. (O'Reilly, 2022).
          Built {guide.built}. Not affiliated with any party, campaign or media organization.
        </p>
      </div>
    </Chapter>
  )
}
