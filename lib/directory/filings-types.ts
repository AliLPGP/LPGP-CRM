// Shapes for the SEC filings layer (migration 0017): Form D fund raises and
// BDC loan books, as the app reads them back. Pure: safe on the client.

export type FundOffering = {
  id: string;
  accession_no: string;
  cik: string;
  issuer_name: string;
  entity_type: string | null;
  jurisdiction: string | null;
  state: string | null;
  year_of_inc: number | null;
  form: string;
  is_amendment: boolean | null;
  filing_date: string | null;
  first_sale_date: string | null;
  first_sale_pending: boolean | null;
  industry_group: string | null;
  fund_type: string | null;
  is_pooled: boolean;
  offering_amount: number | null;
  offering_indefinite: boolean;
  amount_sold: number | null;
  amount_remaining: number | null;
  investors_count: number | null;
  min_investment: number | null;
  general_partner: string | null;
  related_persons: { name: string; relationships: string[]; clarification: string | null }[];
  placement_agents: { name: string | null; crd: string | null; broker_dealer: string | null; bd_crd: string | null; states: string[] }[];
  asset_class: string | null;
  gp_company_id: string | null;
  gp_match: string | null;
  fund_id: string | null;
  source_url: string;
};

/** The columns the ledgers read; the rest of the filing stays on the server. */
export const OFFERING_COLUMNS =
  "id, accession_no, cik, issuer_name, entity_type, jurisdiction, state, year_of_inc, form, is_amendment, filing_date, first_sale_date, first_sale_pending, industry_group, fund_type, is_pooled, offering_amount, offering_indefinite, amount_sold, amount_remaining, investors_count, min_investment, general_partner, related_persons, placement_agents, asset_class, gp_company_id, gp_match, fund_id, source_url";

export type CreditLender = {
  cik: string;
  name: string;
  ticker: string | null;
  company_id: string | null;
  latest_accession: string | null;
  latest_form: string | null;
  latest_period: string | null;
  positions_count: number | null;
  fair_value_total: number | null;
  source_url: string | null;
  updated_at: string;
};

export type CreditPosition = {
  id: string;
  lender_cik: string;
  accession_no: string;
  filing_form: string | null;
  as_of: string;
  identifier: string;
  borrower: string;
  instrument: string | null;
  industry: string | null;
  reference_rate: string | null;
  interest_rate: number | null;
  spread: number | null;
  pik_rate: number | null;
  maturity: string | null;
  principal: number | null;
  cost: number | null;
  fair_value: number | null;
  pct_net_assets: number | null;
  is_summary: boolean;
  borrower_company_id: string | null;
  source_url: string;
};

export const POSITION_COLUMNS =
  "id, lender_cik, accession_no, filing_form, as_of, identifier, borrower, instrument, industry, reference_rate, interest_rate, spread, pik_rate, maturity, principal, cost, fair_value, pct_net_assets, is_summary, borrower_company_id, source_url";

/** A position with its lender named, as the credit_book view serves it. */
export type BookPosition = CreditPosition & { lender_name: string; lender_ticker: string | null; lender_company_id: string | null };

export const FUND_TYPE_LABEL: Record<string, string> = {
  "Private Equity Fund": "Private equity fund",
  "Hedge Fund": "Hedge fund",
  "Venture Capital Fund": "Venture capital fund",
  "Other Investment Fund": "Other investment fund",
};

/** The seniority a tagged instrument states, for grouping a loan book. */
export function instrumentGroup(instrument: string | null | undefined): string {
  const s = (instrument ?? "").toLowerCase();
  if (!s) return "Unspecified";
  if (/first[- ]lien|senior secured (?:loan|term|revolv|note)|unitranche|senior (?:secured )?term loan|senior loan|revolv/.test(s)) return "First lien / senior secured";
  if (/second[- ]lien/.test(s)) return "Second lien";
  if (/subordinat|mezzanine|junior|pik note|unsecured (?:note|loan|debt)|holdco/.test(s)) return "Subordinated / mezzanine";
  if (/preferred/.test(s)) return "Preferred equity";
  if (/equity|warrant|common|member|unit|share|interest|llc|l\.p\./.test(s)) return "Equity & warrants";
  if (/note|bond|debenture/.test(s)) return "Notes & bonds";
  if (/clo|structured|certificate/.test(s)) return "Structured";
  return "Other";
}

/** "SOFR + 550" the way a term sheet reads it. */
export function couponLabel(p: Pick<CreditPosition, "reference_rate" | "spread" | "interest_rate" | "pik_rate">): string {
  const parts: string[] = [];
  if (p.spread != null) parts.push(`${p.reference_rate ? p.reference_rate.replace(/Secured Overnight Financing Rate.*/i, "SOFR") : "Base"} + ${Math.round(p.spread * 100)}`);
  if (p.interest_rate != null) parts.push(`${p.interest_rate.toFixed(2)}%`);
  if (p.pik_rate != null && p.pik_rate > 0) parts.push(`${p.pik_rate.toFixed(2)}% PIK`);
  return parts.join(" · ") || "—";
}
