# Changelog

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
