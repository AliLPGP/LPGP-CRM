# Intelligence dataset

`dataset.json` is the researched, source-cited dataset behind the Sports,
Deals and Signals sections: football clubs and other teams with their
ownership, revenue, valuation and following; the investors in sport; deals
and news across every asset class. Every figure carries the URL of the page
that states it and an as-of; a figure no source states is `null`.

It is public information about companies, clubs and funds — no contact data —
so it ships with the app. Load it from **Import → Master directory → Load the
intelligence dataset** (admins). Reloading a newer version updates rows in
place and never touches rows added by hand.

Built by `supabase/tools/build_intelligence_dataset.py` from the research
output (per-club records, an independent re-check of each club's key figures,
and per-topic deal and news files). Figures the re-check refuted are dropped;
the verdicts stay on each team record under `verification`.
