import "server-only";
import { cache } from "react";
import { getReadClient } from "@/lib/supabase/server";
import { chunk, fetchAll } from "@/lib/supabase/paged";
import { bigCache } from "@/lib/supabase/big-cache";
import { cachedOrDirect } from "@/lib/supabase/safe";
import { tableVersion } from "@/lib/supabase/version";
import type { SourceRef } from "@/lib/fund-details";
import { fundClass, isAssetClassKey, type AssetClassKey } from "./asset-classes";
import { strategiesInFundName } from "./strategies";
import { bandOf, FUND_SIZE_BANDS, typeCodeOf, type PlanStatus } from "./taxonomy";

// What the investor research job writes (migration 0033): an LP's profile in
// the categories a desk expects, its plans for the next twelve months, and
// the fund performance its disclosures state. Every read is the anon client
// and comes back empty when the table is not there yet or the read fails —
// an older database shows "not yet researched", never an error.

/** One line of an investor's stated allocation to a class. */
export type InvestorAllocation = {
  class: AssetClassKey | string;
  current_pct: number | null;
  target_pct: number | null;
  current_usd: number | null;
  as_of: string | null;
};

export type InvestorProfile = {
  company_id: string;
  /** INVESTOR_TYPES code. */
  investor_type: string | null;
  aum_usd: number | null;
  aum_as_of: string | null;
  allocations: InvestorAllocation[] | null;
  /** Strategy keys from strategies.ts. */
  strategy_prefs: string[] | null;
  /** REGIONS codes. */
  region_prefs: string[] | null;
  /** INDUSTRIES codes. */
  industry_prefs: string[] | null;
  ticket_min_usd: number | null;
  ticket_max_usd: number | null;
  /** INVESTOR_PRACTICES keys. */
  practices: string[] | null;
  /** False means the investor says it no longer invests in alternatives. */
  active_in_alternatives: boolean | null;
  overview: string | null;
  /** { field: [ {url, name, kind, as_of} ] } */
  sources: Record<string, SourceRef | SourceRef[]> | null;
  research_state: "pending" | "done" | "no_public_data";
  researched_at: string | null;
};

export type InvestorPlan = {
  id: string;
  company_id: string;
  asset_class: string;
  status: PlanStatus;
  plan_types: string[] | null;
  strategies: string[] | null;
  regions: string[] | null;
  ticket_min_usd: number | null;
  ticket_max_usd: number | null;
  new_gp_relationships: boolean | null;
  funds_planned: number | null;
  note: string | null;
  source_url: string;
  source_name: string | null;
  source_kind: string | null;
  as_of: string | null;
  created_at: string | null;
};

/** A plan with the investor it belongs to, for the Mandates desk. */
export type PlanListRow = InvestorPlan & {
  investor: {
    id: string;
    name: string;
    sub_type: string | null;
    city: string | null;
    country: string | null;
    total_assets_usd: number | null;
    /** The research job's type code when it set one, else the directory's. */
    type_code: string | null;
    /** AUM as the investor states it, when researched; null falls back to total assets. */
    aum_usd: number | null;
    aum_as_of: string | null;
    aum_source: SourceRef | null;
  } | null;
};

/** One LP's report of a fund's performance, as the view collects them. */
export type PerformanceSource = { lp: string | null; lp_id: string | null; url: string | null; as_of: string | null };

export type FundPerformanceRow = {
  fund_id: string;
  fund_name: string;
  company_id: string | null;
  manager_name: string | null;
  manager_sub_type: string | null;
  vintage_year: number | null;
  /** Limited partners reporting a figure for this fund. */
  lps: number;
  net_irr_median: number | null;
  net_irr_min: number | null;
  net_irr_max: number | null;
  multiple_median: number | null;
  multiple_min: number | null;
  multiple_max: number | null;
  as_of: string | null;
  sources: PerformanceSource[];
  // Migration 0034. Each ratio is arithmetic on one LP's own stated figures
  // (never on a null), taken as the median across the LPs that state both
  // terms; the UI labels them as arithmetic.
  /** Median of distributed / contributed per reporting LP. */
  dpi_median: number | null;
  /** Median of residual value / contributed per reporting LP. */
  rvpi_median: number | null;
  /** Median of contributed / commitment, in percent, per reporting LP. */
  called_pct_median: number | null;
  /** The fund's size as filed, USD, from `funds`. */
  fund_size_usd: number | null;
  /** The researched profile's fundraising status (FUNDRAISING_STATUSES); null when no profile row. */
  fundraising_status: string | null;
  /** LP rows that state a contributed figure. */
  lps_with_cash: number;
  /** The fund's own name first, its manager's type second. */
  class: AssetClassKey | null;
  /** The first strategy-axis key the fund's own name states within its class. */
  strategyKey: string | null;
  /** FUND_SIZE_BANDS key for fund_size_usd. */
  sizeBand: string | null;
  /** Rank within our own sample of the same class and vintage, only when that sample holds eight funds or more. */
  quartile: { q: 1 | 2 | 3 | 4; of: number } | null;
};

