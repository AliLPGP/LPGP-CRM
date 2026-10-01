-- ===========================================================================
-- LPGP Connect CRM — event participants
--
-- Who came to (or was booked for) which event, from the sales team's
-- mastersheet: one tab per event, each split into LP / GP / SP / Cancelled.
-- A person is a `contacts` row (with the email and phone the sheet holds);
-- a firm is a `companies` row; this table is the link between them and an
-- event, with the role (delegate / speaker), the sponsorship tier a firm
-- bought, who booked them, and where the calendar invite stands.
--
-- The sheet itself is NEVER committed (the repo is public). Rows reach the
-- database through the staging tables in `ingest` and `ingest.load_mastersheet`.
--
-- Run AFTER 0027. Safe to re-run.
-- ===========================================================================

create table if not exists public.event_participants (
  id            uuid primary key default gen_random_uuid(),
  event_name    text not null,                 -- the sheet's tab: "CFO PE London"
  contact_id    uuid not null references public.contacts (id) on delete cascade,
  company_id    uuid references public.companies (id) on delete set null,
  segment       text,                          -- 'LP' | 'GP' | 'SP' as the tab lists them
  role          text,                          -- 'delegate' | 'speaker'
  status        text not null default 'attending', -- 'attending' | 'cancelled'
  sponsor_tier  text,                          -- 'Lead Sponsor', 'Exhibitor', 'VIP Delegate'...
  booked_by     text,                          -- the salesperson's initials as typed
  booked_on     date,                          -- only when the cell is unambiguous
  invite_status text,                          -- 'Accepted' | 'Sent' | 'Declined' | 'Tentative' | 'Resent'
  source        text not null default 'mastersheet',
  created_at    timestamptz not null default now(),
  unique (event_name, contact_id)
);
create index if not exists event_participants_contact_idx on public.event_participants (contact_id);
create index if not exists event_participants_company_idx on public.event_participants (company_id);
create index if not exists event_participants_event_idx on public.event_participants (event_name);

alter table public.event_participants enable row level security;
drop policy if exists "event_participants_read" on public.event_participants;
create policy "event_participants_read" on public.event_participants for select using (true);

-- A firm's name folded for an exact comparison: the same fold the loan
-- books use, with "&" read as "and" and a leading "the" dropped.
create or replace function public.firm_key(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(public.borrower_key(replace(coalesce(p, ''), '&', ' and ')), '^the\s+', ''), '\s+', ' ', 'g'));
$$;

-- What someone does and how senior they are, read from the title alone.
-- Only ever fills a blank; a title that says neither stays blank.
create or replace function public.title_department(t text) returns text
language sql immutable as $$
  select case
    when t is null or btrim(t) = '' then null
    when t ~* '(chief financial|\mcfo\M|finance|financial|controller|treasur|accounting|fund accounting|tax\M)' then 'Finance'
    when t ~* '(chief operating|\mcoo\M|operations|operating partner|operating principal|operating executive)' then 'Operations'
    when t ~* '(investor relations|\mir\M|capital formation|fundrais|client relations|investor services)' then 'Investor Relations'
    when t ~* '(compliance|legal|counsel|general counsel|\mcco\M|\mcro\M|risk)' then 'Legal & Compliance'
    when t ~* '(technology|\mcto\M|\mcio\M|data|digital|engineering|\mit\M|innovation|analytics)' then 'Technology & Data'
    when t ~* '(portfolio|investment|invest|deal|origination|credit|lending|underwrit|principal|private equity|private debt|capital markets|\mpm\M|research|strategy|asset allocation|manager selection)' then 'Investments'
    when t ~* '(sales|business development|relationship|marketing|client|partnership|commercial|growth)' then 'Sales & Marketing'
    when t ~* '(chief executive|\mceo\M|founder|president|managing director|chair|managing partner|co-founder|owner)' then 'Executive'
    when t ~* '(\mhr\M|human resources|people|talent)' then 'HR'
    else null end;
$$;

