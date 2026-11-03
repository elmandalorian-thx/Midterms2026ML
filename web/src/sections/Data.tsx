import { ChartFrame } from '../components/charts'
import { Callout, Chapter, Code, PartyTag, StatTile } from '../components/ui'
import { dataUrl, fmt, guide, lean, pct } from '../lib/data'

const q = guide.quality

const SOURCES: { name: string; what: string; how: string; license: string; url: string }[] = [
  { name: 'FiveThirtyEight election-results', what: `Candidate-level U.S. House returns, 1998–2024 (${fmt(guide.counts.candidateRows)} rows): votes, party line, winner.`,
    how: 'GitHub raw CSV (no key): raw.githubusercontent.com/fivethirtyeight/election-results/main/election_results_house.csv', license: 'CC BY 4.0',
    url: 'https://github.com/fivethirtyeight/election-results' },
  { name: 'Wikipedia House election pages', what: 'Per-district tables for 2014–2026: Cook PVI, incumbent and party, retirements, candidates, winner (✓).',
    how: 'MediaWiki raw wikitext: en.wikipedia.org/w/index.php?title=<year>_United_States_House_of_Representatives_elections&action=raw', license: 'CC BY-SA 4.0',
    url: 'https://en.wikipedia.org/wiki/2026_United_States_House_of_Representatives_elections' },
  { name: 'Cook Partisan Voting Index', what: 'District lean vs. the nation from the last two presidential elections. 2026 values are on the new (redistricted) lines.',
    how: 'Read from the Wikipedia tables above (published by The Cook Political Report).', license: 'Cook Political Report',
    url: 'https://www.cookpolitical.com/cook-pvi' },
  { name: 'Generic-ballot polling averages', what: 'Final 2026 averages from Decision Desk HQ, FiftyPlusOne, NBC News, RealClearPolitics, Silver Bulletin.',
    how: "Wikipedia 2026 page, table 'Generic congressional ballot aggregate polls' (parsed by fetch_data.py).", license: 'CC BY-SA 4.0 (table)',
    url: 'https://en.wikipedia.org/wiki/2026_United_States_House_of_Representatives_elections#Generic_congressional_ballot_aggregate_polls' },
  { name: 'FiftyPlusOne poll files (optional)', what: 'Every 2026 generic-ballot poll (generic.csv), presidential approval, House/Senate/governor polls.',
    how: 'fiftyplusone.news/api/csv?api_key=KEY&filename=generic.csv (free key; set FIFTYPLUSONE_API_KEY).', license: 'See their terms',
    url: 'https://fiftyplusone.news/readme' },
  { name: 'MIT Election Data + Science Lab', what: 'The standard academic House returns, 1976–2024 (alternative / longer history).',
    how: 'Harvard Dataverse doi:10.7910/DVN/IG0UN2 (needs a guestbook form, so not auto-downloaded here).', license: 'CC0',
    url: 'https://electionlab.mit.edu/data' },
  { name: 'U.S. Census ACS API (extension)', what: 'Demographics by congressional district (education, income, age) for students who want more features.',
    how: 'api.census.gov/data/2024/acs/acs1?get=NAME,B01003_001E&for=congressional%20district:*&key=KEY (free key: api.census.gov/data/key_signup.html).', license: 'Public domain',
    url: 'https://www.census.gov/data/developers/data-sets/acs-1year.html' },
]

const FILES = [
  ['districts_2014.csv … districts_2026.csv', 'raw', 'One row per district: PVI, incumbent, candidates, winner'],
  ['house_results_538.csv', 'raw', 'Candidate returns 1998–2024 (trimmed copy of 538 data)'],
  ['generic_ballot_2026.json', 'raw', 'Polling averages used as the 2026 environment'],
  ['forecast_2026.csv', 'forecast', 'Frozen pre-election P(Dem) for all 435 districts'],
  ['forecast_2026.json', 'forecast', 'Frozen seat distribution + metadata'],
]

