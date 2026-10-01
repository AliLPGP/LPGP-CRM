import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
import { getReadClient } from "../supabase/server";
import { chunk, fetchAll } from "../supabase/paged";
import { bigCache } from "../supabase/big-cache";
import { tableVersion } from "../supabase/version";
import { ASSET_CLASSES, classOfGpType, classStatedByFundName, isAssetClassKey, type AssetClassKey } from "./asset-classes";
import type { Deal, Signal, SportsInvestor, SportsTeam, TeamOwner } from "./intelligence-types";
import type { DisclosedCommitment } from "./queries";

// Reads for deals, signals and sports (migration 0016). Anon client, empty
// on any failure — a database without the tables yet just shows nothing.

export const INTEL_TAG = "intelligence";

// Ids reach PostgREST filter strings; only a UUID may.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string => typeof v === "string" && UUID.test(v);

const DEAL_COLUMNS =
  "id, date, date_text, kind, asset_class, sport, target, target_kind, target_country, target_team_id, target_company_id, target_fund_id, investor, investor_type, investor_company_id, investor_id, seller, stake_pct, amount, currency, valuation, valuation_currency, headline, summary, source_name, source_url, source, co_investors, round, amount_basis, verified, target_key";
const SIGNAL_COLUMNS = "id, date, asset_class, kind, headline, summary, entities, company_ids, source_name, source_url, source";

export type DealFilter = {
  assetClass?: AssetClassKey | null;
  companyId?: string | null;
  teamId?: string | null;
  investorId?: string | null;
  sport?: string | null;
  limit?: number;
};

export async function getDeals(f: DealFilter = {}): Promise<Deal[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  let q = supabase.from("deals").select(DEAL_COLUMNS);
  if (f.assetClass) q = q.eq("asset_class", f.assetClass);
  if (f.sport) q = q.eq("sport", f.sport);
  if (f.teamId) {
    if (!isUuid(f.teamId)) return [];
    q = q.eq("target_team_id", f.teamId);
  }
  if (f.investorId) {
    if (!isUuid(f.investorId)) return [];
    q = q.eq("investor_id", f.investorId);
  }
  if (f.companyId) {
    if (!isUuid(f.companyId)) return [];
    q = q.or(`investor_company_id.eq.${f.companyId},target_company_id.eq.${f.companyId}`);
  }
  const { data, error } = await q
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(f.limit ?? 500);
  if (error || !data) return [];
  return data as unknown as Deal[];
}

async function buildAllDeals(assetClass: AssetClassKey | "", version: string): Promise<Deal[]> {
  void version; // the deals row count, part of the cache key
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows = await fetchAll<Deal>((from, to, first) => {
    let q = supabase.from("deals").select(DEAL_COLUMNS, first ? { count: "exact" } : undefined);
    if (assetClass) q = q.eq("asset_class", assetClass);
    return q.order("date", { ascending: false, nullsFirst: false }).order("id").range(from, to);
  });
  return rows ?? [];
}

// The whole ledger (or one class of it), paged past the row cap. The research
// jobs and the dataset loader refresh the intelligence tag when they write;
// the EDGAR ingest writes from inside the database, so the row count rides in
// the key and a stale copy is dropped the moment a deal lands.
const cachedAllDeals = bigCache("all-deals-v3", (version) => buildAllDeals("", version), { tags: [INTEL_TAG], revalidate: 86400 });

/** Every deal, for the Deals page, or every deal of one class. */
export async function getAllDeals(assetClass?: AssetClassKey | null): Promise<Deal[]> {
  const version = await tableVersion("deals");
  let all: Deal[];
  try {
    all = await cachedAllDeals(version);
  } catch {
    all = await buildAllDeals("", version);
  }
  return assetClass ? all.filter((d) => d.asset_class === assetClass) : all;
}

