import "server-only";
import { unstable_cache } from "next/cache";
import { getReadClient } from "../supabase/server";
import { fetchAll } from "../supabase/paged";
import type { Category } from "../types";
import { DIRECTORY_TAG, getDirectoryIndex } from "./index-server";
import { normalizeRole, PROVIDER_ROLES } from "./providers";

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
];

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

async function build(): Promise<PackedFundUniverse> {
  const supabase = getReadClient();
  const empty: PackedFundUniverse = { generatedAt: new Date().toISOString(), brands: [], managers: [], funds: [] };
  if (!supabase) return empty;

  const page = (cols: string) =>
    fetchAll<FundRow>((from, to, first) =>
      supabase.from("funds").select(cols, first ? { count: "exact" } : undefined).order("id").range(from, to),
    );
  const rows = (await page(RICH)) ?? (await page(BASE));
  if (!rows) throw new Error("Funds unavailable");

  const index = await getDirectoryIndex();
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
    return [
      f.id,
      mi,
      f.name,
      f.vehicle_kind ?? null,
      f.domicile ?? null,
      f.currency ?? null,
      f.fund_size_usd ?? f.target_size_usd ?? null,
      f.vintage_year ?? null,
      f.strategy ?? null,
      f.source ?? null,
      providers,
      m ? null : (f.manager_name ?? null),
    ];
  });

  return { generatedAt: new Date().toISOString(), brands, managers, funds };
}

const cached = unstable_cache(build, ["fund-universe-v1"], { tags: [DIRECTORY_TAG], revalidate: 3600 });

/** Every fund on file, packed. Never throws. */
export async function getFundUniverse(): Promise<PackedFundUniverse> {
  try {
    return await cached();
  } catch {
    return { generatedAt: new Date().toISOString(), brands: [], managers: [], funds: [] };
  }
}
