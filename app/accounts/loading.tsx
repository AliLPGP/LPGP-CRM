import { CardGridSkeleton, HeaderSkeleton, StatRowSkeleton, ToolbarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <HeaderSkeleton actions={2} />
      <StatRowSkeleton count={4} />
      <div className="space-y-3">
        <ToolbarSkeleton facets={3} />
        <CardGridSkeleton count={9} />
      </div>
    </div>
  );
}
