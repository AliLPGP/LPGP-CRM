import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getReadClient } from "../supabase/server";
import { tableVersion } from "../supabase/version";
import { cachedOrDirect } from "../supabase/safe";
import { getCompany, getContactsForCompany } from "../queries";
import { DIRECTORY_TAG } from "./index-server";
import { INTEL_TAG, getDeals, getSignals } from "./intelligence-queries";
import { getFundOfferings, getPortcoIntel, type PortcoIntel } from "./filings-queries";
import { getDisclosedCommitments, getFiledProviders, getPortfolioCompanies, nameCommitments, type NamedCommitment } from "./queries";
import type { PortfolioCompany } from "./portfolio";
import type { FundOffering } from "./filings-types";

// The reads behind one firm's profile (migration 0037).
//
// A profile used to fetch every tab's rows before it could draw its header,
// and three of those reads were slow on their own: the Form D view sorted
// every filing to find one manager's, naming a limited partner's
// commitments took a dozen round trips, and the tab bar's counts needed
// every list. Now the header reads one count function, each tab reads its
// own rows behind a Suspense boundary, and the reads that cost the most
// (counts, named commitments, Form D raises, the portfolio with its intel)
// are cached per firm under the fingerprint of the tables each one reads,
// so a second visit is served from the data cache and the ingest's own
// growth is a new key — but only for the reads that touch the table that
// grew. The app's writes to these tables refresh the directory or
// intelligence tag, which these entries carry too.

const PROFILE_TABLES = [
  "companies",
  "contacts",
  "commitments",
  "funds",
  "portfolio_companies",
  "portco_intel",
  "deals",
  "signals",
  "service_relationships",
  "event_participants",
  "investor_profiles",
  "investor_plans",
  "fund_offerings",
  "credit_lenders",
  "sports_team_owners",
  "notes",
];

/** Every table a profile reads, fingerprinted in one RPC per request. */
export const profileVersion = cache((): Promise<string> => tableVersion(...PROFILE_TABLES));

/** The fingerprint of some of those tables, cut from the one RPC ("t:n.t:n…"); the whole string when the database answered with plain counts. */
async function versionOf(...tables: string[]): Promise<string> {
  const all = await profileVersion();
  const parts = new Map(all.split(".").map((p) => [p.slice(0, p.indexOf(":")), p.slice(p.indexOf(":") + 1)] as const));
  if (tables.some((t) => !parts.has(t))) return all;
  return tables.map((t) => `${t}:${parts.get(t)}`).join(".");
}

const CACHE = { tags: [DIRECTORY_TAG, INTEL_TAG], revalidate: 3600 };

const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);

/** What the header and tab bar count; every figure capped where the list it stands for is. */
export type ProfileCounts = {
  contacts: number;
  connectable: number;
  funds: number;
  portcos: number;
  deals: number;
  signals: number;
  held: number;
  offerings: number;
  lenders: number;
  asLp: number;
  /** Commitments as LP that are not the seed's samples: the header's figure. */
  asLpDisclosed: number;
  asGp: number;
  /** Distinct events the firm has had people at. */
  events: number;
  providers: number;
  clients: number;
  notes: number;
};

const EMPTY_COUNTS: ProfileCounts = { contacts: 0, connectable: 0, funds: 0, portcos: 0, deals: 0, signals: 0, held: 0, offerings: 0, lenders: 0, asLp: 0, asLpDisclosed: 0, asGp: 0, events: 0, providers: 0, clients: 0, notes: 0 };

async function buildCounts(companyId: string, version: string): Promise<ProfileCounts> {
  void version; // the tables' fingerprint, part of the cache key
  const supabase = getReadClient();
  if (!supabase) return EMPTY_COUNTS;
  const { data, error } = await supabase.rpc("company_profile_counts", { p_company: companyId });
  // Thrown, not returned empty: a failed read must never be cached.
  if (error || !data) throw new Error(`company_profile_counts: ${error?.message ?? "no data"}`);
  const d = data as Record<string, unknown>;
  return Object.fromEntries(Object.keys(EMPTY_COUNTS).map((k) => [k, num(d[k])])) as ProfileCounts;
}

const cachedCounts = unstable_cache(buildCounts, ["profile-counts-v1"], CACHE);

/** The header's and tab bar's counts for one firm. Zeros before migration 0037 or on any failure. */
export async function getProfileCounts(companyId: string): Promise<ProfileCounts> {
  const version = await profileVersion();
  return cachedOrDirect(() => cachedCounts(companyId, version), () => buildCounts(companyId, version), EMPTY_COUNTS);
}

export type ProfileCommitments = { asLp: NamedCommitment[]; asGp: NamedCommitment[] };