export async function getDeal(id: string): Promise<(Deal & { created_at: string; added_by: string | null }) | null> {
  const supabase = getReadClient();
  if (!supabase || !isUuid(id)) return null;
  const { data } = await supabase.from("deals").select(`${DEAL_COLUMNS}, created_at, added_by, evidence`).eq("id", id).maybeSingle();
  return (data as unknown as (Deal & { created_at: string; added_by: string | null }) | null) ?? null;
}

/** The deals around one deal: the target's other transactions and the
 *  investor's, matched by linked record first and by name otherwise. */
export async function relatedDeals(deal: Deal): Promise<{ target: Deal[]; investor: Deal[] }> {
  const supabase = getReadClient();
  if (!supabase) return { target: [], investor: [] };
  const targetQ = supabase.from("deals").select(DEAL_COLUMNS).neq("id", deal.id);
  const investorQ = supabase.from("deals").select(DEAL_COLUMNS).neq("id", deal.id);
  const byTarget = deal.target_team_id
    ? targetQ.eq("target_team_id", deal.target_team_id)
    : deal.target_company_id
      ? targetQ.eq("target_company_id", deal.target_company_id)
      : targetQ.ilike("target", deal.target);
  const byInvestor = deal.investor_company_id
    ? investorQ.eq("investor_company_id", deal.investor_company_id)
    : deal.investor_id
      ? investorQ.eq("investor_id", deal.investor_id)
      : investorQ.ilike("investor", deal.investor);
  const [t, i] = await Promise.all([
    byTarget.order("date", { ascending: false, nullsFirst: false }).limit(50),
    byInvestor.order("date", { ascending: false, nullsFirst: false }).limit(50),
  ]);
  return { target: (t.data as unknown as Deal[]) ?? [], investor: (i.data as unknown as Deal[]) ?? [] };
}

/** Signals whose named entities include either party of a deal. */
export async function signalsNaming(names: string[], limit = 20): Promise<Signal[]> {
  const supabase = getReadClient();
  const wanted = names.filter(Boolean);
  if (!supabase || !wanted.length) return [];
  const { data } = await supabase
    .from("signals")
    .select(SIGNAL_COLUMNS)
    .overlaps("entities", wanted)
    .order("date", { ascending: false, nullsFirst: false })
    .limit(limit);
  const rows = (data as unknown as Omit<Signal, "firms">[] | null) ?? [];
  return rows.map((r) => ({ ...r, firms: [] }));
}

/** Other clubs in a league, ranked by revenue, for a profile's sidebar. */
export async function leaguePeers(league: string | null, excludeId: string, limit = 8): Promise<Pick<SportsTeam, "id" | "name" | "short_name" | "domain" | "revenue" | "revenue_currency">[]> {
  const supabase = getReadClient();
  if (!supabase || !league) return [];
  const { data } = await supabase
    .from("sports_teams")
    .select("id, name, short_name, domain, revenue, revenue_currency")
    .eq("league", league)
    .neq("id", excludeId)
    .order("revenue", { ascending: false, nullsFirst: false })
    .order("name")
    .limit(limit);
  return (data as Pick<SportsTeam, "id" | "name" | "short_name" | "domain" | "revenue" | "revenue_currency">[] | null) ?? [];
}

export type SignalFilter = { assetClass?: AssetClassKey | null; companyId?: string | null; kind?: string | null; limit?: number };

export async function getSignals(f: SignalFilter = {}): Promise<Signal[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  let q = supabase.from("signals").select(SIGNAL_COLUMNS);
  if (f.assetClass) q = q.eq("asset_class", f.assetClass);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.companyId) {
    if (!isUuid(f.companyId)) return [];
    q = q.contains("company_ids", [f.companyId]);
  }
  const { data, error } = await q
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(f.limit ?? 300);
  if (error || !data) return [];
  const rows = data as unknown as Omit<Signal, "firms">[];
  // company_ids is a de-duplicated set, not in entity order, so the names
  // that go with the ids come from the directory, never from position.
  const ids = [...new Set(rows.flatMap((r) => r.company_ids ?? []))];
  const names = new Map<string, string>();
  for (const batch of chunk(ids, 150)) {
    const { data: firms } = await supabase.from("companies").select("id, name").in("id", batch);
    for (const c of (firms as { id: string; name: string }[] | null) ?? []) names.set(c.id, c.name);
  }
  return rows.map((r) => ({ ...r, firms: (r.company_ids ?? []).flatMap((id) => (names.has(id) ? [{ id, name: names.get(id)! }] : [])) }));
}

