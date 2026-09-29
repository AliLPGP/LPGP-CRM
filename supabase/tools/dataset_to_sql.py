#!/usr/bin/env python3
"""
Turn data/intelligence/dataset.json into idempotent SQL you can paste into
the Supabase SQL editor — for a database you cannot reach from the app's
Import page. The in-app button (Import -> Master directory -> Load the
intelligence dataset) does the same job with better name matching; this is
the fallback.

    python3 supabase/tools/dataset_to_sql.py data/intelligence/dataset.json supabase/sql-parts/5-intelligence-data

Every statement is `insert ... on conflict (external_key) do update`, so the
parts can be re-run. Links to directory firms and funds are resolved by exact
(case-insensitive) name match in SQL; the app's loader also matches unique
prefixes, so a few more rows link when loaded through the app. Rows that need
a firm the database does not have (portfolio companies) are skipped by the
SQL itself. Owner rows are replaced per club.

Parts are cut on statement boundaries at about 8 KB, the size that browser
SQL editors paste without truncating.
"""

import json
import os
import sys


def q(v):
    """A SQL literal for any JSON value."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (list, dict)):
        return q(json.dumps(v, ensure_ascii=False)) + "::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def arr(vs):
    if not vs:
        return "'{}'::text[]"
    return "array[" + ", ".join(q(v) for v in vs) + "]::text[]"


def firm(name):
    """A directory firm's id by exact name, or null."""
    if not name:
        return "null"
    return f"(select id from public.companies where lower(name) = lower({q(name)}) limit 1)"


def fund(name):
    if not name:
        return "null"
    return f"(select id from public.funds where lower(name) = lower({q(name)}) limit 1)"


def team(key):
    if not key:
        return "null"
    return f"(select id from public.sports_teams where external_key = {q(key)})"


def investor(key):
    if not key:
        return "null"
    return f"(select id from public.sports_investors where external_key = {q(key)})"


