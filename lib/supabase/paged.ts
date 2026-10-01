// Hosted Supabase caps every response (1,000 rows by default, lower if the
// project says so). A directory of a couple of thousand firms needs several
// pages, and a list that silently stops at the cap looks complete when it isn't.

// Loose on purpose: select lists built at runtime defeat supabase-js's column
// parser, and the caller names the row type anyway.
type PageResult = { data: unknown; error: { message: string } | null; count?: number | null };

/**
 * Every row a query matches. `page(from, to)` must build the same query with a
 * stable order each call and apply `.range(from, to)`; the first call asks for
 * an exact count so a smaller server-side cap can't end the loop early.
 * Returns null on error so callers can fall back to their empty states.
 */
export async function fetchAll<T>(
  page: (from: number, to: number, first: boolean) => PromiseLike<PageResult>,
  size = 1000,
): Promise<T[] | null> {
  // The first page also asks for the exact count. When it says more pages
  // exist, the rest are fetched together instead of one after another: sixty
  // sequential round trips were most of a cold page's ten seconds.
  const first = await page(0, size - 1, true);
  if (first.error) return null;
  const head = (Array.isArray(first.data) ? first.data : []) as T[];
  const total = typeof first.count === "number" ? first.count : null;
  if (head.length === 0 || (total != null ? head.length >= total : head.length < size)) return head;
  // A server cap below `size` shows as a short first page with a larger count.
  const step = head.length;
  if (total != null) {
    const starts: number[] = [];
    for (let from = step; from < total; from += step) starts.push(from);
    const out: T[][] = new Array(starts.length);
    for (let i = 0; i < starts.length; i += 8) {
      const batch = await Promise.all(starts.slice(i, i + 8).map((from) => page(from, from + step - 1, false)));
      for (let j = 0; j < batch.length; j++) {
        if (batch[j].error) return null;
        out[i + j] = (Array.isArray(batch[j].data) ? batch[j].data : []) as T[];
      }
    }
    return head.concat(...out);
  }
  const all = [...head];
  for (let from = all.length; ; ) {
    const { data, error } = await page(from, from + size - 1, false);
    if (error) return null;
    const rows = (Array.isArray(data) ? data : []) as T[];
    all.push(...rows);
    from += rows.length;
    if (rows.length < size) break;
  }
  return all;
}

/** Split `items` into runs of `size` (for `.in()` filters and batched writes). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
