"""Every private fund an adviser reports on Form ADV Schedule D 7.B.(1), as of
its latest filing in the SEC's Form ADV data set
(https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data).

A private fund carries a permanent SEC identifier (805-…) across filings, so
each fund is read from the highest FilingID that reports it. Its service
providers come from the same filing's sub-tables, keyed by FilingID and
ReferenceID: auditors (7.B.1.A.23), prime brokers (24), custodians (25),
administrators (26), marketers / placement agents (28), and the Form D file
numbers it filed under (22). The adviser is the filing's CRD (Item 1.E.1).

Usage: python3 -I adv_private_funds.py <dir with the extracted CSVs> <out.jsonl>
Nothing is inferred: a blank in the filing is a blank here.
"""
import csv
import json
import re
import sys
from collections import defaultdict

csv.field_size_limit(1 << 30)
D = sys.argv[1].rstrip('/') + '/'
OUT = sys.argv[2]


def rows(name):
    with open(D + name, newline='', encoding='latin-1') as f:
        yield from csv.DictReader(f)


def num(v):
    try:
        return float(v) if v not in (None, '') else None
    except ValueError:
        return None


# FilingID -> (crd, submitted)
filing = {}
for name, crd_col in (('IA_ADV_Base_A_20111105_20241231.csv', '1E1'), ('ERA_ADV_Base_20111105_20241231.csv', '1E1')):
    try:
        for r in rows(name):
            m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', r.get('DateSubmitted') or '')
            filing[r['FilingID']] = (r.get(crd_col) or None, f'{m[3]}-{int(m[1]):02d}-{int(m[2]):02d}' if m else None)
    except FileNotFoundError:
        print('missing', name, file=sys.stderr)
print('filings', len(filing), file=sys.stderr)

# Latest report of each fund
latest = {}
for book in ('IA', 'ERA'):
    for r in rows(f'{book}_Schedule_D_7B1_20111105_20241231.csv'):
        fid = (r.get('Fund ID') or '').strip()
        if not fid:
            continue
        cur = latest.get(fid)
        if cur is None or int(r['FilingID']) > int(cur['FilingID']):
            r['_book'] = book
            latest[fid] = r
print('funds', len(latest), file=sys.stderr)

key_of = {(r['FilingID'], r['ReferenceID']): fid for fid, r in latest.items()}
sub = defaultdict(lambda: defaultdict(list))
SUBS = {
    '7B1A23': ('auditor', 'Name of Auditing Firm'),
    '7B1A24': ('prime_broker', 'Name of Prime Broker'),
    '7B1A25': ('custodian', 'Primary Business Name'),
    '7B1A26': ('administrator', 'Name of Administrator'),
    '7B1A28': ('placement_agent', 'Name of Marketer'),
}
for book in ('IA', 'ERA'):
    for code, (role, col) in SUBS.items():
        for r in rows(f'{book}_Schedule_D_{code}_20111105_20241231.csv'):
            fid = key_of.get((r['FilingID'], r['ReferenceID']))
            if not fid:
                continue
            nm = (r.get(col) or '').strip() or (r.get('Legal Name of Custodian') or '').strip()
            if nm:
                sub[fid][role].append({'name': nm, 'city': (r.get('City') or '').strip() or None,
                                       'country': (r.get('Country') or '').strip() or None})
    for r in rows(f'{book}_Schedule_D_7B1A22_20111105_20241231.csv'):
        fid = key_of.get((r['FilingID'], r['ReferenceID']))
        if fid and r.get('Form D File Number'):
            sub[fid]['form_d'].append(r['Form D File Number'].strip())

with open(OUT, 'w') as out:
    for fid, r in latest.items():
        crd, submitted = filing.get(r['FilingID'], (None, None))
        s = sub.get(fid, {})
        providers = []
        seen = set()
        for role in ('auditor', 'administrator', 'custodian', 'prime_broker', 'placement_agent'):
            for p in s.get(role, []):
                k = (role, p['name'].upper())
                if k not in seen:
                    seen.add(k)
                    providers.append({'role': role, **p})
        out.write(json.dumps({
            'adv_fund_id': fid,
            'name': (r.get('Fund Name') or '').strip(),
            'adviser_crd': crd,
            'book': r['_book'],
            'filing_id': int(r['FilingID']),
            'submitted': submitted,
            'fund_type': (r.get('Fund Type') or '').strip() or None,
            'fund_type_other': (r.get('Fund Type Other') or '').strip() or None,
            'gross_asset_value': num(r.get('Gross Asset Value')),
            'minimum_investment': num(r.get('Minimum Investment')),
            'owners': num(r.get('Owners')),
            'pct_non_us': num(r.get('%Owned Non-US')),
            'country': (r.get('Country') or '').strip() or None,
            'state': (r.get('State') or '').strip() or None,
            'master_fund': (r.get('Master Fund Name') or '').strip() or None,
            'is_feeder': r.get('Feeder Fund') == 'Y',
            'is_fund_of_funds': r.get('Fund of Funds') == 'Y',
            'annual_audit': r.get('Annual Audit') == 'Y',
            'providers': providers,
            'form_d_file_numbers': sorted(set(s.get('form_d', []))),
        }) + '\n')
print('written', len(latest), file=sys.stderr)
