// How Discover orders its results, shared by the browser (use-results.ts) and
// the first-page route (page-server.ts) so a page served before the index
// lands is the same page the full index then shows.

import type { SortKey } from "./filters";
import type { DirectoryRecord } from "./records";

export type Ranked = { record: DirectoryRecord; score: number | null };

/** How documented a firm is: a full profile is worth more on a first look than one filing. */
export function completeness(r: DirectoryRecord): number {
  return (
    (r.description ? 3 : 0) +
    (r.contacts ? 2 : 0) +
    (r.domain ? 1 : 0) +
    (r.subType ? 1 : 0) +
    (r.aum != null ? 1 : 0) +
    (r.adv ? 1 : 0) +
    (r.providers.length ? 1 : 0)
  );
}

const byName = (a: Ranked, b: Ranked) => a.record.name.localeCompare(b.record.name);
const desc = (f: (r: DirectoryRecord) => number | null) => (a: Ranked, b: Ranked) =>
  (f(b.record) ?? -Infinity) - (f(a.record) ?? -Infinity) || byName(a, b);

export function rowOrder(sort: SortKey): (a: Ranked, b: Ranked) => number {
  const order: Record<SortKey, (a: Ranked, b: Ranked) => number> = {
    relevance: (a, b) => (b.score ?? 0) - (a.score ?? 0) || desc((r) => r.aum)(a, b),
    similarity: (a, b) => (b.score ?? 0) - (a.score ?? 0) || desc((r) => r.aum)(a, b),
    complete: desc((r) => completeness(r) * 1e15 + (r.aum ?? 0)),
    aum: desc((r) => r.aum),
    employees: desc((r) => r.employees),
    founded: desc((r) => r.founded),
    contacts: desc((r) => r.contacts),
    // Epoch days; a record with no date sorts last.
    newest: desc((r) => r.created),
    updated: desc((r) => r.updated),
    name: byName,
  };
  return order[sort] ?? order.aum;
}
