import "server-only";
import { unstable_cache } from "next/cache";
import { getReadClient } from "../supabase/server";
import { tableVersion } from "../supabase/version";
import { cachedOrDirect } from "../supabase/safe";
import { INTEL_TAG } from "./intelligence-queries";
import type { Deal } from "./intelligence-types";

// Reads for the portfolio desk (migrations 0015, 0022-0024): the companies
// sponsors hold, and the deals the press releases state about them. Anon
// client; empty on any failure. Aggregates come from portco_summary() in
// SQL, inside the API role's statement limit.

export type PortcoSummary = {
  holdings: number;
  companies: number;
  sponsors: number;
  current: number;
  realized: number;
  deals: number;
  dealsWithAmount: number;
  verifiedDeals: number;
  byYear: { year: number; investments: number }[];
  dealsByYear: { year: number; deals: number; withAmount: number }[];
  amountByCurrency: { currency: string; total: number; deals: number }[];
  byKind: { kind: string; deals: number }[];
  bySponsor: { id: string; name: string; domain: string | null; companies: number; current: number }[];
  bySector: { sector: string; companies: number }[];
  byCountry: { country: string; companies: number }[];
  largest: (Pick<Deal, "id" | "target" | "kind" | "date" | "investor" | "amount" | "currency" | "source_name" | "source_url"> & {
    target_key: string;
    co_investors: string[];
    amount_basis: string | null;
    verified: boolean | null;
  })[];
};

const EMPTY: PortcoSummary = {
  holdings: 0, companies: 0, sponsors: 0, current: 0, realized: 0, deals: 0, dealsWithAmount: 0, verifiedDeals: 0,
  byYear: [], dealsByYear: [], amountByCurrency: [], byKind: [], bySponsor: [], bySector: [], byCountry: [], largest: [],
};

async function buildSummary(version: string): Promise<PortcoSummary> {
  void version; // the tables' write counters, part of the cache key
  const supabase = getReadClient();
  if (!supabase) return EMPTY;
  const { data, error } = await supabase.rpc("portco_summary");
  // Thrown, not returned empty: a failure must never be cached.
  if (error || !data) throw new Error(`portco_summary: ${error?.message ?? "no data"}`);
  return { ...EMPTY, ...(data as Partial<PortcoSummary>) };
}

const cachedSummary = unstable_cache(buildSummary, ["portco-summary-v2"], { tags: [INTEL_TAG], revalidate: 1800 });

export async function getPortcoSummary(): Promise<PortcoSummary> {
  const version = await tableVersion("portfolio_companies", "deals");
  return cachedOrDirect(() => cachedSummary(version), () => buildSummary(version), EMPTY);
}

export type PortcoRow = {
  id: string;
  gp_company_id: string;
  name: string;
  domain: string | null;
  sector: string | null;
  hq: string | null;
  status: string | null;
  invested_year: number | null;
  exit_year: number | null;
  intel_key: string | null;
  deal_value: number | null;
  deal_currency: string | null;
  deal_value_basis: string | null;
  stake_pct: number | null;
  source_url: string | null;
  asset_kind: string | null;
  asset_class: string | null;
  asset_location: string | null;
  gp: { name: string; domain: string | null } | null;
};

export type PortcoFilter = { q?: string; sponsor?: string; status?: "current" | "realized" | ""; priced?: boolean; limit?: number; assetKind?: "company" | "infrastructure_asset" | "property"; assetClass?: string };

const PORTCO_COLUMNS =
  "id, gp_company_id, name, domain, sector, hq, status, invested_year, exit_year, intel_key, deal_value, deal_currency, deal_value_basis, stake_pct, source_url, asset_kind, asset_class, asset_location, gp:companies!portfolio_companies_gp_company_id_fkey(name, domain)";

/** Portfolio companies matching a search, most recent investment first. */
export async function searchPortcos(f: PortcoFilter): Promise<PortcoRow[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  let q = supabase.from("portfolio_companies").select(PORTCO_COLUMNS);
  const term = (f.q ?? "").trim().replace(/[%_,()]/g, " ").trim();
  if (term) q = q.or(`name.ilike.%${term}%,sector.ilike.%${term}%,hq.ilike.%${term}%`);
  if (f.sponsor && /^[0-9a-f-]{36}$/i.test(f.sponsor)) q = q.eq("gp_company_id", f.sponsor);
  if (f.status) q = q.eq("status", f.status);
  if (f.priced) q = q.not("deal_value", "is", null);
  if (f.assetKind === "company") q = q.or("asset_kind.is.null,asset_kind.eq.company");
  else if (f.assetKind) q = q.eq("asset_kind", f.assetKind);
  if (f.assetClass) q = q.ilike("asset_class", `%${f.assetClass.replace(/[%_,()]/g, " ")}%`);
  const { data, error } = await q
    .order(f.priced ? "deal_value" : "invested_year", { ascending: false, nullsFirst: false })
    .order("name")
    .limit(Math.min(f.limit ?? 300, 1000));
  if (error || !data) return [];
  return data as unknown as PortcoRow[];
}

/** How many deals name each company key. */
export async function dealCountsFor(keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const supabase = getReadClient();
  const wanted = [...new Set(keys.filter(Boolean))];
  if (!supabase || !wanted.length) return out;
  for (let i = 0; i < wanted.length; i += 200) {
    const { data, error } = await supabase.from("deals").select("target_key").in("target_key", wanted.slice(i, i + 200));
    if (error || !data) return out;
    for (const r of data as { target_key: string }[]) out.set(r.target_key, (out.get(r.target_key) ?? 0) + 1);
  }
  return out;
}

const PORTCO_DEAL_COLUMNS =
  "id, date, date_text, kind, asset_class, target, target_key, target_country, investor, investor_company_id, co_investors, seller, round, stake_pct, amount, currency, amount_basis, valuation, valuation_currency, headline, summary, source_name, source_url, evidence, verified, source";

/** Every deal the ledger holds about one company, newest first. */
export async function getPortcoDeals(key: string): Promise<Deal[]> {
  const supabase = getReadClient();
  if (!supabase || !key) return [];
  const { data, error } = await supabase
    .from("deals")
    .select(PORTCO_DEAL_COLUMNS)
    .eq("target_key", key)
    .order("date", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error || !data) return [];
  return data as unknown as Deal[];
}

/** Sponsors with a portfolio on file, for the filter. */
export async function portcoSponsors(): Promise<{ id: string; name: string }[]> {
  const s = await getPortcoSummary();
  return s.bySponsor.map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
}
