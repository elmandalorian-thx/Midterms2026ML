# House 2026: a nonpartisan ML walkthrough

An interactive, visual machine-learning guide that forecasts every 2026 U.S. House race from public data, evaluates
itself on elections it never saw, **freezes its forecast before Election Day**, and then scores itself against the results.
Built as a companion to [PokemonML](https://github.com/elmandalorian-thx/PokemonML) and mapped to Géron's
*Hands-On Machine Learning* (3rd ed.). For learning only: not a prediction service, not advocacy.

## Live links

| Page | URL |
|---|---|
| 🔴 **Live results tracker** (election night + the count) | **https://elmandalorian-thx.github.io/Midterms2026ML/live/** |
| House ML walkthrough (10 chapters) | https://elmandalorian-thx.github.io/Midterms2026ML/ |
| Senate ML walkthrough (10 chapters) | https://elmandalorian-thx.github.io/Midterms2026ML/senate/ |
| Frozen pre-election forecasts (CSV) | [House](https://elmandalorian-thx.github.io/Midterms2026ML/data/forecast/forecast_2026.csv) · [Senate](https://elmandalorian-thx.github.io/Midterms2026ML/data/forecast/senate_forecast_2026.csv) |
| Code & data | https://github.com/elmandalorian-thx/Midterms2026ML |

### The live tracker

- **House / Senate / Congress tabs**: race to 218, race to 50 (Republicans, with the VP) / 51 (Democrats, with two allied independents), and a joint House × Senate control grid.
- **Scoreboard**: which candidate model predicts better (Brier, log loss, close races only) which generic-ballot average was closest to what the results imply, and how Kalshi and Polymarket (prices frozen before polls closed) did against the models on the same races.
- **Race to 218**: called seats per party, plus a projection for the uncalled ones.
- **Alert feed**: every call, every seat that **flips**, **upsets** against the frozen forecast, and milestones (50/100/200 called, a party reaching 218), with filters, optional browser notifications and sound.
- **Results-updated projection** (a Bayesian update): each call is evidence about the true national environment; uncalled seats are re-scored and the seat distribution re-simulated.
- **Live scorecard**: frozen forecast's hits/misses and Brier score on called races; a watchlist of the closest uncalled races.
- **Demo replay**: a clearly labeled simulated night, so you can see it work before races are called.

**Where the live data comes from:** the browser polls the free, CORS-enabled **Wikipedia API** (it checks the page's revision id first and downloads the
page only when it changed), and parses the ✓ winner marks editors add as networks call races. Backup: a GitHub Action re-fetched the results every
10 minutes on election night, committed `data/raw/districts_2026.csv`, rebuilt the Scorecard and redeployed.

**The exercise closed on Nov 4, 2026, 2:41 pm ET.** The tracker now shows the results as of that time (no polling), and both guides'
Chapter 09 plus the tracker's Scoreboard state the final findings. Paid, official-grade alternatives: **AP Elections API** and
**Decision Desk HQ API**; state election sites (often Clarity/Scytl ENR) publish free official counts in per-state formats.

**Highlights from the Senate guide**
- 203 contested Senate races (2014–2024); Wikipedia and 538 agree on every winner, and a state lean computed from presidential results matches Cook PVI (correlation 1.00).
- With ~34 races a year, one held-out accuracy number swings by ±15 points: the guide reports bootstrap intervals and Brier score instead.
- Borrowing strength from the House wins: a model pooled on House + Senate races (Brier 0.060) beats the Senate-only model (0.067) and gradient boosting (0.071), chosen by a rule written down before looking at 2026.
- Independents stand in for a party that has no nominee (NE, ID, SD), symmetrically.
- Frozen Senate forecast at the same D+9.2: P(Republican control) 49%, P(Democratic control) 50%, median 49 Republican seats (47–52). The House is near-certain; the Senate map makes it a coin flip.

**Highlights from the House guide**
- 2,600 district races (2014–2024) from two independent sources that agree on 100% of winners, after fixing a fusion-voting join bug in NY/CT.
- One-line rule "district lean decides" already gets ~97% of contested 2024 races. Models reach 96–97%, but only ~85% on the 80 competitive seats: report the hard subset.
- Leave-one-election-out: every year is ~96% except the 2018 wave (90%), when the model expected 205 Democratic seats and got 235.
- The national question is small data (14 elections): a straight line beats a random forest (7.9 vs. 11.6 seats of error).
- Party-swap check: negating every feature flips the answer to within ~1 point; training on swapped copies removes the gap at no cost.
- Frozen 2026 forecast (generic ballot D+9.2 two-party, ±3-point polling error): P(Democratic majority) 99%, median 243 D seats, 80% range 228–262. *Conditional on the polls*; slide the environment on the site to see other worlds.

## Datasets & APIs

See **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)** for the full table (URLs, keys, licenses, what each is used for). In short:

| Source | Access | Key |
|---|---|---|
| FiveThirtyEight `election-results` (House returns 1998–2024, CC BY 4.0) | raw GitHub CSV | no |
| Wikipedia House election pages 2014–2026 (Cook PVI, incumbents, candidates, winners, 2026 polling averages; CC BY-SA 4.0) | MediaWiki `action=raw` | no |
| FiftyPlusOne poll CSVs (optional) | `fiftyplusone.news/api/csv` | paid (from $100/mo) |
| MIT Election Lab House returns 1976–2024 (alternative) | Harvard Dataverse | guestbook |
| Census ACS by congressional district (extension) | `api.census.gov` | free |

## Run it

```bash
uv venv .venv && uv pip install --python .venv/bin/python -r ml/requirements.txt   # Windows: .venv/Scripts/python.exe
.venv/bin/python ml/fetch_data.py   # download 538 + Wikipedia -> data/raw/
.venv/bin/python ml/build.py        # train, evaluate, forecast (frozen once), export web/src/data/guide.json
.venv/bin/python ml/build_senate.py # Senate: evaluate, choose, forecast (written frozen only with --freeze), export web/src/data/senate.json
cd web && npm install && npm run dev
```

**After Election Day:** `.venv/bin/python ml/fetch_data.py --only 2026 && .venv/bin/python ml/build.py && .venv/bin/python ml/build_senate.py` pulls the winners and fills both
Scorecard chapters. The frozen forecast in `data/forecast/` is never overwritten.

**Notebook:** [`notebooks/midterms_2026_ml.ipynb`](notebooks/midterms_2026_ml.ipynb)
([open in Colab](https://colab.research.google.com/github/elmandalorian-thx/Midterms2026ML/blob/main/notebooks/midterms_2026_ml.ipynb)).

## How it stays neutral

- Every feature is signed (+ Democratic / − Republican); the site checks that swapping parties flips the prediction.
- No candidate ratings, endorsements or expert "lean" calls: results, Cook PVI, incumbency and the published polling average only.
- Settings chosen on 2022, scored once on 2024; the 2026 forecast was committed before results.
- Blue/red is only the media convention for identity; both colors pass the same contrast and colorblind checks.

## Credits

- **Created by** Juan Barahona ([github.com/elmandalorian-thx](https://github.com/elmandalorian-thx))
- **Data:** FiveThirtyEight `election-results` (CC BY 4.0); Wikipedia contributors (CC BY-SA 4.0); Cook Partisan Voting Index (The Cook Political Report); polling averages by Decision Desk HQ, FiftyPlusOne, NBC News, RealClearPolitics and Silver Bulletin.
- **Method:** Aurélien Géron, *Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow*, 3rd ed. (O'Reilly, 2022). Section titles only; no book text is reproduced.

Educational, non-commercial project. Not affiliated with any party, campaign or media organization.
