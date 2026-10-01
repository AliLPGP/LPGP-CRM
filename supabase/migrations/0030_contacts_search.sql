-- 0030: the People page read every contact (a page of 1,000 at a time, then
-- the firms in batches of 150) and filtered in the browser. The database
-- filters and pages instead, and the list only ever needs to know whether a
-- person HAS an email or phone, so the addresses and numbers never leave the
-- database for a list view. Safe to re-run.
create or replace function public.contacts_search(
  p_cat text default null,
  p_has_email boolean default false,
  p_q text default null,
  p_offset integer default 0,
  p_limit integer default 100
) returns jsonb
language sql stable as $$
  with words as (
    select w from unnest(string_to_array(lower(btrim(coalesce(p_q, ''))), ' ')) w where w <> ''
  ),
  filtered as (
    select c.id, c.full_name, c.job_title, c.country, c.linkedin_url,
           (c.email is not null) as has_email, (c.phone is not null) as has_phone, coalesce(c.connectable, false) as connectable,
           co.id as company_id, co.name as company_name, co.category::text as company_category
      from public.contacts c
      left join public.companies co on co.id = c.company_id
     where (p_cat is null or co.category::text = p_cat)
       and (not p_has_email or c.email is not null or coalesce(c.connectable, false))
       and not exists (
         select 1 from words
          where lower(concat_ws(' ', c.full_name, c.job_title, co.name, c.country))
                not like '%' || replace(replace(replace(words.w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'all', (select count(*) from public.contacts),
    'hasUnclassified', exists (select 1 from public.contacts c join public.companies co on co.id = c.company_id where co.category = 'UN'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'full_name', f.full_name, 'job_title', f.job_title, 'country', f.country,
        'has_email', f.has_email, 'has_phone', f.has_phone, 'has_linkedin', f.linkedin_url is not null,
        'connectable', f.connectable,
        'company', case when f.company_id is null then null else jsonb_build_object('id', f.company_id, 'name', f.company_name, 'category', f.company_category) end
      ) order by f.full_name nulls last, f.id)
      from (select * from filtered order by full_name nulls last, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)) f
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.contacts_search(text, boolean, text, integer, integer) to anon, authenticated, service_role;
