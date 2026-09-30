-- filings: part 3 of 7
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
