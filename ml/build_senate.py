"""Midterms 2026 ML pipeline, Senate edition: forecast every 2026 Senate race, then the chamber.

Same four signed features as the House (+ = Democratic side, - = Republican side), but the Senate is a
small-data problem (~35 races a cycle), so this script leans on honest small-sample evaluation:
leave-one-cycle-out, bootstrap error bars, and "borrowing strength" from 2,600 House races.

Reads data/raw/ (ml/fetch_data.py) and data/forecast/forecast_2026.* (the frozen House forecast, for the
joint House x Senate simulation). Writes:
  web/src/data/senate.json                    everything the /senate/ guide and the live tracker show
  data/forecast/senate_forecast_2026.csv      FROZEN race probabilities (written once, never overwritten)
  data/forecast/senate_forecast_2026.json     FROZEN chamber-control odds, tipping points, joint odds

Run:  .venv/bin/python ml/build_senate.py   (after ml/build.py)

Two sides per race. Normally that is the Democratic and the Republican nominee. When a major party has
no nominee, the leading independent stands in for that side (same rule for either party). For chamber
control every winner still counts as what they are: D, R, or an independent who caucuses with neither.
"""
from __future__ import annotations

import json
import sys
from datetime import date

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
from sklearn.tree import DecisionTreeClassifier

import build as H
from build import COUNT_CLOSED, SEED, SIGMA_ENV, LogReg, export_gbm, export_logreg, export_tree, gbm_raw, make_gbm, r

RAW, OUT_SRC, OUT_FC = H.RAW, H.OUT_SRC, H.OUT_FC
YEARS = [2014, 2016, 2018, 2020, 2022, 2024]
FEATURES = H.FEATURES  # same keys as the House so the browser model code is shared; here "pvi" = computed state lean
FEATURE_LABELS = {"pvi": "State lean (from presidential results)", "env": "National environment",
                  "inc": "Incumbent on ballot", "held": "Side holding the seat"}
N_SIMS = 20000
# The Senate going into the election (Wikipedia, "2026 United States Senate elections", Partisan composition).
# The two independents (Angus King, Bernie Sanders) caucus with the Democrats; neither seat is up in 2026.
BEFORE = {"R": 53, "D": 45, "I_caucusD": 2}
VP_PARTY = "R"  # the Vice President (JD Vance) breaks 50-50 ties: a rule about the office, applied as written
# 2026 races with no Democratic nominee, where Wikipedia's "Republican-held seats with independent challengers"
# section names the independent who is the main challenger. Fixed before the election; the rule is symmetric.
STAND_IN_2026 = {"NE": "Dan Osborn", "ID": "Todd Achilles", "SD": "Brian Bengs"}
SIGN = {"D": 1, "R": -1}


# ---------------------------------------------------------------- 1. load


def cands(s) -> list[tuple[str, str, bool]]:
    """'R+:Dan S. Sullivan;R:Dan J. Sullivan' -> [(party, name, has a Wikipedia article)]"""
    out = []
    for x in (str(s).split(";") if isinstance(s, str) else []):
        if ":" in x:
            q, n = x.split(":", 1)
            out.append((q[0], n, q.endswith("+")))
    return out


def last(name: str) -> str:
    parts = [p for p in name.replace(".", " ").split() if p.lower() not in ("jr", "sr", "ii", "iii")]
    return parts[-1].lower() if parts else ""


def state_lean() -> tuple[dict, dict]:
    """Cook-style lean from presidential results: 75% the latest election, 25% the one before, measured
    against the national result, in vote-share points (margin / 2). + = more Democratic than the nation."""
    p = pd.read_csv(RAW / "president_states_538.csv", low_memory=False)
    p["votes"] = pd.to_numeric(p.votes, errors="coerce").fillna(0)
    nominee = (p[p.ballot_party.isin(["DEM", "REP"])].groupby(["cycle", "ballot_party", "candidate_name"]).votes.sum()
               .reset_index().sort_values("votes").groupby(["cycle", "ballot_party"]).candidate_name.last())
    dev, pres_winner = {}, {}
    for cy in sorted(p.cycle.unique()):
        q = p[p.cycle == cy].groupby(["state_abbrev", "candidate_name"]).votes.sum()  # fusion lines summed by candidate
        dn, rn = nominee.get((cy, "DEM")), nominee.get((cy, "REP"))
        st = q.index.get_level_values(0).unique()
        dv = pd.Series({s: q.get((s, dn), 0.0) for s in st})
        rv = pd.Series({s: q.get((s, rn), 0.0) for s in st})
        nat = 100 * (dv.sum() - rv.sum()) / (dv.sum() + rv.sum())
        m = 100 * (dv - rv) / (dv + rv)
        dev[int(cy)] = (m - nat).to_dict()
        pres_winner[int(cy)] = {s: ("D" if v > 0 else "R") for s, v in m.items()}
    lean = {}
    for y in YEARS + [2026]:
        c1 = max(c for c in dev if c < y)
        lean[y] = {s: (0.75 * dev[c1][s] + 0.25 * dev[c1 - 4].get(s, dev[c1][s])) / 2 for s in dev[c1]}
    return lean, pres_winner


