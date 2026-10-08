-- Temporary, token-guarded entry point for bulk loads run from a terminal
-- (too large to paste, or personal data that must not be committed). The token
-- is generated in the database; drop with tmp_loader_drop.sql when done.
create table if not exists ingest.tmp_token (t text not null);
delete from ingest.tmp_token;
insert into ingest.tmp_token values (encode(gen_random_bytes(24), 'hex'));
create or replace function public.tmp_load(kind text, p jsonb, token text) returns integer
language plpgsql security definer set search_path = public, ingest as $$
begin
  if token is null or token <> (select t from ingest.tmp_token limit 1) then
    raise exception 'not allowed';
  end if;
  perform set_config('statement_timeout', '55s', true);
  if kind = 'position_terms' then return ingest.load_position_terms(p); end if;
  if kind = 'portco_executives' then return ingest.load_portco_executives(p); end if;
  if kind = 'lp_firmographics' then return ingest.load_lp_firmographics(p); end if;
  if kind = 'lp_contacts' then return ingest.load_lp_contacts(p); end if;
  if kind = 'portco_profiles' then return (public.portco_profile_upsert(p)->>'rows')::int; end if;
  if kind = 'investor_profiles' then return (public.investor_profile_upsert(p)->>'investors')::int; end if;
  if kind = 'lp_web' then return ingest.load_lp_web(p); end if;
  if kind = 'lp_manager_links' then return ingest.load_lp_manager_links(p); end if;
  if kind = 'lp_commitments' then return ingest.load_lp_commitments(p); end if;
  if kind = 'adv_private_funds' and to_regprocedure('ingest.load_adv_private_funds(jsonb)') is not null then
    return ingest.load_adv_private_funds(p);
  end if;
  raise exception 'unknown kind %', kind;
end $$;
revoke all on function public.tmp_load(text, jsonb, text) from public;
grant execute on function public.tmp_load(text, jsonb, text) to anon;
