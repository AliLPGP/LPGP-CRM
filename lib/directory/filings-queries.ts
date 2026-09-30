import "server-only";
import { unstable_cache } from "next/cache";
import { getReadClient } from "../supabase/server";
import { fetchAll } from "../supabase/paged";
import { tableVersion } from "../supabase/version";
import { ASSET_CLASSES, type AssetClassKey } from "./asset-classes";
import { INTEL_TAG } from "./intelligence-queries";
import { OFFERING_COLUMNS, POSITION_COLUMNS, type BookPosition, type CreditLender, type CreditPosition, type FundOffering } from "./filings-types";
import type { PortcoIntel } from "./portco-intel";
export { financeLead, type PortcoIntel } from "./portco-intel";

// Reads for the SEC filings layer (migration 0018). Anon client; empty on any
// failure, so a database without the tables shows nothing rather than an error.
// The tables grow a batch a minute while the queue drains, so the heavier
// reads are cached for a while under the intelligence tag.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string => typeof v === "string" && UUID.test(v);
const CIK = /^\d{1,10}$/;

export type OfferingFilter = { assetClass?: AssetClassKey | null; gpCompanyId?: string | null; fundId?: string | null; pooledOnly?: boolean; soldOnly?: boolean; limit?: number };

/** Latest Form D per fund, newest filing first. */
export async function getFundOfferings(f: OfferingFilter = {}): Promise<FundOffering[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  let q = supabase.from("fund_offerings_latest").select(OFFERING_COLUMNS);
  if (f.assetClass) q = q.eq("asset_class", f.assetClass);
  if (f.pooledOnly !== false) q = q.eq("is_pooled", true);
  if (f.soldOnly) q = q.gt("amount_sold", 0);
  if (f.gpCompanyId) {
    if (!isUuid(f.gpCompanyId)) return [];
    q = q.eq("gp_company_id", f.gpCompanyId);
  }
  if (f.fundId) {
    if (!isUuid(f.fundId)) return [];
    q = q.eq("fund_id", f.fundId);
  }
  const { data, error } = await q.order("filing_date", { ascending: false, nullsFirst: false }).order("amount_sold", { ascending: false, nullsFirst: false }).limit(f.limit ?? 500);
  if (error || !data) return [];
  return data as unknown as FundOffering[];
}

export type OfferingStats = {
  filings: number;
  /** Funds with money in: amount_sold above zero. */
  raising: number;
  sold: number;
  investors: number;
  /** Latest filing dates by month, oldest first: how much closed when. */
  byMonth: { label: string; count: number; sold: number }[];
  byType: { label: string; count: number; sold: number }[];
  /** Placement agents by the number of funds that name them. */
  agents: { name: string; funds: number }[];
  states: { label: string; count: number }[];
};

// The API roles carry a short statement timeout, so the summaries are
// computed by the database in one call (public.offering_stats,
// public.credit_book_summary in migration 0018) rather than by paging every
// row through the API and adding them up here.
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0);
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));

async function buildOfferingStats(assetClass: AssetClassKey | "", version: string): Promise<OfferingStats> {
  void version; // the filings row count, part of the cache key
  const empty: OfferingStats = { filings: 0, raising: 0, sold: 0, investors: 0, byMonth: [], byType: [], agents: [], states: [] };
  const supabase = getReadClient();
  if (!supabase) return empty;
  const { data, error } = await supabase.rpc("offering_stats", { p_class: assetClass || null });
  if (error || !data) return empty;
  const d = data as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : []);
  return {
    filings: num(d.filings),
    raising: num(d.raising),
    sold: num(d.sold),
    investors: num(d.investors),
    byMonth: list("byMonth").map((m) => ({ label: String(m.label), count: num(m.count), sold: num(m.sold) })),
    byType: list("byType").map((t) => ({ label: String(t.label), count: num(t.count), sold: num(t.sold) })),
    agents: list("agents").map((a) => ({ name: String(a.name), funds: num(a.funds) })),
    states: list("states").map((s) => ({ label: String(s.label), count: num(s.count) })),
  };
}

const cachedOfferingStats = unstable_cache(buildOfferingStats, ["offering-stats-v1"], { tags: [INTEL_TAG], revalidate: 1800 });

export async function getOfferingStats(assetClass?: AssetClassKey | null): Promise<OfferingStats> {
  const version = await tableVersion("fund_offerings");
  try {
    return await cachedOfferingStats(assetClass ?? "", version);
  } catch {
    return buildOfferingStats(assetClass ?? "", version);
  }
}

/** Every lender with a parsed loan book, largest book first. */
export async function listCreditLenders(): Promise<CreditLender[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("credit_lenders").select("*").not("latest_period", "is", null).order("fair_value_total", { ascending: false, nullsFirst: false }).limit(500);
  if (error || !data) return [];
  return data as CreditLender[];
}

