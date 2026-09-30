import "server-only";
import { getReadClient } from "./server";

/**
 * A cheap fingerprint of how many rows some tables hold, for cache keys.
 *
 * The heavy reads (the directory index, the fund universe, the deal ledger)
 * are cached for an hour and refreshed by tag when the app itself writes. The
 * database also grows on its own now — the EDGAR ingest adds funds, deals and
 * filings a batch a minute without any app code running — so a key that
 * carries the row counts lets a cached read go stale the moment the tables
 * change, at the price of one HEAD request per table per render.
 */
export async function tableVersion(...tables: string[]): Promise<string> {
  const supabase = getReadClient();
  if (!supabase) return "none";
  const counts = await Promise.all(
    tables.map(async (t) => {
      const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
      return error ? "x" : String(count ?? 0);
    }),
  );
  return counts.join(".");
}
