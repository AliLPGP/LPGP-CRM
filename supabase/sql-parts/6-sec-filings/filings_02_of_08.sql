-- filings: part 2 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create table if not exists ingest.queue (
  id           bigserial primary key,
  kind         text not null,                 -- form_d | bdc_filing
  key          text not null unique,          -- accession number
  url          text not null,
  meta         jsonb not null default '{}'::jsonb,
  status       text not null default 'pending', -- pending | working | done | skipped | error
  attempts     integer not null default 0,
  note         text,
  enqueued_at  timestamptz not null default now(),
  done_at      timestamptz
);
create index if not exists ingest_queue_pending_idx on ingest.queue (id) where status = 'pending';

create table if not exists ingest.log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  what        text not null,
  detail      jsonb
);

-- --- Helpers ----------------------------------------------------------------

create or replace function ingest.http_text(p_url text) returns text
language plpgsql as $$
declare r record;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '180000');
  select * into r from extensions.http((
    'GET', p_url,
    array[extensions.http_header('User-Agent', 'LPGP Connect research info@worldhealth.ai'),
          extensions.http_header('Accept', '*/*')],
    null, null)::extensions.http_request);
  if r.status <> 200 then
    raise exception 'HTTP % for %', r.status, p_url;
  end if;
  return r.content;
end $$;

-- A text node cast to text keeps its entities ("CD&amp;R"); undo them.
create or replace function ingest.unxml(p text) returns text
language sql immutable as $$
  select case when p is null then null else
    replace(replace(replace(replace(replace(
      regexp_replace(regexp_replace(p, '&#(\d+);', E'\\1', 'g'), '&#x([0-9a-fA-F]+);', E'\\1', 'g'),
      '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', ''''), '&amp;', '&')
  end;
$$;

-- A relative path is evaluated anywhere inside the fragment (Postgres evaluates
-- xpath against a document node, so 'cik' alone would only match a root).
create or replace function ingest.x1(p xml, p_path text) returns text
language sql immutable as $$
  select nullif(btrim(ingest.unxml((xpath(case when left(p_path, 1) = '/' then p_path else '//' || p_path end || '/text()', p))[1]::text)), '');
$$;

create or replace function ingest.num(p text) returns numeric
language sql immutable as $$
  select case when p ~ '^-?[0-9]+(\.[0-9]+)?$' then p::numeric end;
$$;

create or replace function ingest.bool(p text) returns boolean
language sql immutable as $$
  select case lower(p) when 'true' then true when 'false' then false end;
$$;

-- A directory firm for a filed name: exact, then the brand's first word when
-- that word names exactly one directory firm ("Ares Capital Europe VI" -> Ares).
create or replace function ingest.match_firm(p_name text, out company_id uuid, out method text)
language plpgsql stable as $$
declare w text; n int;
begin
  if p_name is null then return; end if;
  select id into company_id from public.companies where lower(name) = lower(btrim(p_name)) limit 1;
  if company_id is not null then method := 'exact'; return; end if;
  w := lower(split_part(regexp_replace(btrim(p_name), '^(the)\s+', '', 'i'), ' ', 1));
  w := regexp_replace(w, '[^a-z0-9&]', '', 'g');
  if length(w) < 3 or w = any (array['capital','global','private','partners','first','american','north','south','east','west','new','united','general','national','international','credit','equity','real','growth','venture','ventures','fund','funds','investment','investments','strategic','opportunity','opportunities','income','infrastructure','energy','digital','blue','green','black','white','silver','gold','summit','main','alpha','core','prime','crown','eagle','harbor','harbour','lake','river','park','bridge','stone','oak','pine','cedar','maple','atlas','apex','vista','one','two','three','1','2','3']) then
    return;
  end if;
  select count(*), (array_agg(id))[1] into n, company_id
    from public.companies
   where lower(split_part(regexp_replace(name, '^(the)\s+', '', 'i'), ' ', 1)) = w
     and category in ('GP', 'SP', 'LP');
  if n = 1 then method := 'brand'; else company_id := null; end if;
end $$;

-- Asset class from the fund's own name and its Form D fund type.
create or replace function ingest.classify_fund(p_name text, p_fund_type text, p_industry text) returns text
language plpgsql immutable as $$
declare n text := lower(coalesce(p_name, ''));
begin
  if coalesce(p_industry, '') <> 'Pooled Investment Fund' then return null; end if;
  if n ~ 'secondar' then return 'secondaries'; end if;
  if p_fund_type = 'Venture Capital Fund' or n ~ '\m(venture|ventures|seed|early[- ]stage|pre[- ]seed)\M' then return 'venture_capital'; end if;
  if n ~ '\m(infrastructure|infra|energy transition|renewable|renewables|power|utility|utilities|transport|transit|fiber|fibre|solar|wind|climate|decarboni|sustainab|clean energy|midstream|data ?cent)\M' then return 'infrastructure'; end if;
  if n ~ '\m(real estate|realty|property|properties|reit|housing|multifamily|multi-family|industrial|logistics|office|residential|apartment|self[- ]storage|hospitality|hotel|land)\M' then return 'real_estate'; end if;
  if n ~ '\m(credit|lending|loan|loans|debt|mezzanine|mezz|clo|clos|senior secured|income|yield|bdc|capital solutions|special situations|asset[- ]based|structured|receivables|nav finance|royalt)\M' then return 'private_credit'; end if;
  if p_fund_type = 'Hedge Fund' then return 'hedge_funds'; end if;
  if p_fund_type = 'Private Equity Fund' or n ~ '\m(buyout|growth equity|private equity|equity partners|acquisition|co-?invest)\M' then return 'private_equity'; end if;
  return 'other';
end $$;
