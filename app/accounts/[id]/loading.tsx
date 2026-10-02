import { Skeleton } from "@/components/ui/skeleton";

/** An account page: back link, header card, the tab bar, then the first tab's floor. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
      <Skeleton className="h-4 w-20" />
      <div className="rounded-2xl border bg-card p-5 md:p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 rounded-xl" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-64" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-5 w-10 rounded-md" />
            </div>
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-2xl rounded-lg" />
      <div className="min-h-[320px] space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
