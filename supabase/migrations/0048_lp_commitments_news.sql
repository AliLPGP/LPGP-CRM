-- LP commitments found in press and the LP's own releases. One row per LP,
-- fund and date; a row with no http(s) page is dropped, a figure the page
-- does not state stays null, and rows already on file are never overwritten.
create or replace function ingest.load_lp_commitments(p jsonb) returns integer
language plpgsql as $$
declare r jsonb; n int := 0; v_gp uuid; v_rows int;
begin
  for r in select * from jsonb_array_elements(p) loop
    if coalesce(r->>'source_url','') !~* '^https?://' or coalesce(r->>'fund_name','') = '' then continue; end if;
    if not exists (select 1 from public.companies where id = (r->>'lp_company_id')::uuid) then continue; end if;
    v_gp := null;
    if nullif(r->>'gp_name','') is not null then
      begin v_gp := ingest.match_firm(r->>'gp_name', array['GP']); exception when others then v_gp := null; end;
    end if;
    insert into public.commitments (external_key, lp_company_id, gp_company_id, lp_name, gp_name, fund_name, amount, currency,
      amount_text, commitment_date, commitment_date_text, commitment_year, disclosure_type, source, source_url, source_date, asset_class)
    values (r->>'external_key', (r->>'lp_company_id')::uuid, v_gp, r->>'lp_name', nullif(r->>'gp_name',''), r->>'fund_name',
      nullif(r->>'amount','')::numeric, nullif(r->>'currency',''), nullif(r->>'amount_text',''), nullif(r->>'commitment_date','')::date,
      nullif(r->>'commitment_date_text',''), nullif(r->>'commitment_year','')::int, coalesce(nullif(r->>'disclosure_type',''),'news'),
      'web_research', r->>'source_url', nullif(r->>'source_date','')::date, nullif(r->>'asset_class',''))
    on conflict (external_key) do nothing;
    get diagnostics v_rows = row_count; n := n + v_rows;
  end loop;
  return n;
end $$;
