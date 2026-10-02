import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton stats={0} facets={2} search={false} rows={12} columns={5} aside />;
}
