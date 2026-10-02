import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton tabs={8} stats={7} facets={0} search={false} rows={10} columns={6} aside />;
}
