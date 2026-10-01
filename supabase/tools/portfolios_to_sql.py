#!/usr/bin/env python3
"""
Turn sponsor portfolio research into data the repository keeps and SQL the
database runs itself.

    python3 supabase/tools/portfolios_to_sql.py <research dir> data/portfolios supabase/portfolios

<research dir> holds what the research agents wrote:
  lists/<slug>.json     {"sponsor": {...}, "method": "...", "companies": [...]}
  verified/<slug>.json  {"sponsor": {...}, "deals": [...]}  (deals re-read against their pages)

Only fact-checked deals are used: a sponsor whose deals have not been
verified yet contributes its company list and no deals. For each sponsor
this writes data/portfolios/<slug>.json (public facts: names, sectors,
headquarters, the pages that state them, and the money as the releases state
it) and supabase/portfolios/<slug>.sql, one DO block that finds the sponsor
in the directory by name, upserts its portfolio companies and the deals into
public.deals, keyed so a re-run updates rather than duplicates.

The rules the data follows (and this script enforces):
- a company needs the page that names it as the sponsor's investment;
- an amount needs its currency and a basis, else it is dropped, never guessed;
- a deal the fact-check refuted is already gone; one whose page was
  unreachable at the check is kept with verified = false;
- a portfolio company's own deal fields come from the earliest verified entry
  deal (buyout, minority, round) in which the sponsor took part.
"""
import hashlib, json, os, re, sys, unicodedata
from datetime import date

KINDS = {"company_acquisition", "minority_investment", "funding_round", "add_on_acquisition", "debt_financing", "ipo", "company_exit", "secondary", "other"}
ENTRY_KINDS = {"company_acquisition", "minority_investment", "funding_round"}
BASES = {"enterprise_value", "equity_value", "round_size", "stake_price", "debt", "unspecified"}
STATUSES = {"current", "realized"}
THIS_YEAR = date.today().year

# How each sponsor is named in a release, beyond its full name.
ALIASES = {
    "blackstone": ["blackstone"], "kkr": ["kkr", "kohlberg kravis"], "apollo": ["apollo"], "carlyle": ["carlyle"],
    "eqt": ["eqt"], "tpg": ["tpg", "the rise fund"], "bain-capital": ["bain capital"], "cvc": ["cvc"], "advent": ["advent international", "advent"],
    "warburg-pincus": ["warburg pincus"], "thoma-bravo": ["thoma bravo"], "vista": ["vista equity"], "silver-lake": ["silver lake"],
    "hellman-friedman": ["hellman", "h&f"], "cdr": ["clayton, dubilier", "clayton dubilier", "cd&r"], "permira": ["permira"], "cinven": ["cinven"],
    "general-atlantic": ["general atlantic"], "insight-partners": ["insight partners", "insight venture"], "brookfield": ["brookfield"],
    "ardian": ["ardian"], "partners-group": ["partners group"], "apax": ["apax"], "bc-partners": ["bc partners"], "pai": ["pai partners"],
    "nordic-capital": ["nordic capital"], "triton": ["triton"], "bridgepoint": ["bridgepoint"], "3i": ["3i"], "leonard-green": ["leonard green"],
    "gtcr": ["gtcr"], "hig": ["h.i.g", "hig capital"], "platinum-equity": ["platinum equity"], "veritas": ["veritas capital"], "genstar": ["genstar"],
    "francisco-partners": ["francisco partners"], "ta-associates": ["ta associates"], "summit-partners": ["summit partners"], "roark": ["roark"],
    "clearlake": ["clearlake"], "stone-point": ["stone point"], "centerbridge": ["centerbridge"], "berkshire-partners": ["berkshire partners"],
    "american-securities": ["american securities"], "sycamore": ["sycamore partners"], "aea": ["aea investors", "aea"], "wcas": ["welsh, carson", "welsh carson", "wcas"],
    "kps": ["kps capital", "kps"], "charlesbank": ["charlesbank"], "gi-partners": ["gi partners"], "alpine": ["alpine investors"],
    "providence": ["providence equity"], "tcv": ["tcv", "technology crossover"], "arlington": ["arlington capital"], "cerberus": ["cerberus"],
    "fortress": ["fortress"], "lone-star": ["lone star"], "aip": ["american industrial partners"], "oep": ["one equity partners"], "mbk": ["mbk partners", "mbk"],
    "pep": ["pacific equity partners"], "kohlberg": ["kohlberg & co", "kohlberg and co", "kohlberg & company"], "tsg": ["tsg consumer", "tsg"], "ftv": ["ftv capital", "ftv"],
    "golden-gate": ["golden gate capital"], "olympus": ["olympus partners"], "court-square": ["court square"], "kinderhook": ["kinderhook"], "llr": ["llr partners", "llr"],
    "frazier": ["frazier healthcare", "frazier"], "charterhouse": ["charterhouse"], "gho": ["gho capital", "gho"], "ecp": ["energy capital partners", "ecp"],
    "wind-point": ["wind point"], "jf-lehman": ["j.f. lehman", "jf lehman", "jfl"], "gip": ["global infrastructure partners", "gip"], "accel": ["accel"],
    "a16z": ["andreessen horowitz", "a16z"], "lightspeed": ["lightspeed"], "tiger-global": ["tiger global"],
}