create or replace function public.title_seniority(t text) returns text
language sql immutable as $$
  select case
    when t is null or btrim(t) = '' then null
    when t ~* '(\mchief\M|\mc[a-z]o\M|founder|chair|owner|president|managing partner|general partner|senior partner)' then 'C-level / Founder'
    when t ~* '(partner|managing director|\mmd\M|head of|global head|\mhead\M)' then 'Partner / MD / Head'
    when t ~* '(director|\mvp\M|vice president|principal|executive director|\mevp\M|\msvp\M)' then 'Director / VP'
    when t ~* '(manager|associate|analyst|senior|lead|officer|specialist|consultant|controller)' then 'Manager / Associate'
    else null end;
$$;

-- ---------------------------------------------------------------------------
-- Staging: the loader's inputs. `ingest` is not exposed to the API roles.
-- ---------------------------------------------------------------------------
create schema if not exists ingest;

create table if not exists ingest.ms_people (
  pid        integer primary key,
  name       text,
  title      text,
  email      text,
  phone      text,
  company    text,
  seg        text,                 -- LP | GP | SP | ''
  contact_id uuid,
  company_id uuid
);

create table if not exists ingest.ms_part (
  pid      integer not null,
  event    text not null,
  seg      text,
  role     text,
  sponsor  text,
  booked   text,
  booked_on date,
  invite   text,
  cancelled boolean not null default false
);

-- Free mail hosts say nothing about the firm.
create or replace function ingest.is_free_mail(d text) returns boolean
language sql immutable as $$
  select lower(coalesce(d, '')) in ('gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','hotmail.co.uk','outlook.com','live.com','icloud.com','me.com','aol.com','msn.com','protonmail.com','proton.me','gmx.com','gmx.de','btinternet.com','sky.com','mac.com','qq.com','163.com','web.de','t-online.de','bluewin.ch','freenet.de','orange.fr','wanadoo.fr','free.fr','sbcglobal.net','att.net','comcast.net','verizon.net');
$$;

-- Places every staged person: firm (existing by exact name or by the email
-- host, else created), contact (existing by email or by firm + name, else
-- created; email, phone and title only ever fill blanks), then their event
-- rows. Re-runnable: it matches what an earlier run created.
create or replace function ingest.load_mastersheet() returns jsonb
language plpgsql as $$
declare
  n_firms_new int; n_firms_hit int; n_contacts_new int; n_contacts_hit int; n_part int;
  t0 timestamptz := now();
