-- Migration 0022 in one statement: the database fetches the migration from
-- GitHub and runs it. For a SQL editor that cuts long pastes short -- the
-- parser functions in 0020 are single statements of over a hundred lines, so
-- the parts beside this file cannot be cut any smaller. Needs the http
-- extension, which the migration itself also installs.
create extension if not exists http with schema extensions;
do $$
declare r record;
begin
  select status, content into r
    from extensions.http(('GET', 'https://raw.githubusercontent.com/worldhealthai/lpgp-crm/main/supabase/migrations/0022_portco_intel.sql',
      array[extensions.http_header('User-Agent', 'LPGP Connect setup')], null, null)::extensions.http_request);
  if r.status <> 200 then raise exception 'could not fetch the migration: HTTP %', r.status; end if;
  execute r.content;
end $$;
