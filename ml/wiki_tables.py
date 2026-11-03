"""Parse the per-state district tables of Wikipedia's "<year> United States House of
Representatives elections" pages (raw wikitext) into one row per district.

Each row holds what was knowable BEFORE the election (Cook PVI, incumbent party, whether the
incumbent is on the ballot, which parties field a candidate) plus, once results are in, the
winner's party (the candidate marked {{Aye}}).

Wikipedia text is CC BY-SA 4.0; the Cook PVI values it reprints come from The Cook Political Report.
"""
from __future__ import annotations

import re

STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
}
ABBR = set(STATES.values())

# A district row starts with a header cell holding {{ushr|ST|N|X}} or a [[State's Nth congressional district|..]] link
ROW_START = re.compile(
    r"^!\s*(?:rowspan=\"?\d+\"?\s*\|)?\s*(?:\{\{ushr\|(?P<st>[A-Za-z ]+?)\|(?P<n>[\w-]+)\|x\}\}"
    r"|\[\[(?P<state>[A-Z][A-Za-z ]+?)'s (?:(?P<n2>\d+)(?:st|nd|rd|th)|(?P<al>at-large)) congressional district)",
    re.I | re.M)
PVI_SHADING = re.compile(r"shading PVI\|(?:(?P<p>[RD])\|(?P<v>[\d.]+)|EVEN)", re.I)
PVI_SORT = re.compile(r"\b(?P<p>[RD])\+(?P<v>\d+(?:\.\d+)?)|\bEVEN\b")
PARTY_WORD = re.compile(r"\b(Republican|Democratic)\b")
STRIPE = re.compile(r"Party stripe\|(Democratic|Republican|[^}|]+)")
AYE_LINE = re.compile(r"^.*\{\{(?:Aye|Yes2|tick)\}\}.*$", re.I | re.M)
STATUS_CELL = re.compile(r"Incumbent|New member|retir|resign|Member-elect", re.I)
# The incumbent is on the November ballot (won, lost, or still running)
RUNNING = re.compile(
    r"Incumbent (?:re-?elected|renominated|running|advanced|seeking|is running|lost re-?election|defeated"
    r"|lost(?! renomination| nomination| (?:a )?redistricting| primary| in primary)(?=[\s.<,]|$))", re.I)


def _pvi(text: str) -> float | None:
    """Cook PVI as a signed number: D+5 -> +5, R+5 -> -5, EVEN -> 0."""
    m = PVI_SHADING.search(text) or PVI_SORT.search(text)
    if not m:
        return None
    if not m.group("p"):
        return 0.0
    return float(m.group("v")) * (1 if m.group("p").upper() == "D" else -1)


def _clean(cell: str) -> str:
    cell = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", " ", cell, flags=re.S)
    cell = re.sub(r"<[^>]+>|\{\{[^}]*\}\}|'''|style=\"[^\"]*\"\s*\|", " ", cell)
    return re.sub(r"\s+", " ", cell).strip()


def parse_page(text: str) -> list[dict]:
    starts = list(ROW_START.finditer(text))
    rows: dict[str, dict] = {}
    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        block = text[m.start():end].split("\n|}")[0]  # stop at the end of the table
        if m.group("st"):
            st, n = m.group("st"), m.group("n").upper()
            st = STATES.get(st.strip(), st.upper())
        else:
            st = STATES.get(m.group("state"))
            n = "AL" if m.group("al") else m.group("n2")
        if st not in ABBR:
            continue
        district = f"{st}-{'AL' if n in ('AL', 'AT-LARGE', '0') else int(n)}"
        pvi = _pvi(block)
        # Cells before the candidate list describe the incumbent(s); after it, the candidates.
        split = re.search(r"\{\{\s*plainlist|\{\{\s*Party stripe", block, re.I)
        if pvi is None or not split:
            continue  # summary lists also use {{ushr}}; race rows carry a PVI and candidates
        inc_part, cand_part = block[: split.start()], block[split.start():]
        # Drop wiki links (they name OTHER elections, with years and party names) before reading cells
        inc_clean = re.sub(r"\[\[[^\]]*\]\]", " ", inc_part)
        incumbents, party = [], None
        for cell in re.split(r"\n\||\|\|", inc_clean):
            if STATUS_CELL.search(cell):
                if party:
                    status = _clean(cell)
                    incumbents.append({"party": party, "running": bool(RUNNING.search(status)), "status": status[:160]})
                party = None
            else:
                pw = PARTY_WORD.findall(cell)
                if pw and len(cell) < 200:
                    party = pw[0][0]  # 'R' or 'D'
        stripes = [s.split(" Party")[0].strip() for s in STRIPE.findall(cand_part)]
        winner = None
        if aye := AYE_LINE.search(cand_part):
            s = STRIPE.search(aye.group(0))
            name = s.group(1) if s else (PARTY_WORD.search(aye.group(0)) or [None, ""])[1] or ""
            winner = "D" if "Democratic" in name else "R" if "Republican" in name else "O"  # DFL counts as D
        rows[district] = {
            "district": district, "state": st, "pvi": pvi,
            "incParty": incumbents[0]["party"] if incumbents else None,
            "incumbents": incumbents, "newSeat": not incumbents,
            "hasD": any("Democratic" in s for s in stripes),
            "hasR": any("Republican" in s for s in stripes),
            "nCands": len(stripes), "winner": winner,
        }
    return list(rows.values())
