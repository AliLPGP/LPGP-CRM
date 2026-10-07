"""Read the terms a BDC's schedule of investments prints but does not tag.

The XBRL instance gives each position its fair value, cost, principal, rate
and spread (ingest.parse_bdc reads those). Many filers (Ares Capital among
them) leave industry and maturity untagged: they exist only in the HTML
schedule, industry as a section heading or a column, maturity as a column.
This reads the filing's inline-XBRL document row by row: a row belongs to the
position whose InvestmentIdentifierAxis context its tagged facts reference; the
industry is the row's "Industry" cell, else the last section heading above it
that the schedule later totals ("Total Software and Services"); the maturity is
the row's "Maturity" cell as printed (a date, a month and year, or a year).

Usage: python3 -I bdc_schedule_terms.py <filing index.json URL> <out.json>
Output: [{identifier, industry, maturity, maturity_text}] for the latest period.
Nothing is inferred: a row with no industry heading or maturity cell gets none.
"""
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request

UA = 'LPGP Research research@lpgp.example'


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode('utf-8', errors='replace')
        except Exception:
            time.sleep(2 ** attempt)
    raise RuntimeError('fetch failed: ' + url)


def text(fragment):
    t = re.sub(r'<[^>]+>', ' ', fragment)
    return re.sub(r'\s+', ' ', html.unescape(t)).replace('​', '').strip()


MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def parse_date(s):
    """A maturity as printed -> (iso date or None, text). Month-only dates take the month's last day."""
    s = (s or '').strip()
    if not s or s in ('-', '—', 'N/A', 'n/a'):
        return None, None
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$', s)
    if m:
        mo, d, y = int(m[1]), int(m[2]), int(m[3])
        y += 2000 if y < 100 else 0
        try:
            return dt.date(y, mo, d).isoformat(), s
        except ValueError:
            return None, s
    m = re.match(r'^(\d{1,2})/(\d{4})$', s)
    if m:
        mo, y = int(m[1]), int(m[2])
        if 1 <= mo <= 12:
            nxt = dt.date(y + (mo == 12), mo % 12 + 1, 1)
            return (nxt - dt.timedelta(days=1)).isoformat(), s
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', s)
    if m:
        return s, s
    m = re.match(r'^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$', s)
    if m and m[1].lower() in MONTHS:
        try:
            return dt.date(int(m[3]), MONTHS[m[1].lower()], int(m[2])).isoformat(), s
        except ValueError:
            return None, s
    m = re.match(r'^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$', s)
    if m and m[1].lower() in MONTHS:
        mo, y = MONTHS[m[1].lower()], int(m[2])
        nxt = dt.date(y + (mo == 12), mo % 12 + 1, 1)
        return (nxt - dt.timedelta(days=1)).isoformat(), s
    return None, s if re.search(r'\d{4}', s) else None


NOT_INDUSTRY = re.compile(r'(investments?\b|first lien|second lien|senior|subordinated|unsecured|secured|debt|equity|loans?\b|notes?\b|'
                          r'controlled|affiliate|portfolio|schedule|total|cash|money market|warrants?|preferred|common|'
                          r'united states|canada|europe|united kingdom|other countries|level \d|structured|collateralized|'
                          r'continued|\(continued\)|see accompanying|unaudited|^as of|percentage|net assets|company\b)', re.I)


LEGAL = re.compile(r'\b(inc|llc|l\.?l\.?c|ltd|limited|l\.?p|corp|corporation|holdings?|s\.?a|gmbh|b\.?v|plc|lp)\b\.?', re.I)


