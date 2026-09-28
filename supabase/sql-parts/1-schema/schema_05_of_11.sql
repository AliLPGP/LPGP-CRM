-- schema: part 5 of 11
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create index if not exists accounts_company_idx  on public.accounts (company_id);
create index if not exists accounts_name_idx     on public.accounts (lower(name));
create index if not exists accounts_status_idx   on public.accounts (status);

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- --- Points of contact -----------------------------------------------------
-- Standalone by design: a sponsor's billing contact often isn't in the
-- intelligence database at all. contact_id links one up when it is.
create table if not exists public.account_contacts (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts (id) on delete cascade,
  contact_id     uuid references public.contacts (id) on delete set null,
  full_name      text not null,
  job_title      text,
  email          text,
  phone          text,
  mobile         text,
  linkedin_url   text,
  role           text,                       -- Primary | Billing | Marketing | Speaker liaison | Legal
  is_primary     boolean not null default false,
  last_contacted date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists account_contacts_account_idx on public.account_contacts (account_id);
-- At most one primary contact per account.
create unique index if not exists account_contacts_one_primary
  on public.account_contacts (account_id) where is_primary;

drop trigger if exists account_contacts_set_updated_at on public.account_contacts;
create trigger account_contacts_set_updated_at
  before update on public.account_contacts
  for each row execute function public.set_updated_at();

-- --- Activity log ----------------------------------------------------------
do $$ begin
  create type activity_type as enum ('call', 'email', 'meeting', 'linkedin', 'note', 'task');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.activities (
  id                 uuid primary key default gen_random_uuid(),
  type               activity_type not null default 'call',
  outcome            text,                   -- Connected | Voicemail | No answer | Gatekeeper | ...
  subject            text,
  body               text,
  duration_seconds   integer,
  occurred_at        timestamptz not null default now(),
  owner_id           uuid references public.profiles (id) on delete set null,
  lead_id            uuid references public.leads (id) on delete cascade,
  account_id         uuid references public.accounts (id) on delete cascade,
  company_id         uuid references public.companies (id) on delete cascade,
  contact_id         uuid references public.contacts (id) on delete set null,
  account_contact_id uuid references public.account_contacts (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists activities_lead_idx    on public.activities (lead_id, occurred_at desc);
create index if not exists activities_account_idx on public.activities (account_id, occurred_at desc);
create index if not exists activities_company_idx on public.activities (company_id, occurred_at desc);
create index if not exists activities_owner_idx   on public.activities (owner_id, occurred_at desc);
