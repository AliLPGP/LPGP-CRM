import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 md:px-6">
      <HeaderSkeleton />
      <Skeleton className="h-24 rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}
