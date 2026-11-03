"""Snapshot Kalshi and Polymarket prices for every 2026 House and Senate race, BEFORE polls close.

Prediction markets are graded on the live Scoreboard next to the frozen models, so their prices must be frozen
the same way: a price taken after the first results would "predict" races that are already being counted.
The script refuses to write after CUTOFF (first polls close, 6 pm ET) and can be re-run any time before it to
take a fresher snapshot. Markets are a benchmark only: they are never a model feature.

Price of one side = midpoint of the best bid and ask when the spread is at most MAX_SPREAD, else the last trade.
P(Democratic side) = D price / (D price + R price), which removes the overround (Yes prices summing past $1).
A race is "liquid" (graded) when both sides together traded at least MIN_VOLUME contracts/dollars and the
quoted spread is at most MAX_SPREAD. Sides are matched by candidate name first (so an independent standing in
for a party is found the same way for either side), then by party.

Writes data/forecast/markets_2026.json (the frozen record) and web/src/data/markets.json (bundled copy).
Run:  .venv/bin/python ml/fetch_markets.py
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
from datetime import datetime, timezone

from build import OUT_FC, OUT_SRC
from fetch_data import get

CUTOFF = datetime(2026, 11, 3, 23, 0, tzinfo=timezone.utc)  # 6 pm ET: first polls close (IN, KY)
MIN_VOLUME = 1000
MAX_SPREAD = 0.10
KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
GAMMA = "https://gamma-api.polymarket.com"


def jget(url: str, **params) -> dict | list:
    return json.loads(get(url + ("?" + urllib.parse.urlencode(params) if params else "")).decode("utf-8"))


def num(x) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v


def side_price(bid, ask, last) -> tuple[float | None, float | None]:
    """(price, spread). Midpoint when the book is tight enough, else the last trade."""
    bid, ask, last = num(bid), num(ask), num(last)
    spread = ask - bid if bid is not None and ask is not None and bid > 0 and 0 < ask <= 1 else None
    if spread is not None and spread <= MAX_SPREAD:
        return (bid + ask) / 2, spread
    return (last if last and 0 < last < 1 else None), spread


def quote(d: dict | None, r: dict | None, ident: str) -> dict | None:
    """Combine the two sides' (price, spread, volume) into P(Democratic side)."""
    if not d and not r:
        return None
    pd_, pr = (d or {}).get("price"), (r or {}).get("price")
    if pd_ is not None and pr is not None and pd_ + pr > 0:
        p = pd_ / (pd_ + pr)
    elif pd_ is not None:
        p = pd_
    elif pr is not None:
        p = 1 - pr
    else:
        return None
    vol = sum((s or {}).get("vol") or 0 for s in (d, r))
    spreads = [s["spread"] for s in (d, r) if s and s.get("spread") is not None]
    spread = min(spreads) if spreads else None
    return {"p": round(p, 4), "vol": round(vol), "spread": None if spread is None else round(spread, 4),
            "liquid": bool(vol >= MIN_VOLUME and spread is not None and spread <= MAX_SPREAD), "id": ident}


def last_name(name: str | None) -> str | None:
    if not name:
        return None
    words = re.sub(r"\(.*?\)", "", name).split()
    return words[-1].lower() if words else None


def pick(markets: list[dict], label, name: str | None, party: str) -> dict | None:
    """The market for one side: by candidate surname if we know it, else by party ('D' / 'R')."""
    ln = last_name(name)
    if ln:
        hit = [m for m in markets if ln in label(m).lower()]
        if hit:
            return hit[0]
        if "(I)" in (name or ""):  # an independent standing in: never fall back to the party's own market
            return None
    words = {"D": ("democrat",), "R": ("republican",)}[party]
    hit = [m for m in markets if any(w in label(m).lower() for w in words)]
    return hit[0] if hit else None


# ------------------------------------------------------------------ Kalshi

