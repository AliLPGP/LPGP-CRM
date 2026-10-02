import { HeaderSkeleton, StatRowSkeleton, TableSkeleton, ToolbarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <HeaderSkeleton />
      <StatRowSkeleton count={5} />
      <div className="space-y-3">
        <ToolbarSkeleton facets={3} action />
        <TableSkeleton rows={12} columns={7} />
      </div>
    </div>
  );
}
