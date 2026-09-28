-- directory: part 5 of 5
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create index if not exists portfolio_companies_gp_idx on public.portfolio_companies (gp_company_id);

alter table public.portfolio_companies enable row level security;
drop policy if exists "portfolio_companies_read" on public.portfolio_companies;
create policy "portfolio_companies_read" on public.portfolio_companies for select using (true);
