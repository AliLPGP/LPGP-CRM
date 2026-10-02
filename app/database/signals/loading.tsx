import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton tabs={9} stats={6} facets={1} search={false} rows={10} columns={4} aside />;
}
