import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton tabs={5} stats={5} facets={3} rows={14} columns={8} />;
}