export type ManagerPerformanceRow = {
  company_id: string;
  manager_name: string | null;
  manager_sub_type: string | null;
  /** Funds with an LP-reported figure. */
  funds: number;
  /** Median of the funds' median net IRRs, as the LPs report them. */
  net_irr_median: number | null;
  /** Median of the funds' median DPIs (arithmetic on LP-stated figures). */
  dpi_median: number | null;
  /** Sum of the sizes as filed (USD) of the manager's funds in the sample that carry one, and how many do. */
  raised_usd: number | null;
  sized: number;
  /** Limited partners reporting across those funds (sum of per-fund counts). */
  lps: number;
  best: { fund_id: string; fund_name: string; net_irr_median: number | null; multiple_median: number | null; vintage_year: number | null } | null;
};

// --- Performance desk facets (the URL is the state) ----------------------------

/** Fund type and status, folded from the profile's fundraising status. Liquidated, and commingled against separate account, are not offered: nothing on file states them. */
export const PERFORMANCE_STATUS_GROUPS = [
  { key: "raising", label: "Raising", statuses: ["Pre-marketing", "Raising", "First close", "Interim close"] },
  { key: "closed", label: "Closed", statuses: ["Final close", "Closed"] },
  { key: "evergreen", label: "Evergreen", statuses: ["Evergreen"] },
  { key: "none", label: "Not on file", statuses: [] },
] as const;
export type PerformanceStatusKey = (typeof PERFORMANCE_STATUS_GROUPS)[number]["key"];

export const PERFORMANCE_SORTS = ["irr", "multiple", "dpi", "size", "vintage"] as const;
export type PerformanceSort = (typeof PERFORMANCE_SORTS)[number];
export const PERFORMANCE_SORT_LABEL: Record<PerformanceSort, string> = { irr: "Net IRR", multiple: "Net multiple", dpi: "DPI", size: "Fund size", vintage: "Vintage" };

/** "Up to date" means an as-of date within this many months of the newest as-of date across the whole sample. */
export const PERFORMANCE_LATEST_MONTHS = 18;

export type PerformanceFilters = {
  cls: AssetClassKey | null;
  status: PerformanceStatusKey | null;
  size: string | null;
  vintageMin: number | null;
  vintageMax: number | null;
  latest: boolean;
  sort: PerformanceSort;
};

/** The filters a performance URL carries. Anything unrecognised is ignored, not an error. */
export function performanceFilters(params: Record<string, string | string[] | undefined>): PerformanceFilters {
  const one = (k: string): string | null => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s ? String(s) : null;
  };
  const statusKey = one("status");
  const sizeKey = one("size");
  const vintage = (one("vintage") ?? "").match(/^(\d{4})?(?:-(\d{4})?)?$/);
  const year = (s: string | undefined) => (s ? Number(s) : null);
  const sortKey = one("sort");
  return {
    cls: isAssetClassKey(one("class")) ? (one("class") as AssetClassKey) : null,
    status: PERFORMANCE_STATUS_GROUPS.some((g) => g.key === statusKey) ? (statusKey as PerformanceStatusKey) : null,
    size: FUND_SIZE_BANDS.some((b) => b.key === sizeKey) ? sizeKey : null,
    vintageMin: vintage ? year(vintage[1]) : null,
    vintageMax: vintage ? (one("vintage")?.includes("-") ? year(vintage[2]) : year(vintage[1])) : null,
    latest: one("latest") === "1",
    sort: (PERFORMANCE_SORTS as readonly string[]).includes(sortKey ?? "") ? (sortKey as PerformanceSort) : "irr",
  };
}

