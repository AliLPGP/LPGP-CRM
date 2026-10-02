import { ListSkeleton } from "@/components/intel/list-skeleton";

export default function Loading() {
  return <ListSkeleton tabs={6} stats={6} facets={3} search={false} rows={14} columns={9} />;
}
