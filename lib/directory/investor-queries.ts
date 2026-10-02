import "server-only";
import { getReadClient } from "@/lib/supabase/server";
import { chunk, fetchAll } from "@/lib/supabase/paged";
import type { SourceRef } from "@/lib/fund-details";
import { fundClass, type AssetClassKey } from "./asset-classes";
import { typeCodeOf, type PlanStatus } from "./taxonomy";

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
  /** The fund's own name first, its manager's type second. */
  class: AssetClassKey | null;
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
  /** Limited partners reporting across those funds (sum of per-fund counts). */
  lps: number;
  best: { fund_id: string; fund_name: string; net_irr_median: number | null; multiple_median: number | null; vintage_year: number | null } | null;
};

const PROFILE_COLUMNS =
  "company_id, investor_type, aum_usd, aum_as_of, allocations, strategy_prefs, region_prefs, industry_prefs, ticket_min_usd, ticket_max_usd, practices, active_in_alternatives, overview, sources, research_state, researched_at";

const PLAN_COLUMNS =
  "id, company_id, asset_class, status, plan_types, strategies, regions, ticket_min_usd, ticket_max_usd, new_gp_relationships, funds_planned, note, source_url, source_name, source_kind, as_of, created_at";

const PERFORMANCE_COLUMNS =
  "fund_id, fund_name, company_id, manager_name, vintage_year, lps, net_irr_median, net_irr_min, net_irr_max, multiple_median, multiple_min, multiple_max, as_of, sources";

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

/** The whole performance sample: every fund an LP disclosure gives a figure for, placed in its class and ranked within its class and vintage. */
async function loadPerformance(): Promise<FundPerformanceRow[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const raw = await fetchAll<Record<string, unknown>>((from, to, first) =>
    supabase
      .from("fund_performance")
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
      class: fundClass(fundName, m?.sub_type)?.key ?? null,
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

/** Funds with LP-reported performance, most reported first, optionally in one class. */
export async function listFundPerformance({ cls, limit = 500 }: { cls?: string | null; limit?: number }): Promise<FundPerformanceRow[]> {
  const rows = await loadPerformance();
  const kept = cls ? rows.filter((r) => r.class === cls) : rows;
  return kept
    .sort((a, b) => b.lps - a.lps || (b.net_irr_median ?? -Infinity) - (a.net_irr_median ?? -Infinity) || a.fund_name.localeCompare(b.fund_name))
    .slice(0, limit);
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
    out.push({
      company_id,
      manager_name: funds[0]?.manager_name ?? null,
      manager_sub_type: funds[0]?.manager_sub_type ?? null,
      funds: funds.length,
      net_irr_median: median(withIrr.map((f) => f.net_irr_median as number)),
      lps: funds.reduce((n, f) => n + f.lps, 0),
      best: best ? { fund_id: best.fund_id, fund_name: best.fund_name, net_irr_median: best.net_irr_median, multiple_median: best.multiple_median, vintage_year: best.vintage_year } : null,
    });
  }
  return out.sort((a, b) => b.funds - a.funds || (b.net_irr_median ?? -Infinity) - (a.net_irr_median ?? -Infinity) || (a.manager_name ?? "").localeCompare(b.manager_name ?? ""));
}
