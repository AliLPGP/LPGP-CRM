import { Skeleton } from "@/components/ui/skeleton";

/** The call workspace: its sticky queue bar, then the lead beside the call pane. */
export default function Loading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="border-b bg-card/85">
        <div className="flex items-center gap-3 px-4 py-3 md:px-6">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="mr-auto space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-9 w-[190px] rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="h-0.5 w-full bg-muted" />
      </div>
      <div className="grid flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[1.15fr_1fr] xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
