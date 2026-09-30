# SQL to paste into the Supabase SQL editor

Paste these in order. Each file is small enough that a browser paste won't cut
it short, and each one ends on a statement boundary, so a part is never half a
statement.

## Why the parts exist

Pasting a big `.sql` file into a browser editor can silently truncate it. When
that happens the editor sends Postgres a statement that stops in the middle and
terminates it, and you get an error on a line that is perfectly valid in the
file — for example:

```
ERROR: 42601: syntax error at or near ";"
LINE 100: fund_size_usd numeric,;
```

`schema.sql` line 100 really is `fund_size_usd   numeric,` with no semicolon.
Nothing is wrong with the file; the paste just ended there. Smaller parts avoid
the problem entirely.

## Order

1. **`1-schema/schema_01_of_15.sql` … `schema_15_of_15.sql`** — every table,
   type, index, policy and trigger. This is the whole database. Required.
2. **`2-seed/seed_01_of_12.sql` … `seed_12_of_12.sql`** — sample firms,
   contacts, funds, commitments and service relationships. Optional: skip it if
   you're importing your own data.

**Upgrading a database that predates the directory (migrations `0001`–`0012`
only)?** Run only **`3-directory/directory_01_of_08.sql` …
`directory_08_of_08.sql`** — migrations `0013`–`0016`: the
directory-intelligence tables and columns, the Form ADV fund lineup, portfolio
companies, and deals, signals, sports and benchmarks. It is the same SQL as
the end of the schema parts, cut on its own so you don't have to work out
where it starts. A database that already has `0013`–`0015` needs only
**`4-intelligence/intelligence_01_of_04.sql` … `_04_of_04.sql`** (migration
`0016`). Then load the data in the app: **Import → Master directory**.
(Discover, signed in as an admin, shows which of these a database is still
missing and serves exactly those parts.)

**SEC filings (migration `0018`)** — Form D fund raises and BDC loan books,
which the database reads from EDGAR by itself once the tables exist. Run
**`6-sec-filings/filings_01_of_08.sql` … `_08_of_08.sql`** after the schema.
Its parser functions are single statements well over a hundred lines, so if
your editor cuts a paste short, run **`6-sec-filings/install_from_github.sql`**
instead: one short statement that has the database fetch and apply the whole
migration. Then queue a quarter from the SQL editor:

```sql
select ingest.enqueue_quarter(2026, 3);   -- every Form D and lender 10-Q/10-K filed in Q3 2026
```

The queue drains a batch a minute on its own (pg_cron); `select * from
ingest.status` shows progress.

**LP disclosures (migration `0019`)** — run **`7-lp-disclosures/`** after
`6-sec-filings`, then `select ingest.load_lp_disclosures();` to read CalPERS's
fund performance pages and the Australian super funds' holdings files. It
re-reads them monthly on its own.

**Adviser roster and borrowers (migrations `0020`, `0021`)** — run
**`8-adviser-roster/`** then **`9-borrowers/`** after `7-lp-disclosures`.
Then, in the SQL editor, load a roster and promote its private-fund advisers
(the JSON lives in `data/adv-roster/`):

```sql
select ingest.load_adviser_roster('<raw url of data/adv-roster/advisers-2026-05-01.json>', '2026-05-01', 'https://www.sec.gov/data-research/sec-markets-data/information-about-registered-investment-advisers-exempt-reporting-advisers');
select ingest.promote_advisers(100000000);
select ingest.refresh_borrowers();
```

**The intelligence dataset needs no SQL** — the button on Import → Master
directory loads it. If you'd rather paste it (a database the app can't reach
yet), **`5-intelligence-data/data_001_of_120.sql` … `_120_of_120.sql`** holds
the same clubs, investors, deals, signals, LP commitments, benchmarks and
portfolio companies, after `1-schema` (or `3-directory`/`4-intelligence`).
`../intelligence-data.sql` is the whole set in one file for `psql` or the
Supabase CLI, where a paste can't truncate.

**One CFO/COO portfolio (migration `0018`)** is a single idempotent `update`
on `event_targets`, folding the three old CFO series ids into `cfo-coo`. It is
the last statement of `1-schema`; a database that already has everything else
can paste `../migrations/0017_series_merge.sql` on its own. The app reads the
old ids correctly either way, so nothing waits on it.

Run one file, wait for "Success", run the next. If a part errors, fix that
before moving on — later parts build on earlier ones.

## Safe to re-run

Every part is idempotent (`create table if not exists`, `on conflict do
nothing`, and so on). Running the whole set again changes nothing, so if you
lose track of where you were, start over from part 1.

## Sizes

| Set | Parts | Largest part |
| --- | --- | --- |
| `1-schema` | 15 | 3.6 KB |
| `2-seed` | 12 | 8.1 KB |
| `3-directory` | 8 | 3.6 KB |
| `4-intelligence` | 4 | 3.5 KB |
| `5-intelligence-data` | 120 | 8.1 KB |
| `6-sec-filings` | 8 | 9.4 KB, up to 160 lines |
| `7-lp-disclosures` | see folder | long functions, as above |
| `8-adviser-roster` | 2 | 7.4 KB |
| `9-borrowers` | 1 | 7 KB |

The schema parts are deliberately under 4 KB. The seed parts can't go that low —
a single `insert` of a dozen firms is bigger than that, and splitting inside one
would be exactly the bug these files exist to avoid.

## Regenerating

`tools/split_sql.py` produces these from `schema.sql` and the `seed*.sql` files:

```sh
python3 tools/split_sql.py schema.sql sql-parts/1-schema schema --max-bytes=3500
cat migrations/0013_directory_intelligence.sql migrations/0014_fund_lineup.sql \
    migrations/0015_portfolio_companies.sql migrations/0016_intelligence.sql > /tmp/directory.sql
python3 tools/split_sql.py /tmp/directory.sql sql-parts/3-directory directory --max-bytes=3500
python3 tools/split_sql.py migrations/0016_intelligence.sql sql-parts/4-intelligence intelligence --max-bytes=3500

cat seed.sql seed_companies_2.sql seed_companies_3.sql \
    seed_contacts_2.sql seed_contacts_3.sql seed_funds.sql \
    seed_commitments.sql seed_service_relationships.sql > /tmp/seed_only.sql
python3 tools/split_sql.py /tmp/seed_only.sql sql-parts/2-seed seed --max-bytes=8000
```

The dataset parts come from `dataset.json` instead of a `.sql` source, so they
have their own tool, which also writes the one-file version:

```sh
python3 tools/dataset_to_sql.py ../data/intelligence/dataset.json sql-parts/5-intelligence-data --whole=intelligence-data.sql
```

It only cuts on real statement boundaries — its scanner knows about quoted
strings, dollar-quoted blocks (`$$ ... $$`) and both comment forms, so a
semicolon inside any of those is not treated as the end of a statement.

It also folds typographic punctuation (em dash, ellipsis, arrow) down to ASCII
**inside comments only**. Non-ASCII inside a string literal is data — the `£` in
a cheque-size range, the `€` in a fund name — and is left untouched.
