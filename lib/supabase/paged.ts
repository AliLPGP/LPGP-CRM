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
  const out: T[] = [];
  let total: number | null = null;
  for (let from = 0; ; ) {
    const { data, error, count } = await page(from, from + size - 1, from === 0);
    if (error) return null;
    if (from === 0 && typeof count === "number") total = count;
    const rows = (Array.isArray(data) ? data : []) as T[];
    out.push(...rows);
    from += rows.length;
    if (rows.length === 0) break;
    if (total != null ? out.length >= total : rows.length < size) break;
  }
  return out;
}

/** Split `items` into runs of `size` (for `.in()` filters and batched writes). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
