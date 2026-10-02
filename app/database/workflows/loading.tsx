import { Skeleton } from "@/components/ui/skeleton";

// The workflows hub before it paints: the title, then the ten cards.
export default function Loading() {
  return (
    <div className="desk mx-auto max-w-[1480px] space-y-4 px-4 py-5 md:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-40 rounded-[3px] bg-muted/70" />
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-20 rounded-[3px] bg-muted/70" />
        <Skeleton className="h-7 w-48 rounded-[3px] bg-muted/70" />
        <Skeleton className="h-3 w-[36rem] max-w-full rounded-[3px] bg-muted/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-[4px] border bg-card p-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-[4px] bg-muted/70" />
              <Skeleton className="h-4 w-32 rounded-[3px] bg-muted/70" />
            </div>
            <Skeleton className="h-3 w-full rounded-[3px] bg-muted/70" />
            <Skeleton className="h-3 w-4/5 rounded-[3px] bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
