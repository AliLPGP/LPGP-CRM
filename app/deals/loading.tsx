import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton, StatRowSkeleton, ToolbarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[95rem] space-y-6 px-4 py-8 md:px-6">
      <HeaderSkeleton actions={1} />
      <StatRowSkeleton count={4} />
      <div className="space-y-3">
        <ToolbarSkeleton facets={3} />
        <div className="rounded-2xl border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 border-b px-4 py-3.5 last:border-b-0">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-12 rounded-md" />
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-6 w-40 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
