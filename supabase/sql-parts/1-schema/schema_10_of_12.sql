-- schema: part 10 of 12
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create index if not exists companies_domain_idx on public.companies (lower(domain)) where domain is not null;

-- --- Contacts: the key people each book names -------------------------------
alter table public.contacts
  add column if not exists external_ref text unique, -- "GP-0014#jane-doe"
  add column if not exists source       text,
  add column if not exists connectable  boolean;     -- the team's master sheet holds a direct email

-- --- Service relationships: Form ADV Schedule D, one row per brand & role ---
alter table public.service_relationships
  add column if not exists external_key       text unique, -- "adv:GP-0014:auditor:kpmg"
  add column if not exists provider_key       text,        -- brand slug, groups every legal entity
  add column if not exists provider_brand     text,
  add column if not exists provider_entities  text[] not null default '{}', -- names as filed
  add column if not exists provider_locations text[] not null default '{}',
  add column if not exists fund_count         integer,
  add column if not exists fund_examples      text[] not null default '{}',
  add column if not exists source             text,        -- 'form_adv' | 'sample'
  add column if not exists source_url         text,
  add column if not exists filed              text;

create index if not exists service_rel_provider_key_idx on public.service_relationships (provider_key);

-- The original seed's links were illustrative; say so rather than let them
-- sit beside filed data looking like it.
update public.service_relationships
   set source = 'sample'
 where source is null and external_key is null;

-- --- Funds and commitments: the public LP -> GP allocation record ----------
alter table public.funds
  add column if not exists external_key text unique,
  add column if not exists manager_name text, -- when the manager isn't a directory firm
  add column if not exists source       text;

alter table public.commitments
  add column if not exists external_key         text unique,
  add column if not exists gp_company_id        uuid references public.companies (id) on delete set null,
  add column if not exists lp_name              text,
  add column if not exists gp_name              text,
  add column if not exists fund_name            text,
  add column if not exists amount               numeric, -- in `currency`; never converted
  add column if not exists currency             text,
  add column if not exists amount_text          text,    -- as published: "up to 40,000,000"
  add column if not exists commitment_date_text text,
  add column if not exists commitment_year      integer,
  add column if not exists disclosure_type      text,
  add column if not exists source               text,    -- 'lp_disclosure' | 'sample'
  add column if not exists source_url           text,
  add column if not exists source_date          date;

create index if not exists commitments_gp_idx on public.commitments (gp_company_id);

update public.commitments
   set source = 'sample'
 where source is null and external_key is null;

-- --- Team lists and saved searches ----------------------------------------
create table if not exists public.directory_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