def k_side(m: dict | None) -> dict | None:
    if not m:
        return None
    price, spread = side_price(m.get("yes_bid_dollars"), m.get("yes_ask_dollars"), m.get("last_price_dollars"))
    return {"price": price, "spread": spread, "vol": num(m.get("volume_fp")) or 0}


def k_label(m: dict) -> str:
    suffix = m["ticker"].rsplit("-", 1)[-1]
    party = {"D": "democrat", "R": "republican"}.get(suffix, "")
    return f"{m.get('yes_sub_title') or ''} {party}"


def k_events(series: str) -> list[dict]:
    out, cursor = [], None
    while True:
        params = {"series_ticker": series, "status": "open", "with_nested_markets": "true", "limit": 200}
        if cursor:
            params["cursor"] = cursor
        d = jget(f"{KALSHI}/events", **params)
        out += d.get("events", [])
        cursor = d.get("cursor")
        if not cursor or not d.get("events"):
            return out


def k_two(markets: list[dict], dname=None, rname=None, ident="") -> dict | None:
    # House: party only (Kalshi tickers end in -D / -R). Senate: surname first, so stand-ins are found.
    return quote(k_side(pick(markets, k_label, dname, "D")), k_side(pick(markets, k_label, rname, "R")), ident)


# ------------------------------------------------------------------ Polymarket

def p_side(m: dict | None) -> dict | None:
    if not m or not m.get("active") or m.get("closed"):
        return None
    last = m.get("lastTradePrice")
    if not last:
        try:
            last = json.loads(m.get("outcomePrices") or "[]")[0]
        except (ValueError, IndexError):
            last = None
    price, spread = side_price(m.get("bestBid"), m.get("bestAsk"), last)
    return {"price": price, "spread": spread, "vol": num(m.get("volumeNum")) or 0}


def p_label(m: dict) -> str:
    return f"{m.get('groupItemTitle') or ''} {m.get('question') or ''}"


def p_events(tag: str) -> list[dict]:
    out, off = [], 0
    while True:
        page = jget(f"{GAMMA}/events", tag_slug=tag, closed="false", limit=100, offset=off)
        out += page
        if len(page) < 100:
            return out
        off += 100


def p_two(e: dict, dname=None, rname=None) -> dict | None:
    ms = [m for m in e.get("markets", []) if m.get("active") and not m.get("closed")]
    return quote(p_side(pick(ms, p_label, dname, "D")), p_side(pick(ms, p_label, rname, "R")), e["slug"])


# ------------------------------------------------------------------ main

STATE_SLUG = {"AL": "alabama", "AK": "alaska", "AR": "arkansas", "CO": "colorado", "DE": "delaware", "FL": "florida",
              "GA": "georgia", "IA": "iowa", "ID": "idaho", "IL": "illinois", "KS": "kansas", "KY": "kentucky",
              "LA": "louisiana", "MA": "massachusetts", "ME": "maine", "MI": "michigan", "MN": "minnesota",
              "MS": "mississippi", "MT": "montana", "NC": "north-carolina", "NE": "nebraska", "NH": "new-hampshire",
              "NJ": "new-jersey", "NM": "new-mexico", "OH": "ohio", "OK": "oklahoma", "OR": "oregon",
              "RI": "rhode-island", "SC": "south-carolina", "SD": "south-dakota", "TN": "tennessee", "TX": "texas",
              "VA": "virginia", "WV": "west-virginia", "WY": "wyoming"}


def house_id(st: str, num_: str, ids: set[str]) -> str | None:
    st = st.upper()
    if num_.upper() in ("AL", "00", "0") or (num_.lstrip("0") == "1" and f"{st}-AL" in ids):
        return f"{st}-AL" if f"{st}-AL" in ids else None
    i = f"{st}-{int(num_)}"
    return i if i in ids else None