def main(index_url, out_path):
    idx = json.loads(get(index_url))
    base = index_url.rsplit('/', 1)[0] + '/'
    items = [i['name'] for i in idx['directory']['item']]
    inst = next((n for n in items if n.endswith('_htm.xml')), None)
    docs = [n for n in items if n.endswith('.htm') and not re.search(r'(ex\d|exhibit|R\d+\.htm|FilingSummary)', n, re.I)]
    if not inst or not docs:
        json.dump([], open(out_path, 'w')); return
    x = get(base + inst)
    # Investment contexts: id -> (identifier, instant)
    ctx = {}
    for cid, body in re.findall(r'<context id="([^"]+)">(.*?)</context>', x, re.S):
        m = re.search(r'InvestmentIdentifierAxis"[^>]*>\s*<[^>]+>([^<]+)<', body)
        inst_m = re.search(r'<instant>(\d{4}-\d\d-\d\d)</instant>', body)
        if m and inst_m:
            ctx[cid] = (html.unescape(m[1]).strip(), inst_m[1])
    if not ctx:
        json.dump([], open(out_path, 'w')); return
    latest = max(v[1] for v in ctx.values())
    # the main document is the largest .htm in the filing
    size = {i['name']: int(i.get('size') or 0) for i in idx['directory']['item'] if str(i.get('size') or '').isdigit()}
    doc = get(base + max(docs, key=lambda n: size.get(n, 0)))

    out = {}
    date_heads = []        # the header's date columns in order ("Acquisition Date", "Maturity Date")
    mat_k = None           # which of them is the maturity
    col_ind = None         # an "Industry" column's position, when the schedule has one
    head_width = 0
    heading = None         # the last industry heading, carried across page breaks
    borrower_industry = {}
    for table in re.findall(r'<table\b.*?</table>', doc, re.S | re.I):
        # only the schedule itself: a table that carries its column header
        if 'contextRef' not in table or not re.search(r'>[^<]*\bMaturity\b', table, re.I):
            continue
        for r in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table, re.S | re.I):
            cells, pos = [], 0
            for attrs, body in re.findall(r'<t[dh]\b([^>]*)>(.*?)</t[dh]>', r, re.S | re.I):
                span = int((re.search(r'colspan="?(\d+)', attrs, re.I) or [0, 1])[1])
                cells.append((pos, span, text(body)))
                pos += span
            nonempty = [(p_, t) for p_, sp, t in cells if t]
            if not nonempty:
                continue
            refs = set(re.findall(r'contextRef="([^"]+)"', r))
            inv = [c for c in refs if c in ctx and ctx[c][1] == latest]
            if not inv and len(nonempty) >= 4 and any(re.search(r'\bmaturity\b', t.lower()) for _, t in nonempty):
                date_heads = [t.lower() for _, t in nonempty if re.search(r'\b(date|maturity|matures?)\b', t.lower())]
                mat_k = next((k for k, t in enumerate(date_heads) if 'maturity' in t or 'matur' in t), None)
                col_ind = next((p_ for p_, t in nonempty if t.lower().startswith('industry')), None)
                head_width = pos
                continue
            if not inv:
                t0 = nonempty[0][1]
                if len(nonempty) == 1 and not re.search(r'\d', t0) and 3 <= len(t0) < 80 \
                        and not NOT_INDUSTRY.search(t0) and not LEGAL.search(t0):
                    heading = t0
                continue
            ident = ctx[inv[0]][0]
            borrower = re.split(r'\s*\|\s*', ident)[0].strip().lower()
            industry = None
            if col_ind is not None and head_width and pos >= head_width * 0.75:
                industry = next((t for p_, sp, t in cells if p_ <= col_ind < p_ + sp and t), None)
                if industry and (re.search(r'^[\d$%(]', industry) or len(industry) > 80):
                    industry = None
                if industry:
                    borrower_industry[borrower] = industry
            if col_ind is None:
                industry = heading
            dates = [t for _, sp, t in cells if t and parse_date(t)[0] and re.search(r'[/A-Za-z-]', t)]
            mat = None
            if mat_k is not None and len(dates) == len(date_heads):
                mat = dates[mat_k]
            elif mat_k is not None and len(date_heads) == 1 and len(dates) == 1:
                mat = dates[0]
            elif mat_k is not None and dates:
                # a blank acquisition date: the maturity is the date after the
                # schedule's own date (an acquisition never is)
                later = [d_ for d_ in dates if parse_date(d_)[0] > latest]
                mat = later[-1] if len(later) == 1 else None
            iso, t = parse_date(mat)
            rec = out.setdefault(ident, {'identifier': ident, 'borrower': borrower, 'industry': None, 'maturity': None, 'maturity_text': None})
            rec['industry'] = rec['industry'] or industry
            if iso and not rec['maturity']:
                rec['maturity'], rec['maturity_text'] = iso, t
    for rec in out.values():
        rec['industry'] = rec['industry'] or borrower_industry.get(rec.pop('borrower'))
    json.dump({'as_of': latest, 'rows': list(out.values())}, open(out_path, 'w'))
    n = len(out); ni = sum(1 for v in out.values() if v['industry']); nm = sum(1 for v in out.values() if v['maturity'])
    print(f'{index_url} as_of={latest} positions={n} industry={ni} maturity={nm}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
