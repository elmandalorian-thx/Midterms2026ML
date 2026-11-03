"""Download every public input this project uses and write tidy CSVs to data/raw/.

Sources (all free, no account needed):
  1. FiveThirtyEight `election-results` repo (CC BY 4.0) - candidate-level U.S. House returns.
     https://github.com/fivethirtyeight/election-results
  2. Wikipedia "<year> United States House of Representatives elections" pages (CC BY-SA 4.0),
     read as raw wikitext via index.php?action=raw. The per-state tables give, for every district:
     Cook PVI, incumbent + party, whether the incumbent runs, candidates, and (after the election)
     the winner. The 2026 page also has the generic-ballot polling aggregates.
  3. Optional: FiftyPlusOne poll CSVs (needs a free API key in FIFTYPLUSONE_API_KEY).

Run:  .venv/bin/python ml/fetch_data.py            # everything
      .venv/bin/python ml/fetch_data.py --only 2026  # just refresh the 2026 page (e.g. after results)
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import time
import urllib.request
from pathlib import Path

from wiki_tables import parse_page

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "data" / "external"
UA = "Midterms2026ML/1.0 (educational ML walkthrough; https://github.com/elmandalorian-thx/Midterms2026ML)"
YEARS = [2014, 2016, 2018, 2020, 2022, 2024, 2026]
R538 = "https://raw.githubusercontent.com/fivethirtyeight/election-results/main/"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:  # network hiccup or rate limit: back off and retry
            if attempt == 3:
                raise
            print(f"  retry {url} ({e})")
            time.sleep(2 ** (attempt + 2))
    raise RuntimeError(url)


def fetch_538() -> None:
    """House general-election returns 1998-2024, trimmed to the columns the pipeline uses."""
    print("538 house results ...")
    text = get(R538 + "election_results_house.csv").decode("utf-8")
    keep = ["cycle", "state_abbrev", "office_seat_name", "special", "stage", "candidate_name", "ballot_party",
            "votes", "percent", "unopposed", "winner"]
    rows = [r for r in csv.DictReader(io.StringIO(text))
            if r["stage"] == "general" and r["special"] == "false" and r["cycle"].isdigit() and int(r["cycle"]) >= 1998]
    RAW.mkdir(parents=True, exist_ok=True)
    with open(RAW / "house_results_538.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, keep, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"  {len(rows)} candidate rows")


def wiki_raw(year: int) -> str:
    title = f"{year}_United_States_House_of_Representatives_elections"
    CACHE.mkdir(parents=True, exist_ok=True)
    text = get(f"https://en.wikipedia.org/w/index.php?title={title}&action=raw").decode("utf-8")
    (CACHE / f"house{year}.wiki").write_text(text, encoding="utf-8")
    return text


def generic_ballot_aggregates(text: str) -> list[dict]:
    """Rows of the 'Generic congressional ballot aggregate polls' table on the 2026 page."""
    m = re.search(r'<section begin="GenericBallotAgg"\s*/>(.*?)<section end="GenericBallotAgg"', text, re.S)
    if not m:
        return []
    out = []
    for row in m.group(1).split("\n|-")[1:]:
        cells = [c.strip() for c in row.strip().split("\n|") if c.strip()]
        cells = [cells[0].lstrip("|")] + cells[1:] if cells else cells
        nums = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)%", row)]
        name = re.sub(r"<ref.*?(</ref>|/>)|\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", lambda k: k.group(2) or "", cells[0], flags=re.S)
        name = re.sub(r"colspan=\d+\s*\|", "", name).replace("'''", "").strip()
        if len(nums) >= 3:
            out.append({"source": name, "rep": nums[0], "dem": nums[1], "other": nums[2],
                        "updated": next((c for c in cells if re.match(r"[A-Z][a-z]+ \d+, 20\d\d$", c)), "")})
    return out


def fetch_wikipedia(years: list[int]) -> None:
    for y in years:
        print(f"Wikipedia {y} ...")
        text = wiki_raw(y)
        rows = parse_page(text)
        with open(RAW / f"districts_{y}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["district", "state", "pvi", "inc_party", "inc_running", "inc_count", "new_seat",
                        "has_d", "has_r", "n_cands", "winner", "inc_status"])
            for r in sorted(rows, key=lambda r: (r["state"], r["district"])):
                running = [i for i in r["incumbents"] if i["running"]]
                w.writerow([r["district"], r["state"], r["pvi"],
                            (running[0]["party"] if running else r["incParty"]) or "",
                            int(bool(running)), len(r["incumbents"]), int(r["newSeat"]),
                            int(r["hasD"]), int(r["hasR"]), r["nCands"], r["winner"] or "",
                            " / ".join(i["status"] for i in r["incumbents"])])
        print(f"  {len(rows)} districts")
        if y == 2026:
            agg = generic_ballot_aggregates(text)
            (RAW / "generic_ballot_2026.json").write_text(json.dumps({
                "retrieved": time.strftime("%Y-%m-%d"),
                "source": "Wikipedia, 2026 United States House of Representatives elections, "
                          "'Generic congressional ballot aggregate polls' table",
                "rows": agg}, indent=1), encoding="utf-8")
            print(f"  generic-ballot aggregates: {[(a['source'], a['dem'], a['rep']) for a in agg]}")
        time.sleep(3)  # be polite to Wikipedia


def fetch_fiftyplusone() -> None:
    key = os.environ.get("FIFTYPLUSONE_API_KEY")
    if not key:
        print("FiftyPlusOne: set FIFTYPLUSONE_API_KEY to also download generic.csv (optional, skipped)")
        return
    for name in ["generic.csv", "presidential_approval.csv"]:
        data = get(f"https://fiftyplusone.news/api/csv?api_key={key}&filename={name}")
        (CACHE / f"fiftyplusone_{name}").write_bytes(data)
        print(f"FiftyPlusOne {name}: {len(data):,} bytes -> data/external/ (check their terms before redistributing)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=int, help="refresh a single Wikipedia year (e.g. 2026)")
    a = ap.parse_args()
    if a.only:
        fetch_wikipedia([a.only])
    else:
        fetch_538()
        fetch_wikipedia(YEARS)
        fetch_fiftyplusone()
