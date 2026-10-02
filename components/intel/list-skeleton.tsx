import { Skeleton } from "@/components/ui/skeleton";

// What a list desk looks like before its data arrives: the same frame in
// the same order — crumb, title, tabs, the stat strip, the toolbar, the
// ledger's rows — so a click paints at once and nothing moves when the
// figures drop in.

function Bone({ className }: { className: string }) {
  return <Skeleton className={`rounded-[3px] bg-muted/70 ${className}`} />;
}

function Rows({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Bone className="h-3 w-[22%] min-w-[120px]" />
          {Array.from({ length: Math.max(0, columns - 1) }, (_, j) => (
            <Bone key={j} className={j % 3 === 2 ? "ml-auto h-3 w-14" : "h-3 w-20"} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Panel({ rows, columns, title = true }: { rows: number; columns: number; title?: boolean }) {
  return (
    <div className="rounded-[4px] border bg-card">
      {title ? (
        <div className="border-b px-3 py-2.5">
          <Bone className="h-2.5 w-28" />
        </div>
      ) : null}
      <div className="flex gap-3 border-b bg-muted/40 px-3 py-2">
        {Array.from({ length: columns }, (_, i) => (
          <Bone key={i} className={i === 0 ? "h-2.5 w-[22%] min-w-[120px]" : i % 3 === 2 ? "ml-auto h-2.5 w-12" : "h-2.5 w-16"} />
        ))}
      </div>
      <Rows rows={rows} columns={columns} />
    </div>
  );
}

export function ListSkeleton({
  stats = 5,
  facets = 4,
  rows = 12,
  columns = 6,
  tabs = 0,
  search = true,
  aside = false,
  wide = true,
}: {
  /** Stats in the strip; 0 for none. */
  stats?: number;
  /** Facet dropdowns in the toolbar; 0 for no toolbar. */
  facets?: number;
  rows?: number;
  columns?: number;
  /** Sub-tabs under the title; 0 for none. */
  tabs?: number;
  search?: boolean;
  /** A narrower second column of panels beside the ledger. */
  aside?: boolean;
  wide?: boolean;
}) {
  const ledger = <Panel rows={rows} columns={columns} />;
  return (
    <div className={`desk mx-auto space-y-4 px-4 py-5 md:px-6 ${wide ? "max-w-[1480px]" : "max-w-6xl"}`} aria-busy="true" aria-label="Loading">
      <Bone className="h-3 w-40" />
      <div className="space-y-2">
        <Bone className="h-2.5 w-20" />
        <Bone className="h-7 w-64" />
        <Bone className="h-3 w-[36rem] max-w-full" />
      </div>
      {tabs > 0 ? (
        <div className="flex gap-4 border-b pb-2.5">
          {Array.from({ length: tabs }, (_, i) => (
            <Bone key={i} className="h-3.5 w-20" />
          ))}
        </div>
      ) : null}
      {stats > 0 ? (
        <div className="grid rounded-[4px] border bg-card" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="space-y-2 border-l px-3 py-2.5 first:border-l-0">
              <Bone className="h-2.5 w-20" />
              <Bone className="h-5 w-16" />
              <Bone className="h-2.5 w-24" />
            </div>
          ))}
        </div>
      ) : null}
      {facets > 0 || search ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {search ? <Bone className="h-8 w-56" /> : null}
          {Array.from({ length: facets }, (_, i) => (
            <Bone key={i} className="h-8 w-24" />
          ))}
          <Bone className="ml-1 h-3 w-20" />
        </div>
      ) : null}
      {aside ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {ledger}
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <Panel key={i} rows={5} columns={3} />
            ))}
          </div>
        </div>
      ) : (
        ledger
      )}
    </div>
  );
}
