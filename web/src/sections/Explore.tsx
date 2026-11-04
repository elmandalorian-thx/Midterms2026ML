import { useState } from 'react'
import { BarList, ChartFrame, DivergingBars, Legend, LineChart, linear, ticks, Tooltip, useWidth } from '../components/charts'
import { YearBars, YearScatter } from '../components/election'
import { Callout, Chapter, Code } from '../components/ui'
import { guide, lean, pct } from '../lib/data'

const nat = guide.national
const lost = nat.midtermSwing.filter((s) => s.swing < 0).length
const exceptions = nat.midtermSwing.filter((s) => s.swing >= 0).map((s) => s.year).join(', ')

/** Seats vs. votes, 1998–2024, with the straight-line fit. Midterms are filled, presidential years hollow. */
function SeatsVotes() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const h = 320, m = { l: 48, r: 16, t: 14, b: 40 }
  const x = linear(-8, 12, m.l, width - m.r)
  const y = linear(0.38, 0.62, h - m.b, m.t)
  const fit = (e: number) => nat.linear.intercept + nat.linear.slope * e
  return (
    <div ref={ref} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={h} role="img" aria-label="Democratic seat share against national House vote margin">
        {ticks(0.4, 0.6, 4).map((t) => (
          <g key={t}><line className="gridline" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{pct(t, 0)}</text></g>
        ))}
        {ticks(-8, 12, 5).map((t) => <text key={t} x={x(t)} y={h - m.b + 18} textAnchor="middle">{lean(t)}</text>)}
        <text x={(m.l + width - m.r) / 2} y={h - 4} textAnchor="middle">National House vote (two-party margin)</text>
        <line className="axisline" x1={m.l} x2={width - m.r} y1={y(0.5)} y2={y(0.5)} />
        <line x1={x(-8)} x2={x(12)} y1={y(fit(-8))} y2={y(fit(12))} stroke="var(--text-primary)" strokeWidth={2} pathLength={1} className="draw" />
        {nat.rows.map((r, i) => (
          <g key={r.year} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="pop">
            <circle cx={x(r.env)} cy={y(r.seatShare)} r={hover === i ? 8 : 6} strokeWidth={2}
              fill={r.midterm ? 'var(--series-1)' : 'var(--surface-1)'} stroke="var(--series-1)" />
            <text x={x(r.env) + 9} y={y(r.seatShare) + 4} style={{ fontSize: 11 }}>{r.year}</text>
          </g>
        ))}
      </svg>
      {hover !== null && (
        <Tooltip x={x(nat.rows[hover].env)} y={y(nat.rows[hover].seatShare)}>
          <b>{nat.rows[hover].year}</b>{nat.rows[hover].midterm ? ' (midterm)' : ''} · vote {lean(nat.rows[hover].env, 1)} ·
          seats {nat.rows[hover].seatsD} D – {nat.rows[hover].seatsR} R
        </Tooltip>
      )}
    </div>
  )
}

