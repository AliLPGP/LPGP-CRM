import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-6 lg:px-8">
      <HeaderSkeleton />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-44 rounded-xl" />
    </div>
  );
}
