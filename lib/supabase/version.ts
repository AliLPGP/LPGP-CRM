import "server-only";
import { getReadClient } from "./server";

/**
 * A cheap fingerprint of some tables, for cache keys.
 *
 * The heavy reads (the directory index, the fund universe, the deal ledger)
 * are cached for an hour and refreshed by tag when the app itself writes. The
 * database also grows on its own now — the EDGAR ingest adds funds, deals and
 * filings a batch a minute without any app code running — so a key that
 * carries a fingerprint lets a cached read go stale the moment the tables
 * change. The fingerprint is the planner's write counters (one RPC, no
 * scan); before migration 0020 it falls back to exact counts, which cost a
 * scan per table and are avoided for anything large.
 */
export async function tableVersion(...tables: string[]): Promise<string> {
  const supabase = getReadClient();
  if (!supabase) return "none";
  const { data, error } = await supabase.rpc("table_versions", { p_tables: tables });
  if (!error && typeof data === "string") return data;
  const counts = await Promise.all(
    tables.map(async (t) => {
      const { count, error: e } = await supabase.from(t).select("*", { count: "estimated", head: true });
      return e ? "x" : String(count ?? 0);
    }),
  );
  return counts.join(".");
}
