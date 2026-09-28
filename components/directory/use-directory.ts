"use client";

import { useMemo } from "react";
import { filterContext } from "@/lib/directory/filters";
import { unpackIndex, type PackedIndex } from "@/lib/directory/records";
import { buildSearchIndex } from "@/lib/directory/search";
import { buildVocab } from "@/lib/directory/thesis";

/** The unpacked index plus everything derived from it, built once per payload. */
export function useDirectory(packed: PackedIndex) {
  const index = useMemo(() => unpackIndex(packed), [packed]);
  const search = useMemo(() => buildSearchIndex(index.records), [index]);
  const vocab = useMemo(() => buildVocab(index.records, index.brands), [index]);
  const ctx = useMemo(() => filterContext(index.records, index.brands), [index]);
  const byId = useMemo(() => new Map(index.records.map((r) => [r.id, r])), [index]);
  const brandByKey = useMemo(() => new Map(index.brands.map((b, i) => [b.key, { ...b, index: i }])), [index]);
  return { ...index, search, vocab, ctx, byId, brandByKey };
}

export type Directory = ReturnType<typeof useDirectory>;
