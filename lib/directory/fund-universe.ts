import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadClient } from "../supabase/server";
import { fetchAll } from "../supabase/paged";
import { bigCache } from "../supabase/big-cache";
import { tableVersion } from "../supabase/version";
import type { Category } from "../types";
import { fundClass } from "./asset-classes";
import { DIRECTORY_TAG, getDirectoryIndex } from "./index-server";
import { normalizeRole, PROVIDER_ROLES } from "./providers";
import { strategiesInFundName } from "./strategies";
import { bandOf, FUND_SIZE_BANDS, industryCodesInText, regionsInText } from "./taxonomy";

// Every fund on file — thousands of them once the Form ADV lineup is
// imported — packed like the Discover index so the Funds page can search and
// facet them in the browser without a round trip per keystroke.

export type PackedFundUniverse = {
  generatedAt: string;
  /** Provider brands, referenced by index from each fund. */
  brands: [key: string, name: string][];
  /** Managers, referenced by index from each fund. */
  managers: [id: string, name: string, domain: string | null, category: Category, subType: string | null, country: string | null][];
  funds: PackedFund[];
};

export type PackedFund = [
  id: string,
  manager: number,
  name: string,
  kind: string | null,
  domicile: string | null,
  currency: string | null,
  size: number | null,
  vintage: number | null,
  strategy: string | null,
  source: string | null,
  /** [brandIndex, roleIndex, …] flattened. */
  providers: number[],
  managerName: string | null,
  /** First strategy-axis key the fund's own name states within its class;
   *  a researched fund_details.strategy_code wins when present. */
  strategyCode: string | null,
  /** Sector-axis strategy keys plus the industries the name states. */
  sectorCodes: string[],
  /** REGIONS codes the name states; a researched region_codes wins. */
  regionCodes: string[],
  /** FUND_SIZE_BANDS key for the size on file, if any. */
  sizeBand: string | null,
  /** fund_details.fundraising_status when a researched row exists. */
  status: string | null,
];

type FundDetailRow = {
  fund_id: string;
  fundraising_status: string | null;
  strategy_code: string | null;
  region_codes: string[] | null;
};

/** The researched facets per fund, one plain select; a database without the
 *  table or the 0033 columns reads as having researched nothing. */
async function fundDetailFacets(supabase: SupabaseClient): Promise<Map<string, FundDetailRow>> {
  const out = new Map<string, FundDetailRow>();
  try {
    const rows = await fetchAll<FundDetailRow>((from, to, first) =>
      supabase
        .from("fund_details")
        .select("fund_id, fundraising_status, strategy_code, region_codes", first ? { count: "exact" } : undefined)
        .order("fund_id")
        .range(from, to),
    );
    for (const r of rows ?? []) if (r?.fund_id) out.set(r.fund_id, r);
  } catch {
    /* not researched yet, or a database before 0032/0033 */
  }
  return out;
}

type FundRow = {
  id: string;
  company_id: string | null;
  name: string;
  vintage_year: number | null;
  fund_size_usd: number | null;
  target_size_usd: number | null;
  strategy: string | null;
  source?: string | null;
  manager_name?: string | null;
  vehicle_kind?: string | null;
  domicile?: string | null;
  currency?: string | null;
  service_providers?: { role?: string; key?: string; brand?: string }[] | null;
};

const BASE = "id, company_id, name, vintage_year, fund_size_usd, target_size_usd, strategy";
const RICH = `${BASE}, source, manager_name, vehicle_kind, domicile, currency, service_providers`;

// `version` is the funds table's row count: part of the cache key, so a
// universe cached an hour ago is dropped as soon as the ingest adds a fund.
async function build(version: string): Promise<PackedFundUniverse> {
  void version;
  const supabase = getReadClient();
  const empty: PackedFundUniverse = { generatedAt: new Date().toISOString(), brands: [], managers: [], funds: [] };
  if (!supabase) return empty;

  const page = (cols: string) =>
    fetchAll<FundRow>((from, to, first) =>
      supabase.from("funds").select(cols, first ? { count: "exact" } : undefined).order("id").range(from, to),
    );
  const rows = (await page(RICH)) ?? (await page(BASE));
  if (!rows) throw new Error("Funds unavailable");

  const [index, details] = await Promise.all([getDirectoryIndex(), fundDetailFacets(supabase)]);
  const byId = new Map(index.records.map((r) => [r.id, r]));

  const managers: PackedFundUniverse["managers"] = [];
  const managerIdx = new Map<string, number>();
  const brands: PackedFundUniverse["brands"] = [];
  const brandIdx = new Map<string, number>();

  const funds: PackedFund[] = rows.map((f) => {
    let mi = -1;
    const m = f.company_id ? byId.get(f.company_id) : undefined;
    if (m) {
      mi = managerIdx.get(m.id) ?? -1;
      if (mi < 0) {
        mi = managers.length;
        managerIdx.set(m.id, mi);
        managers.push([m.id, m.name, m.domain, m.category, m.subType, m.country]);
      }
    }
    const providers: number[] = [];
    for (const p of Array.isArray(f.service_providers) ? f.service_providers : []) {
      if (!p?.key || !p.brand) continue;
      let bi = brandIdx.get(p.key);
      if (bi == null) {
        bi = brands.length;
        brandIdx.set(p.key, bi);
        brands.push([p.key, p.brand]);
      }
      const role = PROVIDER_ROLES.indexOf(normalizeRole(p.role));
      providers.push(bi, role < 0 ? PROVIDER_ROLES.length : role);
    }

    // What the fund's own name says, within the class it sits in: the first
    // strategy-axis match is its strategy, the sector-axis matches and the
    // industries it names are its sectors. A researched row says more and
    // wins where it speaks.
    const fc = fundClass(f.name, m?.subType ?? null);
    const stated = fc ? strategiesInFundName(f.name, fc.key) : [];
    const detail = details.get(f.id);
    const strategyCode = detail?.strategy_code || stated.find((s) => s.axis === "strategy")?.key || null;
    const sectorCodes = [...new Set([...stated.filter((s) => s.axis === "sector").map((s) => s.key), ...industryCodesInText(f.name)])];
    const regionCodes = detail?.region_codes?.length ? detail.region_codes : regionsInText(f.name);
    const size = f.fund_size_usd ?? f.target_size_usd ?? null;

    return [
      f.id,
      mi,
      f.name,
      f.vehicle_kind ?? null,
      f.domicile ?? null,
      f.currency ?? null,
      size,
      f.vintage_year ?? null,
      f.strategy ?? null,
      f.source ?? null,
      providers,
      m ? null : (f.manager_name ?? null),
      strategyCode,
      sectorCodes,
      regionCodes,
      bandOf(FUND_SIZE_BANDS, size)?.key ?? null,
      detail?.fundraising_status ?? null,
    ];
  });

  // Best-documented first: funds with their providers named, then by name.
  funds.sort((a, b) => b[10].length - a[10].length || a[2].localeCompare(b[2]));
  return { generatedAt: new Date().toISOString(), brands, managers, funds };
}

const cached = bigCache("fund-universe-v4", build, { tags: [DIRECTORY_TAG], revalidate: 86400 });

/** Every fund on file, packed. Never throws. */
export async function getFundUniverse(): Promise<PackedFundUniverse> {
  try {
    return await cached(await tableVersion("funds", "fund_details"));
  } catch {
    return { generatedAt: new Date().toISOString(), brands: [], managers: [], funds: [] };
  }
}
