import { useTween } from '../components/anim'
import { probColor } from '../components/ui'
import { pct } from '../lib/data'
import { D_CONTROL, HOLD, R_CONTROL, raceName, SF, sideOf, SR, seatOf, type SCall } from '../lib/senate'

const IND = 'var(--text-muted)'

/** Senate party tag: Dem / Rep / Ind (an independent who caucuses with neither). */
export const SeatTag = ({ p }: { p: 'D' | 'R' | 'I' | null }) =>
  p ? <span className="party"><i style={{ background: p === 'D' ? 'var(--dem)' : p === 'R' ? 'var(--rep)' : IND }} />{p === 'D' ? 'Dem' : p === 'R' ? 'Rep' : 'Ind'}</span>
    : <span className="muted" style={{ fontSize: 13 }}>none</span>

/* ------------------------------------------------------------ race for the Senate */

export function SenateBar({ d, r, i, expD, expR }: { d: number; r: number; i: number; expD: number; expR: number }) {
  const dT = useTween(d, 800), rT = useTween(r, 800), eD = useTween(expD, 800), eR = useTween(expR, 800)
  const w = (x: number) => `${x}%`
  const holdD = HOLD.D + HOLD.I_caucusD
  return (
    <div className="race">
      <div className="race-nums">
        <div className="side"><span className="race-big tabular">{Math.round(dT)}</span><span className="party"><i style={{ background: 'var(--dem)' }} />Democrats + 2 allied independents</span></div>
        <div className="race-mid"><b>{R_CONTROL} / {D_CONTROL}</b><br />for control</div>
        <div className="side right"><span className="race-big tabular">{Math.round(rT)}</span><span className="party"><i style={{ background: 'var(--rep)' }} />Republicans</span></div>
      </div>
      <div className="race-track" role="img" aria-label={`${d} Democratic-caucus and ${r} Republican seats decided; ${100 - d - r - i} uncalled`}>
        <div className="race-seg hold" style={{ left: 0, width: w(holdD), backgroundColor: 'var(--dem)' }} />
        <div className="race-seg" style={{ left: w(holdD), width: w(Math.max(0, dT - holdD)), background: 'var(--dem)' }} />
        <div className="race-seg ghost" style={{ left: w(dT), width: w(Math.max(0, eD - dT)), background: 'var(--dem)' }} />
        <div className="race-seg hold" style={{ right: 0, width: w(HOLD.R), backgroundColor: 'var(--rep)' }} />
        <div className="race-seg" style={{ right: w(HOLD.R), width: w(Math.max(0, rT - HOLD.R)), background: 'var(--rep)' }} />
        <div className="race-seg ghost" style={{ right: w(rT), width: w(Math.max(0, eR - rT)), background: 'var(--rep)' }} />
        <div className="race-line" style={{ left: '50%' }} />
      </div>
      <div className="race-foot muted">
        <span>Hatched = {100 - SR.length} seats not up in 2026 · solid = called · faded = projected</span>
        <span>Republicans need {R_CONTROL} (the Vice President breaks ties); Democrats need {D_CONTROL}{i ? ` · ${i} unaligned independent${i > 1 ? 's' : ''}` : ''}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ race cards */

export function RaceCards({ called, probs, q }: { called: Map<string, SCall>; probs: number[]; q: string }) {
  const s = q.trim().toLowerCase()
  const rows = SR.map((r, i) => ({ r, p: probs[i], c: called.get(r.id) }))
    .filter(({ r }) => !s || raceName(r).toLowerCase().includes(s) || r.id.toLowerCase() === s || (r.dName ?? '').toLowerCase().includes(s) || (r.rName ?? '').toLowerCase().includes(s))
    .sort((a, b) => Number(!!a.c && !a.c.runoff) - Number(!!b.c && !b.c.runoff) || Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5))
  return (
    <div className="race-cards">
      {rows.map(({ r, p, c }) => {
        const side = c ? sideOf(r, c) : null
        const seat = c ? seatOf(c) : null
        const contested = r.hasD && r.hasR
        return (
          <article key={r.id} className={`rcard ${c?.runoff ? 'runoff' : side ? `won-${side}` : ''}`}>
            <header>
              <b>{raceName(r)}</b>
              <span className="muted tabular">{r.lean > 0 ? 'D' : 'R'}+{Math.abs(r.lean).toFixed(0)}</span>
            </header>
            <div className={`cand ${side === 'D' ? 'win' : ''}`}><i style={{ background: r.dStandin ? IND : 'var(--dem)' }} />{r.dName ?? <span className="muted">no candidate</span>}</div>
            <div className={`cand ${side === 'R' ? 'win' : ''}`}><i style={{ background: 'var(--rep)' }} />{r.rName ?? <span className="muted">no candidate</span>}</div>
            {contested && (
              <div className="pbar" title={`P(Democratic side) ${pct(p, 0)} now · frozen ${pct(r.pFrozen, 0)}`}>
                <div style={{ width: `${(side === 'D' ? 1 : side === 'R' ? 0 : p) * 100}%`, background: probColor(side === 'D' ? 1 : side === 'R' ? 0 : p) }} /><span />
              </div>
            )}
            <footer className="muted">
              {c?.runoff ? <span className="chip-runoff">Runoff</span>
                : c ? <>Called · <SeatTag p={seat} />{c.name ? ` ${c.name}` : ''}</>
                  : contested ? <>D side {pct(p, 0)} now · frozen {pct(r.pFrozen, 0)}{r.pTipping >= 0.02 ? ` · tipping ${pct(r.pTipping, 0)}` : ''}</>
                    : 'Only one side on the ballot'}
            </footer>
          </article>
        )
      })}
      {!rows.length && <p className="muted">No race matches “{q}”.</p>}
    </div>
  )
}

/* ------------------------------------------------------------ control of Congress */

const CELL_LABEL: Record<string, string> = { D: 'Democratic Senate', R: 'Republican Senate', N: 'No Senate majority without independents' }

export function CongressGrid({ joint }: { joint: Record<string, number> }) {
  const frozen = SF.frozen.joint, indep = SF.frozen.jointIfIndependent
  return (
    <div className="scroll-x">
      <table className="data-table congress">
        <thead><tr><th /><th>Democratic House</th><th>Republican House</th></tr></thead>
        <tbody>
          {(['D', 'R', 'N'] as const).map((s) => (
            <tr key={s}>
              <th scope="row">{CELL_LABEL[s]}</th>
              {(['D', 'R'] as const).map((h) => (
                <td key={h} className="num">
                  <div className="joint-now tabular">{pct(joint[h + s], 1)}</div>
                  <div className="muted joint-sub">frozen {pct(frozen[h + s], 1)} · if independent {pct(indep[h + s], 1)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