export async function getCreditLender(cik: string): Promise<CreditLender | null> {
  const supabase = getReadClient();
  if (!supabase || !CIK.test(cik)) return null;
  const { data } = await supabase.from("credit_lenders").select("*").eq("cik", cik).maybeSingle();
  return (data as CreditLender | null) ?? null;
}

/** A lender's book at one period (its latest by default), positions only. */
export async function getLenderBook(cik: string, asOf?: string | null): Promise<CreditPosition[]> {
  const supabase = getReadClient();
  if (!supabase || !CIK.test(cik)) return [];
  let period = asOf ?? null;
  if (!period) {
    const lender = await getCreditLender(cik);
    period = lender?.latest_period ?? null;
  }
  if (!period) return [];
  const rows = await fetchAll<CreditPosition>((from, to, first) =>
    supabase
      .from("credit_positions")
      .select(POSITION_COLUMNS, first ? { count: "exact" } : undefined)
      .eq("lender_cik", cik)
      .eq("as_of", period)
      .eq("is_summary", false)
      .order("fair_value", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, to),
  );
  return rows ?? [];
}

/** The periods a lender's book has been parsed for, newest first. */
export async function getLenderPeriods(cik: string): Promise<{ as_of: string; positions: number; fair_value: number }[]> {
  const supabase = getReadClient();
  if (!supabase || !CIK.test(cik)) return [];
  const rows = await fetchAll<{ as_of: string; fair_value: number | null }>((from, to, first) =>
    supabase.from("credit_positions").select("as_of, fair_value", first ? { count: "exact" } : undefined).eq("lender_cik", cik).eq("is_summary", false).order("as_of").order("id").range(from, to),
  );
  const by = new Map<string, { positions: number; fair_value: number }>();
  for (const r of rows ?? []) {
    const v = by.get(r.as_of) ?? { positions: 0, fair_value: 0 };
    v.positions += 1; v.fair_value += Number(r.fair_value ?? 0); by.set(r.as_of, v);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([as_of, v]) => ({ as_of, ...v }));
}

/** Positions across every lender's latest book whose borrower matches. */
export async function searchBook(query: string, limit = 300): Promise<BookPosition[]> {
  const supabase = getReadClient();
  const q = query.trim();
  if (!supabase || q.length < 2) return [];
  const { data, error } = await supabase
    .from("credit_book")
    .select(`${POSITION_COLUMNS}, lender_name, lender_ticker, lender_company_id`)
    .ilike("borrower", `%${q.replace(/[%_]/g, "")}%`)
    .order("fair_value", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as BookPosition[];
}

/** The lenders a directory firm manages (Ares → Ares Capital Corp). */
export async function lendersManagedBy(companyId: string): Promise<CreditLender[]> {
  const supabase = getReadClient();
  if (!supabase || !isUuid(companyId)) return [];
  const { data } = await supabase.from("credit_lenders").select("*").eq("company_id", companyId).not("latest_period", "is", null).order("fair_value_total", { ascending: false, nullsFirst: false });
  return (data as CreditLender[] | null) ?? [];
}

export type BookSummary = {
  lenders: number;
  positions: number;
  fairValue: number;
  /** Fair value by instrument seniority, largest first. */
  byInstrument: { label: string; value: number; count: number }[];
  /** Spread over the reference rate, in 100 bp bins. */
  spreadBins: { label: string; count: number }[];
  /** Weighted by fair value; null when nothing carries a rate. */
  avgSpread: number | null;
  avgRate: number | null;
  /** Borrowers held by more than one lender, most lenders first. */
  shared: { borrower: string; lenders: number; fairValue: number }[];
  byLender: { cik: string; name: string; ticker: string | null; positions: number; fairValue: number }[];
};

async function buildBookSummary(version: string): Promise<BookSummary> {
  void version;
  const empty: BookSummary = { lenders: 0, positions: 0, fairValue: 0, byInstrument: [], spreadBins: [], avgSpread: null, avgRate: null, shared: [], byLender: [] };
  const supabase = getReadClient();
  if (!supabase) return empty;
  const { data, error } = await supabase.rpc("credit_book_summary");
  if (error || !data) return empty;
  const d = data as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : []);
  return {
    lenders: num(d.lenders),
    positions: num(d.positions),
    fairValue: num(d.fairValue),
    byInstrument: list("byInstrument").map((s) => ({ label: String(s.label), value: num(s.value), count: num(s.count) })),
    spreadBins: list("spreadBins").map((b) => ({ label: String(b.label), count: num(b.count) })),
    avgSpread: numOrNull(d.avgSpread),
    avgRate: numOrNull(d.avgRate),
    shared: list("shared").map((b) => ({ borrower: String(b.borrower), lenders: num(b.lenders), fairValue: num(b.fairValue) })),
    byLender: list("byLender").map((l) => ({ cik: String(l.cik), name: String(l.name), ticker: l.ticker == null ? null : String(l.ticker), positions: num(l.positions), fairValue: num(l.fairValue) })),
  };
}

