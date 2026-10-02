// Discover filters: the shape, the predicate, and the URL form.
//
// The URL is the source of truth (shareable, back-button friendly); the page
// derives everything from it. Pure module: safe on the client.

import type { Category } from "../types";
import { canonicalCountry, subregionOf, SUBREGIONS, type Subregion, type Zone, ZONES } from "./geo";
import { PROVIDER_ROLES, type ProviderRole } from "./providers";
import { providerPairs, type DirectoryBrand, type DirectoryRecord } from "./records";
import { isAssetClassKey, type AssetClassKey } from "./asset-classes";

export type ProviderFilter = { key: string; role: ProviderRole | null };

export type SortKey =
  | "complete"
  | "relevance"
  | "aum"
  | "name"
  | "employees"
  | "founded"
  | "contacts"
  | "similarity";

export type DirectoryFilters = {
  books: Category[];
  types: string[];
  /** Providers whose Form ADV clients include these manager types. */
  clientTypes: string[];
  zones: Zone[];
  regions: Subregion[];
  countries: string[];
  states: string[];
  cities: string[];
  aumMin: number | null;
  aumMax: number | null;
  empMin: number | null;
  empMax: number | null;
  foundedMin: number | null;
  foundedMax: number | null;
  adv: ("Registered" | "ERA" | "None")[];
  providers: ProviderFilter[];
  hasContacts: boolean;
  connectable: boolean;
  hasWebsite: boolean;
  discloses: boolean;
  portfolio: boolean;
  /** GPs with operating partners on file. */
  hasOperators: boolean;
  /** GPs with portfolio companies on file. */
  hasPortcos: boolean;
  /** Asset classes a firm manages, allocates to or plans for. */
  classes: AssetClassKey[];
  /** Strategy keys (strategies.ts) stated by the firm or preferred by the LP. */
  strategies: string[];
  /** Industry codes (taxonomy.ts). */
  sectors: string[];
  /** Region codes (taxonomy.ts): HQ or a stated focus or preference. */
  prefRegions: string[];
  /** Taxonomy type codes, across books: an investment consultant sits in LP and SP. */
  typeCodes: string[];
  /** The commitment an LP writes per fund, USD. */
  ticketMin: number | null;
  ticketMax: number | null;
  /** Allocation to alternatives, percent. */
  altsMin: number | null;
  altsMax: number | null;
  /** Current allocation to one class, percent. */
  allocClass: AssetClassKey | null;
  allocMin: number | null;
  allocMax: number | null;
  /** LPs with a stated plan for the next twelve months. */
  hasPlans: boolean;
  /** Show LPs that say they no longer invest in alternatives. */
  includeInactive: boolean;
  /** Free-text terms ranked by relevance. */
  keywords: string;
  /** Company ids to find lookalikes of. */
  like: string[];
  sort: SortKey | null;
};

export const EMPTY_FILTERS: DirectoryFilters = {
  books: [],
  types: [],
  clientTypes: [],
  zones: [],
  regions: [],
  countries: [],
  states: [],
  cities: [],
  aumMin: null,
  aumMax: null,
  empMin: null,
  empMax: null,
  foundedMin: null,
  foundedMax: null,
  adv: [],
  providers: [],
  hasContacts: false,
  connectable: false,
  hasWebsite: false,
  discloses: false,
  portfolio: false,
  hasOperators: false,
  hasPortcos: false,
  classes: [],
  strategies: [],
  sectors: [],
  prefRegions: [],
  typeCodes: [],
  ticketMin: null,
  ticketMax: null,
  altsMin: null,
  altsMax: null,
  allocClass: null,
  allocMin: null,
  allocMax: null,
  hasPlans: false,
  includeInactive: false,
  keywords: "",
  like: [],
  sort: null,
};

const BOOKS: Category[] = ["LP", "GP", "SP", "UN"];

