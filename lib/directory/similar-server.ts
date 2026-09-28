import "server-only";
import { getDirectoryIndex } from "./index-server";
import { buildSearchIndex, type SearchIndex } from "./search";
import { findSimilar, type SimilarHit } from "./similar";
import type { DirectoryIndex } from "./records";

// The search index is derived from the cached directory index; rebuilding it
// costs ~100ms, so keep one per index version for the life of the instance.
let memo: { version: string; search: SearchIndex } | null = null;

function searchFor(index: DirectoryIndex): SearchIndex {
  if (!memo || memo.version !== index.generatedAt) {
    memo = { version: index.generatedAt, search: buildSearchIndex(index.records) };
  }
  return memo.search;
}

/** Firms most like this one, for its profile. Empty when it isn't indexed. */
export async function similarFirms(companyId: string, limit = 6): Promise<SimilarHit[]> {
  const index = await getDirectoryIndex();
  const seed = index.records.find((r) => r.id === companyId);
  if (!seed) return [];
  return findSimilar([seed], index.records, index.brands, searchFor(index), limit);
}