begin
  -- 1. firms ---------------------------------------------------------------
  create temp table _firm on commit drop as
  select company,
         public.firm_key(company) as fk,
         (array_agg(seg order by (seg in ('LP','GP','SP')) desc, seg))[1] as seg,
         (select lower(split_part(p2.email, '@', 2))
            from ingest.ms_people p2
           where p2.company = p.company and p2.email like '%@%' and not ingest.is_free_mail(split_part(p2.email, '@', 2))
           group by 1 order by count(*) desc limit 1) as dom
    from ingest.ms_people p
   where coalesce(btrim(company), '') <> ''
   group by company;

  create temp table _cx on commit drop as
  select public.firm_key(name) as fk, id, category::text as cat, source, domain
    from public.companies;
  create index on _cx (fk);

  update ingest.ms_people p set company_id = f.cid
    from (
      select f.company,
             coalesce(
               -- exact name, preferring the sheet's category, then the directory's own record
               (select c.id from _cx c where c.fk = f.fk and f.fk <> ''
                 order by (c.cat = f.seg) desc, (c.source = 'master_directory') desc, c.id limit 1),
               -- else the one firm whose website is the people's email host
               (select c.id from public.companies c where f.dom is not null and lower(c.domain) = f.dom
                 order by (c.category::text = f.seg) desc, c.id limit 1)
             ) as cid
        from _firm f
    ) f
   where f.company = p.company and f.cid is not null;

  select count(distinct company_id) into n_firms_hit from ingest.ms_people where company_id is not null;

  -- firms nothing matched: new rows, typed by the tab they sat on
  with miss as (
    select f.company, f.seg, f.dom
      from _firm f
     where not exists (select 1 from ingest.ms_people p where p.company = f.company and p.company_id is not null)
  ), ins as (
    insert into public.companies (name, category, domain, source)
    select company,
           (case when seg in ('LP','GP','SP') then seg else 'UN' end)::public.company_category,
           dom, 'mastersheet'
      from miss
    returning id, name
  )
  update ingest.ms_people p set company_id = i.id from ins i where i.name = p.company and p.company_id is null;
  select count(*) into n_firms_new from public.companies where source = 'mastersheet' and created_at >= t0;

  -- 2. people --------------------------------------------------------------
  -- by email first (the one thing that is unique to a person)
  update ingest.ms_people p set contact_id = c.id
    from public.contacts c
   where p.email is not null and lower(c.email) = lower(p.email) and p.contact_id is null;
  -- then by firm + full name
  update ingest.ms_people p set contact_id = c.id
    from (select distinct on (company_id, lower(full_name)) id, company_id, lower(full_name) as fn
            from public.contacts where full_name is not null order by company_id, lower(full_name), created_at) c
   where p.contact_id is null and p.company_id = c.company_id and lower(p.name) = c.fn;

  select count(*) into n_contacts_hit from ingest.ms_people where contact_id is not null;

  with ins as (
    insert into public.contacts (company_id, first_name, last_name, full_name, job_title, email, phone, source)
    select p.company_id,
           split_part(p.name, ' ', 1),
           nullif(btrim(substr(p.name, length(split_part(p.name, ' ', 1)) + 1)), ''),
           p.name, nullif(p.title, ''), nullif(p.email, ''), nullif(p.phone, ''), 'mastersheet'
      from ingest.ms_people p
     where p.contact_id is null and coalesce(btrim(p.name), '') <> ''
    returning id, full_name, company_id, email
  )
  update ingest.ms_people p set contact_id = i.id
    from ins i
   where p.contact_id is null and i.company_id is not distinct from p.company_id and i.full_name = p.name
     and i.email is not distinct from nullif(p.email, '');
  select count(*) into n_contacts_new from public.contacts where source = 'mastersheet' and created_at >= t0;

  -- fill blanks on people we already knew; never overwrite
  update public.contacts c set
      email = coalesce(c.email, nullif(p.email, '')),
      phone = coalesce(c.phone, nullif(p.phone, '')),
      job_title = coalesce(c.job_title, nullif(p.title, '')),
      updated_at = now()
    from ingest.ms_people p
   where p.contact_id = c.id
     and ((c.email is null and nullif(p.email, '') is not null)
       or (c.phone is null and nullif(p.phone, '') is not null)
       or (c.job_title is null and nullif(p.title, '') is not null));

  -- 3. events --------------------------------------------------------------
  insert into public.event_participants (event_name, contact_id, company_id, segment, role, status, sponsor_tier, booked_by, booked_on, invite_status)
  select distinct on (e.event, p.contact_id)
         e.event, p.contact_id, p.company_id,
         nullif(e.seg, ''), nullif(lower(e.role), ''),
         case when e.cancelled then 'cancelled' else 'attending' end,
         nullif(e.sponsor, ''), nullif(e.booked, ''), e.booked_on, nullif(e.invite, '')
    from ingest.ms_part e join ingest.ms_people p on p.pid = e.pid
   where p.contact_id is not null
   order by e.event, p.contact_id, e.cancelled, (e.sponsor <> '') desc
  on conflict (event_name, contact_id) do update set
    company_id = excluded.company_id, segment = excluded.segment, role = excluded.role,
    status = excluded.status, sponsor_tier = excluded.sponsor_tier, booked_by = excluded.booked_by,
    booked_on = excluded.booked_on, invite_status = excluded.invite_status;
  get diagnostics n_part = row_count;

  -- 4. who is who: department and seniority from the title, blanks only
  update public.contacts c set
      department = coalesce(c.department, public.title_department(c.job_title)),
      seniority = coalesce(c.seniority, public.title_seniority(c.job_title))
   where c.id in (select contact_id from ingest.ms_people where contact_id is not null)
     and (c.department is null or c.seniority is null);

  return jsonb_build_object('firms_matched', n_firms_hit, 'firms_created', n_firms_new,
    'contacts_matched', n_contacts_hit, 'contacts_created', n_contacts_new, 'event_rows', n_part);
end $$;
