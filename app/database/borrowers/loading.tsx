import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton stats={6} facets={1} rows={14} columns={9} />;
}
