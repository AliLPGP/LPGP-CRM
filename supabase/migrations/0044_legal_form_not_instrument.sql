-- 0044 — a legal form is not an instrument.
--
-- split_identifier read "Ivy Hill Asset Management, L.P." as borrower "Ivy
-- Hill Asset Management" holding an instrument called "L.P.". That row is the
-- filer's per-borrower total; with an "instrument" it escaped the subtotal
-- check, so the borrower counted twice (435 rows, 31 lenders, $41.6bn of fair
-- value). The split now keeps a trailing legal form in the name, the stored
-- rows are put back together, and their subtotal flag is recomputed.

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
  -- "Ivy Hill Asset Management, L.P." is a name, not a borrower and an
  -- instrument: a legal form alone never stands for the instrument.
  if m is not null and length(m[1]) >= 3 and m[2] !~* '^\s*(llc|l\.?l\.?c\.?|l\.?p\.?|lp|inc\.?|ltd\.?|limited|corp\.?|plc|s\.?a\.?r\.?l\.?|b\.?v\.?|gmbh)\s*$' then
    borrower := btrim(m[1]);
    instrument := nullif(btrim(m[2]), '');
  else
    borrower := btrim(p);
    instrument := null;
  end if;
end $$;

update public.credit_positions c
   set borrower = s.borrower, instrument = s.instrument
  from public.credit_positions c0 cross join lateral ingest.split_identifier(c0.identifier) s
 where c0.id = c.id
   and c.instrument ~* '^\s*(llc|l\.?l\.?c\.?|l\.?p\.?|lp|inc\.?|ltd\.?|limited|corp\.?|plc|s\.?a\.?r\.?l\.?|b\.?v\.?|gmbh)\s*$';

update public.credit_positions p
   set is_summary = true
 where p.instrument is null and not p.is_summary
   and exists (select 1 from public.credit_positions q
                where q.lender_cik = p.lender_cik and q.as_of = p.as_of and q.instrument is not null
                  and lower(q.borrower) = lower(p.borrower) and q.id <> p.id);
