-- directory: part 4 of 4
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create policy "directory_lists_read" on public.directory_lists for select using (true);
drop policy if exists "directory_list_items_read" on public.directory_list_items;
create policy "directory_list_items_read" on public.directory_list_items for select using (true);
drop policy if exists "saved_searches_read" on public.saved_searches;
create policy "saved_searches_read" on public.saved_searches for select using (true);
drop policy if exists "directory_imports_read" on public.directory_imports;
create policy "directory_imports_read" on public.directory_imports for select using (true);
