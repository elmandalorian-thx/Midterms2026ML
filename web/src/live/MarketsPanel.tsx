// Scoreboard section: Kalshi and Polymarket, snapshotted before polls closed, graded against the frozen models.
import { useMemo } from 'react'
import { guide, pct } from '../lib/data'
import { controlResult, disagreements, markets, observations, scoreMarkets, type MarketRow } from '../lib/scoreboard'
import { raceName, SF, sideOf, sRace, type SCall } from '../lib/senate'
import type { MarketQuotes } from '../lib/types'

const MIN_N = 8
const TIE = 0.005
const ET = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'
const party = (s: 'D' | 'R' | null) => (s === 'D' ? 'Democrats' : s === 'R' ? 'Republicans' : 'not decided yet')

/** Ranked on close races, like the models: every forecaster gets the safe seats right. */
export function marketVerdict(r: MarketRow) {
  const m = r.mClose, d = r.modelClose
  if (!m || !d || m.n < MIN_N) return null
  const gap = d.brier - m.brier
  return Math.abs(gap) < TIE ? 'tie' : gap > 0 ? 'market' : 'model'
}

export function MarketsPanel({ called, sCalled }: { called: Map<string, 'D' | 'R' | 'O'>; sCalled: Map<string, SCall> }) {
  const obs = useMemo(() => observations(called, sCalled), [called, sCalled])
  const rows = useMemo(() => scoreMarkets(obs), [obs])
  const ctrl = controlResult(called, sCalled)
  const gaps = useMemo(() => disagreements(10), [])
  const hoursBefore = Math.round((Date.parse(markets.cutoff) - Date.parse(markets.fetchedAt)) / 36e5)
  const src = markets.sources
  const q = (x: MarketQuotes | undefined, k: (typeof src)[number]['key']) => x?.[k] ? `${pct(x[k]!.p, 0)}${x[k]!.liquid ? '' : '*'}` : '—'
  const result = (g: (typeof gaps)[number]) => {
    if (g.chamber === 'House') { const w = called.get(g.id); return w === 'D' || w === 'R' ? `${w} won` : '' }
    const c = sCalled.get(g.id), r = sRace(g.id)
    if (!c || !r) return ''
    if (c.runoff) return 'runoff'
    const s = sideOf(r, c)
    return s === 'D' ? 'D side won' : s === 'R' ? 'R side won' : 'other'
  }
  const told = rows.map((r) => ({ r, v: marketVerdict(r) })).filter((x) => x.v)

  return (
    <section className="panel">
      <h2>Models vs. prediction markets</h2>
      <p className="muted sub">
        Kalshi and Polymarket prices were saved on {ET(markets.fetchedAt)}, {hoursBefore > 0 ? `about ${hoursBefore} hours ` : ''}before the first polls
        closed, and frozen like the forecasts (a price taken after the first results would just be reading the count). Each race's price is the midpoint
        of the best bid and ask, rescaled so the two sides sum to 100%. Only races with at least {markets.rules.minVolume.toLocaleString()} contracts or
        dollars traded and a spread of {Math.round(markets.rules.maxSpread * 100)}¢ or less are graded, and each market is compared with the frozen model
        on <b>exactly the races it priced</b>, so neither side gets an easier set.
      </p>
      <div className="scroll-x">
        <table className="data-table">
          <thead><tr><th>Chamber</th><th>Market</th><th className="num">Races priced</th><th className="num">Called</th>
            <th className="num">Brier: market</th><th className="num">Brier: model</th><th className="num">Close called</th>
            <th className="num">Close Brier: market</th><th className="num">Close Brier: model</th><th /></tr></thead>
          <tbody>{rows.map((r) => {
            const v = marketVerdict(r)
            return (
              <tr key={r.chamber + r.key}>
                <td>{r.chamber}</td><td>{r.name}</td>
                <td className="num">{r.priced}</td>
                <td className="num">{r.market?.n ?? 0}</td>
                <td className="num">{r.market ? r.market.brier.toFixed(3) : '—'}</td>
                <td className="num">{r.model ? r.model.brier.toFixed(3) : '—'}</td>
                <td className="num">{r.mClose?.n ?? 0}</td>
                <td className="num"><b>{r.mClose ? r.mClose.brier.toFixed(3) : '—'}</b></td>
                <td className="num"><b>{r.modelClose ? r.modelClose.brier.toFixed(3) : '—'}</b></td>
                <td>{v === 'market' ? <span className="tag tag-best">market ahead</span> : v === 'model' ? <span className="tag tag-best">model ahead</span> : v === 'tie' ? <span className="tag">tie</span> : null}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <p style={{ fontSize: 14.5, marginBottom: 0 }}>
        {told.length
          ? told.map(({ r, v }) => `${r.chamber}, ${r.name}: ${v === 'tie' ? `a tie with the model (within ${TIE} Brier)` : v === 'market' ? 'the market leads the model' : 'the model leads the market'} on ${r.mClose!.n} close races.`).join(' ')
          : `Waiting for at least ${MIN_N} close races called per chamber before declaring a leader.`}
      </p>

      <h3 style={{ fontSize: 16, margin: '22px 0 6px' }}>Who controls each chamber?</h3>
      <div className="scroll-x">
        <table className="data-table">
          <thead><tr><th>Chamber</th><th className="num">Our model (frozen)</th>{src.map((s) => <th key={s.key} className="num">{s.name}</th>)}<th>Result</th></tr></thead>
          <tbody>
            <tr><td>House: P(Democrats control)</td><td className="num">{pct(guide.forecast.pDemMajority, 0)}</td>
              {src.map((s) => <td key={s.key} className="num">{q(markets.control.house, s.key)}</td>)}<td>{party(ctrl.house)}</td></tr>
            <tr><td>Senate: P(Democrats control)</td><td className="num">{pct(SF.pDControl, 0)}</td>
              {src.map((s) => <td key={s.key} className="num">{q(markets.control.senate, s.key)}</td>)}<td>{party(ctrl.senate)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13.5 }}>
        One question per chamber is a single draw: whoever "wins" it tonight learned little about who forecasts better. The race-by-race table above is
        the real test. The model's Senate number leaves {pct(SF.pNoMajority, 1)} for an outcome where neither side reaches a majority.
      </p>

      <h3 style={{ fontSize: 16, margin: '22px 0 6px' }}>Where the markets and the model disagree most</h3>
      <div className="scroll-x">
        <table className="data-table">
          <thead><tr><th>Race</th><th className="num">Model P(D side)</th>{src.map((s) => <th key={s.key} className="num">{s.name}</th>)}<th className="num">Gap</th><th>Result</th></tr></thead>
          <tbody>{gaps.map((g) => (
            <tr key={g.chamber + g.id}>
              <td>{g.chamber === 'House' ? g.id : `${raceName(sRace(g.id)!)} Senate`}</td>
              <td className="num">{pct(g.model, 0)}</td>
              {src.map((s) => <td key={s.key} className="num">{q(g.q, s.key)}</td>)}
              <td className="num">{g.avg > g.model ? '+' : '−'}{Math.round(Math.abs(g.avg - g.model) * 100)} pts</td>
              <td>{result(g)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13.5 }}>
        Gap = markets' average minus the model; + means the markets gave the Democratic side more. Large gaps are where one of them knows something the
        other does not: candidate quality, a scandal, local polling, or how a newly drawn district will really vote. Caveats: markets
        are not exact probabilities (long shots tend to be overpriced), a few large traders can move a price, and traders are not a cross-section of
        voters. * = traded too thinly to be graded.
      </p>
    </section>
  )
}
