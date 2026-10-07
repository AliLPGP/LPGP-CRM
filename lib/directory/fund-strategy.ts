import "server-only";
import { getReadClient } from "../supabase/server";
import { chunk } from "../supabase/paged";

// The strategy a fund's researched profile states (fund_details.strategy_code,
// written by the fund research job with the page that says it). Readers place
// a fund by this first, then by its own name, then by its manager's words
// (placeStrategy in strategies.ts).

/** fund_id → researched strategy key, for the funds that have one. */
export async function researchedStrategies(fundIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(fundIds.filter((v): v is string => Boolean(v)))];
  const supabase = getReadClient();
  if (!supabase || !ids.length) return out;
  for (const part of chunk(ids, 150)) {
    const { data } = await supabase.from("fund_details").select("fund_id, strategy_code").in("fund_id", part).not("strategy_code", "is", null);
    for (const r of (data ?? []) as { fund_id: string; strategy_code: string | null }[]) if (r.strategy_code) out.set(r.fund_id, r.strategy_code);
  }
  return out;
}
