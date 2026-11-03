# Datasets, APIs and other inputs

Everything the project uses, how to get it, and what it is used for. All inputs are public.

| # | Source | What we take | Access / API | Key? | License | Used for |
|---|--------|--------------|--------------|------|---------|----------|
| 1 | [FiveThirtyEight election-results](https://github.com/fivethirtyeight/election-results) | Candidate-level U.S. House general-election returns 1998–2024 | `https://raw.githubusercontent.com/fivethirtyeight/election-results/main/election_results_house.csv` | no | CC BY 4.0 | vote margins, national House vote ("environment"), seats per year, cross-check of winners |
| 2 | [Wikipedia: <year> United States House of Representatives elections](https://en.wikipedia.org/wiki/2026_United_States_House_of_Representatives_elections) | Per-district tables 2014–2026: Cook PVI, incumbent + party, status (running / retiring / lost primary), candidates, winner | MediaWiki raw wikitext: `https://en.wikipedia.org/w/index.php?title=2026_United_States_House_of_Representatives_elections&action=raw` (send a descriptive User-Agent, pause between calls) | no | CC BY-SA 4.0 | features (pvi, inc, held), labels (winner), 2026 inputs, 2026 scoring |
| 3 | [Cook Partisan Voting Index](https://www.cookpolitical.com/cook-pvi) | District lean vs. the nation, from the two most recent presidential elections. 2026 values are on the redistricted lines | via the Wikipedia tables | no | The Cook Political Report | the main feature |
| 4 | Generic-ballot polling averages (Decision Desk HQ, FiftyPlusOne, NBC News, RealClearPolitics, Silver Bulletin) | Final 2026 Dem/Rep averages | Wikipedia 2026 page, section "Generic congressional ballot aggregate polls" (`<section begin="GenericBallotAgg"/>`) | no | CC BY-SA 4.0 (table) | the 2026 national environment input |
| 5 | [FiftyPlusOne poll files](https://fiftyplusone.news/readme) (optional) | Every 2026 generic-ballot poll (`generic.csv`), presidential approval, House/Senate/governor polls | `https://fiftyplusone.news/api/csv?api_key=KEY&filename=generic.csv` (set `FIFTYPLUSONE_API_KEY`) | free key | see their terms | extensions: your own polling average, approval as a feature |
| 6 | [MIT Election Data + Science Lab, U.S. House 1976–2024](https://electionlab.mit.edu/data) (alternative) | The standard academic House returns | Harvard Dataverse `doi:10.7910/DVN/IG0UN2` (download requires a short guestbook form) | form | CC0 | longer history if you want it |
| 7 | [U.S. Census ACS API](https://www.census.gov/data/developers/data-sets/acs-1year.html) (extension) | Demographics by congressional district | `https://api.census.gov/data/2024/acs/acs1?get=NAME,B01003_001E&for=congressional%20district:*&key=KEY` | free key | public domain | extra features |
| 8 | President's party by year | +1 / −1 per election 1998–2026 | public record, hard-coded in `ml/build.py` (`PRES_PARTY`) | — | — | midterm-penalty chart |

## Files in this repo

| File | Made by | Contents |
|------|---------|----------|
| `data/raw/districts_<year>.csv` | `ml/fetch_data.py` | one row per district: `district, state, pvi (+D/−R), inc_party, inc_running, inc_count, new_seat, has_d, has_r, n_cands, winner, inc_status` |
| `data/raw/house_results_538.csv` | `ml/fetch_data.py` | 538 general-election candidate rows 1998–2024 (trimmed columns) |
| `data/raw/generic_ballot_2026.json` | `ml/fetch_data.py` | polling-average rows + retrieval date |
| `data/forecast/forecast_2026.csv` | `ml/build.py` (first run only) | frozen pre-election P(Dem) per district, logistic + boosting |
| `data/forecast/forecast_2026.json` | `ml/build.py` (first run only) | frozen seat distribution, inputs, date |
| `web/src/data/guide.json` | `ml/build.py` | everything the site shows |

## Known caveats

- Nine states used new maps in 2026 (AL, CA, FL, LA, NC, OH, TN, TX, UT, per Wikipedia's *2025–2026 United States redistricting* article). The model uses Cook PVI on the new lines, never last cycle's House result.
- Louisiana's House general election is on December 12, 2026; California and other states count slowly. Score twice.
- The parser keeps ~99% of districts per year; a handful of rows with unusual formatting are skipped.
- Independent or third-party winners are dropped from training (none in 2014–2024 after the fusion fix).
