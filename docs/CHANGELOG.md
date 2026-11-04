# Changelog

## 2026-11-04 (exercise closed)

- Count closed at 2:41 pm ET (`COUNT_CLOSED` in `ml/build.py`); 10-min GitHub schedule removed and the Oracle-server trigger paused
- Findings computed in both builds (`score2026`): misses by direction, close-race accuracy, best-fit national environment with a likelihood interval, hindsight accuracy at that environment, Senate seats and control
- Score chapters (House + Senate) now state the findings; both Wrap chapters open with "What we learned"; every chapter ends with a Takeaway box
- Live tracker final mode: stops polling, replays the closing snapshot, "Final findings" panel on the Scoreboard (models, polling averages, markets, bottom line)

## 2026-11-03 (Senate)

- Prediction markets on the Scoreboard: `ml/fetch_markets.py` freezes Kalshi + Polymarket prices before polls close (`data/forecast/markets_2026.json`); `web/src/live/MarketsPanel.tsx` grades each market against the frozen model on the same races, plus chamber control and biggest model–market disagreements
- Shared site navigation (`web/src/components/SiteNav.tsx`): House guide / Senate guide / Live tracker switcher on every page, chapter track rail, mobile top bar + drawer; both guides use `GuideShell`
- Race cards: hover/tap explanations for lean, bar, now, frozen and tipping (`InfoTip`), plus a "How to read a race card" explainer with a per-race logistic-regression breakdown (`senateContrib`)
- Fix: Senate "now" probabilities computed exactly (the 0.25-point grid made "now" differ from "frozen" before any call)
- Live tracker Scoreboard tab (`web/src/lib/scoreboard.ts`, `web/src/live/Scoreboard.tsx`): every frozen House/Senate model graded on called races (all + close races, ties flagged), and each generic-ballot average vs. the national margin implied by results alone (flat prior)
- Senate pipeline: `ml/senate_tables.py` (Wikipedia Senate tables), 538 Senate + state presidential returns, `ml/build_senate.py` (computed state lean, leave-one-cycle-out with bootstrap CIs, House transfer, pooled House + Senate model chosen by a pre-registered rule, symmetric independent stand-in rule)
- Frozen Senate forecast `data/forecast/senate_forecast_2026.{csv,json}` committed before polls closed, with joint House × Senate control odds
- Live tracker: Senate and Congress tabs (race to 50/51, race cards, runoff detection, joint Bayesian nowcast from House + Senate calls)
- Separate 10-chapter Senate guide at `/senate/` (`web/senate/index.html`, `web/src/senate/`); linked from the House guide
- `Hemicycle` takes `rows`/`majorityText`/`pLabel`; `SeatHistogram` takes `majority`/`above`/`below`/`describe`; `.pbar` moved to shared CSS

## 2026-11-03 (evening)

- Live results tracker at `/live/`: polls the Wikipedia API (revision check first), race-to-218 bar, alert feed (calls, flips, upsets, milestones) with filters, browser notifications and sound, Bayesian nowcast of the national environment, re-simulated seat projection, live forecast record, watchlist, labeled demo replay
- Backup feed + scheduled GitHub Action (every 10 min until 2026-12-31): refresh 2026 results, rebuild, commit, redeploy
- Python parser also reads "Democratic/Republican hold/gain" status cells (same-party top-two races decided before Election Day)

## 2026-11-03 (Election Day)

- Initial project, modeled on PokemonML: Python pipeline (`ml/`), notebook, and a 10-chapter React guide (`web/`)
- Data: 538 `election-results` House returns (1998–2024) + Wikipedia district tables 2014–2026 (Cook PVI, incumbents, candidates, winners) + 2026 generic-ballot averages
- `ml/wiki_tables.py`: wikitext parser for the per-state district tables (handles unopposed rows, at-large seats, DFL, full-name `{{ushr}}`)
- Data cleaning: fusion voting (NY/CT) made 538's winning ballot line look third-party; candidates' lines are now credited to their major party (100% winner agreement with Wikipedia)
- Four signed features (pvi, env, inc, held); temporal split train 2014–20 / val 2022 / test 2024; logistic regression, depth-3 tree, gradient boosting
- Evaluation: accuracy inflation (uncontested/safe seats), random vs. temporal split, leave-one-election-out, calibration, depth and learning curves, ablation, party-swap neutrality check
- National small-data chapter: seats vs. votes 1998–2024, linear vs. random forest (leave-one-out), midterm penalty
- 2026 forecast frozen to `data/forecast/` before results; browser Monte Carlo with environment / polling-error sliders and a district explorer
- Scorecard chapter fills itself in after `ml/fetch_data.py --only 2026 && ml/build.py`
- Animated charts: hemicycle seat chart, year-by-year PVI scatter, live seat histogram, bars/lines that animate in on scroll
