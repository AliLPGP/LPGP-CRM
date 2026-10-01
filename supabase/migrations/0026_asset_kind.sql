-- 0026: what the asset is depends on the class. In private equity it is the
-- portfolio company; in private credit the loan; in infrastructure a physical
-- asset (a toll road, a bridge, a pipeline, a wind farm, a port); in real
-- estate a property or development. portfolio_companies holds all of the
-- equity-side kinds, so each row says which it is. Loans stay in the loan
-- books (credit_positions, borrowers). Idempotent.
alter table public.portfolio_companies add column if not exists asset_kind text; -- company | infrastructure_asset | property
alter table public.portfolio_companies add column if not exists asset_location text; -- where the physical asset is, as stated
update public.portfolio_companies set asset_kind = 'infrastructure_asset' where asset_kind is null and asset_class ~* 'infrastructure';
update public.portfolio_companies set asset_kind = 'property' where asset_kind is null and asset_class ~* 'real estate' and name !~* '(reit|trust|inc\.?|corp)';
create index if not exists portfolio_companies_asset_kind_idx on public.portfolio_companies (asset_kind) where asset_kind is not null;
