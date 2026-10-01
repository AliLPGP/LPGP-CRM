import "server-only";
import { getReadClient } from "../supabase/server";
import { fetchAll } from "../supabase/paged";
import { bigCache } from "../supabase/big-cache";
import { tableVersion } from "../supabase/version";
import type { Category } from "../types";
import { zoneOf, type Zone } from "./geo";
import { isOperatingRole } from "./operating";
import { normalizeRole, providerBrand } from "./providers";
import {
  EMPTY_INDEX,
  disclosesFrom,
  roleIndex,
  type AumKind,
  type DirectoryBrand,
  type DirectoryIndex,
  type DirectoryRecord,
} from "./records";

/** Cache tag for everything derived from the directory. */
export const DIRECTORY_TAG = "directory";

const BASE_COLUMNS =
  "id, name, category, sub_type, domain, city, country, region, aum_usd, description, in_portfolio";

const RICH_COLUMNS = `${BASE_COLUMNS}, directory_vertical, state, employee_count, adv_employee_count, founded_year, adv_firm_type, adv_last_filed, private_fund_count, regulatory_aum_usd, brand_aum_total_usd, private_fund_gross_assets, total_assets_usd, industry, service_lines, lifecycle, discloses_commitments, source`;

type CompanyRow = {
  id: string;
  name: string;
  category: Category;
  sub_type: string | null;
  domain: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  aum_usd: number | null;
  description: string | null;
  in_portfolio: boolean | null;
  directory_vertical?: string | null;
  state?: string | null;
  employee_count?: number | null;
  adv_employee_count?: number | null;
  founded_year?: number | null;
  adv_firm_type?: string | null;
  adv_last_filed?: string | null;
  private_fund_count?: number | null;
  regulatory_aum_usd?: number | null;
  brand_aum_total_usd?: number | null;
  private_fund_gross_assets?: number | null;
  total_assets_usd?: number | null;
  industry?: string | null;
  service_lines?: { name?: string; capabilities?: string[] }[] | null;
  lifecycle?: string[] | null;
  discloses_commitments?: string | null;
  source?: string | null;
};

type RelRow = {
  client_company_id: string | null;
  provider_company_id: string | null;
  role: string | null;
  provider_key: string | null;
  provider_brand: string | null;
  source: string | null;
};

/** The best single size figure a firm has, and what it is. */
export function aumOf(c: CompanyRow): { aum: number | null; kind: AumKind | null } {
  if (c.brand_aum_total_usd) return { aum: Number(c.brand_aum_total_usd), kind: "brand" };
  if (c.regulatory_aum_usd) return { aum: Number(c.regulatory_aum_usd), kind: "raum" };
  if (c.total_assets_usd) return { aum: Number(c.total_assets_usd), kind: "assets" };
  if (c.aum_usd) return { aum: Number(c.aum_usd), kind: "manual" };
  if (c.private_fund_gross_assets) return { aum: Number(c.private_fund_gross_assets), kind: "gav" };
  return { aum: null, kind: null };
}

function linesText(lines: CompanyRow["service_lines"]): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  return lines
    .map((l) => [l?.name, ...(Array.isArray(l?.capabilities) ? l.capabilities : [])].filter(Boolean).join(" · "))
    .join(" | ");
}