/** The same filters back as query-string pairs (defaults left out), for links and the export. */
export function performanceQuery(f: PerformanceFilters, extra: Record<string, string | undefined> = {}): string {
  const pairs: [string, string | undefined][] = [
    ["class", f.cls ?? undefined],
    ["status", f.status ?? undefined],
    ["size", f.size ?? undefined],
    ["vintage", f.vintageMin != null || f.vintageMax != null ? `${f.vintageMin ?? ""}-${f.vintageMax ?? ""}` : undefined],
    ["latest", f.latest ? "1" : undefined],
    ["sort", f.sort === "irr" ? undefined : f.sort],
    ...Object.entries(extra),
  ];
  const qs = pairs
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

/** Whether an as-of date falls within the "up to date" window behind the newest one in the sample. */
export function isUpToDate(asOf: string | null, newest: string | null): boolean {
  if (!asOf || !newest) return false;
  const limit = new Date(newest);
  limit.setUTCMonth(limit.getUTCMonth() - PERFORMANCE_LATEST_MONTHS);
  return new Date(asOf) >= limit;
}

export function performanceStatusKey(status: string | null): PerformanceStatusKey {
  return PERFORMANCE_STATUS_GROUPS.find((g) => (g.statuses as readonly string[]).includes(status ?? ""))?.key ?? "none";
}

/** The sample narrowed by every filter but the sort. Pure, so the page can count facets on partial filter sets. */
export function filterPerformance(rows: FundPerformanceRow[], f: Partial<PerformanceFilters>, newest: string | null): FundPerformanceRow[] {
  return rows.filter(
    (r) =>
      (!f.cls || r.class === f.cls) &&
      (!f.status || performanceStatusKey(r.fundraising_status) === f.status) &&
      (!f.size || r.sizeBand === f.size) &&
      (f.vintageMin == null || (r.vintage_year != null && r.vintage_year >= f.vintageMin)) &&
      (f.vintageMax == null || (r.vintage_year != null && r.vintage_year <= f.vintageMax)) &&
      (!f.latest || isUpToDate(r.as_of, newest)),
  );
}

/** Sorted descending on the chosen figure, blanks last, then most LPs reporting, then name. */
export function sortPerformance(rows: FundPerformanceRow[], sort: PerformanceSort): FundPerformanceRow[] {
  const key = (r: FundPerformanceRow): number | null =>
    sort === "irr" ? r.net_irr_median : sort === "multiple" ? r.multiple_median : sort === "dpi" ? r.dpi_median : sort === "size" ? r.fund_size_usd : r.vintage_year;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb != null) return 1;
    if (kb == null && ka != null) return -1;
    return (kb ?? 0) - (ka ?? 0) || b.lps - a.lps || (b.net_irr_median ?? -Infinity) - (a.net_irr_median ?? -Infinity) || a.fund_name.localeCompare(b.fund_name);
  });
}

const PROFILE_COLUMNS =
  "company_id, investor_type, aum_usd, aum_as_of, allocations, strategy_prefs, region_prefs, industry_prefs, ticket_min_usd, ticket_max_usd, practices, active_in_alternatives, overview, sources, research_state, researched_at";

const PLAN_COLUMNS =
  "id, company_id, asset_class, status, plan_types, strategies, regions, ticket_min_usd, ticket_max_usd, new_gp_relationships, funds_planned, note, source_url, source_name, source_kind, as_of, created_at";

const PERFORMANCE_COLUMNS =
  "fund_id, fund_name, company_id, manager_name, vintage_year, lps, net_irr_median, net_irr_min, net_irr_max, multiple_median, multiple_min, multiple_max, as_of, sources, dpi_median, rvpi_median, called_pct_median, fund_size_usd, fundraising_status, lps_with_cash";

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** The first source recorded for a profile field, if it carries a web address. */
export function profileSource(p: Pick<InvestorProfile, "sources"> | null | undefined, field: string): SourceRef | null {
  const s = p?.sources?.[field];
  const first = Array.isArray(s) ? s[0] : s;
  return first?.url ? first : null;
}

