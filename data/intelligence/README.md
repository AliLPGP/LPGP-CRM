# Intelligence dataset

`dataset.json` is the researched, source-cited dataset behind the Sports,
Deals, Signals and LP-commitment sections: football clubs and other teams
with their ownership, revenue, valuation and following; the investors in
sport; deals across every asset class (fund closes, take-privates,
acquisitions, financings, secondaries, hedge fund launches); LP fund
commitments as the LPs' own board publications and the press state them;
and news. Every figure carries the URL of the page that states it and an
as-of; a figure no source states is `null`.

It is public information about companies, clubs and funds — no contact data —
so it ships with the app. Load it from **Import → Master directory → Load the
intelligence dataset** (admins). Reloading a newer version updates rows in
place and never touches rows added by hand.

The same rows also exist as SQL, for a database the app can't reach yet:
`supabase/sql-parts/5-intelligence-data/` (paste-sized parts for the Supabase
SQL editor) and `supabase/intelligence-data.sql` (one file for `psql`).
`supabase/tools/dataset_to_sql.py` writes both from `dataset.json`; the in-app
button links a few more rows to directory firms, because it matches names more
loosely than SQL does.

Built by `supabase/tools/build_intelligence_dataset.py` from the research
output (per-club records, an independent re-check of each club's key figures,
and per-topic deal and news files). Figures the re-check refuted are dropped;
the verdicts stay on each team record under `verification`.
