import { Reveal } from '../components/anim'
import { Hemicycle } from '../components/election'
import { Callout, Chapter, StatTile } from '../components/ui'
import { fmt, guide, lean, pct } from '../lib/data'

const f = guide.forecast
const lr = guide.models.find((m) => m.key === 'logreg')!

export function Hero() {
  const seats = guide.districts.map((d) => ({ id: d.id, p: d.pFrozen, note: `PVI ${lean(d.pvi)}` }))
  return (
    <>
      <header className="hero">
        <div>
          <span className="eyebrow">A nonpartisan machine learning walkthrough · U.S. House, November 2026</span>
          <h1>435 races.<br />One model.<br />Then we check it.</h1>
          <p className="hero-lede">
            Can a small, transparent model call U.S. House races from public data? This guide builds one from
            {' '}{fmt(guide.counts.districtYears)} past district races (2014–2024), tests it on an election it never saw, freezes a
            forecast for every 2026 district before the votes are counted, and then scores itself against the results.
          </p>
          <p style={{ fontSize: 14, marginTop: -4 }}>
            By <a href="https://github.com/elmandalorian-thx" target="_blank" rel="noreferrer"><strong>Juan Barahona</strong></a> ·
            For learning only: not a prediction service, not advocacy · Method: Géron, <em>Hands-On Machine Learning</em> (3rd ed.)
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href="#problem" style={{ textDecoration: 'none' }}>Start the walkthrough</a>
            <a className="btn live-link" href={`${import.meta.env.BASE_URL}live/`} style={{ textDecoration: 'none' }}><i />Live results tracker</a>
            <a className="btn" href="#forecast" style={{ textDecoration: 'none' }}>Skip to the forecast →</a>
            <a className="btn" href="#data" style={{ textDecoration: 'none' }}>Datasets & APIs</a>
          </div>
        </div>
        <div className="hero-art">
          <Hemicycle seats={seats} height={240} />
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            Each dot is a 2026 district, colored by the frozen forecast's P(Democrat wins). Hover a seat.
          </p>
        </div>
      </header>
      <div className="grid-4">
        <StatTile label="Past races learned from" value={guide.counts.districtYears} format={(v) => fmt(Math.round(v))} note="2014–2024, six cycles" />
        <StatTile label="Accuracy on unseen 2024" value={lr.accuracy} format={(v) => pct(v)} note="contested races" />
        <StatTile label="…on competitive seats only" value={lr.competitiveAccuracy} format={(v) => pct(v)} note="PVI within 5 points: the honest number" />
        <StatTile label="Generic-ballot input" value={lean(f.env, 1)} note={`two-party margin, polls as of ${f.genericBallot.rows[0]?.updated ?? ''}`} />
      </div>
    </>
  )
}

export function Problem() {
  return (
    <Chapter id="problem" num="01" title="Frame the problem"
      kicker="Before touching data: what goes in, what comes out, and how we will know if it worked."
      book={{ ch: 'Ch. 1–2', sections: ['Frame the Problem', 'Select a Performance Measure', 'Check the Assumptions'] }}>
      <div className="grid-3">
        <Reveal><div className="card"><h4>Input</h4><p>One row per district per election: how the district usually votes (Cook PVI), the national mood
          (House popular vote, or polls for 2026), whether an incumbent is running and which party holds the seat.</p></div></Reveal>
        <Reveal delay={120}><div className="card"><h4>Output</h4><p>A probability that the Democratic candidate wins, which is the same thing as one minus the probability the
          Republican wins. Add 435 of them up and you get a seat forecast.</p></div></Reveal>
        <Reveal delay={240}><div className="card"><h4>Measure</h4><p>Accuracy, but mostly <strong>calibration</strong> and <strong>Brier score</strong>: when the model says 70%, does that side win about 70% of
          the time? We judge it on years it never trained on.</p></div></Reveal>
      </div>
      <Callout kind="concept" title="Two problems hiding in one">
        "Who wins the House?" is a <strong>small-data</strong> problem: there have only been {guide.national.rows.length} national elections in our data,
        so a fancy model has almost nothing to learn from. "Who wins each district?" is a <strong>classification</strong> problem with
        thousands of examples. We build the district model and add districts up, and we treat the national mood as an input we
        cannot predict, only assume (Chapter 08 lets you change it).
      </Callout>
      <h3 style={{ margin: '36px 0 10px', fontSize: 22 }}>How this project stays neutral</h3>
      <div className="grid-2">
        <Callout kind="fair" title="Symmetric by construction">
          Every feature is signed: positive means "leans Democratic", negative means "leans Republican". Swap the parties and every
          input flips sign. Chapter 07 checks that the model's answer flips too.
        </Callout>
        <Callout kind="fair" title="No hand-tuning toward an outcome">
          Settings are chosen on 2022, scored once on 2024, and the 2026 forecast was written to a file before Election Day. The
          code that made it is public, so anyone can re-run it and get the same numbers.
        </Callout>
        <Callout kind="fair" title="Inputs, not opinions">
          No candidate quality ratings, endorsements, fundraising narratives or expert "lean" ratings: only results, an index
          built from past presidential votes, incumbency, and the published polling average.
        </Callout>
        <Callout kind="fair" title="Colors are a convention">
          Blue = Democratic and red = Republican is the U.S. media convention, used only for identity. Both colors were checked
          to be equally readable and colorblind-safe in light and dark mode.
        </Callout>
      </div>
    </Chapter>
  )
}
