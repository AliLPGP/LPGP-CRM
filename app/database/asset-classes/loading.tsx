import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton stats={6} facets={0} search={false} rows={9} columns={7} />;
}
