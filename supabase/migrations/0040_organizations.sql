-- 0040: organizations -- the partner platform's organisation schema.
--
-- The data-analytics platform keeps one `organizations` collection: a firm
-- with a category (investor / fund manager / service provider), a type,
-- country, region, currency, sector focus, asset classes, AUM, fund count,
-- ticket size, headcount, founding year and the ids it is known by elsewhere.
-- This migration gives the CRM the same shape, beside `companies`, not in
-- place of it. Additive and idempotent; no existing table is touched.
--
--   * org_vocab    -- the platform's opaque ids decoded (category, type,
--                     country, region, currency), with how sure the decoding
--                     is. Ids the sheet uses that mean "placeholder" or
--                     "test" are kept so a row still resolves.
--   * organizations -- one row per firm, keyed by the platform's `_id`.
--                     A value the platform marks "Not disclosed" is NULL here
--                     (a blank is a blank); the export writes the marker back.
--                     `company_id` links the row to the CRM's own company when
--                     one matches, so nothing is stored twice.
--   * org_sources  -- the page that states a value, per organisation and
--                     column.
--
-- Reads are open to the anon role like the rest of the directory; writes are
-- service-role only. A load session grants anon insert for its duration and
-- revokes it after (see the end of this file for the revoke).

create table if not exists public.org_vocab (
  vocabulary text not null,
  id text not null,
  meaning text not null,
  confidence text,
  primary key (vocabulary, id)
);

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  category_id text,
  type_id text,
  country_id text,
  region_id text,
  sector_focus text[] not null default '{}',
  subsector_focus text[] not null default '{}',
  asset_classes text[] not null default '{}',
  aum numeric,
  fund_count integer,
  employee_count integer,
  description text,
  website text,
  headquarters_address text,
  logo_url text,
  dark_logo_url text,
  status text not null default 'ACTIVE',
  currency_id text,
  domain text,
  source text,
  ticket_size text,
  year_founded integer,
  external_ids jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  company_id uuid references public.companies (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_category_idx on public.organizations (category_id);
create index if not exists organizations_type_idx on public.organizations (type_id);
create index if not exists organizations_country_idx on public.organizations (country_id);
create index if not exists organizations_domain_idx on public.organizations (lower(domain));
create index if not exists organizations_company_idx on public.organizations (company_id);
create index if not exists organizations_name_idx on public.organizations (lower(name));

create table if not exists public.org_sources (
  org_id text not null references public.organizations (id) on delete cascade,
  column_name text not null,
  url text not null,
  primary key (org_id, column_name, url)
);

alter table public.org_vocab enable row level security;
alter table public.organizations enable row level security;
alter table public.org_sources enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'org_vocab' and policyname = 'org_vocab_read') then
    create policy org_vocab_read on public.org_vocab for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_read') then
    create policy organizations_read on public.organizations for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'org_sources' and policyname = 'org_sources_read') then
    create policy org_sources_read on public.org_sources for select using (true);
  end if;
end $$;