/** Everything but the keywords, lookalike seeds and sort order. */
export function hasStructuredFilters(f: DirectoryFilters): boolean {
  return (
    f.books.length > 0 ||
    f.types.length > 0 ||
    f.clientTypes.length > 0 ||
    f.zones.length > 0 ||
    f.regions.length > 0 ||
    f.countries.length > 0 ||
    f.states.length > 0 ||
    f.cities.length > 0 ||
    f.aumMin != null ||
    f.aumMax != null ||
    f.empMin != null ||
    f.empMax != null ||
    f.foundedMin != null ||
    f.foundedMax != null ||
    f.adv.length > 0 ||
    f.providers.length > 0 ||
    f.hasContacts ||
    f.connectable ||
    f.hasWebsite ||
    f.discloses ||
    f.portfolio ||
    f.hasOperators ||
    f.hasPortcos ||
    f.classes.length > 0 ||
    f.strategies.length > 0 ||
    f.sectors.length > 0 ||
    f.prefRegions.length > 0 ||
    f.typeCodes.length > 0 ||
    f.ticketMin != null ||
    f.ticketMax != null ||
    f.altsMin != null ||
    f.altsMax != null ||
    f.allocClass != null ||
    f.hasPlans ||
    f.includeInactive
  );
}

export function isEmptyQuery(f: DirectoryFilters): boolean {
  return !hasStructuredFilters(f) && !f.keywords.trim() && f.like.length === 0;
}

export type FilterContext = {
  brandIndex: Map<string, number>;
  /** SP company id → the manager types among its Form ADV clients. */
  clientTypes: Map<string, Set<string>>;
};

export function filterContext(records: DirectoryRecord[], brands: DirectoryBrand[]): FilterContext {
  const clientTypes = new Map<string, Set<string>>();
  for (const r of records) {
    if (!r.subType || !r.providers.length) continue;
    for (const p of providerPairs(r)) {
      const sp = brands[p.brand]?.companyId;
      if (!sp) continue;
      const set = clientTypes.get(sp) ?? new Set<string>();
      set.add(r.subType);
      clientTypes.set(sp, set);
    }
  }
  return { brandIndex: new Map(brands.map((b, i) => [b.key, i])), clientTypes };
}

/** Does a record pass every structured filter? `skip` ignores one facet so
 *  that facet's own counts can be computed ("how many if I also tick X"). */