function normaliseProfile(row: Record<string, unknown>): InvestorProfile {
  return {
    company_id: row.company_id as string,
    investor_type: (row.investor_type as string | null) ?? null,
    aum_usd: num(row.aum_usd),
    aum_as_of: (row.aum_as_of as string | null) ?? null,
    allocations: Array.isArray(row.allocations)
      ? (row.allocations as Record<string, unknown>[]).map((a) => ({
          class: String(a.class ?? ""),
          current_pct: num(a.current_pct),
          target_pct: num(a.target_pct),
          current_usd: num(a.current_usd),
          as_of: (a.as_of as string | null) ?? null,
        }))
      : null,
    strategy_prefs: (row.strategy_prefs as string[] | null) ?? null,
    region_prefs: (row.region_prefs as string[] | null) ?? null,
    industry_prefs: (row.industry_prefs as string[] | null) ?? null,
    ticket_min_usd: num(row.ticket_min_usd),
    ticket_max_usd: num(row.ticket_max_usd),
    practices: (row.practices as string[] | null) ?? null,
    active_in_alternatives: (row.active_in_alternatives as boolean | null) ?? null,
    overview: (row.overview as string | null) ?? null,
    sources: (row.sources as InvestorProfile["sources"]) ?? null,
    research_state: (row.research_state as InvestorProfile["research_state"]) ?? "pending",
    researched_at: (row.researched_at as string | null) ?? null,
  };
}

