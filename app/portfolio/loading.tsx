import { CardGridSkeleton, HeaderSkeleton, ToolbarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <HeaderSkeleton actions={1} />
      <ToolbarSkeleton facets={2} />
      <CardGridSkeleton count={6} height="h-36" />
    </div>
  );
}
