-- directory: part 2 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

alter table public.companies
  add column if not exists investor_type            text,
  add column if not exists total_assets_usd         numeric,
  add column if not exists alts_allocation_pct      numeric,
  add column if not exists discloses_commitments    text,
  add column if not exists disclosure_source_url    text,
  add column if not exists assets_monitored_usd     numeric,
  add column if not exists assets_monitored_display text,
  add column if not exists lifecycle                text[] not null default '{}',   -- fund lifecycle stages an SP covers
  add column if not exists service_lines            jsonb not null default '[]'::jsonb; -- [{name, description, capabilities[]}]

create index if not exists companies_sec_crd_idx on public.companies (sec_crd) where sec_crd is not null;
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
