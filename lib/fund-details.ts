import { getReadClient } from "./supabase/server";

// The fund profile categories (migration 0032) and the SEC Form D facts we
// already hold. Both degrade to null: an older database without the table
// just shows every category as not yet researched.

export type FundClose = { label?: string; date?: string | null; amount?: number | null; currency?: string | null; estimated?: boolean };
export type SourceRef = { url?: string; name?: string; kind?: string; as_of?: string };

export type FundDetails = {
  fund_id: string;
  overview: string | null;
  core_industry: string | null;
  industry_focus: string[] | null;
  geographic_scope: string | null;
  core_geography: string | null;
  geographic_exposure: { region?: string; pct?: number }[] | null;
  fundraising_status: string | null;
  fundraising_launch: string | null;
  target_size: number | null;
  target_currency: string | null;
  hard_cap: number | null;
  closes: FundClose[] | null;
  co_investment_offered: boolean | null;
  legal_structure: string | null;
  term_years: number | null;
  investment_period_years: number | null;
  extension_years: number | null;
  gp_commitment_pct: number | null;
  management_fee_pct: number | null;
  fee_basis: string | null;
  carried_interest_pct: number | null;
  hurdle_pct: number | null;
  sfdr_article: string | null;
  esg_policy: boolean | null;
  sustainability_note: string | null;
  series_name: string | null;
  series_sequence: number | null;
  sources: Record<string, SourceRef | SourceRef[]> | null;
  research_state: "pending" | "done" | "no_public_data";
  researched_at: string | null;
};

export type FormDFacts = {
  filing_date: string | null;
  first_sale_date: string | null;
  offering_amount: number | null;
  amount_sold: number | null;
  investors_count: number | null;
  min_investment: number | null;
  source_url: string | null;
};

export async function getFundDetails(fundId: string): Promise<FundDetails | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("fund_details").select("*").eq("fund_id", fundId).maybeSingle();
  if (error || !data) return null;
  return data as FundDetails;
}

export async function getFundFormD(fundId: string): Promise<FormDFacts | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("fund_offerings")
    .select("filing_date, first_sale_date, offering_amount, amount_sold, investors_count, min_investment, source_url")
    .eq("fund_id", fundId)
    .order("filing_date", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error || !data?.length) return null;
  return data[0] as FormDFacts;
}

/** The first source URL recorded for a field, if any. */
export function sourceFor(d: FundDetails | null, field: string): SourceRef | null {
  const s = d?.sources?.[field];
  const first = Array.isArray(s) ? s[0] : s;
  return first?.url ? first : null;
}
