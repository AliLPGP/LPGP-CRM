import "server-only";
import { unstable_cache } from "next/cache";
import { getReadClient } from "../supabase/server";
import { fetchAll } from "../supabase/paged";
import { ASSET_CLASSES, type AssetClassKey } from "./asset-classes";
import { INTEL_TAG } from "./intelligence-queries";
import { OFFERING_COLUMNS, POSITION_COLUMNS, instrumentGroup, type BookPosition, type CreditLender, type CreditPosition, type FundOffering } from "./filings-types";

// Reads for the SEC filings layer (migration 0017). Anon client; empty on any
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

async function buildOfferingStats(assetClass: AssetClassKey | ""): Promise<OfferingStats> {
  const empty: OfferingStats = { filings: 0, raising: 0, sold: 0, investors: 0, byMonth: [], byType: [], agents: [], states: [] };
  const supabase = getReadClient();
  if (!supabase) return empty;
  type Row = Pick<FundOffering, "amount_sold" | "investors_count" | "filing_date" | "fund_type" | "placement_agents" | "state">;
  const rows = await fetchAll<Row>((from, to, first) => {
    let q = supabase.from("fund_offerings_latest").select("amount_sold, investors_count, filing_date, fund_type, placement_agents, state", first ? { count: "exact" } : undefined).eq("is_pooled", true);
    if (assetClass) q = q.eq("asset_class", assetClass);
    return q.order("cik").range(from, to);
  });
  if (!rows) return empty;
  const months = new Map<string, { count: number; sold: number }>();
  const types = new Map<string, { count: number; sold: number }>();
  const agents = new Map<string, number>();
  const states = new Map<string, number>();
  let raising = 0, sold = 0, investors = 0;
  for (const r of rows) {
    const s = Number(r.amount_sold ?? 0);
    if (s > 0) { raising += 1; sold += s; }
    investors += r.investors_count ?? 0;
    if (r.filing_date) {
      const k = r.filing_date.slice(0, 7);
      const m = months.get(k) ?? { count: 0, sold: 0 };
      m.count += 1; m.sold += s; months.set(k, m);
    }
    const t = r.fund_type ?? "Unstated";
    const tv = types.get(t) ?? { count: 0, sold: 0 };
    tv.count += 1; tv.sold += s; types.set(t, tv);
    for (const a of r.placement_agents ?? []) {
      const n = (a.broker_dealer || a.name || "").trim();
      if (n) agents.set(n, (agents.get(n) ?? 0) + 1);
    }
    if (r.state) states.set(r.state, (states.get(r.state) ?? 0) + 1);
  }
  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  return {
    filings: rows.length,
    raising,
    sold,
    investors,
    byMonth: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([k, v]) => ({ label: monthLabel(k), ...v })),
    byType: [...types.entries()].sort((a, b) => b[1].sold - a[1].sold).map(([label, v]) => ({ label, ...v })),
    agents: [...agents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, funds]) => ({ name, funds })),
    states: [...states.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count })),
  };
}

const cachedOfferingStats = unstable_cache(buildOfferingStats, ["offering-stats-v1"], { tags: [INTEL_TAG], revalidate: 1800 });

export async function getOfferingStats(assetClass?: AssetClassKey | null): Promise<OfferingStats> {
  try {
    return await cachedOfferingStats(assetClass ?? "");
  } catch {
    return buildOfferingStats(assetClass ?? "");
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

async function buildBookSummary(): Promise<BookSummary> {
  const empty: BookSummary = { lenders: 0, positions: 0, fairValue: 0, byInstrument: [], spreadBins: [], avgSpread: null, avgRate: null, shared: [], byLender: [] };
  const supabase = getReadClient();
  if (!supabase) return empty;
  type Row = Pick<BookPosition, "lender_cik" | "lender_name" | "lender_ticker" | "borrower" | "instrument" | "spread" | "interest_rate" | "fair_value">;
  const rows = await fetchAll<Row>((from, to, first) =>
    supabase.from("credit_book").select("lender_cik, lender_name, lender_ticker, borrower, instrument, spread, interest_rate, fair_value", first ? { count: "exact" } : undefined).order("id").range(from, to),
  );
  if (!rows || !rows.length) return empty;
  const instruments = new Map<string, { value: number; count: number }>();
  const bins = new Map<number, number>();
  const borrowers = new Map<string, { lenders: Set<string>; fairValue: number; name: string }>();
  const lenders = new Map<string, { name: string; ticker: string | null; positions: number; fairValue: number }>();
  let fairValue = 0, wSpread = 0, wSpreadBase = 0, wRate = 0, wRateBase = 0;
  for (const r of rows) {
    const fv = Number(r.fair_value ?? 0);
    fairValue += fv;
    const g = instrumentGroup(r.instrument);
    const gi = instruments.get(g) ?? { value: 0, count: 0 };
    gi.value += fv; gi.count += 1; instruments.set(g, gi);
    if (r.spread != null && r.spread > 0 && r.spread < 30) {
      const bin = Math.min(12, Math.floor(r.spread));
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
      wSpread += r.spread * Math.max(fv, 1); wSpreadBase += Math.max(fv, 1);
    }
    if (r.interest_rate != null && r.interest_rate > 0 && r.interest_rate < 40) { wRate += r.interest_rate * Math.max(fv, 1); wRateBase += Math.max(fv, 1); }
    const bk = r.borrower.toLowerCase().replace(/[.,]/g, "").replace(/\s+(inc|llc|lp|ltd|corp|corporation|holdings?|co)$/g, "");
    const b = borrowers.get(bk) ?? { lenders: new Set<string>(), fairValue: 0, name: r.borrower };
    b.lenders.add(r.lender_cik); b.fairValue += fv; borrowers.set(bk, b);
    const l = lenders.get(r.lender_cik) ?? { name: r.lender_name, ticker: r.lender_ticker, positions: 0, fairValue: 0 };
    l.positions += 1; l.fairValue += fv; lenders.set(r.lender_cik, l);
  }
  return {
    lenders: lenders.size,
    positions: rows.length,
    fairValue,
    byInstrument: [...instruments.entries()].sort((a, b) => b[1].value - a[1].value).map(([label, v]) => ({ label, ...v })),
    spreadBins: [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([bin, count]) => ({ label: bin >= 12 ? "1200+" : `${bin * 100}–${bin * 100 + 99}`, count })),
    avgSpread: wSpreadBase ? wSpread / wSpreadBase : null,
    avgRate: wRateBase ? wRate / wRateBase : null,
    shared: [...borrowers.values()].filter((b) => b.lenders.size > 1).sort((a, b) => b.lenders.size - a.lenders.size || b.fairValue - a.fairValue).slice(0, 25).map((b) => ({ borrower: b.name, lenders: b.lenders.size, fairValue: b.fairValue })),
    byLender: [...lenders.entries()].sort((a, b) => b[1].fairValue - a[1].fairValue).map(([cik, v]) => ({ cik, ...v })),
  };
}

const cachedBookSummary = unstable_cache(buildBookSummary, ["book-summary-v1"], { tags: [INTEL_TAG], revalidate: 1800 });

export async function getBookSummary(): Promise<BookSummary> {
  try {
    return await cachedBookSummary();
  } catch {
    return buildBookSummary();
  }
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
