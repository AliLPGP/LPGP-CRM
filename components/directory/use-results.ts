"use client";

import { useMemo } from "react";
import type { Category } from "@/lib/types";
import type { AssetClassKey } from "@/lib/directory/asset-classes";
import { matches, type DirectoryFilters, type SortKey } from "@/lib/directory/filters";
import type { Zone } from "@/lib/directory/geo";
import type { DirectoryRecord } from "@/lib/directory/records";
import { relevance } from "@/lib/directory/search";
import { findSimilar } from "@/lib/directory/similar";
import type { Directory } from "./use-directory";

export type ResultRow = {
  record: DirectoryRecord;
  /** Relevance (keywords) or similarity (lookalikes), 0–100. */
  score: number | null;
  reasons: string[];
};

export type Facets = {
  books: Map<Category, number>;
  types: Map<string, number>;
  zones: Map<Zone, number>;
  countries: Map<string, number>;
  adv: Map<string, number>;
  classes: Map<AssetClassKey, number>;
  strategies: Map<string, number>;
  sectors: Map<string, number>;
  /** Region codes (taxonomy.ts), from HQ and stated focus. */
  prefRegions: Map<string, number>;
  typeCodes: Map<string, number>;
};

export type Results = {
  rows: ResultRow[];
  facets: Facets;
  mode: "all" | "keywords" | "similar";
  sort: SortKey;
  seeds: DirectoryRecord[];
};

function completeness(r: DirectoryRecord): number {
  return (
    (r.description ? 3 : 0) +
    (r.contacts ? 2 : 0) +
    (r.domain ? 1 : 0) +
    (r.subType ? 1 : 0) +
    (r.aum != null ? 1 : 0) +
    (r.adv ? 1 : 0) +
    (r.providers.length ? 1 : 0)
  );
}

function bump<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

const byName = (a: ResultRow, b: ResultRow) => a.record.name.localeCompare(b.record.name);
const desc = (f: (r: DirectoryRecord) => number | null) => (a: ResultRow, b: ResultRow) =>
  (f(b.record) ?? -Infinity) - (f(a.record) ?? -Infinity) || byName(a, b);

/** Everything Discover shows for a set of filters, computed in one pass. */
export function useResults(dir: Directory, filters: DirectoryFilters): Results {
  const { records, brands, search, ctx } = dir;

  // Narrowing that doesn't depend on the structured facets.
  const candidates = useMemo(() => {
    if (filters.like.length) {
      const seeds = filters.like.map((id) => dir.byId.get(id)).filter(Boolean) as DirectoryRecord[];
      const hits = findSimilar(seeds, records, brands, search, 300);
      return {
        mode: "similar" as const,
        seeds,
        list: hits.map((h) => ({ record: h.record, score: h.score, reasons: h.reasons })),
      };
    }
    const kw = filters.keywords.trim();
    if (kw) {
      const rel = relevance(search, kw);
      let top = 0;
      for (const r of rel.values()) top = Math.max(top, r.score);
      const list: ResultRow[] = [];
      for (const [i, r] of rel) {
        list.push({ record: records[i], score: top ? Math.round((r.score / top) * 100) : null, reasons: [] });
      }
      return { mode: "keywords" as const, seeds: [], list };
    }
    return {
      mode: "all" as const,
      seeds: [],
      list: records.map((record) => ({ record, score: null, reasons: [] as string[] })),
    };
  }, [filters.like, filters.keywords, records, brands, search, dir.byId]);

  return useMemo(() => {
    const rows: ResultRow[] = [];
    const facets: Facets = {
      books: new Map(),
      types: new Map(),
      zones: new Map(),
      countries: new Map(),
      adv: new Map(),
      classes: new Map(),
      strategies: new Map(),
      sectors: new Map(),
      prefRegions: new Map(),
      typeCodes: new Map(),
    };
    for (const row of candidates.list) {
      const r = row.record;
      if (matches(r, filters, ctx)) rows.push(row);
      if (matches(r, filters, ctx, "books")) bump(facets.books, r.category);
      if (r.subType && matches(r, filters, ctx, "types")) bump(facets.types, r.subType);
      if (r.zone && matches(r, filters, ctx, "zones")) bump(facets.zones, r.zone);
      if (r.country && matches(r, filters, ctx, "countries")) bump(facets.countries, r.country);
      if (matches(r, filters, ctx, "adv")) bump(facets.adv, r.adv ?? "None");
      // A record counts once per value it carries: a firm in two classes is
      // one more under each.
      if (r.classes.length && matches(r, filters, ctx, "classes")) for (const k of r.classes) bump(facets.classes, k);
      if (r.strategies.length && matches(r, filters, ctx, "strategies")) for (const k of r.strategies) bump(facets.strategies, k);
      if (r.sectors.length && matches(r, filters, ctx, "sectors")) for (const k of r.sectors) bump(facets.sectors, k);
      if (r.regions.length && matches(r, filters, ctx, "prefRegions")) for (const k of r.regions) bump(facets.prefRegions, k);
      if (r.typeCode && matches(r, filters, ctx, "typeCodes")) bump(facets.typeCodes, r.typeCode);
    }

    const sort: SortKey =
      filters.sort ?? (candidates.mode === "similar" ? "similarity" : candidates.mode === "keywords" ? "relevance" : "complete");
    const order: Record<SortKey, (a: ResultRow, b: ResultRow) => number> = {
      relevance: (a, b) => (b.score ?? 0) - (a.score ?? 0) || desc((r) => r.aum)(a, b),
      similarity: (a, b) => (b.score ?? 0) - (a.score ?? 0) || desc((r) => r.aum)(a, b),
      // Best-documented firms first: a full profile is worth more on a first
      // look than a big number from a single filing.
      complete: desc((r) => completeness(r) * 1e15 + (r.aum ?? 0)),
      aum: desc((r) => r.aum),
      employees: desc((r) => r.employees),
      founded: desc((r) => r.founded),
      contacts: desc((r) => r.contacts),
      // Epoch days; a record with no date sorts last.
      newest: desc((r) => r.created),
      updated: desc((r) => r.updated),
      name: byName,
    };
    rows.sort(order[sort] ?? order.aum);
    return { rows, facets, mode: candidates.mode, sort, seeds: candidates.seeds };
  }, [candidates, filters, ctx]);
}
