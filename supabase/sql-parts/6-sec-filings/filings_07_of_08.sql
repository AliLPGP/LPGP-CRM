-- filings: part 7 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- Where a tagged identifier turns from borrower into instrument. Filers
-- write "Borrower | First lien senior secured loan", "Borrower, Term Loan"
-- or "Borrower - Senior Secured Note"; the instrument is whatever follows
-- the first separator that introduces an instrument word.
create or replace function ingest.split_identifier(p_raw text, out clean text, out borrower text, out instrument text)
language plpgsql immutable as $$
declare m text[]; p text;
begin
  -- Entities decoded; a filer's camel-cased member name ("NNSoftwareAcmeLLCFLSSLMember") spaced out.
  p := btrim(ingest.unxml(p_raw));
  if p ~ '^[A-Za-z0-9]+Member$' and p !~ '\s' then
    p := regexp_replace(regexp_replace(left(p, length(p) - 6), '([a-z0-9])([A-Z])', '\1 \2', 'g'), '([A-Z]+)([A-Z][a-z])', '\1 \2', 'g');
  end if;
  p := regexp_replace(p, '\s+', ' ', 'g');
  clean := p;
  if p like '% | %' then
    borrower := btrim(split_part(p, ' | ', 1));
    instrument := nullif(btrim(substr(p, position(' | ' in p) + 3)), '');
    return;
  end if;
  m := regexp_match(p, '^(.+?)(?:,|\s[-–]\s)\s*((?:first|second|third|senior|subordinated|sub\.?|unsecured|secured|term|revolv|delayed|preferred|common|equity|warrant|note|bond|unitranche|mezzanine|convertible|class|series|units?|shares?|interest|membership|limited|llc|l\.p\.|lp |bank|loan|debt|credit|line of|bridge|pik|tranche|last[- ]out|first[- ]out)[^,]*.*)$', 'i');
  if m is not null and length(m[1]) >= 3 then
    borrower := btrim(m[1]);
    instrument := nullif(btrim(m[2]), '');
  else
    borrower := btrim(p);
    instrument := null;
  end if;
end $$;

-- The seniority a tagged instrument states. Mirrors instrumentGroup() in
-- lib/directory/filings-types.ts; the two must agree.
create or replace function public.instrument_group(p text) returns text
language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then 'Unspecified'
    when lower(p) ~ '(first[- ]lien|1st[- ]lien|first[- ]out|senior secured|unitranche|senior (secured )?term loan|senior loan|senior debt|revolv|\mfl ?ssl\M)' then 'First lien / senior secured'
    when lower(p) ~ '(second[- ]lien|last[- ]out)' then 'Second lien'
    when lower(p) ~ '(subordinat|\msub\.? |mezzanine|junior|pik note|unsecured (note|loan|debt)|holdco)' then 'Subordinated / mezzanine'
    when lower(p) ~ 'preferred' then 'Preferred equity'
    when lower(p) ~ '(equity|warrant|common|member|unit|share|interest|llc|l\.p\.|\mlp\M|partnership)' then 'Equity & warrants'
    when lower(p) ~ '(note|bond|debenture)' then 'Notes & bonds'
    when lower(p) ~ '(clo|structured|certificate|abs\M)' then 'Structured'
    when lower(p) ~ '(loan|term|delayed draw|credit facility|line of credit|bridge|tranche|debt)' then 'Loans, seniority unstated'
    else 'Other' end;
$$;

-- Positions parsed before the split learnt entities, camel case, commas and
-- dashes: re-derive them, keeping the key in step with the cleaned identifier.
update public.credit_positions p
   set identifier = s.clean, borrower = s.borrower, instrument = s.instrument,
       external_key = 'soi:' || p.lender_cik || ':' || p.as_of || ':' || md5(s.clean)
  from ingest.split_identifier(p.identifier) s
 where (p.identifier <> s.clean or p.borrower <> s.borrower or p.instrument is distinct from s.instrument)
   and not exists (select 1 from public.credit_positions q where q.external_key = 'soi:' || p.lender_cik || ':' || p.as_of || ':' || md5(s.clean) and q.id <> p.id);

-- Everything the loan-book desk summarises, computed here in one pass. The
-- API roles carry a short statement timeout, and paging fifty thousand
-- positions through the API to add them up in the app ran past it.
create or replace function public.credit_book_summary() returns jsonb
language sql stable as $$
  with book as (
    select p.lender_cik, l.name as lender_name, l.ticker, p.borrower, p.instrument, p.identifier, p.spread, p.interest_rate, coalesce(p.fair_value, 0) as fv,
           lower(regexp_replace(regexp_replace(p.borrower, '[.,]', '', 'g'), '\s+(inc|llc|lp|ltd|corp|corporation|holdings?|co)$', '', 'g')) as bkey
    from public.credit_positions p join public.credit_lenders l on l.cik = p.lender_cik
    where p.as_of = l.latest_period and not p.is_summary
  )
  select jsonb_build_object(
    'lenders', (select count(distinct lender_cik) from book),
    'positions', (select count(*) from book),
    'fairValue', (select coalesce(sum(fv), 0) from book),
    'byInstrument', (select coalesce(jsonb_agg(jsonb_build_object('label', g, 'value', v, 'count', n) order by v desc), '[]'::jsonb)
                     from (select public.instrument_group(coalesce(instrument, identifier)) g, sum(fv) v, count(*) n from book group by 1) q),
    'spreadBins', (select coalesce(jsonb_agg(jsonb_build_object('label', case when b >= 12 then '1200+' else (b * 100)::text || '–' || (b * 100 + 99)::text end, 'count', n) order by b), '[]'::jsonb)
                   from (select least(12, floor(spread))::int b, count(*) n from book where spread > 0 and spread < 30 group by 1) q),
    'avgSpread', (select sum(spread * greatest(fv, 1)) / nullif(sum(greatest(fv, 1)), 0) from book where spread > 0 and spread < 30),
    'avgRate', (select sum(interest_rate * greatest(fv, 1)) / nullif(sum(greatest(fv, 1)), 0) from book where interest_rate > 0 and interest_rate < 40),
    'shared', (select coalesce(jsonb_agg(jsonb_build_object('borrower', name, 'lenders', n, 'fairValue', v) order by n desc, v desc), '[]'::jsonb)
               from (select min(borrower) name, count(distinct lender_cik) n, sum(fv) v from book group by bkey having count(distinct lender_cik) > 1 order by n desc, v desc limit 25) q),
    'byLender', (select coalesce(jsonb_agg(jsonb_build_object('cik', lender_cik, 'name', lender_name, 'ticker', ticker, 'positions', n, 'fairValue', v) order by v desc), '[]'::jsonb)
                 from (select lender_cik, min(lender_name) lender_name, min(ticker) ticker, count(*) n, sum(fv) v from book group by lender_cik) q)
  );
$$;
