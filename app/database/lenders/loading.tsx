import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton stats={5} facets={0} rows={12} columns={6} aside />;
}
