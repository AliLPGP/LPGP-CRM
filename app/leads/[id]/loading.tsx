import { Skeleton } from "@/components/ui/skeleton";

/** A lead page: back link, header card, then the editor beside the notes. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <Skeleton className="h-4 w-16" />
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-7 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="ml-auto h-7 w-24" />
            <Skeleton className="ml-auto h-4 w-32" />
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[420px] rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
