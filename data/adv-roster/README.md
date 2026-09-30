# SEC adviser roster

`advisers-<date>.json` is the SEC's monthly "Information About Registered
Investment Advisers and Exempt Reporting Advisers" report, both files
(registered and exempt), reduced to the columns the platform uses: identity,
main office, website, employees, regulatory AUM (Item 5F), and Item 7B — does
the firm advise private funds, how many, of which kinds, with what gross
assets. Public information; no contacts.

Source: https://www.sec.gov/data-research/sec-markets-data/information-about-registered-investment-advisers-exempt-reporting-advisers
(the `ia<MMDDYY>.zip` and `ia<MMDDYY>-exempt.zip` files).

Loaded by `select ingest.load_adviser_roster(<raw url>, '<date>', <source url>)`
and promoted into GP records by `select ingest.promote_advisers(100000000)`
(migration 0020).
