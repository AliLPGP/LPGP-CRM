import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton, PanelSkeleton, StatRowSkeleton, ToolbarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[95rem] space-y-6 px-4 py-8 md:px-6">
      <HeaderSkeleton />
      <StatRowSkeleton count={5} />
      <PanelSkeleton height="h-[300px]" />
      <div className="space-y-3">
        <ToolbarSkeleton facets={3} />
        <div className="rounded-2xl border bg-card">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <div className="col-span-2 space-y-1.5 md:col-span-1">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-5 w-12 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