function normalisePlan(row: Record<string, unknown>): InvestorPlan {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    asset_class: String(row.asset_class ?? ""),
    status: (row.status as PlanStatus) ?? "considering",
    plan_types: (row.plan_types as string[] | null) ?? null,
    strategies: (row.strategies as string[] | null) ?? null,
    regions: (row.regions as string[] | null) ?? null,
    ticket_min_usd: num(row.ticket_min_usd),
    ticket_max_usd: num(row.ticket_max_usd),
    new_gp_relationships: (row.new_gp_relationships as boolean | null) ?? null,
    funds_planned: num(row.funds_planned),
    note: (row.note as string | null) ?? null,
    source_url: String(row.source_url ?? ""),
    source_name: (row.source_name as string | null) ?? null,
    source_kind: (row.source_kind as string | null) ?? null,
    as_of: (row.as_of as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

/** The researched profile of one LP, or null when nobody has researched it (or the table is not there). */
export async function getInvestorProfile(companyId: string): Promise<InvestorProfile | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("investor_profiles").select(PROFILE_COLUMNS).eq("company_id", companyId).maybeSingle();
  if (error || !data) return null;
  return normaliseProfile(data as Record<string, unknown>);
}

/** One LP's stated plans for the next twelve months, newest statement first. */
export async function getInvestorPlans(companyId: string): Promise<InvestorPlan[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("investor_plans")
    .select(PLAN_COLUMNS)
    .eq("company_id", companyId)
    .order("as_of", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(normalisePlan);
}

/**
 * Plans across every investor, for the Mandates desk. The investor's name,
 * type, location and size come in a second query by ids, chunked; the
 * type code filter applies after that join, so the read over-fetches to
 * leave enough rows behind it.
 */
export async function listPlans({
  cls,
  status,
  region,
  typeCode,
  limit = 500,
}: {
  cls?: string | null;
  status?: PlanStatus | string | null;
  region?: string | null;
  typeCode?: string | null;
  limit?: number;
}): Promise<PlanListRow[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  let q = supabase
    .from("investor_plans")
    .select(PLAN_COLUMNS)
    .order("as_of", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(typeCode ? limit * 4 : limit);
  if (cls) q = q.eq("asset_class", cls);
  if (status) q = q.eq("status", status);
  if (region) q = q.contains("regions", [region]);
  const { data, error } = await q;
  if (error || !data) return [];
  const plans = (data as Record<string, unknown>[]).map(normalisePlan);
  const ids = [...new Set(plans.map((p) => p.company_id))];

  type CompanyBit = { id: string; name: string; sub_type: string | null; description: string | null; city: string | null; country: string | null; total_assets_usd: number | null };
  const companies = new Map<string, CompanyBit>();
  const profiles = new Map<string, { investor_type: string | null; aum_usd: number | null; aum_as_of: string | null; sources: InvestorProfile["sources"] }>();
  for (const batch of chunk(ids, 150)) {
    const [c, p] = await Promise.all([
      supabase.from("companies").select("id, name, sub_type, description, city, country, total_assets_usd").in("id", batch),
      supabase.from("investor_profiles").select("company_id, investor_type, aum_usd, aum_as_of, sources").in("company_id", batch),
    ]);
    for (const row of (c.data ?? []) as Record<string, unknown>[]) {
      companies.set(row.id as string, {
        id: row.id as string,
        name: String(row.name ?? ""),
        sub_type: (row.sub_type as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        city: (row.city as string | null) ?? null,
        country: (row.country as string | null) ?? null,
        total_assets_usd: num(row.total_assets_usd),
      });
    }
    // The profile table may not exist yet; its absence only costs the AUM figure.
    for (const row of (p.data ?? []) as Record<string, unknown>[]) {
      profiles.set(row.company_id as string, {
        investor_type: (row.investor_type as string | null) ?? null,
        aum_usd: num(row.aum_usd),
        aum_as_of: (row.aum_as_of as string | null) ?? null,
        sources: (row.sources as InvestorProfile["sources"]) ?? null,
      });
    }
  }

  const rows: PlanListRow[] = plans.map((plan) => {
    const c = companies.get(plan.company_id);
    const p = profiles.get(plan.company_id);
    if (!c) return { ...plan, investor: null };
    return {
      ...plan,
      investor: {
        id: c.id,
        name: c.name,
        sub_type: c.sub_type,
        city: c.city,
        country: c.country,
        total_assets_usd: c.total_assets_usd,
        type_code: p?.investor_type ?? typeCodeOf("LP", c.sub_type, c.description),
        aum_usd: p?.aum_usd ?? null,
        aum_as_of: p?.aum_as_of ?? null,
        aum_source: p ? profileSource({ sources: p.sources }, "aum_usd") : null,
      },
    };
  });
  const filtered = typeCode ? rows.filter((r) => r.investor?.type_code === typeCode) : rows;
  return filtered.slice(0, limit);
}

/** Median of a list of numbers; null when the list is empty. */
function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The whole performance sample: every fund an LP disclosure gives a figure for, placed in its class and ranked within its class and vintage.
 *  Cached per version of the tables behind fund_performance_mv (refreshed by
 *  the database every half hour), and read once per request: the page and its
 *  manager tab used to page the sample and look up its managers twice, every visit. */
const loadPerformance = cache(async (): Promise<FundPerformanceRow[]> => {
  const version = await tableVersion("commitments", "funds", "companies");
  return cachedOrDirect(() => cachedPerformance(version), () => buildPerformance(), []);
});

const cachedPerformance = bigCache("fund-performance-v1", async () => {
  const rows = await buildPerformance();
  // Thrown, not returned empty: a failed read must never be cached.
  if (!rows.length) throw new Error("performance sample unavailable");
  return rows;
}, { tags: ["intelligence"], revalidate: 1800 });

async function buildPerformance(): Promise<FundPerformanceRow[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const raw = await fetchAll<Record<string, unknown>>((from, to, first) =>
    supabase
      .from("fund_performance_mv")
      .select(PERFORMANCE_COLUMNS, first ? { count: "exact" } : undefined)
      .order("lps", { ascending: false })
      .order("fund_id")
      .range(from, to),
  );
  if (!raw) return [];

  const managerIds = [...new Set(raw.map((r) => r.company_id as string | null).filter(Boolean))] as string[];
  const managers = new Map<string, { name: string; sub_type: string | null }>();
  for (const batch of chunk(managerIds, 150)) {
    const { data } = await supabase.from("companies").select("id, name, sub_type").in("id", batch);
    for (const c of (data ?? []) as Record<string, unknown>[]) managers.set(c.id as string, { name: String(c.name ?? ""), sub_type: (c.sub_type as string | null) ?? null });
  }

  const rows: FundPerformanceRow[] = raw.map((r) => {
    const m = r.company_id ? managers.get(r.company_id as string) : undefined;
    const fundName = String(r.fund_name ?? "");
    const cls = fundClass(fundName, m?.sub_type)?.key ?? null;
    const fundSize = num(r.fund_size_usd);
    return {
      fund_id: r.fund_id as string,
      fund_name: fundName,
      company_id: (r.company_id as string | null) ?? null,
      manager_name: (r.manager_name as string | null) ?? m?.name ?? null,
      manager_sub_type: m?.sub_type ?? null,
      vintage_year: num(r.vintage_year),
      lps: num(r.lps) ?? 0,
      net_irr_median: num(r.net_irr_median),
      net_irr_min: num(r.net_irr_min),
      net_irr_max: num(r.net_irr_max),
      multiple_median: num(r.multiple_median),
      multiple_min: num(r.multiple_min),
      multiple_max: num(r.multiple_max),
      as_of: (r.as_of as string | null) ?? null,
      sources: Array.isArray(r.sources)
        ? (r.sources as Record<string, unknown>[]).map((s) => ({
            lp: (s.lp as string | null) ?? null,
            lp_id: (s.lp_id as string | null) ?? null,
            url: (s.url as string | null) ?? null,
            as_of: (s.as_of as string | null) ?? null,
          }))
        : [],
      dpi_median: num(r.dpi_median),
      rvpi_median: num(r.rvpi_median),
      called_pct_median: num(r.called_pct_median),
      fund_size_usd: fundSize,
      fundraising_status: (r.fundraising_status as string | null) ?? null,
      lps_with_cash: num(r.lps_with_cash) ?? 0,
      class: cls,
      strategyKey: cls ? (strategiesInFundName(fundName, cls).find((s) => s.axis === "strategy")?.key ?? null) : null,
      sizeBand: bandOf(FUND_SIZE_BANDS, fundSize)?.key ?? null,
      quartile: null,
    };
  });

  // Quartiles are only ever within what we hold: the funds of one class and
  // vintage that report a net IRR, and only when there are eight or more of
  // them. Fewer than that and a rank would say more than the sample does.
  const groups = new Map<string, FundPerformanceRow[]>();
  for (const r of rows) {
    if (!r.class || r.vintage_year == null || r.net_irr_median == null) continue;
    const key = `${r.class}:${r.vintage_year}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const sample of groups.values()) {
    if (sample.length < 8) continue;
    const ranked = [...sample].sort((a, b) => (b.net_irr_median ?? 0) - (a.net_irr_median ?? 0));
    ranked.forEach((r, i) => {
      r.quartile = { q: Math.min(4, Math.max(1, Math.ceil(((i + 1) / ranked.length) * 4))) as 1 | 2 | 3 | 4, of: ranked.length };
    });
  }
  return rows;
}

/** The whole sample with the newest as-of date across it, which the "up to date" facet measures from. */
export async function performanceSample(): Promise<{ rows: FundPerformanceRow[]; newest: string | null }> {
  const rows = await loadPerformance();
  const newest = rows.reduce<string | null>((best, r) => (r.as_of && (!best || r.as_of > best) ? r.as_of : best), null);
  return { rows, newest };
}

/** Funds with LP-reported performance under the desk's filters, sorted as asked; the page and the export read the same list. */
export async function listFundPerformance(filters: Partial<PerformanceFilters> & { limit?: number }): Promise<FundPerformanceRow[]> {
  const { rows, newest } = await performanceSample();
  return sortPerformance(filterPerformance(rows, filters, newest), filters.sort ?? "irr").slice(0, filters.limit ?? 500);
}

/** Managers by the LP-reported performance of their funds: most funds with a figure first, then median net IRR. */
export async function managerPerformance(): Promise<ManagerPerformanceRow[]> {
  const rows = await loadPerformance();
  const byManager = new Map<string, FundPerformanceRow[]>();
  for (const r of rows) {
    if (!r.company_id) continue;
    byManager.set(r.company_id, [...(byManager.get(r.company_id) ?? []), r]);
  }
  const out: ManagerPerformanceRow[] = [];
  for (const [company_id, funds] of byManager) {
    const withIrr = funds.filter((f) => f.net_irr_median != null);
    const best = [...withIrr].sort((a, b) => (b.net_irr_median ?? 0) - (a.net_irr_median ?? 0))[0] ?? funds[0] ?? null;
    const sized = funds.filter((f) => f.fund_size_usd != null);
    out.push({
      company_id,
      manager_name: funds[0]?.manager_name ?? null,
      manager_sub_type: funds[0]?.manager_sub_type ?? null,
      funds: funds.length,
      net_irr_median: median(withIrr.map((f) => f.net_irr_median as number)),
      dpi_median: median(funds.filter((f) => f.dpi_median != null).map((f) => f.dpi_median as number)),
      raised_usd: sized.length ? sized.reduce((n, f) => n + (f.fund_size_usd as number), 0) : null,
      sized: sized.length,
      lps: funds.reduce((n, f) => n + f.lps, 0),
      best: best ? { fund_id: best.fund_id, fund_name: best.fund_name, net_irr_median: best.net_irr_median, multiple_median: best.multiple_median, vintage_year: best.vintage_year } : null,
    });
  }
  return out.sort((a, b) => b.funds - a.funds || (b.net_irr_median ?? -Infinity) - (a.net_irr_median ?? -Infinity) || (a.manager_name ?? "").localeCompare(b.manager_name ?? ""));
}
