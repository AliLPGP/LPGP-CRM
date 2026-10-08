import "server-only";
import { filterContext, filtersFromParams, matches, type FilterContext } from "./filters";
import { getDirectoryIndex } from "./index-server";
import { rowOrder } from "./result-order";
import { providerPairs, type DirectoryBrand, type DirectoryIndex, type DirectoryRecord } from "./records";

// The first page of a Discover results view, served before the browser has
// the whole index. The browser would otherwise download and unpack every firm
// (tens of thousands) before drawing one row; this answers with the rows the
// reader sees first, in the order the full index will show them, plus the
// total, and the index keeps loading behind it for search, facets and counts.
// A search by keyword or a lookalike needs the keyword index, so it is not
// served here: the caller falls back to waiting for the index.

export type PagePayload = {
  total: number;
  rows: DirectoryRecord[];
  /** Only the brands these rows name, by their position in the full list. */
  brands: Record<number, DirectoryBrand>;
  /** The firms behind those brands, for their logos. */
  extras: DirectoryRecord[];
};

export const PAGE_SIZE = 100;
const MAX_PAGE = 200;

// The filter context is built from every record: once per index, not per request.
const contexts = new WeakMap<DirectoryIndex, FilterContext>();
function contextOf(index: DirectoryIndex): FilterContext {
  let ctx = contexts.get(index);
  if (!ctx) {
    ctx = filterContext(index.records, index.brands);
    contexts.set(index, ctx);
  }
  return ctx;
}

/** The page for a filter query string, or null when the index is needed to answer it. */
export async function getResultsPage(params: URLSearchParams, limit = PAGE_SIZE, offset = 0): Promise<PagePayload | null> {
  const filters = filtersFromParams(params);
  if (filters.keywords.trim() || filters.like.length) return null;
  const index = await getDirectoryIndex();
  if (!index.records.length) return null;
  const ctx = contextOf(index);
  const sort = filters.sort ?? "complete";
  const hits = index.records.filter((r) => matches(r, filters, ctx)).map((record) => ({ record, score: null }));
  hits.sort(rowOrder(sort));
  const rows = hits.slice(offset, offset + Math.min(limit, MAX_PAGE)).map((h) => h.record);

  const brands: Record<number, DirectoryBrand> = {};
  const companyIds = new Set<string>();
  for (const r of rows) {
    for (const p of providerPairs(r)) {
      const b = index.brands[p.brand];
      if (b && !(p.brand in brands)) {
        brands[p.brand] = b;
        if (b.companyId) companyIds.add(b.companyId);
      }
    }
  }
  const byId = new Map(index.records.map((r) => [r.id, r]));
  const extras = [...companyIds].map((id) => byId.get(id)).filter((r): r is DirectoryRecord => Boolean(r));
  return { total: hits.length, rows, brands, extras };
}