export async function listSportsTeams(): Promise<SportsTeam[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows = await fetchAll<SportsTeam>((from, to, first) =>
    supabase.from("sports_teams").select("*", first ? { count: "exact" } : undefined).order("name").order("id").range(from, to),
  );
  return rows ?? [];
}

export async function getSportsTeam(id: string): Promise<SportsTeam | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data } = await supabase.from("sports_teams").select("*").eq("id", id).maybeSingle();
  return (data as SportsTeam | null) ?? null;
}

export async function getTeamOwners(teamIds: string[]): Promise<TeamOwner[]> {
  const supabase = getReadClient();
  if (!supabase || !teamIds.length) return [];
  const out: TeamOwner[] = [];
  for (const ids of chunk(teamIds, 150)) {
    const { data } = await supabase
      .from("sports_team_owners")
      .select("*")
      .in("team_id", ids)
      .order("stake_pct", { ascending: false, nullsFirst: false });
    out.push(...((data as TeamOwner[]) ?? []));
  }
  return out;
}

export async function listSportsInvestors(): Promise<SportsInvestor[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows = await fetchAll<SportsInvestor>((from, to, first) =>
    supabase.from("sports_investors").select("*", first ? { count: "exact" } : undefined).order("name").order("id").range(from, to),
  );
  return rows ?? [];
}

export async function getSportsInvestor(id: string): Promise<SportsInvestor | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data } = await supabase.from("sports_investors").select("*").eq("id", id).maybeSingle();
  return (data as SportsInvestor | null) ?? null;
}

/** Teams a directory firm or a sports investor holds a stake in. */
export async function teamsHeldBy(f: { companyId?: string; investorId?: string }): Promise<(TeamOwner & { team: SportsTeam })[]> {
  const supabase = getReadClient();
  if (!supabase || (!f.companyId && !f.investorId)) return [];
  let q = supabase.from("sports_team_owners").select("*");
  q = f.companyId ? q.eq("company_id", f.companyId) : q.eq("investor_id", f.investorId!);
  const { data } = await q.limit(200);
  const owners = (data as TeamOwner[]) ?? [];
  if (!owners.length) return [];
  const { data: teams } = await supabase.from("sports_teams").select("*").in("id", [...new Set(owners.map((o) => o.team_id))]);
  const byId = new Map(((teams as SportsTeam[]) ?? []).map((t) => [t.id, t]));
  return owners.map((o) => ({ ...o, team: byId.get(o.team_id)! })).filter((o) => o.team);
}

export type ClassCounts = Record<AssetClassKey, { deals: number; signals: number }>;

async function buildClassCounts(version: string): Promise<ClassCounts> {
  void version;
  const supabase = getReadClient();
  const counts = Object.fromEntries(ASSET_CLASSES.map((c) => [c.key, { deals: 0, signals: 0 }])) as ClassCounts;
  if (!supabase) return counts;
  // Sixteen counts, no rows: a HEAD request per class and table.
  await Promise.all(
    ASSET_CLASSES.flatMap((c) =>
      (["deals", "signals"] as const).map(async (table) => {
        const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("asset_class", c.key);
        counts[c.key][table] = count ?? 0;
      }),
    ),
  );
  return counts;
}

const cachedCounts = unstable_cache(buildClassCounts, ["intel-class-counts-v1"], { tags: [INTEL_TAG], revalidate: 3600 });

export async function getClassCounts(): Promise<ClassCounts> {
  try {
    return await cachedCounts(await tableVersion("deals", "signals"));
  } catch {
    return Object.fromEntries(ASSET_CLASSES.map((c) => [c.key, { deals: 0, signals: 0 }])) as ClassCounts;
  }
}

