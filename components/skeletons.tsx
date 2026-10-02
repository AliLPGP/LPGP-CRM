import { Skeleton } from "@/components/ui/skeleton";

/**
 * The pieces a CRM route's loading.tsx is built from, each the size and
 * shape of the real thing it stands in for, so the page paints its layout
 * at once and nothing moves when the data arrives.
 */

export function HeaderSkeleton({ actions = 0, back = false }: { actions?: number; back?: boolean }) {
  return (
    <div className="space-y-6">
      {back ? <Skeleton className="h-4 w-20" /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        {actions ? (
          <div className="flex gap-2">
            {Array.from({ length: actions }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-md" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card px-5 py-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2.5 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ToolbarSkeleton({ facets = 3, action = false }: { facets?: number; action?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Skeleton className="h-8 w-full rounded-[4px] sm:w-64" />
      {Array.from({ length: facets }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-20 rounded-[4px]" />
      ))}
      <Skeleton className="h-8 w-28 rounded-[4px]" />
      <Skeleton className="h-3 w-16" />
      {action ? <Skeleton className="ml-auto h-9 w-28 rounded-md" /> : null}
    </div>
  );
}

export function TableSkeleton({ rows = 10, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex gap-6 border-b px-5 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b px-5 py-3 last:border-b-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="hidden h-4 w-16 md:block" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6, height = "h-44" }: { count?: number; height?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${height} rounded-2xl`} />
      ))}
    </div>
  );
}

export function PanelSkeleton({ height = "h-[280px]" }: { height?: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-5 ${height}`}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-48" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-[6px] w-full rounded-[2px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
