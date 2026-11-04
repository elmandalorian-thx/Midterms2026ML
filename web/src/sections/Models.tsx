import { BarList, ChartFrame } from '../components/charts'
import { TreeDiagram } from '../components/election'
import { Callout, Chapter, Code } from '../components/ui'
import { guide, pct } from '../lib/data'

export function Baselines() {
  const b = guide.baselines
  const best = Math.max(...b.map((x) => x.accuracy))
  return (
    <Chapter id="baselines" num="05" title="Baselines"
      kicker="Before any learning: how far do one-line rules get on the 2024 test races?"
      book={{ ch: 'Ch. 2–3', sections: ['Select a Performance Measure', 'Measuring Accuracy Using Cross-Validation'] }}>
      <ChartFrame title="Rules of thumb on 2024 contested races" sub={`${guide.counts.test} races the models never train on`}
        table={{ columns: ['Rule', 'Accuracy'], rows: b.map((x) => [x.name, pct(x.accuracy)]) }}>
        <BarList items={b.map((x) => ({ label: x.name, value: x.accuracy, highlight: x.accuracy === best }))} format={(v) => pct(v, 1)} domain={[0, 1]} labelWidth={240} />
      </ChartFrame>
      <Callout kind="concept" title="A high bar">
        “District lean decides” already scores {pct(b.find((x) => x.name.startsWith('District'))!.accuracy)}. Most House seats are not competitive, so any
        model will look great on accuracy. The real question is whether it beats these rules where races are close, and whether its
        probabilities are honest.
      </Callout>
      <Callout kind="result" title="Takeaway">
        Without any learning, the best one-line rule (“{b.find((x) => x.accuracy === best)!.name}”) already gets {pct(best)} of the {guide.counts.test} test
        races right. That is the bar every model in the next chapter has to clear, on close races and with honest probabilities, to be worth it.
      </Callout>
    </Chapter>
  )
}

const accs = guide.models.map((m) => m.accuracy)
const spread = Math.round((Math.max(...accs) - Math.min(...accs)) * guide.counts.test)

export function Models() {
  const ms = guide.models
  const tun = guide.tuning
  return (
    <Chapter id="models" num="06" title="Models"
      kicker="Three classic classifiers, tuned on 2022 and scored once on 2024."
      book={{ ch: 'Ch. 4, 6, 7', sections: ['Logistic Regression', 'Decision Trees', 'Gradient Boosting'] }}>
      <div className="grid-3">
        <div className="card"><h4>Logistic regression</h4><p>Adds the four features with weights and squashes the total into a probability. Easy to read, hard to overfit.</p></div>
        <div className="card"><h4>Decision tree (depth 3)</h4><p>Eight yes/no questions at most. Readable, but probabilities come in coarse steps.</p></div>
        <div className="card"><h4>Gradient boosting</h4><p>150 tiny trees, each fixing the last one's mistakes. Flexible, needs more data to shine.</p></div>
      </div>
      <div className="block grid-2">
        <ChartFrame title="Tuning on the 2022 validation year" sub="Trained on 2014–2020; the 2024 test year stays locked away"
          table={{ columns: ['Model', 'Setting', 'Validation accuracy'], rows: tun.map((t) => [t.model, t.param, pct(t.val)]) }}>
          <BarList items={tun.map((t) => ({ label: `${t.model === 'gbm' ? 'Boosting' : 'Logistic'} ${t.param}`, value: t.val, highlight: t.param === 'C=1' || t.param === 'depth=2' }))}
            format={(v) => pct(v, 1)} domain={[0.9, 1]} labelWidth={150} />
        </ChartFrame>
        <ChartFrame title="Test year 2024: three models" sub="Refit on 2014–2022, scored once"
          table={{ columns: ['Model', 'Accuracy', 'Competitive', 'Brier', 'AUC'], rows: ms.map((m) => [m.name, pct(m.accuracy), pct(m.competitiveAccuracy), m.brier.toFixed(3), m.auc.toFixed(3)]) }}>
          <BarList items={ms.map((m) => ({ label: m.name, value: m.accuracy, note: `Brier ${m.brier.toFixed(3)} · competitive ${pct(m.competitiveAccuracy)}` }))}
            format={(v) => pct(v, 1)} domain={[0.9, 1]} labelWidth={180} emphasis={false} />
        </ChartFrame>
      </div>
      <div className="block">
        <ChartFrame title="The depth-3 tree, trained on every race 2014–2024" sub="Bar = share of training races won by the Democrat (blue) vs. Republican (red) in that node">
          <TreeDiagram />
        </ChartFrame>
      </div>
      <Callout kind="result" title="Simple holds its own">
        The three models are {spread} race{spread === 1 ? "" : "s"} apart on the {guide.counts.test} test races of 2024. With four strong, mostly linear features, the flexible
        model has little extra to find. We keep logistic regression as the main forecaster because its probabilities are smooth and
        its weights are readable, and show boosting next to it.
      </Callout>
      <Code code={`
lr = make_pipeline(StandardScaler(), LogisticRegression(C=1.0))
tree = DecisionTreeClassifier(max_depth=3, min_samples_leaf=20)
gbm = GradientBoostingClassifier(n_estimators=150, max_depth=2, learning_rate=0.05, subsample=0.8)
for m in (lr, tree, gbm):
    m.fit(X[train_2014_2022], y[train_2014_2022])
    print(m, accuracy_score(y_2024, m.predict(X_2024)))
`} />
    </Chapter>
  )
}
