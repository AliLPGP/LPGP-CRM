import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "../supabase/paged";
import { normName } from "./normalize";

/**
 * Directory firms by loose name, for tying an investor or a deal party to
 * its profile. Exact name first; a single firm whose name starts with the
 * party's name ("Ares" → "Ares Management") second; anything ambiguous stays
 * unlinked.
 */
export async function firmMatcher(supabase: SupabaseClient): Promise<(name: string | null | undefined) => string | null> {
  const firms =
    (await fetchAll<{ id: string; name: string; category: string }>((from, to, first) =>
      supabase
        .from("companies")
        .select("id, name, category", first ? { count: "exact" } : undefined)
        .order("id")
        .range(from, to),
    )) ?? [];
  const exact = new Map<string, string>();
  const byPrefix = new Map<string, string[]>();
  for (const f of firms) {
    const n = normName(f.name);
    if (!n) continue;
    if (!exact.has(n) || f.category === "GP") exact.set(n, f.id);
    const first = n.split(" ")[0];
    if (first.length >= 4) byPrefix.set(first, [...(byPrefix.get(first) ?? []), `${n}|${f.id}`]);
  }
  return (name) => {
    const n = normName(name);
    if (!n) return null;
    const hit = exact.get(n);
    if (hit) return hit;
    const candidates = (byPrefix.get(n.split(" ")[0]) ?? []).filter((c) => {
      const [cn] = c.split("|");
      return cn.startsWith(`${n} `) || n.startsWith(`${cn} `);
    });
    if (candidates.length === 1) return candidates[0].split("|")[1];
    return null;
  };
}
