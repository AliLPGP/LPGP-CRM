-- Managers an investor works with beyond a disclosed fund commitment: a
-- mandate, a joint venture, a co-lending programme, a secondary it led, a
-- manager it bought. One row per investor, manager and relationship, each
-- with the page that states it and how sure we are: "confirmed" when the page
-- was read, "reported" when only a search result or a secondary page says so.
-- The LP's page lists them beside its commitments and the manager's page
-- lists the investors, so the two books say the same thing.
create table if not exists public.lp_manager_links (
  id uuid primary key default gen_random_uuid(),
  external_key text unique not null,
  lp_company_id uuid not null references public.companies(id) on delete cascade,
  manager_company_id uuid references public.companies(id) on delete set null,
  manager_name text not null,
  relationship text,
  asset_class text,
  confidence text not null default 'reported' check (confidence in ('confirmed', 'reported')),
  source_url text not null check (source_url ~* '^https?://'),
  source_name text,
  evidence text,
  as_of date,
  created_at timestamptz not null default now()
);
create index if not exists lp_manager_links_lp_idx on public.lp_manager_links (lp_company_id);
create index if not exists lp_manager_links_manager_idx on public.lp_manager_links (manager_company_id);
alter table public.lp_manager_links enable row level security;
drop policy if exists lp_manager_links_read on public.lp_manager_links;
create policy lp_manager_links_read on public.lp_manager_links for select using (true);

create or replace function ingest.load_lp_manager_links(p jsonb) returns integer
language plpgsql as $$
declare r jsonb; n int := 0; v_mgr uuid; v_rows int;
begin
  for r in select * from jsonb_array_elements(p) loop
    if coalesce(r->>'source_url','') !~* '^https?://' or coalesce(r->>'manager_name','') = '' then continue; end if;
    if not exists (select 1 from public.companies where id = (r->>'lp_company_id')::uuid) then continue; end if;
    v_mgr := nullif(r->>'manager_company_id','')::uuid;
    if v_mgr is null then
      begin v_mgr := ingest.match_firm(r->>'manager_name', array['GP','SP']); exception when others then v_mgr := null; end;
    end if;
    insert into public.lp_manager_links as t (external_key, lp_company_id, manager_company_id, manager_name, relationship, asset_class, confidence, source_url, source_name, evidence, as_of)
    values (r->>'external_key', (r->>'lp_company_id')::uuid, v_mgr, r->>'manager_name', nullif(r->>'relationship',''), nullif(r->>'asset_class',''),
            case when r->>'confidence' = 'confirmed' then 'confirmed' else 'reported' end, r->>'source_url', nullif(r->>'source_name',''), nullif(r->>'evidence',''), nullif(r->>'as_of','')::date)
    on conflict (external_key) do update set manager_company_id = coalesce(excluded.manager_company_id, t.manager_company_id), relationship = excluded.relationship,
      asset_class = excluded.asset_class, confidence = excluded.confidence, source_url = excluded.source_url, source_name = excluded.source_name, evidence = excluded.evidence;
    get diagnostics v_rows = row_count; n := n + v_rows;
  end loop;
  return n;
end $$;
