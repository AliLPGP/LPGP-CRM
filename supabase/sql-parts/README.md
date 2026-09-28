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

1. **`1-schema/schema_01_of_11.sql` … `schema_11_of_11.sql`** — every table,
   type, index, policy and trigger. This is the whole database. Required.
2. **`2-seed/seed_01_of_12.sql` … `seed_12_of_12.sql`** — sample firms,
   contacts, funds, commitments and service relationships. Optional: skip it if
   you're importing your own data.

**Upgrading a database that already has parts 1–8?** Run only
**`3-directory/directory_01_of_05.sql` … `directory_05_of_05.sql`** — migrations
`0013`–`0015`: the directory-intelligence tables and columns, the Form ADV
fund lineup and portfolio companies. It is the same SQL as the end of the
schema parts, cut on its own so you don't have to work out where it starts.
Then load the data in the app: **Import → Master directory**. (Discover, signed
in as an admin, shows which of these a database is still missing.)

Run one file, wait for "Success", run the next. If a part errors, fix that
before moving on — later parts build on earlier ones.

## Safe to re-run

Every part is idempotent (`create table if not exists`, `on conflict do
nothing`, and so on). Running the whole set again changes nothing, so if you
lose track of where you were, start over from part 1.

## Sizes

| Set | Parts | Largest part |
| --- | --- | --- |
| `1-schema` | 12 | 3.6 KB |
| `2-seed` | 12 | 8.1 KB |
| `3-directory` | 5 | 3.6 KB |

The schema parts are deliberately under 4 KB. The seed parts can't go that low —
a single `insert` of a dozen firms is bigger than that, and splitting inside one
would be exactly the bug these files exist to avoid.

## Regenerating

`tools/split_sql.py` produces these from `schema.sql` and the `seed*.sql` files:

```sh
python3 tools/split_sql.py schema.sql sql-parts/1-schema schema --max-bytes=3500
cat migrations/0013_directory_intelligence.sql migrations/0014_fund_lineup.sql \
    migrations/0015_portfolio_companies.sql > /tmp/directory.sql
python3 tools/split_sql.py /tmp/directory.sql sql-parts/3-directory directory --max-bytes=3500

cat seed.sql seed_companies_2.sql seed_companies_3.sql \
    seed_contacts_2.sql seed_contacts_3.sql seed_funds.sql \
    seed_commitments.sql seed_service_relationships.sql > /tmp/seed_only.sql
python3 tools/split_sql.py /tmp/seed_only.sql sql-parts/2-seed seed --max-bytes=8000
```

It only cuts on real statement boundaries — its scanner knows about quoted
strings, dollar-quoted blocks (`$$ ... $$`) and both comment forms, so a
semicolon inside any of those is not treated as the end of a statement.

It also folds typographic punctuation (em dash, ellipsis, arrow) down to ASCII
**inside comments only**. Non-ASCII inside a string literal is data — the `£` in
a cheque-size range, the `€` in a fund name — and is left untouched.
