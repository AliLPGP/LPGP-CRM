// Discover's home, summarised on the server: the figures on the stand, the
// three books, the league tables, the decades and the map counts. A few
// kilobytes, cached beside the index, so the page paints its numbers before
// the index itself has reached the browser.
//
// Pure module: safe on the client.

import type { Category } from "../types";
import { showcase, summarize, type Insights } from "./insights";
import { PROVIDER_ROLES, type ProviderRole } from "./providers";
import type { DirectoryIndex } from "./records";

export type OverviewBook = {
  book: Category;
  count: number;
  /** The most common sub-types, largest first. */
  types: { key: string; count: number }[];
  /** The best-documented firms with a website, for the logo stack. */
  logos: { id: string; name: string; domain: string | null }[];
};

export type OverviewLeader = {
  key: string;
  name: string;
  companyId: string | null;
  /** The SP company's own domain, when the directory has the brand as a firm. */
  domain: string | null;
  clients: number;
  /** Share of the managers naming any provider in this role. */
  share: number;
};

export type DirectoryOverview = {
  /** The table fingerprint the index was built from: the browser fetches that version. */
  version: string;
  generatedAt: string;
  schemaReady: boolean;
  advThrough: string | null;
  /** At least one firm came from the Master Directory workbook. */
  hasDirectoryFirms: boolean;
  insights: Insights;
  books: OverviewBook[];
  leaders: Record<ProviderRole, OverviewLeader[]>;
};

const BOOKS: Category[] = ["GP", "LP", "SP"];

export function buildOverview(index: DirectoryIndex, version: string): DirectoryOverview {
  const insights = summarize(index.records);
  const byId = new Map(index.records.map((r) => [r.id, r]));

  const books = BOOKS.map((book): OverviewBook => {
    const recs = index.records.filter((r) => r.category === book);
    const types = new Map<string, number>();
    for (const r of recs) if (r.subType) types.set(r.subType, (types.get(r.subType) ?? 0) + 1);
    return {
      book,
      count: recs.length,
      types: [...types.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
      logos: showcase(recs, 7).map((r) => ({ id: r.id, name: r.name, domain: r.domain })),
    };
  });

  const leaders = Object.fromEntries(
    PROVIDER_ROLES.map((role) => [
      role,
      insights.leaders[role].flatMap((l): OverviewLeader[] => {
        const b = index.brands[l.brand];
        if (!b) return [];
        return [{ key: b.key, name: b.name, companyId: b.companyId, domain: b.companyId ? (byId.get(b.companyId)?.domain ?? null) : null, clients: l.clients, share: l.share }];
      }),
    ]),
  ) as Record<ProviderRole, OverviewLeader[]>;

  return {
    version,
    generatedAt: index.generatedAt,
    schemaReady: index.schemaReady,
    advThrough: index.advThrough,
    hasDirectoryFirms: index.records.some((r) => r.directory),
    insights,
    books,
    leaders,
  };
}
