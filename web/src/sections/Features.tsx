import { BarList, ChartFrame } from '../components/charts'
import { Reveal } from '../components/anim'
import { Callout, Chapter, Code } from '../components/ui'
import { guide } from '../lib/data'

const FEATS = [
  { key: 'pvi', name: 'pvi', title: 'District lean', body: 'Cook PVI as a number: D+5 → +5, R+5 → −5. Built from the last two presidential elections, on the lines used that year.' },
  { key: 'env', name: 'env', title: 'National environment', body: 'Two-party House popular-vote margin. Training: the actual result. 2026: the final generic-ballot polling average.' },
  { key: 'inc', name: 'inc', title: 'Incumbent on the ballot', body: '+1 if a Democratic incumbent is running, −1 if a Republican incumbent is, 0 for an open seat.' },
  { key: 'held', name: 'held', title: 'Party holding the seat', body: '+1 Democratic, −1 Republican, 0 for a brand-new seat. Lets open seats keep a little of the old party\'s edge.' },
]

export function Features() {
  const eff = guide.effects
  return (
    <Chapter id="features" num="04" title="Features"
      kicker="Four numbers per race, each one signed the same way so that the two parties are treated identically."
      book={{ ch: 'Ch. 2', sections: ['Prepare the Data for Machine Learning Algorithms', 'Feature Scaling and Transformation'] }}>
      <div className="grid-4">
        {FEATS.map((f, i) => (
          <Reveal key={f.key} delay={i * 100}>
            <div className="card" style={{ height: '100%' }}>
              <code>{f.name}</code>
              <h4 style={{ marginTop: 10 }}>{f.title}</h4>
              <p style={{ margin: 0 }}>{f.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Callout kind="pitfall" title="Train/serve skew in the environment feature">
        During training, <code>env</code> is the real national vote, which nobody knows before Election Day. For 2026 we feed it a
        <em> polling average</em> instead. If polls are off by 3 points, every district shifts together. That is why the forecast in
        Chapter 08 simulates a shared national polling error rather than treating 435 races as independent coin flips.
      </Callout>
      <div className="block">
        <ChartFrame title="What one unit of each feature is worth" sub="Logistic-regression weights converted to ‘points of PVI’ (how much district lean would have the same effect)"
          table={{ columns: ['Feature', 'Equivalent PVI points'], rows: guide.features.map((f) => [f.label, eff[f.key].toFixed(2)]) }}>
          <BarList items={guide.features.map((f) => ({ label: f.label, value: eff[f.key], highlight: f.key === 'inc' }))}
            format={(v) => v.toFixed(1)} labelWidth={210} />
        </ChartFrame>
        <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>
          Read it as: a sitting incumbent is worth about {eff.inc.toFixed(1)} points of district lean, and one point of national
          margin about {eff.env.toFixed(2)} points of lean (theory says roughly 0.5, because PVI is in share units and env in margin units).
        </p>
      </div>
      <Code code={`
def features(d, env):
    """Every feature is + for Democrats and - for Republicans."""
    sign = {"D": 1, "R": -1}
    f = pd.DataFrame(index=d.index)
    f["pvi"] = d.pvi                                   # Cook PVI, D+ positive
    f["env"] = env                                     # national two-party margin
    f["inc"] = np.where(d.inc_running == 1, d.inc_party.map(sign).fillna(0), 0)
    f["held"] = d.inc_party.map(sign).fillna(0)
    return f
`} />
    </Chapter>
  )
}