def main() -> None:
    now = datetime.now(timezone.utc)
    if now >= CUTOFF:
        sys.exit(f"Refusing to snapshot after {CUTOFF:%Y-%m-%d %H:%M} UTC: polls have closed, prices now track the count.")
    guide = json.loads((OUT_SRC / "guide.json").read_text(encoding="utf-8"))
    senate = json.loads((OUT_SRC / "senate.json").read_text(encoding="utf-8"))
    hids = {d["id"] for d in guide["districts"]}
    house: dict[str, dict] = {h: {} for h in sorted(hids)}
    sen: dict[str, dict] = {r["id"]: {} for r in senate["races"]}
    control: dict[str, dict] = {"house": {}, "senate": {}}

    print("Kalshi: House races")
    for e in k_events("KXHOUSERACE"):
        m = re.match(r"([A-Z]{2})-(\w+)", e.get("sub_title") or "")
        if m and e["event_ticker"].endswith("-26") and (hid := house_id(m[1], m[2], hids)):
            if q := k_two(e["markets"], ident=e["event_ticker"]):
                house[hid]["kalshi"] = q
    print("Kalshi: Senate races")
    for r in senate["races"]:
        series = f"SENATE{r['state']}{'S' if r['special'] else ''}"
        ev = [e for e in k_events(series) if e["event_ticker"] == f"{series}-26"]
        if ev and (q := k_two(ev[0]["markets"], r["dName"], r["rName"], ev[0]["event_ticker"])):
            sen[r["id"]]["kalshi"] = q
    for ch, series in (("house", "CONTROLH"), ("senate", "CONTROLS")):
        ev = [e for e in k_events(series) if e["event_ticker"] == f"{series}-2026"]
        if ev and (q := k_two(ev[0]["markets"], ident=ev[0]["event_ticker"])):
            control[ch]["kalshi"] = q

    print("Polymarket: House races")
    for e in p_events("house-elections"):
        m = re.fullmatch(r"([a-z]{2})-(\d{2}|al)-house-election-winner", e["slug"])
        if m and (hid := house_id(m[1], m[2], hids)) and (q := p_two(e)):
            house[hid]["polymarket"] = q
    print("Polymarket: Senate races")
    pev = {e["slug"]: e for e in p_events("senate-midterms")}
    for r in senate["races"]:
        base = f"{STATE_SLUG[r['state']]}-senate-election-winner"
        # Specials share the state's slug only when the state has no regular race (FL, OH in 2026).
        hits = [e for s, e in pev.items() if s == base or re.fullmatch(re.escape(base) + r"-\d+", s)]
        if len(hits) == 1 and (q := p_two(hits[0], r["dName"], r["rName"])):
            sen[r["id"]]["polymarket"] = q
    for ch, slug in (("house", "which-party-will-win-the-house-in-2026"), ("senate", "which-party-will-win-the-senate-in-2026")):
        ev = jget(f"{GAMMA}/events", slug=slug)
        if ev and (q := p_two(ev[0])):
            control[ch]["polymarket"] = q

    out = {
        "fetchedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "cutoff": CUTOFF.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rules": {"minVolume": MIN_VOLUME, "maxSpread": MAX_SPREAD},
        "sources": [{"key": "kalshi", "name": "Kalshi", "url": "https://kalshi.com"},
                    {"key": "polymarket", "name": "Polymarket", "url": "https://polymarket.com"}],
        "control": control,
        "house": {k: v for k, v in house.items() if v},
        "senate": {k: v for k, v in sen.items() if v},
    }
    text = json.dumps(out, indent=1)
    (OUT_FC / "markets_2026.json").write_text(text, encoding="utf-8")
    (OUT_SRC / "markets.json").write_text(text, encoding="utf-8")
    for src in ("kalshi", "polymarket"):
        for ch in ("house", "senate"):
            qs = [v[src] for v in out[ch].values() if src in v]
            print(f"  {src:10s} {ch:6s} priced {len(qs):3d}, liquid {sum(q['liquid'] for q in qs):3d}")
        print(f"  {src:10s} control  House {control['house'].get(src, {}).get('p')}  Senate {control['senate'].get(src, {}).get('p')}")
    print(f"Wrote data/forecast/markets_2026.json at {out['fetchedAt']}")


if __name__ == "__main__":
    main()
