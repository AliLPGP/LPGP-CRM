#!/usr/bin/env python3
"""
Turn LP disclosure extractions (data/lp-disclosures/*.json, the schema in
research/lp/validate.py) into idempotent SQL the database runs itself: one
file per source document, each a single DO block that creates the LP if the
directory lacks it, finds or creates a fund record per row (linked to the
manager when the directory names one), and upserts a commitment with the
performance figures the document prints.

    python3 supabase/tools/lp_disclosures_to_sql.py data/lp-disclosures supabase/lp-disclosures

Needs migrations 0018 and 0019 (ingest.lp_company, ingest.fund_for). Re-run
freely: rows are keyed by document and fund name.
"""
import glob, hashlib, json, os, re, sys


def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".sql"):
            os.remove(os.path.join(outdir, f))
    index = []
    for path in sorted(glob.glob(os.path.join(src, "*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        doc = os.path.splitext(os.path.basename(path))[0]
        lp_slug = slug(d["lp_name"])
        lines = [
            f"-- {doc}: {d['lp_name']} -- {d.get('source_title') or d['source_url']} (as of {d['as_of']}, {d['currency']}). Generated; re-run freely.",
            "do $$",
            "declare v_lp uuid; f record;",
            "begin",
            (f"  v_lp := {q(d['lp_company_id'])}::uuid;" if d.get('lp_company_id') else f"  v_lp := ingest.lp_company({q(d['lp_name'])}, {q(d['lp_type'])}, {q(d['country'])}, {q(d.get('website'))});"),
        ]
        for r in d["rows"]:
            name = re.sub(r"\s+", " ", r["fund_name"]).strip()
            cls = r.get("asset_class") or d.get("asset_class")
            key = f"lpdoc:{lp_slug}:{doc}:{hashlib.md5(name.lower().encode()).hexdigest()}"
            page = r.get("page")
            label = (d.get("source_title") or "LP disclosure") + (f" (p. {page})" if page else "")
            lines.append(f"  select * into f from ingest.fund_for({q(name)}, {q(r.get('vintage_year'))}, {q(cls)});")
            lines.append(
                "  insert into public.commitments as c (external_key, lp_company_id, gp_company_id, fund_id, lp_name, gp_name, fund_name, amount, currency, commitment_year, "
                "asset_class, contributed, distributed, remaining_value, net_irr, multiple, as_of, disclosure_type, source, source_url, source_date)\n"
                f"  values ({q(key)}, v_lp, f.gp_company_id, f.fund_id, {q(d['lp_name'])}, coalesce({q(r.get('gp_name'))}, (select name from public.companies where id = f.gp_company_id)), {q(name)}, "
                f"{q(r.get('commitment'))}, {q(d['currency'])}, {q(r.get('vintage_year'))}, {q(cls)}, {q(r.get('contributed'))}, {q(r.get('distributed'))}, {q(r.get('remaining_value'))}, "
                f"{q(r.get('net_irr'))}, {q(r.get('multiple'))}, {q(d['as_of'])}, {q(label)}, 'lp_disclosure', {q(d['source_url'])}, {q(d['as_of'])})\n"
                "  on conflict (external_key) do update set gp_company_id = coalesce(excluded.gp_company_id, c.gp_company_id), fund_id = coalesce(excluded.fund_id, c.fund_id), "
                "gp_name = coalesce(excluded.gp_name, c.gp_name), amount = excluded.amount, commitment_year = excluded.commitment_year, asset_class = excluded.asset_class, "
                "contributed = excluded.contributed, distributed = excluded.distributed, remaining_value = excluded.remaining_value, net_irr = excluded.net_irr, multiple = excluded.multiple, "
                "as_of = excluded.as_of, disclosure_type = excluded.disclosure_type, source_url = excluded.source_url, source_date = excluded.source_date;"
            )
        lines.append(
            f"  update public.companies set discloses_commitments = coalesce(discloses_commitments, {q('Yes - ' + (d.get('source_title') or 'published fund list'))}), "
            f"disclosure_source_url = coalesce(disclosure_source_url, {q(d['source_url'])}) where id = v_lp;"
        )
        lines.append(f"  insert into ingest.log (what, detail) values ('load_lp_document', jsonb_build_object('lp', {q(d['lp_name'])}, 'doc', {q(doc)}, 'rows', {len(d['rows'])}));")
        lines.append("end $$;")
        out = os.path.join(outdir, doc + ".sql")
        with open(out, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
        index.append((doc, d["lp_name"], len(d["rows"]), os.path.getsize(out)))
    for doc, lp, n, size in index:
        print(f"{doc:40s} {lp:45s} {n:5d} rows {size:9,d} bytes")
    print(f"{len(index)} documents, {sum(i[2] for i in index)} rows")


if __name__ == "__main__":
    main()