export function matches(
  r: DirectoryRecord,
  f: DirectoryFilters,
  ctx: FilterContext,
  skip?: "books" | "types" | "zones" | "countries" | "adv" | "classes" | "strategies" | "sectors" | "prefRegions" | "typeCodes",
): boolean {
  if (skip !== "books" && f.books.length && !f.books.includes(r.category)) return false;
  if (skip !== "types" && f.types.length && !(r.subType && f.types.includes(r.subType))) return false;
  if (f.clientTypes.length) {
    const served = ctx.clientTypes.get(r.id);
    if (!served || !f.clientTypes.some((t) => served.has(t))) return false;
  }
  if (skip !== "zones" && f.zones.length && !(r.zone && f.zones.includes(r.zone))) return false;
  if (f.regions.length) {
    const sub = subregionOf(r.country);
    if (!sub || !f.regions.includes(sub)) return false;
  }
  if (skip !== "countries" && f.countries.length && !(r.country && f.countries.includes(r.country))) return false;
  if (f.states.length && !(r.state && f.states.includes(r.state))) return false;
  if (f.cities.length && !(r.city && f.cities.some((c) => c.toLowerCase() === r.city!.toLowerCase()))) return false;
  if (f.aumMin != null && !(r.aum != null && r.aum >= f.aumMin)) return false;
  if (f.aumMax != null && !(r.aum != null && r.aum <= f.aumMax)) return false;
  if (f.empMin != null && !(r.employees != null && r.employees >= f.empMin)) return false;
  if (f.empMax != null && !(r.employees != null && r.employees <= f.empMax)) return false;
  if (f.foundedMin != null && !(r.founded != null && r.founded >= f.foundedMin)) return false;
  if (f.foundedMax != null && !(r.founded != null && r.founded <= f.foundedMax)) return false;
  if (skip !== "adv" && f.adv.length) {
    const status = r.adv ?? "None";
    if (!f.adv.includes(status)) return false;
  }
  if (f.providers.length) {
    const pairs = providerPairs(r);
    for (const p of f.providers) {
      const bi = ctx.brandIndex.get(p.key);
      if (bi == null) return false;
      if (!pairs.some((x) => x.brand === bi && (!p.role || x.role === p.role))) return false;
    }
  }
  if (f.hasContacts && r.contacts === 0) return false;
  if (f.connectable && r.connectable === 0) return false;
  if (f.hasWebsite && !r.domain) return false;
  if (f.discloses && r.discloses !== true) return false;
  if (f.portfolio && !r.portfolio) return false;
  if (f.hasOperators && !r.operators) return false;
  if (f.hasPortcos && !r.portcos) return false;
  if (skip !== "classes" && f.classes.length && !f.classes.some((k) => r.classes.includes(k))) return false;
  if (skip !== "strategies" && f.strategies.length && !f.strategies.some((k) => r.strategies.includes(k))) return false;
  if (skip !== "sectors" && f.sectors.length && !f.sectors.some((k) => r.sectors.includes(k))) return false;
  if (skip !== "prefRegions" && f.prefRegions.length && !f.prefRegions.some((k) => r.regions.includes(k))) return false;
  if (skip !== "typeCodes" && f.typeCodes.length && !(r.typeCode && f.typeCodes.includes(r.typeCode))) return false;
  if (f.ticketMin != null || f.ticketMax != null) {
    // The LP's range overlaps the asked one; no stated ticket at all fails.
    if (r.ticketMin == null && r.ticketMax == null) return false;
    if (f.ticketMin != null && r.ticketMax != null && r.ticketMax < f.ticketMin) return false;
    if (f.ticketMax != null && r.ticketMin != null && r.ticketMin > f.ticketMax) return false;
  }
  if (f.altsMin != null && !(r.altsPct != null && r.altsPct >= f.altsMin)) return false;
  if (f.altsMax != null && !(r.altsPct != null && r.altsPct <= f.altsMax)) return false;
  if (f.allocClass) {
    const pct = r.alloc.find(([k]) => k === f.allocClass)?.[1];
    if (pct == null) return false;
    if (f.allocMin != null && pct < f.allocMin) return false;
    if (f.allocMax != null && pct > f.allocMax) return false;
  }
  if (f.hasPlans && r.plans.length === 0) return false;
  if (!f.includeInactive && r.activeAlts === false) return false;
  return true;
}

// --- URL form ---------------------------------------------------------------------

