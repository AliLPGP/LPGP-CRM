import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton tabs={3} stats={6} facets={5} search={false} rows={14} columns={9} />;
}
