-- filings: part 4 of 7
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create or replace function ingest.parse_form_d(p_key text, p_url text, p_meta jsonb, p_body text) returns text
language plpgsql as $$
declare
  x xml; p xml; rp xml; rec xml;
  v_related jsonb := '[]'::jsonb; v_agents jsonb := '[]'::jsonb;
  v_gp text; v_gp_weak boolean := false; v_name text; v_first text; v_last text; v_clar text; v_rels text[];
  v_industry text; v_fund_type text; v_offering text; v_class text;
  v_match record; v_cik text; v_issuer text; v_fund_id uuid; v_id uuid;
begin
  x := xmlparse(document p_body);
  p := (xpath('/edgarSubmission/primaryIssuer', x))[1];
  v_cik := ltrim(ingest.x1(p, 'cik'), '0');
  v_issuer := ingest.x1(p, 'entityName');
  if v_issuer is null then return 'skipped: no issuer'; end if;

  for rp in select unnest(xpath('/edgarSubmission/relatedPersonsList/relatedPersonInfo', x)) loop
    v_first := ingest.x1(rp, 'relatedPersonName/firstName');
    v_last  := ingest.x1(rp, 'relatedPersonName/lastName');
    v_clar  := ingest.x1(rp, 'relationshipClarification');
    select array_agg(btrim(r::text)) into v_rels from unnest(xpath('//relatedPersonRelationshipList/relationship/text()', rp)) r;
    v_name := btrim(concat_ws(' ', nullif(nullif(v_first, 'N/A'), ''), nullif(nullif(ingest.x1(rp, 'relatedPersonName/middleName'), 'N/A'), ''), v_last));
    v_related := v_related || jsonb_build_object('name', v_name, 'relationships', coalesce(to_jsonb(v_rels), '[]'::jsonb), 'clarification', v_clar);
    -- The GP is an entity (no first name), never one of the individuals the
    -- form lists beside it. An entity the filer calls the general partner,
    -- manager, adviser or sponsor wins over one that merely reads like a firm.
    if coalesce(v_first, 'N/A') in ('N/A', '') and v_last is not null then
      if coalesce(v_clar, '') ~* '(general partner|managing member|manager of the|investment (adviser|advisor|manager)|sponsor|\mgp\M)' then
        if v_gp is null or v_gp_weak then v_gp := v_name; v_gp_weak := false; end if;
      elsif v_gp is null and v_last ~* '(\mgp\M|general partner|partners|management|manager|advisors|advisers|capital|llc|l\.?l\.?c|l\.?p\.?|ltd|limited|inc|sas|sarl|gmbh|ag\M)' then
        v_gp := v_name; v_gp_weak := true;
      end if;
    end if;
  end loop;

  for rec in select unnest(xpath('/edgarSubmission/offeringData/salesCompensationList/recipient', x)) loop
    v_agents := v_agents || jsonb_build_object(
      'name', ingest.x1(rec, 'recipientName'), 'crd', ingest.x1(rec, 'recipientCRDNumber'),
      'broker_dealer', ingest.x1(rec, 'associatedBDName'), 'bd_crd', ingest.x1(rec, 'associatedBDCRDNumber'),
      'states', (select coalesce(jsonb_agg(btrim(s::text)), '[]'::jsonb) from unnest(xpath('//statesOfSolicitationList/state/text()', rec)) s));
  end loop;

  v_industry  := ingest.x1(x, '/edgarSubmission/offeringData/industryGroup/industryGroupType');
  v_fund_type := ingest.x1(x, '/edgarSubmission/offeringData/industryGroup/investmentFundInfo/investmentFundType');
  v_offering  := ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalOfferingAmount');
  v_class     := ingest.classify_fund(v_issuer, v_fund_type, v_industry);
  select * into v_match from ingest.match_firm(coalesce(v_gp, v_issuer));
  if v_match.company_id is null and v_gp is not null then select * into v_match from ingest.match_firm(v_issuer); end if;

  insert into public.fund_offerings as fo (
    accession_no, cik, issuer_name, entity_type, jurisdiction, state, year_of_inc, form, is_amendment, filing_date,
    first_sale_date, first_sale_pending, industry_group, fund_type, is_40_act, is_pooled,
    offering_amount, offering_indefinite, amount_sold, amount_remaining, investors_count, min_investment,
    has_non_accredited, more_than_one_year, exemptions, security_types, general_partner, related_persons, placement_agents,
    sales_commissions, finders_fees, asset_class, gp_company_id, gp_match, source_url)
  values (
    p_key, v_cik, v_issuer, ingest.x1(p, 'entityType'), ingest.x1(p, 'jurisdictionOfInc'), ingest.x1(p, 'issuerAddress/stateOrCountry'),
    ingest.num(ingest.x1(p, 'yearOfInc/value'))::integer, p_meta->>'form',
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/newOrAmendment/isAmendment')),
    (p_meta->>'filing_date')::date,
    (ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/dateOfFirstSale/value'))::date,
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/dateOfFirstSale/yetToOccur')),
    v_industry, v_fund_type,
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/industryGroup/investmentFundInfo/is40Act')),
    coalesce(v_industry = 'Pooled Investment Fund', false),
    ingest.num(v_offering), coalesce(v_offering ilike 'indefinite', false),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalAmountSold')),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalRemaining')),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/investors/totalNumberAlreadyInvested'))::integer,
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/minimumInvestmentAccepted')),
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/investors/hasNonAccreditedInvestors')),
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/durationOfOffering/moreThanOneYear')),
    coalesce((select array_agg(btrim(e::text)) from unnest(xpath('/edgarSubmission/offeringData/federalExemptionsExclusions/item/text()', x)) e), '{}'),
    coalesce((select array_agg(regexp_replace((regexp_match(n::text, '^<([A-Za-z]+)'))[1], '^is|Type$', '', 'g')) from unnest(xpath('/edgarSubmission/offeringData/typesOfSecuritiesOffered/*[text()="true"]', x)) n), '{}'),
    v_gp, v_related, v_agents,
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/salesCommissionsFindersFees/salesCommissions/dollarAmount')),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/salesCommissionsFindersFees/findersFees/dollarAmount')),
    v_class, v_match.company_id, v_match.method,
    format('https://www.sec.gov/Archives/edgar/data/%s/%s/', v_cik, replace(p_key, '-', '')))
  on conflict (accession_no) do update set
    issuer_name = excluded.issuer_name, entity_type = excluded.entity_type, jurisdiction = excluded.jurisdiction, state = excluded.state,
    year_of_inc = excluded.year_of_inc, form = excluded.form, is_amendment = excluded.is_amendment, filing_date = excluded.filing_date,
    first_sale_date = excluded.first_sale_date, first_sale_pending = excluded.first_sale_pending, industry_group = excluded.industry_group,
    fund_type = excluded.fund_type, is_40_act = excluded.is_40_act, is_pooled = excluded.is_pooled, offering_amount = excluded.offering_amount,
    offering_indefinite = excluded.offering_indefinite, amount_sold = excluded.amount_sold, amount_remaining = excluded.amount_remaining,
    investors_count = excluded.investors_count, min_investment = excluded.min_investment, has_non_accredited = excluded.has_non_accredited,
    more_than_one_year = excluded.more_than_one_year, exemptions = excluded.exemptions, security_types = excluded.security_types,
    general_partner = excluded.general_partner, related_persons = excluded.related_persons, placement_agents = excluded.placement_agents,
    sales_commissions = excluded.sales_commissions, finders_fees = excluded.finders_fees, asset_class = excluded.asset_class,
    gp_company_id = excluded.gp_company_id, gp_match = excluded.gp_match, updated_at = now()
  returning id into v_id;

  -- A pooled fund is a fund record too, keyed by the issuer so amendments
  -- refresh the same row.
  if v_industry = 'Pooled Investment Fund' then
    insert into public.funds as f (external_key, company_id, name, manager_name, vintage_year, fund_size_usd, target_size_usd, strategy, status, source)
    values ('formd:' || v_cik, v_match.company_id, v_issuer, v_gp,
            coalesce(extract(year from (ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/dateOfFirstSale/value'))::date)::integer, ingest.num(ingest.x1(p, 'yearOfInc/value'))::integer),
            nullif(ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalAmountSold')), 0),
            ingest.num(v_offering), v_class,
            case when ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalRemaining')) = 0 then 'closed' else 'raising' end,
            'sec_form_d')
    on conflict (external_key) do update set
      company_id = coalesce(excluded.company_id, f.company_id), manager_name = coalesce(excluded.manager_name, f.manager_name),
      vintage_year = coalesce(f.vintage_year, excluded.vintage_year),
      fund_size_usd = greatest(coalesce(excluded.fund_size_usd, 0), coalesce(f.fund_size_usd, 0)),
      target_size_usd = coalesce(excluded.target_size_usd, f.target_size_usd), strategy = coalesce(excluded.strategy, f.strategy),
      status = excluded.status
    where f.source = 'sec_form_d'
    returning id into v_fund_id;
    if v_fund_id is null then select id into v_fund_id from public.funds where external_key = 'formd:' || v_cik; end if;
    update public.fund_offerings set fund_id = v_fund_id where id = v_id;
  end if;
  return 'done';
end $$;
