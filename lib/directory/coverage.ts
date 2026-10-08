// Which firms have been researched enough to stand in the LP, GP and SP
// books, and which wait in "Unresearched data" until they have. A firm is
// researched when it carries the facts the other side of the market reads
// it by, so an LP's book and a GP's book say the same things about each
// other: an LP with the funds it committed to or the allocations and plans
// it states (a size, a description and people say nothing about where it
// invests), a GP with a size and the funds or portfolio it runs, a provider with the managers that file it.
// Unclassified firms are never in a book, so they always wait.
// Pure: safe on the client.

import type { DirectoryRecord } from "./records";

export type Coverage = "researched" | "thin" | "all";

export const COVERAGE_LABEL: Record<Coverage, string> = {
  researched: "Researched",
  thin: "Unresearched data",
  all: "Everything",
};

/** What each book needs, in a sentence, for the tab's lead. */
export const COVERAGE_RULE =
  "LPs need commitments, stated allocations or plans on file; GPs a stated size with funds, portfolio or providers on file; providers the managers that file them.";

export function isResearched(r: DirectoryRecord): boolean {
  switch (r.category) {
    case "LP":
      return r.knownFunds > 0 || r.alloc.length > 0 || r.plans.length > 0;
    case "GP":
      return r.aum != null && (r.funds > 0 || r.portcos > 0 || r.providers.length > 0);
    case "SP":
      return r.clientCount > 0;
    default:
      return false;
  }
}

export function coverageOf(v: string | null): Coverage {
  return v === "thin" || v === "all" ? v : "researched";
}
