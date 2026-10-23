-- 0051: funds a GP names on its own site, its filings or its LPs' reports.
-- Many GPs have no fund row at all (no Form D, no ADV schedule), so their
-- profile can never count funds, fund strategy or portfolio by fund. Research
-- reads each fund's name from a page and, only where that page states them,
-- its vintage, US-dollar size or target, strategy, geography and status.
-- `ingest.load_gp_funds` adds the funds a firm does not already have
-- (source 'web_research', the page in source_url) and returns every fund's id
-- so the strategy and fund profile can follow. A fund the firm already has
-- under the same name is left exactly as it is. Sizes are taken only as
-- stated in US dollars: nothing is converted. Safe to re-run.
--
--   select ingest.load_gp_funds('[{"company_id": "<uuid>", "funds": [
--     {"name": "Example Infrastructure Fund III", "vintage_year": 2023,
--      "fund_size_usd": 1500000000, "strategy": "Infrastructure",
--      "status": "Investing", "source_url": "https://example.com/funds"}]}]');
create or replace function ingest.load_gp_funds(p jsonb) returns jsonb
language plpgsql as $$
declare
  r jsonb; fu jsonb; v_id uuid; fid uuid; v_name text; v_key text;
  n_new int := 0; n_existing int := 0; n_skipped int := 0; ids jsonb := '[]'::jsonb;
begin
  for r in select * from jsonb_array_elements(p) loop
    v_id := nullif(r->>'company_id', '')::uuid;
    if v_id is null or not exists (select 1 from public.companies where id = v_id) then
      n_skipped := n_skipped + jsonb_array_length(coalesce(r->'funds', '[]'::jsonb));
      continue;
    end if;
    for fu in select * from jsonb_array_elements(coalesce(r->'funds', '[]'::jsonb)) loop
      v_name := btrim(regexp_replace(coalesce(fu->>'name', ''), '\s+', ' ', 'g'));
      if v_name = '' or coalesce(fu->>'source_url', '') !~* '^https?://' then n_skipped := n_skipped + 1; continue; end if;
      -- the same fund under the firm, spelled with other punctuation or case
      select f.id into fid from public.funds f
        where f.company_id = v_id
          and lower(regexp_replace(f.name, '[^a-zA-Z0-9]+', '', 'g')) = lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '', 'g'))
        order by f.created_at limit 1;
      if fid is not null then
        n_existing := n_existing + 1;
      else
        v_key := 'web:' || v_id::text || ':' || lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
        insert into public.funds (company_id, name, vintage_year, fund_size_usd, target_size_usd, strategy, geography, status, source, source_url, external_key)
        values (v_id, v_name, nullif(fu->>'vintage_year', '')::int, nullif(fu->>'fund_size_usd', '')::numeric,
                nullif(fu->>'target_size_usd', '')::numeric, nullif(fu->>'strategy', ''), nullif(fu->>'geography', ''),
                nullif(fu->>'status', ''), 'web_research', fu->>'source_url', v_key)
        on conflict (external_key) do nothing
        returning id into fid;
        if fid is null then
          select id into fid from public.funds where external_key = v_key;
          n_existing := n_existing + 1;
        else
          n_new := n_new + 1;
        end if;
      end if;
      ids := ids || jsonb_build_object('company_id', v_id, 'name', v_name, 'fund_id', fid);
    end loop;
  end loop;
  insert into ingest.log (what, detail) values ('load_gp_funds', jsonb_build_object('new', n_new, 'existing', n_existing, 'skipped', n_skipped));
  return jsonb_build_object('new', n_new, 'existing', n_existing, 'skipped', n_skipped, 'funds', ids);
end $$;
