-- schema: part 9 of 15
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- ##################################################################
-- ## Directory intelligence: the Master Directory workbook, Form ADV
-- ## provider links, LP commitments, team lists (0013)
-- ##################################################################

-- Firms the capture file hasn't classified yet get a book of their own
-- rather than a guess. (A new enum value can't be used in the transaction
-- that adds it; nothing below uses it.)
alter type company_category add value if not exists 'UN';

-- --- Companies: firmographics, Form ADV, LP and SP facts -------------------
alter table public.companies
  add column if not exists external_id        text unique,                  -- workbook id, e.g. "GP-0014"
  add column if not exists external_ids       text[] not null default '{}', -- every id merged into this record
  add column if not exists source             text,                         -- 'master_directory' when imported
  add column if not exists directory_vertical text,                         -- the sheet's own vertical / SP line
  add column if not exists state              text,                         -- "CA", "ON", "Zug"
  add column if not exists founded_year       integer,
  add column if not exists years_active       integer,
  add column if not exists employee_count     integer,
  add column if not exists industry           text,                         -- Lusha industry
  add column if not exists lusha_verified_on  date,
  add column if not exists catalog_updated_at timestamptz,
  add column if not exists sources            jsonb not null default '[]'::jsonb; -- [{label, url}]

alter table public.companies
  add column if not exists sec_crd                   text,
  add column if not exists sec_file_number           text,
  add column if not exists adv_firm_type             text,    -- 'Registered' | 'ERA'
  add column if not exists adv_matched_entity        text,
  add column if not exists adv_last_filed            date,
  add column if not exists adv_employee_count        integer,
  add column if not exists private_fund_count        integer,
  add column if not exists private_fund_gross_assets numeric, -- ERAs report this instead of RAUM
  add column if not exists regulatory_aum_usd        numeric, -- per registered SEC entity
  add column if not exists brand_entity_count        integer,
  add column if not exists brand_aum_total_usd       numeric, -- summed across the brand's entities
  add column if not exists adv_source_url            text,
  add column if not exists adv_entities              jsonb not null default '[]'::jsonb;

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
