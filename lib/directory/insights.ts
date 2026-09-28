// Summaries of a set of directory records — the whole directory on Discover's
// home, or one search's results above its table. Pure: safe on the client.
//
// Money follows the same rule as everywhere else: only like is added to like.
// Regulatory AUM (Form ADV, brand or entity) is summed on its own; ERA fund
// gross assets and LP total assets are different measures and never join it.

import type { Category } from "../types";
import { PROVIDER_ROLES, type ProviderRole } from "./providers";
import { providerPairs, type DirectoryRecord } from "./records";

export type Count<K> = { key: K; count: number };

export type ProviderLeader = { brand: number; clients: number; share: number };

export type Insights = {
  total: number;
  books: Record<Category, number>;
  people: number;
  connectable: number;
  funds: number;
  providerLinks: number;
  filers: number;
  /** Managers naming at least one provider in each role. */
  roleFilers: Record<ProviderRole, number>;
  raum: { sum: number; firms: number };
  gav: { sum: number; firms: number };
  lpAssets: { sum: number; firms: number };
  types: Count<string>[];
  countries: Count<string>[];
  decades: Count<number>[];
  largest: DirectoryRecord[];
  leaders: Record<ProviderRole, ProviderLeader[]>;
};

function top<K>(map: Map<K, number>, n = Infinity): Count<K>[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

const bump = <K,>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export function isRegulatoryAum(r: DirectoryRecord): boolean {
  return r.aum != null && (r.aumKind === "brand" || r.aumKind === "raum");
}

/**
 * A brand total is filed once per brand but the directory can hold several of
 * the brand's entities (Vanguard's three advisers all carry Vanguard's
 * total). Count each brand total once, at its first record.
 */
function brandTotalSeen(r: DirectoryRecord, seen: Set<number>): boolean {
  if (r.aumKind !== "brand" || r.aum == null) return false;
  if (seen.has(r.aum)) return true;
  seen.add(r.aum);
  return false;
}

export function summarize(records: DirectoryRecord[], leadersPerRole = 8): Insights {
  const books: Record<Category, number> = { LP: 0, GP: 0, SP: 0, UN: 0 };
  const types = new Map<string, number>();
  const countries = new Map<string, number>();
  const decades = new Map<number, number>();
  const roleClients = new Map<ProviderRole, Map<number, number>>();
  const roleFilers = Object.fromEntries(PROVIDER_ROLES.map((r) => [r, 0])) as Record<ProviderRole, number>;
  let people = 0;
  let connectable = 0;
  let funds = 0;
  let providerLinks = 0;
  let filers = 0;
  const raum = { sum: 0, firms: 0 };
  const gav = { sum: 0, firms: 0 };
  const lpAssets = { sum: 0, firms: 0 };
  const brandTotals = new Set<number>();

  for (const r of records) {
    books[r.category] += 1;
    people += r.contacts;
    connectable += r.connectable;
    funds += r.funds;
    if (r.subType) bump(types, r.subType);
    if (r.country) bump(countries, r.country);
    if (r.founded && r.founded >= 1800 && r.founded <= 2100 && r.category === "GP") bump(decades, Math.floor(r.founded / 10) * 10);
    if (isRegulatoryAum(r)) {
      if (!brandTotalSeen(r, brandTotals)) {
        raum.sum += r.aum!;
        raum.firms += 1;
      }
    } else if (r.aum != null && r.aumKind === "gav") {
      gav.sum += r.aum;
      gav.firms += 1;
    } else if (r.aum != null && r.aumKind === "assets" && r.category === "LP") {
      lpAssets.sum += r.aum;
      lpAssets.firms += 1;
    }
    if (r.providers.length) {
      filers += 1;
      providerLinks += r.providers.length / 2;
      const seen = new Set<string>();
      for (const p of providerPairs(r)) {
        const key = `${p.role}:${p.brand}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const m = roleClients.get(p.role) ?? new Map<number, number>();
        bump(m, p.brand);
        roleClients.set(p.role, m);
      }
      for (const role of PROVIDER_ROLES) if ([...seen].some((k) => k.startsWith(`${role}:`))) roleFilers[role] += 1;
    }
  }

  const leaders = Object.fromEntries(
    PROVIDER_ROLES.map((role) => {
      const m = roleClients.get(role) ?? new Map<number, number>();
      const base = roleFilers[role] || 1;
      return [
        role,
        top(m, leadersPerRole).map(({ key, count }) => ({ brand: key, clients: count, share: count / base })),
      ];
    }),
  ) as Record<ProviderRole, ProviderLeader[]>;

  const shownTotals = new Set<number>();
  const largest = records
    .filter((r) => r.category === "GP" && isRegulatoryAum(r))
    .sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0) || b.contacts - a.contacts || (b.domain ? 1 : 0) - (a.domain ? 1 : 0))
    .filter((r) => !brandTotalSeen(r, shownTotals))
    .slice(0, 10);

  return {
    total: records.length,
    books,
    people,
    connectable,
    funds,
    providerLinks,
    filers,
    roleFilers,
    raum,
    gav,
    lpAssets,
    types: top(types),
    countries: top(countries),
    decades: [...decades.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => a.key - b.key),
    largest,
    leaders,
  };
}

/** The best-documented firms with a website, largest first: for logo walls. */
export function showcase(records: DirectoryRecord[], n: number): DirectoryRecord[] {
  return records
    .filter((r) => r.domain)
    .sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0) || b.contacts - a.contacts)
    .slice(0, n);
}
