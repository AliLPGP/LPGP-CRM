import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton, StatRowSkeleton, ToolbarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[110rem] space-y-6 px-4 py-8 md:px-6">
      <HeaderSkeleton />
      <StatRowSkeleton count={5} />
      <div className="space-y-3">
        <ToolbarSkeleton facets={2} action />
        <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="min-h-[60vh] rounded-xl border bg-muted/30">
              <div className="flex items-center gap-2 border-b px-3 py-3">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="space-y-2 p-2">
                {Array.from({ length: 2 + (i % 3) }).map((_, j) => (
                  <Skeleton key={j} className="h-24 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
