# Midterms2026ML

Nonpartisan, visual ML walkthrough: forecast every 2026 U.S. House district from public data, evaluate on unseen
elections, freeze the forecast before Election Day, score it afterwards. Sister project of PokemonML (same structure).

## Deployment

| Item | Value |
|------|-------|
| Repo | `elmandalorian-thx/Midterms2026ML` (`main`) |
| Hosting | GitHub Pages via `.github/workflows/pages.yml` |
| URL | `https://elmandalorian-thx.github.io/Midterms2026ML/`; Vite `base` is `/Midterms2026ML/` |
| Env vars | optional `FIFTYPLUSONE_API_KEY` (fetch only) |

## Tech stack

| Layer | Tech |
|-------|------|
| ML | Python 3.13, pandas, scikit-learn (venv at `.venv`, created with `uv`) |
| Web | Vite + React 19 + TypeScript, hand-built SVG charts (no chart library) |

## Architecture & data flow

```
ml/fetch_data.py -> data/raw/districts_<2014..2026>.csv   (Wikipedia tables via ml/wiki_tables.py)
                 -> data/raw/house_results_538.csv          (538 returns)
                 -> data/raw/generic_ballot_2026.json       (polling averages)
                 -> data/external/ (wikitext cache, gitignored)
ml/build.py      -> web/src/data/guide.json                 (bundled: metrics, charts, models, 2026 districts)
                 -> data/forecast/forecast_2026.{csv,json}  (FROZEN: written once, never overwritten)
data/raw + data/forecast served at /data/raw|forecast/ by the projectData() plugin in web/vite.config.ts
web/src/lib/model.ts mirrors build.py features() + inference (logreg, depth-3 tree, GBM)
```

- **Every number in the UI comes from `guide.json`.** Never hard-code a metric; derive text from `guide`.
- **Feature parity:** `features()` in `ml/build.py` and `districtFeatures()` in `web/src/lib/model.ts` must match. `build.py` asserts the exported GBM reproduces sklearn.
- **Neutrality:** every feature is signed + Democratic / − Republican. Never add a feature that treats one party differently.
- **Never delete `data/forecast/`** after Election Day 2026; it is the pre-registered forecast the Scorecard grades.
- Theme: CSS variables in `web/src/index.css` (`--dem`, `--rep`, `--tossup` validated with the dataviz validator in both modes).

## Shared components

| File | What to reuse |
|------|---------------|
| `components/charts.tsx` | `ChartFrame` (animates children in on scroll), `BarList`, `DivergingBars`, `LineChart`, `Legend`, `Tooltip`, `useWidth` |
| `components/election.tsx` | `Hemicycle`, `YearScatter`, `SeatHistogram`, `TreeDiagram`, `YearBars` |
| `components/anim.tsx` | `useInView`, `useTween`, `CountUp`, `Reveal` (respect reduced motion) |
| `components/ui.tsx` | `Chapter` (with HOML `book` chips), `Callout` (concept/pitfall/result/try/fair), `Code`, `StatTile`, `PartyTag`, `probColor` |
| `lib/data.ts` | `guide`, `pct`, `fmt`, `lean`, `MAJORITY`, `dataUrl` |
| `lib/model.ts` | `districtFeatures`, `predict`, `logreg`, `tree`, `gbm`, `fixed`, `mulberry32`, `randn` |

## Checklist for a new metric/chapter

1. Compute it in `ml/build.py` and add it to `guide`. 2. Type it in `web/src/lib/types.ts`.
3. `.venv/bin/python ml/build.py` (~1 min). 4. Section in `web/src/sections/`, charts in `ChartFrame` with `table`.
5. New chapter: add to `CHAPTERS` in `App.tsx`. 6. `cd web && npx tsc -b && npm run build`; check light, dark and 390px.

## Guidelines

- Split by election year, never at random. Report competitive-seat accuracy and Brier, not just accuracy.
- Charts: thin marks, hairline grid, legend for 2+ series, hover tooltip, table view, no dual axes. Text never uses series colors.
- Cite Géron's HOML by chapter/section title only; never add book text.
- `docs/DATA_SOURCES.md` lists every input; update it when adding one.
