# Sponsor portfolios

One file per sponsor: every portfolio company the research could substantiate,
each with the page that names it as the sponsor's investment, and the
announcements that put money into those companies, each re-read against its
own page before it was kept.

- `companies[]` — name, website, sector, HQ, status (current / realized only
  when the source says), investment and exit years, fund, `source_url`, and
  the company's entry deal when an announcement states one (`deal_value`,
  `deal_currency`, `deal_value_basis`, `stake_pct`, `co_investors`,
  `deal_source_url`).
- `deals[]` — target, kind, round, date, lead investor and co-investors,
  seller, amount with its currency and what it is (`amount_basis`), stated
  valuation and stake, headline, publisher, `source_url`, the verbatim
  `evidence` sentence, and `verified` (true: re-read and confirmed or
  corrected; false: the page could not be re-read at the check).

Nothing is estimated or converted: a figure no page states is null, and money
stays in the currency the page used. Sources are sponsors' own portfolio pages
(often their structured JSON), press releases on the wires and the companies'
own newsrooms, Wikipedia and Wikidata.

Regenerate the loaders with:

    python3 supabase/tools/portfolios_to_sql.py <research dir> data/portfolios supabase/portfolios

and have the database run them with `select ingest.run_remote_sql(array[...raw URLs...])`.
