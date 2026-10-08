// The Discover index: one compact record per firm, plus the provider brands
// GPs name on Form ADV. Built on the server (lib/directory/index-server.ts),
// fetched by the browser once from /api/directory/index, and searched,
// filtered, compared and mapped there — so every filter click is instant.
//
// Pure module: safe on the client.

import type { Category } from "../types";
import { PROVIDER_ROLES, type ProviderRole } from "./providers";
import type { Zone } from "./geo";
import type { AssetClassKey } from "./asset-classes";

/** Which figure `aum` holds, so the UI can say what it is. */
export type AumKind = "brand" | "raum" | "gav" | "assets" | "manual";

export const AUM_KIND_LABEL: Record<AumKind, string> = {
  brand: "Regulatory AUM, all SEC entities (Form ADV)",
  raum: "Regulatory AUM (Form ADV)",
  gav: "Private fund gross assets (Form ADV, exempt reporting)",
  assets: "Total assets",
  manual: "AUM",
};

export type DirectoryRecord = {
  id: string;
  name: string;
  category: Category;
  subType: string | null;
  vertical: string | null;
  domain: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zone: Zone | null;
  aum: number | null;
  aumKind: AumKind | null;
  employees: number | null;
  founded: number | null;
  adv: "Registered" | "ERA" | null;
  privateFunds: number | null;
  contacts: number;
  connectable: number;
  description: string | null;
  industry: string | null;
  /** SP service lines and capabilities, flattened for search. */
  lines: string | null;
  /** LP publishes fund-level commitments (Yes / Selective / Partial). */
  discloses: boolean | null;
  portfolio: boolean;
  /** Came from the Master Directory workbook. */
  directory: boolean;
  /** LP's researched profile states an actual share, a target or an amount for at least one asset class. */
  statedAlloc: boolean;
  /** GP → providers it files: [brandIndex, roleIndex, …] flattened. */
  providers: number[];
  /** Distinct GPs whose filings name this firm (SPs linked to a brand). */
  clientCount: number;
  /** Funds on file for this manager (Form ADV's named funds, and any others). */
  funds: number;
  /** Operating partners on file (contacts with an operating title). */
  operators: number;
  /** Portfolio companies on file. */
  portcos: number;
  /** Taxonomy type code (taxonomy.ts) by book and sub-type; an LP's own
   *  researched type wins when the profile states one. */
  typeCode: string | null;
  /** GP: the class its type places it in plus any a stated strategy names;
   *  LP: the classes it allocates to or plans for; SP: none. */
  classes: AssetClassKey[];
  /** Strategy keys (strategies.ts) the firm's own words state, or an LP's stated preferences. */
  strategies: string[];
  /** Industry codes (taxonomy.ts) named in the overview, industry and vertical. */
  sectors: string[];
  /** Region codes: HQ first, then any stated geographic focus or preference. */
  regions: string[];
  /** LP: commitments on file; GP: funds on file; SP: distinct GP clients. */
  knownFunds: number;
  /** Stated allocation to alternatives, percent. */
  altsPct: number | null;
  /** [classKey, current %] for each allocation whose current figure is stated. */
  alloc: [string, number][];
  /** The commitment an LP writes per fund, USD, when its profile states it. */
  ticketMin: number | null;
  ticketMax: number | null;
  /** False when the LP says it no longer invests in alternatives. */
  activeAlts: boolean | null;
  /** Classes the LP says it will invest in or is considering over the next twelve months. */
  plans: string[];
  /** GP: per class its funds' names state, [classKey, sum of stated fund
   *  sizes in USD as filed, funds] over vintages in the last ten years. The
   *  sum covers sized funds only; the count covers every fund. Never a
   *  target size, never a conversion, never an estimate. */
  raised: [string, number, number][];
  /** When the record was created / last edited, as epoch days. */
  created: number | null;
  updated: number | null;
};

