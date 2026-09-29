#!/usr/bin/env python3
"""
Build data/intelligence/dataset.json from the research output.

Inputs (a directory with these sub-folders):
  rosters/<league>.json   the club list per league (name, short_name, city)
  clubs/<league>--<club>.json   one researched club record with sources
  verify/<league>--<club>.json  the independent re-check of that record
  topics/*.json           deals, investors and signals per research topic

Rules the output keeps:
  - a club whose research produced no figures at all is kept as a bare row
    (name, league, country, city) so the desk lists it and the in-app job
    can research it later — nothing is invented to fill it;
  - a figure the re-check refuted is dropped; the verdicts stay on the row;
  - deals are keyed on target, investor and date and de-duplicated;
  - every row keeps the URL of the page that states it.

Usage: build_intelligence_dataset.py RESEARCH_DIR OUT_JSON [--version V]
"""

import glob
import json
import os
import re
import sys
import unicodedata
from datetime import date
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit


def slug(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def is_url(v):
    return isinstance(v, str) and v.startswith(("http://", "https://"))


def signal_key(u):
    """The store key for a signal URL — the same rule as signalKey() in
    lib/directory/signals-refresh.ts, so the daily refresh recognises a
    story the dataset already holds: scheme, www., tracking parameters
    and the trailing slash ignored; other query parameters kept."""
    p = urlsplit(u)
    host = re.sub(r"^www\.", "", p.hostname or "")
    kept = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not re.match(r"^(utm_|fbclid|gclid|ref$|source$)", k, re.I)]
    query = urlencode(kept)
    return f"{host}{unquote(p.path).rstrip('/')}{'?' + query if query else ''}".lower()


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    version = date.today().isoformat()
    if "--version" in sys.argv:
        version = sys.argv[sys.argv.index("--version") + 1]

    # Leagues: from the rosters, with country from the args file when present.
    league_meta = {}
    args = load(os.path.join(src, "..", "args.json")) or {}
    for lg in args.get("leagues", []):
        league_meta[slug(lg["league"])] = lg

    teams = {}
    for path in sorted(glob.glob(os.path.join(src, "rosters", "*.json"))):
        r = load(path)
        if not r:
            continue
        lslug = os.path.basename(path)[:-5]
        meta = league_meta.get(lslug, {})
        limit = meta.get("limit")
        clubs = r.get("clubs", [])
        if limit:
            clubs = clubs[:limit]
        for c in clubs:
            key = f"{lslug}--{slug(c['name'])}"
            teams[key] = {
                "key": key,
                "name": c["name"],
                "short_name": c.get("short_name"),
                "sport": meta.get("sport", "football"),
                "league": r.get("league") or meta.get("league"),
                "country": r.get("country") or meta.get("country"),
                "city": c.get("city"),
                "stadium": None, "stadium_capacity": None, "stadium_capacity_source_url": None,
                "founded_year": None, "domain": None,
                "ownership_type": None, "ownership_summary": None, "ownership_source_url": None,
                "revenue": None, "revenue_currency": None, "revenue_season": None, "revenue_source_name": None, "revenue_source_url": None,
                "valuation": None, "valuation_currency": None, "valuation_year": None, "valuation_source_name": None, "valuation_source_url": None,
                "social_followers": None, "social_as_of": None, "social_source_url": None, "social_platforms": [],
                "notes": None, "sources": [], "verification": [], "owners": [],
            }

    deals = {}
    investors = {}

    def add_deal(d, asset_class, target, target_kind, target_country, target_team_key, sport):
        investor = d.get("investor")
        headline = d.get("headline")
        if not (investor and headline and is_url(d.get("source_url"))):
            return
        key = f"deal:{slug(target)}:{slug(investor)}:{d.get('date') or slug(d.get('date_text') or 'undated')}"
        if key in deals:
            return
        deals[key] = {
            "key": key,
            "date": d.get("date") if isinstance(d.get("date"), str) and re.match(r"^\d{4}-\d{2}-\d{2}$", d.get("date")) else None,
            "date_text": d.get("date_text"),
            "kind": d.get("kind") or "other",
            "asset_class": asset_class,
            "sport": sport,
            "target": target,
            "target_kind": target_kind,
            "target_country": target_country,
            "target_team_key": target_team_key,
            "investor": investor,
            "investor_type": d.get("investor_type"),
            "investor_key": None,
            "seller": d.get("seller"),
            "stake_pct": num(d.get("stake_pct")),
            "amount": num(d.get("amount")),
            "currency": d.get("currency"),
            "valuation": num(d.get("valuation")),
            "valuation_currency": d.get("valuation_currency"),
            "headline": headline,
            "summary": d.get("summary"),
            "source_name": d.get("source_name"),
            "source_url": d["source_url"],
        }

    filled = 0
    for path in sorted(glob.glob(os.path.join(src, "clubs", "*.json"))):
        c = load(path)
        if not c:
            continue
        base = os.path.basename(path)[:-5]
        lslug = base.split("--")[0]
        has_figures = (
            any(c.get(k) is not None for k in ("revenue_amount", "valuation_amount", "stadium_capacity", "social_followers_total", "founded_year"))
            or c.get("owners") or c.get("institutional_investors") or c.get("deals")
        )
        if not has_figures:
            continue  # a search-budget casualty: keep the roster row bare
        v = load(os.path.join(src, "verify", base + ".json")) or {}
        checks = v.get("checks", []) if isinstance(v, dict) else []
        refuted = {k["field"] for k in checks if k.get("verdict") == "refuted"}
        keep = lambda field: field not in refuted  # noqa: E731
        # A refuted claim takes everything that hung on it: the figure with its
        # currency, season, year and page; a refuted ownership summary, the
        # owner rows it described; a refuted top investor, that investor's row
        # (the one the check's claim names, else the first institutional one).
        refuted_investor = None
        if "top_investor" in refuted:
            claim = " ".join(k.get("claimed") or "" for k in checks if k.get("field") == "top_investor").lower()
            inst = [i for i in c.get("institutional_investors", []) if i.get("name")]
            named = [i for i in inst if i["name"].lower() in claim]
            refuted_investor = (named or inst or [{}])[0].get("name")
        key = base
        # Match the roster row by name when the researcher spelled it differently.
        if key not in teams:
            for k, t in teams.items():
                if k.startswith(lslug + "--") and (slug(t["name"]) == slug(c.get("name") or "") or slug(t.get("short_name") or "") == slug(c.get("short_name") or "")):
                    key = k
                    break
        meta = league_meta.get(lslug, {})
        t = teams.get(key) or {"key": key, "name": c.get("name"), "sport": meta.get("sport", "football"), "league": c.get("league") or meta.get("league"), "country": c.get("country") or meta.get("country"), "owners": []}
        owners = []
        for o in c.get("owners", []):
            if not o.get("name") or not keep("ownership"):
                continue
            owners.append({
                "name": o["name"], "kind": o.get("kind"), "institutional": False, "investor_type": None,
                "stake_pct": num(o.get("stake_pct")), "since_year": num(o.get("since_year")),
                "amount": None, "currency": None, "valuation_at_entry": None, "source_url": o.get("source_url"),
            })
        for i in c.get("institutional_investors", []):
            if not i.get("name") or (refuted_investor and i["name"].lower() == refuted_investor.lower()):
                continue
            owners.append({
                "name": i["name"], "kind": "fund", "institutional": True, "investor_type": i.get("investor_type"),
                "stake_pct": num(i.get("stake_pct")), "since_year": num(i.get("entry_year")),
                "amount": num(i.get("amount")), "currency": i.get("currency"), "valuation_at_entry": num(i.get("valuation_at_entry")),
                "source_url": i.get("source_url"),
            })
            ikey = slug(i["name"])
            inv = investors.setdefault(ikey, {"key": ikey, "name": i["name"], "investor_type": i.get("investor_type"), "hq": None, "domain": None, "aum": None, "aum_currency": None, "aum_as_of": None, "aum_source_url": None, "summary": None, "holdings": [], "source_url": i.get("source_url")})
            inv["holdings"].append({"target": c.get("short_name") or c.get("name"), "sport": t.get("sport") or meta.get("sport", "football"), "stake_pct": num(i.get("stake_pct")), "since_year": num(i.get("entry_year")), "source_url": i.get("source_url")})
        t.update({
            "name": c.get("name") or t["name"],
            "short_name": c.get("short_name") or t.get("short_name"),
            "city": c.get("city") or t.get("city"),
            "stadium": c.get("stadium"),
            "stadium_capacity": num(c.get("stadium_capacity")) if keep("stadium_capacity") else None,
            "stadium_capacity_source_url": c.get("stadium_capacity_source_url") if keep("stadium_capacity") else None,
            "founded_year": num(c.get("founded_year")),
            "domain": c.get("website_domain"),
            "ownership_type": c.get("ownership_type") if keep("ownership") else "unknown",
            "ownership_summary": c.get("ownership_summary") if keep("ownership") else None,
            "ownership_source_url": c.get("ownership_source_url") if keep("ownership") else None,
            "revenue": num(c.get("revenue_amount")) if keep("revenue") else None,
            "revenue_currency": c.get("revenue_currency") if keep("revenue") else None,
            "revenue_season": c.get("revenue_season") if keep("revenue") else None,
            "revenue_source_name": c.get("revenue_source_name") if keep("revenue") else None,
            "revenue_source_url": c.get("revenue_source_url") if keep("revenue") else None,
            "valuation": num(c.get("valuation_amount")) if keep("valuation") else None,
            "valuation_currency": c.get("valuation_currency") if keep("valuation") else None,
            "valuation_year": num(c.get("valuation_year")) if keep("valuation") else None,
            "valuation_source_name": c.get("valuation_source_name") if keep("valuation") else None,
            "valuation_source_url": c.get("valuation_source_url") if keep("valuation") else None,
            "social_followers": num(c.get("social_followers_total")) if keep("social") else None,
            "social_as_of": c.get("social_as_of") if keep("social") else None,
            "social_source_url": c.get("social_source_url") if keep("social") else None,
            "social_platforms": [p for p in c.get("social_platforms", []) if p.get("platform") and num(p.get("followers")) is not None],
            "notes": c.get("notes"),
            "sources": [u for u in c.get("sources", []) if is_url(u)],
            "verification": checks,
            "owners": owners,
        })
        teams[key] = t
        filled += 1
        for d in c.get("deals", []):
            add_deal(d, "sports", t["name"], "club", t.get("country"), key, t.get("sport") or meta.get("sport", "football"))

    signals = {}
    commitments = {}
    for path in sorted(glob.glob(os.path.join(src, "topics", "*.json"))):
        tp = load(path)
        if not tp:
            continue
        # LP commitments as an LP publication or the press states them; keyed
        # the same way commitments-research.ts keys its rows.
        for c in tp.get("commitments", []):
            if not (c.get("lp_name") and c.get("fund_name") and is_url(c.get("source_url"))):
                continue
            cdate = c.get("date") if isinstance(c.get("date"), str) and re.match(r"^\d{4}-\d{2}-\d{2}$", c.get("date")) else None
            year = num(c.get("year")) or (int(cdate[:4]) if cdate else None)
            key = f"lpcommit:{slug(c['lp_name'])}:{slug(c['fund_name'])}:{cdate or (str(int(year)) if year else 'undated')}"
            if key in commitments:
                continue
            commitments[key] = {
                "key": key, "lp_name": c["lp_name"], "gp_name": c.get("manager") or c.get("gp_name"), "fund_name": c["fund_name"],
                "amount": num(c.get("amount")), "currency": c.get("currency"), "amount_text": c.get("amount_text"),
                "date": cdate, "date_text": c.get("date_text"), "year": int(year) if year else None,
                "disclosure_type": c.get("disclosure_type") or "other", "source_name": c.get("source_name"), "source_url": c["source_url"],
            }
        for d in tp.get("deals", []):
            add_deal(d, d.get("asset_class") or "other", d.get("target") or "", d.get("target_kind"), d.get("target_country"), None, d.get("sport"))
        for i in tp.get("investors", []):
            if not i.get("name"):
                continue
            ikey = slug(i["name"])
            inv = investors.setdefault(ikey, {"key": ikey, "name": i["name"], "investor_type": i.get("investor_type"), "hq": None, "domain": None, "aum": None, "aum_currency": None, "aum_as_of": None, "aum_source_url": None, "summary": None, "holdings": [], "source_url": i.get("source_url")})
            for f in ("hq", "domain", "summary", "aum_currency", "aum_as_of", "aum_source_url"):
                if i.get(f if f != "domain" else "website_domain") and not inv.get(f):
                    inv[f] = i.get(f if f != "domain" else "website_domain")
            if num(i.get("aum_or_fund_size")) is not None and inv.get("aum") is None:
                inv["aum"] = num(i.get("aum_or_fund_size"))
            for h in i.get("holdings", []):
                if h.get("target") and not any(x["target"].lower() == h["target"].lower() for x in inv["holdings"]):
                    inv["holdings"].append({"target": h["target"], "sport": h.get("sport"), "stake_pct": num(h.get("stake_pct")), "since_year": num(h.get("since_year")), "source_url": h.get("source_url")})
        for s in tp.get("signals", []):
            if not (s.get("headline") and is_url(s.get("source_url"))):
                continue
            key = signal_key(s["source_url"])
            if key in signals:
                continue
            signals[key] = {
                "key": key, "date": s.get("date") if isinstance(s.get("date"), str) and re.match(r"^\d{4}-\d{2}-\d{2}$", s.get("date")) else None,
                "asset_class": s.get("asset_class") or "other", "kind": s.get("kind") or "news", "headline": s["headline"],
                "summary": s.get("summary"), "entities": s.get("entities", []), "source_name": s.get("source_name"), "source_url": s["source_url"],
            }

    dataset = {
        "version": version,
        "generated_at": date.today().isoformat(),
        "teams": list(teams.values()),
        "investors": list(investors.values()),
        "deals": list(deals.values()),
        "signals": list(signals.values()),
        "commitments": list(commitments.values()),
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=1)
    print(f"teams {len(teams)} (with figures {filled}), investors {len(investors)}, deals {len(deals)}, signals {len(signals)}, commitments {len(commitments)} -> {out}")


if __name__ == "__main__":
    main()
