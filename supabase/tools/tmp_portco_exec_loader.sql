-- Temporary, token-guarded entry point for loading executive lists that must
-- not be committed (personal data). The token is generated in the database and
-- never leaves it except to the operator; drop with tmp_portco_exec_loader_drop.sql.
create table if not exists ingest.tmp_token (t text not null);
delete from ingest.tmp_token;
insert into ingest.tmp_token values (encode(gen_random_bytes(24), 'hex'));
create or replace function public.tmp_load_portco_executives(p jsonb, token text) returns integer
language plpgsql security definer set search_path = public, ingest as $$
begin
  if token is null or token <> (select t from ingest.tmp_token limit 1) then
    raise exception 'not allowed';
  end if;
  perform set_config('statement_timeout', '30s', true);
  return ingest.load_portco_executives(p);
end $$;
revoke all on function public.tmp_load_portco_executives(jsonb, text) from public;
grant execute on function public.tmp_load_portco_executives(jsonb, text) to anon;