INVESTOR_PREFIX = re.compile(
    r"^(?:certain\s+)?(?:private equity |investment |infrastructure |growth )?(?:funds?|vehicles?|entities|affiliates?)\s+(?:managed|advised|affiliated|controlled)?\s*(?:by|of|with)\s+|^(?:an?\s+)?affiliates?\s+of\s+",
    re.I,
)


def strip_accents(s):
    return "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))


def portfolio_slug(name):
    """Mirror of portfolioKey()'s slug in lib/directory/portfolio.ts."""
    s = strip_accents(name).lower().replace("&", " and ")
    s = re.sub(r"\b(inc|llc|ltd|limited|corp|corporation|gmbh|plc|sa|ag|bv|co)\b\.?", " ", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "unnamed"


def norm_domain(v):
    """Mirror of normDomain() in lib/directory/normalize.ts."""
    if not v or not isinstance(v, str):
        return None
    v = v.strip().lower()
    if not v or not re.search(r"[a-z0-9-]+\.[a-z]{2,}", v):
        return None
    host = re.split(r"[/?#\s]", re.sub(r"^www\.", "", re.sub(r"^[a-z]+://", "", v)))[0]
    return host or None


GENERIC = r"(inc|incorporated|llc|lp|ltd|limited|corp|corporation|co|company|holdings?|group|plc|sa|ag|gmbh|bv|nv|the|srl|spa|sas|ab|oy|as)"


def fold(name):
    s = strip_accents(name or "").lower().replace("&", " and ")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    # Dotted legal forms come apart into letters once the dots go ("S.p.A." -> "s p a").
    s = re.sub(r"\b(s p a|s a s|s r l|s a|n v|b v|l l c|l p|p l c|a b|a s)\b", " ", s)
    s = re.sub(rf"\b{GENERIC}\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def text(v, n=None):
    if v is None or not isinstance(v, (str, int, float)):
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    if not s or s.lower() in {"null", "none", "n/a", "unknown", "-"}:
        return None
    return s[:n] if n else s


def year(v):
    try:
        y = int(str(v)[:4])
    except (TypeError, ValueError):
        return None
    return y if 1950 <= y <= THIS_YEAR else None


def url(v):
    s = text(v, 600)
    return s if s and re.match(r"^https?://", s) else None


def money(v):
    if isinstance(v, bool) or v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x > 0 and x < 5e13 else None


def iso_date(v):
    s = text(v)
    if not s or not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return None
    try:
        d = date.fromisoformat(s)
    except ValueError:
        return None
    return s if 1990 <= d.year <= THIS_YEAR + 1 else None


def sponsor_in(s, aliases):
    t = " " + strip_accents(s or "").lower() + " "
    return any(re.search(r"(?<![a-z0-9])" + re.escape(a) + r"(?![a-z0-9])", t) for a in aliases)


def clean_investor(s):
    s = text(s, 200)
    if not s:
        return None
    return INVESTOR_PREFIX.sub("", s).strip() or s


def load(path):
    with open(path, encoding="utf8") as f:
        return json.load(f)


def build(slug, lst, ver):
    sp = lst.get("sponsor") or {}
    name = sp.get("name") or slug
    directory_name = sp.get("directory_name") or name
    aliases = ALIASES.get(slug) or [fold(name)]

    companies, by_fold = [], {}
    for c in lst.get("companies") or []:
        nm = text(c.get("name"), 200)
        src = url(c.get("source_url"))
        if not nm or not src:
            continue
        f = fold(nm)
        if not f or f in by_fold:
            continue
        status = text(c.get("status"))
        row = {
            "name": nm,
            "slug": portfolio_slug(nm),
            "domain": norm_domain(c.get("website")),
            "description": text(c.get("description"), 600),
            "sector": text(c.get("sector"), 120),
            "hq": text(c.get("hq"), 160),
            "status": status if status in STATUSES else None,
            "invested_year": year(c.get("invested_year")),
            "exit_year": year(c.get("exit_year")),
            "fund_name": text(c.get("fund_name"), 200),
            "source_url": src,
            "status_note": text(c.get("status_note"), 300),
            "deal_type": text(c.get("deal_type"), 80),
            "asset_class": text(c.get("asset_class"), 80),
            "value_creation_plan": text(c.get("value_creation_plan"), 600),
            "value_creation_source_url": url(c.get("value_creation_source_url")),
        }
        by_fold[f] = row
        companies.append(row)
    slugs = {}
    for c in companies:  # two names can share a slug; keep the first
        slugs.setdefault(c["slug"], c)
    companies = list(slugs.values())
    by_fold = {fold(c["name"]): c for c in companies}

    def match(target):
        f = fold(target)
        if not f:
            return None
        if f in by_fold:
            return by_fold[f]
        hits = [c for k, c in by_fold.items() if len(min(k, f, key=len)) >= 5 and (k.startswith(f + " ") or f.startswith(k + " "))]
        return hits[0] if len(hits) == 1 else None

    deals, seen = [], set()
    for d in (ver or {}).get("deals") or []:
        target = text(d.get("target"), 200)
        src = url(d.get("source_url"))
        if not target or not src or d.get("verdict") == "refuted":
            continue
        kind = text(d.get("kind")) or "other"
        kind = kind if kind in KINDS else "other"
        amount, currency, basis = money(d.get("amount")), text(d.get("currency")), text(d.get("amount_basis"))
        currency = currency.upper() if currency and re.match(r"^[A-Za-z]{3}$", currency) else None
        if amount is None or currency is None:
            amount, currency, basis = None, None, None
        else:
            basis = basis if basis in BASES else "unspecified"
        valuation, vcur = money(d.get("valuation")), text(d.get("valuation_currency"))
        vcur = vcur.upper() if vcur and re.match(r"^[A-Za-z]{3}$", vcur) else None
        if valuation is None or vcur is None:
            valuation, vcur = None, None
        stake = d.get("stake_pct")
        stake = float(stake) if isinstance(stake, (int, float)) and not isinstance(stake, bool) and 0 < stake <= 100 else None
        investor = clean_investor(d.get("investor")) or "Undisclosed"
        co = []
        for x in d.get("co_investors") or []:
            x = clean_investor(x)
            if x and x != investor and x not in co:
                co.append(x)
        seller = clean_investor(d.get("seller"))
        dt = iso_date(d.get("date"))
        date_text = text(d.get("date_text"), 60)
        role = "investor" if sponsor_in(investor, aliases) else "co_investor" if any(sponsor_in(x, aliases) for x in co) else "seller" if sponsor_in(seller, aliases) else None

        pc = match(target)
        # A company the sponsor bought or backed, named only in a release, joins the portfolio with that release as its source.
        if pc is None and role in ("investor", "co_investor") and kind in ENTRY_KINDS:
            pc = {
                "name": target, "slug": portfolio_slug(target), "domain": norm_domain(d.get("target_website")), "description": None,
                "sector": None, "hq": None, "status": None, "invested_year": year(dt or date_text), "exit_year": None, "fund_name": None, "source_url": src,
                "from_press": True,
            }
            if pc["slug"] not in slugs:
                slugs[pc["slug"]] = pc
                companies.append(pc)
                by_fold[fold(target)] = pc
            else:
                pc = slugs[pc["slug"]]
        if pc is not None and kind == "company_exit" and (role == "seller" or role is None):
            pc["status"] = pc["status"] or "realized"
            pc["exit_year"] = pc["exit_year"] or year(dt or date_text)

        key_src = "|".join([fold(target), dt or date_text or "", kind, str(amount or ""), currency or "", "" if (dt or amount) else src])
        key = "pr:" + hashlib.md5(key_src.encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        verified = d.get("verified")
        deals.append({
            "key": key,
            "date": dt,
            "date_text": date_text if not dt else None,
            "kind": kind,
            "asset_class": "infrastructure" if slug in ("gip", "ecp") else "venture_capital" if kind == "funding_round" else "private_equity",
            "target": target,
            "portco_name": pc["name"] if pc else None,
            "target_website": norm_domain(d.get("target_website")),
            "investor": investor,
            "sponsor_is_investor": role == "investor",
            "sponsor_role": role,
            "co_investors": co[:20],
            "seller": seller,
            "round": text(d.get("round"), 60),
            "stake_pct": stake,
            "amount": amount,
            "currency": currency,
            "amount_basis": basis,
            "valuation": valuation,
            "valuation_currency": vcur,
            "headline": text(d.get("headline"), 300) or f"{investor} {kind.replace('_', ' ')}: {target}",
            "summary": text(d.get("summary"), 600),
            "source_name": text(d.get("source_name"), 120),
            "source_url": src,
            "evidence": text(d.get("evidence"), 1200),
            "verified": verified if isinstance(verified, bool) else None,
        })

    # Each company's entry deal: the earliest verified buyout, minority stake or round the sponsor took part in, with a stated amount.
    for c in companies:
        entry = [d for d in deals if d["portco_name"] == c["name"] and d["kind"] in ENTRY_KINDS and d["sponsor_role"] in ("investor", "co_investor") and d["amount"] and d["verified"]]
        entry.sort(key=lambda d: d["date"] or "9999")
        if entry:
            e = entry[0]
            c.update({
                "deal_value": e["amount"], "deal_currency": e["currency"], "deal_value_basis": e["amount_basis"], "stake_pct": e["stake_pct"],
                "co_investors": [x for x in ([e["investor"]] if e["sponsor_role"] == "co_investor" else []) + e["co_investors"] if not sponsor_in(x, aliases)][:12],
                "deal_source_url": e["source_url"],
            })
            if not c["invested_year"]:
                c["invested_year"] = year(e["date"])
        else:
            c.update({"deal_value": None, "deal_currency": None, "deal_value_basis": None, "stake_pct": None, "co_investors": [], "deal_source_url": None})

    return {
        "sponsor": {"name": name, "directory_name": directory_name, "slug": slug, "domain": sp.get("domain")},
        "method": text(lst.get("method"), 400),
        "verified_deals": ver is not None,
        "companies": companies,
        "deals": deals,
    }


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def to_sql(doc):
    body = json.dumps({"companies": doc["companies"], "deals": doc["deals"]}, ensure_ascii=False, separators=(",", ":"))
    tag = "pf"
    while f"${tag}$" in body:
        tag += "x"
    sp = doc["sponsor"]
    return f"""-- {sp['name']}: {len(doc['companies'])} portfolio companies, {len(doc['deals'])} fact-checked deals.
-- Generated by supabase/tools/portfolios_to_sql.py from data/portfolios/{sp['slug']}.json. Idempotent.
do $pfdo$
declare
  gp uuid;
  doc jsonb := ${tag}${body}${tag}$::jsonb;
  n_companies int;
  n_deals int;
begin
  select id into gp from public.companies
   where category = 'GP' and name = {q(sp['directory_name'])}
   order by (source = 'master_directory') desc nulls last, created_at
   limit 1;
  if gp is null then raise exception 'sponsor % is not in the directory', {q(sp['directory_name'])}; end if;

  insert into public.portfolio_companies as pc (external_key, gp_company_id, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name,
      source, source_url, deal_value, deal_currency, deal_value_basis, stake_pct, co_investors, deal_source_url, researched_at, status_note, deal_type, asset_class, value_creation_plan, value_creation_source_url)
  select gp::text || ':' || (c->>'slug'), gp, c->>'name', c->>'domain', c->>'description', c->>'sector', c->>'hq', c->>'status',
         (c->>'invested_year')::int, (c->>'exit_year')::int, c->>'fund_name', 'web_research', c->>'source_url',
         (c->>'deal_value')::numeric, c->>'deal_currency', c->>'deal_value_basis', (c->>'stake_pct')::numeric,
         coalesce(array(select jsonb_array_elements_text(c->'co_investors')), '{{}}'), c->>'deal_source_url', now(), c->>'status_note', c->>'deal_type', c->>'asset_class', c->>'value_creation_plan', c->>'value_creation_source_url'
    from jsonb_array_elements(doc->'companies') c
  on conflict (external_key) do update set
    name = case when pc.source = 'manual' then pc.name else excluded.name end,
    domain = coalesce(pc.domain, excluded.domain),
    description = case when pc.source = 'manual' then coalesce(pc.description, excluded.description) else coalesce(excluded.description, pc.description) end,
    sector = case when pc.source = 'manual' then coalesce(pc.sector, excluded.sector) else coalesce(excluded.sector, pc.sector) end,
    hq = case when pc.source = 'manual' then coalesce(pc.hq, excluded.hq) else coalesce(excluded.hq, pc.hq) end,
    status = coalesce(excluded.status, pc.status),
    invested_year = coalesce(excluded.invested_year, pc.invested_year),
    exit_year = coalesce(excluded.exit_year, pc.exit_year),
    fund_name = coalesce(excluded.fund_name, pc.fund_name),
    source_url = case when pc.source = 'manual' then coalesce(pc.source_url, excluded.source_url) else excluded.source_url end,
    deal_value = coalesce(excluded.deal_value, pc.deal_value),
    deal_currency = case when excluded.deal_value is not null then excluded.deal_currency else pc.deal_currency end,
    deal_value_basis = case when excluded.deal_value is not null then excluded.deal_value_basis else pc.deal_value_basis end,
    stake_pct = coalesce(excluded.stake_pct, pc.stake_pct),
    co_investors = case when cardinality(excluded.co_investors) > 0 then excluded.co_investors else pc.co_investors end,
    deal_source_url = coalesce(excluded.deal_source_url, pc.deal_source_url),
    status_note = coalesce(excluded.status_note, pc.status_note), deal_type = coalesce(excluded.deal_type, pc.deal_type), asset_class = coalesce(excluded.asset_class, pc.asset_class),
    value_creation_plan = coalesce(excluded.value_creation_plan, pc.value_creation_plan), value_creation_source_url = coalesce(excluded.value_creation_source_url, pc.value_creation_source_url),
    researched_at = now();
  get diagnostics n_companies = row_count;

  insert into public.deals as d (external_key, date, date_text, kind, asset_class, target, target_kind, target_key, target_website, investor, investor_company_id,
      co_investors, seller, round, stake_pct, amount, currency, amount_basis, valuation, valuation_currency, headline, summary, source_name, source_url,
      evidence, verified, source)
  select x->>'key', (x->>'date')::date, x->>'date_text', x->>'kind', x->>'asset_class', x->>'target', 'company',
         public.borrower_key(coalesce(x->>'portco_name', x->>'target')), x->>'target_website', x->>'investor',
         case when (x->>'sponsor_is_investor')::boolean then gp else (select m.company_id from ingest.match_firm(x->>'investor', array['GP']) m) end,
         coalesce(array(select jsonb_array_elements_text(x->'co_investors')), '{{}}'), x->>'seller', x->>'round', (x->>'stake_pct')::numeric,
         (x->>'amount')::numeric, x->>'currency', x->>'amount_basis', (x->>'valuation')::numeric, x->>'valuation_currency',
         x->>'headline', x->>'summary', x->>'source_name', x->>'source_url', x->>'evidence', (x->>'verified')::boolean, 'web_research'
    from jsonb_array_elements(doc->'deals') x
  on conflict (external_key) do update set
    date = excluded.date, date_text = excluded.date_text, kind = excluded.kind, target = excluded.target, target_key = excluded.target_key,
    target_website = coalesce(excluded.target_website, d.target_website), investor = excluded.investor,
    investor_company_id = coalesce(excluded.investor_company_id, d.investor_company_id),
    co_investors = (select coalesce(array_agg(distinct v), '{{}}') from unnest(d.co_investors || excluded.co_investors) v),
    seller = coalesce(excluded.seller, d.seller), round = coalesce(excluded.round, d.round), stake_pct = coalesce(excluded.stake_pct, d.stake_pct),
    amount = excluded.amount, currency = excluded.currency, amount_basis = excluded.amount_basis,
    valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, headline = excluded.headline,
    summary = coalesce(excluded.summary, d.summary), source_name = excluded.source_name, source_url = excluded.source_url,
    evidence = excluded.evidence, verified = coalesce(excluded.verified, d.verified);
  get diagnostics n_deals = row_count;

  update public.companies set portfolio_note = {q(doc.get('method'))}, portfolio_researched_at = now() where id = gp;
  insert into ingest.log (what, detail) values ('load_portfolio', jsonb_build_object('sponsor', {q(sp['name'])}, 'companies', n_companies, 'deals', n_deals));
end $pfdo$;
"""


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    research, data_dir, sql_dir = sys.argv[1:]
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(sql_dir, exist_ok=True)
    total_c = total_d = 0
    written = []
    for fn in sorted(os.listdir(os.path.join(research, "lists"))):
        if not fn.endswith(".json"):
            continue
        slug = fn[:-5]
        try:
            lst = load(os.path.join(research, "lists", fn))
        except (OSError, json.JSONDecodeError) as e:
            print(f"skip {slug}: list unreadable ({e})")
            continue
        vpath = os.path.join(research, "verified", fn)
        ver = None
        if os.path.exists(vpath):
            try:
                ver = load(vpath)
            except (OSError, json.JSONDecodeError) as e:
                print(f"{slug}: verified deals unreadable ({e}); list only")
        doc = build(slug, lst, ver)
        if not doc["companies"]:
            print(f"skip {slug}: no companies with a source")
            continue
        with open(os.path.join(data_dir, slug + ".json"), "w", encoding="utf8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        with open(os.path.join(sql_dir, slug + ".sql"), "w", encoding="utf8") as f:
            f.write(to_sql(doc))
        written.append(slug)
        nd = len(doc["deals"])
        na = sum(1 for d in doc["deals"] if d["amount"])
        total_c += len(doc["companies"])
        total_d += nd
        print(f"{slug:24} {len(doc['companies']):5} companies  {nd:4} deals ({na} with an amount){'' if doc['verified_deals'] else '  [deals not verified yet]'}")
    with open(os.path.join(sql_dir, "manifest.txt"), "w") as f:
        f.write("\n".join(s + ".sql" for s in written) + "\n")
    print(f"{len(written)} sponsors, {total_c} portfolio companies, {total_d} deals")


if __name__ == "__main__":
    main()