const cachedBookSummary = unstable_cache(buildBookSummary, ["book-summary-v1"], { tags: [INTEL_TAG], revalidate: 1800 });

export async function getBookSummary(): Promise<BookSummary> {
  const version = await tableVersion("credit_positions");
  try {
    return await cachedBookSummary(version);
  } catch {
    return buildBookSummary(version);
  }
}

// --- Borrowers: the companies behind the loan books (migration 0021) ------

export type Borrower = {
  key: string;
  borrower: string;
  lenders: number;
  positions: number;
  fair_value: number | null;
  principal: number | null;
  cost: number | null;
  /** Fair value over cost, as a ratio (0.92 = marked at 92). */
  mark: number | null;
  spread: number | null;
  rate: number | null;
  pik_rate: number | null;
  next_maturity: string | null;
  as_of: string | null;
  instruments: string | null;
  lender_names: string[] | null;
  industry: string | null;
};

export type BorrowerSummary = {
  borrowers: number;
  fairValue: number;
  clubbed: number;
  stressed: number;
  pik: number;
  maturing: number;
  markBins: { label: string; count: number }[];
  largest: { key: string; borrower: string; lenders: number; fairValue: number; mark: number | null; spread: number | null }[];
  mostLenders: { key: string; borrower: string; lenders: number; fairValue: number; mark: number | null }[];
};

export type BorrowerFilter = "" | "stressed" | "pik" | "maturing" | "clubbed";

async function buildBorrowerSummary(version: string): Promise<BorrowerSummary> {
  void version;
  const empty: BorrowerSummary = { borrowers: 0, fairValue: 0, clubbed: 0, stressed: 0, pik: 0, maturing: 0, markBins: [], largest: [], mostLenders: [] };
  const supabase = getReadClient();
  if (!supabase) return empty;
  const { data, error } = await supabase.rpc("borrower_summary");
  if (error || !data) return empty;
  const d = data as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : []);
  return {
    borrowers: num(d.borrowers),
    fairValue: num(d.fairValue),
    clubbed: num(d.clubbed),
    stressed: num(d.stressed),
    pik: num(d.pik),
    maturing: num(d.maturing),
    markBins: list("markBins").map((b) => ({ label: String(b.label), count: num(b.count) })),
    largest: list("largest").map((b) => ({ key: String(b.key), borrower: String(b.borrower), lenders: num(b.lenders), fairValue: num(b.fairValue), mark: numOrNull(b.mark), spread: numOrNull(b.spread) })),
    mostLenders: list("mostLenders").map((b) => ({ key: String(b.key), borrower: String(b.borrower), lenders: num(b.lenders), fairValue: num(b.fairValue), mark: numOrNull(b.mark) })),
  };
}

const cachedBorrowerSummary = unstable_cache(buildBorrowerSummary, ["borrower-summary-v1"], { tags: [INTEL_TAG], revalidate: 1800 });

export async function getBorrowerSummary(): Promise<BorrowerSummary> {
  // The materialised view has its own write counters: a refresh or rebuild
  // changes the key even when no position changed.
  const version = await tableVersion("credit_positions", "borrowers");
  try {
    return await cachedBorrowerSummary(version);
  } catch {
    return buildBorrowerSummary(version);
  }
}

/** Borrowers by name and one of the desk's filters, largest first. */
export async function searchBorrowers(q: string, filter: BorrowerFilter, limit = 300): Promise<Borrower[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("borrower_search", { p_q: q.trim() || null, p_filter: filter || null, p_limit: limit });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    key: String(r.key),
    borrower: String(r.borrower),
    lenders: num(r.lenders),
    positions: num(r.positions),
    fair_value: numOrNull(r.fair_value),
    principal: numOrNull(r.principal),
    cost: numOrNull(r.cost),
    mark: numOrNull(r.mark),
    spread: numOrNull(r.spread),
    rate: numOrNull(r.rate),
    pik_rate: numOrNull(r.pik_rate),
    next_maturity: r.next_maturity == null ? null : String(r.next_maturity),
    as_of: r.as_of == null ? null : String(r.as_of),
    instruments: r.instruments == null ? null : String(r.instruments),
    lender_names: Array.isArray(r.lender_names) ? (r.lender_names as string[]) : null,
    industry: r.industry == null ? null : String(r.industry),
  }));
}