/** Which class a disclosed LP commitment belongs to, from its fund's name
 *  or, failing that, the manager's directory type. */
export function commitmentClass(c: DisclosedCommitment & { gp_type?: string | null }): AssetClassKey | null {
  if (c.asset_class && isAssetClassKey(c.asset_class)) return c.asset_class;
  return classStatedByFundName(c.fund_name) ?? classOfGpType(c.gp_type) ?? null;
}

/** The dataset shipped with this build: its version and row counts. */
export type ShippedDatasetInfo = { version: string; generated_at: string; teams: number; investors: number; deals: number; signals: number; commitments: number; benchmarks: number; portfolio: number };

export async function shippedDatasetInfo(): Promise<ShippedDatasetInfo | null> {
  try {
    const text = await readFile(path.join(process.cwd(), "data", "intelligence", "dataset.json"), "utf8");
    const d = JSON.parse(text) as { version: string; generated_at: string; teams: unknown[]; investors: unknown[]; deals: unknown[]; signals: unknown[]; commitments?: unknown[]; benchmarks?: unknown[]; portfolio?: unknown[] };
    return { version: d.version, generated_at: d.generated_at, teams: d.teams.length, investors: d.investors.length, deals: d.deals.length, signals: d.signals.length, commitments: d.commitments?.length ?? 0, benchmarks: d.benchmarks?.length ?? 0, portfolio: d.portfolio?.length ?? 0 };
  } catch {
    return null;
  }
}

export type Benchmark = {
  id: string;
  asset_class: string;
  strategy: string | null;
  metric: string;
  label: string;
  value: number | null;
  unit: string | null;
  period: string | null;
  geography: string | null;
  publisher: string | null;
  published_on: string | null;
  source_url: string;
  note: string | null;
};

/** Published benchmark figures for a class, newest publication first. */
export async function getBenchmarks(assetClass: AssetClassKey): Promise<Benchmark[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("benchmarks")
    .select("id, asset_class, strategy, metric, label, value, unit, period, geography, publisher, published_on, source_url, note")
    .eq("asset_class", assetClass)
    .order("published_on", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error || !data) return [];
  return data as Benchmark[];
}

// ---------------------------------------------------------------------------
// The Deals page: the database filters, sorts and pages (migration 0029), so
// a click moves one page of rows, never the 20k-deal ledger.
// ---------------------------------------------------------------------------

export type DealListRow = Pick<
  Deal,
  | "id" | "date" | "date_text" | "kind" | "asset_class" | "sport" | "target" | "target_country" | "target_team_id"
  | "target_company_id" | "investor" | "investor_type" | "investor_company_id" | "investor_id" | "stake_pct"
  | "amount" | "currency" | "valuation" | "valuation_currency" | "headline" | "summary"
>;

export type DealSearch = {
  cls?: string | null;
  kind?: string | null;
  year?: number | null;
  q?: string | null;
  sort?: "date" | "amount" | "valuation";
  offset?: number;
  limit?: number;
};

export type DealSearchResult = {
  total: number;
  rows: DealListRow[];
  kinds: [string, number][];
  years: [number, number][];
  investors: { name: string; n: number; companyId: string | null; investorId: string | null }[];
};

export const EMPTY_DEAL_SEARCH: DealSearchResult = { total: 0, rows: [], kinds: [], years: [], investors: [] };

export async function searchDeals(s: DealSearch): Promise<DealSearchResult> {
  const supabase = getReadClient();
  if (!supabase) return EMPTY_DEAL_SEARCH;
  const { data, error } = await supabase.rpc("deals_search", {
    p_class: s.cls || null,
    p_kind: s.kind || null,
    p_year: s.year ?? null,
    p_q: s.q?.trim() || null,
    p_sort: s.sort ?? "date",
    p_offset: s.offset ?? 0,
    p_limit: s.limit ?? 100,
  });
  if (error || !data) return EMPTY_DEAL_SEARCH;
  const r = data as DealSearchResult;
  return { ...r, total: Number(r.total) };
}
