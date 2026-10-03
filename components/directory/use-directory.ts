"use client";

import { useCallback, useSyncExternalStore } from "react";
import { filterContext, type FilterContext } from "@/lib/directory/filters";
import { EMPTY_INDEX, indexUrl, recordUnpacker, unpackShell, type DirectoryBrand, type DirectoryIndex, type DirectoryRecord, type PackedIndex } from "@/lib/directory/records";
import { buildSearchIndex, searchIndexBuilder, type SearchIndex } from "@/lib/directory/search";
import { buildVocab, type Vocab } from "@/lib/directory/thesis";

/** The unpacked index plus everything derived from it, built once per payload. */
export type Directory = DirectoryIndex & {
  search: SearchIndex;
  /** False while the keyword index is still being built behind a usable
   *  directory: facets, counts and the ledger work; keyword and lookalike
   *  results wait for it. */
  searchReady: boolean;
  vocab: Vocab;
  ctx: FilterContext;
  byId: Map<string, DirectoryRecord>;
  brandByKey: Map<string, DirectoryBrand & { index: number }>;
};

export function buildDirectory(index: DirectoryIndex): Directory {
  return {
    ...index,
    search: buildSearchIndex(index.records),
    searchReady: true,
    vocab: buildVocab(index.records, index.brands),
    ctx: filterContext(index.records, index.brands),
    byId: new Map(index.records.map((r) => [r.id, r])),
    brandByKey: new Map(index.brands.map((b, i) => [b.key, { ...b, index: i }])),
  };
}

/** No firms at all: what the page computes against until the index lands. */
export const EMPTY_DIRECTORY: Directory = buildDirectory(EMPTY_INDEX);

// --- The loader -------------------------------------------------------------------
// The index is fetched once per directory version and kept at module level,
// so moving between Discover's views, the quick look and the market map
// never fetches it again; a new version (an import) is a new entry. Parsing
// and indexing happen in idle slices, so the page's own paint and the
// person's first clicks are never behind a half-second of BM25.
//
// Exposed through useSyncExternalStore: the server snapshot is "not loaded",
// the client snapshot is whatever the cache holds, and a load started in
// `subscribe` (after commit) rather than in an effect that sets state.

export type DirectoryLoad = {
  version: string;
  phase: "idle" | "fetching" | "parsing" | "indexing" | "ready" | "failed";
  dir: Directory | null;
  error: string | null;
};

const states = new Map<string, DirectoryLoad>();
const listeners = new Set<() => void>();

function stateOf(version: string): DirectoryLoad {
  let s = states.get(version);
  if (!s) {
    s = { version, phase: "idle", dir: null, error: null };
    states.set(version, s);
  }
  return s;
}

function advance(version: string, patch: Partial<DirectoryLoad>) {
  states.set(version, { ...stateOf(version), ...patch });
  for (const l of listeners) l();
}

/** Hand the main thread back before the next heavy step. */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 0);
  });
}

/** After the page's own load: the first paint, its scripts and its images
 *  come before twenty thousand firms do. A page that preloaded the index
 *  (a results view) has it in flight already, so this costs it nothing. */
function afterLoad(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
}

// Records per slice: about 40 ms of work each on a phone at a quarter of a
// laptop's speed, under the 50 ms that makes a task "long".
const UNPACK_SLICE = 1000;
const SEARCH_SLICE = 250;

const NO_SEARCH = buildSearchIndex([]);

async function load(version: string) {
  const s = stateOf(version);
  if (s.phase !== "idle" && s.phase !== "failed") return;
  advance(version, { phase: "fetching", error: null });
  try {
    await afterLoad();
    const res = await fetch(indexUrl(version));
    if (!res.ok) throw new Error(`The index answered ${res.status}.`);
    const packed = (await res.json()) as PackedIndex;
    advance(version, { phase: "parsing" });
    await idle();
    const unpack = recordUnpacker(packed);
    const records: DirectoryRecord[] = [];
    for (let i = 0; i < packed.records.length; i += UNPACK_SLICE) {
      for (const w of packed.records.slice(i, i + UNPACK_SLICE)) records.push(unpack(w));
      await idle();
    }
    const index: DirectoryIndex = { ...unpackShell(packed), records };
    const ctx = filterContext(index.records, index.brands);
    await idle();
    const vocab = buildVocab(index.records, index.brands);
    await idle();
    // Browsable now: every facet, count and row. The keyword index follows.
    const browsable: Directory = {
      ...index,
      search: NO_SEARCH,
      searchReady: false,
      vocab,
      ctx,
      byId: new Map(index.records.map((r) => [r.id, r])),
      brandByKey: new Map(index.brands.map((b, i) => [b.key, { ...b, index: i }])),
    };
    advance(version, { phase: "ready", dir: browsable });
    const builder = searchIndexBuilder();
    for (let i = 0; i < records.length; i += SEARCH_SLICE) {
      builder.add(records.slice(i, i + SEARCH_SLICE));
      await idle();
    }
    for (let i = 0; i < records.length; i += SEARCH_SLICE * 4) {
      builder.normalize(i, i + SEARCH_SLICE * 4);
      await idle();
    }
    advance(version, { dir: { ...browsable, search: builder.result(), searchReady: true } });
  } catch (e) {
    advance(version, { phase: "failed", error: e instanceof Error ? e.message : "The index could not be loaded." });
  }
}

/** Start over after a failure. */
export function reloadDirectory(version: string) {
  if (stateOf(version).phase === "failed") void load(version);
}

/**
 * The directory for one version: null until it is in the browser, then the
 * same object for as long as the tab lives.
 */
export function useDirectoryIndex(version: string): DirectoryLoad {
  const subscribe = useCallback(
    (onChange: () => void) => {
      listeners.add(onChange);
      void load(version);
      return () => {
        listeners.delete(onChange);
      };
    },
    [version],
  );
  return useSyncExternalStore(
    subscribe,
    () => stateOf(version),
    () => stateOf(version),
  );
}