async function buildCommitments(companyId: string, version: string): Promise<ProfileCommitments> {
  void version;
  const supabase = getReadClient();
  if (!supabase) return { asLp: [], asGp: [] };
  const { data, error } = await supabase.rpc("company_commitments", { p_company: companyId });
  if (!error && data && typeof data === "object") {
    const d = data as { asLp?: NamedCommitment[]; asGp?: NamedCommitment[] };
    return { asLp: d.asLp ?? [], asGp: d.asGp ?? [] };
  }
  // Before migration 0037: the rows, then their names, in batches.
  const rows = await getDisclosedCommitments(companyId);
  const [asLp, asGp] = await Promise.all([nameCommitments(rows.asLp), nameCommitments(rows.asGp)]);
  return { asLp, asGp };
}

const cachedCommitments = unstable_cache(buildCommitments, ["profile-commitments-v1"], CACHE);

/** A firm's disclosed commitments, as LP and as manager, named — one call. */
export const getProfileCommitments = cache(async (companyId: string): Promise<ProfileCommitments> => {
  const version = await versionOf("commitments", "funds", "companies");
  return cachedOrDirect(() => cachedCommitments(companyId, version), () => buildCommitments(companyId, version), { asLp: [], asGp: [] });
});

async function buildOfferings(companyId: string, version: string): Promise<FundOffering[]> {
  void version;
  return getFundOfferings({ gpCompanyId: companyId, limit: 200 });
}

const cachedOfferings = unstable_cache(buildOfferings, ["profile-offerings-v1"], CACHE);

/** The Form D raises naming this firm as manager, latest filing per fund. */
export const getProfileOfferings = cache(async (companyId: string): Promise<FundOffering[]> => {
  const version = await versionOf("fund_offerings");
  return cachedOrDirect(() => cachedOfferings(companyId, version), () => buildOfferings(companyId, version), [] as FundOffering[]);
});

/** The columns the portfolio tab reads of a company's intel: its leads and its latest filed figures. */
const PORTCO_INTEL_TAB_COLUMNS =
  "key, name, domain, country, ch_number, ch_name, ch_status, ch_type, sic_codes, incorporated_on, registered_address, officers, accounts_period_end, accounts_type, accounts_url, currency, revenue, gross_profit, operating_profit, profit_before_tax, depreciation, amortisation, ebitda_derived, employees, net_assets, cash, creditors_over_year, executives, executives_at, ch_at, ceo, cfo, coo, managing_director, leaders";

export type ProfilePortfolio = { rows: PortfolioCompany[]; intel: Record<string, PortcoIntel> };

/** The fields the portfolio tab draws of a company; the research job's longer notes stay on the server (a third of the rows' weight). */
function portfolioRow(p: PortfolioCompany): PortfolioCompany {
  return {
    id: p.id,
    gp_company_id: p.gp_company_id,
    name: p.name,
    domain: p.domain,
    description: p.description,
    sector: p.sector,
    hq: p.hq,
    status: p.status,
    invested_year: p.invested_year,
    exit_year: p.exit_year,
    fund_name: p.fund_name,
    source: p.source,
    source_url: p.source_url,
    created_at: p.created_at,
    intel_key: p.intel_key ?? null,
    deal_value: p.deal_value ?? null,
    deal_currency: p.deal_currency ?? null,
    deal_value_basis: p.deal_value_basis ?? null,
    equity_invested: p.equity_invested ?? null,
    stake_pct: p.stake_pct ?? null,
    co_investors: p.co_investors ?? [],
    deal_source_url: p.deal_source_url ?? null,
  };
}

async function buildPortfolio(companyId: string, version: string): Promise<ProfilePortfolio> {
  void version;
  const rows = (await getPortfolioCompanies(companyId)).map(portfolioRow);
  const intel = await getPortcoIntel(rows.map((p) => p.intel_key ?? ""), PORTCO_INTEL_TAB_COLUMNS);
  return { rows, intel: Object.fromEntries(intel) };
}

const cachedPortfolio = unstable_cache(buildPortfolio, ["profile-portfolio-v1"], CACHE);

/** A sponsor's whole portfolio with what is on file about each company. */
export async function getProfilePortfolio(companyId: string): Promise<ProfilePortfolio> {
  const version = await versionOf("portfolio_companies", "portco_intel");
  return cachedOrDirect(() => cachedPortfolio(companyId, version), () => buildPortfolio(companyId, version), { rows: [], intel: {} });
}

// The light reads several parts of a profile share (the metadata and the
// page both read the firm; the overview shows the first few contacts,
// deals, providers and signals that their own tabs list in full): one
// query per request, however many of them render.
export const profileCompany = cache(getCompany);
export const profileContacts = cache(getContactsForCompany);
export const profileDeals = cache((companyId: string) => getDeals({ companyId, limit: 300 }));
export const profileSignals = cache((companyId: string) => getSignals({ companyId, limit: 100 }));
export const profileProviders = cache(getFiledProviders);
