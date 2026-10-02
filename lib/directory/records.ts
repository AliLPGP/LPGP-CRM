// The Discover index: one compact record per firm, plus the provider brands
// GPs name on Form ADV. Built on the server (lib/directory/index-server.ts),
// shipped to the browser once, and searched, filtered, compared and mapped
// there — so every filter click is instant.
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
  lifecycle: string[];
  /** LP publishes fund-level commitments (Yes / Selective / Partial). */
  discloses: boolean | null;
  portfolio: boolean;
  /** Came from the Master Directory workbook. */
  directory: boolean;
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
// Positional tuples: a couple of thousand records with a key per field would
// spend a third of the payload on repeated property names.

type Packed = [
  string, string, Category, string | null, string | null, string | null,
  string | null, string | null, string | null, Zone | null,
  number | null, AumKind | null, number | null, number | null, "Registered" | "ERA" | null,
  number | null, number, number, string | null, string | null, string | null,
  string[], boolean | null, 0 | 1, 0 | 1, number[], number, number, number, number,
  // 30..41, appended in this order; an older payload stops at 29 and unpacks with defaults.
  string | null, AssetClassKey[], string[], string[], string[], number,
  number | null, [string, number][], number | null, number | null, boolean | null, string[],
];

export type PackedIndex = {
  generatedAt: string;
  schemaReady: boolean;
  advThrough: string | null;
  records: Packed[];
  brands: [string, string, string | null, number][];
};

export function packIndex(index: DirectoryIndex): PackedIndex {
  return {
    generatedAt: index.generatedAt,
    schemaReady: index.schemaReady,
    advThrough: index.advThrough,
    records: index.records.map((r) => [
      r.id, r.name, r.category, r.subType, r.vertical, r.domain,
      r.city, r.state, r.country, r.zone,
      r.aum, r.aumKind, r.employees, r.founded, r.adv,
      r.privateFunds, r.contacts, r.connectable, r.description, r.industry, r.lines,
      r.lifecycle, r.discloses, r.portfolio ? 1 : 0, r.directory ? 1 : 0, r.providers, r.clientCount, r.funds,
      r.operators, r.portcos,
      r.typeCode, r.classes, r.strategies, r.sectors, r.regions, r.knownFunds,
      r.altsPct, r.alloc, r.ticketMin, r.ticketMax, r.activeAlts, r.plans,
    ]),
    brands: index.brands.map((b) => [b.key, b.name, b.companyId, b.clients]),
  };
}

export function unpackIndex(packed: PackedIndex): DirectoryIndex {
  return {
    generatedAt: packed.generatedAt,
    schemaReady: packed.schemaReady,
    advThrough: packed.advThrough ?? null,
    records: packed.records.map((p) => ({
      id: p[0], name: p[1], category: p[2], subType: p[3], vertical: p[4], domain: p[5],
      city: p[6], state: p[7], country: p[8], zone: p[9],
      aum: p[10], aumKind: p[11], employees: p[12], founded: p[13], adv: p[14],
      privateFunds: p[15], contacts: p[16], connectable: p[17], description: p[18], industry: p[19], lines: p[20],
      lifecycle: p[21], discloses: p[22], portfolio: p[23] === 1, directory: p[24] === 1, providers: p[25], clientCount: p[26],
      funds: p[27] ?? 0,
      operators: p[28] ?? 0,
      portcos: p[29] ?? 0,
      typeCode: p[30] ?? null,
      classes: p[31] ?? [],
      strategies: p[32] ?? [],
      sectors: p[33] ?? [],
      regions: p[34] ?? [],
      knownFunds: p[35] ?? 0,
      altsPct: p[36] ?? null,
      alloc: p[37] ?? [],
      ticketMin: p[38] ?? null,
      ticketMax: p[39] ?? null,
      activeAlts: p[40] ?? null,
      plans: p[41] ?? [],
    })),
    brands: packed.brands.map(([key, name, companyId, clients]) => ({ key, name, companyId, clients })),
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