export type DirectoryBrand = {
  key: string;
  name: string;
  /** SP company this brand resolves to, when the directory has one. */
  companyId: string | null;
  /** Distinct GP clients across every role. */
  clients: number;
};

export type DirectoryIndex = {
  generatedAt: string;
  /** False until migration 0013 has run: the page explains what's missing. */
  schemaReady: boolean;
  /** The latest Form ADV filing date behind the directory. */
  advThrough: string | null;
  records: DirectoryRecord[];
  brands: DirectoryBrand[];
};

export const EMPTY_INDEX: DirectoryIndex = {
  generatedAt: new Date(0).toISOString(),
  schemaReady: false,
  advThrough: null,
  records: [],
  brands: [],
};

export function roleAt(index: number): ProviderRole {
  return PROVIDER_ROLES[index] ?? "other";
}

export function roleIndex(role: ProviderRole): number {
  const i = PROVIDER_ROLES.indexOf(role);
  return i < 0 ? PROVIDER_ROLES.length : i;
}

/** [{brand, role}] pairs for a record. */
export function providerPairs(record: DirectoryRecord): { brand: number; role: ProviderRole }[] {
  const out: { brand: number; role: ProviderRole }[] = [];
  for (let i = 0; i + 1 < record.providers.length; i += 2) {
    out.push({ brand: record.providers[i], role: roleAt(record.providers[i + 1]) });
  }
  return out;
}

// --- Wire format ---------------------------------------------------------------
// Nine thousand records travel to the browser on every first visit, so the
// shape is tuned for bytes:
//
// - Positional tuples: a key per field would spend a third of the payload on
//   repeated property names.
// - A string table (`dict`) for the columns with a few dozen distinct values
//   (type, country, city, zone, type code, the taxonomy keys…): each use is
//   an index, not the words again.
// - One integer of flags for the booleans and small enums.
// - The fields most firms leave empty come last, and a tuple stops at its last
//   non-default value: a roster GP with no LP profile is 20 slots, not 40.
// - Ids are UUIDs, carried without their hyphens.
//
// Bump WIRE_VERSION whenever the tuple changes: it is part of the index URL,
// so a page from one deploy never reads a cached payload from another.

export const WIRE_VERSION = 3;

/** The index route, keyed by the directory version so an import busts the edge cache. */
export function indexUrl(version: string): string {
  return `/api/directory/index?v=${encodeURIComponent(version)}&f=${WIRE_VERSION}`;
}

/** An index into `dict`, or null for no value. */
type D = number | null;

type Packed = [
  string, // 0 id, UUID without hyphens
  string, // 1 name
  Category, // 2
  D, // 3 subType
  string | null, // 4 domain
  D, // 5 city
  D, // 6 state
  D, // 7 country
  D, // 8 zone
  number, // 9 flags (see FLAG_*)
  number | null, // 10 aum
  D, // 11 aumKind
  number | null, // 12 employees
  number | null, // 13 founded
  number, // 14 contacts
  number, // 15 connectable
  string | null, // 16 description
  number | null, // 17 created
  number | null, // 18 updated
  D, // 19 typeCode
  number[], // 20 classes, as dict indices
  number[], // 21 strategies, as dict indices
  number[], // 22 sectors, as dict indices
  number[], // 23 regions, as dict indices
  number, // 24 knownFunds
  D, // 25 vertical
  D, // 26 industry
  string | null, // 27 lines
  number[], // 28 providers
  number, // 29 clientCount
  number, // 30 funds
  number | null, // 31 privateFunds
  number, // 32 operators
  number, // 33 portcos
  [string, number, number][], // 34 raised
  number | null, // 35 altsPct
  [string, number][], // 36 alloc
  number | null, // 37 ticketMin
  number | null, // 38 ticketMax
  number[], // 39 plans, as dict indices
];

/** A packed record as sent: id, name and book are always there; every slot after them is dropped once only defaults remain. */
export type PackedRecord = [string, string, Category, ...unknown[]];

