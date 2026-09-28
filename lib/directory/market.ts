// Market structure from Form ADV: who audits, administers, holds custody for,
// prime-brokers and places capital for which managers. League tables count
// distinct managers per provider brand, never raw filing rows — one GP naming
// "JPMORGAN CHASE BANK, N.A." on six funds is one client, not six.
//
// Pure module: safe on the client.

import type { ProviderRole } from "./providers";
import { PROVIDER_ROLES } from "./providers";
import { providerPairs, type DirectoryBrand, type DirectoryRecord } from "./records";

export type LeagueRow = {
  brand: DirectoryBrand;
  brandIndex: number;
  clients: number;
  /** Share of managers in scope that name any provider in this role. */
  share: number;
  topClients: DirectoryRecord[];
};

export type League = {
  role: ProviderRole;
  /** Managers in scope with at least one provider in this role. */
  covered: number;
  rows: LeagueRow[];
};

/** Provider league table for one role across the given managers. */
export function leagueTable(
  managers: DirectoryRecord[],
  brands: DirectoryBrand[],
  role: ProviderRole,
  limit = 25,
): League {
  const clients = new Map<number, DirectoryRecord[]>();
  const covered = new Set<string>();
  for (const m of managers) {
    const seen = new Set<number>();
    for (const p of providerPairs(m)) {
      if (p.role !== role || seen.has(p.brand)) continue;
      seen.add(p.brand);
      covered.add(m.id);
      const list = clients.get(p.brand) ?? [];
      list.push(m);
      clients.set(p.brand, list);
    }
  }
  const rows: LeagueRow[] = [...clients.entries()]
    .map(([bi, list]) => ({
      brand: brands[bi],
      brandIndex: bi,
      clients: list.length,
      share: covered.size ? list.length / covered.size : 0,
      topClients: [...list].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).slice(0, 3),
    }))
    .filter((r) => r.brand)
    .sort((a, b) => b.clients - a.clients || a.brand.name.localeCompare(b.brand.name))
    .slice(0, limit);
  return { role, covered: covered.size, rows };
}

/** Which roles an SP type answers for on Form ADV. */
export function rolesForTypes(types: string[]): ProviderRole[] {
  const out = new Set<ProviderRole>();
  for (const t of types) {
    if (t === "Fund administrator") out.add("administrator");
    if (t === "Audit & advisory") out.add("auditor");
    if (t === "Bank") {
      out.add("custodian");
      out.add("prime_broker");
    }
    if (t === "Placement agent") out.add("placement_agent");
  }
  return PROVIDER_ROLES.filter((r) => out.has(r));
}

/** Managers that file Form ADV provider links at all. */
export function filers(records: DirectoryRecord[]): DirectoryRecord[] {
  return records.filter((r) => r.providers.length > 0);
}
