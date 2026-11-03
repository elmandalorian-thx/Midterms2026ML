# House 2026: a nonpartisan ML walkthrough

An interactive, visual machine-learning guide that forecasts every 2026 U.S. House race from public data, evaluates
itself on elections it never saw, **freezes its forecast before Election Day**, and then scores itself against the results.
Built as a companion to [PokemonML](https://github.com/elmandalorian-thx/PokemonML) and mapped to Géron's
*Hands-On Machine Learning* (3rd ed.). For learning only: not a prediction service, not advocacy.

**Site:** https://elmandalorian-thx.github.io/Midterms2026ML/ (after the Pages workflow runs on `main`)

**Highlights from the data**
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
| FiftyPlusOne poll CSVs (optional) | `fiftyplusone.news/api/csv` | free |
| MIT Election Lab House returns 1976–2024 (alternative) | Harvard Dataverse | guestbook |
| Census ACS by congressional district (extension) | `api.census.gov` | free |

## Run it

```bash
uv venv .venv && uv pip install --python .venv/bin/python -r ml/requirements.txt   # Windows: .venv/Scripts/python.exe
.venv/bin/python ml/fetch_data.py   # download 538 + Wikipedia -> data/raw/
.venv/bin/python ml/build.py        # train, evaluate, forecast (frozen once), export web/src/data/guide.json
cd web && npm install && npm run dev
```

**After Election Day:** `.venv/bin/python ml/fetch_data.py --only 2026 && .venv/bin/python ml/build.py` pulls the winners and fills the
Scorecard chapter. The frozen forecast in `data/forecast/` is never overwritten.

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
