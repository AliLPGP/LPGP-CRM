"use client";

import { useMemo } from "react";
import type { Category } from "@/lib/types";
import type { AssetClassKey } from "@/lib/directory/asset-classes";
import { isResearched } from "@/lib/directory/coverage";
import { matches, type DirectoryFilters, type SortKey } from "@/lib/directory/filters";
import { EMPLOYEE_PRESETS } from "@/lib/directory/format";
import { subregionOf, type Subregion, type Zone } from "@/lib/directory/geo";
import type { DirectoryRecord } from "@/lib/directory/records";
import { rowOrder } from "@/lib/directory/result-order";
import { relevance } from "@/lib/directory/search";
import { findSimilar } from "@/lib/directory/similar";
import { AUM_BANDS, type Band } from "@/lib/directory/taxonomy";
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
  /** HQ subregions (geo.ts), beside the zones and countries in the Location menu. */
  regions: Map<Subregion, number>;
  /** Firms per AUM band (taxonomy.ts), ignoring the size filter itself. */
  aumBands: Map<string, number>;
  /** Firms per headcount band (format.ts), ignoring the headcount filter itself. */
  empBands: Map<string, number>;
  /** Researched firms and thin ones under every other filter: the counts on the two tabs. */
  coverage: { researched: number; thin: number };
};

/** The band a figure falls in: lower bound inclusive, upper exclusive, open-ended at the ends. */
export function bandOf(bands: Band[], v: number | null): string | null {
  if (v == null) return null;
  for (const b of bands) {
    if ((b.min == null || v >= b.min) && (b.max == null || v < b.max)) return b.key;
  }
  return null;
}

/** Headcount presets as bands keyed by their label. */
export const EMP_BANDS: Band[] = EMPLOYEE_PRESETS.map((p) => ({ key: p.label, label: p.label, min: p.min, max: p.max }));

export type Results = {
  rows: ResultRow[];
  facets: Facets;
  mode: "all" | "keywords" | "similar";
  sort: SortKey;
  seeds: DirectoryRecord[];
};

function bump<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

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
      regions: new Map(),
      aumBands: new Map(),
      empBands: new Map(),
      coverage: { researched: 0, thin: 0 },
    };
    // `matches` can skip one of the list facets; the range facets are counted
    // against the same filters with that one range lifted. A record that
    // passes everything passes the lifted set too, so only the misses re-run.
    const noRegions: DirectoryFilters = { ...filters, regions: [] };
    const noAum: DirectoryFilters = { ...filters, aumMin: null, aumMax: null };
    const noEmp: DirectoryFilters = { ...filters, empMin: null, empMax: null };
    for (const row of candidates.list) {
      const r = row.record;
      const passes = matches(r, filters, ctx);
      if (passes) rows.push(row);
      const sub = subregionOf(r.country);
      if (sub && (passes || (filters.regions.length > 0 && matches(r, noRegions, ctx)))) bump(facets.regions, sub);
      const aumBand = bandOf(AUM_BANDS, r.aum);
      if (aumBand && (passes || ((filters.aumMin != null || filters.aumMax != null) && matches(r, noAum, ctx)))) bump(facets.aumBands, aumBand);
      const empBand = bandOf(EMP_BANDS, r.employees);
      if (empBand && (passes || ((filters.empMin != null || filters.empMax != null) && matches(r, noEmp, ctx)))) bump(facets.empBands, empBand);
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
      if (matches(r, filters, ctx, "coverage")) facets.coverage[isResearched(r) ? "researched" : "thin"] += 1;
    }

    const sort: SortKey =
      filters.sort ?? (candidates.mode === "similar" ? "similarity" : candidates.mode === "keywords" ? "relevance" : "complete");
    rows.sort(rowOrder(sort));
    return { rows, facets, mode: candidates.mode, sort, seeds: candidates.seeds };
  }, [candidates, filters, ctx]);
}