/** Filing counts per class for the hub, one HEAD request each. */
export async function offeringCounts(): Promise<Record<AssetClassKey, number>> {
  const supabase = getReadClient();
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c.key, 0])) as Record<AssetClassKey, number>;
  if (!supabase) return out;
  await Promise.all(
    ASSET_CLASSES.map(async (c) => {
      const { count } = await supabase.from("fund_offerings_latest").select("id", { count: "exact", head: true }).eq("asset_class", c.key).eq("is_pooled", true);
      out[c.key] = count ?? 0;
    }),
  );
  return out;
}

// --- Portfolio-company intelligence (migration 0022) ------------------------

const PORTCO_INTEL_COLUMNS =
  "key, name, domain, country, ch_number, ch_name, ch_status, ch_type, sic_codes, incorporated_on, registered_address, officers, accounts_period_end, accounts_type, accounts_url, currency, revenue, gross_profit, operating_profit, profit_before_tax, depreciation, amortisation, ebitda_derived, employees, net_assets, cash, creditors_over_year, executives, executives_at, ch_at";

/** Intel rows for some company keys (`borrower_key(name)`), by key. Empty on any failure. */
export async function getPortcoIntel(keys: string[]): Promise<Map<string, PortcoIntel>> {
  const out = new Map<string, PortcoIntel>();
  const supabase = getReadClient();
  const wanted = [...new Set(keys.filter(Boolean))];
  if (!supabase || !wanted.length) return out;
  for (let i = 0; i < wanted.length; i += 200) {
    const { data, error } = await supabase.from("portco_intel").select(PORTCO_INTEL_COLUMNS).in("key", wanted.slice(i, i + 200));
    if (error || !data) return out;
    for (const row of data as unknown as PortcoIntel[]) out.set(row.key, row);
  }
  return out;
}

/** How many intel rows hold filed figures, for the desk's strip. */
export async function portcoIntelCounts(): Promise<{ rows: number; accounts: number; executives: number }> {
  const supabase = getReadClient();
  if (!supabase) return { rows: 0, accounts: 0, executives: 0 };
  const [all, acc, ex] = await Promise.all([
    supabase.from("portco_intel").select("key", { count: "exact", head: true }).not("ch_number", "is", null),
    supabase.from("portco_intel").select("key", { count: "exact", head: true }).not("revenue", "is", null),
    supabase.from("portco_intel").select("key", { count: "exact", head: true }).not("executives_at", "is", null),
  ]);
  return { rows: all.count ?? 0, accounts: acc.count ?? 0, executives: ex.count ?? 0 };
}

/** The sponsors that hold a company, by its key. */
export async function portcoHolders(key: string): Promise<{ id: string; gp_company_id: string; gp_name: string | null; gp_domain: string | null; name: string; domain: string | null; sector: string | null; hq: string | null; status: string | null; invested_year: number | null; exit_year: number | null; fund_name: string | null; description: string | null; source_url: string | null }[]> {
  const supabase = getReadClient();
  if (!supabase || !key) return [];
  const { data, error } = await supabase.from("portfolio_companies").select("id, gp_company_id, name, domain, sector, hq, status, invested_year, exit_year, fund_name, description, source_url").eq("intel_key", key).limit(50);
  if (error || !data?.length) return [];
  const rows = data as { id: string; gp_company_id: string; name: string; domain: string | null; sector: string | null; hq: string | null; status: string | null; invested_year: number | null; exit_year: number | null; fund_name: string | null; description: string | null; source_url: string | null }[];
  const { data: gps } = await supabase.from("companies").select("id, name, domain").in("id", [...new Set(rows.map((r) => r.gp_company_id))]);
  const byId = new Map(((gps as { id: string; name: string; domain: string | null }[] | null) ?? []).map((g) => [g.id, g]));
  return rows.map((r) => ({ ...r, gp_name: byId.get(r.gp_company_id)?.name ?? null, gp_domain: byId.get(r.gp_company_id)?.domain ?? null }));
}

/** One borrower row by key, or null. */
export async function getBorrower(key: string): Promise<Borrower | null> {
  const supabase = getReadClient();
  if (!supabase || !key) return null;
  const { data, error } = await supabase.from("borrowers").select("*").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return data as Borrower;
}

/** A borrower's positions across every lender's latest book, by the same fold the view uses. */
export async function borrowerPositions(key: string, limit = 200): Promise<BookPosition[]> {
  const supabase = getReadClient();
  if (!supabase || !key) return [];
  const { data, error } = await supabase.rpc("borrower_positions", { p_key: key, p_limit: limit });
  if (error || !data) return [];
  return data as BookPosition[];
}
