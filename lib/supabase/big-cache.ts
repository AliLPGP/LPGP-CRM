import "server-only";
import { unstable_cache } from "next/cache";

/**
 * A cache for reads too big for the data cache.
 *
 * Next's data cache refuses any entry over 2 MB: it logs a warning and
 * serves the build result uncached, so a read that produces more than that
 * -- the directory index, the fund universe, the whole commitment or deal
 * ledger -- runs from scratch on every request, paging the tables again.
 * That is a ten-second page.
 *
 * `bigCache` keeps such a read in two layers. The serialised value is cut
 * into slices well under the limit, each its own data-cache entry keyed by
 * the version the caller passes (a table fingerprint), with a one-line
 * manifest that says how many. A cache miss builds once for all the slices
 * of that version. On top sits an in-memory copy per function instance, so
 * a warm instance answers without touching the data cache at all and a
 * changed version drops it.
 */

const SLICE = 1_000_000; // bytes of JSON per data-cache entry; the limit is 2 MB

type Opts = { tags: string[]; revalidate: number };

export function bigCache<T>(name: string, build: (version: string) => Promise<T>, opts: Opts): (version: string) => Promise<T> {
  let warm: { version: string; value: T } | null = null;
  let building: { version: string; parts: Promise<string[]> } | null = null;

  // One build per version per instance, shared by every slice that misses.
  const partsFor = (version: string): Promise<string[]> => {
    if (building?.version !== version) {
      const parts = build(version).then((value) => {
        warm = { version, value };
        const json = JSON.stringify(value);
        const out: string[] = [];
        for (let i = 0; i < json.length; i += SLICE) out.push(json.slice(i, i + SLICE));
        return out.length ? out : [""];
      });
      parts.catch(() => {
        if (building?.parts === parts) building = null;
      });
      building = { version, parts };
    }
    return building.parts;
  };

  const cachedCount = unstable_cache(async (version: string) => (await partsFor(version)).length, [name, "count"], opts);
  const cachedPart = unstable_cache(async (version: string, i: number) => (await partsFor(version))[i] ?? "", [name, "part"], opts);

  return async (version: string) => {
    if (warm?.version === version) return warm.value;
    const n = await cachedCount(version);
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => cachedPart(version, i)));
    // A build in this instance already left the value in memory; otherwise
    // the slices came from the data cache and are parsed once.
    if (warm?.version === version) return warm.value;
    const value = JSON.parse(parts.join("")) as T;
    warm = { version, value };
    return value;
  };
}
