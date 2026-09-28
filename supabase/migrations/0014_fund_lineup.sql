-- ===========================================================================
-- LPGP Connect CRM — fund lineup
--
-- The private funds GPs name on Form ADV Schedule D, one row per vehicle, with
-- the auditor, administrator, custodian or prime broker the filing ties each
-- one to. Import -> Master directory loads them alongside the provider links,
-- keyed "advfund:GP-0014:<fund>", so the next edition updates in place.
--
-- A fund is only called a feeder, a co-investment vehicle or Luxembourg-
-- domiciled when its legal name says so; otherwise those columns stay empty.
--
-- Run AFTER 0013_directory_intelligence.sql. Safe to re-run.
-- ===========================================================================

alter table public.funds
  add column if not exists name_filed        text,  -- exactly as filed
  add column if not exists vehicle_kind      text,  -- from the name: Feeder, Co-investment, Master ...
  add column if not exists domicile          text,  -- only when the legal form fixes it (SCSp, ICAV)
  add column if not exists currency          text,  -- a currency class the name states
  add column if not exists service_providers jsonb not null default '[]'::jsonb, -- [{role, key, brand}]
  add column if not exists filed             text,  -- which ADV filings named it
  add column if not exists source_url        text;

create index if not exists funds_source_idx on public.funds (source);
