// Shapes for the intelligence layer (migration 0016): the dataset file the
// research produces, and the rows the app reads back. Pure: safe on the client.

import type { AssetClassKey } from "./asset-classes";

export type DatasetOwner = {
  name: string;
  kind: string | null;
  institutional: boolean;
  investor_type: string | null;
  stake_pct: number | null;
  since_year: number | null;
  amount: number | null;
  currency: string | null;
  valuation_at_entry: number | null;
  source_url: string | null;
};

export type DatasetTeam = {
  key: string;
  name: string;
  short_name: string | null;
  sport: string;
  league: string | null;
  country: string | null;
  city: string | null;
  stadium: string | null;
  stadium_capacity: number | null;
  stadium_capacity_source_url: string | null;
  founded_year: number | null;
  domain: string | null;
  ownership_type: string | null;
  ownership_summary: string | null;
  ownership_source_url: string | null;
  revenue: number | null;
  revenue_currency: string | null;
  revenue_season: string | null;
  revenue_source_name: string | null;
  revenue_source_url: string | null;
  valuation: number | null;
  valuation_currency: string | null;
  valuation_year: number | null;
  valuation_source_name: string | null;
  valuation_source_url: string | null;
  social_followers: number | null;
  social_as_of: string | null;
  social_source_url: string | null;
  social_platforms: { platform: string; followers: number; as_of: string | null; source_url: string | null }[];
  notes: string | null;
  sources: string[];
  verification: { field: string; verdict: string; claimed: string; found: string | null; note: string; source_url: string | null }[];
  owners: DatasetOwner[];
};

export type DatasetInvestor = {
  key: string;
  name: string;
  investor_type: string | null;
  hq: string | null;
  domain: string | null;
  aum: number | null;
  aum_currency: string | null;
  aum_as_of: string | null;
  aum_source_url: string | null;
  summary: string | null;
  holdings: { target: string; sport: string | null; stake_pct: number | null; since_year: number | null; source_url: string | null }[];
  source_url: string | null;
};

export type DatasetDeal = {
  key: string;
  date: string | null;
  date_text: string | null;
  kind: string;
  asset_class: AssetClassKey | "other";
  sport: string | null;
  target: string;
  target_kind: string | null;
  target_country: string | null;
  target_team_key: string | null;
  investor: string;
  investor_type: string | null;
  investor_key: string | null;
  seller: string | null;
  stake_pct: number | null;
  amount: number | null;
  currency: string | null;
  valuation: number | null;
  valuation_currency: string | null;
  headline: string;
  summary: string | null;
  source_name: string | null;
  source_url: string;
};

export type DatasetSignal = {
  key: string;
  date: string | null;
  asset_class: AssetClassKey | "other";
  kind: string;
  headline: string;
  summary: string | null;
  entities: string[];
  source_name: string | null;
  source_url: string;
};

/** An LP's fund commitment as an LP publication or the press states it. */
export type DatasetCommitment = {
  key: string;
  lp_name: string;
  gp_name: string | null;
  fund_name: string;
  amount: number | null;
  currency: string | null;
  amount_text: string | null;
  date: string | null;
  date_text: string | null;
  year: number | null;
  disclosure_type: string;
  source_name: string | null;
  source_url: string;
};

export type IntelligenceDataset = {
  version: string;
  generated_at: string;
  teams: DatasetTeam[];
  investors: DatasetInvestor[];
  deals: DatasetDeal[];
  signals: DatasetSignal[];
  /** Absent in editions before 2026-09-29. */
  commitments?: DatasetCommitment[];
};

// --- Rows as read back ----------------------------------------------------------

export type Deal = {
  id: string;
  date: string | null;
  date_text: string | null;
  kind: string;
  asset_class: string;
  sport: string | null;
  target: string;
  target_kind: string | null;
  target_country: string | null;
  target_team_id: string | null;
  target_company_id: string | null;
  target_fund_id: string | null;
  investor: string;
  investor_type: string | null;
  investor_company_id: string | null;
  investor_id: string | null;
  seller: string | null;
  stake_pct: number | null;
  amount: number | null;
  currency: string | null;
  valuation: number | null;
  valuation_currency: string | null;
  headline: string;
  summary: string | null;
  source_name: string | null;
  source_url: string | null;
  source: string;
};

export type Signal = {
  id: string;
  date: string | null;
  asset_class: string;
  kind: string;
  headline: string;
  summary: string | null;
  entities: string[];
  company_ids: string[];
  /** The directory firms behind company_ids, named — resolved on read. */
  firms: { id: string; name: string }[];
  source_name: string | null;
  source_url: string | null;
  source: string;
};

/** The columns the clubs table reads — not the whole record, which carries
 *  every source URL, note and verdict and would travel to the browser for
 *  nothing. Lives here, not in the client component, so a server page can
 *  read the list (a client module's exports are references, not values). */
export const CLUB_ROW_FIELDS = [
  "id", "name", "short_name", "city", "country", "league", "sport", "domain", "ownership_type", "ownership_summary",
  "revenue", "revenue_currency", "revenue_season", "revenue_source_name",
  "valuation", "valuation_currency", "valuation_year", "valuation_source_name",
  "social_followers", "social_as_of", "stadium", "stadium_capacity",
] as const satisfies readonly (keyof SportsTeam)[];

export type ClubRow = Pick<SportsTeam, (typeof CLUB_ROW_FIELDS)[number]> & {
  /** The largest institutional investor on record, for the table. */
  topInvestor: { name: string; stake: number | null; companyId: string | null; investorId: string | null } | null;
  institutional: number;
};

export type SportsTeam = Omit<DatasetTeam, "key" | "owners"> & {
  id: string;
  external_key: string | null;
  source: string;
  updated_at: string;
};

export type TeamOwner = DatasetOwner & {
  id: string;
  team_id: string;
  investor_id: string | null;
  company_id: string | null;
};

export type SportsInvestor = Omit<DatasetInvestor, "key"> & {
  id: string;
  external_key: string | null;
  company_id: string | null;
  source: string;
};

/** Money as the source states it: "€1.16B", "$8.3B", "£975M". */
export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF ", CAD: "C$", AUD: "A$", JPY: "¥", BRL: "R$", SAR: "SAR ", TRY: "₺", CNY: "¥", INR: "₹" };
  const s = currency ? (symbol[currency] ?? `${currency} `) : "";
  const v = Math.abs(amount);
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1).replace(/\.?0+$/, ""));
  if (v >= 1e12) return `${s}${trim(amount / 1e12)}T`;
  if (v >= 1e9) return `${s}${trim(amount / 1e9)}B`;
  if (v >= 1e6) return `${s}${trim(amount / 1e6)}M`;
  if (v >= 1e3) return `${s}${trim(amount / 1e3)}K`;
  return `${s}${amount}`;
}

/** "1.2B" for followers and other counts. */
export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return n.toLocaleString("en-US");
}

export const SPORT_LABEL: Record<string, string> = {
  football: "Football",
  american_football: "American football",
  basketball: "Basketball",
  baseball: "Baseball",
  ice_hockey: "Ice hockey",
  motorsport: "Motorsport",
  rugby: "Rugby",
  cricket: "Cricket",
  golf: "Golf",
  tennis: "Tennis",
  mixed_martial_arts: "MMA",
  multi: "Multi-sport",
};