function list(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function range(v: string | null): [number | null, number | null] {
  if (!v) return [null, null];
  const [a, b] = v.split("-");
  const n = (s: string | undefined) => (s && s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);
  return [n(a), n(b)];
}

function rangeParam(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  return `${min ?? ""}-${max ?? ""}`;
}

/** "class:min-max" — an allocation to one class; the class alone means "any stated figure". */
function allocFrom(v: string | null): [AssetClassKey | null, number | null, number | null] {
  if (!v) return [null, null, null];
  const i = v.indexOf(":");
  const cls = i < 0 ? v : v.slice(0, i);
  if (!isAssetClassKey(cls)) return [null, null, null];
  const [min, max] = range(i < 0 ? null : v.slice(i + 1));
  return [cls, min, max];
}

function allocParam(cls: AssetClassKey | null, min: number | null, max: number | null): string | null {
  if (!cls) return null;
  const r = rangeParam(min, max);
  return r ? `${cls}:${r}` : cls;
}

type Params = { get(name: string): string | null };

export function filtersFromParams(p: Params): DirectoryFilters {
  const [aumMin, aumMax] = range(p.get("aum"));
  const [empMin, empMax] = range(p.get("emp"));
  const [foundedMin, foundedMax] = range(p.get("founded"));
  const [ticketMin, ticketMax] = range(p.get("ticket"));
  const [altsMin, altsMax] = range(p.get("alts"));
  const [allocClass, allocMin, allocMax] = allocFrom(p.get("alloc"));
  const has = new Set(list(p.get("has")));
  const bookParam = p.get("book") ?? p.get("category");
  return {
    books: list(bookParam)
      .map((b) => b.toUpperCase())
      .filter((b): b is Category => (BOOKS as string[]).includes(b)),
    types: list(p.get("type")),
    clientTypes: list(p.get("serves")),
    zones: list(p.get("zone")).filter((z): z is Zone => (ZONES as string[]).includes(z)),
    regions: list(p.get("region")).filter((r): r is Subregion => (SUBREGIONS as string[]).includes(r)),
    countries: list(p.get("country")).map((c) => canonicalCountry(c) ?? c),
    states: list(p.get("state")),
    cities: list(p.get("city")),
    aumMin,
    aumMax,
    empMin,
    empMax,
    foundedMin,
    foundedMax,
    adv: list(p.get("adv")).filter((a): a is "Registered" | "ERA" | "None" =>
      ["Registered", "ERA", "None"].includes(a),
    ),
    providers: list(p.get("uses")).map((u) => {
      const [key, role] = u.split(":");
      return {
        key,
        role: role && (PROVIDER_ROLES as string[]).includes(role) ? (role as ProviderRole) : null,
      };
    }),
    hasContacts: has.has("contacts"),
    connectable: has.has("email"),
    hasWebsite: has.has("website"),
    discloses: has.has("disclosures"),
    portfolio: has.has("portfolio"),
    hasOperators: has.has("operators"),
    hasPortcos: has.has("portcos"),
    classes: list(p.get("class")).filter(isAssetClassKey),
    strategies: list(p.get("strategy")),
    sectors: list(p.get("sector")),
    prefRegions: list(p.get("pref")),
    typeCodes: list(p.get("itype")),
    ticketMin,
    ticketMax,
    altsMin,
    altsMax,
    allocClass,
    allocMin,
    allocMax,
    hasPlans: has.has("plans"),
    includeInactive: p.get("inactive") === "1",
    keywords: p.get("kw") ?? "",
    like: list(p.get("like")),
    sort: (p.get("sort") as SortKey | null) ?? null,
  };
}

export function filtersToParams(f: DirectoryFilters): URLSearchParams {
  const out = new URLSearchParams();
  const set = (k: string, v: string | null | undefined) => {
    if (v) out.set(k, v);
  };
  set("book", f.books.join(","));
  set("type", f.types.join(","));
  set("serves", f.clientTypes.join(","));
  set("zone", f.zones.join(","));
  set("region", f.regions.join(","));
  set("country", f.countries.join(","));
  set("state", f.states.join(","));
  set("city", f.cities.join(","));
  set("aum", rangeParam(f.aumMin, f.aumMax));
  set("emp", rangeParam(f.empMin, f.empMax));
  set("founded", rangeParam(f.foundedMin, f.foundedMax));
  set("adv", f.adv.join(","));
  set("uses", f.providers.map((p) => (p.role ? `${p.key}:${p.role}` : p.key)).join(","));
  const has = [
    f.hasContacts && "contacts",
    f.connectable && "email",
    f.hasWebsite && "website",
    f.discloses && "disclosures",
    f.portfolio && "portfolio",
    f.hasOperators && "operators",
    f.hasPortcos && "portcos",
    f.hasPlans && "plans",
  ].filter(Boolean) as string[];
  set("has", has.join(","));
  set("class", f.classes.join(","));
  set("strategy", f.strategies.join(","));
  set("sector", f.sectors.join(","));
  set("pref", f.prefRegions.join(","));
  set("itype", f.typeCodes.join(","));
  set("ticket", rangeParam(f.ticketMin, f.ticketMax));
  set("alts", rangeParam(f.altsMin, f.altsMax));
  set("alloc", allocParam(f.allocClass, f.allocMin, f.allocMax));
  set("inactive", f.includeInactive ? "1" : null);
  set("kw", f.keywords.trim());
  set("like", f.like.join(","));
  set("sort", f.sort);
  return out;
}

/** Toggle a value in a list-valued facet. */
export function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
