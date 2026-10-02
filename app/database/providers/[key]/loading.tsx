import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton stats={5} facets={0} search={false} rows={12} columns={5} aside />;
}