def upsert(table, cols, rows_values, conflict="external_key"):
    """One insert per row, updating every column but the key on conflict."""
    out = []
    update = ", ".join(f"{c} = excluded.{c}" for c in cols if c != conflict)
    for vals in rows_values:
        out.append(f"insert into public.{table} ({', '.join(cols)})\n  values ({', '.join(vals)})\n  on conflict ({conflict}) do update set {update};")
    return out


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    # --whole=PATH also writes every statement to one file, for psql or the
    # Supabase CLI, where a paste can't truncate.
    whole = next((a.split("=", 1)[1] for a in sys.argv[3:] if a.startswith("--whole=")), None)
    d = json.load(open(src, encoding="utf-8"))
    stmts = [f"-- Intelligence dataset {d['version']} (generated {d['generated_at']}); idempotent, re-run freely."]

    inv_cols = ["external_key", "name", "investor_type", "hq", "domain", "aum", "aum_currency", "aum_as_of", "aum_source_url", "summary", "holdings", "company_id", "source_url", "source"]
    stmts += upsert("sports_investors", inv_cols, [
        [q(i["key"]), q(i["name"]), q(i.get("investor_type")), q(i.get("hq")), q(i.get("domain")), q(i.get("aum")), q(i.get("aum_currency")), q(i.get("aum_as_of")), q(i.get("aum_source_url")), q(i.get("summary")), q(i.get("holdings") or []), firm(i["name"]), q(i.get("source_url")), q("web_research")]
        for i in d["investors"]
    ])

    def has_figures(t):
        return any(t.get(k) is not None for k in ("revenue", "valuation", "stadium_capacity", "social_followers", "founded_year")) or t.get("owners")

    full_cols = ["external_key", "name", "short_name", "sport", "league", "country", "city", "stadium", "stadium_capacity", "stadium_capacity_source_url", "founded_year", "domain", "ownership_type", "ownership_summary", "ownership_source_url", "revenue", "revenue_currency", "revenue_season", "revenue_source_name", "revenue_source_url", "valuation", "valuation_currency", "valuation_year", "valuation_source_name", "valuation_source_url", "social_followers", "social_as_of", "social_source_url", "social_platforms", "notes", "sources", "verification", "source"]
    bare_cols = ["external_key", "name", "short_name", "sport", "league", "country", "city", "domain", "source"]
    for t in d["teams"]:
        if has_figures(t):
            stmts += upsert("sports_teams", full_cols, [[
                q(t["key"]), q(t["name"]), q(t.get("short_name")), q(t.get("sport") or "football"), q(t.get("league")), q(t.get("country")), q(t.get("city")),
                q(t.get("stadium")), q(t.get("stadium_capacity")), q(t.get("stadium_capacity_source_url")), q(t.get("founded_year")), q(t.get("domain")),
                q(t.get("ownership_type")), q(t.get("ownership_summary")), q(t.get("ownership_source_url")),
                q(t.get("revenue")), q(t.get("revenue_currency")), q(t.get("revenue_season")), q(t.get("revenue_source_name")), q(t.get("revenue_source_url")),
                q(t.get("valuation")), q(t.get("valuation_currency")), q(t.get("valuation_year")), q(t.get("valuation_source_name")), q(t.get("valuation_source_url")),
                q(t.get("social_followers")), q(t.get("social_as_of")), q(t.get("social_source_url")), q(t.get("social_platforms") or []),
                q(t.get("notes")), q(t.get("sources") or []), q(t.get("verification") or []), q("web_research"),
            ]])
        else:
            # A bare roster row only ever adds the club: what the in-app job found stays.
            stmts.append(
                f"insert into public.sports_teams ({', '.join(bare_cols)})\n  values ({', '.join([q(t['key']), q(t['name']), q(t.get('short_name')), q(t.get('sport') or 'football'), q(t.get('league')), q(t.get('country')), q(t.get('city')), q(t.get('domain')), q('web_research')])})\n  on conflict (external_key) do nothing;"
            )
    for t in d["teams"]:
        if not has_figures(t):
            continue
        stmts.append(f"delete from public.sports_team_owners where team_id = {team(t['key'])};")
        for o in t.get("owners") or []:
            stmts.append(
                "insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)\n"
                f"  values ({team(t['key'])}, {q(o['name'])}, {q(o.get('kind'))}, {q(bool(o.get('institutional')))}, {q(o.get('investor_type'))}, {q(o.get('stake_pct'))}, {q(o.get('since_year'))}, {q(o.get('amount'))}, {q(o.get('currency'))}, {q(o.get('valuation_at_entry'))}, "
                f"(select id from public.sports_investors where lower(name) = lower({q(o['name'])}) limit 1), {firm(o['name']) if o.get('institutional') else 'null'}, {q(o.get('source_url'))});"
            )

    deal_cols = ["external_key", "date", "date_text", "kind", "asset_class", "sport", "target", "target_kind", "target_country", "target_team_id", "target_company_id", "investor", "investor_type", "investor_company_id", "investor_id", "seller", "stake_pct", "amount", "currency", "valuation", "valuation_currency", "headline", "summary", "source_name", "source_url", "source"]
    stmts += upsert("deals", deal_cols, [[
        q(x["key"]), q(x.get("date")), q(x.get("date_text")), q(x["kind"]), q(x["asset_class"]), q(x.get("sport")), q(x["target"]), q(x.get("target_kind")), q(x.get("target_country")),
        team(x.get("target_team_key")), firm(x["target"]) if x.get("target_kind") in ("company", "fund") else "null",
        q(x["investor"]), q(x.get("investor_type")), firm(x["investor"]), investor(x.get("investor_key")) if x.get("investor_key") else f"(select id from public.sports_investors where lower(name) = lower({q(x['investor'])}) limit 1)",
        q(x.get("seller")), q(x.get("stake_pct")), q(x.get("amount")), q(x.get("currency")), q(x.get("valuation")), q(x.get("valuation_currency")),
        q(x["headline"]), q(x.get("summary")), q(x.get("source_name")), q(x["source_url"]), q("web_research"),
    ] for x in d["deals"]])

    sig_cols = ["external_key", "date", "asset_class", "kind", "headline", "summary", "entities", "company_ids", "source_name", "source_url", "source"]
    stmts += upsert("signals", sig_cols, [[
        q(s["key"]), q(s.get("date")), q(s["asset_class"]), q(s["kind"]), q(s["headline"]), q(s.get("summary")), arr(s.get("entities") or []),
        "(select coalesce(array_agg(id), '{}'::uuid[]) from public.companies where lower(name) = any(" + arr([e.lower() for e in (s.get("entities") or [])]) + "))",
        q(s.get("source_name")), q(s["source_url"]), q("web_research"),
    ] for s in d["signals"]])

    com_cols = ["external_key", "lp_company_id", "gp_company_id", "fund_id", "lp_name", "gp_name", "fund_name", "amount", "currency", "amount_text", "commitment_date", "commitment_date_text", "commitment_year", "disclosure_type", "source", "source_url", "source_date"]
    stmts += upsert("commitments", com_cols, [[
        q(c["key"]), firm(c["lp_name"]), f"coalesce((select company_id from public.funds where lower(name) = lower({q(c['fund_name'])}) limit 1), {firm(c.get('gp_name'))})", fund(c["fund_name"]),
        q(c["lp_name"]), q(c.get("gp_name")), q(c["fund_name"]), q(c.get("amount")), q(c.get("currency")), q(c.get("amount_text")), q(c.get("date")), q(c.get("date_text")), q(c.get("year")),
        q(c.get("disclosure_type")), q("web_research"), q(c["source_url"]), q(d["generated_at"]),
    ] for c in d.get("commitments") or []])

    bm_cols = ["external_key", "asset_class", "strategy", "metric", "label", "value", "unit", "period", "geography", "publisher", "published_on", "source_url", "note", "source"]
    stmts += upsert("benchmarks", bm_cols, [[
        q(b["key"]), q(b["asset_class"]), q(b.get("strategy")), q(b["metric"]), q(b["label"]), q(b.get("value")), q(b.get("unit")), q(b.get("period")), q(b.get("geography")), q(b.get("publisher")), q(b.get("published_on")), q(b["source_url"]), q(b.get("note")), q("web_research"),
    ] for b in d.get("benchmarks") or []])

    for p in d.get("portfolio") or []:
        slug = "".join(ch if ch.isalnum() else "-" for ch in p["name"].lower()).strip("-")
        while "--" in slug:
            slug = slug.replace("--", "-")
        gp = firm(p["gp_name"])
        stmts.append(
            "insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)\n"
            f"  select {gp}, {gp} || ':' || {q(slug)}, {q(p['name'])}, {q(p.get('domain'))}, {q(p.get('description'))}, {q(p.get('sector'))}, {q(p.get('hq'))}, {q(p.get('status'))}, {q(p.get('invested_year'))}, {q(p.get('exit_year'))}, {q(p.get('fund_name'))}, 'web_research', {q(p['source_url'])}\n"
            f"  where {gp} is not null\n"
            "  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;"
        )

    stmts.append(f"insert into public.directory_imports (filename, stats) values ({q('intelligence-dataset@' + d['version'])}, {q({'via': 'sql-parts', 'teams': len(d['teams']), 'deals': len(d['deals'])})});")

    # Cut into paste-sized parts on statement boundaries.
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".sql"):
            os.remove(os.path.join(outdir, f))
    # Two limits: about 8 KB, and well under 100 lines -- a browser paste has
    # been seen to stop at line 100 whatever the byte count.
    parts, cur = [], []
    for s in stmts:
        if cur and (
            sum(len(x.encode("utf-8")) + 2 for x in cur) + len(s.encode("utf-8")) > 8000
            or sum(x.count("\n") + 2 for x in cur) + s.count("\n") + 1 > 80
        ):
            parts.append(cur)
            cur = []
        cur.append(s)
    if cur:
        parts.append(cur)
    n = len(parts)
    w = max(2, len(str(n)))  # so the parts list in order
    for i, part in enumerate(parts, 1):
        name = f"data_{i:0{w}d}_of_{n:0{w}d}.sql"
        with open(os.path.join(outdir, name), "w", encoding="utf-8") as fh:
            fh.write(f"-- {name}: intelligence dataset {d['version']}, part {i} of {n}. Run in order; safe to re-run.\n\n" + "\n\n".join(part) + "\n")
        print(f"{name}  {os.path.getsize(os.path.join(outdir, name)):,} bytes")
    print(f"{n} parts, {len(stmts)} statements")
    if whole:
        with open(whole, "w", encoding="utf-8") as fh:
            fh.write(f"-- Intelligence dataset {d['version']}: the same statements as sql-parts/5-intelligence-data, in one file for psql or the Supabase CLI. Safe to re-run.\n\n" + "\n\n".join(stmts) + "\n")
        print(f"{whole}  {os.path.getsize(whole):,} bytes")


if __name__ == "__main__":
    main()