def results538() -> pd.DataFrame:
    """Candidate vote totals in each race's deciding round (runoff > general > jungle primary)."""
    s = pd.read_csv(RAW / "senate_results_538.csv", low_memory=False)
    s = s[s.cycle.isin(YEARS)].copy()
    s["sp"] = s.special.astype(str).str.lower().eq("true")
    s["race"] = s.state_abbrev + np.where(s.sp, "-S", "")
    s["rk"] = s.stage.map({"runoff": 0, "general": 1, "jungle primary": 2})
    s = s[s.rk == s.groupby(["cycle", "race"]).rk.transform("min")]
    s["votes"] = pd.to_numeric(s.votes, errors="coerce").fillna(0)
    s["won"] = s.winner.astype(str).str.lower().eq("true")
    c = s.dropna(subset=["candidate_name"]).groupby(["cycle", "race", "candidate_name"]).agg(
        votes=("votes", "sum"), won=("won", "any"),
        parties=("ballot_party", lambda x: "|".join(sorted(set(x.dropna()))))).reset_index()
    return c.rename(columns={"cycle": "year"})


def load_year(year: int) -> pd.DataFrame:
    d = pd.read_csv(RAW / f"senate_{year}.csv", keep_default_na=False, na_values=[""])
    d["year"] = year
    return d


def build_races(lean: dict, res: pd.DataFrame | None) -> pd.DataFrame:
    """One row per race with its two sides, features inputs, and (for past years) the two-side margin."""
    out = []
    years = sorted(set(YEARS + [2026]))
    for y in years:
        d = load_year(y)
        for a in d.itertuples():
            cs = cands(a.candidates)
            has = {p: [n for q, n, _ in cs if q == p] for p in ("D", "R", "I")}
            linked = {n for _, n, k in cs if k}
            rr = res[(res.year == y) & (res.race == a.race)] if res is not None and y in YEARS else None
            vote = {}
            if rr is not None and len(rr):
                for n in [n for _, n, _ in cs]:
                    hit = rr[rr.candidate_name.str.lower().str.contains(last(n), regex=False)]
                    if len(hit):
                        vote[n] = float(hit.votes.max())
            side = {}
            for p, other in (("D", "R"), ("R", "D")):
                if has[p]:
                    # nominee; if several share a party (top-two / top-four ballots): most votes, else the notable one
                    side[p] = max(has[p], key=lambda n: (vote.get(n, 0), n in linked))
                    side[p + "standin"] = False
                elif y == 2026 and p == "D" and a.state in STAND_IN_2026 and not a.special:
                    side[p], side[p + "standin"] = STAND_IN_2026[a.state], True
                elif y in YEARS and has["I"]:
                    lead = max(has["I"], key=lambda n: vote.get(n, 0))  # history: the independent who led the field
                    if vote.get(lead, 0) > 0 and lead not in side.values():
                        side[p], side[p + "standin"] = lead, True
            dname, rname = side.get("D"), side.get("R")
            # Incumbent: D/R, or an independent standing in for a side (Sanders in VT counts for the D side)
            inc_side = a.inc_party if a.inc_party in ("D", "R") else None
            if a.inc_party == "I" and a.inc_running:  # an independent incumbent who is the stand-in for a side
                inc_side = next((p for p in ("D", "R") if side.get(p + "standin")), None)
            win_side = None
            if isinstance(a.winner, str):
                if a.winner in ("D", "R") and (a.winner == "D" and not side.get("Dstandin") or a.winner == "R" and not side.get("Rstandin")):
                    win_side = a.winner
                elif a.winner_name and a.winner_name == dname:
                    win_side = "D"
                elif a.winner_name and a.winner_name == rname:
                    win_side = "R"
                else:
                    win_side = "X"  # a third candidate won (e.g. Angus King, with a Democratic nominee also running)
            dv, rv = vote.get(dname, np.nan) if dname else np.nan, vote.get(rname, np.nan) if rname else np.nan
            margin = 100 * (dv - rv) / (dv + rv) if dname and rname and dv + rv > 0 else np.nan
            w538 = None
            if rr is not None and len(rr) and rr.won.any():
                wn = rr[rr.won].sort_values("votes").candidate_name.iloc[-1].lower()
                w538 = "D" if dname and last(dname) in wn else "R" if rname and last(rname) in wn else "X"
            out.append({
                "year": y, "race": a.race, "state": a.state, "special": int(a.special),
                "lean": lean[y].get(a.state, np.nan), "pvi_cook": a.pvi_cook,
                "inc_party": a.inc_party if isinstance(a.inc_party, str) else None, "inc_side": inc_side,
                "inc_running": int(a.inc_running), "dName": dname, "rName": rname,
                "dStandin": bool(side.get("Dstandin")), "rStandin": bool(side.get("Rstandin")),
                "hasD": int(bool(dname)), "hasR": int(bool(rname)), "winner": a.winner if isinstance(a.winner, str) else None,
                "winnerName": a.winner_name if isinstance(a.winner_name, str) else None, "winSide": win_side,
                "margin": margin, "w538": w538, "status": a.status if isinstance(a.status, str) else "",
            })
    return pd.DataFrame(out)