const FLAG_PORTFOLIO = 1;
const FLAG_DIRECTORY = 2;
/** Bits 2–3: Form ADV status (0 none, 1 Registered, 2 ERA). */
const ADV_SHIFT = 2;
/** Bits 4–5: discloses (0 unknown, 1 yes, 2 no). */
const DISCLOSES_SHIFT = 4;
/** Bits 6–7: active in alternatives (0 unknown, 1 yes, 2 no). */
const ACTIVE_SHIFT = 6;
const FLAG_STATED_ALLOC = 256;

function tri(v: boolean | null): number {
  return v == null ? 0 : v ? 1 : 2;
}

function untri(bits: number): boolean | null {
  return bits === 1 ? true : bits === 2 ? false : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX32 = /^[0-9a-f]{32}$/;

function packId(id: string): string {
  return UUID.test(id) ? id.replace(/-/g, "") : id;
}

function unpackId(id: string): string {
  return HEX32.test(id) ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : id;
}

export type PackedIndex = {
  generatedAt: string;
  schemaReady: boolean;
  advThrough: string | null;
  /** The table fingerprint this payload answers (lib/supabase/version.ts), when the route set it. */
  version?: string;
  /** The string table the records' `D` slots index into. */
  dict: string[];
  records: PackedRecord[];
  brands: [string, string, string | null, number][];
};

/** Is a slot's value the one `unpackIndex` fills in when the slot is missing? */
function isDefault(v: unknown): boolean {
  return v == null || v === 0 || v === "" || (Array.isArray(v) && v.length === 0);
}

export function packIndex(index: DirectoryIndex): PackedIndex {
  const dict: string[] = [];
  const at = new Map<string, number>();
  const intern = (s: string | null | undefined): D => {
    if (!s) return null;
    let i = at.get(s);
    if (i == null) {
      i = dict.length;
      at.set(s, i);
      dict.push(s);
    }
    return i;
  };
  const keys = (list: string[]): number[] => list.map((k) => intern(k) as number);
  const records = index.records.map((r): PackedRecord => {
    const flags =
      (r.portfolio ? FLAG_PORTFOLIO : 0) |
      (r.directory ? FLAG_DIRECTORY : 0) |
      ((r.adv === "Registered" ? 1 : r.adv === "ERA" ? 2 : 0) << ADV_SHIFT) |
      (tri(r.discloses) << DISCLOSES_SHIFT) |
      (tri(r.activeAlts) << ACTIVE_SHIFT) |
      (r.statedAlloc ? FLAG_STATED_ALLOC : 0);
    const full: Packed = [
      packId(r.id), r.name, r.category, intern(r.subType), r.domain, intern(r.city), intern(r.state), intern(r.country), intern(r.zone),
      flags, r.aum, intern(r.aumKind), r.employees, r.founded, r.contacts, r.connectable, r.description, r.created, r.updated,
      intern(r.typeCode), keys(r.classes), keys(r.strategies), keys(r.sectors), keys(r.regions), r.knownFunds, intern(r.vertical), intern(r.industry), r.lines,
      r.providers, r.clientCount, r.funds, r.privateFunds, r.operators, r.portcos, r.raised,
      r.altsPct, r.alloc, r.ticketMin, r.ticketMax, keys(r.plans),
    ];
    let end = full.length;
    while (end > 3 && isDefault(full[end - 1])) end -= 1;
    return full.slice(0, end) as PackedRecord;
  });
  return {
    generatedAt: index.generatedAt,
    schemaReady: index.schemaReady,
    advThrough: index.advThrough,
    dict,
    records,
    brands: index.brands.map((b) => [b.key, b.name, b.companyId ? packId(b.companyId) : null, b.clients]),
  };
}

export function unpackIndex(packed: PackedIndex): DirectoryIndex {
  const unpack = recordUnpacker(packed);
  return { ...unpackShell(packed), records: packed.records.map(unpack) };
}

/** Everything of the index but its records: cheap, done in one go. */
export function unpackShell(packed: PackedIndex): Omit<DirectoryIndex, "records"> {
  return {
    generatedAt: packed.generatedAt,
    schemaReady: packed.schemaReady,
    advThrough: packed.advThrough ?? null,
    brands: packed.brands.map(([key, name, companyId, clients]) => ({ key, name, companyId: companyId ? unpackId(companyId) : null, clients })),
  };
}

/** One record off the wire. The browser unpacks the index a run at a time
 *  with this, so a phone never spends one long task on twenty thousand. */
export function recordUnpacker(packed: PackedIndex): (w: PackedIndex["records"][number]) => DirectoryRecord {
  const dict = packed.dict ?? [];
  const word = (i: D | undefined): string | null => (i == null ? null : (dict[i] ?? null));
  const words = (list: number[] | undefined): string[] => (list ?? []).map((i) => dict[i]).filter((s): s is string => typeof s === "string");
  return (w) => {
    const p = w as unknown as Partial<Packed>;
    const flags = p[9] ?? 0;
    const adv = (flags >> ADV_SHIFT) & 3;
    return {
      id: unpackId(p[0] as string),
      name: p[1] as string,
      category: p[2] as Category,
      subType: word(p[3]),
      vertical: word(p[25]),
      domain: p[4] ?? null,
      city: word(p[5]),
      state: word(p[6]),
      country: word(p[7]),
      zone: word(p[8]) as Zone | null,
      aum: p[10] ?? null,
      aumKind: word(p[11]) as AumKind | null,
      employees: p[12] ?? null,
      founded: p[13] ?? null,
      adv: adv === 1 ? "Registered" : adv === 2 ? "ERA" : null,
      privateFunds: p[31] ?? null,
      contacts: p[14] ?? 0,
      connectable: p[15] ?? 0,
      description: p[16] ?? null,
      industry: word(p[26]),
      lines: p[27] ?? null,
      discloses: untri((flags >> DISCLOSES_SHIFT) & 3),
      portfolio: (flags & FLAG_PORTFOLIO) !== 0,
      directory: (flags & FLAG_DIRECTORY) !== 0,
      statedAlloc: (flags & FLAG_STATED_ALLOC) !== 0,
      providers: p[28] ?? [],
      clientCount: p[29] ?? 0,
      funds: p[30] ?? 0,
      operators: p[32] ?? 0,
      portcos: p[33] ?? 0,
      typeCode: word(p[19]),
      classes: words(p[20]) as AssetClassKey[],
      strategies: words(p[21]),
      sectors: words(p[22]),
      regions: words(p[23]),
      knownFunds: p[24] ?? 0,
      altsPct: p[35] ?? null,
      alloc: p[36] ?? [],
      ticketMin: p[37] ?? null,
      ticketMax: p[38] ?? null,
      activeAlts: untri((flags >> ACTIVE_SHIFT) & 3),
      plans: words(p[39]),
      raised: p[34] ?? [],
      created: p[17] ?? null,
      updated: p[18] ?? null,
    };
  };
}

// --- Display helpers --------------------------------------------------------------

export function locationLabel(r: Pick<DirectoryRecord, "city" | "state" | "country" | "zone">): string | null {
  if (r.city && r.country === "United States" && r.state) return `${r.city}, ${r.state}`;
  if (r.city && r.country) return `${r.city}, ${r.country}`;
  if (r.country) return r.state && r.country === "United States" ? `${r.state}, US` : r.country;
  return r.zone ?? null;
}

/** "Discloses commitments" from the LP sheet's free-text column. */
export function disclosesFrom(text: string | null | undefined): boolean | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (/^(yes|selective|partial)/.test(t)) return true;
  if (/^(no|aggregate|portfolio-level)/.test(t)) return false;
  return null;
}