export function Explore() {
  const bins = guide.pviBins
  const years = Object.keys(guide.reelect)
  return (
    <Chapter id="explore" num="03" title="Explore"
      kicker="Look before you model. Three patterns explain most House races, and one warns us about overconfidence."
      book={{ ch: 'Ch. 2', sections: ['Explore and Visualize the Data to Gain Insights', 'Look for Correlations'] }}>
      <div className="block">
        <h3>1 · District lean predicts the result, and the whole cloud slides with the national mood</h3>
        <ChartFrame title="Cook PVI vs. actual House margin, contested races" sub="Press play: each year the cloud shifts up (Democratic year) or down (Republican year). The line is a rule of thumb, not a fitted model."
          table={{ columns: ['Year', 'National vote', 'Races'], rows: Object.keys(guide.scatter).map((y) => [y, lean(guide.envByYear[y], 1), guide.scatter[y].length]) }}>
          <YearScatter />
        </ChartFrame>
        <Callout kind="concept" title="Why ‘2 × PVI’">
          PVI measures how much more Democratic a district is than the nation in <em>two-party vote share</em>. A margin (D minus R) moves
          twice as fast as a share, so a D+5 district in a tied year should land near D+10. Simple domain knowledge like this tells you
          which features to build and what a model should roughly learn.
        </Callout>
      </div>

      <div className="block grid-2">
        <ChartFrame title="How often the Democrat wins, by district lean" sub="Contested races 2014–2024, 5-point PVI bins"
          table={{ columns: ['PVI bin', 'Races', 'Dem win rate'], rows: bins.map((b) => [`${lean(b.lo)} to ${lean(b.hi)}`, b.n, pct(b.demWin)]) }}>
          <LineChart height={260} yDomain={[0, 1]} xFormat={(v) => lean(v)} yFormat={(v) => pct(v, 0)} xLabel="District lean (bin center)"
            series={[{ key: 'w', label: 'P(Dem win)', color: 'var(--series-1)', points: bins.map((b) => ({ x: (b.lo + b.hi) / 2, y: b.demWin })), endLabel: false }]} />
        </ChartFrame>
        <ChartFrame title="Incumbents outperform their district" sub="Average result minus (2 × PVI + national vote), points of margin"
          table={{ columns: ['Group', 'Races', 'Over/under-performance'], rows: guide.incumbency.map((g) => [g.group, g.n, lean(g.resid, 1)]) }}>
          <DivergingBars items={guide.incumbency.map((g) => ({ label: g.group.replace(' incumbent', ' inc.'), value: g.resid }))}
            format={(v) => lean(v, 1)} leftLabel="better for Republicans" rightLabel="better for Democrats" />
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Bar colors show direction only (left/right of zero), not party identity.
          </p>
        </ChartFrame>
      </div>
      <div className="block">
        <ChartFrame title="Incumbents who ran in November and won" sub="Share of incumbents on the general-election ballot who kept their seat"
          table={{ columns: ['Year', 'Re-election rate'], rows: years.map((y) => [y, pct(guide.reelect[y])]) }}>
          <BarList items={years.map((y) => ({ label: y, value: guide.reelect[y], highlight: y === '2018' }))} format={(v) => pct(v, 0)} domain={[0.8, 1]} labelWidth={70} />
        </ChartFrame>
      </div>

      <div className="block">
        <h3>2 · The national picture is a small-data problem</h3>
        <p>
          Add every district up and each election becomes one point. From 1998 to 2024 that is only {nat.rows.length} points. With so few,
          a straight line beats a flexible model: in leave-one-year-out testing the line misses by {nat.maeLinearSeats} seats on average,
          a random forest by {nat.maeForestSeats}. Forests cannot extrapolate past the years they saw, and lines can.
        </p>
        <div className="grid-2">
          <ChartFrame title="Seats follow votes" sub="Democratic seat share vs. national House vote. Filled = midterm year."
            table={{ columns: ['Year', 'Vote margin', 'D seats', 'R seats'], rows: nat.rows.map((r) => [r.year, lean(r.env, 1), r.seatsD, r.seatsR]) }}>
            <SeatsVotes />
          </ChartFrame>
          <ChartFrame title="Leave-one-year-out error, in seats" sub="Train on 13 elections, predict the 14th, repeat"
            legend={<Legend items={[{ label: 'Linear regression', color: 'var(--series-1)' }, { label: 'Random forest', color: 'var(--series-2)' }]} />}
            table={{ columns: ['Year', 'Actual D seats', 'Linear', 'Forest'], rows: nat.rows.map((r) => [r.year, r.seatsD, Math.round(r.looLinear * 435), Math.round(r.looForest * 435)]) }}>
            <YearBars rows={nat.rows.map((r) => ({ label: `’${String(r.year).slice(2)}`, values: [Math.abs(r.looLinear - r.seatShare) * 435, Math.abs(r.looForest - r.seatShare) * 435] }))}
              series={[{ label: 'Linear', color: 'var(--series-1)' }, { label: 'Forest', color: 'var(--series-2)' }]}
              format={(v) => `${Math.round(v)}`} domain={[0, Math.ceil(Math.max(...nat.rows.map((r) => Math.abs(r.looForest - r.seatShare) * 435, 1)) / 10) * 10]} />
          </ChartFrame>
        </div>
        <ChartFrame title="The midterm penalty" sub="Change in the president's party's national House margin vs. two years earlier (negative = the president's party lost ground)"
          table={{ columns: ['Midterm', "President's party", 'Swing'], rows: nat.midtermSwing.map((s) => [s.year, s.presParty > 0 ? 'Democratic' : 'Republican', lean(s.swing, 1).replace('D', '+').replace('R', '−')]) }}>
          <DivergingBars items={nat.midtermSwing.map((s) => ({ label: `${s.year} (${s.presParty > 0 ? 'D' : 'R'} pres.)`, value: s.swing }))}
            format={(v) => `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`} leftLabel="president's party lost ground" rightLabel="gained" />
        </ChartFrame>
        <Callout kind="result" title="A pattern that holds for both parties">
          In {lost} of {nat.midtermSwing.length} midterms in this data the president's party lost ground in the national House vote, under
          presidents of both parties (the exception, {exceptions}, came a year after 9/11). That is why the 2026 generic ballot, not the 2024
          result, is the right “national environment” input.
        </Callout>
      </div>
      <Code code={`
# National environment = two-party House vote margin, from 538 district returns
g = res.groupby("year").agg(votesD=("votesD", "sum"), votesR=("votesR", "sum"))
g["env"] = 100 * (g.votesD - g.votesR) / (g.votesD + g.votesR)
# Small data: compare models with leave-one-out, not a single split
for tr, te in LeaveOneOut().split(X):
    lin[te] = LinearRegression().fit(X[tr], y[tr]).predict(X[te])
    rf[te] = RandomForestRegressor(200).fit(X[tr], y[tr]).predict(X[te])
`} />
      <Callout kind="result" title="Takeaway">
        District lean, the national mood that moves every district together, and incumbency explain most House races, so they
        become our features. The national picture has only {nat.rows.length} data points, and with so few a straight line (off by {nat.maeLinearSeats} seats
        on average) beats a flexible random forest ({nat.maeForestSeats}).
      </Callout>
    </Chapter>
  )
}