def features(d: pd.DataFrame, env) -> pd.DataFrame:
    """Every feature is + for the Democratic side and - for the Republican side (mirrors web/src/lib/model.ts)."""
    f = pd.DataFrame(index=d.index)
    f["pvi"] = d.lean.astype(float)
    f["env"] = env
    side = d.inc_side.map(SIGN).fillna(0)
    f["inc"] = np.where(d.inc_running == 1, side, 0)
    f["held"] = side
    return f[FEATURES].astype(float)


def house_training():
    """The House rows build.py trains on (contested district-years), for transfer and pooling."""
    res = H.load_results()
    nat = H.national(res)
    env = dict(zip(nat.year, nat.env))
    d = pd.concat([H.load_districts(y) for y in H.YEARS], ignore_index=True)
    d = d[d.winner.isin(["D", "R"]) & (d.has_d == 1) & (d.has_r == 1)].reset_index(drop=True)
    return H.features(d, d.year.map(env)), (d.winner == "D").astype(int).values, d.year.values, env


def metrics(y, p) -> dict:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {"accuracy": r(accuracy_score(y, p >= 0.5)), "brier": r(brier_score_loss(y, p)), "logLoss": r(log_loss(y, p, labels=[0, 1]))}


def logit(p):
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return np.log(p / (1 - p))


# ---------------------------------------------------------------- 2. pipeline


