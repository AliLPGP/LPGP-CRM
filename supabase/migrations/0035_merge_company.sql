-- 0035: one firm, two records. The LP disclosure loaders made their own LP
-- rows ("Oregon Public Employees Retirement Fund") beside the directory's
-- ("Oregon PERS"), so the directory firm showed no commitments and the twin
-- had no AUM. `ingest.merge_company(twin, keep)` moves every reference from
-- the twin to the firm to keep, fills the kept firm's blanks from the twin,
-- records the twin's ids in `external_ids`, and removes the twin. Nothing
-- the kept firm already states is overwritten. Safe to re-run; a twin that
-- is gone is a no-op.
create or replace function ingest.merge_company(p_twin uuid, p_keep uuid) returns jsonb
language plpgsql as $$
declare t public.companies%rowtype; n jsonb := '{}'::jsonb; c int;
begin
  if p_twin = p_keep then return jsonb_build_object('skipped', 'same');
  end if;
  select * into t from public.companies where id = p_twin;
  if not found then return jsonb_build_object('skipped', 'twin gone'); end if;
  if not exists (select 1 from public.companies where id = p_keep) then raise exception 'keep % not found', p_keep; end if;

  update public.commitments set lp_company_id = p_keep where lp_company_id = p_twin; get diagnostics c = row_count; n := n || jsonb_build_object('commitments_lp', c);
  update public.commitments set gp_company_id = p_keep where gp_company_id = p_twin; get diagnostics c = row_count; n := n || jsonb_build_object('commitments_gp', c);
  update public.contacts set company_id = p_keep where company_id = p_twin; get diagnostics c = row_count; n := n || jsonb_build_object('contacts', c);
  update public.event_participants set company_id = p_keep where company_id = p_twin; get diagnostics c = row_count; n := n || jsonb_build_object('event_participants', c);
  update public.funds set company_id = p_keep where company_id = p_twin; get diagnostics c = row_count; n := n || jsonb_build_object('funds', c);
  update public.portfolio_companies set gp_company_id = p_keep where gp_company_id = p_twin and not exists (select 1 from public.portfolio_companies x where x.gp_company_id = p_keep and x.name = portfolio_companies.name); get diagnostics c = row_count; n := n || jsonb_build_object('portcos', c);
  update public.deals set investor_company_id = p_keep where investor_company_id = p_twin;
  update public.deals set target_company_id = p_keep where target_company_id = p_twin;
  update public.fund_offerings set gp_company_id = p_keep where gp_company_id = p_twin;
  update public.credit_lenders set company_id = p_keep where company_id = p_twin;
  update public.credit_positions set borrower_company_id = p_keep where borrower_company_id = p_twin;
  update public.adv_advisers set company_id = p_keep where company_id = p_twin;
  update public.accounts set company_id = p_keep where company_id = p_twin;
  update public.leads set company_id = p_keep where company_id = p_twin;
  update public.activities set company_id = p_keep where company_id = p_twin;
  update public.sports_investors set company_id = p_keep where company_id = p_twin;
  update public.sports_team_owners set company_id = p_keep where company_id = p_twin;
  update public.directory_list_items set company_id = p_keep where company_id = p_twin and not exists (select 1 from public.directory_list_items x where x.list_id = directory_list_items.list_id and x.company_id = p_keep);
  update public.service_relationships set client_company_id = p_keep where client_company_id = p_twin and not exists (select 1 from public.service_relationships x where x.client_company_id = p_keep and x.provider_company_id is not distinct from service_relationships.provider_company_id and x.role is not distinct from service_relationships.role);
  update public.service_relationships set provider_company_id = p_keep where provider_company_id = p_twin and not exists (select 1 from public.service_relationships x where x.provider_company_id = p_keep and x.client_company_id is not distinct from service_relationships.client_company_id and x.role is not distinct from service_relationships.role);
  -- A profile or plan the twin had moves only when the kept firm has none.
  update public.investor_profiles set company_id = p_keep where company_id = p_twin and not exists (select 1 from public.investor_profiles x where x.company_id = p_keep);
  update public.investor_plans set company_id = p_keep where company_id = p_twin and not exists (select 1 from public.investor_plans x where x.company_id = p_keep and x.asset_class = investor_plans.asset_class and x.source_url = investor_plans.source_url);

  update public.companies k set
    website = coalesce(k.website, t.website), domain = coalesce(k.domain, t.domain), linkedin_url = coalesce(k.linkedin_url, t.linkedin_url),
    description = coalesce(k.description, t.description), country = coalesce(k.country, t.country), city = coalesce(k.city, t.city),
    hq_location = coalesce(k.hq_location, t.hq_location), sub_type = coalesce(k.sub_type, t.sub_type), investor_type = coalesce(k.investor_type, t.investor_type),
    total_assets_usd = coalesce(k.total_assets_usd, t.total_assets_usd), employee_count = coalesce(k.employee_count, t.employee_count), founded_year = coalesce(k.founded_year, t.founded_year),
    discloses_commitments = coalesce(k.discloses_commitments, t.discloses_commitments), disclosure_source_url = coalesce(k.disclosure_source_url, t.disclosure_source_url),
    external_ids = (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(k.external_ids, '{}') || coalesce(t.external_ids, '{}') || array['merged:' || p_twin::text]) x),
    updated_at = now()
  where k.id = p_keep;
  delete from public.companies where id = p_twin;
  insert into ingest.log (what, detail) values ('merge_company', jsonb_build_object('twin', p_twin, 'twin_name', t.name, 'keep', p_keep) || n);
  return n;
end $$;
