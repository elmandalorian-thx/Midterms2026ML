"""Midterms 2026 ML pipeline: district-level House forecasting, built for learning.

Reads data/raw/ (made by ml/fetch_data.py), trains and evaluates every model shown in the guide,
and exports JSON for the web app:
  web/src/data/guide.json           metrics, chart data, exported models, 2026 districts (bundled)
  data/forecast/forecast_2026.csv   frozen pre-election district probabilities (committed, then scored)
  data/forecast/forecast_2026.json  frozen seat distribution + metadata

Run:  .venv/bin/python ml/build.py
Neutrality rule: every feature is signed (+ = Democratic, - = Republican) so swapping the parties
flips the input. Nothing in the pipeline treats one party differently from the other.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, confusion_matrix, log_loss, roc_auc_score, roc_curve
from sklearn.model_selection import LeaveOneOut, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_SRC = ROOT / "web" / "src" / "data"
OUT_FC = ROOT / "data" / "forecast"
SEED = 42
YEARS = [2014, 2016, 2018, 2020, 2022, 2024]
TRAIN_YEARS, VAL_YEAR, TEST_YEAR = [2014, 2016, 2018, 2020], 2022, 2024
# President's party going into each election (+1 Democratic, -1 Republican). Public record.
PRES_PARTY = {1998: 1, 2000: 1, 2002: -1, 2004: -1, 2006: -1, 2008: -1, 2010: 1, 2012: 1, 2014: 1, 2016: 1,
              2018: -1, 2020: -1, 2022: 1, 2024: 1, 2026: -1}
SIGMA_ENV = 3.0  # assumed s.d. (points of margin) of the gap between the final generic-ballot average and the real vote
N_SIMS = 20000

FEATURES = ["pvi", "env", "inc", "held"]
FEATURE_LABELS = {"pvi": "Cook PVI (district lean)", "env": "National environment", "inc": "Incumbent on ballot",
                  "held": "Party holding the seat"}

# ---------------------------------------------------------------- 1. load


def r(x, n=4):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)


def load_districts(year: int) -> pd.DataFrame:
    d = pd.read_csv(RAW / f"districts_{year}.csv", keep_default_na=False, na_values=[""])
    d["year"] = year
    return d


def load_results() -> pd.DataFrame:
    """Two-party House vote by district-year from 538 (DEM/DFL vs REP ballot lines)."""
    h = pd.read_csv(RAW / "house_results_538.csv", low_memory=False)
    h = h[~h.state_abbrev.isin(["PR", "GU", "VI", "AS", "MP", "DC"])]  # voting members only
    h["party"] = np.where(h.ballot_party.isin(["DEM", "DFL"]), "D", np.where(h.ballot_party == "REP", "R", "O"))
    # Fusion voting (NY, CT): one candidate appears on several lines (e.g. DEM + Working Families).
    # Credit all of a candidate's lines to their major party, or the winner looks like a third party.
    major = h[h.party != "O"].groupby(["cycle", "state_abbrev", "office_seat_name", "candidate_name"]).party.first()
    key = list(zip(h.cycle, h.state_abbrev, h.office_seat_name, h.candidate_name))
    fused = [major.get(k) is not None and p == "O" for k, p in zip(key, h.party)]
    raw_w = h[h.winner.astype(str).str.lower() == "true"]
    load_results.raw_winner = raw_w.assign(rawParty=raw_w.party)[["cycle", "state_abbrev", "office_seat_name", "rawParty"]]
    load_results.fusion_fixed = int((np.array(fused) & (h.winner.astype(str).str.lower() == "true").values).sum())
    h["party"] = [major.get(k, p) for k, p in zip(key, h.party)]
    single = h.groupby(["cycle", "state_abbrev"]).office_seat_name.transform("nunique") == 1
    num = h.office_seat_name.str.extract(r"(\d+)")[0]
    h["district"] = h.state_abbrev + "-" + np.where(single, "AL", num.fillna("0").astype(int).astype(str))
    v = h[h.party != "O"].pivot_table(index=["cycle", "district"], columns="party", values="votes", aggfunc="sum").fillna(0)
    v = v.reset_index().rename(columns={"cycle": "year", "D": "votesD", "R": "votesR"})
    two = v.votesD + v.votesR
    v["margin"] = np.where((v.votesD > 0) & (v.votesR > 0), 100 * (v.votesD - v.votesR) / two.replace(0, 1), np.nan)
    w = h[h.winner.astype(str).str.lower() == "true"].groupby(["cycle", "district"]).party.first()
    v["winner538"] = [w.get((y, d)) for y, d in zip(v.year, v.district)]
    return v


def national(res: pd.DataFrame) -> pd.DataFrame:
    """National two-party House vote margin and seats per cycle (D minus R, in points)."""
    g = res.groupby("year").agg(votesD=("votesD", "sum"), votesR=("votesR", "sum"),
                                seatsD=("winner538", lambda s: (s == "D").sum()),
                                seatsR=("winner538", lambda s: (s == "R").sum())).reset_index()
    g["env"] = 100 * (g.votesD - g.votesR) / (g.votesD + g.votesR)
    g["seatShare"] = g.seatsD / (g.seatsD + g.seatsR)
    g["presParty"] = g.year.map(PRES_PARTY)
    g["midterm"] = (g.year % 4 == 2).astype(int)
    return g


def features(d: pd.DataFrame, env: pd.Series | float) -> pd.DataFrame:
    """Every feature is + for Democrats and - for Republicans."""
    sign = {"D": 1, "R": -1}
    f = pd.DataFrame(index=d.index)
    f["pvi"] = d.pvi.astype(float)
    f["env"] = env
    f["inc"] = np.where(d.inc_running == 1, d.inc_party.map(sign).fillna(0), 0)
    f["held"] = d.inc_party.map(sign).fillna(0)
    return f[FEATURES].astype(float)


# ---------------------------------------------------------------- 2. model helpers


def make_gbm():
    return GradientBoostingClassifier(n_estimators=150, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=SEED)


class LogReg:
    """Standardize + logistic regression, with access to raw-scale pieces for the browser."""

    def __init__(self, C=1.0):
        self.sc, self.m = StandardScaler(), LogisticRegression(C=C, max_iter=5000)

    def fit(self, X, y):
        self.m.fit(self.sc.fit_transform(X), y)
        return self

    def predict_proba(self, X):
        return self.m.predict_proba(self.sc.transform(X))

    def score(self, X, y):
        return accuracy_score(y, self.predict_proba(X)[:, 1] >= 0.5)


def evaluate(model, X, y) -> dict:
    p = np.clip(model.predict_proba(X)[:, 1], 1e-6, 1 - 1e-6)
    return {"accuracy": r(accuracy_score(y, p >= 0.5)), "logLoss": r(log_loss(y, p, labels=[0, 1])),
            "brier": r(brier_score_loss(y, p)), "auc": r(roc_auc_score(y, p)) if len(set(y)) > 1 else None}


def export_tree(tree, names, with_counts=False) -> list[dict]:
    t = tree.tree_
    nodes = []
    for i in range(t.node_count):
        leaf = t.children_left[i] == -1
        n = {"l": int(t.children_left[i]), "r": int(t.children_right[i])}
        if not leaf:
            n["f"] = names[t.feature[i]]
            n["t"] = float(t.threshold[i])  # exact: rounding flips decisions on boundary values
        if with_counts:
            v = t.value[i][0]
            n["n"] = int(t.n_node_samples[i])
            n["p"] = r(v[1] / v.sum())
        elif leaf:
            n["v"] = r(t.value[i][0][0], 6)
        nodes.append(n)
    return nodes


def gbm_raw(trees, init, lr, x: dict) -> float:
    s = init
    for nodes in trees:
        i = 0
        while nodes[i]["l"] != -1:
            i = nodes[i]["l"] if x[nodes[i]["f"]] <= nodes[i]["t"] else nodes[i]["r"]
        s += lr * nodes[i]["v"]
    return s


def export_gbm(g) -> dict:
    trees = [export_tree(e[0], FEATURES) for e in g.estimators_]
    prior = g.init_.class_prior_[1]
    return {"init": float(np.log(prior / (1 - prior))), "lr": g.learning_rate, "trees": trees}


def export_logreg(m: LogReg) -> dict:
    return {"mean": m.sc.mean_.round(6).tolist(), "scale": m.sc.scale_.round(6).tolist(),
            "coef": m.m.coef_[0].round(6).tolist(), "intercept": r(m.m.intercept_[0], 6)}


# ---------------------------------------------------------------- 3. pipeline


def main() -> None:
    res = load_results()
    nat = national(res)
    env_by_year = dict(zip(nat.year, nat.env))

    frames = []
    for y in YEARS:
        d = load_districts(y).merge(res[res.year == y][["district", "margin", "votesD", "votesR", "winner538"]],
                                    on="district", how="left")
        frames.append(d)
    d = pd.concat(frames, ignore_index=True)
    d = d[d.winner.isin(["D", "R"])].reset_index(drop=True)  # drop the few independent wins / void races
    d["y"] = (d.winner == "D").astype(int)
    d["contested"] = ((d.has_d == 1) & (d.has_r == 1)).astype(int)
    X_all = features(d, d.year.map(env_by_year))

    # --- data quality: do the two independent sources agree on who won?
    both = d.dropna(subset=["winner538"])
    # Before the fusion fix, how many winners did the two sources disagree on?
    rw = load_results.raw_winner.groupby(["cycle", "state_abbrev", "office_seat_name"]).rawParty.first()  # naive join: first winning row
    fused_dis = int(sum(1 for (cy, st, seat), p in rw.items() if p == "O" and cy in YEARS))
    quality = {"rows": int(len(d)), "checked": int(len(both)), "agree": int((both.winner == both.winner538).sum()),
               "disagreeBeforeFix": fused_dis,
               "uncontested": int((d.contested == 0).sum()), "openSeats": int((X_all.inc == 0).sum()),
               "fusionFixed": load_results.fusion_fixed, "partiesOther": int((pd.concat([load_districts(y) for y in YEARS]).winner.isin(["O"])).sum())}

    # --- EDA
    c = d[d.contested == 1]
    scatter = {}
    for y in YEARS:
        s = c[(c.year == y) & c.margin.notna()]
        scatter[str(y)] = [[r(p, 1), r(m, 1), int(w)] for p, m, w in zip(s.pvi, s.margin, s.y)]
    # Incumbency: how far does the result beat what lean + environment alone imply?
    cm_ = c[c.margin.notna()].copy()
    cm_["expected"] = 2 * cm_.pvi + cm_.year.map(env_by_year)
    cm_["resid"] = cm_.margin - cm_.expected
    inc_sign = features(cm_, 0).inc
    incumbency = [{"group": g, "n": int(m.sum()), "resid": r(cm_.resid[m].mean(), 2)} for g, m in [
        ("Democratic incumbent", inc_sign == 1), ("Open seat", inc_sign == 0), ("Republican incumbent", inc_sign == -1)]]
    reelect = {str(y): r(d[(d.year == y) & (d.inc_running == 1)].pipe(lambda t: (t.inc_party == t.winner).mean())) for y in YEARS}
    pvi_bins = []
    for lo in range(-30, 30, 5):
        m = (d.pvi >= lo) & (d.pvi < lo + 5) & (d.contested == 1)
        if m.sum():
            pvi_bins.append({"lo": lo, "hi": lo + 5, "n": int(m.sum()), "demWin": r(d.y[m].mean())})
    safe_share = r((d.pvi.abs() > 10).mean())

    # --- National small-data problem: seats vs votes, 1998-2024
    loo = LeaveOneOut()
    Xn, yn = nat[["env"]].values, nat.seatShare.values
    preds_lin, preds_rf = np.zeros(len(nat)), np.zeros(len(nat))
    for tr, te in loo.split(Xn):
        preds_lin[te] = LinearRegression().fit(Xn[tr], yn[tr]).predict(Xn[te])
        preds_rf[te] = RandomForestRegressor(200, random_state=SEED).fit(Xn[tr], yn[tr]).predict(Xn[te])
    lin_all = LinearRegression().fit(Xn, yn)
    mid = nat[(nat.midterm == 1) & (nat.year - 2).isin(nat.year)].copy()
    prev = {y: e for y, e in zip(nat.year, nat.env)}
    mid["presSwing"] = [(e - prev[y - 2]) * pp for y, e, pp in zip(mid.year, mid.env, mid.presParty)]
    national_out = {
        "rows": [{"year": int(a.year), "env": r(a.env, 2), "seatsD": int(a.seatsD), "seatsR": int(a.seatsR),
                  "seatShare": r(a.seatShare), "midterm": int(a.midterm), "presParty": int(a.presParty),
                  "looLinear": r(pl), "looForest": r(pf)}
                 for a, pl, pf in zip(nat.itertuples(), preds_lin, preds_rf)],
        "linear": {"intercept": r(lin_all.intercept_), "slope": r(lin_all.coef_[0], 5)},
        "maeLinearSeats": r(np.abs(preds_lin - yn).mean() * 435, 1),
        "maeForestSeats": r(np.abs(preds_rf - yn).mean() * 435, 1),
        "midtermSwing": [{"year": int(a.year), "swing": r(a.presSwing, 2), "presParty": int(a.presParty)} for a in mid.itertuples()],
    }

    # --- Splits: by TIME. Train on 2014-2020, tune on 2022, final exam on 2024.
    tr, va, te = d.year.isin(TRAIN_YEARS), d.year == VAL_YEAR, d.year == TEST_YEAR
    con = d.contested == 1
    Xtr, ytr = X_all[tr & con], d.y[tr & con].values
    Xva, yva = X_all[va & con], d.y[va & con].values
    Xte, yte = X_all[te & con], d.y[te & con].values
    trva = (tr | va) & con

    def rule(pred, mask):
        return r(accuracy_score(d.y[mask], pred[mask]))

    held_pred = np.where(X_all.held != 0, X_all.held > 0, X_all.pvi > 0).astype(int)
    pvi_pred = np.where(X_all.pvi != 0, X_all.pvi > 0, X_all.held > 0).astype(int)
    lean_env = 2 * X_all.pvi + X_all.env
    baselines = [
        {"name": "Always pick Republican", "accuracy": r((yte == 0).mean())},
        {"name": "Always pick Democrat", "accuracy": r((yte == 1).mean())},
        {"name": "Party holding the seat keeps it", "accuracy": rule(held_pred, te & con)},
        {"name": "District lean (PVI) decides", "accuracy": rule(pvi_pred, te & con)},
        {"name": "Lean + national environment", "accuracy": rule((lean_env > 0).astype(int), te & con)},
    ]

    # --- Hyper-parameter choice on the validation year (never on the test year)
    tuning = []
    for C in [0.01, 0.1, 1, 10]:
        tuning.append({"model": "logreg", "param": f"C={C}", "val": r(LogReg(C).fit(Xtr, ytr).score(Xva, yva))})
    for dpt in [1, 2, 3, 4]:
        g = GradientBoostingClassifier(n_estimators=150, max_depth=dpt, learning_rate=0.05, subsample=0.8, random_state=SEED)
        tuning.append({"model": "gbm", "param": f"depth={dpt}", "val": r(g.fit(Xtr, ytr).score(Xva, yva))})

    # Refit on train + validation, score once on the 2024 test year
    lr_m = LogReg().fit(X_all[trva], d.y[trva])
    tree3 = DecisionTreeClassifier(max_depth=3, min_samples_leaf=20, random_state=SEED).fit(X_all[trva], d.y[trva])
    gbm = make_gbm().fit(X_all[trva], d.y[trva])
    est = {"logreg": lr_m, "tree": tree3, "gbm": gbm}
    names = {"logreg": "Logistic regression", "tree": "Decision tree (depth 3)", "gbm": "Gradient boosting"}
    models = []
    for k, m in est.items():
        row = {"key": k, "name": names[k], **evaluate(m, Xte, yte),
               "trainAccuracy": r(accuracy_score(d.y[trva], m.predict_proba(X_all[trva])[:, 1] >= 0.5))}
        comp = (Xte.pvi.abs() <= 5).values
        row["competitiveAccuracy"] = r(accuracy_score(yte[comp], m.predict_proba(Xte[comp])[:, 1] >= 0.5))
        models.append(row)
    comp_n = int((Xte.pvi.abs() <= 5).sum())

    p_te = lr_m.predict_proba(Xte)[:, 1]
    confusion = confusion_matrix(yte, p_te >= 0.5).tolist()
    fpr, tpr, _ = roc_curve(yte, p_te)
    roc = [{"fpr": r(a, 3), "tpr": r(b, 3)} for a, b in zip(fpr, tpr)]

    # Accuracy looks great because most seats are safe. Count the free points.
    with_uncontested = r(accuracy_score(d.y[te], lr_m.predict_proba(X_all[te])[:, 1] >= 0.5))
    inflation = {"contestedOnly": models[0]["accuracy"], "withUncontested": with_uncontested,
                 "competitiveOnly": models[0]["competitiveAccuracy"], "competitiveN": comp_n,
                 "safeShare": safe_share}

    # --- Leave-one-cycle-out: how does each method do on a year it never saw?
    loco, pooled = [], []
    for y in YEARS:
        trm, tem = (d.year != y) & con, (d.year == y) & con
        row = {"year": y, "n": int(tem.sum()), "env": r(env_by_year[y], 2)}
        for k, mk in [("logreg", LogReg), ("gbm", make_gbm)]:
            m = mk().fit(X_all[trm], d.y[trm])
            p = m.predict_proba(X_all[tem])[:, 1]
            row[k] = r(accuracy_score(d.y[tem], p >= 0.5))
            if k == "logreg":
                pooled.append(pd.DataFrame({"p": p, "y": d.y[tem].values, "pvi": X_all.pvi[tem].values}))
        nofeat = [f for f in FEATURES if f != "env"]
        m = LogReg().fit(X_all.loc[trm, nofeat], d.y[trm])
        row["logregNoEnv"] = r(m.score(X_all.loc[tem, nofeat], d.y[tem]))
        # Seats: predicted vs actual (contested + uncontested)
        allm = d.year == y
        row["seatsPred"] = int(round(LogReg().fit(X_all[trm], d.y[trm]).predict_proba(X_all[allm])[:, 1].sum()))
        row["seatsActual"] = int(d.y[allm].sum())
        loco.append(row)
    pool = pd.concat(pooled, ignore_index=True)
    bins = np.linspace(0, 1, 11)
    which = np.clip(np.digitize(pool.p, bins) - 1, 0, 9)
    calibration = [{"bin": r((bins[i] + bins[i + 1]) / 2, 2), "predicted": r(pool.p[which == i].mean()),
                    "actual": r(pool.y[which == i].mean()), "n": int((which == i).sum())}
                   for i in range(10) if (which == i).sum() > 0]

    # --- Pitfall: a random split mixes years, so the model "knows" each year's environment
    idx = np.where(con)[0]
    i_tr, i_te = train_test_split(idx, test_size=0.2, random_state=SEED, stratify=d.y[idx])
    rnd = make_gbm().fit(X_all.iloc[i_tr], d.y[i_tr])
    split_pitfall = {"random": r(rnd.score(X_all.iloc[i_te], d.y[i_te])), "temporal": models[2]["accuracy"]}

    # --- Overfitting: tree depth
    depth_curve = []
    for dpt in [1, 2, 3, 4, 5, 6, 8, 10, 14, None]:
        t = DecisionTreeClassifier(max_depth=dpt, random_state=SEED).fit(Xtr, ytr)
        depth_curve.append({"depth": dpt or t.get_depth(), "unlimited": dpt is None,
                            "train": r(t.score(Xtr, ytr)), "val": r(t.score(Xva, yva))})

    # --- Learning curve
    rng = np.random.default_rng(SEED)
    Xtv, ytv = X_all[trva].reset_index(drop=True), d.y[trva].values
    learning = []
    for n in [25, 50, 100, 200, 400, 800, len(Xtv)]:
        accs = {"logreg": [], "gbm": []}
        for rep in range(5):
            sub = rng.choice(len(Xtv), n, replace=False)
            if len(set(ytv[sub])) < 2:
                continue
            accs["logreg"].append(LogReg().fit(Xtv.iloc[sub], ytv[sub]).score(Xte, yte))
            accs["gbm"].append(make_gbm().fit(Xtv.iloc[sub], ytv[sub]).score(Xte, yte))
        learning.append({"n": n, "logreg": r(np.mean(accs["logreg"])), "gbm": r(np.mean(accs["gbm"]))})

    # --- Feature effects: logistic coefficients in "points of PVI" + ablation
    coef = dict(zip(FEATURES, lr_m.m.coef_[0] / lr_m.sc.scale_))
    effects = {k: r(v / coef["pvi"], 2) for k, v in coef.items()}  # 1 unit of feature = how many PVI points
    ablation = []
    for name, cols in [("PVI only", ["pvi"]), ("PVI + environment", ["pvi", "env"]),
                       ("PVI + incumbency", ["pvi", "inc", "held"]), ("All four features", FEATURES)]:
        accs = []
        for y in YEARS:
            trm, tem = (d.year != y) & con, (d.year == y) & con
            accs.append(LogReg().fit(X_all.loc[trm, cols], d.y[trm]).score(X_all.loc[tem, cols], d.y[tem]))
        ablation.append({"name": name, "accuracy": r(np.mean(accs))})

    # --- Neutrality check: swap the parties (negate every feature). Does P(D) become P(R)?
    p_x = lr_m.predict_proba(Xte)[:, 1]
    p_swap = lr_m.predict_proba(-Xte)[:, 1]
    g_x, g_swap = gbm.predict_proba(Xte)[:, 1], gbm.predict_proba(-Xte)[:, 1]
    Xs, ys = pd.concat([X_all[trva], -X_all[trva]]), np.concatenate([d.y[trva], 1 - d.y[trva]])
    sym = LogReg().fit(Xs, ys)
    symmetry = {"logregGap": r(np.abs(p_x + p_swap - 1).mean()), "gbmGap": r(np.abs(g_x + g_swap - 1).mean()),
                "intercept": r(lr_m.m.intercept_[0] - (lr_m.m.coef_[0] * lr_m.sc.mean_ / lr_m.sc.scale_).sum(), 3),
                "augmentedAccuracy": r(sym.score(Xte, yte)), "plainAccuracy": models[0]["accuracy"]}

    # ---------------------------------------------------------- 4. the 2026 forecast
    gb = json.loads((RAW / "generic_ballot_2026.json").read_text())
    avg = next(a for a in gb["rows"] if a["source"].lower().startswith("average"))
    env26 = 100 * (avg["dem"] - avg["rep"]) / (avg["dem"] + avg["rep"])
    d26 = load_districts(2026)
    X26 = features(d26, env26)
    full = d.contested == 1
    final_lr = LogReg().fit(X_all[full], d.y[full])
    final_gbm = make_gbm().fit(X_all[full], d.y[full])
    final_tree = DecisionTreeClassifier(max_depth=3, min_samples_leaf=20, random_state=SEED).fit(X_all[full], d.y[full])
    contested26 = (d26.has_d == 1) & (d26.has_r == 1)
    only_d = (d26.has_d == 1) & (d26.has_r == 0)

    def prob26(model, X):
        p = model.predict_proba(X)[:, 1]
        return np.where(contested26, p, np.where(only_d, 1.0, 0.0))

    p26_lr, p26_gbm = prob26(final_lr, X26), prob26(final_gbm, X26)
    # Monte Carlo: one shared national error per simulated election + independent district coin flips
    rng = np.random.default_rng(SEED)
    shifts = rng.normal(0, SIGMA_ENV, N_SIMS)
    grid = np.round(np.arange(-12, 12.01, 0.5), 2)
    lut = np.array([prob26(final_lr, X26.assign(env=env26 + s)) for s in grid])  # (grid, 435)
    k = np.clip(np.round((shifts + 12) / 0.5).astype(int), 0, len(grid) - 1)
    seats = (rng.random((N_SIMS, len(d26))) < lut[k]).sum(axis=1)
    hist = np.bincount(seats, minlength=436)
    seat_curve = [{"env": r(env26 + s, 2), "seats": r(lut[i].sum(), 1)} for i, s in enumerate(grid)]

    OUT_FC.mkdir(parents=True, exist_ok=True)
    fc = d26[["district", "state", "pvi", "inc_party", "inc_running", "has_d", "has_r"]].copy()
    fc["p_dem_logreg"], fc["p_dem_gbm"] = p26_lr.round(4), p26_gbm.round(4)
    if not (OUT_FC / "forecast_2026.csv").exists():  # frozen: never overwrite the pre-election forecast
        fc.to_csv(OUT_FC / "forecast_2026.csv", index=False)
        (OUT_FC / "forecast_2026.json").write_text(json.dumps({
            "frozenOn": date.today().isoformat(), "env": r(env26, 2), "sigmaEnv": SIGMA_ENV, "sims": N_SIMS,
            "pDemMajority": r((seats >= 218).mean()), "medianSeatsD": int(np.median(seats)),
            "p10": int(np.percentile(seats, 10)), "p90": int(np.percentile(seats, 90)),
            "genericBallot": avg, "model": "logistic regression on pvi, env, inc, held (trained 2014-2024)"}, indent=1))
    frozen = json.loads((OUT_FC / "forecast_2026.json").read_text())
    frozen_csv = pd.read_csv(OUT_FC / "forecast_2026.csv", keep_default_na=False, na_values=[""])

    # Scorecard: filled in automatically once ml/fetch_data.py --only 2026 brings the winners in
    score = None
    done = d26[d26.winner.isin(["D", "R"])].merge(frozen_csv[["district", "p_dem_logreg", "p_dem_gbm"]], on="district")
    if len(done):
        yy = (done.winner == "D").astype(int)
        score = {"called": int(len(done)), "seatsD": int(yy.sum()), "seatsR": int(len(done) - yy.sum()),
                 "accuracyLogreg": r(accuracy_score(yy, done.p_dem_logreg >= 0.5)),
                 "accuracyGbm": r(accuracy_score(yy, done.p_dem_gbm >= 0.5)),
                 "brierLogreg": r(brier_score_loss(yy, done.p_dem_logreg)),
                 "misses": [{"district": a.district, "p": r(a.p_dem_logreg), "winner": a.winner}
                            for a in done.itertuples() if (a.p_dem_logreg >= 0.5) != (a.winner == "D")]}

    # --- Export the browser models + verify the GBM export reproduces sklearn
    g_exp = export_gbm(final_gbm)
    raw_sk = final_gbm.decision_function(X26)
    raw_js = [gbm_raw(g_exp["trees"], g_exp["init"], g_exp["lr"], row) for row in X26.to_dict("records")]
    assert np.allclose(raw_sk, raw_js, atol=1e-6), "GBM export mismatch"

    districts26 = [{
        "id": a.district, "state": a.state, "pvi": r(a.pvi, 1), "incParty": a.inc_party if isinstance(a.inc_party, str) else None,
        "incRunning": int(a.inc_running), "newSeat": int(a.new_seat), "hasD": int(a.has_d), "hasR": int(a.has_r),
        "status": a.inc_status if isinstance(a.inc_status, str) else "", "pFrozen": r(fp, 4),
    } for a, fp in zip(d26.itertuples(), frozen_csv.set_index("district").p_dem_logreg.reindex(d26.district).values)]
    seat_change = {"heldD": int((d26.inc_party == "D").sum()), "heldR": int((d26.inc_party == "R").sum()),
                   "newSeats": int(d26.new_seat.sum()), "openSeats": int(((d26.inc_running == 0)).sum()),
                   "uncontestedD": int(only_d.sum()), "uncontestedR": int(((d26.has_r == 1) & (d26.has_d == 0)).sum())}

    guide = {
        "built": date.today().isoformat(),
        "counts": {"districtYears": int(len(d)), "contested": int(con.sum()), "years": YEARS,
                   "train": int((tr & con).sum()), "val": int((va & con).sum()), "test": int((te & con).sum()),
                   "candidateRows": int(pd.read_csv(RAW / "house_results_538.csv", usecols=[0]).shape[0])},
        "quality": quality, "scatter": scatter, "incumbency": incumbency, "reelect": reelect,
        "pviBins": pvi_bins, "national": national_out, "envByYear": {str(k): r(v, 2) for k, v in env_by_year.items()},
        "baselines": baselines, "tuning": tuning, "models": models, "confusion": confusion, "roc": roc,
        "inflation": inflation, "loco": loco, "calibration": calibration, "splitPitfall": split_pitfall,
        "depthCurve": depth_curve, "learningCurve": learning, "effects": effects, "ablation": ablation,
        "symmetry": symmetry,
        "features": [{"key": f, "label": FEATURE_LABELS[f]} for f in FEATURES],
        "sample": [{"year": int(a.year), "district": a.district, "pvi": r(a.pvi, 1), "incParty": a.inc_party if isinstance(a.inc_party, str) else "",
                    "incRunning": int(a.inc_running), "margin": r(a.margin, 1), "winner": a.winner}
                   for a in d[(d.year == 2022)].sample(8, random_state=3).itertuples()],
        "forecast": {
            "env": r(env26, 2), "genericBallot": gb, "sigmaEnv": SIGMA_ENV, "sims": N_SIMS,
            "pDemMajority": r((seats >= 218).mean()), "medianSeatsD": int(np.median(seats)),
            "p10": int(np.percentile(seats, 10)), "p90": int(np.percentile(seats, 90)),
            "hist": hist.tolist(), "seatCurve": seat_curve, "frozen": frozen, "seatChange": seat_change,
            "gbmSeats": r(p26_gbm.sum(), 1), "lrSeats": r(p26_lr.sum(), 1),
        },
        "score2026": score,
        "model": {"logreg": export_logreg(final_lr), "tree": export_tree(final_tree, FEATURES, with_counts=True), "gbm": g_exp},
        "districts": districts26,
    }
    OUT_SRC.mkdir(parents=True, exist_ok=True)
    (OUT_SRC / "guide.json").write_text(json.dumps(guide, separators=(",", ":")), encoding="utf-8")

    print("quality", quality)
    print("national env", {k: round(v, 1) for k, v in env_by_year.items()})
    print("baselines", [(b["name"], b["accuracy"]) for b in baselines])
    print("tuning", tuning)
    print("models", [(m["name"], m["accuracy"], m["trainAccuracy"], m["competitiveAccuracy"], m["brier"]) for m in models])
    print("inflation", inflation, "split", split_pitfall)
    print("loco", loco)
    print("ablation", ablation, "effects", effects)
    print("symmetry", symmetry)
    print("incumbency", incumbency)
    print("national MAE seats lin/rf", national_out["maeLinearSeats"], national_out["maeForestSeats"], national_out["linear"])
    print("2026 env", round(env26, 2), "P(D maj)", guide["forecast"]["pDemMajority"], "median", guide["forecast"]["medianSeatsD"],
          "p10-p90", guide["forecast"]["p10"], guide["forecast"]["p90"], "gbm seats", guide["forecast"]["gbmSeats"], seat_change)


if __name__ == "__main__":
    main()
