-- 0017 -- one CFO/COO portfolio
--
-- The three CFO/COO conference series (Private Markets, Private Equity & Debt,
-- Private Equity) are one portfolio. The app reads the old ids as 'cfo-coo'
-- already, so nothing breaks without this; running it just tidies stored
-- choices so a later export or query sees the current id. Idempotent.

update public.event_targets
   set series = 'cfo-coo'
 where series in ('cfo-private-markets', 'cfo-pe-debt', 'cfo-pe');