def main() -> None:
    lean, pres_winner = state_lean()
    res = results538()
    Xh, yh, yrh, env_by_year = house_training()
    races = build_races(lean, res)
    past = races[races.year.isin(YEARS)].reset_index(drop=True)
    d = past[past.winSide.isin(["D", "R"]) & (past.hasD == 1) & (past.hasR == 1)].reset_index(drop=True)
    d["y"] = (d.winSide == "D").astype(int)
    X = features(d, d.year.map(env_by_year))

    # --- data quality
    chk = d.dropna(subset=["w538"])
    quality = {"races": int(len(past)), "contested": int(len(d)), "checked": int(len(chk)),
               "agree": int((chk.w538 == chk.winSide).sum()),
               "noOpponent": int(((past.hasD == 0) | (past.hasR == 0)).sum()),
               "thirdCandidateWon": int((past.winSide == "X").sum()),
               "standIns": [{"year": int(a.year), "race": a.race, "name": a.dName if a.dStandin else a.rName,
                             "side": "D" if a.dStandin else "R", "won": a.winSide == ("D" if a.dStandin else "R")}
                            for a in past[past.dStandin | past.rStandin].itertuples()],
               "marginMissing": int(d.margin.isna().sum())}
    lean26 = races[races.year == 2026]
    cook = lean26.dropna(subset=["pvi_cook"])
    quality["cookCheck"] = {"n": int(len(cook)), "corr": r(np.corrcoef(cook.lean, cook.pvi_cook)[0, 1], 3),
                            "mae": r((cook.lean - cook.pvi_cook).abs().mean(), 2),
                            "rows": [[a.state, r(a.lean, 1), r(a.pvi_cook, 1)] for a in cook.itertuples()]}

    # --- EDA
    dm = d.dropna(subset=["margin"])
    scatter = {str(y): [[r(a.lean, 1), r(a.margin, 1), int(a.y)] for a in dm[dm.year == y].itertuples()] for y in YEARS}
    drift = []
    for y in YEARS:
        s = dm[dm.year == y]
        slope = np.polyfit(s.lean, s.margin, 1)[0] if len(s) > 2 else np.nan
        resid = s.margin - (2 * s.lean + env_by_year[y])
        drift.append({"year": y, "n": int(len(s)), "corr": r(np.corrcoef(s.lean, s.margin)[0, 1], 3), "slope": r(slope, 2),
                      "residSd": r(resid.std(), 2), "env": r(env_by_year[y], 2)})
    straight = []
    for y in (2016, 2020, 2024):
        s = d[d.year == y]
        same = [(("D" if a.y else "R") == pres_winner[y].get(a.state)) for a in s.itertuples()]
        straight.append({"year": y, "n": len(same), "same": int(sum(same)), "share": r(np.mean(same))})
    dm = dm.assign(resid=dm.margin - (2 * dm.lean + dm.year.map(env_by_year)))
    over = dm.sort_values("resid")
    outliers = [{"year": int(a.year), "race": a.race, "dName": a.dName, "rName": a.rName, "dStandin": bool(a.dStandin),
                 "margin": r(a.margin, 1), "expected": r(2 * a.lean + env_by_year[a.year], 1), "resid": r(a.resid, 1),
                 "winner": "D" if a.y else "R"}
                for a in pd.concat([over.head(6), over.tail(6)]).itertuples()]
    inc_sign = X.loc[dm.index, "inc"]
    incumbency = [{"group": g, "n": int(m.sum()), "resid": r(dm.resid[m].mean(), 2)} for g, m in [
        ("Democratic-side incumbent", inc_sign == 1), ("Open seat", inc_sign == 0), ("Republican-side incumbent", inc_sign == -1)]]

    # --- Leave-one-cycle-out: every method scored on a year it never saw
    methods = {
        "lean": "State lean decides", "leanEnv": "Lean + national environment", "held": "Side holding the seat keeps it",
        "senate": "Logistic regression (Senate only)", "gbm": "Gradient boosting (Senate only)",
        "tree": "Decision tree, depth 3 (Senate only)", "house": "House model, transferred", "pooled": "Pooled House + Senate",
    }
    preds = {k: np.zeros(len(d)) for k in methods}
    for y in YEARS:
        te, tr = (d.year == y).values, (d.year != y).values
        hm = yrh != y
        Xte = X[te]
        preds["lean"][te] = np.where(Xte.pvi != 0, Xte.pvi > 0, Xte.held > 0).astype(float)
        preds["leanEnv"][te] = ((2 * Xte.pvi + Xte.env) > 0).astype(float)
        preds["held"][te] = np.where(Xte.held != 0, Xte.held > 0, Xte.pvi > 0).astype(float)
        preds["senate"][te] = LogReg().fit(X[tr], d.y[tr]).predict_proba(Xte)[:, 1]
        preds["gbm"][te] = make_gbm().fit(X[tr], d.y[tr]).predict_proba(Xte)[:, 1]
        preds["tree"][te] = DecisionTreeClassifier(max_depth=3, min_samples_leaf=5, random_state=SEED).fit(X[tr], d.y[tr]).predict_proba(Xte)[:, 1]
        preds["house"][te] = LogReg().fit(Xh[hm], yh[hm]).predict_proba(Xte)[:, 1]
        preds["pooled"][te] = LogReg().fit(pd.concat([Xh[hm], X[tr]]), np.concatenate([yh[hm], d.y[tr]])).predict_proba(Xte)[:, 1]
    yv = d.y.values
    loco = []
    for y in YEARS:
        m = (d.year == y).values
        row = {"year": y, "n": int(m.sum()), "env": r(env_by_year[y], 2)}
        for k in methods:
            row[k] = r(accuracy_score(yv[m], preds[k][m] >= 0.5))
        row["brierSenate"], row["brierHouse"] = r(brier_score_loss(yv[m], preds["senate"][m])), r(brier_score_loss(yv[m], preds["house"][m]))
        # How sure can we be about a ~30-race accuracy? Bootstrap the races.
        rng = np.random.default_rng(SEED + y)
        idx = np.where(m)[0]
        boots = [accuracy_score(yv[b], preds["senate"][b] >= 0.5) for b in (rng.choice(idx, len(idx)) for _ in range(2000))]
        row["ciLo"], row["ciHi"] = r(np.percentile(boots, 5)), r(np.percentile(boots, 95))
        row["seatsPred"] = r(preds["senate"][m].sum(), 1)
        row["seatsActual"] = int(yv[m].sum())
        loco.append(row)
    comp = (X.pvi.abs() <= 5).values
    summary = []
    for k, name in methods.items():
        prob = k in ("senate", "gbm", "tree", "house", "pooled")
        row = {"key": k, "name": name, "probabilistic": prob, "accuracy": r(accuracy_score(yv, preds[k] >= 0.5)),
               "competitiveAccuracy": r(accuracy_score(yv[comp], preds[k][comp] >= 0.5))}
        if prob:
            row.update({k2: v for k2, v in metrics(yv, preds[k]).items() if k2 != "accuracy"})
        summary.append(row)
    candidates = [s for s in summary if s["key"] in ("senate", "gbm", "house", "pooled")]
    chosen = min(candidates, key=lambda s: s["brier"])["key"]  # the pre-registered rule: lowest leave-one-cycle-out Brier

    # --- Learning curve: how many Senate races does the Senate-only model need? (scored leave-one-cycle-out)
    learning = []
    rng = np.random.default_rng(SEED)
    for n in [20, 40, 60, 90, 120, 150]:
        accs = []
        for y in YEARS:
            tr_idx = np.where((d.year != y).values)[0]
            te_m = (d.year == y).values
            for _ in range(4):
                sub = rng.choice(tr_idx, min(n, len(tr_idx)), replace=False)
                if len(set(yv[sub])) < 2:
                    continue
                accs.append(brier_score_loss(yv[te_m], LogReg().fit(X.iloc[sub], yv[sub]).predict_proba(X[te_m])[:, 1]))
        learning.append({"n": n, "brier": r(np.mean(accs))})
    house_brier = next(s["brier"] for s in summary if s["key"] == "house")
    calibration = {}  # held-out predictions, 5 bins: is a "70%" Senate race won about 70% of the time?
    for k in ("senate", "pooled"):
        bins = np.clip((preds[k] * 5).astype(int), 0, 4)
        calibration[k] = [{"bin": r((b + 0.5) / 5, 2), "predicted": r(preds[k][bins == b].mean()), "actual": r(yv[bins == b].mean()),
                           "n": int((bins == b).sum())} for b in range(5) if (bins == b).sum()]

    # --- Final models on every past race
    fit_senate = LogReg().fit(X, d.y)
    fit_house = LogReg().fit(Xh, yh)
    fit_pooled = LogReg().fit(pd.concat([Xh, X]), np.concatenate([yh, d.y]))
    fit_gbm = make_gbm().fit(X, d.y)
    fit_tree = DecisionTreeClassifier(max_depth=3, min_samples_leaf=5, random_state=SEED).fit(X, d.y)
    final = {"senate": fit_senate, "house": fit_house, "pooled": fit_pooled, "gbm": fit_gbm}[chosen]
    coefs = {}
    for k, m in [("senate", fit_senate), ("house", fit_house), ("pooled", fit_pooled)]:
        c = dict(zip(FEATURES, m.m.coef_[0] / m.sc.scale_))
        coefs[k] = {f: r(v / c["pvi"], 2) for f, v in c.items()}  # 1 unit of the feature = how many points of lean
    p_x, p_sw = fit_senate.predict_proba(X)[:, 1], fit_senate.predict_proba(-X)[:, 1]
    symmetry = {"logregGap": r(np.abs(p_x + p_sw - 1).mean()),
                "gbmGap": r(np.abs(fit_gbm.predict_proba(X)[:, 1] + fit_gbm.predict_proba(-X)[:, 1] - 1).mean())}

    # ---------------------------------------------------------- 3. the 2026 forecast
    gb = json.loads((RAW / "generic_ballot_2026.json").read_text())
    avg = next(a for a in gb["rows"] if a["source"].lower().startswith("average"))
    env26 = 100 * (avg["dem"] - avg["rep"]) / (avg["dem"] + avg["rep"])
    r26 = races[races.year == 2026].reset_index(drop=True)
    X26 = features(r26, env26)
    contested = ((r26.hasD == 1) & (r26.hasR == 1)).values
    fixed = np.where(r26.hasR == 0, 1.0, 0.0)

    def prob26(model, env):
        p = model.predict_proba(X26.assign(env=env))[:, 1]
        return np.where(contested, p, fixed)

    p26 = prob26(final, env26)
    p26_alt = {k: prob26(m, env26) for k, m in [("senate", fit_senate), ("house", fit_house), ("pooled", fit_pooled), ("gbm", fit_gbm)]}
    is_dem = (~r26.dStandin).values  # a Democratic-side win by an independent stand-in does not add a Democratic seat
    up = r26.inc_party.value_counts().to_dict()
    hold = {"R": BEFORE["R"] - up.get("R", 0), "D": BEFORE["D"] - up.get("D", 0), "I_caucusD": BEFORE["I_caucusD"]}
    assert min(hold.values()) >= 0 and sum(hold.values()) == 100 - len(r26), (hold, up)
    need_r = 50 - hold["R"]  # 50 + the VP's tie-break
    need_d = 51 - hold["D"] - hold["I_caucusD"]

    rng = np.random.default_rng(SEED)
    shifts = rng.normal(0, SIGMA_ENV, N_SIMS)
    grid = np.round(np.arange(-15, 15.001, 0.25), 2)
    lut = np.array([prob26(final, env26 + g) for g in grid])
    k = np.clip(np.round((shifts + 15) / 0.25).astype(int), 0, len(grid) - 1)
    P = lut[k]
    u = rng.random(P.shape)
    z = logit(P) - logit(u)  # latent margin: > 0 means the Democratic side wins (same draw as u < P)
    dwin = z > 0
    seats_r = hold["R"] + (~dwin).sum(1)
    seats_d = hold["D"] + hold["I_caucusD"] + (dwin & is_dem).sum(1)
    seats_i = (dwin & ~is_dem).sum(1)
    r_ctrl, d_ctrl = seats_r >= 50, seats_d >= 51
    none_ctrl = ~(r_ctrl | d_ctrl)
    # Tipping point: in each simulated election, the race that delivered the deciding seat
    tip = np.zeros(len(r26))
    order_r = np.argsort(z, axis=1)  # most Republican first
    zd = np.where(is_dem, z, -np.inf)
    order_d = np.argsort(-zd, axis=1)  # most Democratic first (Democratic nominees only)
    np.add.at(tip, order_r[r_ctrl, need_r - 1], 1)
    np.add.at(tip, order_d[d_ctrl, need_d - 1], 1)
    tip /= N_SIMS
    ctrl_curve = []
    for g in np.arange(-12, 12.01, 1.0):
        pp = lut[np.argmin(np.abs(grid - g))]
        uu = np.random.default_rng(SEED + 7).random((4000, len(r26)))
        w = uu < pp
        sr, sd = hold["R"] + (~w).sum(1), hold["D"] + hold["I_caucusD"] + (w & is_dem).sum(1)
        ctrl_curve.append({"env": r(env26 + g, 2), "pR": r((sr >= 50).mean()), "pD": r((sd >= 51).mean()), "seatsR": r(sr.mean(), 2)})

    # Joint with the House: the frozen House forecast re-scored at the same simulated environments
    hfc = pd.read_csv(OUT_FC / "forecast_2026.csv")
    hg = json.loads((OUT_SRC / "guide.json").read_text(encoding="utf-8"))["model"]["logreg"]
    b_env = hg["coef"][FEATURES.index("env")] / hg["scale"][FEATURES.index("env")]
    hp = hfc.p_dem_logreg.values
    open_h = (hp > 0) & (hp < 1)
    hz = np.where(open_h, logit(hp), 0)
    house_d = np.zeros(N_SIMS, dtype=int)
    hr = np.random.default_rng(SEED + 1)
    for i0 in range(0, N_SIMS, 2000):
        s = shifts[i0:i0 + 2000, None]
        ph = np.where(open_h, 1 / (1 + np.exp(-(hz + b_env * s))), hp)
        house_d[i0:i0 + 2000] = (hr.random(ph.shape) < ph).sum(1)
    h_dem = house_d >= 218
    joint = {f"{h}{s}": r(((h_dem if h == 'D' else ~h_dem) & m).mean())
             for h in "DR" for s, m in (("D", d_ctrl), ("R", r_ctrl), ("N", none_ctrl))}
    margH = {"D": r(h_dem.mean()), "R": r((~h_dem).mean())}
    margS = {"D": r(d_ctrl.mean()), "R": r(r_ctrl.mean()), "N": r(none_ctrl.mean())}
    independent = {f"{h}{s}": r(margH[h] * margS[s]) for h in "DR" for s in "DRN"}
    by_env = []  # conditional on the environment: why the two chambers move together
    for lo, hi in [(-99, -2), (-2, 2), (2, 99)]:
        m = (shifts >= lo) & (shifts < hi)
        by_env.append({"label": "Polls overstated Democrats" if lo < -50 else "Polls about right" if lo == -2 else "Polls understated Democrats",
                       "share": r(m.mean()), "pHouseD": r(h_dem[m].mean()), "pSenateR": r(r_ctrl[m].mean()),
                       "pSenateD": r(d_ctrl[m].mean())})

    hist_r = np.bincount(seats_r, minlength=101)
    summary26 = {
        "env": r(env26, 2), "sigmaEnv": SIGMA_ENV, "sims": N_SIMS, "model": chosen, "modelName": methods[chosen],
        "pRControl": r(r_ctrl.mean()), "pDControl": r(d_ctrl.mean()), "pNoMajority": r(none_ctrl.mean()),
        "medianSeatsR": int(np.median(seats_r)), "p10R": int(np.percentile(seats_r, 10)), "p90R": int(np.percentile(seats_r, 90)),
        "medianSeatsD": int(np.median(seats_d)), "meanIndependents": r(seats_i.mean(), 2),
        "hold": hold, "before": BEFORE, "needR": int(need_r), "needD": int(need_d), "vpParty": VP_PARTY,
        "joint": joint, "jointIfIndependent": independent, "houseD": margH["D"],
    }
    OUT_FC.mkdir(parents=True, exist_ok=True)
    fc_csv, fc_json = OUT_FC / "senate_forecast_2026.csv", OUT_FC / "senate_forecast_2026.json"
    freeze = "--freeze" in sys.argv
    if not fc_csv.exists() and not freeze:
        print("PREVIEW ONLY: no frozen Senate forecast yet (run with --freeze to commit one)")
    if not fc_csv.exists():  # frozen: never overwrite the pre-election forecast
        fc = r26[["race", "state", "special", "lean", "pvi_cook", "inc_party", "inc_running", "dName", "dStandin", "rName"]].copy()
        fc["lean"] = fc.lean.round(2)
        fc["p_dside"] = p26.round(4)
        for kk, v in p26_alt.items():
            fc[f"p_dside_{kk}"] = v.round(4)
        fc["p_tipping"] = tip.round(4)
        fc.to_csv(fc_csv if freeze else fc_csv.with_suffix(".preview.csv"), index=False)
        (fc_json if freeze else fc_json.with_suffix(".preview.json")).write_text(json.dumps({"frozenOn": date.today().isoformat(), **summary26, "genericBallot": avg,
                                       "standIns2026": STAND_IN_2026,
                                       "rule": "model chosen by lowest leave-one-cycle-out Brier score, 2014-2024"}, indent=1))
    if not fc_csv.exists():
        fc_csv, fc_json = fc_csv.with_suffix(".preview.csv"), fc_json.with_suffix(".preview.json")
    frozen = json.loads(fc_json.read_text())
    frozen_csv = pd.read_csv(fc_csv, keep_default_na=False, na_values=[""]).set_index("race")

    # Scorecard: filled in once ml/fetch_data.py --only 2026 brings the winners in
    score = None
    done = r26[r26.winSide.isin(["D", "R"])]
    if len(done):
        yy = (done.winSide == "D").astype(int).values
        pf = frozen_csv.p_dside.reindex(done.race).values
        score = {"called": int(len(done)), "dSide": int(yy.sum()), "rSide": int(len(yy) - yy.sum()),
                 "accuracy": r(accuracy_score(yy, pf >= 0.5)), "brier": r(brier_score_loss(yy, pf)),
                 "misses": [{"race": a.race, "p": r(p, 3), "winner": a.winSide} for a, p in zip(done.itertuples(), pf)
                            if (p >= 0.5) != (a.winSide == "D")]}
        # Findings at the close of the count (same definitions as the House build).
        cm = contested[done.index]
        yc, pc_ = yy[cm], pf[cm]
        Xc = X26.loc[done.index[cm]]
        env_grid = np.round(np.arange(-10, 30.001, 0.1), 1)
        ll = [np.sum(np.log(np.clip(np.where(yc == 1, q, 1 - q), 1e-9, 1)))
              for q in (final.predict_proba(Xc.assign(env=e))[:, 1] for e in env_grid)]
        best = float(env_grid[int(np.argmax(ll))])
        within = env_grid[np.array(ll) >= max(ll) - 1.92]
        p_best = final.predict_proba(Xc.assign(env=best))[:, 1]
        close = (done.lean.abs() <= 5).values[cm]
        miss = (pc_ >= 0.5) != (yc == 1)
        dem = ~done.dStandin.values
        seats = {"R": hold["R"] + int((done.winSide == "R").sum()),
                 "D": hold["D"] + hold["I_caucusD"] + int(((done.winSide == "D").values & dem).sum()),
                 "I": int(((done.winSide == "D").values & ~dem).sum())}
        score.update({
            "closedAt": COUNT_CLOSED, "uncalled": [a.race for a in r26.itertuples() if a.race not in set(done.race)],
            "seats": seats, "control": "R" if seats["R"] >= 50 else "D" if seats["D"] + seats["I"] >= 51 else None,
            "contested": int(cm.sum()), "missToD": int((miss & (yc == 1)).sum()), "missToR": int((miss & (yc == 0)).sum()),
            "closeN": int(close.sum()), "closeAccuracy": r(accuracy_score(yc[close], pc_[close] >= 0.5)) if close.any() else None,
            "impliedEnv": r(best, 1), "impliedLo": r(float(within.min()), 1), "impliedHi": r(float(within.max()), 1),
            "frozenEnv": r(frozen["env"], 2) if "env" in frozen else None,
            "hindsightAccuracy": r(accuracy_score(yc, p_best >= 0.5)), "hindsightBrier": r(brier_score_loss(yc, p_best)),
        })

    # --- Browser models (+ check the GBM export reproduces sklearn)
    g_exp = export_gbm(fit_gbm)
    raw_sk = fit_gbm.decision_function(X26)
    raw_js = [gbm_raw(g_exp["trees"], g_exp["init"], g_exp["lr"], row) for row in X26.to_dict("records")]
    assert np.allclose(raw_sk, raw_js, atol=1e-6), "GBM export mismatch"
    lr_models = {"senate": export_logreg(fit_senate), "house": export_logreg(fit_house), "pooled": export_logreg(fit_pooled)}

    def name_of(n, standin):
        return None if not isinstance(n, str) else n + (" (I)" if standin else "")

    races26 = [{
        "id": a.race, "state": a.state, "special": int(a.special), "lean": r(a.lean, 2),
        "cook": None if pd.isna(a.pvi_cook) else r(a.pvi_cook, 1),
        "incParty": a.inc_party, "incSide": a.inc_side, "incRunning": int(a.inc_running),
        "dName": name_of(a.dName, a.dStandin), "rName": name_of(a.rName, a.rStandin), "dStandin": int(a.dStandin),
        "hasD": int(a.hasD), "hasR": int(a.hasR), "status": a.status,
        "pFrozen": r(frozen_csv.p_dside.get(a.race, np.nan), 4), "pTipping": r(frozen_csv.p_tipping.get(a.race, np.nan), 4),
        "winSide": a.winSide if isinstance(a.winSide, str) else None,
        "winnerName": a.winnerName if isinstance(a.winnerName, str) else None,
    } for a in r26.itertuples()]

    senate = {
        "built": date.today().isoformat(),
        "counts": {"races": int(len(past)), "contested": int(len(d)), "years": YEARS, "houseRows": int(len(Xh)),
                   "perYear": {str(y): int((d.year == y).sum()) for y in YEARS}},
        "quality": quality, "scatter": scatter, "drift": drift, "straightTicket": straight, "outliers": outliers,
        "incumbency": incumbency, "envByYear": {str(k): r(v, 2) for k, v in env_by_year.items()},
        "loco": loco, "summary": summary, "chosen": chosen, "calibration": calibration, "learning": learning, "houseBrier": house_brier,
        "effects": coefs, "symmetry": symmetry,
        "features": [{"key": f, "label": FEATURE_LABELS[f]} for f in FEATURES],
        "forecast": {**summary26, "frozen": frozen, "hist": hist_r.tolist(), "ctrlCurve": ctrl_curve, "byEnv": by_env,
                     "genericBallot": gb, "houseEnvSlope": r(b_env, 5)},
        "score2026": score,
        "model": {"logreg": lr_models, "gbm": g_exp, "tree": export_tree(fit_tree, FEATURES, with_counts=True)},
        "races": races26,
    }
    # allow_nan=False: NaN is not valid JSON and would break the TypeScript import
    (OUT_SRC / "senate.json").write_text(json.dumps(senate, separators=(",", ":"), allow_nan=False), encoding="utf-8")

    print("quality", {k: v for k, v in quality.items() if k not in ("standIns", "cookCheck")}, "cook", {k: v for k, v in quality["cookCheck"].items() if k != "rows"})
    print("stand-ins", [(s["year"], s["race"], s["name"], s["won"]) for s in quality["standIns"]])
    print("drift", drift)
    print("straight", straight)
    print("summary"); [print("  ", s) for s in summary]
    print("chosen", chosen, "learning", learning)
    print("calibration", calibration)
    print("effects", coefs, "symmetry", symmetry)
    print("2026", {k: v for k, v in summary26.items() if k not in ("joint", "jointIfIndependent")})
    print("joint", joint, "\nindep", independent, "\nbyEnv", by_env)
    print("tipping", sorted([(a["id"], a["pTipping"], a["pFrozen"]) for a in races26], key=lambda t: -t[1])[:8])
    print("races", [(a["id"], a["pFrozen"]) for a in races26])


if __name__ == "__main__":
    main()
