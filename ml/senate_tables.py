"""Parse the "Race summary" tables of Wikipedia's "<year> United States Senate elections" pages
(raw wikitext) into one row per race (regular and special elections).

Each row holds what was knowable BEFORE the election (incumbent, their party, whether they are on the
ballot, every candidate with their party) plus, once results are in, the winner (the {{Aye}} line).
Cook PVI is read when the page prints it (2026 and some other years); the pipeline computes its own
state lean from presidential results, so this column is only used as a cross-check.

Wikipedia text is CC BY-SA 4.0; the Cook PVI values it reprints come from The Cook Political Report.
"""
from __future__ import annotations

import re

from wiki_tables import STATES, _clean, _pvi

# A race row starts with a header cell linking the race (or a #State anchor), e.g.
#   ! [[2026 United States Senate special election in Ohio|Ohio]]<br />(Class 3)
#   ![[2020–21 United States Senate election in Georgia|Georgia]]
#   ! [[#Idaho|Idaho]]
ROW_START = re.compile(r"^!\s*\[\[(?P<target>[^|\]]*)\|(?P<label>[^\]]*)\]\]", re.M)
PARTY_CELL = re.compile(r"^\s*(Republican|Democratic|Independent|DFL|Democratic[–-]Farmer[–-]Labor|Democratic[–-]NPL)\s*$")
SHADING_ONLY = re.compile(r"^\s*\{\{\s*party shading/(Republican|Democratic|Independent|DFL)(?:/Text)?\s*\}\}\s*$", re.I)
STATUS_CELL = re.compile(r"Incumbent|appointee|Senator", re.I)
# The incumbent is on the November ballot (won, lost, or still running)
RUNNING = re.compile(
    r"(?:Incumbent|appointee)(?: term expired but)? (?:re-?elected|elected|renominated|nominated|running|advanced|seeking|is running"
    r"|lost re-?election|lost election|defeated|lost(?! renomination| nomination| primary| in primary| the primary)(?=[\s.<,]|$))", re.I)
CAND_LINE = re.compile(r"^\*.*$", re.M)
STRIPE = re.compile(r"Party stripe\|([^}|]+)", re.I)
AYE = re.compile(r"\{\{(?:Aye|Yes2|tick)\}\}", re.I)
NAME_LINK = re.compile(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]")
SORTNAME = re.compile(r"\{\{\s*sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}", re.I)


def _party(stripe: str) -> str:
    s = stripe.lower()
    if ("democratic" in s and "republican" not in s and "social" not in s) or "farmer" in s or s == "dfl":
        return "D"  # incl. Minnesota DFL and North Dakota Democratic-NPL, the state Democratic parties
    if s.startswith("republican"):
        return "R"
    if s.startswith("independent"):
        return "I"
    return "O"  # Libertarian, Green, Constitution, ...


def _name(line: str) -> str:
    line = SORTNAME.sub(lambda m: f"{m.group(1)} {m.group(2)}", line)
    line = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|\{\{[^}]*\}\}|'''", " ", line, flags=re.S)
    line = NAME_LINK.sub(lambda m: m.group(1), line)
    line = line.lstrip("* ").split(" (")[0]
    return re.sub(r"\s+", " ", line).strip()


def race_section(text: str) -> str:
    """The part of the page holding the race tables (specials + regular elections)."""
    starts = [m.start() for m in re.finditer(r"=+\s*(?:Special elections during the preceding Congress"
                                              r"|Elections leading to the next Congress)\s*=+", text)]
    if not starts:
        return ""
    s = min(starts)
    end = re.search(r"\n==[^=]", text[s:])
    return text[s: s + end.start()] if end else text[s:]


def parse_senate_page(text: str) -> list[dict]:
    sec = race_section(text)
    starts = list(ROW_START.finditer(sec))
    rows: dict[str, dict] = {}
    for i, m in enumerate(starts):
        label = re.sub(r"<[^>]+>.*", "", m.group("label")).strip()
        st = STATES.get(label) or STATES.get(m.group("target").lstrip("#").split(" in ")[-1].strip())
        if not st:
            continue
        end = starts[i + 1].start() if i + 1 < len(starts) else len(sec)
        block = sec[m.start():end].split("\n|}")[0]
        special = "special" in m.group("target").lower()
        split = re.search(r"\{\{\s*plainlist", block, re.I)
        if not split:
            continue
        head, cands_txt = block[: split.start()], block[split.start():]
        cands_txt = re.sub(r"(\{\{\s*plainlist\s*\|)\s*\*", r"\1\n*", cands_txt, flags=re.I)  # first item on the same line
        cells = [c for c in re.split(r"\n\||\|\|", re.sub(r"\[\[[^\]]*\]\]", " ", head))]
        inc_party, status = None, ""
        for c in cells:
            last = c.split("|")[-1]
            if inc_party is None and (pm := PARTY_CELL.match(_clean(last)) or SHADING_ONLY.match(c)):
                inc_party = _party(pm.group(1))
            elif STATUS_CELL.search(c) and not status:
                status = _clean(c.split("|", 1)[-1] if "Party shading" in c or "data-sort-value" in c else c)
        cands: dict[str, dict] = {}
        winner = winner_name = None
        for line in CAND_LINE.findall(cands_txt):
            sm = STRIPE.search(line)
            if not sm:
                continue
            party, name = _party(sm.group(1)), _name(line)
            if not name:
                continue
            cands.setdefault(name, {"name": name, "party": party, "linked": "[[" in re.sub(r"<ref.*?(?:</ref>|/>)", "", line)})  # name has a Wikipedia article (ignore citations)
            if AYE.search(line):
                winner, winner_name = party, name  # runoff rows list the runoff winner last; keep the last {{Aye}}
        if winner is None and (sm := re.search(r"(Democratic|Republican|Independent) (hold|gain)\b", head)):
            winner = _party(sm.group(1))
        key = f"{st}-S" if special else st
        rows[key] = {
            "race": key, "state": st, "special": int(special), "pvi_cook": _pvi(head),
            "inc_party": inc_party, "inc_running": int(bool(RUNNING.search(status))), "status": status[:200],
            "cands": list(cands.values()), "winner": winner, "winner_name": winner_name,
        }
    return list(rows.values())
