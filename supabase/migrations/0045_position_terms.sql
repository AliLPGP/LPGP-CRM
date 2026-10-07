-- 0045 — industry and maturity from the schedule as printed.
--
-- Many BDCs tag a position's fair value, cost, principal, rate and spread but
-- not its industry or maturity (Ares Capital tags neither): both live only in
-- the HTML schedule of investments, industry as a section heading or column,
-- maturity as a column. supabase/tools/bdc_schedule_terms.py reads them from
-- the filing row by row, joined to the tagged position by its
-- InvestmentIdentifierAxis member; this loads what it read. A tagged value
-- always wins: the schedule only fills blanks. A position keeps its industry
-- and maturity across periods, so every period of the identifier is filled.
--
-- p: [{cik, identifier, industry, maturity}]

create index if not exists credit_positions_lender_identifier_idx on public.credit_positions (lender_cik, identifier);

create or replace function ingest.load_position_terms(p jsonb) returns integer
language plpgsql as $$
declare n int;
begin
  with src as (
    select r->>'cik' cik,
           regexp_replace(btrim(r->>'identifier'), '\s+', ' ', 'g') identifier,
           nullif(btrim(r->>'industry'), '') industry,
           case when r->>'maturity' ~ '^\d{4}-\d\d-\d\d$' then (r->>'maturity')::date end maturity
      from jsonb_array_elements(p) r
  ), up as (
    update public.credit_positions c
       set industry = coalesce(c.industry, s.industry),
           maturity = coalesce(c.maturity, s.maturity)
      from src s
     where c.lender_cik = s.cik and c.identifier = s.identifier
       and ((c.industry is null and s.industry is not null) or (c.maturity is null and s.maturity is not null))
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;
