import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton stats={4} facets={0} search={false} rows={8} columns={5} />;
}
