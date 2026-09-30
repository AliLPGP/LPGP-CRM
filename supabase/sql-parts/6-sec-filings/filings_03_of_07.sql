-- filings: part 3 of 7
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- --- Form D -----------------------------------------------------------------

-- Queue every Form D (and amendment) in one EDGAR quarter, plus the 10-Q/10-K
-- filings whose filer name reads like a lender, so the BDC parser can look.
create or replace function ingest.enqueue_quarter(p_year integer, p_qtr integer) returns jsonb
language plpgsql as $$
declare idx text; l text; m text[]; n_d int := 0; n_b int := 0;
begin
  idx := ingest.http_text(format('https://www.sec.gov/Archives/edgar/full-index/%s/QTR%s/form.idx', p_year, p_qtr));
  for l in select * from regexp_split_to_table(idx, E'\n') loop
    if l like 'D %' or l like 'D/A %' then
      m := regexp_match(l, '^(D|D/A)\s+(.*?)\s+(\d+)\s+(\d{4}-\d\d-\d\d)\s+edgar/data/\d+/(\d{10}-\d\d-\d{6})\.txt');
      if m is null then continue; end if;
      insert into ingest.queue (kind, key, url, meta)
      values ('form_d', m[5],
              format('https://www.sec.gov/Archives/edgar/data/%s/%s/primary_doc.xml', m[3], replace(m[5], '-', '')),
              jsonb_build_object('form', m[1], 'name', m[2], 'cik', m[3], 'filing_date', m[4]))
      on conflict (key) do nothing;
      if found then n_d := n_d + 1; end if;
    elsif (l like '10-Q %' or l like '10-K %')
          and l ~* '(\mbdc\M|business development|lending|private credit|credit fund|credit corp|capital corp|income fund|income corp|specialty finance|direct lend|senior loan|debt fund|private capital|investment corp|secured lending|finance corp|capital solutions|credit income|middle market|strategic credit|private debt|credit partners)' then
      m := regexp_match(l, '^(10-Q|10-K)\s+(.*?)\s+(\d+)\s+(\d{4}-\d\d-\d\d)\s+edgar/data/\d+/(\d{10}-\d\d-\d{6})\.txt');
      if m is null then continue; end if;
      insert into ingest.queue (kind, key, url, meta)
      values ('bdc_filing', m[5],
              format('https://www.sec.gov/Archives/edgar/data/%s/%s/index.json', m[3], replace(m[5], '-', '')),
              jsonb_build_object('form', m[1], 'name', m[2], 'cik', m[3], 'filing_date', m[4]))
      on conflict (key) do nothing;
      if found then n_b := n_b + 1; end if;
    end if;
  end loop;
  insert into ingest.log (what, detail) values ('enqueue_quarter', jsonb_build_object('year', p_year, 'qtr', p_qtr, 'form_d', n_d, 'bdc', n_b));
  return jsonb_build_object('form_d', n_d, 'bdc_filings', n_b);
end $$;

-- Queue a specific filer's latest 10-Q/10-K (for lenders whose names give
-- nothing away), from the submissions API.
create or replace function ingest.enqueue_filer(p_cik text, p_limit integer default 1) returns integer
language plpgsql as $$
declare j jsonb; forms jsonb; accs jsonb; dates jsonb; i int; n int := 0; cik10 text := lpad(p_cik, 10, '0');
begin
  j := ingest.http_text('https://data.sec.gov/submissions/CIK' || cik10 || '.json')::jsonb;
  forms := j->'filings'->'recent'->'form'; accs := j->'filings'->'recent'->'accessionNumber'; dates := j->'filings'->'recent'->'filingDate';
  for i in 0 .. jsonb_array_length(forms) - 1 loop
    exit when n >= p_limit;
    if forms->>i in ('10-Q', '10-K') then
      insert into ingest.queue (kind, key, url, meta)
      values ('bdc_filing', accs->>i,
              format('https://www.sec.gov/Archives/edgar/data/%s/%s/index.json', p_cik, replace(accs->>i, '-', '')),
              jsonb_build_object('form', forms->>i, 'name', j->>'name', 'cik', p_cik, 'filing_date', dates->>i, 'ticker', j->'tickers'->>0))
      on conflict (key) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