export function Data() {
  return (
    <Chapter id="data" num="02" title="Meet the data"
      kicker="Every input is public and free. Here is exactly where each number comes from, and what we had to fix."
      book={{ ch: 'Ch. 2', sections: ['Get the Data', 'Take a Quick Look at the Data Structure'] }}>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table className="data-table src-table" style={{ margin: 0 }}>
          <thead><tr><th style={{ paddingLeft: 18 }}>Dataset / API</th><th>What it gives us</th><th>How to get it</th><th>License</th></tr></thead>
          <tbody>{SOURCES.map((s) => (
            <tr key={s.name}>
              <td style={{ paddingLeft: 18 }}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></td>
              <td>{s.what}</td><td><code style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{s.how}</code></td><td>{s.license}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>
        Also used: the president's party for each year (public record) and Python 3.13 + pandas + scikit-learn. The site itself
        runs the exported models in your browser; there is no server and no tracking.
      </p>

      <div className="block">
        <h3>A peek at the training rows (2022)</h3>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead><tr><th style={{ paddingLeft: 18 }}>District</th><th className="num">Cook PVI</th><th>Held by</th><th className="num">Incumbent running</th><th className="num">Result (D−R)</th><th>Winner (label)</th></tr></thead>
            <tbody>{guide.sample.map((s) => (
              <tr key={s.district}>
                <td style={{ paddingLeft: 18 }} className="mono">{s.district}</td><td className="num">{lean(s.pvi)}</td>
                <td><PartyTag p={s.incParty as 'D' | 'R' | ''} /></td><td className="num">{s.incRunning ? 'yes' : 'no'}</td>
                <td className="num">{s.margin === null ? 'n/a' : lean(s.margin, 1)}</td><td><PartyTag p={s.winner as 'D' | 'R'} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div className="grid-4">
        <StatTile label="District races (2014–24)" value={q.rows} format={(v) => fmt(Math.round(v))} note="after dropping void races" />
        <StatTile label="Sources agree on winner" value={q.agree / q.checked} format={(v) => pct(v)} note={`${fmt(q.agree)} of ${fmt(q.checked)} cross-checked`} />
        <StatTile label="Uncontested races" value={q.uncontested} format={(v) => fmt(Math.round(v))} note="only one major party on the ballot" />
        <StatTile label="Open seats" value={q.openSeats} format={(v) => fmt(Math.round(v))} note="no incumbent on the ballot" />
      </div>

      <Callout kind="pitfall" title="Fusion voting fooled our first join">
        Our first cross-check labelled {q.disagreeBeforeFix} winners as third-party candidates, and Wikipedia disagreed with every one of them. All were in New York and Connecticut. Those states
        let one candidate run on several party lines (say Democratic + Working Families), and 538 stores each line as its own row.
        Our naive join took the first winning row, which was sometimes the minor-party line. Crediting all of a candidate's lines
        to their major party fixed every case, and agreement went to {pct(q.agree / q.checked)}. Always cross-check two independent sources when you can.
      </Callout>
      <Callout kind="concept" title="Why Cook PVI and not last election's House result">
        Nine states redrew their maps for 2026 (Alabama, California, Florida, Louisiana, North Carolina, Ohio, Tennessee, Texas,
        Utah). Last cycle's House margin describes the <em>old</em> district, so it would be a wrong feature for {guide.forecast.seatChange.newSeats} brand-new
        seats and many reshaped ones. Cook publishes PVI on the new lines, so the feature means the same thing in every year.
      </Callout>

      <ChartFrame title="Download the data" sub="The same files the pipeline reads, served straight from the repo's data/ folder.">
        <div className="grid-2" style={{ marginTop: 8 }}>
          {FILES.map(([name, dir, note]) => (
            <a key={name} className="card" href={name.includes('…') ? 'https://github.com/elmandalorian-thx/Midterms2026ML/tree/main/data/raw' : dataUrl(`${dir}/${name}`)}
              download={!name.includes('…') || undefined} style={{ textDecoration: 'none', padding: 16 }}>
              <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{name}</div>
              <div className="muted" style={{ fontSize: 13 }}>{note}</div>
            </a>
          ))}
        </div>
      </ChartFrame>
      <Code label="Show the Python (fetch + parse)" code={`
# ml/fetch_data.py  (run: .venv/bin/python ml/fetch_data.py)
url = "https://en.wikipedia.org/w/index.php?title=2026_United_States_House_of_Representatives_elections&action=raw"
text = get(url).decode("utf-8")          # raw wikitext, not HTML
rows = parse_page(text)                  # ml/wiki_tables.py: one dict per district
# {'district': 'AZ-1', 'pvi': -2.0, 'incParty': 'R', 'incumbents': [...], 'hasD': True, 'hasR': True, 'winner': None}

# Fusion voting: credit every ballot line to the candidate's major party
major = h[h.party != "O"].groupby(["cycle", "state_abbrev", "office_seat_name", "candidate_name"]).party.first()
`} />
    </Chapter>
  )
}