// `version` is the row count of the tables the index reads: part of the cache
// key, so growth the app did not write (the EDGAR ingest) still shows.
async function buildIndex(version: string): Promise<DirectoryIndex> {
  void version;
  const supabase = getReadClient();
  if (!supabase) return EMPTY_INDEX;

  let schemaReady = true;
  let companies = await fetchAll<CompanyRow>((from, to, first) =>
    supabase
      .from("companies")
      .select(RICH_COLUMNS, first ? { count: "exact" } : undefined)
      .order("id")
      .range(from, to),
  );
  if (!companies) {
    // Migration 0013 hasn't run: serve what the older schema has.
    schemaReady = false;
    companies = await fetchAll<CompanyRow>((from, to, first) =>
      supabase
        .from("companies")
        .select(BASE_COLUMNS, first ? { count: "exact" } : undefined)
        .order("id")
        .range(from, to),
    );
  }
  // A failed read throws rather than returning empty, so the cache never
  // keeps a half-built index for the next hour.
  if (!companies) throw new Error("Directory: companies unavailable");

  const contactCols = schemaReady ? "id, company_id, job_title, connectable" : "id, company_id, job_title";
  const contacts = await fetchAll<{ company_id: string | null; job_title: string | null; connectable?: boolean | null }>(
    (from, to, first) =>
      supabase
        .from("contacts")
        .select(contactCols, first ? { count: "exact" } : undefined)
        .not("company_id", "is", null)
        .order("id")
        .range(from, to),
  );
  if (!contacts) throw new Error("Directory: contacts unavailable");
  const contactCount = new Map<string, number>();
  const connectableCount = new Map<string, number>();
  const operatorCount = new Map<string, number>();
  for (const c of contacts) {
    if (!c.company_id) continue;
    contactCount.set(c.company_id, (contactCount.get(c.company_id) ?? 0) + 1);
    if (isOperatingRole(c.job_title)) operatorCount.set(c.company_id, (operatorCount.get(c.company_id) ?? 0) + 1);
    if (c.connectable) connectableCount.set(c.company_id, (connectableCount.get(c.company_id) ?? 0) + 1);
  }

  const rels = schemaReady
    ? await fetchAll<RelRow>((from, to, first) =>
        supabase
          .from("service_relationships")
          .select(
            "id, client_company_id, provider_company_id, role, provider_key, provider_brand, source",
            first ? { count: "exact" } : undefined,
          )
          .order("id")
          .range(from, to),
      )
    : [];
  if (!rels) throw new Error("Directory: provider links unavailable");

  const nameById = new Map(companies.map((c) => [c.id, c.name]));
  // Brands: filed links carry their own key; older hand-entered links fall
  // back to the provider company's name run through the same rules.
  const brandIdx = new Map<string, number>();
  const brands: DirectoryBrand[] = [];
  const brandClients = new Map<number, Set<string>>();
  const providersByClient = new Map<string, number[]>();
  const clientsByProvider = new Map<string, Set<string>>();

  for (const r of rels) {
    if (!r.client_company_id) continue;
    let key = r.provider_key;
    let name = r.provider_brand;
    if (!key) {
      const providerName = r.provider_company_id ? nameById.get(r.provider_company_id) : null;
      if (!providerName) continue;
      const b = providerBrand(providerName);
      key = b.key;
      name = b.name;
    }
    let bi = brandIdx.get(key);
    if (bi == null) {
      bi = brands.length;
      brandIdx.set(key, bi);
      brands.push({ key, name: name ?? key, companyId: r.provider_company_id, clients: 0 });
    } else if (!brands[bi].companyId && r.provider_company_id) {
      brands[bi].companyId = r.provider_company_id;
    }
    const role = roleIndex(normalizeRole(r.role));
    const list = providersByClient.get(r.client_company_id) ?? [];
    list.push(bi, role);
    providersByClient.set(r.client_company_id, list);
    const set = brandClients.get(bi) ?? new Set<string>();
    set.add(r.client_company_id);
    brandClients.set(bi, set);
    if (r.provider_company_id) {
      const clients = clientsByProvider.get(r.provider_company_id) ?? new Set<string>();
      clients.add(r.client_company_id);
      clientsByProvider.set(r.provider_company_id, clients);
    }
  }
  for (const [bi, set] of brandClients) brands[bi].clients = set.size;

  // Funds and portfolio companies per manager, counted by the database in
  // one call (migration 0027). Falls back to nothing, not to 45 pages of rows.
  const fundCount = new Map<string, number>();
  const portcoCount = new Map<string, number>();
  if (schemaReady) {
    const { data } = await supabase.rpc("directory_rollups");
    const r = data as { funds?: Record<string, number>; portcos?: Record<string, number> } | null;
    for (const [k, v] of Object.entries(r?.funds ?? {})) fundCount.set(k, v);
    for (const [k, v] of Object.entries(r?.portcos ?? {})) portcoCount.set(k, v);
  }

  let advThrough: string | null = null;
  for (const c of companies) {
    if (c.adv_last_filed && (!advThrough || c.adv_last_filed > advThrough)) advThrough = c.adv_last_filed;
  }

  const records: DirectoryRecord[] = companies.map((c) => {
    const { aum, kind } = aumOf(c);
    const adv = c.adv_firm_type === "Registered" || c.adv_firm_type === "ERA" ? c.adv_firm_type : null;
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      subType: c.sub_type,
      vertical: c.directory_vertical ?? null,
      domain: c.domain,
      city: c.city,
      state: c.state ?? null,
      country: c.country,
      zone: zoneOf(c.country, c.region) as Zone | null,
      aum,
      aumKind: kind,
      employees: c.employee_count ?? c.adv_employee_count ?? null,
      founded: c.founded_year ?? null,
      adv,
      privateFunds: c.private_fund_count ?? null,
      contacts: contactCount.get(c.id) ?? 0,
      connectable: connectableCount.get(c.id) ?? 0,
      description: c.description,
      industry: c.industry ?? null,
      lines: linesText(c.service_lines),
      lifecycle: Array.isArray(c.lifecycle) ? c.lifecycle : [],
      discloses: disclosesFrom(c.discloses_commitments),
      portfolio: Boolean(c.in_portfolio),
      directory: c.source === "master_directory",
      providers: providersByClient.get(c.id) ?? [],
      clientCount: clientsByProvider.get(c.id)?.size ?? 0,
      funds: fundCount.get(c.id) ?? 0,
      operators: operatorCount.get(c.id) ?? 0,
      portcos: portcoCount.get(c.id) ?? 0,
    };
  });

  const index = { generatedAt: new Date().toISOString(), schemaReady, advThrough, records, brands };
  if (!schemaReady) {
    // Served, but not cached: once the migration runs, the next request
    // should see the new columns rather than an hour-old snapshot without them.
    pendingIndex = index;
    throw new Error("Directory: migration 0013 not applied");
  }
  return index;
}

let pendingIndex: DirectoryIndex | null = null;

// Several megabytes of records: sliced for the data cache and kept in
// memory per instance (lib/supabase/big-cache.ts).
const cachedIndex = bigCache("directory-index-v4", buildIndex, {
  tags: [DIRECTORY_TAG],
  revalidate: 86400,
});

/**
 * The whole directory as compact records, cached across requests and
 * invalidated by imports and edits (tag `directory`). Never throws.
 */
export async function getDirectoryIndex(): Promise<DirectoryIndex> {
  pendingIndex = null;
  try {
    return await cachedIndex(await tableVersion("companies", "contacts", "service_relationships", "funds", "portfolio_companies"));
  } catch {
    return pendingIndex ?? EMPTY_INDEX;
  }
}
