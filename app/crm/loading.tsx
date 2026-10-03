import { Skeleton } from "@/components/ui/skeleton";

// Instant feedback for any route without its own fallback (the desk routes
// each carry one): the same rhythm as a page, title, a strip of figures, a
// toolbar and rows — so a click paints at once and the real thing drops in
// where the bones were.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1480px] space-y-4 px-4 py-5 md:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-3 w-[36rem] max-w-full" />
      </div>
      <div className="grid rounded-[var(--radius)] border bg-card" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2 border-l px-3 py-2 first:border-l-0">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="rounded-[var(--radius)] border bg-card">
        <div className="border-b px-3 py-2">
          <Skeleton className="h-2.5 w-28" />
        </div>
        <div className="space-y-2.5 p-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
