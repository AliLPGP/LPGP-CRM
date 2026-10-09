"use client";

import { useEffect, useMemo, useState } from "react";
import type { PagePayload } from "@/lib/directory/page-server";
import type { DirectoryBrand } from "@/lib/directory/records";
import { EMPTY_DIRECTORY, type Directory } from "./use-directory";
import type { ResultRow } from "./use-results";

/** The first page of a results view, drawn before the whole index is in the browser. */
export type Preview = {
  /** Every firm that matches, counted by the server. */
  total: number;
  /** The first rows, in the order the full index will show them. */
  rows: ResultRow[];
  /** Just enough directory for those rows to draw (their provider brands, logos). */
  dir: Directory;
};

function build(p: PagePayload): Preview {
  const brands: DirectoryBrand[] = [];
  for (const [i, b] of Object.entries(p.brands)) brands[Number(i)] = b;
  const byId = new Map([...p.rows, ...p.extras].map((r) => [r.id, r]));
  return {
    total: p.total,
    rows: p.rows.map((record) => ({ record, score: null, reasons: [] })),
    dir: { ...EMPTY_DIRECTORY, records: p.rows, brands, byId },
  };
}

/**
 * The server's first page for the filters in the URL, while the index loads.
 * Null until it lands, and for a search the server cannot answer without the
 * index (keywords, lookalikes): the page then waits for the index as before.
 * The answer carries the query it belongs to, so a new search never shows the
 * last one's rows.
 */
export function usePreview(version: string, signature: string, enabled: boolean): Preview | null {
  const key = `${version}|${signature}`;
  const [got, setGot] = useState<{ key: string; page: PagePayload | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const url = `/api/directory/page?${signature}${signature ? "&" : ""}v=${encodeURIComponent(version)}&c=5`;
    fetch(url)
      .then((r) => (r.status === 200 ? (r.json() as Promise<PagePayload>) : null))
      .then((page) => {
        if (!cancelled) setGot({ key, page });
      })
      .catch(() => {
        if (!cancelled) setGot({ key, page: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, signature, version]);

  const page = got && got.key === key ? got.page : null;
  return useMemo(() => (page ? build(page) : null), [page]);
}
