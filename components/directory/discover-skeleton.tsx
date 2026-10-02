import { Skeleton } from "@/components/ui/skeleton";

// Discover's bones: the same frame as the results view (stat strip, toolbar
// of search and facet buttons, ledger), drawn by the route's loading state
// before the server answers and again by the page itself while the index is
// on its way to the browser, so figures and rows drop in where they belong.

export function Bone({ className, style }: { className: string; style?: React.CSSProperties }) {
  return <Skeleton className={`rounded-[3px] bg-muted/70 ${className}`} style={style} />;
}

/** The stat strip's six figures. */
export function StripSkeleton() {
  return (
    <div className="stat-strip grid rounded-[4px] border bg-card" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2 border-l px-3 py-2.5 first:border-l-0">
          <Bone className="h-2.5 w-20" />
          <Bone className="h-5 w-16" />
          <Bone className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** The facet buttons' widths, so the toolbar keeps its length while they load. */
const FACET_WIDTHS = [52, 84, 72, 70, 54, 76, 50, 96];

/** The eight facet buttons, as bones. */
export function FacetBones() {
  return (
    <>
      {FACET_WIDTHS.map((w, i) => (
        <Bone key={i} className="h-8" style={{ width: w }} />
      ))}
    </>
  );
}

/** The whole toolbar: search, facets, sort, and the right-hand cluster. */
export function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      <Bone className="h-8 min-w-[220px] flex-1" />
      <FacetBones />
      <Bone className="h-8 w-32" />
      <div className="ml-auto flex items-center gap-1.5">
        <Bone className="h-8 w-16" />
        <Bone className="h-8 w-20" />
        <Bone className="h-8 w-20" />
      </div>
    </div>
  );
}

/** The ledger: a header row and `rows` covered rows. */
export function LedgerSkeleton({ rows = 14, label }: { rows?: number; label?: string }) {
  return (
    <div className="rounded-[4px] border bg-card" aria-busy="true" aria-label={label ?? "Loading"}>
      <div className="flex items-center gap-3 border-b px-3 py-2.5">
        <Bone className="h-3.5 w-3.5" />
        <Bone className="h-2.5 w-24" />
        <Bone className="h-2.5 w-12" />
        <Bone className="h-2.5 w-20" />
        <Bone className="ml-auto h-2.5 w-10" />
        <Bone className="h-2.5 w-10" />
        <Bone className="h-2.5 w-10" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
          <Bone className="h-3.5 w-3.5" />
          <Bone className="h-[26px] w-[26px]" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3 w-48 max-w-full" />
            <Bone className="h-2.5 w-72 max-w-full" />
          </div>
          <Bone className="hidden h-3 w-24 md:block" />
          <Bone className="h-3 w-14" />
          <Bone className="hidden h-3 w-10 md:block" />
          <Bone className="hidden h-3 w-10 md:block" />
        </div>
      ))}
      {label ? <p className="px-3 py-2 text-[11.5px] text-muted-foreground">{label}</p> : null}
    </div>
  );
}

/** The card grid, for the cards view. */
export function CardsSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-[4px] border bg-card p-3">
          <div className="flex items-center gap-2.5">
            <Bone className="h-8 w-8" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3 w-40 max-w-full" />
              <Bone className="h-2.5 w-24" />
            </div>
          </div>
          <Bone className="h-2.5 w-full" />
          <Bone className="h-2.5 w-4/5" />
          <div className="grid grid-cols-4 gap-2 border-t pt-2.5">
            {Array.from({ length: 4 }, (_, j) => (
              <Bone key={j} className="h-6 w-12" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
