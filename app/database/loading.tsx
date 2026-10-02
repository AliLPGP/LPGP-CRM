import { LedgerSkeleton, StripSkeleton, ToolbarSkeleton } from "@/components/directory/discover-skeleton";

// Discover before the server answers: the same frame as the results view
// (stat strip, then the toolbar of search and facet buttons, then the ledger)
// so the figures and rows drop in where they belong. Most arrivals come from
// the header's book links and land on results, not the home stand. The page
// draws the same bones again while the index itself is on its way.

export default function Loading() {
  return (
    <div className="desk mx-auto max-w-[1480px] space-y-4 px-4 py-5 md:px-6" aria-busy="true" aria-label="Loading">
      <StripSkeleton />
      <ToolbarSkeleton />
      <LedgerSkeleton />
    </div>
  );
}
